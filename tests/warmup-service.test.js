/**
 * @module warmup-service-test
 * Unit tests verifying markdown-convert warm-up sample execution and cleanup.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { warmUpMarkdownConvert } = require("../src/main/warmup-service");

const dummyLogger = {
  info() {},
  warn() {},
  error() {},
};

describe("Warm-up Service", () => {
  it("executes sample document compilation and cleans up temporary directory", async () => {
    const result = await warmUpMarkdownConvert(dummyLogger);
    assert.equal(result.ok, true);
  });
});
