/**
 * @module install-consent
 * Persistent storage for dependency installation user authorization.
 */

const fs = require("fs");
const path = require("path");

/**
 * Creates an installation consent persistence store.
 * @param {string} storeFilePath - Path to JSON store file.
 * @param {{info: Function, warn: Function}} logger - Logging service.
 * @returns {{hasConsent: Function, grantConsent: Function, clearConsent: Function}} Consent store instance.
 */
function createInstallConsentStore(storeFilePath, logger) {
  const directoryPath = path.dirname(storeFilePath);
  if (!fs.existsSync(directoryPath)) {
    fs.mkdirSync(directoryPath, { recursive: true });
  }

  /**
   * Reads persistent consent status from disk.
   * @returns {boolean} True if installation consent was granted.
   */
  function hasConsent() {
    try {
      if (!fs.existsSync(storeFilePath)) {
        return false;
      }
      const rawContent = fs.readFileSync(storeFilePath, "utf8");
      const parsedData = JSON.parse(rawContent);
      return Boolean(parsedData.consentGranted);
    } catch (readError) {
      logger.warn(`Failed reading install consent file: ${readError.message}`);
      return false;
    }
  }

  /**
   * Persists installation consent status to disk.
   * @param {boolean} consentValue - Consent flag value.
   * @returns {void}
   */
  function saveConsent(consentValue) {
    try {
      fs.writeFileSync(
        storeFilePath,
        JSON.stringify({ consentGranted: consentValue, updatedAt: new Date().toISOString() }, null, 2),
        "utf8"
      );
    } catch (writeError) {
      logger.warn(`Failed saving install consent file: ${writeError.message}`);
    }
  }

  return {
    hasConsent,
    grantConsent() {
      logger.info("Installation consent granted.");
      saveConsent(true);
    },
    clearConsent() {
      logger.info("Installation consent cleared.");
      saveConsent(false);
    },
  };
}

module.exports = { createInstallConsentStore };
