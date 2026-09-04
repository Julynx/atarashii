/**
 * @module preload
 * Exposes secure API channels between the main process and the renderer process.
 */

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  getFilePath: () => ipcRenderer.invoke("getFilePath"),
  onFileUpdated: (callback) => {
    ipcRenderer.removeAllListeners("fileUpdated");
    ipcRenderer.on("fileUpdated", (_event, filePath) => callback(filePath));
  },
  selectFile: () => ipcRenderer.invoke("selectFile"),
  closeFile: () => ipcRenderer.invoke("closeFile"),
  showContextMenu: () => ipcRenderer.send("show-context-menu"),
});
