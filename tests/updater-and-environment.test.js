/**
 * @module updater-and-environment-test
 * Unit tests verifying version comparison, cross-platform PATH merging, and platform requirement utilities.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { compareVersions } = require("../src/main/updater");
const {
  mergePathValues,
  getStandardLinuxBinaryPaths,
  resolvePathSettings,
} = require("../src/main/environment");
const {
  createSystemRequirements,
  getUvInstallSteps,
} = require("../src/main/requirements");

describe("Version Comparison and Environment Utilities", () => {
  it("compares semantic versions correctly", () => {
    assert.ok(compareVersions("1.0.0", "1.0.1") < 0);
    assert.ok(compareVersions("2.1.0", "2.0.9") > 0);
    assert.equal(compareVersions("1.2.3", "1.2.3"), 0);
    assert.ok(compareVersions("1.2", "1.2.1") < 0);
  });

  it("merges PATH values eliminating duplicates while preserving order", () => {
    const listA = "C:\\Tools;C:\\Python";
    const listB = "C:\\python;C:\\Program Files;C:\\Tools";
    const merged = mergePathValues([listA, listB]);

    assert.equal(merged, "C:\\Tools;C:\\Python;C:\\Program Files");
  });

  it("merges Linux PATH values using colon delimiter and preserves case sensitivity", () => {
    const linuxPathA = "/home/user/.local/bin:/usr/bin";
    const linuxPathB = "/usr/local/bin:/home/user/.local/bin:/usr/bin";
    const merged = mergePathValues([linuxPathA, linuxPathB], { delimiter: ":", caseInsensitive: false });

    assert.equal(merged, "/home/user/.local/bin:/usr/bin:/usr/local/bin");
  });

  it("resolves appropriate path settings based on delimiters", () => {
    const windowsSettings = resolvePathSettings(["C:\\Tools;C:\\Python"]);
    assert.equal(windowsSettings.delimiter, ";");
    assert.equal(windowsSettings.caseInsensitive, true);

    const linuxSettings = resolvePathSettings(["/usr/bin:/bin"], "linux");
    assert.equal(linuxSettings.delimiter, ":");
    assert.equal(linuxSettings.caseInsensitive, false);
  });

  it("returns standard Linux binary paths containing local and cargo directories", () => {
    const standardPaths = getStandardLinuxBinaryPaths("/home/tester");
    assert.ok(standardPaths.includes("/home/tester/.local/bin"));
    assert.ok(standardPaths.includes("/home/tester/.cargo/bin"));
    assert.ok(standardPaths.includes("/usr/local/bin"));
    assert.ok(standardPaths.includes("/usr/bin"));
    assert.ok(standardPaths.includes("/bin"));
  });

  it("generates Windows-specific uv installation steps using winget", () => {
    const windowsSteps = getUvInstallSteps("win32");
    assert.equal(windowsSteps.length, 1);
    assert.equal(windowsSteps[0].command, "winget");
    assert.ok(windowsSteps[0].args.includes("astral-sh.uv"));
  });

  it("generates Linux-specific uv installation steps using official script", () => {
    const linuxSteps = getUvInstallSteps("linux");
    assert.equal(linuxSteps.length, 1);
    assert.equal(linuxSteps[0].command, "sh");
    assert.ok(linuxSteps[0].args.some((arg) => arg.includes("astral.sh/uv/install.sh")));
  });

  it("creates system requirements tailored to platform parameter", () => {
    const winRequirements = createSystemRequirements("win32");
    const uvWin = winRequirements.find((item) => item.id === "uv");
    assert.equal(uvWin.installSteps[0].command, "winget");

    const linuxRequirements = createSystemRequirements("linux");
    const uvLinux = linuxRequirements.find((item) => item.id === "uv");
    assert.equal(uvLinux.installSteps[0].command, "sh");
  });
});
