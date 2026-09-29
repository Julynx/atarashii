/**
 * @module editor-toc-test
 * Unit and integration tests verifying Markdown heading extraction, TOC UI dialog, tab visibility, and navigation.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");

describe("Markdown Heading Extraction", () => {
  it("extracts H1 to H6 headings and strips leading and trailing hash marks", async () => {
    const { extractMarkdownHeadings } = await import(
      "../src/renderer/scripts/editor-toc.js"
    );

    const sampleMarkdown = [
      "# First Level Header",
      "Some introductory text.",
      "## Second Level Header ##",
      "More text.",
      "### Third Level Header ###",
      "#### Fourth Level ####",
      "##### Fifth Level #####",
      "###### Sixth Level ######",
    ].join("\n");

    const headings = extractMarkdownHeadings(sampleMarkdown);

    assert.equal(headings.length, 6);
    assert.deepEqual(headings[0], {
      level: 1,
      title: "First Level Header",
      lineIndex: 0,
      lineNumber: 1,
      charIndex: 0,
    });
    assert.equal(headings[1].level, 2);
    assert.equal(headings[1].title, "Second Level Header");
    assert.equal(headings[2].level, 3);
    assert.equal(headings[2].title, "Third Level Header");
    assert.equal(headings[3].level, 4);
    assert.equal(headings[3].title, "Fourth Level");
    assert.equal(headings[4].level, 5);
    assert.equal(headings[4].title, "Fifth Level");
    assert.equal(headings[5].level, 6);
    assert.equal(headings[5].title, "Sixth Level");
  });

  it("avoids extracting headers inside fenced code blocks using backticks and tildes", async () => {
    const { extractMarkdownHeadings } = await import(
      "../src/renderer/scripts/editor-toc.js"
    );

    const sampleMarkdown = [
      "# Real Header 1",
      "```python",
      "# Ignored Python comment",
      "## Ignored sub comment",
      "```",
      "## Real Header 2",
      "~~~bash",
      "### Ignored Bash comment",
      "~~~",
      "### Real Header 3",
    ].join("\n");

    const headings = extractMarkdownHeadings(sampleMarkdown);

    assert.equal(headings.length, 3);
    assert.equal(headings[0].title, "Real Header 1");
    assert.equal(headings[1].title, "Real Header 2");
    assert.equal(headings[2].title, "Real Header 3");
  });

  it("avoids extracting headers inside inline code and multiline inline code", async () => {
    const { extractMarkdownHeadings } = await import(
      "../src/renderer/scripts/editor-toc.js"
    );

    const sampleMarkdown = [
      "# Visible Header",
      "`# Ignored inline code`",
      "`",
      "# Ignored multiline inline code",
      "`",
      "## Another Visible Header",
    ].join("\n");

    const headings = extractMarkdownHeadings(sampleMarkdown);

    assert.equal(headings.length, 2);
    assert.equal(headings[0].title, "Visible Header");
    assert.equal(headings[1].title, "Another Visible Header");
  });

  it("avoids extracting 4-space indented code blocks and HTML code blocks", async () => {
    const { extractMarkdownHeadings } = await import(
      "../src/renderer/scripts/editor-toc.js"
    );

    const sampleMarkdown = [
      "# Real Header",
      "    # Ignored indented code block",
      "\t# Ignored tab-indented code block",
      "<pre>",
      "# Ignored inside pre",
      "</pre>",
      "<code>",
      "# Ignored inside code",
      "</code>",
      "## Second Real Header",
    ].join("\n");

    const headings = extractMarkdownHeadings(sampleMarkdown);

    assert.equal(headings.length, 2);
    assert.equal(headings[0].title, "Real Header");
    assert.equal(headings[1].title, "Second Real Header");
  });

  it("returns an empty array when document contains no valid headers", async () => {
    const { extractMarkdownHeadings } = await import(
      "../src/renderer/scripts/editor-toc.js"
    );

    const sampleMarkdown = "Just some text without any headings.";
    const headings = extractMarkdownHeadings(sampleMarkdown);

    assert.equal(headings.length, 0);
  });
});

describe("TOC Menu Electron Integration", () => {
  it("verifies TOC button positioning, popup toggling, tab visibility, and mutual closing with search", async () => {
    const testRunnerScript = path.join(
      os.tmpdir(),
      `atarashii-toc-test-${Date.now()}.js`,
    );

    const scriptContent = `
      const { app, BrowserWindow } = require("electron");
      const path = require("path");
      const fs = require("fs");

      app.whenReady().then(async () => {
        process.on("uncaughtException", (err) => {
          console.error("Uncaught exception in test runner:", err);
          app.exit(1);
        });

        const win = new BrowserWindow({
          width: 1180,
          height: 780,
          show: false,
          webPreferences: {
            preload: path.join("${path.join(__dirname, "..", "src", "preload", "preload.js").replace(/\\/g, "\\\\")}"),
            contextIsolation: true,
            nodeIntegration: false,
          },
        });

        const { registerIpcHandlers } = require("${path.join(__dirname, "..", "src", "main", "ipc-handlers.js").replace(/\\/g, "\\\\")}");
        const dummyLogger = { info() {}, warn() {}, error() {} };
        const dummyConsent = { hasConsent: () => true, grantConsent() {}, clearConsent() {} };
        const dummyConverter = { startLiveConversion: async () => {}, stopLiveConversion: async () => {} };
        registerIpcHandlers(win, dummyLogger, dummyConsent, dummyConverter);

        const tempDir = fs.mkdtempSync(path.join(app.getPath("temp"), "test-toc-run-"));
        app.setPath("userData", path.join(tempDir, "user-data"));

        win.webContents.on("console-message", (event) => {
          console.log("[Renderer]", event.message);
        });

        win.loadFile(path.join("${path.join(__dirname, "..", "src", "renderer", "index.html").replace(/\\/g, "\\\\")}"));

        win.webContents.on("did-finish-load", async () => {
          try {
            const testResult = await win.webContents.executeJavaScript(\`
              (async () => {
                const { createScreenManager } = await import("./scripts/screen-manager.js");
                const screenManagerInstance = createScreenManager();
                screenManagerInstance.show("screen-main", "Test TOC Project");
                await new Promise((resolve) => setTimeout(resolve, 200));

                const textEditorInstance = window.__atarashiiEditor;

                const sampleMarkdown = "# Introduction\\\\nSome intro text.\\\\n## Getting Started\\\\nGuide details.\\\\n### Installation\\\\nSteps to install.\\\\n~~~bash\\\\n# Ignored Comment in Code\\\\n~~~\\\\n## Configuration\\\\nSettings info.";

                const sampleCss = "body { margin: 0; }";

                textEditorInstance.setProject(
                  {
                    projectPath: "\${tempDir.replace(/\\\\/g, "\\\\\\\\")}",
                    markdownFileName: "document.md",
                    cssFileName: "style.css",
                    assetsPath: "\${path.join(tempDir, "assets").replace(/\\\\/g, "\\\\\\\\")}",
                  },
                  {
                    markdownContent: sampleMarkdown,
                    cssContent: sampleCss,
                  }
                );

                const tocToggleButton = document.getElementById("editor-toc-toggle-button");
                const searchToggleButton = document.getElementById("editor-search-toggle-button");
                const tocDialog = document.getElementById("editor-toc-dialog");
                const searchDialog = document.getElementById("editor-search-dialog");
                const tocList = document.getElementById("editor-toc-list");

                const tocRect = tocToggleButton.getBoundingClientRect();
                const searchRect = searchToggleButton.getBoundingClientRect();
                const isTocButtonLeftOfSearch = tocRect.right <= searchRect.left;

                const initialTocHidden = tocDialog.hidden;

                tocToggleButton.click();
                const isTocOpenedAfterClick = !tocDialog.hidden;
                const isTocButtonActive = tocToggleButton.classList.contains("active");

                const renderedItems = tocList.querySelectorAll(".toc-item");
                const itemsCount = renderedItems.length;

                const firstItemText = renderedItems[0] ? renderedItems[0].textContent.trim() : "";
                const firstItemHasLevel1 = renderedItems[0] ? renderedItems[0].classList.contains("toc-level-1") : false;
                const thirdItemHasLevel3 = renderedItems[2] ? renderedItems[2].classList.contains("toc-level-3") : false;

                searchToggleButton.click();
                const isSearchOpened = !searchDialog.hidden;
                const isTocClosedAfterSearchOpen = tocDialog.hidden;

                tocToggleButton.click();
                const isTocReopened = !tocDialog.hidden;
                const isSearchClosedAfterTocOpen = searchDialog.hidden;

                if (renderedItems[1]) {
                  renderedItems[1].click();
                }
                const isTocClosedAfterItemClick = tocDialog.hidden;

                const cssTabButton = document.getElementById("tab-document-css");
                cssTabButton.click();
                await new Promise((resolve) => setTimeout(resolve, 100));

                const isTocHiddenInCssTab = tocToggleButton.hidden;

                const markdownTabButton = document.getElementById("tab-document-markdown");
                markdownTabButton.click();
                await new Promise((resolve) => setTimeout(resolve, 100));

                const isTocVisibleInMarkdownTab = !tocToggleButton.hidden;

                return {
                  ok: true,
                  isTocButtonLeftOfSearch,
                  initialTocHidden,
                  isTocOpenedAfterClick,
                  isTocButtonActive,
                  itemsCount,
                  firstItemText,
                  firstItemHasLevel1,
                  thirdItemHasLevel3,
                  isSearchOpened,
                  isTocClosedAfterSearchOpen,
                  isTocReopened,
                  isSearchClosedAfterTocOpen,
                  isTocClosedAfterItemClick,
                  isTocHiddenInCssTab,
                  isTocVisibleInMarkdownTab,
                };
              })();
            \`);

            console.log(JSON.stringify(testResult));
            app.quit();
          } catch (evalError) {
            console.error("Test evaluation error:", evalError);
            app.exit(1);
          }
        });
      });
    `;

    fs.writeFileSync(testRunnerScript, scriptContent, "utf8");

    const electronBinaryPath = require("electron");
    const childProcess = spawn(
      electronBinaryPath,
      [testRunnerScript, "--no-sandbox"],
      {
        env: {
          ...process.env,
          ELECTRON_ENABLE_LOGGING: "true",
        },
      },
    );

    let stdoutData = "";
    let stderrData = "";

    childProcess.stdout.on("data", (chunk) => {
      stdoutData += chunk.toString();
    });

    childProcess.stderr.on("data", (chunk) => {
      stderrData += chunk.toString();
    });

    const exitCode = await new Promise((resolve) => {
      childProcess.on("close", resolve);
    });

    try {
      fs.unlinkSync(testRunnerScript);
    } catch {
      // Ignore cleanup error
    }

    assert.equal(exitCode, 0, `Electron process failed with stderr: ${stderrData} stdout: ${stdoutData}`);

    const resultMatch = stdoutData.match(/\{"ok":true[^\r\n]*\}/);
    assert.ok(resultMatch, `No JSON output in stdout: ${stdoutData}`);

    const result = JSON.parse(resultMatch[0]);

    assert.equal(result.ok, true);
    assert.equal(result.isTocButtonLeftOfSearch, true);
    assert.equal(result.initialTocHidden, true);
    assert.equal(result.isTocOpenedAfterClick, true);
    assert.equal(result.isTocButtonActive, true);
    assert.equal(result.itemsCount, 4);
    assert.equal(result.firstItemText, "Introduction");
    assert.equal(result.firstItemHasLevel1, true);
    assert.equal(result.thirdItemHasLevel3, true);
    assert.equal(result.isSearchOpened, true);
    assert.equal(result.isTocClosedAfterSearchOpen, true);
    assert.equal(result.isTocReopened, true);
    assert.equal(result.isSearchClosedAfterTocOpen, true);
    assert.equal(result.isTocClosedAfterItemClick, true);
    assert.equal(result.isTocHiddenInCssTab, true);
    assert.equal(result.isTocVisibleInMarkdownTab, true);
  });
});
