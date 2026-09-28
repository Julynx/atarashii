/**
 * @module editor-syntax-test
 * End-to-end integration tests verifying Prism tokenization, backdrop layering, language switching, and editor event integration.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");

describe("Editor Syntax Highlighting Integration", () => {
  it("verifies Prism tokenization, backdrop layering, and editor event integration", async () => {
    const testRunnerScript = path.join(
      os.tmpdir(),
      `atarashii-syntax-test-${Date.now()}.js`,
    );
    const scriptContent = `
      const { app, BrowserWindow, protocol } = require("electron");
      const path = require("path");
      const fs = require("fs");

      app.whenReady()
        .then(async () => {
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

        const { registerIpcHandlers, createEditorContextMenu } = require("${path.join(__dirname, "..", "src", "main", "ipc-handlers.js").replace(/\\/g, "\\\\")}");
        const dummyLogger = { info() {}, warn() {}, error() {} };
        const dummyConsent = { hasConsent: () => true, grantConsent() {}, clearConsent() {} };
        const dummyConverter = { startLiveConversion: async () => {}, stopLiveConversion: async () => {} };
        registerIpcHandlers(win, dummyLogger, dummyConsent, dummyConverter);

        const tempDir = fs.mkdtempSync(path.join(app.getPath("temp"), "test-syntax-run-"));
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
                screenManagerInstance.show("screen-main", "Test Syntax Project");
                await new Promise((resolve) => setTimeout(resolve, 200));

                const textEditorInstance = window.__atarashiiEditor;
                const prism = window.Prism;

                const hasPrismManual = !!(prism && prism.manual === true);
                const hasMarkdownGrammar = !!(prism && prism.languages && prism.languages.markdown);
                const hasCssGrammar = !!(prism && prism.languages && prism.languages.css);

                const syntaxBackdrop = document.getElementById("editor-syntax-backdrop");
                const searchBackdrop = document.getElementById("editor-search-backdrop");
                const textarea = document.getElementById("editor-textarea");
                const hasSyntaxBackdropElement = !!syntaxBackdrop;

                const tick = String.fromCharCode(96);
                const fence = tick.repeat(3);
                const sampleMarkdown = [
                  "# Main Heading",
                  "",
                  "Some *italic* and **bold** with " + tick + "inline code" + tick + ".",
                  "",
                  fence + "css",
                  "body { color: white; }",
                  fence,
                  "",
                  "Escaped <div> tag.",
                  "",
                ].join("\\\\n");

                textEditorInstance.setProject(
                  {
                    projectPath: "\${tempDir.replace(/\\\\/g, "\\\\\\\\")}",
                    markdownFileName: "document.md",
                    cssFileName: "style.css",
                    assetsPath: "\${path.join(tempDir, "assets").replace(/\\\\/g, "\\\\\\\\")}",
                  },
                  {
                    markdownContent: sampleMarkdown,
                    cssContent: "body { color: white; }",
                  }
                );

                const hasTitleToken = !!syntaxBackdrop.querySelector(".token.title");
                const hasBoldToken = !!syntaxBackdrop.querySelector(".token.bold");
                const hasItalicToken = !!syntaxBackdrop.querySelector(".token.italic");
                const hasInlineCodeToken = !!syntaxBackdrop.querySelector(".token.code-snippet, .token.code");
                const hasNestedCssTokens = !!syntaxBackdrop.querySelector(".token.property");

                const isAngleBracketEscaped =
                  syntaxBackdrop.querySelectorAll("div").length === 0 &&
                  syntaxBackdrop.textContent.includes("Escaped <div> tag.");
                const hasTrailingBreak = syntaxBackdrop.innerHTML.endsWith("<br>");

                const textareaComputedColor = window.getComputedStyle(textarea).color;
                const textareaCaretColor = window.getComputedStyle(textarea).caretColor;
                const isTextareaTextTransparent = textareaComputedColor === "rgba(0, 0, 0, 0)";
                const isCaretColorVisible =
                  textareaCaretColor !== "rgba(0, 0, 0, 0)" && textareaCaretColor !== "transparent";

                const searchBackdropZ = parseInt(window.getComputedStyle(searchBackdrop).zIndex, 10);
                const syntaxBackdropZ = parseInt(window.getComputedStyle(syntaxBackdrop).zIndex, 10);
                const textareaZ = parseInt(window.getComputedStyle(textarea).zIndex, 10);
                const isLayerOrderValid = searchBackdropZ < syntaxBackdropZ && syntaxBackdropZ < textareaZ;
                const hasPointerEventsNone =
                  window.getComputedStyle(syntaxBackdrop).pointerEvents === "none";

                textarea.value = "# Replaced Heading";
                textarea.dispatchEvent(new Event("input"));
                const isDebounceDeferring =
                  !syntaxBackdrop.textContent.includes("Replaced Heading");
                await new Promise((resolve) => setTimeout(resolve, 180));
                const isDebouncedRenderApplied = syntaxBackdrop.textContent.includes("Replaced Heading");

                const cssTabButton = document.getElementById("tab-document-css");
                cssTabButton.click();
                while (!cssTabButton.classList.contains("active-tab")) {
                  await new Promise((resolve) => setTimeout(resolve, 50));
                }
                textarea.value = "body { color: white; padding: 0; }";
                textarea.dispatchEvent(new Event("input"));
                await new Promise((resolve) => setTimeout(resolve, 180));
                const hasCssSelectorToken = !!syntaxBackdrop.querySelector(".token.selector");
                const hasCssPropertyToken = !!syntaxBackdrop.querySelector(".token.property");

                const lineWrapItem = document.getElementById("editor-toggle-linewrap");
                lineWrapItem.click();
                const syntaxNoWrapToggledOn = syntaxBackdrop.classList.contains("no-wrap");
                lineWrapItem.click();
                const syntaxNoWrapToggledOff = !syntaxBackdrop.classList.contains("no-wrap");

                const searchToggle = document.getElementById("editor-search-toggle-button");
                searchToggle.click();
                const searchInput = document.getElementById("editor-search-input");
                searchInput.value = "color";
                searchInput.dispatchEvent(new Event("input"));
                const searchMarksRendered = searchBackdrop.querySelectorAll(".search-highlight").length;
                const syntaxTokensCoexistWithSearch = !!syntaxBackdrop.querySelector(".token.selector");
                document.getElementById("editor-search-close-button").click();

                const longContent = Array.from({ length: 200 }, (_, index) => {
                  return "line " + index;
                }).join("\\\\n");
                textarea.value = longContent;
                textarea.dispatchEvent(new Event("input"));
                await new Promise((resolve) => setTimeout(resolve, 180));
                textarea.scrollTop = 120;
                textarea.dispatchEvent(new Event("scroll"));
                const isScrollSynced = syntaxBackdrop.scrollTop === textarea.scrollTop;

                textarea.value = longContent + "\\\\n/* appended comment */";
                textarea.dispatchEvent(new Event("input"));
                await new Promise((resolve) => setTimeout(resolve, 180));
                const isAppendedRendered =
                  syntaxBackdrop.textContent.includes("appended comment");

                document.getElementById("editor-menu-undo").click();
                const isUndoRevertingTokens =
                  !syntaxBackdrop.textContent.includes("appended comment");

                return {
                  ok: true,
                  hasPrismManual,
                  hasMarkdownGrammar,
                  hasCssGrammar,
                  hasSyntaxBackdropElement,
                  hasTitleToken,
                  hasBoldToken,
                  hasItalicToken,
                  hasInlineCodeToken,
                  hasNestedCssTokens,
                  isAngleBracketEscaped,
                  hasTrailingBreak,
                  isTextareaTextTransparent,
                  isCaretColorVisible,
                  isLayerOrderValid,
                  hasPointerEventsNone,
                  isDebounceDeferring,
                  isDebouncedRenderApplied,
                  hasCssSelectorToken,
                  hasCssPropertyToken,
                  syntaxNoWrapToggledOn,
                  syntaxNoWrapToggledOff,
                  searchMarksRendered,
                  syntaxTokensCoexistWithSearch,
                  isScrollSynced,
                  isAppendedRendered,
                  isUndoRevertingTokens,
                };
              })()
            \`);

            console.log(JSON.stringify(testResult));
            const allPassed =
              testResult.ok &&
              testResult.hasPrismManual &&
              testResult.hasMarkdownGrammar &&
              testResult.hasCssGrammar &&
              testResult.hasSyntaxBackdropElement &&
              testResult.hasTitleToken &&
              testResult.hasBoldToken &&
              testResult.hasItalicToken &&
              testResult.hasInlineCodeToken &&
              testResult.hasNestedCssTokens &&
              testResult.isAngleBracketEscaped &&
              testResult.hasTrailingBreak &&
              testResult.isTextareaTextTransparent &&
              testResult.isCaretColorVisible &&
              testResult.isLayerOrderValid &&
              testResult.hasPointerEventsNone &&
              testResult.isDebounceDeferring &&
              testResult.isDebouncedRenderApplied &&
              testResult.hasCssSelectorToken &&
              testResult.hasCssPropertyToken &&
              testResult.syntaxNoWrapToggledOn &&
              testResult.syntaxNoWrapToggledOff &&
              testResult.searchMarksRendered === 1 &&
              testResult.syntaxTokensCoexistWithSearch &&
              testResult.isScrollSynced &&
              testResult.isAppendedRendered &&
              testResult.isUndoRevertingTokens;

            fs.rmSync(tempDir, { recursive: true, force: true });
            app.exit(allPassed ? 0 : 1);
          } catch (err) {
            console.error(err);
            app.exit(1);
          }
        });
        })
        .catch((setupError) => {
          console.error(setupError);
          app.exit(1);
        });
    `;

    fs.writeFileSync(testRunnerScript, scriptContent, "utf8");

    const electronExecutable = require("electron");

    await new Promise((resolve, reject) => {
      const child = spawn(electronExecutable, [testRunnerScript], {
        windowsHide: true,
      });

      let stdout = "";
      let stderr = "";

      child.stdout.on("data", (chunk) => {
        const text = chunk.toString("utf8");
        stdout += text;
        process.stdout.write(text);
      });

      child.stderr.on("data", (chunk) => {
        const text = chunk.toString("utf8");
        stderr += text;
        process.stderr.write(text);
      });

      child.on("close", (exitCode) => {
        try {
          fs.rmSync(testRunnerScript, { force: true });
        } catch {}

        if (exitCode === 0) {
          const match = stdout.match(/\{.*"ok":true.*\}/);
          assert.ok(match, "Output must contain successful test result");
          const parsed = JSON.parse(match[0]);

          assert.ok(parsed.hasPrismManual, "Prism must be vendored in manual mode");
          assert.ok(
            parsed.hasMarkdownGrammar,
            "Prism must register the markdown grammar",
          );
          assert.ok(parsed.hasCssGrammar, "Prism must register the css grammar");
          assert.ok(
            parsed.hasSyntaxBackdropElement,
            "Syntax backdrop element must exist in the editor markup",
          );
          assert.ok(
            parsed.hasTitleToken,
            "Markdown headings must be tokenized as title tokens",
          );
          assert.ok(parsed.hasBoldToken, "Markdown bold spans must be tokenized");
          assert.ok(
            parsed.hasItalicToken,
            "Markdown italic spans must be tokenized",
          );
          assert.ok(
            parsed.hasInlineCodeToken,
            "Markdown inline code must be tokenized",
          );
          assert.ok(
            parsed.hasNestedCssTokens,
            "CSS inside fenced code blocks must be tokenized",
          );
          assert.ok(
            parsed.isAngleBracketEscaped,
            "Backdrop content must be HTML-escaped",
          );
          assert.ok(
            parsed.hasTrailingBreak,
            "Trailing newline must be mirrored with a line break",
          );
          assert.ok(
            parsed.isTextareaTextTransparent,
            "Textarea text must be transparent so token colors show through",
          );
          assert.ok(
            parsed.isCaretColorVisible,
            "Textarea caret must remain visible with transparent text",
          );
          assert.ok(
            parsed.isLayerOrderValid,
            "Layering must be search backdrop below syntax backdrop below textarea",
          );
          assert.ok(
            parsed.hasPointerEventsNone,
            "Syntax backdrop must not intercept pointer events",
          );
          assert.ok(
            parsed.isDebounceDeferring,
            "Input rendering must be debounced",
          );
          assert.ok(
            parsed.isDebouncedRenderApplied,
            "Debounced render must apply after typing stops",
          );
          assert.ok(
            parsed.hasCssSelectorToken,
            "CSS tab must tokenize selectors",
          );
          assert.ok(
            parsed.hasCssPropertyToken,
            "CSS tab must tokenize properties",
          );
          assert.ok(
            parsed.syntaxNoWrapToggledOn,
            "Line wrap toggle must apply no-wrap class to syntax backdrop",
          );
          assert.ok(
            parsed.syntaxNoWrapToggledOff,
            "Line wrap toggle must restore wrapping on syntax backdrop",
          );
          assert.equal(
            parsed.searchMarksRendered,
            1,
            "Search marks must still render with syntax highlighting active",
          );
          assert.ok(
            parsed.syntaxTokensCoexistWithSearch,
            "Syntax tokens must coexist with search marks",
          );
          assert.ok(
            parsed.isScrollSynced,
            "Syntax backdrop scroll offsets must follow the textarea",
          );
          assert.ok(
            parsed.isAppendedRendered,
            "Appended content must be tokenized after the debounce window",
          );
          assert.ok(
            parsed.isUndoRevertingTokens,
            "Undo must re-render the syntax backdrop",
          );
          resolve();
        } else {
          reject(
            new Error(
              `Test failed with exit code ${exitCode}\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`,
            ),
          );
        }
      });
    });
  });
});
