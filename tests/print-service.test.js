/**
 * @module print-service-test
 * Integration tests verifying that printing sends the actual PDF file to the native
 * print pipeline through a hidden window instead of the application UI.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");

const dummyLogger = { info() {}, warn() {}, error() {} };

describe("Print Service", () => {
  it("rejects printing when no PDF file exists at the given path", async () => {
    const { createPrintService } = require("../src/main/print-service");
    const printService = createPrintService(dummyLogger);
    const missingPdfPath = path.join(
      os.tmpdir(),
      "atarashii-missing-document.pdf",
    );
    await assert.rejects(
      () => printService.printPdf(missingPdfPath),
      /PDF file not found/,
    );
  });

  it("loads the PDF in a hidden window, invokes the native print pipeline, and cleans up", async () => {
    const testRunnerScript = path.join(
      os.tmpdir(),
      `atarashii-print-test-${Date.now()}.js`,
    );
    const ipcHandlersPath = path
      .join(__dirname, "..", "src", "main", "ipc-handlers.js")
      .replace(/\\/g, "\\\\");
    const printServicePath = path
      .join(__dirname, "..", "src", "main", "print-service.js")
      .replace(/\\/g, "\\\\");

    const scriptContent = `
      const { app, BrowserWindow, protocol } = require("electron");
      const fs = require("fs");
      const path = require("path");
      const { execSync } = require("child_process");

      const PRINT_SERVICE_PATH = "${printServicePath}";
      const IPC_HANDLERS_PATH = "${ipcHandlersPath}";

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
        const failsafeTimeout = setTimeout(() => {
          console.error("Print service test timed out.");
          app.exit(1);
        }, 60000);

        try {
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
            } catch (err) {
              return new Response("Error", { status: 500 });
            }
          });

          const tempDir = fs.mkdtempSync(path.join(app.getPath("temp"), "test-print-"));
          app.setPath("userData", path.join(tempDir, "user-data"));
          const sampleMd = path.join(tempDir, "document.md");
          const samplePdf = path.join(tempDir, "document.pdf");
          fs.writeFileSync(sampleMd, "# Print test\\n\\nPrinted body content.", "utf8");
          execSync(
            'markdown-convert "' + sampleMd + '" --mode=once --out="' + samplePdf + '"',
            { timeout: 15000 }
          );

          const { createPrintService } = require(PRINT_SERVICE_PATH);
          const printService = createPrintService({
            info() {},
            warn() {},
            error() {},
          });

          const probeWindow = new BrowserWindow({ show: false });
          const webContentsPrototype = Object.getPrototypeOf(probeWindow.webContents);
          const originalPrint = webContentsPrototype.print;
          const printInvocations = [];
          webContentsPrototype.print = function (options, callback) {
            const invokedWebContents = this;
            printInvocations.push({
              url: invokedWebContents.getURL(),
              options,
            });
            setTimeout(() => callback(true, ""), 250);
          };

          printService.ensurePrintWindow();
          probeWindow.destroy();

          const results = {};

          let missingPathError = null;
          try {
            await printService.printPdf(path.join(tempDir, "missing.pdf"));
          } catch (missingError) {
            missingPathError = missingError;
          }
          results.isMissingPathRejected =
            missingPathError !== null &&
            /PDF file not found/.test(missingPathError.message);

          const firstPrintPromise = printService.printPdf(samplePdf);
          let busyError = null;
          try {
            await printService.printPdf(samplePdf);
          } catch (busyPrintError) {
            busyError = busyPrintError;
          }
          const firstPrintResult = await firstPrintPromise;
          results.isBusySessionRejected =
            busyError !== null &&
            /print session is already in progress/.test(busyError.message);
          results.isBusySessionPrintResultOk =
            firstPrintResult && firstPrintResult.ok === true;

          const normalPrintResult = await printService.printPdf(samplePdf);
          results.isNormalPrintOk =
            normalPrintResult && normalPrintResult.ok === true;
          results.printInvocationCount = printInvocations.length;
          results.isPrintDialogShown =
            printInvocations.every(
              (invocation) => invocation.options && invocation.options.silent === false
            );
          results.isPdfDialogLoadingThePdfFile =
            printInvocations.every(
              (invocation) =>
                typeof invocation.url === "string" &&
                invocation.url.startsWith("file://") &&
                decodeURIComponent(invocation.url).endsWith("document.pdf")
            );

          const remainingWindows = BrowserWindow.getAllWindows();
          results.isPrintWindowHiddenAndReused =
            remainingWindows.length === 1 && !remainingWindows[0].isVisible();

          fs.rmSync(tempDir, { recursive: true, force: true });
          clearTimeout(failsafeTimeout);

          const allPassed =
            results.isMissingPathRejected &&
            results.isBusySessionRejected &&
            results.isBusySessionPrintResultOk &&
            results.printInvocationCount === 2 &&
            results.isNormalPrintOk &&
            results.isPrintDialogShown &&
            results.isPdfDialogLoadingThePdfFile &&
            results.isPrintWindowHiddenAndReused;

          console.log("PRINT_TEST_RESULT " + JSON.stringify(results));
          webContentsPrototype.print = originalPrint;
          app.exit(allPassed ? 0 : 1);
        } catch (testError) {
          console.error(testError);
          app.exit(1);
        }
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
          const match = stdout.match(/PRINT_TEST_RESULT (\{.*\})/);
          assert.ok(match, "Output must contain the print test result");
          const parsed = JSON.parse(match[1]);
          assert.ok(
            parsed.isMissingPathRejected,
            "Printing a missing PDF path must be rejected",
          );
          assert.ok(
            parsed.isBusySessionRejected,
            "A second concurrent print session must be rejected",
          );
          assert.ok(
            parsed.isBusySessionPrintResultOk,
            "The first print session must complete successfully",
          );
          assert.equal(
            parsed.printInvocationCount,
            2,
            "Native print must be invoked exactly once per accepted session",
          );
          assert.ok(
            parsed.isNormalPrintOk,
            "Printing a valid PDF must return a successful outcome",
          );
          assert.ok(
            parsed.isPrintDialogShown,
            "Native print must run with the print settings dialog (silent disabled)",
          );
          assert.ok(
            parsed.isPdfDialogLoadingThePdfFile,
            "The print window must load the PDF file itself, not the app UI",
          );
          assert.ok(
            parsed.isPrintWindowHiddenAndReused,
            "The hidden print window must stay hidden and be reused between print jobs",
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
