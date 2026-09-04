/**
 * @module formatter-service
 * Source code auto-formatting service for Markdown and CSS documents.
 */

const { lint } = require("markdownlint/sync");
const { applyFixes } = require("markdownlint");
const prettier = require("prettier");

/**
 * Formats Markdown text using markdownlint automated fixes.
 * @param {string} rawMarkdownText - Unformatted markdown source code.
 * @param {{warn: Function}} logger - Logging service.
 * @returns {string} Formatted markdown source code.
 */
function formatMarkdown(rawMarkdownText, logger) {
  try {
    const lintResults = lint({ strings: { source: rawMarkdownText } });
    const fileFixes = lintResults.source;
    if (!fileFixes || fileFixes.length === 0) {
      return rawMarkdownText;
    }
    return applyFixes(rawMarkdownText, fileFixes);
  } catch (formattingError) {
    logger.warn(`Markdown formatting warning: ${formattingError.message}`);
    return rawMarkdownText;
  }
}

/**
 * Formats CSS text using Prettier.
 * @param {string} rawCssText - Unformatted CSS source code.
 * @param {{warn: Function}} logger - Logging service.
 * @returns {Promise<string>} Formatted CSS source code.
 */
async function formatCss(rawCssText, logger) {
  try {
    return await prettier.format(rawCssText, { parser: "css" });
  } catch (formattingError) {
    logger.warn(`CSS formatting warning: ${formattingError.message}`);
    return rawCssText;
  }
}

module.exports = { formatMarkdown, formatCss };
