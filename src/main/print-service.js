/**
 * @module print-service
 * Sends the generated PDF document to the OS print pipeline through a hidden window,
 * so only the document itself is printed instead of the application UI.
 */

const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");
const { BrowserWindow } = require("electron");

const PDF_PLUGIN_SETTLE_DELAY_MS = 300;
const PDF_LOAD_TIMEOUT_MS = 30000;

/**
 * Waits for a fixed delay before resolving.
 * @param {number} delayMilliseconds - Time to wait in milliseconds.
 * @returns {Promise<void>} Resolved after the delay elapses.
 */
function waitForDelay(delayMilliseconds) {
  return new Promise((resolve) => setTimeout(resolve, delayMilliseconds));
}

/**
 * Rejects if the PDF document does not load within the load timeout.
 * @param {Promise<void>} loadPromise - Pending loadURL promise.
 * @returns {Promise<void>} Settled load promise.
 */
function raceAgainstLoadTimeout(loadPromise) {
  let timeoutHandle;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(new Error(`PDF load timed out after ${PDF_LOAD_TIMEOUT_MS} ms.`));
    }, PDF_LOAD_TIMEOUT_MS);
  });
  return Promise.race([loadPromise, timeoutPromise]).finally(() => {
    clearTimeout(timeoutHandle);
  });
}

/**
 * Creates the PDF printing service.
 * @param {{info: Function, warn: Function, error: Function}} logger - Logging service.
 * @returns {{ensurePrintWindow: Function, printPdf: Function}} Print service instance.
 */
function createPrintService(logger) {
  let printWindow = null;
  let isPrintSessionActive = false;

  /**
   * Returns the reusable hidden print window, creating it when absent.
   * The window must be created before any other window is destroyed and is
   * kept alive between print jobs because destroying a window that hosts the
   * built-in PDF viewer breaks PDF loading in later windows in current
   * Electron releases.
   * @returns {Electron.BrowserWindow} Hidden print window.
   */
  function ensurePrintWindow() {
    if (printWindow && !printWindow.isDestroyed()) {
      return printWindow;
    }
    printWindow = new BrowserWindow({
      width: 900,
      height: 700,
      show: false,
      skipTaskbar: true,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
      },
    });
    printWindow.once("closed", () => {
      printWindow = null;
    });
    return printWindow;
  }

  /**
   * Prints the PDF file on disk using the native print dialog.
   * @param {string} pdfPath - Absolute path to the PDF file to print.
   * @returns {Promise<{ok: boolean, canceled?: boolean}>} Print outcome.
   * @throws {Error} When the path is invalid, a print session is already active, or printing fails.
   */
  async function printPdf(pdfPath) {
    if (typeof pdfPath !== "string" || pdfPath.trim().length === 0) {
      throw new Error("Cannot print: no PDF path was provided.");
    }
    const absolutePdfPath = path.resolve(pdfPath);
    if (!fs.existsSync(absolutePdfPath)) {
      throw new Error(
        `Cannot print: PDF file not found at ${absolutePdfPath}.`,
      );
    }
    if (isPrintSessionActive) {
      throw new Error("Cannot print: a print session is already in progress.");
    }

    const targetWindow = ensurePrintWindow();
    isPrintSessionActive = true;
    targetWindow.setTitle(path.basename(absolutePdfPath));

    try {
      await raceAgainstLoadTimeout(
        targetWindow.webContents.loadURL(pathToFileURL(absolutePdfPath).href),
      );
      await waitForDelay(PDF_PLUGIN_SETTLE_DELAY_MS);

      const printOutcome = await new Promise((resolve) => {
        targetWindow.webContents.print(
          { silent: false, printBackground: true },
          (success, failureReason) => {
            resolve({ success, failureReason });
          },
        );
      });

      if (printOutcome.success) {
        logger.info(`Printed PDF: ${absolutePdfPath}`);
        return { ok: true };
      }
      if (printOutcome.failureReason === "Print job canceled") {
        logger.info(`Print canceled by user for PDF: ${absolutePdfPath}`);
        return { ok: true, canceled: true };
      }
      throw new Error(
        `Printing failed: ${printOutcome.failureReason || "unknown reason"}.`,
      );
    } catch (printError) {
      logger.error(
        `Print failure for PDF ${absolutePdfPath}: ${printError.message}`,
      );
      throw printError;
    } finally {
      isPrintSessionActive = false;
    }
  }

  return { ensurePrintWindow, printPdf };
}

module.exports = { createPrintService };
