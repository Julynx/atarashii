/**
 * @module environment
 * Cross-platform PATH environment synchronization for Windows and Linux applications.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const { runCommand } = require("./process-runner");

const POWERSHELL_PATH_QUERY = [
  "$machine = [Environment]::GetEnvironmentVariable('Path','Machine')",
  "$user = [Environment]::GetEnvironmentVariable('Path','User')",
  "ConvertTo-Json -Compress @($machine, $user)",
].join("; ");

/**
 * Reads Machine and User PATH values from the Windows registry.
 * @returns {Promise<{machinePath: string, userPath: string}>} Registry PATH values.
 */
async function readRegistryPathValues() {
  if (process.platform !== "win32") {
    return { machinePath: "", userPath: "" };
  }

  const result = await runCommand(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-Command", POWERSHELL_PATH_QUERY],
    { timeoutMs: 30 * 1000 }
  );
  if (result.code !== 0) {
    throw new Error(`Registry PATH query failed: ${result.stderr.trim()}`);
  }
  const [machinePath, userPath] = JSON.parse(result.stdout.trim());
  return { machinePath: machinePath || "", userPath: userPath || "" };
}

/**
 * Resolves the appropriate PATH delimiter and case sensitivity mode.
 * @param {string[]} pathValues - List of PATH strings.
 * @param {string} [targetPlatform] - Operating system platform identifier.
 * @returns {{delimiter: string, caseInsensitive: boolean}} Delimiter and comparison settings.
 */
function resolvePathSettings(pathValues, targetPlatform = process.platform) {
  const hasWindowsDelimiter = pathValues.some(
    (value) => typeof value === "string" && value.includes(";")
  );
  if (hasWindowsDelimiter || targetPlatform === "win32") {
    return { delimiter: ";", caseInsensitive: true };
  }
  return { delimiter: ":", caseInsensitive: false };
}

/**
 * Returns standard Linux directories where user and system binaries reside.
 * @param {string} [homeDirectory] - User home directory path.
 * @returns {string[]} Array of candidate binary directory paths.
 */
function getStandardLinuxBinaryPaths(homeDirectory = os.homedir()) {
  const normalizedHome = homeDirectory.split(path.sep).join("/");
  return [
    path.posix.join(normalizedHome, ".local", "bin"),
    path.posix.join(normalizedHome, ".cargo", "bin"),
    "/usr/local/bin",
    "/usr/bin",
    "/bin",
    "/usr/local/sbin",
    "/usr/sbin",
    "/sbin",
  ];
}

/**
 * Reads the PATH environment variable configured in the user login shell.
 * @returns {Promise<string>} Shell PATH string or empty string on failure.
 */
async function readUnixShellPath() {
  if (process.platform === "win32") {
    return "";
  }
  const preferredShell = process.env.SHELL || "/bin/sh";
  try {
    const executionResult = await runCommand(
      preferredShell,
      ["-l", "-c", 'printf "%s" "$PATH"'],
      { timeoutMs: 3000 }
    );
    if (executionResult.code === 0 && executionResult.stdout.trim()) {
      return executionResult.stdout.trim();
    }
  } catch {}
  return "";
}

/**
 * Merges PATH entries preserving priority and eliminating duplicates.
 * @param {string[]} pathValues - List of PATH strings ordered by priority.
 * @param {object} [options] - Merge configuration options.
 * @param {string} [options.delimiter] - Explicit path delimiter.
 * @param {boolean} [options.caseInsensitive] - Explicit case insensitivity flag.
 * @returns {string} Merged PATH string.
 */
function mergePathValues(pathValues, options = {}) {
  const defaultSettings = resolvePathSettings(pathValues);
  const activeDelimiter = options.delimiter || defaultSettings.delimiter;
  const isCaseInsensitive = options.caseInsensitive ?? defaultSettings.caseInsensitive;

  const seenEntries = new Set();
  const uniqueEntries = [];

  for (const pathValue of pathValues) {
    if (!pathValue) {
      continue;
    }
    for (const segment of pathValue.split(activeDelimiter)) {
      const trimmedSegment = segment.trim();
      if (!trimmedSegment) {
        continue;
      }
      const comparisonKey = isCaseInsensitive
        ? trimmedSegment.toLowerCase()
        : trimmedSegment;
      if (!seenEntries.has(comparisonKey)) {
        seenEntries.add(comparisonKey);
        uniqueEntries.push(trimmedSegment);
      }
    }
  }

  return uniqueEntries.join(activeDelimiter);
}

/**
 * Updates process.env.PATH with registry values and inherited paths on Windows.
 * @param {{info: Function, warn: Function}} logger - Logging service.
 * @returns {Promise<void>}
 */
async function refreshWindowsPath(logger) {
  try {
    const { machinePath, userPath } = await readRegistryPathValues();
    const refreshedPath = mergePathValues([userPath, machinePath, process.env.PATH || ""]);
    if (refreshedPath) {
      process.env.PATH = refreshedPath;
      logger.info("PATH environment variable refreshed from Windows registry.");
    }
  } catch (refreshError) {
    logger.warn(`Could not refresh PATH from registry: ${refreshError.message}`);
  }
}

/**
 * Updates process.env.PATH with standard Linux user directories and shell PATH.
 * @param {{info: Function, warn: Function}} logger - Logging service.
 * @returns {Promise<void>}
 */
async function refreshLinuxPath(logger) {
  try {
    const shellPath = await readUnixShellPath();
    const candidatePaths = getStandardLinuxBinaryPaths();
    const existingCandidatePaths = candidatePaths.filter((candidateDirectory) => {
      try {
        return fs.existsSync(candidateDirectory);
      } catch {
        return false;
      }
    });

    const refreshedPath = mergePathValues([
      shellPath,
      existingCandidatePaths.join(":"),
      process.env.PATH || "",
    ]);

    if (refreshedPath) {
      process.env.PATH = refreshedPath;
      logger.info("PATH environment variable refreshed for Linux environment.");
    }
  } catch (refreshError) {
    logger.warn(`Could not refresh Linux PATH: ${refreshError.message}`);
  }
}

/**
 * Synchronizes PATH environment variable based on host operating system.
 * @param {{info: Function, warn: Function}} logger - Logging service.
 * @returns {Promise<void>}
 */
async function refreshEnvironmentPath(logger) {
  if (process.platform === "win32") {
    await refreshWindowsPath(logger);
  } else {
    await refreshLinuxPath(logger);
  }
}

module.exports = {
  readRegistryPathValues,
  resolvePathSettings,
  getStandardLinuxBinaryPaths,
  mergePathValues,
  refreshWindowsPath,
  refreshLinuxPath,
  refreshEnvironmentPath,
};
