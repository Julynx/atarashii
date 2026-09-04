/**
 * @module main
 * Primary application lifecycle controller, window initialization, and protocol registration.
 */

const fs = require("fs");
const path = require("path");
const { app, BrowserWindow, protocol, shell } = require("electron");

const { createLogger } = require("./logger");
const { refreshWindowsPath } = require("./environment");
const { createInstallConsentStore } = require("./install-consent");
const { createConverterService } = require("./converter-service");
const { registerIpcHandlers } = require("./ipc-handlers");

const configurationFilePath = path.join(__dirname, "..", "..", "config", "app-config.json");
const appConfiguration = JSON.parse(fs.readFileSync(configurationFilePath, "utf8"));

let primaryWindow = null;
let converterServiceInstance = null;

/**
 * Creates the primary application window.
 * @returns {Electron.BrowserWindow} Browser window instance.
 */
function createPrimaryWindow() {
  const applicationIconPath = path.join(
    __dirname,
    "..",
    "..",
    "assets",
    "icons",
    "app-icon.png"
  );

  const windowInstance = new BrowserWindow({
    width: appConfiguration.windowWidth,
    height: appConfiguration.windowHeight,
    minWidth: appConfiguration.minWindowWidth,
    minHeight: appConfiguration.minWindowHeight,
    frame: false,
    backgroundColor: "#10141f",
    title: appConfiguration.appName,
    icon: applicationIconPath,
    webPreferences: {
      preload: path.join(__dirname, "..", "preload", "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  windowInstance.setMenu(null);
  windowInstance.loadFile(path.join(__dirname, "..", "renderer", "index.html"));

  windowInstance.webContents.setWindowOpenHandler(({ url }) => {
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

  windowInstance.webContents.on("will-navigate", (navigateEvent, targetUrl) => {
    if (
      targetUrl.startsWith("http://") ||
      targetUrl.startsWith("https://") ||
      targetUrl.startsWith("mailto:")
    ) {
      navigateEvent.preventDefault();
      shell.openExternal(targetUrl);
    }
  });

  return windowInstance;
}

protocol.registerSchemesAsPrivileged([
  {
    scheme: "safe-file",
    privileges: {
      standard: false,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
]);

app.whenReady().then(async () => {
  const applicationLogFilePath = path.join(app.getPath("userData"), "logs", "app.log");
  const applicationLogger = createLogger(applicationLogFilePath);
  applicationLogger.info(`${appConfiguration.appName} starting.`);

  protocol.handle("safe-file", (request) => {
    try {
      const rawPath = request.url.slice("safe-file://".length);
      const decodedPath = decodeURIComponent(rawPath);
      const absoluteRequestedPath = path.resolve(decodedPath);
      if (!fs.existsSync(absoluteRequestedPath)) {
        return new Response("Not found", { status: 404 });
      }
      const fileData = fs.readFileSync(absoluteRequestedPath);
      return new Response(fileData, {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Length": String(fileData.length),
        },
      });
    } catch (handlerError) {
      applicationLogger.error(`Error serving safe-file: ${handlerError.message}`);
      return new Response("Error reading file", { status: 500 });
    }
  });

  await refreshWindowsPath(applicationLogger);

  const consentStore = createInstallConsentStore(
    path.join(app.getPath("userData"), "install-consent.json"),
    applicationLogger
  );

  converterServiceInstance = createConverterService(
    applicationLogger,
    (logChunk) => {
      if (primaryWindow && !primaryWindow.isDestroyed()) {
        primaryWindow.webContents.send("conversion:log", logChunk);
      }
    },
    (pdfPath) => {
      if (primaryWindow && !primaryWindow.isDestroyed()) {
        primaryWindow.webContents.send("pdf:updated", pdfPath);
      }
    }
  );

  primaryWindow = createPrimaryWindow();
  registerIpcHandlers(primaryWindow, applicationLogger, consentStore, converterServiceInstance);

  primaryWindow.webContents.on("console-message", (event) => {
    applicationLogger.info(
      `[Renderer] (${event.level}) ${event.message} [${event.sourceId}:${event.lineNumber}]`
    );
  });

  primaryWindow.webContents.on("before-input-event", (inputEvent, inputData) => {
    if (inputData.type === "keyDown") {
      const isF12 = inputData.key === "F12";
      const isDevToolsCombo =
        (inputData.control || inputData.meta) &&
        inputData.shift &&
        inputData.key.toLowerCase() === "i";
      if (isF12 || isDevToolsCombo) {
        primaryWindow.webContents.toggleDevTools();
        inputEvent.preventDefault();
      }
    }
  });

  if (process.argv.includes("--devtools") || process.argv.includes("--dev")) {
    primaryWindow.webContents.openDevTools();
  }

  if (process.argv.includes("--test-startup")) {
    primaryWindow.webContents.on("did-finish-load", () => {
      setTimeout(() => {
        app.exit(0);
      }, 2000);
    });
  }

  if (process.argv.includes("--test-visibility")) {
    primaryWindow.webContents.on("did-finish-load", () => {
      setTimeout(async () => {
        try {
          const testNavigationSequence = await primaryWindow.webContents.executeJavaScript(`
            (async () => {
              const screens = [
                "screen-loading",
                "screen-requirements",
                "screen-update",
                "screen-welcome",
                "screen-new-project",
                "screen-main"
              ];
              const getVisible = () => screens.filter(id => {
                const el = document.getElementById(id);
                return window.getComputedStyle(el).display !== "none";
              });

              const initialVisible = getVisible();
              if (initialVisible.length !== 1 || initialVisible[0] !== "screen-welcome") {
                return { ok: false, step: "initial", visible: initialVisible };
              }

              document.getElementById("welcome-new-project-button").click();
              await new Promise(r => setTimeout(r, 200));

              const newProjectVisible = getVisible();
              if (newProjectVisible.length !== 1 || newProjectVisible[0] !== "screen-new-project") {
                return { ok: false, step: "new-project", visible: newProjectVisible };
              }

              document.getElementById("cancel-new-project-button").click();
              await new Promise(r => setTimeout(r, 200));

              const returnedVisible = getVisible();
              if (returnedVisible.length !== 1 || returnedVisible[0] !== "screen-welcome") {
                return { ok: false, step: "cancel-return", visible: returnedVisible };
              }

              return { ok: true };
            })()
          `);

          applicationLogger.info(`[NavigationTestResult] ${JSON.stringify(testNavigationSequence)}`);
          if (testNavigationSequence.ok) {
            app.exit(0);
          } else {
            applicationLogger.error(`Navigation visibility failed: ${JSON.stringify(testNavigationSequence)}`);
            app.exit(1);
          }
        } catch (navigationError) {
          applicationLogger.error(navigationError.message);
          app.exit(1);
        }
      }, 2500);
    });
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      primaryWindow = createPrimaryWindow();
    }
  });
});

app.on("before-quit", async () => {
  if (converterServiceInstance) {
    await converterServiceInstance.stopLiveConversion();
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
