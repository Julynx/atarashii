/**
 * @module ipc-handlers
 * Main-process IPC dispatch registering all communication channels with the renderer.
 */

const fs = require("fs");
const {
  ipcMain,
  dialog,
  shell,
  app,
  Menu,
  MenuItem,
  BrowserWindow,
} = require("electron");
const {
  checkRequirements,
  installFirstMissingRequirement,
} = require("./requirements");
const { checkForUpdate, installUpdate } = require("./updater");
const {
  getDefaultParentDirectory,
  getNextAvailableProjectName,
  createProject,
  validateAndOpenProject,
  readProjectDocuments,
  writeProjectDocument,
} = require("./project-service");
const { formatMarkdown, formatCss } = require("./formatter-service");

/**
 * Serializes an error object into a renderer-friendly structure.
 * @param {Error|any} error - Thrown error instance.
 * @returns {{name: string, message: string, stack: string}} Serialized error details.
 */
function serializeError(error) {
  return {
    name: error?.name || "Error",
    message: error?.message || String(error),
    stack: error?.stack || "",
  };
}

/**
 * Registers all application IPC handlers.
 * @param {Electron.BrowserWindow} mainWindow - Primary application window.
 * @param {{info: Function, warn: Function, error: Function}} logger - Logging service.
 * @param {{hasConsent: Function, grantConsent: Function, clearConsent: Function}} consentStore - Consent storage.
 * @param {ReturnType<typeof import("./converter-service").createConverterService>} converterService - Conversion service.
 * @returns {void}
 */
