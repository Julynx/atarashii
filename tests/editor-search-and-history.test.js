/**
 * @module editor-search-and-history-test
 * End-to-end integration tests verifying search dialog controls, coincidence navigation, and undo/redo workflows.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");

describe("Editor Search and History Integration", () => {
  it("verifies search dialog, coincidence navigation, and undo/redo operations", async () => {
    const testRunnerScript = path.join(
      os.tmpdir(),
      `atarashii-search-test-${Date.now()}.js`,
    );
    const scriptContent = `
      const { app, BrowserWindow, protocol } = require("electron");
      const path = require("path");
      const fs = require("fs");

      app.whenReady().then(async () => {
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
        let editorContextMenuIpcCalls = 0;
        const { ipcMain } = require("electron");
        ipcMain.on("show-editor-context-menu", () => {
          editorContextMenuIpcCalls += 1;
        });
        registerIpcHandlers(win, dummyLogger, dummyConsent, dummyConverter);

        const tempDir = fs.mkdtempSync(path.join(app.getPath("temp"), "test-search-run-"));
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
                screenManagerInstance.show("screen-main", "Test Search Project");
                await new Promise((resolve) => setTimeout(resolve, 200));

                const textEditorInstance = window.__atarashiiEditor;

                const sampleMarkdown = "# Section One\\\\n\\\\nHere is a target word.\\\\nAnother TARGET in caps.\\\\nFinal target entry.";
                const sampleCss = "body { margin: 0; color: white; }";

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

                const searchToggleButton = document.getElementById("editor-search-toggle-button");
                const zoomCluster = document.querySelector(".editor-control-cluster");
                const searchButtonRect = searchToggleButton.getBoundingClientRect();
                const zoomClusterRect = zoomCluster.getBoundingClientRect();
                const isSearchButtonLeftOfZoom = searchButtonRect.right <= zoomClusterRect.left;

                const searchDialog = document.getElementById("editor-search-dialog");
                const initialDialogHidden = searchDialog.hidden;

                searchToggleButton.click();
                const dialogOpened = !searchDialog.hidden;

                const contentArea = document.querySelector(".panel-content-area");
                const dialogRect = searchDialog.getBoundingClientRect();
                const contentRect = contentArea.getBoundingClientRect();
                const isPositionedTopRight = dialogRect.top >= contentRect.top && dialogRect.right <= contentRect.right + 20;

                const searchInput = document.getElementById("editor-search-input");
                const clearButton = document.getElementById("editor-search-clear-button");
                const caseButton = document.getElementById("editor-search-case-button");
                const counterLabel = document.getElementById("editor-search-counter");
                const prevButton = document.getElementById("editor-search-prev-button");
                const nextButton = document.getElementById("editor-search-next-button");
                const closeButton = document.getElementById("editor-search-close-button");
                const backdrop = document.getElementById("editor-search-backdrop");
                const textarea = document.getElementById("editor-textarea");

                const searchInputWrapper = document.querySelector(".search-input-wrapper");
                const queryComputedHeight = window.getComputedStyle(searchInputWrapper).height;
                const caseComputedHeight = window.getComputedStyle(caseButton).height;
                const isCaseButtonMatchingQueryHeight = queryComputedHeight === caseComputedHeight && queryComputedHeight === "28px";

                const initialCaseOff = caseButton.getAttribute("aria-pressed") === "false" && !caseButton.classList.contains("active");

                searchInput.value = "target";
                searchInput.dispatchEvent(new Event("input"));

                const counterAtStart = counterLabel.textContent.trim();
                const totalMatchesInitial = backdrop.querySelectorAll(".search-highlight").length;
                const activeMatchesInitial = backdrop.querySelectorAll(".search-highlight.active-highlight").length;
                const inactiveMatchesInitial = backdrop.querySelectorAll(".search-highlight:not(.active-highlight)").length;

                nextButton.click();
                const counterAfterNext = counterLabel.textContent.trim();

                nextButton.click();
                const counterAfterNextTwo = counterLabel.textContent.trim();

                nextButton.click();
                const counterAfterWrapNext = counterLabel.textContent.trim();

                prevButton.click();
                const counterAfterPrev = counterLabel.textContent.trim();

                caseButton.click();
                const isCaseToggledOn = caseButton.getAttribute("aria-pressed") === "true";
                const counterAfterCaseOn = counterLabel.textContent.trim();
                const matchesAfterCaseOn = backdrop.querySelectorAll(".search-highlight").length;

                caseButton.click();
                const counterAfterCaseOff = counterLabel.textContent.trim();

                const isClearButtonVisible = !clearButton.hidden;
                clearButton.click();
                const isInputCleared = searchInput.value === "";
                const counterAfterClear = counterLabel.textContent.trim();
                const matchesAfterClear = backdrop.querySelectorAll(".search-highlight").length;

                closeButton.click();
                const isDialogClosed = searchDialog.hidden;
                const matchesAfterClose = backdrop.querySelectorAll(".search-highlight").length;

                const optionsBtn = document.getElementById("editor-options-menu-button");
                const undoMenuItem = document.getElementById("editor-menu-undo");
                const redoMenuItem = document.getElementById("editor-menu-redo");

                optionsBtn.click();
                const hasUndoMenu = undoMenuItem !== null;
                const hasRedoMenu = redoMenuItem !== null;
                const undoText = undoMenuItem ? undoMenuItem.textContent : "";
                const redoText = redoMenuItem ? redoMenuItem.textContent : "";
                const hasUndoShortcut = undoText.includes("Undo") && undoText.includes("Ctrl+Z");
                const hasRedoShortcut = redoText.includes("Redo") && redoText.includes("Ctrl+Y");

                const originalMarkdownContent = textarea.value;
                textarea.value = originalMarkdownContent + "\\\\nExtra appended line.";
                textarea.dispatchEvent(new Event("input"));

                undoMenuItem.click();
                const contentAfterMenuUndo = textarea.value;
                const isMenuUndoWorking = contentAfterMenuUndo === originalMarkdownContent;

                redoMenuItem.click();
                const contentAfterMenuRedo = textarea.value;
                const isMenuRedoWorking = contentAfterMenuRedo.includes("Extra appended line.");

                textarea.dispatchEvent(new KeyboardEvent("keydown", { key: "z", ctrlKey: true, bubbles: true }));
                const contentAfterKeyUndo = textarea.value;
                const isKeyUndoWorking = contentAfterKeyUndo === originalMarkdownContent;

                textarea.dispatchEvent(new KeyboardEvent("keydown", { key: "y", ctrlKey: true, bubbles: true }));
                const contentAfterKeyRedo = textarea.value;
                const isKeyRedoWorking = contentAfterKeyRedo.includes("Extra appended line.");

                const cssTabButton = document.getElementById("tab-document-css");
                const markdownTabButton = document.getElementById("tab-document-markdown");

                cssTabButton.click();
                while (!cssTabButton.classList.contains("active-tab")) {
                  await new Promise((resolve) => setTimeout(resolve, 50));
                }
                const initialCssContent = textarea.value;
                textarea.value = initialCssContent + "\\\\nh1 { color: blue; }";
                textarea.dispatchEvent(new Event("input"));

                textarea.dispatchEvent(new KeyboardEvent("keydown", { key: "z", ctrlKey: true, bubbles: true }));
                const cssReverted = textarea.value === initialCssContent;

                markdownTabButton.click();
                while (!markdownTabButton.classList.contains("active-tab")) {
                  await new Promise((resolve) => setTimeout(resolve, 50));
                }
                const markdownRetained = textarea.value.includes("Extra appended line.");

                const formatMenuItem = document.getElementById("editor-menu-format");
                const hasFormatMenu = formatMenuItem !== null;
                const formatText = formatMenuItem ? formatMenuItem.textContent : "";
                const hasFormatShortcut = formatText.includes("Format") && formatText.includes("Shift+Alt+F");

                const unformattedMarkdown = "#   Messy Title   \\\\n\\\\nSome unformatted text.   ";
                textarea.value = unformattedMarkdown;
                textarea.dispatchEvent(new Event("input"));

                await textEditorInstance.flushPendingSave();
                const isSavePreservingUnformatted = textarea.value === unformattedMarkdown;

                formatMenuItem.click();
                await new Promise((resolve) => setTimeout(resolve, 500));
                const contentAfterFormat = textarea.value;
                const isFormatWorking = contentAfterFormat.includes("# Messy Title") && !contentAfterFormat.includes("   \\\\n");

                const styleRules = Array.from(document.styleSheets).flatMap((sheet) => {
                  try {
                    return Array.from(sheet.cssRules || []);
                  } catch (_e) {
                    return [];
                  }
                });
                const hasUnifiedScrollbar = styleRules.some((rule) => {
                  return (
                    rule.selectorText &&
                    rule.selectorText.includes(".code-textarea::-webkit-scrollbar")
                  );
                });

                const hasEditorContextMenuFunction = typeof window.atarashiiApi.showEditorContextMenu === "function";

                const leftPanelElement = document.getElementById("left-panel");
                const leftPanelContextEvent = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
                leftPanelElement.dispatchEvent(leftPanelContextEvent);
                const isLeftPanelContextPrevented = leftPanelContextEvent.defaultPrevented;

                const textareaContextEvent = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
                textarea.dispatchEvent(textareaContextEvent);
                const isTextareaContextPrevented = textareaContextEvent.defaultPrevented;

                await new Promise((resolve) => setTimeout(resolve, 80));

                return {
                  ok: true,
                  isSearchButtonLeftOfZoom,
                  initialDialogHidden,
                  dialogOpened,
                  isPositionedTopRight,
                  initialCaseOff,
                  counterAtStart,
                  totalMatchesInitial,
                  activeMatchesInitial,
                  inactiveMatchesInitial,
                  counterAfterNext,
                  counterAfterNextTwo,
                  counterAfterWrapNext,
                  counterAfterPrev,
                  isCaseToggledOn,
                  counterAfterCaseOn,
                  matchesAfterCaseOn,
                  counterAfterCaseOff,
                  isClearButtonVisible,
                  isInputCleared,
                  counterAfterClear,
                  matchesAfterClear,
                  isDialogClosed,
                  matchesAfterClose,
                  queryComputedHeight,
                  caseComputedHeight,
                  isCaseButtonMatchingQueryHeight,
                  hasUndoMenu,
                  hasRedoMenu,
                  hasUndoShortcut,
                  hasRedoShortcut,
                  isMenuUndoWorking,
                  isMenuRedoWorking,
                  isKeyUndoWorking,
                  isKeyRedoWorking,
                  cssReverted,
                  markdownRetained,
                  hasFormatMenu,
                  hasFormatShortcut,
                  isSavePreservingUnformatted,
                  isFormatWorking,
                  hasUnifiedScrollbar,
                  hasEditorContextMenuFunction,
                  isLeftPanelContextPrevented,
                  isTextareaContextPrevented,
                };
              })()
            \`);

            const editorMenu = createEditorContextMenu();
            const editorMenuItems = editorMenu.items;
            const hasThreeItems = editorMenuItems.length === 3;
            const isFirstCopy = editorMenuItems[0].label === "Copy" && editorMenuItems[0].role === "copy";
            const isSecondCut = editorMenuItems[1].label === "Cut" && editorMenuItems[1].role === "cut";
            const isThirdPaste = editorMenuItems[2].label === "Paste" && editorMenuItems[2].role === "paste";
            const isEditorContextMenuInvoked = editorContextMenuIpcCalls >= 2;

            const combinedResult = {
              ...testResult,
              hasThreeItems,
              isFirstCopy,
              isSecondCut,
              isThirdPaste,
              isEditorContextMenuInvoked,
            };

            console.log(JSON.stringify(combinedResult));
            const allPassed =
              testResult.isSearchButtonLeftOfZoom &&
              testResult.initialDialogHidden &&
              testResult.dialogOpened &&
              testResult.isPositionedTopRight &&
              testResult.initialCaseOff &&
              testResult.isCaseButtonMatchingQueryHeight &&
              testResult.counterAtStart === "1 / 3" &&
              testResult.totalMatchesInitial === 3 &&
              testResult.activeMatchesInitial === 1 &&
              testResult.inactiveMatchesInitial === 2 &&
              testResult.counterAfterNext === "2 / 3" &&
              testResult.counterAfterNextTwo === "3 / 3" &&
              testResult.counterAfterWrapNext === "1 / 3" &&
              testResult.counterAfterPrev === "3 / 3" &&
              testResult.isCaseToggledOn &&
              testResult.counterAfterCaseOn === "1 / 2" &&
              testResult.matchesAfterCaseOn === 2 &&
              testResult.counterAfterCaseOff === "1 / 3" &&
              testResult.isClearButtonVisible &&
              testResult.isInputCleared &&
              testResult.counterAfterClear === "0 / 0" &&
              testResult.matchesAfterClear === 0 &&
              testResult.isDialogClosed &&
              testResult.matchesAfterClose === 0 &&
              testResult.hasUndoMenu &&
              testResult.hasRedoMenu &&
              testResult.hasUndoShortcut &&
              testResult.hasRedoShortcut &&
              testResult.isMenuUndoWorking &&
              testResult.isMenuRedoWorking &&
              testResult.isKeyUndoWorking &&
              testResult.isKeyRedoWorking &&
              testResult.cssReverted &&
              testResult.markdownRetained &&
              testResult.hasFormatMenu &&
              testResult.hasFormatShortcut &&
              testResult.isSavePreservingUnformatted &&
              testResult.isFormatWorking &&
              testResult.hasUnifiedScrollbar &&
              testResult.hasEditorContextMenuFunction &&
              testResult.isLeftPanelContextPrevented &&
              testResult.isTextareaContextPrevented &&
              isEditorContextMenuInvoked &&
              hasThreeItems &&
              isFirstCopy &&
              isSecondCut &&
              isThirdPaste;

            fs.rmSync(tempDir, { recursive: true, force: true });
            app.exit(allPassed ? 0 : 1);
          } catch (err) {
            console.error(err);
            app.exit(1);
          }
        });
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

          assert.ok(
            parsed.isSearchButtonLeftOfZoom,
            "Search button must be located to the left of +/- zoom buttons",
          );
          assert.ok(
            parsed.initialDialogHidden,
            "Search dialog must be initially hidden",
          );
          assert.ok(
            parsed.dialogOpened,
            "Search dialog must become visible when search button is clicked",
          );
          assert.ok(
            parsed.isPositionedTopRight,
            "Search dialog must be positioned in the top right corner of content pane",
          );
          assert.ok(
            parsed.initialCaseOff,
            "Case sensitive button (Aa) must be off by default",
          );
          assert.equal(
            parsed.counterAtStart,
            "1 / 3",
            "Search counter must show 1 / 3 with first coincidence as default",
          );
          assert.equal(
            parsed.totalMatchesInitial,
            3,
            "All 3 coincidences must be highlighted",
          );
          assert.equal(
            parsed.activeMatchesInitial,
            1,
            "Exactly 1 coincidence must have active highlight",
          );
          assert.equal(
            parsed.inactiveMatchesInitial,
            2,
            "Inactive coincidences must have fainter highlight",
          );
          assert.equal(
            parsed.counterAfterNext,
            "2 / 3",
            "Next button must advance to coincidence 2",
          );
          assert.equal(
            parsed.counterAfterNextTwo,
            "3 / 3",
            "Next button must advance to coincidence 3",
          );
          assert.equal(
            parsed.counterAfterWrapNext,
            "1 / 3",
            "Next button must wrap around to coincidence 1",
          );
          assert.equal(
            parsed.counterAfterPrev,
            "3 / 3",
            "Previous button must wrap to coincidence 3",
          );
          assert.ok(
            parsed.isCaseToggledOn,
            "Case sensitive button must toggle active",
          );
          assert.equal(
            parsed.counterAfterCaseOn,
            "1 / 2",
            "Case sensitive search must match exact case",
          );
          assert.equal(
            parsed.counterAfterCaseOff,
            "1 / 3",
            "Toggling case sensitivity off must restore case-insensitive matches",
          );
          assert.ok(
            parsed.isClearButtonVisible,
            "Clear button must be visible when text is entered",
          );
          assert.ok(
            parsed.isInputCleared,
            "Clear button must clear text field",
          );
          assert.equal(
            parsed.counterAfterClear,
            "0 / 0",
            "Counter must reset to 0 / 0 after clearing",
          );
          assert.ok(
            parsed.isDialogClosed,
            "Close button must hide search dialog",
          );
          assert.equal(
            parsed.matchesAfterClose,
            0,
            "Closing search dialog must clear highlights",
          );
          assert.ok(
            parsed.hasUndoMenu,
            "Dropdown menu must contain Undo option",
          );
          assert.ok(
            parsed.hasRedoMenu,
            "Dropdown menu must contain Redo option",
          );
          assert.ok(parsed.hasUndoShortcut, "Undo menu item must show Ctrl+Z");
          assert.ok(parsed.hasRedoShortcut, "Redo menu item must show Ctrl+Y");
          assert.ok(
            parsed.isMenuUndoWorking,
            "Clicking Undo in menu must revert edits",
          );
          assert.ok(
            parsed.isMenuRedoWorking,
            "Clicking Redo in menu must restore edits",
          );
          assert.ok(
            parsed.isKeyUndoWorking,
            "Ctrl+Z keyboard shortcut must undo edits",
          );
          assert.ok(
            parsed.isKeyRedoWorking,
            "Ctrl+Y keyboard shortcut must redo edits",
          );
          assert.ok(parsed.cssReverted, "CSS document must undo independently");
          assert.ok(
            parsed.markdownRetained,
            "Markdown document must retain its separate history buffer",
          );
          assert.ok(
            parsed.hasFormatMenu,
            "Dropdown menu must contain Format option",
          );
          assert.ok(
            parsed.hasFormatShortcut,
            "Format menu item must show Shift+Alt+F",
          );
          assert.ok(
            parsed.isSavePreservingUnformatted,
            "Saving must preserve unformatted content",
          );
          assert.ok(
            parsed.isFormatWorking,
            "Clicking Format menu item must format content",
          );
          assert.ok(
            parsed.hasUnifiedScrollbar,
            "Editor must have unified scrollbar styling",
          );
          assert.ok(
            parsed.hasEditorContextMenuFunction,
            "showEditorContextMenu must be exposed on atarashiiApi",
          );
          assert.ok(
            parsed.isLeftPanelContextPrevented,
            "Right clicking left panel must prevent default context menu",
          );
          assert.ok(
            parsed.isTextareaContextPrevented,
            "Right clicking textarea must prevent default context menu",
          );
          assert.ok(
            parsed.isEditorContextMenuInvoked,
            "Right clicking left panel and textarea must trigger showEditorContextMenu IPC",
          );
          assert.ok(
            parsed.hasThreeItems,
            "Editor context menu must have 3 items",
          );
          assert.ok(
            parsed.isFirstCopy,
            "First context menu item must be Copy",
          );
          assert.ok(
            parsed.isSecondCut,
            "Second context menu item must be Cut",
          );
          assert.ok(
            parsed.isThirdPaste,
            "Third context menu item must be Paste",
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
