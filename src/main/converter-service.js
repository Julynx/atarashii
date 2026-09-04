/**
 * @module converter-service
 * Child process management for live markdown-convert execution and PDF update watching.
 */

const fs = require("fs");
const path = require("path");
const { spawn, exec } = require("child_process");
const chokidar = require("chokidar");

/**
 * Creates the live conversion service.
 * @param {{info: Function, warn: Function, error: Function}} logger - Logging service.
 * @param {Function} broadcastLogEvent - Callback to send log stream entries to renderer.
 * @param {Function} broadcastPdfUpdatedEvent - Callback to notify renderer when PDF file updates.
 * @returns {{startLiveConversion: Function, stopLiveConversion: Function, triggerReconversion: Function}} Converter service instance.
 */
function createConverterService(logger, broadcastLogEvent, broadcastPdfUpdatedEvent) {
  let activeProcess = null;
  let activeWatcher = null;
  let activeProjectPath = null;
  let activeMarkdownFileName = null;
  let logFileDescriptor = null;

  /**
   * Forcibly terminates a process and its child processes on Windows.
   * @param {number} processIdentifier - Process ID to terminate.
   * @returns {Promise<void>}
   */
  function killProcessTree(processIdentifier) {
    return new Promise((resolve) => {
      if (process.platform === "win32") {
        exec(`taskkill /pid ${processIdentifier} /t /f`, () => {
          resolve();
        });
      } else {
        try {
          process.kill(-processIdentifier, "SIGKILL");
        } catch {
          try {
            process.kill(processIdentifier, "SIGKILL");
          } catch {
            resolve();
            return;
          }
        }
        resolve();
      }
    });
  }

  /**
   * Closes active file watching instance.
   * @returns {Promise<void>}
   */
  async function closeActiveWatcher() {
    if (activeWatcher) {
      try {
        await activeWatcher.close();
      } catch (watcherCloseError) {
        logger.warn(`Error closing PDF watcher: ${watcherCloseError.message}`);
      }
      activeWatcher = null;
    }
  }

  /**
   * Stops the currently running conversion process.
   * @returns {Promise<void>}
   */
  async function stopLiveConversion() {
    await closeActiveWatcher();

    if (logFileDescriptor) {
      try {
        fs.closeSync(logFileDescriptor);
      } catch (descriptorCloseError) {
        logger.warn(`Error closing conversion log file descriptor: ${descriptorCloseError.message}`);
      }
      logFileDescriptor = null;
    }

    if (activeProcess && activeProcess.pid) {
      const targetPid = activeProcess.pid;
      activeProcess = null;
      logger.info(`Terminating conversion process tree with PID: ${targetPid}`);
      await killProcessTree(targetPid);
    }

    activeProjectPath = null;
    activeMarkdownFileName = null;
  }

  /**
   * Sets up file watching for the output PDF to trigger renderer view updates.
   * @param {string} pdfFilePath - Target PDF file path.
   * @returns {void}
   */
  function setupPdfWatcher(pdfFilePath) {
    activeWatcher = chokidar.watch(pdfFilePath, {
      persistent: true,
      ignoreInitial: false,
      awaitWriteFinish: {
        stabilityThreshold: 200,
        pollInterval: 100,
      },
    });

    activeWatcher.on("add", (addedPath) => {
      logger.info(`PDF created: ${addedPath}`);
      broadcastPdfUpdatedEvent(addedPath);
    });

    activeWatcher.on("change", (changedPath) => {
      logger.info(`PDF updated: ${changedPath}`);
      broadcastPdfUpdatedEvent(changedPath);
    });

    activeWatcher.on("error", (watcherError) => {
      logger.error(`PDF watcher error: ${watcherError.message}`);
    });
  }

  /**
   * Starts live background conversion for the specified project.
   * @param {string} projectPath - Project directory path.
   * @param {string} markdownFileName - Name of Markdown file.
   * @param {string} cssFileName - Name of CSS file.
   * @param {string} pdfFileName - Name of output PDF file.
   * @returns {Promise<void>}
   */
  async function startLiveConversion(projectPath, markdownFileName, cssFileName, pdfFileName) {
    await stopLiveConversion();

    activeProjectPath = projectPath;
    activeMarkdownFileName = markdownFileName;

    const conversionLogFilePath = path.join(projectPath, "conversion.log");
    const outputPdfFilePath = path.join(projectPath, pdfFileName);

    logFileDescriptor = fs.openSync(conversionLogFilePath, "a");

    setupPdfWatcher(outputPdfFilePath);

    const commandArguments = [
      markdownFileName,
      `--css=${cssFileName}`,
      "--mode=live",
      `--out=${pdfFileName}`,
    ];

    logger.info(`Launching: markdown-convert ${commandArguments.join(" ")} in ${projectPath}`);

    const commandNotification = `[Atarashii] Starting: markdown-convert ${commandArguments.join(" ")}\n`;
    fs.writeSync(logFileDescriptor, commandNotification);
    broadcastLogEvent(commandNotification);

    activeProcess = spawn("markdown-convert", commandArguments, {
      cwd: projectPath,
      windowsHide: true,
      shell: false,
    });

    activeProcess.stdout.on("data", (chunk) => {
      const text = chunk.toString("utf8");
      if (logFileDescriptor) {
        fs.writeSync(logFileDescriptor, text);
      }
      broadcastLogEvent(text);
    });

    activeProcess.stderr.on("data", (chunk) => {
      const text = chunk.toString("utf8");
      if (logFileDescriptor) {
        fs.writeSync(logFileDescriptor, text);
      }
      broadcastLogEvent(text);
    });

    activeProcess.on("error", (processError) => {
      const errorText = `[Atarashii Error] Failed to launch conversion process: ${processError.message}\n`;
      logger.error(errorText);
      if (logFileDescriptor) {
        fs.writeSync(logFileDescriptor, errorText);
      }
      broadcastLogEvent(errorText);
    });

    activeProcess.on("close", (exitCode) => {
      const exitText = `\n[Atarashii] Conversion process exited with code ${exitCode}\n`;
      logger.info(exitText.trim());
      if (logFileDescriptor) {
        fs.writeSync(logFileDescriptor, exitText);
      }
      broadcastLogEvent(exitText);
    });
  }

  /**
   * Touches the markdown file modification timestamp to trigger live re-conversion.
   * @returns {void}
   */
  function triggerReconversion() {
    if (!activeProjectPath || !activeMarkdownFileName) {
      return;
    }

    const markdownFilePath = path.join(activeProjectPath, activeMarkdownFileName);
    if (fs.existsSync(markdownFilePath)) {
      const currentTimestamp = new Date();
      try {
        fs.utimesSync(markdownFilePath, currentTimestamp, currentTimestamp);
      } catch (touchError) {
        logger.warn(`Could not update timestamp for ${markdownFilePath}: ${touchError.message}`);
      }
    }
  }

  return {
    startLiveConversion,
    stopLiveConversion,
    triggerReconversion,
  };
}

module.exports = { createConverterService };
