/**
 * @module editor-syntax
 * Syntax highlighting controller that mirrors editor content into a tokenized backdrop rendered behind the textarea.
 */

import { escapeHtml } from "./html-escape.js";

const SYNTAX_RENDER_DEBOUNCE_MILLISECONDS = 80;
const SUPPORTED_LANGUAGES = ["markdown", "css"];

/**
 * Creates the editor syntax highlighting controller.
 * @param {HTMLTextAreaElement} textareaElement - Main editor textarea.
 * @param {HTMLElement} syntaxBackdropElement - Token highlighting backdrop element behind textarea.
 * @param {object} [prismInstance] - Optional Prism tokenizer override; defaults to the vendored global.
 * @returns {object} Syntax controller interface.
 */
export function createEditorSyntax(
  textareaElement,
  syntaxBackdropElement,
  prismInstance = null,
) {
  let activeLanguage = "markdown";
  let renderTimerIdentifier = null;
  let lastRenderedContent = null;
  let lastRenderedLanguage = null;

  /**
   * Resolves the Prism tokenizer instance used for tokenization.
   * @returns {object|null} Prism instance or null when unavailable.
   */
  function resolvePrismInstance() {
    if (prismInstance) {
      return prismInstance;
    }
    if (typeof window === "undefined") {
      return null;
    }
    return window.Prism || null;
  }

  /**
   * Resolves the Prism grammar registered for a document language.
   * @param {string} language - Language identifier such as "markdown" or "css".
   * @returns {object|null} Grammar definition or null when unavailable.
   */
  function resolveGrammar(language) {
    const prismTokenizer = resolvePrismInstance();
    if (!prismTokenizer || !prismTokenizer.languages) {
      return null;
    }
    return prismTokenizer.languages[language] || null;
  }

  /**
   * Synchronizes backdrop padding with textarea scrollbar presence.
   * @returns {void}
   */
  function synchronizeLayout() {
    const scrollbarWidth =
      textareaElement.offsetWidth - textareaElement.clientWidth;
    syntaxBackdropElement.style.paddingRight = `${14 + scrollbarWidth}px`;
  }

  /**
   * Synchronizes backdrop scroll offsets with textarea scroll offsets.
   * @returns {void}
   */
  function synchronizeScroll() {
    syntaxBackdropElement.scrollTop = textareaElement.scrollTop;
    syntaxBackdropElement.scrollLeft = textareaElement.scrollLeft;
  }

  /**
   * Builds the tokenized HTML representation of the given editor content.
   * @param {string} documentContent - Raw editor content to tokenize.
   * @returns {string} HTML string with token spans.
   */
  function buildTokenizedHtml(documentContent) {
    const prismTokenizer = resolvePrismInstance();
    const grammar = resolveGrammar(activeLanguage);

    let tokenizedHtml = "";
    if (prismTokenizer && grammar) {
      tokenizedHtml = prismTokenizer.highlight(
        documentContent,
        grammar,
        activeLanguage,
      );
    } else {
      tokenizedHtml = escapeHtml(documentContent);
    }

    if (documentContent.endsWith("\n")) {
      tokenizedHtml += "<br>";
    }
    return tokenizedHtml;
  }

  /**
   * Re-renders the backdrop with tokenized editor content.
   * Redundant renders for unchanged content and language are skipped.
   * @returns {void}
   */
  function renderSyntax() {
    clearTimeout(renderTimerIdentifier);
    renderTimerIdentifier = null;

    const documentContent = textareaElement.value;
    if (
      documentContent === lastRenderedContent &&
      activeLanguage === lastRenderedLanguage
    ) {
      return;
    }

    synchronizeLayout();
    syntaxBackdropElement.innerHTML = buildTokenizedHtml(documentContent);
    synchronizeScroll();
    lastRenderedContent = documentContent;
    lastRenderedLanguage = activeLanguage;
  }

  /**
   * Schedules a debounced backdrop re-render for typing workloads.
   * @returns {void}
   */
  function scheduleRenderSyntax() {
    clearTimeout(renderTimerIdentifier);
    renderTimerIdentifier = setTimeout(() => {
      renderSyntax();
    }, SYNTAX_RENDER_DEBOUNCE_MILLISECONDS);
  }

  /**
   * Switches the active highlighting grammar and re-renders immediately.
   * @param {"markdown" | "css"} language - Destination document language.
   * @returns {void}
   */
  function setLanguage(language) {
    if (!SUPPORTED_LANGUAGES.includes(language)) {
      throw new Error(`Unsupported syntax language: ${language}`);
    }
    activeLanguage = language;
    renderSyntax();
  }

  return {
    renderSyntax,
    scheduleRenderSyntax,
    setLanguage,
    synchronizeLayout,
    synchronizeScroll,
    /**
     * Returns the language currently used for tokenization.
     * @returns {"markdown" | "css"} Active language identifier.
     */
    getLanguage() {
      return activeLanguage;
    },
  };
}
