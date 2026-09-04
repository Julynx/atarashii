/**
 * @module editor-search
 * Document text search controller managing match highlighting, case sensitivity, and coincidence navigation.
 */

/**
 * Escapes characters with special meaning in HTML strings.
 * @param {string} sourceText - Raw text to escape.
 * @returns {string} HTML-escaped string.
 */
function escapeHtml(sourceText) {
  return sourceText
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Creates the editor search controller.
 * @param {HTMLTextAreaElement} textareaElement - Main editor textarea.
 * @param {HTMLElement} backdropElement - Highlighting backdrop element behind textarea.
 * @returns {object} Search controller interface.
 */
export function createEditorSearch(textareaElement, backdropElement) {
  const toggleButton = document.getElementById("editor-search-toggle-button");
  const searchDialog = document.getElementById("editor-search-dialog");
  const searchInput = document.getElementById("editor-search-input");
  const clearButton = document.getElementById("editor-search-clear-button");
  const caseButton = document.getElementById("editor-search-case-button");
  const counterLabel = document.getElementById("editor-search-counter");
  const prevButton = document.getElementById("editor-search-prev-button");
  const nextButton = document.getElementById("editor-search-next-button");
  const closeButton = document.getElementById("editor-search-close-button");

  let isCaseSensitive = false;
  let matches = [];
  let activeMatchIndex = -1;

  /**
   * Synchronizes backdrop padding with textarea scrollbar presence.
   * @returns {void}
   */
  function synchronizeLayout() {
    const scrollbarWidth = textareaElement.offsetWidth - textareaElement.clientWidth;
    backdropElement.style.paddingRight = `${14 + scrollbarWidth}px`;
  }

  /**
   * Synchronizes backdrop scroll offsets with textarea scroll offsets.
   * @returns {void}
   */
  function synchronizeScroll() {
    backdropElement.scrollTop = textareaElement.scrollTop;
    backdropElement.scrollLeft = textareaElement.scrollLeft;
  }

  /**
   * Scrolls the active coincidence into visible textarea view.
   * @returns {void}
   */
  function scrollActiveMatchIntoView() {
    const activeHighlightElement = backdropElement.querySelector(".search-highlight.active-highlight");
    if (!activeHighlightElement) {
      return;
    }

    const highlightTop = activeHighlightElement.offsetTop;
    const highlightHeight = activeHighlightElement.offsetHeight;
    const currentScrollTop = textareaElement.scrollTop;
    const visibleHeight = textareaElement.clientHeight;

    if (highlightTop < currentScrollTop + 40 || highlightTop + highlightHeight > currentScrollTop + visibleHeight - 40) {
      const centeredScroll = Math.max(0, highlightTop - Math.floor(visibleHeight / 2));
      textareaElement.scrollTop = centeredScroll;
    }
  }

  /**
   * Re-renders backdrop HTML content with highlighted search coincidences.
   * @returns {void}
   */
  function renderBackdrop() {
    synchronizeLayout();
    const documentContent = textareaElement.value;

    if (matches.length === 0 || activeMatchIndex === -1) {
      const trailingBreak = documentContent.endsWith("\n") ? "<br>" : "";
      backdropElement.innerHTML = escapeHtml(documentContent) + trailingBreak;
      return;
    }

    let assembledHtml = "";
    let cursorIndex = 0;

    for (let index = 0; index < matches.length; index += 1) {
      const match = matches[index];
      const leadingSlice = documentContent.substring(cursorIndex, match.start);
      const matchedSlice = documentContent.substring(match.start, match.end);
      const isActive = index === activeMatchIndex;
      const highlightClass = isActive ? "search-highlight active-highlight" : "search-highlight";

      assembledHtml += escapeHtml(leadingSlice);
      assembledHtml += `<mark class="${highlightClass}">${escapeHtml(matchedSlice)}</mark>`;
      cursorIndex = match.end;
    }

    assembledHtml += escapeHtml(documentContent.substring(cursorIndex));
    if (documentContent.endsWith("\n")) {
      assembledHtml += "<br>";
    }

    backdropElement.innerHTML = assembledHtml;
  }

  /**
   * Updates coincidence counter display and synchronizes active highlight.
   * @returns {void}
   */
  function updateHighlightsAndScroll() {
    if (matches.length === 0) {
      counterLabel.textContent = "0 / 0";
      activeMatchIndex = -1;
      renderBackdrop();
      return;
    }

    counterLabel.textContent = `${activeMatchIndex + 1} / ${matches.length}`;
    renderBackdrop();
    scrollActiveMatchIntoView();

    const activeMatch = matches[activeMatchIndex];
    if (activeMatch) {
      textareaElement.setSelectionRange(activeMatch.start, activeMatch.end);
    }
  }

  /**
   * Executes search query across the current document content.
   * @returns {void}
   */
  function executeSearch() {
    const rawQuery = searchInput.value;
    clearButton.hidden = rawQuery.length === 0;

    if (rawQuery.length === 0) {
      matches = [];
      activeMatchIndex = -1;
      counterLabel.textContent = "0 / 0";
      renderBackdrop();
      return;
    }

    const documentContent = textareaElement.value;
    const targetHaystack = isCaseSensitive ? documentContent : documentContent.toLowerCase();
    const targetNeedle = isCaseSensitive ? rawQuery : rawQuery.toLowerCase();

    const collectedMatches = [];
    let searchStartIndex = 0;

    while (searchStartIndex < targetHaystack.length) {
      const occurrenceIndex = targetHaystack.indexOf(targetNeedle, searchStartIndex);
      if (occurrenceIndex === -1) {
        break;
      }

      collectedMatches.push({
        start: occurrenceIndex,
        end: occurrenceIndex + targetNeedle.length,
      });

      searchStartIndex = occurrenceIndex + Math.max(1, targetNeedle.length);
    }

    matches = collectedMatches;

    if (matches.length === 0) {
      activeMatchIndex = -1;
      counterLabel.textContent = "0 / 0";
      renderBackdrop();
      return;
    }

    activeMatchIndex = 0;
    updateHighlightsAndScroll();
  }

  /**
   * Navigates to the next search coincidence.
   * @returns {void}
   */
  function navigateNext() {
    if (matches.length === 0) {
      return;
    }
    activeMatchIndex = (activeMatchIndex + 1) % matches.length;
    updateHighlightsAndScroll();
  }

  /**
   * Navigates to the previous search coincidence.
   * @returns {void}
   */
  function navigatePrevious() {
    if (matches.length === 0) {
      return;
    }
    activeMatchIndex = (activeMatchIndex - 1 + matches.length) % matches.length;
    updateHighlightsAndScroll();
  }

  /**
   * Clears all search highlights and resets coincidence counter.
   * @returns {void}
   */
  function clearHighlights() {
    matches = [];
    activeMatchIndex = -1;
    counterLabel.textContent = "0 / 0";
    renderBackdrop();
  }

  /**
   * Displays the search dialog and focuses the query input.
   * @returns {void}
   */
  function openDialog() {
    searchDialog.hidden = false;
    toggleButton.classList.add("active");
    searchInput.focus();
    searchInput.select();
    executeSearch();
  }

  /**
   * Hides the search dialog and removes active highlights.
   * @returns {void}
   */
  function closeDialog() {
    searchDialog.hidden = true;
    toggleButton.classList.remove("active");
    clearHighlights();
    textareaElement.focus();
  }

  toggleButton.addEventListener("click", () => {
    if (searchDialog.hidden) {
      openDialog();
    } else {
      closeDialog();
    }
  });

  searchInput.addEventListener("input", executeSearch);

  clearButton.addEventListener("click", () => {
    searchInput.value = "";
    executeSearch();
    searchInput.focus();
  });

  caseButton.addEventListener("click", () => {
    isCaseSensitive = !isCaseSensitive;
    caseButton.classList.toggle("active", isCaseSensitive);
    caseButton.setAttribute("aria-pressed", isCaseSensitive ? "true" : "false");
    executeSearch();
  });

  prevButton.addEventListener("click", navigatePrevious);
  nextButton.addEventListener("click", navigateNext);
  closeButton.addEventListener("click", closeDialog);

  searchDialog.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      closeDialog();
    }
  });

  searchInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      if (event.shiftKey) {
        navigatePrevious();
      } else {
        navigateNext();
      }
    }
  });

  window.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "f") {
      const mainScreenElement = document.getElementById("screen-main");
      if (mainScreenElement && !mainScreenElement.hidden) {
        event.preventDefault();
        openDialog();
      }
    }
  });

  window.addEventListener("resize", () => {
    synchronizeLayout();
  });

  return {
    openDialog,
    closeDialog,
    refreshSearch() {
      if (!searchDialog.hidden) {
        executeSearch();
      } else {
        renderBackdrop();
      }
    },
    synchronizeScroll,
    synchronizeLayout,
    isDialogOpen() {
      return !searchDialog.hidden;
    },
    getMatchCount() {
      return matches.length;
    },
    getActiveIndex() {
      return activeMatchIndex;
    },
  };
}
