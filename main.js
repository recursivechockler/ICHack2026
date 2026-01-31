const { app, BrowserWindow, BrowserView, ipcMain, session } = require("electron");
const path = require("path");
const fs = require("fs");

let mainWindow = null;
let view = null;
let boringModeEnabled = true; // Boring mode on by default

// Site detection - maps hostnames to module names
function getSiteModule(hostname) {
  // Search engines - highest priority
  if (hostname.includes("duckduckgo.com")) return "search";
  if (hostname.includes("google.com")) return "search";
  if (hostname.includes("bing.com")) return "search";

  // Video platforms
  if (hostname.includes("youtube.com")) return "youtube";

  // News sites
  if (hostname.includes("bbc.com") || hostname.includes("bbc.co.uk")) return "news";
  if (hostname.includes("theguardian.com")) return "news";

  // Shopping
  if (hostname.includes("asos.com")) return "shopping";
  if (hostname.includes("zara.com")) return "shopping";

  return null;
}

function openReaderWindow(article, sourceUrl) {
  const readerWin = new BrowserWindow({
    width: 900,
    height: 800,
    title: "Reader Mode",
    webPreferences: {
      preload: path.join(__dirname, "reader_preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  readerWin.loadFile(path.join(__dirname, "reader.html"));

  readerWin.webContents.once("did-finish-load", () => {
    readerWin.webContents.send("reader:article", {
      article,
      sourceUrl,
      extractedAt: new Date().toISOString()
    });
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 900,
    title: "Anti-Dopamine Browser (Articles MVP)",
    webPreferences: {
      preload: path.join(__dirname, "ui_preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, "index.html"));

  // Send initial boring mode state when UI loads
  mainWindow.webContents.once("did-finish-load", () => {
    mainWindow.webContents.send("ui:boring-state", boringModeEnabled);
  });

  // Persistent storage (cookies/logins persist inside THIS app profile)
  const persistSession = session.fromPartition("persist:main");

  view = new BrowserView({
    webPreferences: {
      preload: path.join(__dirname, "view_preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      session: persistSession
    }
  });

  mainWindow.setBrowserView(view);

  const resize = () => {
    const [w, h] = mainWindow.getContentSize();
    // Top bar in index.html is 64px tall
    view.setBounds({ x: 0, y: 64, width: w, height: h - 64 });
  };

  resize();
  mainWindow.on("resize", resize);

  // Default page
  view.webContents.loadURL("https://www.bbc.com/news");

  // Keep URL bar synced on navigation
  const sendUrlToUI = () => {
    const url = view.webContents.getURL();
    mainWindow.webContents.send("ui:url", url);
  };

  view.webContents.on("did-navigate", sendUrlToUI);
  view.webContents.on("did-navigate-in-page", sendUrlToUI);
  view.webContents.on("did-finish-load", sendUrlToUI);

  // Handle new window requests - keep navigation in the same view
  view.webContents.setWindowOpenHandler(({ url }) => {
    view.webContents.loadURL(url);
    return { action: 'deny' };
  });

  // Handle navigation requests (for better link handling)
  view.webContents.on('will-navigate', (_event, url) => {
    // Allow all navigation by default
    console.log('Navigating to:', url);
  });

  // Boring mode injection system
  const injectBoringMode = () => {
    if (!boringModeEnabled || !view) return;

    const url = view.webContents.getURL();
    const hostname = new URL(url).hostname;

    // Inject global boring mode CSS
    const globalCSS = fs.readFileSync(path.join(__dirname, "boring-modules", "global.css"), "utf8");
    view.webContents.insertCSS(globalCSS);

    // Determine which site module to use
    const siteModule = getSiteModule(hostname);
    if (siteModule) {
      // Inject site-specific CSS
      const cssPath = path.join(__dirname, "boring-modules", siteModule, "style.css");
      if (fs.existsSync(cssPath)) {
        const siteCSS = fs.readFileSync(cssPath, "utf8");
        view.webContents.insertCSS(siteCSS);
      }

      // Inject site-specific JS
      const jsPath = path.join(__dirname, "boring-modules", siteModule, "inject.js");
      if (fs.existsSync(jsPath)) {
        const siteJS = fs.readFileSync(jsPath, "utf8");
        view.webContents.executeJavaScript(siteJS);
      }
    }
  };

  // Inject on page load and SPA navigation
  view.webContents.on("did-finish-load", injectBoringMode);
  view.webContents.on("did-navigate-in-page", injectBoringMode);
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// ---- IPC from UI (address bar/buttons) ----

// Helper function to determine if input is a URL or search query
function isUrl(input) {
  const trimmed = input.trim();

  // Already has protocol
  if (/^https?:\/\//i.test(trimmed)) return true;

  // Localhost or IP address
  if (/^localhost(:\d+)?$/i.test(trimmed)) return true;
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}(:\d+)?$/.test(trimmed)) return true;

  // Has domain extension (e.g., .com, .org, .co.uk)
  // Also checks for paths/params which suggest it's a URL
  if (/\.[a-z]{2,}(\/|$|:|\?|#)/i.test(trimmed)) return true;

  // Simple domain without path (e.g., "example.com" or "bbc.co.uk")
  if (/^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(trimmed)) return true;

  return false;
}

ipcMain.on("nav:go", (_evt, input) => {
  if (!view) return;
  try {
    let targetUrl;

    if (isUrl(input)) {
      // It's a URL - normalize it
      targetUrl = /^https?:\/\//i.test(input) ? input : `https://${input}`;
    } else {
      // It's a search query - use DuckDuckGo (privacy-focused search engine)
      const query = encodeURIComponent(input.trim());
      targetUrl = `https://duckduckgo.com/?q=${query}`;
    }

    view.webContents.loadURL(targetUrl);
  } catch (e) {
    console.error("Navigation error:", e);
  }
});

ipcMain.on("nav:back", () => view?.webContents.goBack());
ipcMain.on("nav:forward", () => view?.webContents.goForward());
ipcMain.on("nav:reload", () => view?.webContents.reload());

ipcMain.on("reader:extract", () => {
  if (!view) return;
  view.webContents.send("extract-article");
});

// Receive extracted article from the BrowserView preload
ipcMain.on("article-extracted", (_evt, payload) => {
  const { ok, article, error, url } = payload;

  if (!ok) {
    console.error("Extraction failed:", error);
    mainWindow?.webContents.send("ui:toast", error || "Extraction failed");
    return;
  }

  openReaderWindow(article, url);
});

// Toggle boring mode
ipcMain.on("boring:toggle", () => {
  boringModeEnabled = !boringModeEnabled;
  mainWindow?.webContents.send("ui:boring-state", boringModeEnabled);

  if (boringModeEnabled) {
    // Re-inject when turning on
    view?.webContents.reload();
  } else {
    // Reload page to clear injected styles when turning off
    view?.webContents.reload();
  }
});