function registerIpcHandlers(
  mainWindow,
  logger,
  consentStore,
  converterService,
) {
  ipcMain.handle("window:minimize", () => {
    mainWindow.minimize();
  });

  ipcMain.handle("window:maximize", () => {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  });

  ipcMain.handle("window:close", async () => {
    await converterService.stopLiveConversion();
    mainWindow.close();
  });

  ipcMain.handle("requirements:check", async () => {
    try {
      return await checkRequirements(logger);
    } catch (checkError) {
      logger.error(`Requirements check failure: ${checkError.message}`);
      throw checkError;
    }
  });

  ipcMain.handle("install-consent:get", () => {
    return consentStore.hasConsent();
  });

  ipcMain.handle("install-consent:grant", () => {
    consentStore.grantConsent();
  });

  ipcMain.handle("install-consent:clear", () => {
    consentStore.clearConsent();
  });

  ipcMain.handle("requirements:install", async () => {
    try {
      const statuses = await checkRequirements(logger);
      const result = await installFirstMissingRequirement(statuses, logger);
      if (result.ok) {
        logger.info(
          "Relaunching application following successful dependency installation.",
        );
        app.relaunch();
        app.exit(0);
      }
      return result;
    } catch (installError) {
      logger.error(
        `Requirements installation failure: ${installError.message}`,
      );
      return { ok: false, output: installError.stack || installError.message };
    }
  });

  ipcMain.handle("update:check", async () => {
    return checkForUpdate(logger);
  });

  ipcMain.handle("update:install", async () => {
    return installUpdate(logger);
  });

  ipcMain.handle("project:get-defaults", () => {
    const defaultParentDirectory = getDefaultParentDirectory();
    const nextAvailableProjectName = getNextAvailableProjectName(
      defaultParentDirectory,
    );
    return { defaultParentDirectory, nextAvailableProjectName };
  });

  ipcMain.handle("project:compute-next-name", (_event, parentDirectory) => {
    return getNextAvailableProjectName(parentDirectory);
  });

  ipcMain.handle("project:pick-parent-folder", async () => {
    const selectionResult = await dialog.showOpenDialog(mainWindow, {
      title: "Select Atarashii Projects Folder",
      properties: ["openDirectory", "createDirectory"],
    });

    if (selectionResult.canceled || selectionResult.filePaths.length === 0) {
      return null;
    }

    const selectedPath = selectionResult.filePaths[0];
    const nextName = getNextAvailableProjectName(selectedPath);
    return { selectedPath, nextName };
  });

  ipcMain.handle(
    "project:create",
    async (_event, parentDirectory, projectName) => {
      try {
        const projectMetadata = createProject(
          parentDirectory,
          projectName,
          logger,
        );
        return { ok: true, project: projectMetadata };
      } catch (createError) {
        logger.error(`Project creation failure: ${createError.message}`);
        return { ok: false, error: serializeError(createError) };
      }
    },
  );

  ipcMain.handle("project:pick-and-open", async () => {
    const defaultParentDirectory = getDefaultParentDirectory();
    if (!fs.existsSync(defaultParentDirectory)) {
      fs.mkdirSync(defaultParentDirectory, { recursive: true });
    }

    const selectionResult = await dialog.showOpenDialog(mainWindow, {
      title: "Open Atarashii Project Folder",
      defaultPath: defaultParentDirectory,
      properties: ["openDirectory"],
    });

    if (selectionResult.canceled || selectionResult.filePaths.length === 0) {
      return { canceled: true };
    }

    const selectedFolderPath = selectionResult.filePaths[0];
    try {
      const projectMetadata = validateAndOpenProject(
        selectedFolderPath,
        logger,
      );
      return { ok: true, project: projectMetadata };
    } catch (validationError) {
      logger.warn(`Project validation error: ${validationError.message}`);
      return { ok: false, error: serializeError(validationError) };
    }
  });

  ipcMain.handle(
    "project:read-documents",
    (_event, projectPath, markdownFileName, cssFileName) => {
      try {
        const documents = readProjectDocuments(
          projectPath,
          markdownFileName,
          cssFileName,
        );
        return { ok: true, documents };
      } catch (readError) {
        logger.error(`Document read failure: ${readError.message}`);
        return { ok: false, error: serializeError(readError) };
      }
    },
  );

  ipcMain.handle("project:save-document", async (_event, saveParameters) => {
    const { projectPath, fileName, content, fileType } = saveParameters;
    try {
      writeProjectDocument(projectPath, fileName, content);

      if (fileType === "css") {
        converterService.triggerReconversion();
      }

      return { ok: true, savedContent: content };
    } catch (saveError) {
      logger.error(`Document save failure (${fileName}): ${saveError.message}`);
      return { ok: false, error: serializeError(saveError) };
    }
  });

  ipcMain.handle(
    "project:format-document",
    async (_event, formatParameters) => {
      const { content, fileType } = formatParameters;
      try {
        let formattedText = content;
        if (fileType === "markdown") {
          formattedText = formatMarkdown(content, logger);
        } else if (fileType === "css") {
          formattedText = await formatCss(content, logger);
        }
        return { ok: true, formattedContent: formattedText };
      } catch (formatError) {
        logger.error(
          `Document format failure (${fileType}): ${formatError.message}`,
        );
        return { ok: false, error: serializeError(formatError) };
      }
    },
  );

  ipcMain.handle("project:open-assets-folder", async (_event, assetsPath) => {
    try {
      const openResult = await shell.openPath(assetsPath);
      if (openResult) {
        logger.warn(`Could not open assets folder: ${openResult}`);
      }
    } catch (openFolderError) {
      logger.error(`Failed opening assets folder: ${openFolderError.message}`);
    }
  });

  ipcMain.handle("converter:start", async (_event, startParameters) => {
    const { projectPath, markdownFileName, cssFileName, pdfFileName } =
      startParameters;
    try {
      await converterService.startLiveConversion(
        projectPath,
        markdownFileName,
        cssFileName,
        pdfFileName,
      );
      return { ok: true };
    } catch (startConversionError) {
      logger.error(`Conversion start failure: ${startConversionError.message}`);
      return { ok: false, error: serializeError(startConversionError) };
    }
  });

  ipcMain.handle("converter:stop", async () => {
    await converterService.stopLiveConversion();
    return { ok: true };
  });

  ipcMain.on("show-context-menu", (event) => {
    const senderWindow = BrowserWindow.fromWebContents(event.sender);
    if (!senderWindow) {
      return;
    }
    const contextMenu = new Menu();
    contextMenu.append(new MenuItem({ role: "copy" }));
    contextMenu.popup({ window: senderWindow });
  });
}

module.exports = { registerIpcHandlers };
