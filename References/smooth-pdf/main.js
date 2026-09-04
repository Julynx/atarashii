/**
 * @module main
 * Electron main process entry point managing window lifecycle, file watching, and IPC channels.
 */

const {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  protocol,
  net,
  Menu,
  MenuItem,
  shell,
} = require("electron");
const path = require("path");
const { pathToFileURL } = require("url");

/**
 * Logs informational messages with an ISO timestamp.
 * @param {string} msg - Informational message to log.
 * @returns {void}
 */
const log = (msg) => {
  const timestamp = new Date().toISOString();
  const formattedMsg = `[INFO] ${timestamp} - ${msg}`;
  console.log(formattedMsg);
};

/**
 * Logs error details with an ISO timestamp.
 * @param {Error|string} err - Error object or error message.
 * @returns {void}
 */
const logError = (err) => {
  const timestamp = new Date().toISOString();
  console.error(`[ERROR] ${timestamp} -`, err);
};

let mainWindow = null;
let watcher = null;
let targetPdf = null;

/**
 * Initializes the main browser window.
 * @returns {void}
 */
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 800,
    titleBarStyle: "hidden",
    titleBarOverlay: {
      color: "rgba(0,0,0,0)",
      symbolColor: "#ffffff",
    },
    backgroundColor: "#121212",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile("index.html");
  mainWindow.removeMenu();

  mainWindow.webContents.on(
    "console-message",
    (event, level, message, line, sourceId) => {
      log(
        `Renderer Console [${level}]: ${message} (Line ${line} in ${sourceId})`,
      );
    },
  );

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (
      url.startsWith("http://") ||
      url.startsWith("https://") ||
      url.startsWith("mailto:")
    ) {
      shell.openExternal(url);
      return { action: "deny" };
    }
    return { action: "allow" };
  });

  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (
      url.startsWith("http://") ||
      url.startsWith("https://") ||
      url.startsWith("mailto:")
    ) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });
}

/**
 * Sets up the file watcher for the target PDF.
 * @param {string} filePath - Absolute path to the PDF to watch.
 * @returns {Promise<void>}
 */
async function setupWatcher(filePath) {
  if (watcher) {
    log("Closing previous watcher");
    await watcher.close();
  }

  const chokidar = require("chokidar");
  log(`Setting up watcher for ${filePath}`);
  watcher = chokidar.watch(filePath, {
    persistent: true,
    awaitWriteFinish: {
      stabilityThreshold: 150,
      pollInterval: 100,
    },
  });

  watcher.on("change", () => {
    log(`File changed: ${filePath}`);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("fileUpdated", filePath);
    }
  });

  watcher.on("error", (err) => logError(err));
}

app.whenReady().then(() => {
  protocol.handle("safe-file", (request) => {
    const rawPath = request.url.slice("safe-file://".length);
    const decodedPath = decodeURIComponent(rawPath);

    const absoluteRequestedPath = path.resolve(decodedPath);
    const absoluteTargetPath = targetPdf ? path.resolve(targetPdf) : null;

    if (!absoluteTargetPath || absoluteRequestedPath !== absoluteTargetPath) {
      logError(`Unauthorized file access attempt: ${absoluteRequestedPath}`);
      return new Response("Unauthorized access", { status: 403 });
    }

    return net.fetch(pathToFileURL(absoluteRequestedPath).href);
  });

  const args = process.argv.slice(app.isPackaged ? 1 : 2);
  if (args.length > 0) {
    targetPdf = path.resolve(args[0]);
    log(`Target PDF: ${targetPdf}`);
  } else {
    log("No PDF specified on startup.");
  }

  createWindow();

  if (targetPdf) {
    setupWatcher(targetPdf);
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

ipcMain.handle("getFilePath", () => {
  return targetPdf;
});

ipcMain.handle("selectFile", async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    title: "Select PDF",
    filters: [{ name: "PDF Documents", extensions: ["pdf"] }],
    properties: ["openFile"],
  });

  if (canceled || filePaths.length === 0) {
    return null;
  }

  targetPdf = filePaths[0];
  setupWatcher(targetPdf);
  return targetPdf;
});

ipcMain.handle("closeFile", async () => {
  log("Closing file");
  if (watcher) {
    await watcher.close();
    watcher = null;
  }
  targetPdf = null;
  return true;
});

ipcMain.on("show-context-menu", (event) => {
  if (!mainWindow) return;

  const menu = new Menu();
  menu.append(new MenuItem({ role: "copy" }));

  menu.popup({ window: BrowserWindow.fromWebContents(event.sender) });
});
