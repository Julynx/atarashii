/**
 * @module syntax-highlighter
 * Syntax highlighting coordinator synchronizing styled backdrop tokens with editor textarea.
 */

import { Prism, escapeHtml } from "../../../assets/vendor/prism.mjs";

const MAXIMUM_HIGHLIGHTABLE_CHARACTER_COUNT = 100000;

/**
 * Creates the syntax highlighter controller.
 * @param {HTMLTextAreaElement} textareaElement - Editor textarea element.
 * @param {HTMLElement} syntaxBackdropElement - Syntax backdrop container behind textarea.
 * @returns {object} Syntax highlighter interface.
 */
export function createSyntaxHighlighter(textareaElement, syntaxBackdropElement) {
  let activeLanguage = "markdown";
  let cachedSourceText = null;
  let cachedRenderedHtml = null;

  /**
   * Synchronizes syntax backdrop padding with textarea scrollbar presence.
   * @returns {void}
   */
  function synchronizeLayout() {
    const scrollbarWidth = textareaElement.offsetWidth - textareaElement.clientWidth;
    syntaxBackdropElement.style.paddingRight = `${14 + scrollbarWidth}px`;
  }

  /**
   * Synchronizes syntax backdrop scroll position with textarea scroll position.
   * @returns {void}
   */
  function synchronizeScroll() {
    syntaxBackdropElement.scrollTop = textareaElement.scrollTop;
    syntaxBackdropElement.scrollLeft = textareaElement.scrollLeft;
  }

  /**
   * Generates highlighted HTML string from raw source code and active grammar.
   * @param {string} sourceText - Document raw text content.
   * @param {"markdown" | "css"} language - Target syntax language.
   * @returns {string} Safe syntax-highlighted HTML markup.
   */
  function renderSyntaxHtml(sourceText, language) {
    if (sourceText.length === 0) {
      return "";
    }

    if (sourceText.length > MAXIMUM_HIGHLIGHTABLE_CHARACTER_COUNT) {
      const escapedText = escapeHtml(sourceText);
      const trailingBreak = sourceText.endsWith("\n") ? "<br>" : "";
      return escapedText + trailingBreak;
    }

    const targetGrammar = Prism.languages[language];
    if (!targetGrammar) {
      const escapedFallback = escapeHtml(sourceText);
      const trailingBreak = sourceText.endsWith("\n") ? "<br>" : "";
      return escapedFallback + trailingBreak;
    }

    try {
      const highlightedMarkup = Prism.highlight(sourceText, targetGrammar, language);
      const trailingBreak = sourceText.endsWith("\n") ? "<br>" : "";
      return highlightedMarkup + trailingBreak;
    } catch (highlightError) {
      console.error(`Syntax highlighting failure for ${language}:`, highlightError);
      const escapedErrorFallback = escapeHtml(sourceText);
      const trailingBreak = sourceText.endsWith("\n") ? "<br>" : "";
      return escapedErrorFallback + trailingBreak;
    }
  }

  /**
   * Immediately executes DOM update with highlighted syntax markup.
   * @returns {void}
   */
  function executeRender() {
    synchronizeLayout();

    const currentText = textareaElement.value;
    if (currentText === cachedSourceText && cachedRenderedHtml !== null) {
      return;
    }

    const generatedHtml = renderSyntaxHtml(currentText, activeLanguage);
    cachedSourceText = currentText;
    cachedRenderedHtml = generatedHtml;

    syntaxBackdropElement.innerHTML = generatedHtml;
    synchronizeScroll();
  }

  /**
   * Updates syntax highlighting synchronously for instant response and zero typing flicker.
   * @param {"markdown" | "css"} [language] - Optional language override.
   * @returns {void}
   */
  function scheduleHighlight(language) {
    if (language && language !== activeLanguage) {
      activeLanguage = language;
      cachedSourceText = null;
    }

    executeRender();
  }

  /**
   * Sets the target syntax language and immediately updates highlighting.
   * @param {"markdown" | "css"} nextLanguage - Language to highlight.
   * @returns {void}
   */
  function setLanguage(nextLanguage) {
    if (activeLanguage === nextLanguage && cachedRenderedHtml !== null) {
      return;
    }

    activeLanguage = nextLanguage;
    cachedSourceText = null;
    executeRender();
  }

  /**
   * Synchronizes font size and calculated line height with syntax backdrop.
   * @param {number} fontSize - Font size in pixels.
   * @param {number} calculatedLineHeight - Line height in pixels.
   * @returns {void}
   */
  function applyFontSize(fontSize, calculatedLineHeight) {
    syntaxBackdropElement.style.fontSize = `${fontSize}px`;
    syntaxBackdropElement.style.lineHeight = `${calculatedLineHeight}px`;
    synchronizeLayout();
  }

  /**
   * Synchronizes line wrapping mode with syntax backdrop.
   * @param {boolean} isLineWrapEnabled - Whether line wrapping is active.
   * @returns {void}
   */
  function applyLineWrap(isLineWrapEnabled) {
    if (isLineWrapEnabled) {
      syntaxBackdropElement.classList.remove("no-wrap");
    } else {
      syntaxBackdropElement.classList.add("no-wrap");
    }
    synchronizeLayout();
  }

  /**
   * Forces an immediate syntax highlight re-render.
   * @returns {void}
   */
  function flushImmediate() {
    executeRender();
  }

  return {
    updateHighlight: scheduleHighlight,
    setLanguage,
    synchronizeScroll,
    synchronizeLayout,
    applyFontSize,
    applyLineWrap,
    flushImmediate,
  };
}
