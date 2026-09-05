/**
 * @module ensure-electron
 * Verifies and ensures the Electron binary is downloaded and properly extracted.
 * Resolves extraction failures and stream hangs during installation across Node.js versions.
 */

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { downloadArtifact } = require("@electron/get");

/**
 * Returns the platform-specific relative path to the Electron executable.
 * @param {string} platformName Operating system platform identifier.
 * @returns {string} Relative path to the platform binary.
 */
function getPlatformExecutablePath(platformName) {
  switch (platformName) {
    case "mas":
    case "darwin":
      return "Electron.app/Contents/MacOS/Electron";
    case "freebsd":
    case "openbsd":
    case "linux":
      return "electron";
    case "win32":
      return "electron.exe";
    default:
      throw new Error(`Unsupported platform for Electron: ${platformName}`);
  }
}

/**
 * Verifies whether the Electron executable and path record already exist on disk.
 * @param {string} electronPackageDirectory Path to the electron package root directory.
 * @param {string} relativeExecutablePath Expected relative path to executable inside dist.
 * @returns {boolean} True if binary and path.txt exist and are valid.
 */
function isElectronInstalled(electronPackageDirectory, relativeExecutablePath) {
  const pathRecordFile = path.join(electronPackageDirectory, "path.txt");
  const binaryExecutableFile = path.join(
    electronPackageDirectory,
    "dist",
    relativeExecutablePath
  );

  if (!fs.existsSync(pathRecordFile) || !fs.existsSync(binaryExecutableFile)) {
    return false;
  }

  try {
    const recordedPath = fs.readFileSync(pathRecordFile, "utf-8").trim();
    return (
      recordedPath === relativeExecutablePath &&
      fs.statSync(binaryExecutableFile).size > 0
    );
  } catch {
    return false;
  }
}

/**
 * Attempts extraction using 7-Zip binary if available.
 * @param {string} archiveFilePath Path to the downloaded zip archive.
 * @param {string} targetDirectory Destination extraction directory.
 * @returns {boolean} True if extraction succeeded.
 */
function extractWith7Zip(archiveFilePath, targetDirectory) {
  try {
    const { path7za } = require("7zip-bin");
    if (!path7za || !fs.existsSync(path7za)) {
      return false;
    }

    const executionResult = spawnSync(
      path7za,
      ["x", "-y", `-o${targetDirectory}`, archiveFilePath],
      { stdio: "pipe" }
    );

    return executionResult.status === 0;
  } catch {
    return false;
  }
}

/**
 * Attempts extraction using system tar command.
 * @param {string} archiveFilePath Path to the downloaded zip archive.
 * @param {string} targetDirectory Destination extraction directory.
 * @returns {boolean} True if extraction succeeded.
 */
function extractWithTar(archiveFilePath, targetDirectory) {
  try {
    const executionResult = spawnSync(
      "tar",
      ["-xf", archiveFilePath, "-C", targetDirectory],
      { stdio: "pipe" }
    );

    return executionResult.status === 0;
  } catch {
    return false;
  }
}

/**
 * Attempts extraction using PowerShell Expand-Archive on Windows.
 * @param {string} archiveFilePath Path to the downloaded zip archive.
 * @param {string} targetDirectory Destination extraction directory.
 * @returns {boolean} True if extraction succeeded.
 */
function extractWithPowerShell(archiveFilePath, targetDirectory) {
  if (process.platform !== "win32") {
    return false;
  }

  try {
    const executionResult = spawnSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        `Expand-Archive -LiteralPath "${archiveFilePath}" -DestinationPath "${targetDirectory}" -Force`,
      ],
      { stdio: "pipe" }
    );

    return executionResult.status === 0;
  } catch {
    return false;
  }
}

/**
 * Attempts extraction using system unzip command on Unix-like environments.
 * @param {string} archiveFilePath Path to the downloaded zip archive.
 * @param {string} targetDirectory Destination extraction directory.
 * @returns {boolean} True if extraction succeeded.
 */
function extractWithUnzip(archiveFilePath, targetDirectory) {
  try {
    const executionResult = spawnSync(
      "unzip",
      ["-q", "-o", archiveFilePath, "-d", targetDirectory],
      { stdio: "pipe" }
    );

    return executionResult.status === 0;
  } catch {
    return false;
  }
}

/**
 * Extracts the zip archive to the target destination using available fallback tools.
 * @param {string} archiveFilePath Path to the zip file.
 * @param {string} targetDirectory Destination directory.
 * @returns {void}
 */
function extractArchive(archiveFilePath, targetDirectory) {
  fs.rmSync(targetDirectory, { recursive: true, force: true });
  fs.mkdirSync(targetDirectory, { recursive: true });

  const extractionStrategies = [
    { name: "7zip-bin", run: extractWith7Zip },
    { name: "system-tar", run: extractWithTar },
    { name: "powershell", run: extractWithPowerShell },
    { name: "system-unzip", run: extractWithUnzip },
  ];

  for (const strategy of extractionStrategies) {
    const success = strategy.run(archiveFilePath, targetDirectory);
    if (success) {
      console.log(`[postinstall] Successfully extracted Electron using ${strategy.name}`);
      return;
    }
  }

  throw new Error("Failed to extract Electron binary using any available extraction strategy.");
}

/**
 * Main execution orchestration for ensuring Electron binary presence.
 * @returns {Promise<void>}
 */
async function main() {
  const projectRootDirectory = path.resolve(__dirname, "..");
  const electronPackageDirectory = path.join(
    projectRootDirectory,
    "node_modules",
    "electron"
  );

  if (!fs.existsSync(electronPackageDirectory)) {
    console.log("[postinstall] Electron package not found in node_modules, skipping.");
    return;
  }

  const electronPackageJsonPath = path.join(
    electronPackageDirectory,
    "package.json"
  );
  if (!fs.existsSync(electronPackageJsonPath)) {
    console.log("[postinstall] Electron package.json missing, skipping.");
    return;
  }

  const electronPackageConfig = JSON.parse(
    fs.readFileSync(electronPackageJsonPath, "utf-8")
  );
  const electronVersion = electronPackageConfig.version;
  const targetPlatform = process.env.npm_config_platform || process.platform;
  const targetArchitecture = process.env.npm_config_arch || process.arch;
  const relativeExecutable = getPlatformExecutablePath(targetPlatform);

  if (isElectronInstalled(electronPackageDirectory, relativeExecutable)) {
    console.log("[postinstall] Electron binary is already verified and ready.");
    return;
  }

  console.log(`[postinstall] Ensuring Electron v${electronVersion} binary is installed for ${targetPlatform}-${targetArchitecture}...`);

  const downloadedZipPath = await downloadArtifact({
    version: electronVersion,
    artifactName: "electron",
    platform: targetPlatform,
    arch: targetArchitecture,
  });

  const distDestinationDirectory = path.join(
    electronPackageDirectory,
    "dist"
  );

  extractArchive(downloadedZipPath, distDestinationDirectory);

  const destinationExecutablePath = path.join(
    distDestinationDirectory,
    relativeExecutable
  );
  if (!fs.existsSync(destinationExecutablePath)) {
    throw new Error(
      `Electron executable was not found at expected location: ${destinationExecutablePath}`
    );
  }

  const pathRecordFile = path.join(electronPackageDirectory, "path.txt");
  fs.writeFileSync(pathRecordFile, relativeExecutable, "utf-8");

  console.log("[postinstall] Electron binary setup complete.");
}

main().catch((error) => {
  console.error("[postinstall] Error ensuring Electron binary:", error);
  process.exit(1);
});
