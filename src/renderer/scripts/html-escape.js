/**
 * @module html-escape
 * Utilities for safely embedding raw text within HTML strings.
 */

/**
 * Escapes characters with special meaning in HTML strings.
 * @param {string} sourceText - Raw text to escape.
 * @returns {string} HTML-escaped string.
 */
export function escapeHtml(sourceText) {
  return sourceText
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
