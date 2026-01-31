const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  go: (url) => ipcRenderer.send("nav:go", url),
  back: () => ipcRenderer.send("nav:back"),
  forward: () => ipcRenderer.send("nav:forward"),
  reload: () => ipcRenderer.send("nav:reload"),
  extractReader: () => ipcRenderer.send("reader:extract"),

  onUrl: (fn) => ipcRenderer.on("ui:url", (_e, url) => fn(url)),
  onToast: (fn) => ipcRenderer.on("ui:toast", (_e, msg) => fn(msg))
});