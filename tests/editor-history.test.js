/**
 * @module editor-history-test
 * Unit tests verifying undo and redo stack behavior, state grouping, and independent document buffers.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

describe("Editor History Buffer", () => {
  it("initializes with baseline content and zero undo availability", async () => {
    const { createDocumentHistoryBuffer } = await import("../src/renderer/scripts/editor-history.js");
    const history = createDocumentHistoryBuffer("# Initial Title");

    assert.equal(history.canUndo(), false);
    assert.equal(history.canRedo(), false);
    assert.equal(history.getCurrentState().content, "# Initial Title");
  });

  it("pushes snapshots and supports undo and redo operations", async () => {
    const { createDocumentHistoryBuffer } = await import("../src/renderer/scripts/editor-history.js");
    const history = createDocumentHistoryBuffer("Version 1");

    history.pushSnapshot("Version 2", 9, 9, false);
    assert.equal(history.canUndo(), true);
    assert.equal(history.canRedo(), false);

    history.pushSnapshot("Version 3", 9, 9, false);
    assert.equal(history.getCurrentState().content, "Version 3");

    const revertedState = history.undo();
    assert.equal(revertedState.content, "Version 2");
    assert.equal(history.canUndo(), true);
    assert.equal(history.canRedo(), true);

    const initialRevertedState = history.undo();
    assert.equal(initialRevertedState.content, "Version 1");
    assert.equal(history.canUndo(), false);
    assert.equal(history.canRedo(), true);

    const redoneState = history.redo();
    assert.equal(redoneState.content, "Version 2");
    assert.equal(history.canUndo(), true);
    assert.equal(history.canRedo(), true);
  });

  it("truncates forward redo stack when new edits occur after undo", async () => {
    const { createDocumentHistoryBuffer } = await import("../src/renderer/scripts/editor-history.js");
    const history = createDocumentHistoryBuffer("A");

    history.pushSnapshot("B", 1, 1, false);
    history.pushSnapshot("C", 1, 1, false);

    history.undo();
    assert.equal(history.getCurrentState().content, "B");
    assert.equal(history.canRedo(), true);

    history.pushSnapshot("D", 1, 1, false);
    assert.equal(history.getCurrentState().content, "D");
    assert.equal(history.canRedo(), false);
    assert.equal(history.redo(), null);

    history.undo();
    assert.equal(history.getCurrentState().content, "B");
  });

  it("maintains separate, independent histories for different documents", async () => {
    const { createDocumentHistoryBuffer } = await import("../src/renderer/scripts/editor-history.js");
    const markdownHistory = createDocumentHistoryBuffer("# Markdown");
    const cssHistory = createDocumentHistoryBuffer("body { color: white; }");

    markdownHistory.pushSnapshot("# Markdown Updated", 18, 18, false);
    cssHistory.pushSnapshot("body { color: black; }", 22, 22, false);

    assert.equal(markdownHistory.canUndo(), true);
    assert.equal(cssHistory.canUndo(), true);

    markdownHistory.undo();
    assert.equal(markdownHistory.getCurrentState().content, "# Markdown");
    assert.equal(cssHistory.getCurrentState().content, "body { color: black; }");

    cssHistory.undo();
    assert.equal(cssHistory.getCurrentState().content, "body { color: white; }");
  });
});
