/**
 * @module environment
 * Registry PATH environment synchronization for Windows applications.
 */

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
 * Merges PATH entries preserving priority and eliminating duplicates.
 * @param {string[]} pathValues - List of PATH strings ordered by priority.
 * @returns {string} Merged PATH string.
 */
function mergePathValues(pathValues) {
  const seenEntries = new Set();
  const uniqueEntries = [];
  for (const pathValue of pathValues) {
    for (const segment of pathValue.split(";")) {
      const trimmedSegment = segment.trim();
      const normalizedSegment = trimmedSegment.toLowerCase();
      if (trimmedSegment && !seenEntries.has(normalizedSegment)) {
        seenEntries.add(normalizedSegment);
        uniqueEntries.push(trimmedSegment);
      }
    }
  }
  return uniqueEntries.join(";");
}

/**
 * Updates process.env.PATH with registry values and inherited paths.
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

module.exports = { refreshWindowsPath, mergePathValues };
