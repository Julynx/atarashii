/**
 * @module preload
 * Context bridge exposing IPC communication channels between main and renderer processes.
 */

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("atarashiiApi", {
  minimizeWindow() {
    return ipcRenderer.invoke("window:minimize");
  },
  maximizeWindow() {
    return ipcRenderer.invoke("window:maximize");
  },
  closeWindow() {
    return ipcRenderer.invoke("window:close");
  },
  checkRequirements() {
    return ipcRenderer.invoke("requirements:check");
  },
  installRequirements() {
    return ipcRenderer.invoke("requirements:install");
  },
  getInstallConsent() {
    return ipcRenderer.invoke("install-consent:get");
  },
  grantInstallConsent() {
    return ipcRenderer.invoke("install-consent:grant");
  },
  clearInstallConsent() {
    return ipcRenderer.invoke("install-consent:clear");
  },
  checkForUpdate() {
    return ipcRenderer.invoke("update:check");
  },
  installUpdate() {
    return ipcRenderer.invoke("update:install");
  },
  getProjectDefaults() {
    return ipcRenderer.invoke("project:get-defaults");
  },
  computeNextProjectName(parentDirectory) {
    return ipcRenderer.invoke("project:compute-next-name", parentDirectory);
  },
  pickParentFolder() {
    return ipcRenderer.invoke("project:pick-parent-folder");
  },
  createProject(parentDirectory, projectName) {
    return ipcRenderer.invoke("project:create", parentDirectory, projectName);
  },
  pickAndOpenProject() {
    return ipcRenderer.invoke("project:pick-and-open");
  },
  readProjectDocuments(projectPath, markdownFileName, cssFileName) {
    return ipcRenderer.invoke("project:read-documents", projectPath, markdownFileName, cssFileName);
  },
  saveProjectDocument(saveParameters) {
    return ipcRenderer.invoke("project:save-document", saveParameters);
  },
  openAssetsFolder(assetsPath) {
    return ipcRenderer.invoke("project:open-assets-folder", assetsPath);
  },
  startConverter(conversionParameters) {
    return ipcRenderer.invoke("converter:start", conversionParameters);
  },
  stopConverter() {
    return ipcRenderer.invoke("converter:stop");
  },
  showContextMenu() {
    ipcRenderer.send("show-context-menu");
  },
  onConversionLog(callback) {
    const listener = (_event, logChunk) => callback(logChunk);
    ipcRenderer.on("conversion:log", listener);
    return () => ipcRenderer.removeListener("conversion:log", listener);
  },
  onPdfUpdated(callback) {
    const listener = (_event, pdfPath) => callback(pdfPath);
    ipcRenderer.on("pdf:updated", listener);
    return () => ipcRenderer.removeListener("pdf:updated", listener);
  },
});
