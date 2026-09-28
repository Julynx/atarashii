/**
 * @module panel-collapse-test
 * Integration tests verifying dual-panel collapse handles, screen border docking, and panel restoration.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");

describe("Workspace Panel Collapse Handles", () => {
  it("verifies dual dividing line arrows, border docking on collapse, and restoration behavior", async () => {
    const testRunnerScript = path.join(
      os.tmpdir(),
      `atarashii-panel-collapse-test-${Date.now()}.js`,
    );

    const scriptContent = `
      const { app, BrowserWindow } = require("electron");
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

        const { registerIpcHandlers } = require("${path.join(__dirname, "..", "src", "main", "ipc-handlers.js").replace(/\\/g, "\\\\")}");
        const dummyLogger = { info() {}, warn() {}, error() {} };
        const dummyConsent = { hasConsent: () => true, grantConsent() {}, clearConsent() {} };
        const dummyConverter = { startLiveConversion: async () => {}, stopLiveConversion: async () => {} };
        const dummyPrint = { ensurePrintWindow: () => {}, destroyPrintWindow: () => {} };
        registerIpcHandlers(win, dummyLogger, dummyConsent, dummyConverter, dummyPrint);

        const { ipcMain } = require("electron");
        ipcMain.removeHandler("requirements:check");
        ipcMain.handle("requirements:check", () => [
          { id: "uv", found: true },
          { id: "markdown-convert", found: true },
        ]);
        ipcMain.removeHandler("updater:check");
        ipcMain.handle("updater:check", () => ({ isUpToDate: true }));

        const tempDir = fs.mkdtempSync(path.join(app.getPath("temp"), "test-collapse-run-"));
        app.setPath("userData", path.join(tempDir, "user-data"));

        win.loadFile(path.join("${path.join(__dirname, "..", "src", "renderer", "index.html").replace(/\\/g, "\\\\")}"));

        win.webContents.on("did-finish-load", async () => {
          try {
            const testResult = await win.webContents.executeJavaScript(\`
              (async () => {
                while (document.getElementById("screen-loading").classList.contains("active-screen")) {
                  await new Promise((resolve) => setTimeout(resolve, 50));
                }
                await new Promise((resolve) => setTimeout(resolve, 100));

                const { createScreenManager } = await import("./scripts/screen-manager.js");
                const screenManagerInstance = createScreenManager();
                screenManagerInstance.show("screen-main", "Test Collapse Project");
                await new Promise((resolve) => setTimeout(resolve, 300));

                const leftPanel = document.getElementById("left-panel");
                const rightPanel = document.getElementById("right-panel");
                const leftButton = document.getElementById("left-panel-collapse-button");
                const rightButton = document.getElementById("right-panel-collapse-button");
                const leftArrowIcon = document.getElementById("left-panel-arrow-icon");
                const rightArrowIcon = document.getElementById("right-panel-arrow-icon");

                const leftStyle = window.getComputedStyle(leftButton);
                const rightStyle = window.getComputedStyle(rightButton);

                const areButtonsVisibleInitially = leftStyle.display === "flex" && rightStyle.display === "flex";
                const isLeftInitialIconPointingLeft = leftArrowIcon.src.endsWith("arrow-left.svg");
                const isRightInitialIconPointingRight = rightArrowIcon.src.endsWith("arrow-right.svg");
                const isLeftInitialTitleCollapse = leftButton.title === "Collapse left panel";
                const isRightInitialTitleCollapse = rightButton.title === "Collapse right panel";

                const initialLeftRect = leftButton.getBoundingClientRect();
                const initialRightRect = rightButton.getBoundingClientRect();
                const initialLeftPanelRect = leftPanel.getBoundingClientRect();
                const initialRightPanelRect = rightPanel.getBoundingClientRect();

                const areButtonsVerticallyAligned = Math.abs(initialLeftRect.top - initialRightRect.top) < 2;
                const isLeftButtonFullyInsidePanel = initialLeftRect.right <= initialLeftPanelRect.right;
                const isRightButtonFullyInsidePanel = initialRightRect.left >= initialRightPanelRect.left;
                const openButtonsClearance = initialRightRect.left - initialLeftRect.right;
                const hasClearanceWhenOpen = openButtonsClearance > 10;

                leftButton.click();
                await new Promise((resolve) => setTimeout(resolve, 350));

                const isLeftPanelCollapsed = leftPanel.classList.contains("panel-collapsed");
                const isLeftIconPointingRightOnCollapse = leftArrowIcon.src.endsWith("arrow-right.svg");
                const isLeftTitleExpandOnCollapse = leftButton.title === "Expand left panel";

                const collapsedLeftRect = leftButton.getBoundingClientRect();
                const activeRightRect = rightButton.getBoundingClientRect();
                const isLeftButtonAtScreenBorder = collapsedLeftRect.left < 50;
                const horizontalClearanceOnLeftCollapse = activeRightRect.left - collapsedLeftRect.right;
                const isNoOverlapOnLeftCollapse = horizontalClearanceOnLeftCollapse > 10;

                rightButton.click();
                await new Promise((resolve) => setTimeout(resolve, 350));

                const areBothPanelsCollapsed = leftPanel.classList.contains("panel-collapsed") && rightPanel.classList.contains("panel-collapsed");
                const bothLeftPanelRect = leftPanel.getBoundingClientRect();
                const bothRightPanelRect = rightPanel.getBoundingClientRect();
                const bothLeftBtnRect = leftButton.getBoundingClientRect();
                const bothRightBtnRect = rightButton.getBoundingClientRect();

                const leftButtonInternalOffset = Math.round(bothLeftBtnRect.left - bothLeftPanelRect.left);
                const rightButtonInternalOffset = Math.round(bothRightBtnRect.left - bothRightPanelRect.left);
                const areBothButtonsCenteredIdentically = Math.abs(leftButtonInternalOffset - rightButtonInternalOffset) <= 1;

                leftButton.click();
                await new Promise((resolve) => setTimeout(resolve, 350));

                rightButton.click();
                await new Promise((resolve) => setTimeout(resolve, 350));

                const isLeftPanelRestored = !leftPanel.classList.contains("panel-collapsed");
                const isRightPanelRestored = !rightPanel.classList.contains("panel-collapsed");
                const isLeftIconRestoredToLeft = leftArrowIcon.src.endsWith("arrow-left.svg");
                const isRightIconRestoredToRight = rightArrowIcon.src.endsWith("arrow-right.svg");

                return {
                  ok: true,
                  areButtonsVisibleInitially,
                  isLeftInitialIconPointingLeft,
                  isRightInitialIconPointingRight,
                  isLeftInitialTitleCollapse,
                  isRightInitialTitleCollapse,
                  areButtonsVerticallyAligned,
                  isLeftButtonFullyInsidePanel,
                  isRightButtonFullyInsidePanel,
                  hasClearanceWhenOpen,
                  isLeftPanelCollapsed,
                  isLeftIconPointingRightOnCollapse,
                  isLeftTitleExpandOnCollapse,
                  isLeftButtonAtScreenBorder,
                  isNoOverlapOnLeftCollapse,
                  areBothPanelsCollapsed,
                  leftButtonInternalOffset,
                  rightButtonInternalOffset,
                  areBothButtonsCenteredIdentically,
                  isLeftPanelRestored,
                  isRightPanelRestored,
                  isLeftIconRestoredToLeft,
                  isRightIconRestoredToRight,
                };
              })()
            \`);

            console.log(JSON.stringify(testResult));
            fs.rmSync(tempDir, { recursive: true, force: true });

            const allPassed =
              testResult.areButtonsVisibleInitially &&
              testResult.isLeftInitialIconPointingLeft &&
              testResult.isRightInitialIconPointingRight &&
              testResult.isLeftInitialTitleCollapse &&
              testResult.isRightInitialTitleCollapse &&
              testResult.areButtonsVerticallyAligned &&
              testResult.isLeftButtonFullyInsidePanel &&
              testResult.isRightButtonFullyInsidePanel &&
              testResult.hasClearanceWhenOpen &&
              testResult.isLeftPanelCollapsed &&
              testResult.isLeftIconPointingRightOnCollapse &&
              testResult.isLeftTitleExpandOnCollapse &&
              testResult.isLeftButtonAtScreenBorder &&
              testResult.isNoOverlapOnLeftCollapse &&
              testResult.areBothPanelsCollapsed &&
              testResult.areBothButtonsCenteredIdentically &&
              testResult.isLeftPanelRestored &&
              testResult.isRightPanelRestored &&
              testResult.isLeftIconRestoredToLeft &&
              testResult.isRightIconRestoredToRight;

            app.exit(allPassed ? 0 : 1);
          } catch (executionError) {
            console.error(executionError);
            app.exit(1);
          }
        });
      });
    `;

    fs.writeFileSync(testRunnerScript, scriptContent, "utf8");

    const electronExecutable = require("electron");

    await new Promise((resolve, reject) => {
      const childProcess = spawn(electronExecutable, [testRunnerScript], {
        windowsHide: true,
      });

      let capturedStdout = "";
      let capturedStderr = "";

      childProcess.stdout.on("data", (chunk) => {
        const text = chunk.toString("utf8");
        capturedStdout += text;
      });

      childProcess.stderr.on("data", (chunk) => {
        const text = chunk.toString("utf8");
        capturedStderr += text;
      });

      childProcess.on("close", (exitCode) => {
        try {
          fs.unlinkSync(testRunnerScript);
        } catch {}

        if (exitCode === 0) {
          try {
            const parsedResult = JSON.parse(capturedStdout.trim());
            assert.equal(parsedResult.areButtonsVisibleInitially, true, "Both collapse buttons must be visible initially");
            assert.equal(parsedResult.isLeftInitialIconPointingLeft, true, "Left initial arrow must point left");
            assert.equal(parsedResult.isRightInitialIconPointingRight, true, "Right initial arrow must point right");
            assert.equal(parsedResult.areButtonsVerticallyAligned, true, "Buttons must be vertically aligned along dividing line");
            assert.equal(parsedResult.isLeftButtonFullyInsidePanel, true, "Left button must be fully visible inside left panel");
            assert.equal(parsedResult.isRightButtonFullyInsidePanel, true, "Right button must be fully visible inside right panel");
            assert.equal(parsedResult.hasClearanceWhenOpen, true, "Buttons must maintain clearance when both panels are open");
            assert.equal(parsedResult.isLeftPanelCollapsed, true, "Left panel must collapse upon click");
            assert.equal(parsedResult.isLeftButtonAtScreenBorder, true, "Left arrow must live on screen border when collapsed");
            assert.equal(parsedResult.isNoOverlapOnLeftCollapse, true, "Horizontal clearance must exceed 10px when left panel is collapsed");
            assert.equal(parsedResult.areBothPanelsCollapsed, true, "Both panels must support simultaneous collapse");
            assert.equal(parsedResult.areBothButtonsCenteredIdentically, true, "Both buttons must share identical horizontal centering when collapsed");
            assert.equal(parsedResult.isLeftPanelRestored, true, "Left panel must restore upon clicking border arrow");
            assert.equal(parsedResult.isRightPanelRestored, true, "Right panel must restore upon clicking border arrow");
            resolve();
          } catch (parseError) {
            reject(new Error(`Test passed with code 0 but result parsing failed: ${parseError.message}\\nStdout: ${capturedStdout}`));
          }
        } else {
          reject(new Error(`Process exited with code ${exitCode}\\nStderr: ${capturedStderr}\\nStdout: ${capturedStdout}`));
        }
      });
    });
  });
});
