/**
 * @module conversion-log
 * Log stream viewer displaying output from the live conversion backend.
 */

/**
 * Creates the conversion log display controller.
 * @returns {{setLog: Function, appendChunk: Function, clear: Function}} Conversion log controller.
 */
export function createConversionLog() {
  const logViewerElement = document.getElementById("conversion-log-viewer");

  /**
   * Scrolls the log container to the latest output.
   * @returns {void}
   */
  function scrollToBottom() {
    logViewerElement.scrollTop = logViewerElement.scrollHeight;
  }

  return {
    /**
     * Initializes the log with prior file contents.
     * @param {string} fullText - Log text content.
     * @returns {void}
     */
    setLog(fullText) {
      logViewerElement.textContent = fullText || "";
      scrollToBottom();
    },

    /**
     * Appends a streamed chunk to the log output.
     * @param {string} chunkText - Additional log characters.
     * @returns {void}
     */
    appendChunk(chunkText) {
      logViewerElement.textContent += chunkText;
      scrollToBottom();
    },

    /**
     * Clears all log entries.
     * @returns {void}
     */
    clear() {
      logViewerElement.textContent = "";
    },
  };
}
