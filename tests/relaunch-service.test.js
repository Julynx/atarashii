/**
 * @module relaunch-service-test
 * Unit tests verifying environment sanitization and relaunch options.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  createSanitizedAppImageEnvironment,
} = require("../src/main/relaunch-service");

describe("Relaunch Service", () => {
  it("sanitizes AppImage runtime variables from environment object", () => {
    const mockEnvironment = {
      HOME: "/home/testuser",
      PATH: "/usr/local/bin:/usr/bin",
      DISPLAY: ":0",
      APPDIR: "/tmp/.mount_test123",
      APPIMAGE: "/home/testuser/AppImages/app.AppImage",
      LD_LIBRARY_PATH: "/tmp/.mount_test123/usr/lib",
      ARGV0: "app",
      OWD: "/home/testuser",
      CUSTOM_VAR: "atarashii-value",
    };

    const sanitizedResult = createSanitizedAppImageEnvironment(mockEnvironment);

    assert.equal(sanitizedResult.HOME, "/home/testuser");
    assert.equal(sanitizedResult.PATH, "/usr/local/bin:/usr/bin");
    assert.equal(sanitizedResult.DISPLAY, ":0");
    assert.equal(sanitizedResult.CUSTOM_VAR, "atarashii-value");
    assert.equal(sanitizedResult.APPDIR, undefined);
    assert.equal(sanitizedResult.APPIMAGE, undefined);
    assert.equal(sanitizedResult.LD_LIBRARY_PATH, undefined);
    assert.equal(sanitizedResult.ARGV0, undefined);
    assert.equal(sanitizedResult.OWD, undefined);
  });
});
