/**
 * @module project-service-test
 * Unit tests verifying project creation, name sequencing, and validation rules.
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const {
  getNextAvailableProjectName,
  createProject,
  validateAndOpenProject,
  readProjectDocuments,
  writeProjectDocument,
} = require("../src/main/project-service");

const dummyLogger = {
  info() {},
  warn() {},
  error() {},
};

describe("Project Service", () => {
  let testRootDirectory = "";

  before(() => {
    testRootDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "atarashii-test-"));
  });

  after(() => {
    if (fs.existsSync(testRootDirectory)) {
      fs.rmSync(testRootDirectory, { recursive: true, force: true });
    }
  });

  it("calculates sequential non-colliding project names", () => {
    const initialName = getNextAvailableProjectName(testRootDirectory);
    assert.equal(initialName, "New project");

    fs.mkdirSync(path.join(testRootDirectory, "New project"));
    const secondName = getNextAvailableProjectName(testRootDirectory);
    assert.equal(secondName, "New project_1");

    fs.mkdirSync(path.join(testRootDirectory, "New project_1"));
    const thirdName = getNextAvailableProjectName(testRootDirectory);
    assert.equal(thirdName, "New project_2");
  });

  it("creates a new project with document.md, style.css and assets directory", () => {
    const projectResult = createProject(testRootDirectory, "Sample Project", dummyLogger);
    assert.equal(projectResult.projectName, "Sample Project");
    assert.ok(fs.existsSync(path.join(projectResult.projectPath, "document.md")));
    assert.ok(fs.existsSync(path.join(projectResult.projectPath, "style.css")));
    assert.ok(fs.existsSync(path.join(projectResult.projectPath, "assets")));
    assert.ok(fs.statSync(path.join(projectResult.projectPath, "assets")).isDirectory());
  });

  it("throws error when opening a folder with no markdown files", () => {
    const emptyFolder = path.join(testRootDirectory, "EmptyFolder");
    fs.mkdirSync(emptyFolder);

    assert.throws(
      () => {
        validateAndOpenProject(emptyFolder, dummyLogger);
      },
      {
        message: "The project folder contains no markdown files.",
      }
    );
  });

  it("throws error when opening a folder with multiple markdown files", () => {
    const multiFolder = path.join(testRootDirectory, "MultiFolder");
    fs.mkdirSync(multiFolder);
    fs.writeFileSync(path.join(multiFolder, "doc1.md"), "# One", "utf8");
    fs.writeFileSync(path.join(multiFolder, "doc2.md"), "# Two", "utf8");

    assert.throws(
      () => {
        validateAndOpenProject(multiFolder, dummyLogger);
      },
      {
        message:
          "Atarashii only supports one markdown document per project. To edit multiple markdown files, please create a project folder for each of them.",
      }
    );
  });

  it("successfully opens a valid project folder and creates missing style.css or assets folder", () => {
    const validFolder = path.join(testRootDirectory, "ValidFolder");
    fs.mkdirSync(validFolder);
    fs.writeFileSync(path.join(validFolder, "notes.md"), "# Hello Notes", "utf8");

    const openResult = validateAndOpenProject(validFolder, dummyLogger);
    assert.equal(openResult.markdownFileName, "notes.md");
    assert.ok(fs.existsSync(path.join(validFolder, "style.css")));
    assert.ok(fs.existsSync(path.join(validFolder, "assets")));

    const documents = readProjectDocuments(validFolder, "notes.md", "style.css");
    assert.equal(documents.markdownContent, "# Hello Notes");
    assert.equal(documents.cssContent, "");

    writeProjectDocument(validFolder, "style.css", "body { color: blue; }");
    const updatedDocuments = readProjectDocuments(validFolder, "notes.md", "style.css");
    assert.equal(updatedDocuments.cssContent, "body { color: blue; }");
  });
});
