/**
 * @module clean-exit-test
 * Integration tests verifying that the application terminates all windows and child processes cleanly on exit.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");

describe("Application Clean Shutdown", () => {
  it("destroys the hidden print window on request", async () => {
    const testRunnerScript = path.join(
      os.tmpdir(),
      `atarashii-print-destroy-test-${Date.now()}.js`,
    );
    const printServiceModulePath = path
      .join(__dirname, "..", "src", "main", "print-service.js")
      .replace(/\\/g, "\\\\");

    const scriptContent = `
      const { app, BrowserWindow } = require("electron");
      const { createPrintService } = require("${printServiceModulePath}");

      app.whenReady().then(async () => {
        const dummyLogger = { info() {}, warn() {}, error() {} };
        const printService = createPrintService(dummyLogger);

        const printWindowInstance = printService.ensurePrintWindow();
        const initialWindowCount = BrowserWindow.getAllWindows().length;

        printService.destroyPrintWindow();
        const windowCountAfterDestroy = BrowserWindow.getAllWindows().length;
        const isDestroyedFlag = printWindowInstance.isDestroyed();

        printService.destroyPrintWindow();

        console.log("DESTROY_RESULT " + JSON.stringify({
          initialWindowCount,
          windowCountAfterDestroy,
          isDestroyedFlag,
        }));

        app.exit(0);
      });
    `;

    fs.writeFileSync(testRunnerScript, scriptContent, "utf8");

    const electronExecutable = require("electron");

    await new Promise((resolve, reject) => {
      const childProcess = spawn(electronExecutable, [testRunnerScript], {
        windowsHide: true,
      });

      let capturedOutput = "";

      childProcess.stdout.on("data", (chunk) => {
        capturedOutput += chunk.toString("utf8");
      });

      childProcess.on("close", (exitCode) => {
        try {
          fs.rmSync(testRunnerScript, { force: true });
        } catch {}

        if (exitCode === 0) {
          const matchResult = capturedOutput.match(/DESTROY_RESULT (\{.*\})/);
          assert.ok(matchResult, "Output must contain destruction result");
          const parsedResult = JSON.parse(matchResult[1]);
          assert.equal(parsedResult.initialWindowCount, 1);
          assert.equal(parsedResult.windowCountAfterDestroy, 0);
          assert.equal(parsedResult.isDestroyedFlag, true);
          resolve();
        } else {
          reject(new Error(`Test process failed with exit code ${exitCode}`));
        }
      });
    });
  });

  it("terminates the Electron process cleanly when the primary window is closed", async () => {
    const testRunnerScript = path.join(
      os.tmpdir(),
      `atarashii-shutdown-test-${Date.now()}.js`,
    );
    const printServiceModulePath = path
      .join(__dirname, "..", "src", "main", "print-service.js")
      .replace(/\\/g, "\\\\");
    const ipcHandlersModulePath = path
      .join(__dirname, "..", "src", "main", "ipc-handlers.js")
      .replace(/\\/g, "\\\\");

    const scriptContent = `
      const { app, BrowserWindow } = require("electron");
      const { createPrintService } = require("${printServiceModulePath}");
      const { registerIpcHandlers } = require("${ipcHandlersModulePath}");

      let converterStopCalled = false;

      const dummyLogger = { info() {}, warn() {}, error() {} };
      const dummyConsent = { hasConsent: () => true, grantConsent() {}, clearConsent() {} };
      const dummyConverter = {
        startLiveConversion: async () => {},
        stopLiveConversion: async () => {
          converterStopCalled = true;
        },
      };

      app.whenReady().then(async () => {
        const primaryWindow = new BrowserWindow({
          width: 800,
          height: 600,
          show: false,
        });

        const printService = createPrintService(dummyLogger);
        printService.ensurePrintWindow();

        registerIpcHandlers(primaryWindow, dummyLogger, dummyConsent, dummyConverter, printService);

        let isApplicationTerminating = false;

        primaryWindow.on("close", async (closeEvent) => {
          if (isApplicationTerminating) {
            return;
          }
          closeEvent.preventDefault();
          isApplicationTerminating = true;

          try {
            await dummyConverter.stopLiveConversion();
          } catch {}

          printService.destroyPrintWindow();

          if (!primaryWindow.isDestroyed()) {
            primaryWindow.destroy();
          }
          app.quit();
        });

        app.on("window-all-closed", () => {
          app.quit();
        });

        setTimeout(() => {
          primaryWindow.close();
        }, 150);
      });
    `;

    fs.writeFileSync(testRunnerScript, scriptContent, "utf8");

    const electronExecutable = require("electron");

    await new Promise((resolve, reject) => {
      const childProcess = spawn(electronExecutable, [testRunnerScript], {
        windowsHide: true,
      });

      const failsafeTimer = setTimeout(() => {
        childProcess.kill("SIGKILL");
        reject(new Error("Shutdown test hung: process did not exit within timeout"));
      }, 10000);

      childProcess.on("close", (exitCode) => {
        clearTimeout(failsafeTimer);
        try {
          fs.rmSync(testRunnerScript, { force: true });
        } catch {}

        assert.equal(exitCode, 0, "Process must exit cleanly with code 0");
        resolve();
      });
    });
  });

  it("exits the main Electron process when primary window is closed in live application", async () => {
    const electronExecutable = require("electron");
    const projectRootPath = path.join(__dirname, "..");

    await new Promise((resolve, reject) => {
      const childProcess = spawn(
        electronExecutable,
        [projectRootPath, "--test-close-window"],
        {
          windowsHide: true,
        },
      );

      const failsafeTimer = setTimeout(() => {
        childProcess.kill("SIGKILL");
        reject(
          new Error("Live app shutdown hung: process did not exit within 15 seconds"),
        );
      }, 15000);

      childProcess.on("close", (exitCode) => {
        clearTimeout(failsafeTimer);
        assert.equal(
          exitCode,
          0,
          "Live application must exit cleanly with code 0 after window close",
        );
        resolve();
      });
    });
  });
});
