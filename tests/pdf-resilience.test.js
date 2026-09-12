/**
 * @module pdf-resilience-test
 * Integration tests verifying PDF rendering resilience under rapid reloads and drastic page count shrinkage.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");

describe("PDF Viewer Rendering Resilience", () => {
  it("handles rapid reloads and drastic document shrinkage without null destruction errors", async () => {
    const testRunnerScriptPath = path.join(
      os.tmpdir(),
      `atarashii-pdf-resilience-${Date.now()}.js`,
    );

    const scriptContent = `
      const { app, BrowserWindow, protocol, ipcMain } = require("electron");
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
            const urlWithoutQuery = request.url.split("?")[0];
            const rawPath = urlWithoutQuery.slice("safe-file://".length);
            const decodedPath = decodeURIComponent(rawPath);
            const absoluteRequestedPath = path.resolve(decodedPath);
            if (!fs.existsSync(absoluteRequestedPath)) {
              return new Response("Not found", { status: 404 });
            }
            const fileData = fs.readFileSync(absoluteRequestedPath);
            return new Response(fileData, {
              headers: {
                "Content-Type": "application/pdf",
                "Content-Length": String(fileData.length),
                "Cache-Control": "no-store, no-cache, must-revalidate",
                "Pragma": "no-cache",
              },
            });
          } catch (protocolError) {
            return new Response("Error", { status: 500 });
          }
        });

        const temporaryDirectory = fs.mkdtempSync(path.join(app.getPath("temp"), "test-resilience-"));
        app.setPath("userData", path.join(temporaryDirectory, "user-data"));

        const largeMarkdownPath = path.join(temporaryDirectory, "large.md");
        const largePdfPath = path.join(temporaryDirectory, "large.pdf");
        const largeContent = Array.from({ length: 30 }, (_, index) => "## Section " + index + "\\n\\nContent for section " + index).join("\\n\\n");
        fs.writeFileSync(largeMarkdownPath, largeContent, "utf8");
        execSync(\`markdown-convert "\${largeMarkdownPath}" --mode=once --out="\${largePdfPath}"\`, { timeout: 15000 });

        const smallMarkdownPath = path.join(temporaryDirectory, "small.md");
        const smallPdfPath = path.join(temporaryDirectory, "small.pdf");
        const smallContent = "# Short Document\\n\\nA single short paragraph.";
        fs.writeFileSync(smallMarkdownPath, smallContent, "utf8");
        execSync(\`markdown-convert "\${smallMarkdownPath}" --mode=once --out="\${smallPdfPath}"\`, { timeout: 15000 });

        const windowInstance = new BrowserWindow({
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
        registerIpcHandlers(windowInstance, dummyLogger, dummyConsent, dummyConverter);

        ipcMain.removeHandler("system:check-update");
        ipcMain.handle("system:check-update", async () => ({ status: "up-to-date" }));

        const collectedConsoleErrors = [];
        windowInstance.webContents.on("console-message", (event) => {
          if (event.level >= 2 || (event.message && event.message.includes("sendWithPromise"))) {
            collectedConsoleErrors.push(event.message);
          }
        });

        windowInstance.loadFile(path.join("${path.join(__dirname, "..", "src", "renderer", "index.html").replace(/\\/g, "\\\\")}"));

        windowInstance.webContents.on("did-finish-load", async () => {
          try {
            const evaluationResult = await windowInstance.webContents.executeJavaScript(\`
              (async () => {
                const { createPdfViewer } = await import("./scripts/pdf-viewer/viewer.js");
                const { jumpToPage } = await import("./scripts/pdf-viewer/pdf.js");
                const { state } = await import("./scripts/pdf-viewer/state.js");

                while (document.getElementById("screen-loading").classList.contains("active-screen")) {
                  await new Promise((resolve) => setTimeout(resolve, 50));
                }
                await new Promise((resolve) => setTimeout(resolve, 100));

                const { createScreenManager } = await import("./scripts/screen-manager.js");
                const screenManagerInstance = createScreenManager();
                screenManagerInstance.show("screen-main", "Resilience Test Project");
                await new Promise((resolve) => setTimeout(resolve, 200));

                const largePath = "\${largePdfPath.replace(/\\\\/g, "\\\\\\\\")}";
                const smallPath = "\${smallPdfPath.replace(/\\\\/g, "\\\\\\\\")}";

                const pdfViewer = createPdfViewer();
                pdfViewer.init();

                await pdfViewer.load(largePath);
                while (state.isRendering) {
                  await new Promise((resolve) => setTimeout(resolve, 50));
                }

                const initialLargeTotalPages = state.totalPages;
                jumpToPage(initialLargeTotalPages);
                await new Promise((resolve) => setTimeout(resolve, 300));

                const pageBeforeShrink = state.currentPageNumber;
                const scrollTopBeforeShrink = state.currentFront ? state.currentFront.scrollTop : 0;

                const reloadPromises = [
                  pdfViewer.reload(largePath),
                  pdfViewer.reload(smallPath),
                  pdfViewer.reload(largePath),
                  pdfViewer.reload(smallPath)
                ];

                await Promise.all(reloadPromises);

                while (state.isRendering || state.pendingRenderOptions) {
                  await new Promise((resolve) => setTimeout(resolve, 50));
                }
                await new Promise((resolve) => setTimeout(resolve, 300));

                const smallTotalPages = state.totalPages;
                const pageAfterShrink = state.currentPageNumber;
                const frontContainerCount = state.currentFront ? state.currentFront.querySelectorAll(".page-container").length : 0;
                const frontHasCanvas = state.currentFront ? !!state.currentFront.querySelector("canvas") : false;

                await pdfViewer.reload(largePath);
                while (state.isRendering || state.pendingRenderOptions) {
                  await new Promise((resolve) => setTimeout(resolve, 50));
                }
                await new Promise((resolve) => setTimeout(resolve, 300));

                const recoveredTotalPages = state.totalPages;
                const recoveredCanvasCount = state.currentFront ? state.currentFront.querySelectorAll("canvas").length : 0;

                return {
                  ok: true,
                  initialLargeTotalPages,
                  pageBeforeShrink,
                  scrollTopBeforeShrink,
                  smallTotalPages,
                  pageAfterShrink,
                  frontContainerCount,
                  frontHasCanvas,
                  recoveredTotalPages,
                  recoveredCanvasCount,
                };
              })()
            \`);

            fs.rmSync(temporaryDirectory, { recursive: true, force: true });

            const hasNullPropertyError = collectedConsoleErrors.some((errorText) =>
              errorText.includes("sendWithPromise") || errorText.includes("Cannot read properties of null")
            );

            console.log(JSON.stringify({
              ...evaluationResult,
              hasNullPropertyError,
              errorCount: collectedConsoleErrors.length,
              errors: collectedConsoleErrors,
            }));

            const testsPassed =
              evaluationResult.ok &&
              evaluationResult.initialLargeTotalPages >= 2 &&
              evaluationResult.smallTotalPages === 1 &&
              evaluationResult.pageAfterShrink === 1 &&
              evaluationResult.frontContainerCount === 1 &&
              evaluationResult.frontHasCanvas &&
              evaluationResult.recoveredTotalPages === evaluationResult.initialLargeTotalPages &&
              evaluationResult.recoveredCanvasCount > 0 &&
              !hasNullPropertyError;

            app.exit(testsPassed ? 0 : 1);
          } catch (executionError) {
            console.error(executionError);
            app.exit(1);
          }
        });
      });
    `;

    fs.writeFileSync(testRunnerScriptPath, scriptContent, "utf8");

    const electronExecutable = require("electron");

    await new Promise((resolve, reject) => {
      const childProcess = spawn(electronExecutable, [testRunnerScriptPath], {
        windowsHide: true,
      });

      let standardOutput = "";
      let standardError = "";

      childProcess.stdout.on("data", (chunk) => {
        const text = chunk.toString("utf8");
        standardOutput += text;
        process.stdout.write(text);
      });

      childProcess.stderr.on("data", (chunk) => {
        const text = chunk.toString("utf8");
        standardError += text;
        process.stderr.write(text);
      });

      childProcess.on("close", (exitCode) => {
        try {
          fs.rmSync(testRunnerScriptPath, { force: true });
        } catch (cleanupError) {
          console.error("Cleanup error:", cleanupError);
        }

        if (exitCode === 0) {
          const matchedResult = standardOutput.match(/\{.*"ok":true.*\}/);
          assert.ok(matchedResult, "Test output must contain success payload");
          const parsedResult = JSON.parse(matchedResult[0]);

          assert.ok(
            parsedResult.initialLargeTotalPages >= 2,
            "Large document must contain multiple pages",
          );
          assert.strictEqual(
            parsedResult.smallTotalPages,
            1,
            "Small document must contain exactly one page",
          );
          assert.strictEqual(
            parsedResult.pageAfterShrink,
            1,
            "Current page must be clamped to page 1 after drastic shrinkage",
          );
          assert.strictEqual(
            parsedResult.frontContainerCount,
            1,
            "Front layer must contain single page container",
          );
          assert.ok(
            parsedResult.frontHasCanvas,
            "Front layer must render canvas for page 1",
          );
          assert.strictEqual(
            parsedResult.recoveredTotalPages,
            parsedResult.initialLargeTotalPages,
            "Subsequent reload must restore full page count",
          );
          assert.ok(
            !parsedResult.hasNullPropertyError,
            "No null proxy sendWithPromise errors allowed during rapid reloads",
          );
          resolve();
        } else {
          reject(
            new Error(
              `Resilience test failed with code ${exitCode}\nSTDOUT:\n${standardOutput}\nSTDERR:\n${standardError}`,
            ),
          );
        }
      });
    });
  });
});
