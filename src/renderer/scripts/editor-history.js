/**
 * @module editor-history
 * Manages document undo and redo history states with cursor position restoration.
 */

const DEFAULT_MAX_HISTORY_ENTRIES = 300;
const CONSECUTIVE_INPUT_MERGE_WINDOW_MS = 400;

/**
 * Creates an independent document history buffer.
 * @param {string} [initialContent=""] - Starting document text.
 * @param {number} [maxEntries=DEFAULT_MAX_HISTORY_ENTRIES] - Maximum stored history states.
 * @returns {object} Document history controller interface.
 */
export function createDocumentHistoryBuffer(initialContent = "", maxEntries = DEFAULT_MAX_HISTORY_ENTRIES) {
  let states = [
    {
      content: initialContent,
      selectionStart: 0,
      selectionEnd: 0,
      timestamp: Date.now(),
    },
  ];
  let activeIndex = 0;

  /**
   * Records a new document snapshot into the history stack.
   * @param {string} content - Current document text.
   * @param {number} selectionStart - Cursor or selection start index.
   * @param {number} selectionEnd - Cursor or selection end index.
   * @param {boolean} [allowGrouping=false] - Whether rapid consecutive keystrokes can be grouped.
   * @returns {void}
   */
  function pushSnapshot(content, selectionStart, selectionEnd, allowGrouping = false) {
    const currentState = states[activeIndex];

    if (currentState && currentState.content === content) {
      currentState.selectionStart = selectionStart;
      currentState.selectionEnd = selectionEnd;
      return;
    }

    const elapsed = Date.now() - (currentState ? currentState.timestamp : 0);
    const lengthDifference = currentState ? Math.abs(content.length - currentState.content.length) : 0;
    const isSingleCharEdit = lengthDifference === 1;

    if (allowGrouping && currentState && elapsed < CONSECUTIVE_INPUT_MERGE_WINDOW_MS && isSingleCharEdit) {
      currentState.content = content;
      currentState.selectionStart = selectionStart;
      currentState.selectionEnd = selectionEnd;
      currentState.timestamp = Date.now();
      return;
    }

    states = states.slice(0, activeIndex + 1);
    states.push({
      content,
      selectionStart,
      selectionEnd,
      timestamp: Date.now(),
    });

    if (states.length > maxEntries) {
      states.shift();
    }

    activeIndex = states.length - 1;
  }

  /**
   * Determines whether an undo operation can be performed.
   * @returns {boolean} True if previous states exist.
   */
  function canUndo() {
    return activeIndex > 0;
  }

  /**
   * Determines whether a redo operation can be performed.
   * @returns {boolean} True if forward states exist.
   */
  function canRedo() {
    return activeIndex < states.length - 1;
  }

  /**
   * Reverts to the previous document state in history.
   * @returns {object|null} Previous snapshot or null if unavailable.
   */
  function undo() {
    if (!canUndo()) {
      return null;
    }
    activeIndex -= 1;
    return states[activeIndex];
  }

  /**
   * Advances to the next document state in history.
   * @returns {object|null} Forward snapshot or null if unavailable.
   */
  function redo() {
    if (!canRedo()) {
      return null;
    }
    activeIndex += 1;
    return states[activeIndex];
  }

  /**
   * Resets history to a single baseline document state.
   * @param {string} content - New baseline content.
   * @returns {void}
   */
  function reset(content) {
    states = [
      {
        content,
        selectionStart: 0,
        selectionEnd: 0,
        timestamp: Date.now(),
      },
    ];
    activeIndex = 0;
  }

  return {
    pushSnapshot,
    canUndo,
    canRedo,
    undo,
    redo,
    reset,
    getCurrentState() {
      return states[activeIndex];
    },
    getStateCount() {
      return states.length;
    },
    getActiveIndex() {
      return activeIndex;
    },
  };
}
