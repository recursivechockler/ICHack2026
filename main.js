const { app, BrowserWindow, BrowserView, ipcMain, session } = require("electron");
const path = require("path");
const fs = require("fs");

let mainWindow = null;
let view = null;
let loaderView = null;
let loaderVisible = false;
let loaderTimeoutId = null;
let boringModeEnabled = true; // Boring mode on by default

function logMain(message, extra) {
  if (extra) console.log(`[main] ${message}`, extra);
  else console.log(`[main] ${message}`);
}

// Site detection - maps hostnames to module names
function getSiteModule(hostname) {
  if (hostname.includes("youtube.com")) return "youtube";
  if (hostname.includes("bbc.com") || hostname.includes("bbc.co.uk")) return "news";
  if (hostname.includes("theguardian.com")) return "news";
  if (hostname.includes("asos.com")) return "shopping";
  if (hostname.includes("zara.com")) return "shopping";
  return null;
}

function shouldShowBoringForUrl(url) {
  if (!boringModeEnabled) return false;
  try {
    const hostname = new URL(url).hostname;
    return Boolean(getSiteModule(hostname));
  } catch {
    return false;
  }
}

function getViewBounds() {
  if (!mainWindow) return { x: 0, y: 64, width: 0, height: 0 };
  const [w, h] = mainWindow.getContentSize();
  return { x: 0, y: 64, width: w, height: Math.max(0, h - 64) };
}

function showLoader() {
  if (!mainWindow || !loaderView) return;
  if (loaderVisible) {
    loaderView.setBounds(getViewBounds());
    return;
  }
  loaderVisible = true;
  logMain("showLoader");
  if (mainWindow.getBrowserViews().includes(loaderView)) {
    mainWindow.removeBrowserView(loaderView);
  }
  mainWindow.addBrowserView(loaderView);
  loaderView.setBounds(getViewBounds());

  // Fail-safe: never let loader block forever.
  if (loaderTimeoutId) clearTimeout(loaderTimeoutId);
  loaderTimeoutId = setTimeout(() => {
    hideLoader();
  }, 3000);
}

function hideLoader() {
  if (!mainWindow || !loaderView) return;
  if (!loaderVisible) return;
  loaderVisible = false;
  logMain("hideLoader");
  mainWindow.removeBrowserView(loaderView);
  if (loaderTimeoutId) {
    clearTimeout(loaderTimeoutId);
    loaderTimeoutId = null;
  }
}

function showLoaderForUrl(url) {
  if (shouldShowBoringForUrl(url)) showLoader();
  else hideLoader();
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

  loaderView = new BrowserView({
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  loaderView.webContents.loadFile(path.join(__dirname, "loading.html"));

  mainWindow.setBrowserView(view);

  const resize = () => {
    const bounds = getViewBounds();
    view.setBounds(bounds);
    if (loaderVisible) loaderView.setBounds(bounds);
  };

  resize();
  mainWindow.on("resize", resize);

  // Default page
  const defaultUrl = "https://www.bbc.com/news";
  showLoaderForUrl(defaultUrl);
  view.webContents.loadURL(defaultUrl);

  view.webContents.on("console-message", (_evt, level, message, line, sourceId) => {
    console.log(`[view:${level}] ${message} (${sourceId}:${line})`);
  });

  // Keep URL bar synced on navigation
  const sendUrlToUI = () => {
    const url = view.webContents.getURL();
    mainWindow.webContents.send("ui:url", url);
  };

  view.webContents.on("did-navigate", sendUrlToUI);
  view.webContents.on("did-navigate-in-page", sendUrlToUI);
  view.webContents.on("did-finish-load", sendUrlToUI);

  view.webContents.on("did-start-navigation", (_evt, url, _isInPlace, isMainFrame) => {
    if (!isMainFrame) return;
    logMain("did-start-navigation", { url });
    showLoaderForUrl(url);
  });

  view.webContents.on("did-navigate-in-page", (_evt, url, isMainFrame) => {
    if (!isMainFrame) return;
    logMain("did-navigate-in-page", { url });
    showLoaderForUrl(url);
  });

  view.webContents.on("did-start-loading", () => {
    const url = view.webContents.getURL();
    logMain("did-start-loading", { url });
    if (url) showLoaderForUrl(url);
  });

  // Boring mode injection system
  const injectBoringMode = async () => {
    if (!boringModeEnabled || !view) return;

    try {
      const url = view.webContents.getURL();
      const hostname = new URL(url).hostname;

      // Inject global boring mode CSS
      const globalCSS = fs.readFileSync(path.join(__dirname, "boring-modules", "global.css"), "utf8");
      await view.webContents.insertCSS(globalCSS);

      // Determine which site module to use
      const siteModule = getSiteModule(hostname);
      if (siteModule) {
        // Inject site-specific CSS
        const cssPath = path.join(__dirname, "boring-modules", siteModule, "style.css");
        if (fs.existsSync(cssPath)) {
          const siteCSS = fs.readFileSync(cssPath, "utf8");
          await view.webContents.insertCSS(siteCSS);
        }

        // Inject site-specific JS
        const jsPath = path.join(__dirname, "boring-modules", siteModule, "inject.js");
        if (fs.existsSync(jsPath)) {
          const siteJS = fs.readFileSync(jsPath, "utf8");
          view.webContents.executeJavaScript(siteJS);
        }
      }
    } catch (err) {
      console.error("Failed to inject boring mode:", err);
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

ipcMain.on("nav:go", (_evt, url) => {
  if (!view || !url) return;
  try {
    const normalized = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    showLoaderForUrl(normalized);
    view.webContents.loadURL(normalized);
  } catch (e) {
    console.error("Bad URL:", e);
  }
});

ipcMain.on("nav:back", () => {
  const currentUrl = view?.webContents.getURL();
  if (currentUrl) showLoaderForUrl(currentUrl);
  view?.webContents.goBack();
});
ipcMain.on("nav:forward", () => {
  const currentUrl = view?.webContents.getURL();
  if (currentUrl) showLoaderForUrl(currentUrl);
  view?.webContents.goForward();
});
ipcMain.on("nav:reload", () => {
  const currentUrl = view?.webContents.getURL();
  if (currentUrl) showLoaderForUrl(currentUrl);
  view?.webContents.reload();
});

ipcMain.on("reader:extract", () => {
  if (!view) return;
  view.webContents.send("extract-article");
});

ipcMain.on("boring:pre-navigate", (_evt, url) => {
  if (!url) return;
  logMain("boring:pre-navigate", { url });
  showLoaderForUrl(url);
});

ipcMain.on("boring:overlay-ready", (_evt, url) => {
  const targetUrl = url || view?.webContents.getURL();
  logMain("boring:overlay-ready", { url, targetUrl });
  if (!targetUrl) return;
  if (!shouldShowBoringForUrl(targetUrl)) return;
  hideLoader();
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

  if (!boringModeEnabled) {
    hideLoader();
    view?.webContents.reload();
    return;
  }

  const currentUrl = view?.webContents.getURL();
  if (currentUrl) showLoaderForUrl(currentUrl);
  view?.webContents.reload();
});
