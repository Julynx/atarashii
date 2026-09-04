/**
 * @module project-service
 * Project initialization, validation, filesystem synchronization, and document management.
 */

const fs = require("fs");
const path = require("path");
const { app } = require("electron");

/**
 * Returns the default parent directory for Atarashii project folders.
 * @returns {string} Default parent directory path.
 */
function getDefaultParentDirectory() {
  const documentsDirectory = app.getPath("documents");
  return path.join(documentsDirectory, "Atarashii");
}

/**
 * Computes the next non-colliding project name in the target parent directory.
 * @param {string} parentDirectory - Target container folder.
 * @returns {string} First available folder name.
 */
function getNextAvailableProjectName(parentDirectory) {
  const baseName = "New project";
  if (!fs.existsSync(parentDirectory)) {
    return baseName;
  }

  const initialCandidatePath = path.join(parentDirectory, baseName);
  if (!fs.existsSync(initialCandidatePath)) {
    return baseName;
  }

  let suffixIndex = 1;
  while (true) {
    const candidateName = `${baseName}_${suffixIndex}`;
    const candidatePath = path.join(parentDirectory, candidateName);
    if (!fs.existsSync(candidatePath)) {
      return candidateName;
    }
    suffixIndex += 1;
  }
}

/**
 * Creates a new project structure with required empty files and directories.
 * @param {string} parentDirectory - Target container folder.
 * @param {string} projectName - Folder name for the new project.
 * @param {{info: Function}} logger - Logging service.
 * @returns {{projectPath: string, projectName: string, markdownFileName: string, cssFileName: string, pdfFileName: string, assetsPath: string}} Project metadata.
 */
function createProject(parentDirectory, projectName, logger) {
  const sanitizedProjectName = projectName.trim();
  if (!sanitizedProjectName) {
    throw new Error("Project name cannot be empty.");
  }

  if (!fs.existsSync(parentDirectory)) {
    fs.mkdirSync(parentDirectory, { recursive: true });
  }

  const projectPath = path.join(parentDirectory, sanitizedProjectName);
  if (fs.existsSync(projectPath)) {
    throw new Error(`A folder named "${sanitizedProjectName}" already exists in the selected directory.`);
  }

  fs.mkdirSync(projectPath, { recursive: true });

  const markdownFilePath = path.join(projectPath, "document.md");
  const cssFilePath = path.join(projectPath, "style.css");
  const assetsDirectoryPath = path.join(projectPath, "assets");

  fs.writeFileSync(markdownFilePath, "", "utf8");
  fs.writeFileSync(cssFilePath, "", "utf8");
  fs.mkdirSync(assetsDirectoryPath, { recursive: true });

  logger.info(`Created new project at: ${projectPath}`);

  return {
    projectPath,
    projectName: sanitizedProjectName,
    markdownFileName: "document.md",
    cssFileName: "style.css",
    pdfFileName: "document.pdf",
    pdfFilePath: path.join(projectPath, "document.pdf"),
    assetsPath: assetsDirectoryPath,
  };
}

/**
 * Validates an existing directory and opens it as an Atarashii project.
 * @param {string} selectedFolderPath - Target folder path to open.
 * @param {{info: Function}} logger - Logging service.
 * @returns {{projectPath: string, projectName: string, markdownFileName: string, cssFileName: string, pdfFileName: string, assetsPath: string}} Project metadata.
 */
function validateAndOpenProject(selectedFolderPath, logger) {
  if (!fs.existsSync(selectedFolderPath)) {
    throw new Error("The specified folder does not exist.");
  }

  const folderEntries = fs.readdirSync(selectedFolderPath, { withFileTypes: true });
  const markdownFiles = folderEntries.filter(
    (entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".md")
  );

  if (markdownFiles.length === 0) {
    throw new Error("The project folder contains no markdown files.");
  }

  if (markdownFiles.length > 1) {
    throw new Error(
      "Atarashii only supports one markdown document per project. To edit multiple markdown files, please create a project folder for each of them."
    );
  }

  const detectedMarkdownFile = markdownFiles[0].name;
  const standardCssPath = path.join(selectedFolderPath, "style.css");
  const standardAssetsPath = path.join(selectedFolderPath, "assets");

  if (!fs.existsSync(standardCssPath)) {
    fs.writeFileSync(standardCssPath, "", "utf8");
  }

  if (!fs.existsSync(standardAssetsPath)) {
    fs.mkdirSync(standardAssetsPath, { recursive: true });
  }

  const folderBaseName = path.basename(selectedFolderPath);
  logger.info(`Opened project: ${folderBaseName} at ${selectedFolderPath}`);

  return {
    projectPath: selectedFolderPath,
    projectName: folderBaseName,
    markdownFileName: detectedMarkdownFile,
    cssFileName: "style.css",
    pdfFileName: "document.pdf",
    pdfFilePath: path.join(selectedFolderPath, "document.pdf"),
    assetsPath: standardAssetsPath,
  };
}

/**
 * Reads source files for the active project.
 * @param {string} projectPath - Project directory path.
 * @param {string} markdownFileName - Name of the markdown document.
 * @param {string} cssFileName - Name of the CSS document.
 * @returns {{markdownContent: string, cssContent: string, conversionLogContent: string, pdfFileExists: boolean}} File contents.
 */
function readProjectDocuments(projectPath, markdownFileName, cssFileName) {
  const markdownFilePath = path.join(projectPath, markdownFileName);
  const cssFilePath = path.join(projectPath, cssFileName);
  const conversionLogFilePath = path.join(projectPath, "conversion.log");
  const pdfFilePath = path.join(projectPath, "document.pdf");

  const markdownContent = fs.existsSync(markdownFilePath)
    ? fs.readFileSync(markdownFilePath, "utf8")
    : "";
  const cssContent = fs.existsSync(cssFilePath)
    ? fs.readFileSync(cssFilePath, "utf8")
    : "";
  const conversionLogContent = fs.existsSync(conversionLogFilePath)
    ? fs.readFileSync(conversionLogFilePath, "utf8")
    : "";
  const pdfFileExists = fs.existsSync(pdfFilePath);

  return { markdownContent, cssContent, conversionLogContent, pdfFileExists };
}

/**
 * Saves content to a specific file within the project directory.
 * @param {string} projectPath - Project directory path.
 * @param {string} relativeFileName - Relative file name.
 * @param {string} fileContent - Text content to write.
 * @returns {void}
 */
function writeProjectDocument(projectPath, relativeFileName, fileContent) {
  const targetFilePath = path.join(projectPath, relativeFileName);
  fs.writeFileSync(targetFilePath, fileContent, "utf8");
}

module.exports = {
  getDefaultParentDirectory,
  getNextAvailableProjectName,
  createProject,
  validateAndOpenProject,
  readProjectDocuments,
  writeProjectDocument,
};
