/**
 * @module formatter-service-test
 * Unit tests verifying markdown and css prettier auto-formatting routines.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { formatMarkdown, formatCss } = require("../src/main/formatter-service");

const dummyLogger = {
  info() {},
  warn() {},
  error() {},
};

describe("Formatter Service", () => {
  it("formats markdown using prettier", async () => {
    const rawMarkdown = "#  Heading 1\n\nSome text with spaces   \n\n";
    const formatted = await formatMarkdown(rawMarkdown, dummyLogger);

    assert.ok(formatted.includes("# Heading 1"));
    assert.ok(!formatted.includes("spaces   "));
  });

  it("formats css using prettier", async () => {
    const rawCss = "body{margin:0;color:red;}";
    const formatted = await formatCss(rawCss, dummyLogger);

    assert.ok(formatted.includes("margin: 0;"));
    assert.ok(formatted.includes("color: red;"));
  });

  it("falls back to raw text and logs warning when markdown formatting fails", async () => {
    let loggedWarning = "";
    const warningLogger = {
      warn(message) {
        loggedWarning = message;
      },
    };

    const invalidInput = null;
    const result = await formatMarkdown(invalidInput, warningLogger);
    assert.equal(result, null);
    assert.ok(loggedWarning.includes("Markdown formatting warning"));
  });
});
