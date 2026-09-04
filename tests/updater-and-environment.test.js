/**
 * @module updater-and-environment-test
 * Unit tests verifying version comparison and PATH merging utilities.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { compareVersions } = require("../src/main/updater");
const { mergePathValues } = require("../src/main/environment");

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
});
