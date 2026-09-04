/**
 * @module updater
 * Version check and package update facility for markdown-convert backend.
 */

const https = require("https");
const { runCommand, probeCommand, formatCommandOutput } = require("./process-runner");

const PYPI_METADATA_URL = "https://pypi.org/pypi/markdown-convert/json";
const UPDATE_CHECK_TIMEOUT_MILLISECONDS = 8000;

/**
 * Retrieves the currently installed version of markdown-convert.
 * @returns {Promise<string>} Installed version string.
 */
async function getInstalledVersion() {
  const output = await probeCommand("uv", ["tool", "list"]);
  const versionMatch = output.match(/^markdown-convert\s+v?([\w.\-+]+)/m);
  if (!versionMatch) {
    throw new Error("markdown-convert is not listed in uv tool list.");
  }
  return versionMatch[1];
}

/**
 * Retrieves the latest published version of markdown-convert from PyPI.
 * @returns {Promise<string>} Latest available version string.
 */
function getLatestVersion() {
  return new Promise((resolve, reject) => {
    const request = https.get(
      PYPI_METADATA_URL,
      { timeout: UPDATE_CHECK_TIMEOUT_MILLISECONDS },
      (response) => {
        if (response.statusCode !== 200) {
          response.resume();
          reject(new Error(`PyPI returned HTTP status ${response.statusCode}.`));
          return;
        }

        const dataChunks = [];
        response.on("data", (chunk) => dataChunks.push(chunk));
        response.on("end", () => {
          try {
            const rawBody = Buffer.concat(dataChunks).toString("utf8");
            const packageMetadata = JSON.parse(rawBody);
            resolve(packageMetadata.info.version);
          } catch (parseError) {
            reject(new Error(`Failed to parse PyPI metadata response: ${parseError.message}`));
          }
        });
      }
    );

    request.on("timeout", () => {
      request.destroy(new Error("Update check request timed out."));
    });

    request.on("error", (requestError) => {
      reject(requestError);
    });
  });
}

/**
 * Compares two semantic version strings numerically.
 * @param {string} versionA - First version string.
 * @param {string} versionB - Second version string.
 * @returns {number} Negative if versionA < versionB, zero if equal, positive if versionA > versionB.
 */
function compareVersions(versionA, versionB) {
  const segmentsA = versionA.split(".").map((segment) => parseInt(segment, 10) || 0);
  const segmentsB = versionB.split(".").map((segment) => parseInt(segment, 10) || 0);
  const maximumLength = Math.max(segmentsA.length, segmentsB.length);

  for (let index = 0; index < maximumLength; index += 1) {
    const difference = (segmentsA[index] || 0) - (segmentsB[index] || 0);
    if (difference !== 0) {
      return difference;
    }
  }

  return 0;
}

/**
 * Checks if a newer version of markdown-convert is published.
 * @param {{info: Function, warn: Function}} logger - Logging service.
 * @returns {Promise<{status: "outdated"|"up-to-date"|"unavailable", installedVersion?: string, latestVersion?: string}>} Update check result.
 */
async function checkForUpdate(logger) {
  try {
    const [installedVersion, latestVersion] = await Promise.all([
      getInstalledVersion(),
      getLatestVersion(),
    ]);

    logger.info(`Installed version: ${installedVersion}, Latest version: ${latestVersion}`);

    if (compareVersions(installedVersion, latestVersion) < 0) {
      return { status: "outdated", installedVersion, latestVersion };
    }

    return { status: "up-to-date", installedVersion, latestVersion };
  } catch (checkError) {
    logger.warn(`Update check skipped: ${checkError.message}`);
    return { status: "unavailable" };
  }
}

/**
 * Updates the markdown-convert tool to the latest release using uv.
 * @param {{info: Function, error: Function}} logger - Logging service.
 * @returns {Promise<{ok: boolean, output?: string}>} Upgrade execution result.
 */
async function installUpdate(logger) {
  logger.info("Upgrading markdown-convert via `uv tool install markdown-convert@latest`.");
  const upgradeResult = await runCommand("uv", ["tool", "install", "markdown-convert@latest"]);

  if (upgradeResult.code !== 0) {
    const formattedError = formatCommandOutput(upgradeResult);
    logger.error(`markdown-convert update failed:\n${formattedError}`);
    return { ok: false, output: formattedError };
  }

  logger.info("markdown-convert updated successfully.");
  return { ok: true };
}

module.exports = { checkForUpdate, installUpdate, compareVersions };
