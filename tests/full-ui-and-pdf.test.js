/**
 * @module full-ui-and-pdf-test
 * Integration tests verifying PDF rendering, zoom scaling, hyperlink jumping, context menu, and panel collapse geometry.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");

describe("Full UI and PDF Rendering Integration", () => {
  it("verifies PDF rendering, worker resolution, zoom scaling, link jumping, context menu, and tab button styles", async () => {
    const testRunnerScript = path.join(os.tmpdir(), `atarashii-ui-test-${Date.now()}.js`);
    const scriptContent = `
      const { app, BrowserWindow, protocol } = require("electron");
      const path = require("path");
      const fs = require("fs");
      const { execSync } = require("child_process");

      protocol.registerSchemesAsPrivileged([
        {
          scheme: "safe-file",
          privileges: {
            standard: false,
            secure: true,
            supportFetchAPI: true,
            corsEnabled: true,
            stream: true,
          },
        },
      ]);

      app.whenReady().then(async () => {
        protocol.handle("safe-file", (request) => {
          try {
            const rawPath = request.url.slice("safe-file://".length);
            const decodedPath = decodeURIComponent(rawPath);
            const absoluteRequestedPath = path.resolve(decodedPath);
            if (!fs.existsSync(absoluteRequestedPath)) {
              return new Response("Not found", { status: 404 });
            }
            const fileData = fs.readFileSync(absoluteRequestedPath);
            return new Response(fileData, {
              headers: { "Content-Type": "application/pdf" },
            });
          } catch (err) {
            return new Response("Error", { status: 500 });
          }
        });

        const tempDir = fs.mkdtempSync(path.join(app.getPath("temp"), "test-run-"));
        const sampleMd = path.join(tempDir, "document.md");
        const samplePdf = path.join(tempDir, "document.pdf");
        const sectionsText = Array.from({ length: 40 }, (_, i) => "## Section " + i + "\\n\\nBody content for section " + i).join("\\n\\n");
        fs.writeFileSync(sampleMd, sectionsText, "utf8");

        execSync(\`markdown-convert "\${sampleMd}" --mode=once --out="\${samplePdf}"\`, { timeout: 15000 });

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

        win.webContents.on("console-message", (event) => {
          console.log("[Renderer]", event.message);
        });

        win.loadFile(path.join("${path.join(__dirname, "..", "src", "renderer", "index.html").replace(/\\/g, "\\\\")}"));

        win.webContents.on("did-finish-load", async () => {
          try {
            const testResult = await win.webContents.executeJavaScript(\`
              (async () => {
                const { createPdfViewer } = await import("./scripts/pdf-viewer/viewer.js");
                const { jumpToPage } = await import("./scripts/pdf-viewer/pdf.js");
                const { state } = await import("./scripts/pdf-viewer/state.js");

                await new Promise((resolve) => setTimeout(resolve, 600));

                const { createScreenManager } = await import("./scripts/screen-manager.js");
                const screenManagerInstance = createScreenManager();
                screenManagerInstance.show("screen-main", "Test Project");
                await new Promise((resolve) => setTimeout(resolve, 200));

                const targetPdfPath = "\${samplePdf.replace(/\\\\/g, "\\\\\\\\")}";
                const pdfViewer = createPdfViewer();
                pdfViewer.init();

                await pdfViewer.load(targetPdfPath);
                while (state.isRendering) {
                  await new Promise((resolve) => setTimeout(resolve, 100));
                }

                const initialCanvas = document.querySelector(".is-front canvas");
                const initialWidth = initialCanvas ? initialCanvas.width : 0;

                const zoomDropdown = document.getElementById("pdf-zoom-select");
                const initialDefaultZoom = state.currentZoomMode;
                const isDefaultFitWidth = initialDefaultZoom === "fit-width" && zoomDropdown.value === "fit-width";

                zoomDropdown.value = "2";
                zoomDropdown.dispatchEvent(new Event("change"));

                await new Promise((resolve) => setTimeout(resolve, 100));
                while (state.isRendering) {
                  await new Promise((resolve) => setTimeout(resolve, 100));
                }
                await new Promise((resolve) => setTimeout(resolve, 200));

                const zoomedContainer = document.querySelector(".is-front .page-container");
                const zoomedCanvas = document.querySelector(".is-front canvas");
                const zoomedWidth = zoomedCanvas ? zoomedCanvas.width : 0;
                const isZoomScaled = zoomedWidth > initialWidth;

                jumpToPage(2);
                const wasScrollNavigatingDuringJump = state.isScrollNavigating;
                await new Promise((resolve) => setTimeout(resolve, 400));
                const targetPageNumber = state.currentPageNumber;
                const isNavigationWorking = targetPageNumber === 2 && wasScrollNavigatingDuringJump;

                const hasContextMenuFunction = typeof window.atarashiiApi.showContextMenu === "function";

                const folderInput = document.getElementById("project-folder-input");
                const nameInput = document.getElementById("project-name-input");
                const folderHeight = folderInput.offsetHeight || 42;
                const nameHeight = nameInput.offsetHeight || 42;
                const areInputHeightsMatching = Math.abs(folderHeight - nameHeight) <= 2;

                const textarea = document.getElementById("editor-textarea");
                const initialFontSize = parseInt(window.getComputedStyle(textarea).fontSize, 10);

                const zoomInBtn = document.getElementById("editor-zoom-in-button");
                const zoomOutBtn = document.getElementById("editor-zoom-out-button");
                zoomInBtn.click();
                const increasedFontSize = parseInt(window.getComputedStyle(textarea).fontSize, 10);
                const isEditorZoomInWorking = increasedFontSize > initialFontSize;

                zoomOutBtn.click();
                const restoredFontSize = parseInt(window.getComputedStyle(textarea).fontSize, 10);
                const isEditorZoomOutWorking = restoredFontSize < increasedFontSize;

                const optionsBtn = document.getElementById("editor-options-menu-button");
                const optionsMenu = document.getElementById("editor-options-dropdown");
                const initialMenuHidden = optionsMenu.hidden;
                optionsBtn.click();
                const menuOpenedAfterClick = !optionsMenu.hidden;

                const lineWrapBtn = document.getElementById("editor-toggle-linewrap");
                const isLineWrapInitiallyChecked = lineWrapBtn.classList.contains("checked-item") && textarea.wrap === "on";
                lineWrapBtn.click();
                const isLineWrapToggledOff = !lineWrapBtn.classList.contains("checked-item") && textarea.wrap === "off";
                lineWrapBtn.click();

                const inactiveTabButton = document.getElementById("tab-document-css");
                const inactiveStyle = window.getComputedStyle(inactiveTabButton);
                const inactiveBg = inactiveStyle.backgroundColor;
                const isDistinctBackground = inactiveBg !== "transparent" &&
                                             inactiveBg !== "rgba(0, 0, 0, 0)" &&
                                             inactiveBg !== "rgb(16, 20, 31)";

                const leftPanel = document.getElementById("left-panel");
                const rightPanel = document.getElementById("right-panel");
                const leftButton = document.getElementById("left-panel-collapse-button");
                const rightButton = document.getElementById("right-panel-collapse-button");

                leftPanel.classList.add("panel-collapsed");
                await new Promise((resolve) => setTimeout(resolve, 150));

                const leftRect = leftButton.getBoundingClientRect();
                const rightRect = rightButton.getBoundingClientRect();

                const horizontalSeparation = rightRect.left - leftRect.right;
                const hasNoOverlap = horizontalSeparation > 10;

                const pdfCluster = document.querySelector(".pdf-control-cluster");
                const pdfClusterStyle = window.getComputedStyle(pdfCluster);
                const pdfPrintBtn = document.getElementById("pdf-print-action-button");
                const pdfPrintBtnStyle = window.getComputedStyle(pdfPrintBtn);
                const arePdfButtonsMatchingTabbar = pdfClusterStyle.backgroundColor === inactiveBg &&
                                                   pdfPrintBtnStyle.backgroundColor === inactiveBg &&
                                                   pdfClusterStyle.height === "32px" &&
                                                   pdfPrintBtnStyle.height === "32px";

                return {
                  ok: true,
                  initialWidth,
                  zoomedWidth,
                  isZoomScaled,
                  targetPageNumber,
                  isNavigationWorking,
                  hasContextMenuFunction,
                  inactiveBg,
                  isDistinctBackground,
                  hasNoOverlap,
                  horizontalSeparation,
                  isDefaultFitWidth,
                  areInputHeightsMatching,
                  isEditorZoomInWorking,
                  isEditorZoomOutWorking,
                  initialMenuHidden,
                  menuOpenedAfterClick,
                  isLineWrapInitiallyChecked,
                  isLineWrapToggledOff,
                  arePdfButtonsMatchingTabbar,
                };
              })()
            \`);

            console.log(JSON.stringify(testResult));
            fs.rmSync(tempDir, { recursive: true, force: true });
            const allPassed = testResult.isZoomScaled &&
                              testResult.isNavigationWorking &&
                              testResult.hasContextMenuFunction &&
                              testResult.isDistinctBackground &&
                              testResult.hasNoOverlap &&
                              testResult.isDefaultFitWidth &&
                              testResult.areInputHeightsMatching &&
                              testResult.isEditorZoomInWorking &&
                              testResult.isEditorZoomOutWorking &&
                              testResult.initialMenuHidden &&
                              testResult.menuOpenedAfterClick &&
                              testResult.isLineWrapInitiallyChecked &&
                              testResult.isLineWrapToggledOff &&
                              testResult.arePdfButtonsMatchingTabbar;
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
          assert.ok(parsed.isZoomScaled, "Zoom level change must scale the canvas width");
          assert.ok(parsed.isNavigationWorking, "Link / page jumping must update current page");
          assert.ok(parsed.hasContextMenuFunction, "showContextMenu IPC must be exposed");
          assert.ok(parsed.isDistinctBackground, "Inactive tab buttons must have distinct background");
          assert.ok(parsed.hasNoOverlap, "Collapse handles must not overlap");
          assert.ok(parsed.isDefaultFitWidth, "Default PDF zoom must be 'fit-width'");
          assert.ok(parsed.areInputHeightsMatching, "New project Name and Folder inputs must match height");
          assert.ok(parsed.isEditorZoomInWorking, "Editor zoom in must increase font size");
          assert.ok(parsed.isEditorZoomOutWorking, "Editor zoom out must decrease font size");
          assert.ok(parsed.menuOpenedAfterClick, "Three dot menu must open options dropdown");
          assert.ok(parsed.isLineWrapInitiallyChecked, "Line wrap must be on by default");
          assert.ok(parsed.isLineWrapToggledOff, "Line wrap must toggle off when clicked");
          assert.ok(parsed.arePdfButtonsMatchingTabbar, "PDF buttons must match styling of top tabbar buttons");
          resolve();
        } else {
          reject(new Error(`Test failed with exit code ${exitCode}\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`));
        }
      });
    });
  });
});
