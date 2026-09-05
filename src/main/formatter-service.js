/**
 * @module formatter-service
 * Source code auto-formatting service for Markdown and CSS documents using Prettier.
 */

const prettier = require("prettier");

/**
 * Formats Markdown text using Prettier.
 * @param {string} rawMarkdownText - Unformatted markdown source code.
 * @param {{warn: Function}} logger - Logging service.
 * @returns {Promise<string>} Formatted markdown source code.
 */
async function formatMarkdown(rawMarkdownText, logger) {
  try {
    return await prettier.format(rawMarkdownText, { parser: "markdown" });
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
