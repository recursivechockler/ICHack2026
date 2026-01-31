const { app, BrowserWindow, BrowserView, ipcMain, session } = require("electron");
const path = require("path");

let mainWindow = null;
let view = null;

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
  if (!view) return;
  try {
    const normalized = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    view.webContents.loadURL(normalized);
  } catch (e) {
    console.error("Bad URL:", e);
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