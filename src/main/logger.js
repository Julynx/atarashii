/**
 * @module logger
 * File and console logging service with formatted timestamps and level tagging.
 */

const fs = require("fs");
const path = require("path");

/**
 * Creates a file and console logger instance.
 * @param {string} logFilePath - Absolute path to the log file.
 * @returns {{info: Function, warn: Function, error: Function, getLogFilePath: Function}} Logger instance.
 */
function createLogger(logFilePath) {
  const directoryPath = path.dirname(logFilePath);
  if (!fs.existsSync(directoryPath)) {
    fs.mkdirSync(directoryPath, { recursive: true });
  }

  /**
   * Appends a formatted message to the log file and console.
   * @param {"INFO" | "WARN" | "ERROR"} level - Log severity level.
   * @param {string} message - Message text.
   * @returns {void}
   */
  function writeEntry(level, message) {
    const timestamp = new Date().toISOString();
    const formattedMessage = `[${timestamp}] [${level}] ${message}`;

    if (level === "ERROR") {
      console.error(formattedMessage);
    } else if (level === "WARN") {
      console.warn(formattedMessage);
    } else {
      console.log(formattedMessage);
    }

    try {
      fs.appendFileSync(logFilePath, `${formattedMessage}\n`, "utf8");
    } catch (fileWriteError) {
      console.error(`Failed writing to log file: ${fileWriteError.message}`);
    }
  }

  return {
    info(message) {
      writeEntry("INFO", message);
    },
    warn(message) {
      writeEntry("WARN", message);
    },
    error(message) {
      writeEntry("ERROR", message);
    },
    getLogFilePath() {
      return logFilePath;
    },
  };
}

module.exports = { createLogger };
