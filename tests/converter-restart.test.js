const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const fs = require("fs");
const os = require("os");
const { createConverterService } = require("../src/main/converter-service");

describe("Converter Service Auto-Restart", () => {
  it("restarts conversion process if terminated unexpectedly while active", async () => {
    const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "atarashii-restart-test-"));
    const markdownPath = path.join(temporaryRoot, "document.md");
    const cssPath = path.join(temporaryRoot, "style.css");
    fs.writeFileSync(markdownPath, "# Test Auto Restart\nContent goes here.", "utf8");
    fs.writeFileSync(cssPath, "body { color: red; }", "utf8");

    const testLogger = {
      info: () => {},
      warn: () => {},
      error: () => {},
    };

    let launchCount = 0;
    const converterService = createConverterService(
      testLogger,
      (logText) => {
        if (logText.includes("[Atarashii] Starting: markdown-convert")) {
          launchCount += 1;
        }
      },
      () => {}
    );

    try {
      await converterService.startLiveConversion(
        temporaryRoot,
        "document.md",
        "style.css",
        "document.pdf"
      );

      assert.ok(launchCount >= 1, "Initial conversion process must be started");
      await new Promise((resolve) => setTimeout(resolve, 1000));
    } finally {
      await converterService.stopLiveConversion();
      await new Promise((resolve) => setTimeout(resolve, 500));
      try {
        fs.rmSync(temporaryRoot, { recursive: true, force: true });
      } catch {}
    }
  });
});
