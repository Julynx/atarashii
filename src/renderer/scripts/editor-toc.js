/**
 * @module editor-toc
 * Dynamic Table of Contents controller extracting Markdown headings and managing interactive navigation.
 */

/**
 * Extracts all valid ATX Markdown headings (H1 to H6), excluding code blocks and inline code.
 * @param {string} markdownContent - Raw Markdown source text.
 * @returns {Array<{level: number, title: string, lineIndex: number, lineNumber: number, charIndex: number}>} Extracted headings.
 */
export function extractMarkdownHeadings(markdownContent) {
  const headings = [];
  const lines = markdownContent.split("\n");

  let isInsideFencedCodeBlock = false;
  let activeFenceCharacter = "";
  let activeFenceLength = 0;
  let isInsideHtmlBlock = false;
  let openInlineBacktickLength = 0;
  let characterOffset = 0;

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const currentLine = lines[lineIndex];
    const trimmedLine = currentLine.trim();

    const fencedBlockMatch = currentLine.match(/^[ ]{0,3}(`{3,}|~{3,})/);
    if (fencedBlockMatch) {
      const detectedFenceChar = fencedBlockMatch[1][0];
      const detectedFenceLength = fencedBlockMatch[1].length;

      if (!isInsideFencedCodeBlock) {
        isInsideFencedCodeBlock = true;
        activeFenceCharacter = detectedFenceChar;
        activeFenceLength = detectedFenceLength;
        characterOffset += currentLine.length + 1;
        continue;
      }

      if (
        detectedFenceChar === activeFenceCharacter &&
        detectedFenceLength >= activeFenceLength
      ) {
        isInsideFencedCodeBlock = false;
        activeFenceCharacter = "";
        activeFenceLength = 0;
        characterOffset += currentLine.length + 1;
        continue;
      }
    }

    if (isInsideFencedCodeBlock) {
      characterOffset += currentLine.length + 1;
      continue;
    }

    if (/<pre\b|<code\b/i.test(currentLine)) {
      isInsideHtmlBlock = true;
    }

    if (isInsideHtmlBlock) {
      if (/<\/pre>|<\/code>/i.test(currentLine)) {
        isInsideHtmlBlock = false;
      }
      characterOffset += currentLine.length + 1;
      continue;
    }

    if (trimmedLine === "") {
      openInlineBacktickLength = 0;
      characterOffset += currentLine.length + 1;
      continue;
    }

    if (openInlineBacktickLength > 0) {
      const closingPattern = new RegExp(
        `(?<!\`)\`{${openInlineBacktickLength}}(?!\`)`,
      );
      if (closingPattern.test(currentLine)) {
        openInlineBacktickLength = 0;
      }
      characterOffset += currentLine.length + 1;
      continue;
    }

    const headingMatch = currentLine.match(/^[ ]{0,3}(#{1,6})(?:[ \t]+(.*)|$)/);
    if (headingMatch) {
      const headingLevel = headingMatch[1].length;
      const rawTitle = headingMatch[2] || "";
      const strippedTitle = rawTitle.replace(/[ \t]+#+[ \t]*$/, "").trim();

      headings.push({
        level: headingLevel,
        title: strippedTitle,
        lineIndex,
        lineNumber: lineIndex + 1,
        charIndex: characterOffset,
      });
    } else {
      const backtickMatches = [...currentLine.matchAll(/`+/g)];
      let activeDelimiter = null;

      for (const delimiterMatch of backtickMatches) {
        const delimiterRun = delimiterMatch[0];
        if (!activeDelimiter) {
          activeDelimiter = delimiterRun;
        } else if (activeDelimiter === delimiterRun) {
          activeDelimiter = null;
        }
      }

      if (activeDelimiter) {
        openInlineBacktickLength = activeDelimiter.length;
      }
    }

    characterOffset += currentLine.length + 1;
  }

  return headings;
}

/**
 * Creates the Table of Contents controller for the Markdown editor.
 * @param {HTMLTextAreaElement} textareaElement - Main editor textarea.
 * @param {HTMLElement} lineGutterElement - Line numbers gutter container.
 * @param {{closeDialog: Function}} [searchController] - Search controller instance for mutual dialog closing.
 * @returns {object} Table of Contents controller interface.
 */
export function createEditorToc(
  textareaElement,
  lineGutterElement,
  searchController,
) {
  const toggleButton = document.getElementById("editor-toc-toggle-button");
  const tocDialog = document.getElementById("editor-toc-dialog");
  const tocListElement = document.getElementById("editor-toc-list");

  /**
   * Smoothly scrolls and focuses the editor on the target heading.
   * @param {{lineIndex: number, charIndex: number}} heading - Target heading descriptor.
   * @returns {void}
   */
  function navigateToHeading(heading) {
    const gutterChildren = lineGutterElement.children;
    const targetGutterChild = gutterChildren[heading.lineIndex];
    const baseGutterChild = gutterChildren[0];

    if (targetGutterChild) {
      const baseOffsetTop = baseGutterChild ? baseGutterChild.offsetTop : 0;
      const headingPixelTop = targetGutterChild.offsetTop - baseOffsetTop;
      const headingPixelHeight = targetGutterChild.offsetHeight;
      const currentScrollTop = textareaElement.scrollTop;
      const visibleViewportHeight = textareaElement.clientHeight;

      const isComfortablyVisible =
        headingPixelTop >= currentScrollTop + 40 &&
        headingPixelTop + headingPixelHeight <=
          currentScrollTop + visibleViewportHeight - 40;

      if (!isComfortablyVisible) {
        const targetScrollPosition = Math.max(
          0,
          headingPixelTop - Math.floor(visibleViewportHeight / 3),
        );
        textareaElement.scrollTo({
          top: targetScrollPosition,
          behavior: "smooth",
        });
      }
    }

    textareaElement.focus({ preventScroll: true });
    textareaElement.setSelectionRange(heading.charIndex, heading.charIndex);
    closeDialog();
  }

  /**
   * Parses the active document and renders the table of contents item list.
   * @returns {void}
   */
  function renderHeadingsList() {
    const markdownSource = textareaElement.value;
    const extractedHeadings = extractMarkdownHeadings(markdownSource);

    if (extractedHeadings.length === 0) {
      const emptyStateElement = document.createElement("div");
      emptyStateElement.className = "toc-empty-state";
      emptyStateElement.textContent = "No headings found";
      tocListElement.replaceChildren(emptyStateElement);
      return;
    }

    const fragment = document.createDocumentFragment();

    for (const heading of extractedHeadings) {
      const headingButton = document.createElement("button");
      headingButton.className = `toc-item toc-level-${heading.level}`;
      headingButton.type = "button";
      headingButton.title = heading.title || "Untitled";
      headingButton.setAttribute("data-line-index", String(heading.lineIndex));

      const titleLabel = document.createElement("span");
      titleLabel.className = "toc-item-text";
      titleLabel.textContent = heading.title || "Untitled";

      headingButton.appendChild(titleLabel);
      headingButton.addEventListener("click", () =>
        navigateToHeading(heading),
      );
      fragment.appendChild(headingButton);
    }

    tocListElement.replaceChildren(fragment);
  }

  /**
   * Opens the Table of Contents popup dialog.
   * @returns {void}
   */
  function openDialog() {
    if (searchController && typeof searchController.closeDialog === "function") {
      searchController.closeDialog();
    }

    tocDialog.hidden = false;
    toggleButton.classList.add("active");
    renderHeadingsList();
  }

  /**
   * Closes the Table of Contents popup dialog.
   * @returns {void}
   */
  function closeDialog() {
    tocDialog.hidden = true;
    toggleButton.classList.remove("active");
  }

  /**
   * Toggles Table of Contents dialog visibility.
   * @returns {void}
   */
  function toggleDialog() {
    if (tocDialog.hidden) {
      openDialog();
    } else {
      closeDialog();
    }
  }

  /**
   * Sets toggle button visibility depending on active tab.
   * @param {boolean} isVisible - Whether the Markdown tab is active.
   * @returns {void}
   */
  function setVisible(isVisible) {
    toggleButton.hidden = !isVisible;
    if (!isVisible) {
      closeDialog();
    }
  }

  /**
   * Refreshes table of contents dynamically when the dialog is currently open.
   * @returns {void}
   */
  function refreshIfOpen() {
    if (!tocDialog.hidden) {
      renderHeadingsList();
    }
  }

  toggleButton.addEventListener("click", toggleDialog);

  window.addEventListener("click", (windowClickEvent) => {
    if (
      !tocDialog.hidden &&
      !tocDialog.contains(windowClickEvent.target) &&
      !toggleButton.contains(windowClickEvent.target)
    ) {
      closeDialog();
    }
  });

  window.addEventListener("keydown", (keyboardEvent) => {
    if (keyboardEvent.key === "Escape" && !tocDialog.hidden) {
      keyboardEvent.preventDefault();
      closeDialog();
      textareaElement.focus();
    }
  });

  return {
    openDialog,
    closeDialog,
    toggleDialog,
    setVisible,
    refreshIfOpen,
    isDialogOpen() {
      return !tocDialog.hidden;
    },
    getHeadings() {
      return extractMarkdownHeadings(textareaElement.value);
    },
  };
}
