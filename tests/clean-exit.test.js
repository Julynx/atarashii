/**
 * @module clean-exit-test
 * Verifies that the main process terminates after the primary window is closed, even with the hidden print window alive.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const path = require("node:path");

const CLEAN_EXIT_TIMEOUT_MILLISECONDS = 30000;

describe("Clean Exit", () => {
  it("exits the main process when the primary window is closed", async () => {
    const electronExecutable = require("electron");
    const appEntryPath = path.join(__dirname, "..");

    await new Promise((resolve, reject) => {
      const child = spawn(electronExecutable, [appEntryPath, "--test-quit"], {
        windowsHide: true,
        stdio: "ignore",
      });

      const exitWatchdog = setTimeout(() => {
        child.removeAllListeners("close");
        child.kill();
        reject(
          new Error(
            `Main process did not exit within ${CLEAN_EXIT_TIMEOUT_MILLISECONDS} ms of the primary window closing.`,
          ),
        );
      }, CLEAN_EXIT_TIMEOUT_MILLISECONDS);

      child.on("error", (spawnError) => {
        clearTimeout(exitWatchdog);
        reject(spawnError);
      });

      child.on("close", (exitCode) => {
        clearTimeout(exitWatchdog);
        if (exitCode === 0) {
          resolve();
        } else {
          reject(new Error(`Unexpected exit code: ${exitCode}`));
        }
      });
    });
  });
});
