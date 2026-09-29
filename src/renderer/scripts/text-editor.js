/**
 * @module text-editor
 * Source text editor component managing document tabs, line numbers, indentation, manual formatting, search, and undo/redo history.
 */

import { createEditorSearch } from "./editor-search.js";
import { createEditorToc } from "./editor-toc.js";
import { createDocumentHistoryBuffer } from "./editor-history.js";
import { createSyntaxHighlighter } from "./syntax-highlighter.js";

const AUTOSAVE_DEBOUNCE_MILLISECONDS = 500;

/**
 * Creates the text editor component.
 * @param {ReturnType<typeof import("./error-modal").createErrorModal>} errorModal - Error modal instance.
 * @returns {{setProject: Function, flushPendingSave: Function}} Text editor controller instance.
 */
export function createTextEditor(errorModal) {
  const textareaElement = document.getElementById("editor-textarea");
  const searchBackdropElement = document.getElementById(
    "editor-search-backdrop",
  );
  const syntaxBackdropElement = document.getElementById(
    "editor-syntax-backdrop",
  );
  const lineGutterElement = document.getElementById("editor-line-gutter");
  const markdownTabButton = document.getElementById("tab-document-markdown");
  const cssTabButton = document.getElementById("tab-document-css");
  const openAssetsButton = document.getElementById("button-open-assets");
  const saveIndicatorElement = document.getElementById("editor-save-indicator");

  const zoomInButton = document.getElementById("editor-zoom-in-button");
  const zoomOutButton = document.getElementById("editor-zoom-out-button");
  const optionsMenuButton = document.getElementById(
    "editor-options-menu-button",
  );
  const optionsDropdown = document.getElementById("editor-options-dropdown");
  const toggleLineWrapButton = document.getElementById(
    "editor-toggle-linewrap",
  );
  const undoMenuItem = document.getElementById("editor-menu-undo");
  const redoMenuItem = document.getElementById("editor-menu-redo");
  const formatMenuItem = document.getElementById("editor-menu-format");

  const lineMeasurerElement = document.createElement("div");
  lineMeasurerElement.setAttribute("aria-hidden", "true");
  lineMeasurerElement.style.position = "absolute";
  lineMeasurerElement.style.visibility = "hidden";
  lineMeasurerElement.style.pointerEvents = "none";
  lineMeasurerElement.style.top = "-99999px";
  lineMeasurerElement.style.left = "-99999px";
  lineMeasurerElement.style.overflow = "hidden";
  lineMeasurerElement.style.fontFamily = 'Consolas, "Courier New", monospace';
  lineMeasurerElement.style.tabSize = "2";
  lineMeasurerElement.style.whiteSpace = "pre-wrap";
  lineMeasurerElement.style.wordBreak = "break-word";
  lineMeasurerElement.style.boxSizing = "border-box";
  document.body.appendChild(lineMeasurerElement);

  let tocController = null;

  const searchController = createEditorSearch(
    textareaElement,
    searchBackdropElement,
    () => {
      if (tocController) {
        tocController.closeDialog();
      }
    },
  );

  tocController = createEditorToc(
    textareaElement,
    lineGutterElement,
    searchController,
  );
  const syntaxHighlighter = createSyntaxHighlighter(
    textareaElement,
    syntaxBackdropElement,
  );
  const markdownHistory = createDocumentHistoryBuffer("");
  const cssHistory = createDocumentHistoryBuffer("");

  let currentProjectPath = "";
  let activeMarkdownFileName = "document.md";
  let activeCssFileName = "style.css";
  let currentAssetsDirectoryPath = "";
  let activeFileType = "markdown";

  let editorFontSize = 13;
  let isLineWrapEnabled = true;

  let markdownBuffer = "";
  let cssBuffer = "";

  let autosaveTimerIdentifier = null;
  let saveIndicatorHideTimerIdentifier = null;

  /**
   * Returns the history controller associated with the active document tab.
   * @returns {ReturnType<typeof createDocumentHistoryBuffer>} Active history buffer.
   */
  function getActiveHistory() {
    return activeFileType === "markdown" ? markdownHistory : cssHistory;
  }

  /**
   * Synchronizes the enabled states of the dropdown undo and redo buttons.
   * @returns {void}
   */
  function updateMenuState() {
    const activeHistory = getActiveHistory();
    if (undoMenuItem) {
      undoMenuItem.disabled = !activeHistory.canUndo();
    }
    if (redoMenuItem) {
      redoMenuItem.disabled = !activeHistory.canRedo();
    }
  }

  let cachedPreviousLines = null;
  let cachedMeasuredHeights = [];
  let cachedMeasureClientWidth = 0;
  let cachedMeasureFontSize = 0;
  let cachedMeasureLineWrap = true;
  let cachedCharWidth = 0;
  let cachedCharWidthFontSize = 0;
  let cachedTextareaClientWidth = 0;

  /**
   * Retrieves the textarea client width, using cached layout measurement when available.
   * @returns {number} Textarea client width in pixels.
   */
  function getTextareaClientWidth() {
    if (cachedTextareaClientWidth > 0) {
      return cachedTextareaClientWidth;
    }
    cachedTextareaClientWidth = textareaElement.clientWidth;
    return cachedTextareaClientWidth;
  }

  /**
   * Calculates the monospace character width for the active editor font size.
   * @param {number} fontSize - Active editor font size in pixels.
   * @returns {number} Measured character width in pixels.
   */
  function getMonospaceCharWidth(fontSize) {
    if (cachedCharWidth > 0 && cachedCharWidthFontSize === fontSize) {
      return cachedCharWidth;
    }
    lineMeasurerElement.style.fontSize = `${fontSize}px`;
    lineMeasurerElement.style.lineHeight = `${Math.round(fontSize * 1.54)}px`;
    lineMeasurerElement.style.width = "auto";
    lineMeasurerElement.style.whiteSpace = "pre";
    lineMeasurerElement.textContent = "01234567890123456789";
    const measuredBoundingRect = lineMeasurerElement.getBoundingClientRect();
    cachedCharWidth =
      measuredBoundingRect.width > 0
        ? measuredBoundingRect.width / 20
        : fontSize * 0.6;
    cachedCharWidthFontSize = fontSize;
    return cachedCharWidth;
  }

  /**
   * Determines whether a given line of text could wrap within the container width.
   * @param {string} lineText - Content of the line.
   * @param {number} charWidth - Monospace character width in pixels.
   * @param {number} availableWidth - Available text container width in pixels.
   * @returns {boolean} True if the line can potentially wrap across multiple visual lines.
   */
  function canLineWrap(lineText, charWidth, availableWidth) {
    if (!lineText || availableWidth <= 0) {
      return false;
    }
    const tabCount = lineText.indexOf("\t") === -1 ? 0 : lineText.split("\t").length - 1;
    const effectiveLength = lineText.length + tabCount * 2;
    return effectiveLength * charWidth >= availableWidth - 14;
  }

  /**
   * Measures a specific subset of candidate wrapped lines in the hidden measurer container.
   * @param {Array<{lineIndex: number, text: string}>} candidateLines - Lines requiring DOM height evaluation.
   * @param {number} calculatedLineHeight - Default single line height in pixels.
   * @param {number} containerWidth - Viewport container width in pixels.
   * @param {number[]} outputHeightsArray - Array to receive measured pixel heights.
   * @returns {void}
   */
  function measureCandidateLines(
    candidateLines,
    calculatedLineHeight,
    containerWidth,
    outputHeightsArray,
  ) {
    if (candidateLines.length === 0) {
      return;
    }

    lineMeasurerElement.style.fontSize = `${editorFontSize}px`;
    lineMeasurerElement.style.lineHeight = `${calculatedLineHeight}px`;
    lineMeasurerElement.style.width = `${containerWidth}px`;
    lineMeasurerElement.style.padding = "0 14px";
    lineMeasurerElement.style.whiteSpace = "pre-wrap";

    const fragment = document.createDocumentFragment();
    for (let index = 0; index < candidateLines.length; index += 1) {
      const lineDivision = document.createElement("div");
      lineDivision.textContent = candidateLines[index].text || "\u200b";
      fragment.appendChild(lineDivision);
    }
    lineMeasurerElement.replaceChildren(fragment);

    const children = lineMeasurerElement.children;
    for (let index = 0; index < children.length; index += 1) {
      const targetIndex = candidateLines[index].lineIndex;
      outputHeightsArray[targetIndex] =
        children[index].offsetHeight || calculatedLineHeight;
    }
  }

  /**
   * Computes the rendered pixel height for each document line using incremental measurement.
   * @param {string[]} textLines - Array of string lines from the editor textarea.
   * @param {number} calculatedLineHeight - Single un-wrapped line height in pixels.
   * @returns {number[]} Array containing the rendered height in pixels for each line.
   */
  function measureLineHeights(textLines, calculatedLineHeight) {
    const totalLines = textLines.length;
    const currentClientWidth = getTextareaClientWidth();
    if (!isLineWrapEnabled || currentClientWidth === 0) {
      cachedPreviousLines = textLines.slice();
      cachedMeasuredHeights = new Array(totalLines).fill(calculatedLineHeight);
      cachedMeasureClientWidth = currentClientWidth;
      cachedMeasureFontSize = editorFontSize;
      cachedMeasureLineWrap = isLineWrapEnabled;
      return cachedMeasuredHeights;
    }

    const availableWidth = currentClientWidth - 28;
    const charWidth = getMonospaceCharWidth(editorFontSize);

    const isLayoutSame =
      cachedPreviousLines !== null &&
      cachedMeasureClientWidth === currentClientWidth &&
      cachedMeasureFontSize === editorFontSize &&
      cachedMeasureLineWrap === isLineWrapEnabled;

    if (!isLayoutSame) {
      const resultHeights = new Array(totalLines).fill(calculatedLineHeight);
      const candidatesToMeasure = [];

      for (let index = 0; index < totalLines; index += 1) {
        if (canLineWrap(textLines[index], charWidth, availableWidth)) {
          candidatesToMeasure.push({
            lineIndex: index,
            text: textLines[index],
          });
        }
      }

      measureCandidateLines(
        candidatesToMeasure,
        calculatedLineHeight,
        currentClientWidth,
        resultHeights,
      );

      cachedPreviousLines = textLines.slice();
      cachedMeasuredHeights = resultHeights;
      cachedMeasureClientWidth = currentClientWidth;
      cachedMeasureFontSize = editorFontSize;
      cachedMeasureLineWrap = isLineWrapEnabled;
      return resultHeights;
    }

    const oldLines = cachedPreviousLines;
    const oldLength = oldLines.length;
    const newLength = totalLines;

    let prefixCount = 0;
    while (
      prefixCount < oldLength &&
      prefixCount < newLength &&
      oldLines[prefixCount] === textLines[prefixCount]
    ) {
      prefixCount += 1;
    }

    let oldSuffixCount = 0;
    let newSuffixCount = 0;
    while (
      oldLength - 1 - oldSuffixCount >= prefixCount &&
      newLength - 1 - newSuffixCount >= prefixCount &&
      oldLines[oldLength - 1 - oldSuffixCount] ===
        textLines[newLength - 1 - newSuffixCount]
    ) {
      oldSuffixCount += 1;
      newSuffixCount += 1;
    }

    const nextHeights = new Array(newLength);

    for (let index = 0; index < prefixCount; index += 1) {
      nextHeights[index] = cachedMeasuredHeights[index];
    }

    for (let suffixIndex = 0; suffixIndex < newSuffixCount; suffixIndex += 1) {
      const oldIndex = oldLength - 1 - suffixIndex;
      const newIndex = newLength - 1 - suffixIndex;
      nextHeights[newIndex] = cachedMeasuredHeights[oldIndex];
    }

    const modifiedStartIndex = prefixCount;
    const modifiedEndIndex = newLength - 1 - newSuffixCount;
    const candidatesToMeasure = [];

    for (let index = modifiedStartIndex; index <= modifiedEndIndex; index += 1) {
      if (canLineWrap(textLines[index], charWidth, availableWidth)) {
        nextHeights[index] = calculatedLineHeight;
        candidatesToMeasure.push({
          lineIndex: index,
          text: textLines[index],
        });
      } else {
        nextHeights[index] = calculatedLineHeight;
      }
    }

    if (candidatesToMeasure.length > 0) {
      measureCandidateLines(
        candidatesToMeasure,
        calculatedLineHeight,
        currentClientWidth,
        nextHeights,
      );
    }

    cachedPreviousLines = textLines.slice();
    cachedMeasuredHeights = nextHeights;
    return nextHeights;
  }

  /**
   * Applies font size and proportional line height to textarea, backdrop, and line gutter.
   * @returns {void}
   */
  function applyEditorFontSize() {
    cachedTextareaClientWidth = textareaElement.clientWidth;
    const calculatedLineHeight = Math.round(editorFontSize * 1.54);
    textareaElement.style.fontSize = `${editorFontSize}px`;
    textareaElement.style.lineHeight = `${calculatedLineHeight}px`;
    searchBackdropElement.style.fontSize = `${editorFontSize}px`;
    searchBackdropElement.style.lineHeight = `${calculatedLineHeight}px`;
    lineGutterElement.style.fontSize = `${editorFontSize}px`;
    lineGutterElement.style.lineHeight = `${calculatedLineHeight}px`;

    searchController.synchronizeLayout();
    syntaxHighlighter.applyFontSize(editorFontSize, calculatedLineHeight);
    refreshLineNumbers();
  }

  /**
   * Applies line wrapping configuration to both textarea and search backdrop.
   * @returns {void}
   */
  function applyLineWrapMode() {
    cachedTextareaClientWidth = textareaElement.clientWidth;
    if (isLineWrapEnabled) {
      textareaElement.wrap = "on";
      textareaElement.classList.remove("no-wrap");
      searchBackdropElement.classList.remove("no-wrap");
      if (toggleLineWrapButton) {
        toggleLineWrapButton.classList.add("checked-item");
      }
    } else {
      textareaElement.wrap = "off";
      textareaElement.classList.add("no-wrap");
      searchBackdropElement.classList.add("no-wrap");
      if (toggleLineWrapButton) {
        toggleLineWrapButton.classList.remove("checked-item");
      }
    }
    syntaxHighlighter.applyLineWrap(isLineWrapEnabled);
    searchController.synchronizeLayout();
    refreshLineNumbers();
  }

  /**
   * Refreshes line numbers in the gutter with heights corresponding to wrapped lines.
   * @returns {void}
   */
  function refreshLineNumbers() {
    const textLines = textareaElement.value.split("\n");
    const totalLines = textLines.length;
    const calculatedLineHeight = Math.round(editorFontSize * 1.54);
    const lineHeights = measureLineHeights(textLines, calculatedLineHeight);

    const existingChildrenCount = lineGutterElement.children.length;

    if (existingChildrenCount === 0) {
      const fragment = document.createDocumentFragment();
      for (let lineNumber = 1; lineNumber <= totalLines; lineNumber += 1) {
        const lineDiv = document.createElement("div");
        lineDiv.className = "editor-gutter-line";
        lineDiv.textContent = String(lineNumber);
        lineDiv.style.height = `${lineHeights[lineNumber - 1]}px`;
        fragment.appendChild(lineDiv);
      }
      lineGutterElement.replaceChildren(fragment);
      return;
    }

    if (existingChildrenCount < totalLines) {
      const fragment = document.createDocumentFragment();
      for (
        let lineNumber = existingChildrenCount + 1;
        lineNumber <= totalLines;
        lineNumber += 1
      ) {
        const lineDiv = document.createElement("div");
        lineDiv.className = "editor-gutter-line";
        fragment.appendChild(lineDiv);
      }
      lineGutterElement.appendChild(fragment);
    } else if (existingChildrenCount > totalLines) {
      while (lineGutterElement.children.length > totalLines) {
        lineGutterElement.removeChild(lineGutterElement.lastElementChild);
      }
    }

    const gutterChildren = lineGutterElement.children;
    for (let index = 0; index < totalLines; index += 1) {
      const lineDiv = gutterChildren[index];
      const targetNumber = String(index + 1);
      if (lineDiv.textContent !== targetNumber) {
        lineDiv.textContent = targetNumber;
      }
      const targetHeight = `${lineHeights[index]}px`;
      if (lineDiv.style.height !== targetHeight) {
        lineDiv.style.height = targetHeight;
      }
    }
  }

  /**
   * Synchronizes gutter and search backdrop scroll offsets with the textarea scroll offset.
   * @returns {void}
   */
  function synchronizeScroll() {
    lineGutterElement.scrollTop = textareaElement.scrollTop;
    searchController.synchronizeScroll();
    syntaxHighlighter.synchronizeScroll();
  }

  /**
   * Displays the transient save status indicator.
   * @param {"saving" | "saved"} statusState - Status type.
   * @param {string} statusText - Indicator display message.
   * @returns {void}
   */
  function displaySaveIndicator(statusState, statusText) {
    clearTimeout(saveIndicatorHideTimerIdentifier);
    saveIndicatorElement.className = `save-indicator visible ${statusState}`;
    saveIndicatorElement.textContent = statusText;

    if (statusState === "saved") {
      saveIndicatorHideTimerIdentifier = setTimeout(() => {
        saveIndicatorElement.className = "save-indicator";
      }, 1500);
    }
  }

  /**
   * Reverts the active document to its previous history state.
   * @returns {void}
   */
  function performUndo() {
    const activeHistory = getActiveHistory();
    if (!activeHistory.canUndo()) {
      return;
    }

    const previousState = activeHistory.undo();
    if (!previousState) {
      return;
    }

    textareaElement.value = previousState.content;
    textareaElement.setSelectionRange(
      previousState.selectionStart,
      previousState.selectionEnd,
    );

    if (activeFileType === "markdown") {
      markdownBuffer = previousState.content;
    } else {
      cssBuffer = previousState.content;
    }

    refreshLineNumbers();
    synchronizeScroll();
    searchController.refreshSearch();
    tocController.refreshIfOpen();
    syntaxHighlighter.updateHighlight(activeFileType);
    updateMenuState();
    scheduleAutosave();
  }

  /**
   * Re-applies the forward document history state.
   * @returns {void}
   */
  function performRedo() {
    const activeHistory = getActiveHistory();
    if (!activeHistory.canRedo()) {
      return;
    }

    const nextState = activeHistory.redo();
    if (!nextState) {
      return;
    }

    textareaElement.value = nextState.content;
    textareaElement.setSelectionRange(
      nextState.selectionStart,
      nextState.selectionEnd,
    );

    if (activeFileType === "markdown") {
      markdownBuffer = nextState.content;
    } else {
      cssBuffer = nextState.content;
    }

    refreshLineNumbers();
    synchronizeScroll();
    searchController.refreshSearch();
    tocController.refreshIfOpen();
    syntaxHighlighter.updateHighlight(activeFileType);
    updateMenuState();
    scheduleAutosave();
  }

  /**
   * Persists the active document without modifying editor content.
   * @returns {Promise<void>}
   */
  async function performAutosave() {
    autosaveTimerIdentifier = null;
    displaySaveIndicator("saving", "Saving...");

    const fileTypeToSave = activeFileType;
    const fileNameToSave =
      fileTypeToSave === "markdown"
        ? activeMarkdownFileName
        : activeCssFileName;
    const contentToSave =
      fileTypeToSave === "markdown" ? markdownBuffer : cssBuffer;

    try {
      const saveResponse = await window.atarashiiApi.saveProjectDocument({
        projectPath: currentProjectPath,
        fileName: fileNameToSave,
        content: contentToSave,
        fileType: fileTypeToSave,
      });

      if (!saveResponse.ok) {
        displaySaveIndicator("saving", "Save error");
        errorModal.show({
          title: "Save Failure",
          message: saveResponse.error.message,
          stack: saveResponse.error.stack,
        });
        return;
      }

      displaySaveIndicator("saved", "Saved");
    } catch (saveError) {
      displaySaveIndicator("saving", "Save error");
      errorModal.show({
        title: "Unexpected Save Error",
        message: saveError.message,
        stack: saveError.stack,
      });
    }
  }

  /**
   * Manually formats the active document and records undo history.
   * @returns {Promise<void>}
   */
  async function formatActiveDocument() {
    if (!currentProjectPath) {
      return;
    }

    const unformattedContent = textareaElement.value;
    try {
      const formatResponse = await window.atarashiiApi.formatDocument({
        content: unformattedContent,
        fileType: activeFileType,
      });

      if (!formatResponse.ok) {
        errorModal.show({
          title: "Format Failure",
          message: formatResponse.error.message,
          stack: formatResponse.error.stack,
        });
        return;
      }

      const formattedContent = formatResponse.formattedContent;
      if (formattedContent !== unformattedContent) {
        const previousSelectionStart = textareaElement.selectionStart;
        const previousSelectionEnd = textareaElement.selectionEnd;

        textareaElement.value = formattedContent;
        if (activeFileType === "markdown") {
          markdownBuffer = formattedContent;
        } else {
          cssBuffer = formattedContent;
        }

        refreshLineNumbers();

        const safeSelectionStart = Math.min(
          previousSelectionStart,
          formattedContent.length,
        );
        const safeSelectionEnd = Math.min(
          previousSelectionEnd,
          formattedContent.length,
        );
        textareaElement.setSelectionRange(safeSelectionStart, safeSelectionEnd);

        const activeHistory = getActiveHistory();
        activeHistory.pushSnapshot(
          formattedContent,
          safeSelectionStart,
          safeSelectionEnd,
          false,
        );
        updateMenuState();
        searchController.refreshSearch();
        tocController.refreshIfOpen();
        syntaxHighlighter.updateHighlight(activeFileType);
        scheduleAutosave();
      }
    } catch (formatError) {
      errorModal.show({
        title: "Unexpected Format Error",
        message: formatError.message,
        stack: formatError.stack,
      });
    }
  }

  /**
   * Schedules a debounced autosave operation.
   * @returns {void}
   */
  function scheduleAutosave() {
    clearTimeout(autosaveTimerIdentifier);
    displaySaveIndicator("saving", "Saving...");
    autosaveTimerIdentifier = setTimeout(() => {
      performAutosave();
    }, AUTOSAVE_DEBOUNCE_MILLISECONDS);
  }

  /**
   * Immediately flushes any pending autosave operation.
   * @returns {Promise<void>}
   */
  async function flushPendingSave() {
    if (autosaveTimerIdentifier) {
      clearTimeout(autosaveTimerIdentifier);
      await performAutosave();
    }
  }

  /**
   * Switches the active document tab between Markdown and CSS.
   * @param {"markdown" | "css"} nextFileType - Destination document type.
   * @returns {Promise<void>}
   */
  async function switchTab(nextFileType) {
    if (activeFileType === nextFileType) {
      return;
    }

    await flushPendingSave();

    activeFileType = nextFileType;

    if (activeFileType === "markdown") {
      markdownTabButton.classList.add("active-tab");
      cssTabButton.classList.remove("active-tab");
      textareaElement.value = markdownBuffer;
      tocController.setVisible(true);
    } else {
      cssTabButton.classList.add("active-tab");
      markdownTabButton.classList.remove("active-tab");
      textareaElement.value = cssBuffer;
      tocController.setVisible(false);
    }

    refreshLineNumbers();
    synchronizeScroll();
    searchController.refreshSearch();
    syntaxHighlighter.setLanguage(activeFileType);
    updateMenuState();
    textareaElement.focus();
  }

  /**
   * Handles keyboard indentation rules such as inserting spaces on Tab key.
   * @param {KeyboardEvent} keyboardEvent - Keyboard event descriptor.
   * @returns {void}
   */
  function handleTabKeyIndentation(keyboardEvent) {
    if (keyboardEvent.key !== "Tab") {
      return;
    }

    keyboardEvent.preventDefault();

    const selectionStart = textareaElement.selectionStart;
    const selectionEnd = textareaElement.selectionEnd;
    const currentValue = textareaElement.value;

    const twoSpaces = "  ";

    if (!keyboardEvent.shiftKey) {
      if (selectionStart === selectionEnd) {
        textareaElement.value =
          currentValue.substring(0, selectionStart) +
          twoSpaces +
          currentValue.substring(selectionEnd);
        textareaElement.selectionStart = selectionStart + 2;
        textareaElement.selectionEnd = selectionStart + 2;
      } else {
        const lineStart =
          currentValue.lastIndexOf("\n", selectionStart - 1) + 1;
        const lineEnd = currentValue.indexOf("\n", selectionEnd);
        const effectiveEnd = lineEnd === -1 ? currentValue.length : lineEnd;
        const targetBlock = currentValue.substring(lineStart, effectiveEnd);
        const indentedBlock = targetBlock
          .split("\n")
          .map((line) => twoSpaces + line)
          .join("\n");

        textareaElement.value =
          currentValue.substring(0, lineStart) +
          indentedBlock +
          currentValue.substring(effectiveEnd);

        textareaElement.selectionStart = selectionStart + 2;
        textareaElement.selectionEnd =
          selectionEnd + (indentedBlock.length - targetBlock.length);
      }
    } else {
      const lineStart = currentValue.lastIndexOf("\n", selectionStart - 1) + 1;
      const lineEnd = currentValue.indexOf("\n", selectionEnd);
      const effectiveEnd = lineEnd === -1 ? currentValue.length : lineEnd;
      const targetBlock = currentValue.substring(lineStart, effectiveEnd);
      const dedentedBlock = targetBlock
        .split("\n")
        .map((line) => line.replace(/^ {1,2}/, ""))
        .join("\n");

      textareaElement.value =
        currentValue.substring(0, lineStart) +
        dedentedBlock +
        currentValue.substring(effectiveEnd);

      textareaElement.selectionStart = Math.max(lineStart, selectionStart - 2);
      textareaElement.selectionEnd = Math.max(
        textareaElement.selectionStart,
        selectionEnd - (targetBlock.length - dedentedBlock.length),
      );
    }

    const activeHistory = getActiveHistory();
    activeHistory.pushSnapshot(
      textareaElement.value,
      textareaElement.selectionStart,
      textareaElement.selectionEnd,
      false,
    );

    onTextareaInput();
  }

  /**
   * Intercepts global keyboard shortcuts for undo and redo operations.
   * @param {KeyboardEvent} keyboardEvent - Keyboard event descriptor.
   * @returns {void}
   */
  function handleEditorShortcuts(keyboardEvent) {
    if (
      keyboardEvent.shiftKey &&
      keyboardEvent.altKey &&
      keyboardEvent.key.toLowerCase() === "f"
    ) {
      keyboardEvent.preventDefault();
      formatActiveDocument();
      return;
    }

    const isControlOrMeta = keyboardEvent.ctrlKey || keyboardEvent.metaKey;
    if (!isControlOrMeta) {
      return;
    }

    const keyName = keyboardEvent.key.toLowerCase();

    if (keyName === "z" && !keyboardEvent.shiftKey) {
      keyboardEvent.preventDefault();
      performUndo();
      return;
    }

    if (keyName === "y" || (keyName === "z" && keyboardEvent.shiftKey)) {
      keyboardEvent.preventDefault();
      performRedo();
    }
  }

  /**
   * Tracks user modifications in the editor textarea.
   * @returns {void}
   */
  function onTextareaInput() {
    const updatedContent = textareaElement.value;
    if (activeFileType === "markdown") {
      markdownBuffer = updatedContent;
    } else {
      cssBuffer = updatedContent;
    }

    const activeHistory = getActiveHistory();
    activeHistory.pushSnapshot(
      updatedContent,
      textareaElement.selectionStart,
      textareaElement.selectionEnd,
      true,
    );

    updateMenuState();
    refreshLineNumbers();
    searchController.refreshSearch();
    tocController.refreshIfOpen();
    syntaxHighlighter.updateHighlight(activeFileType);
    scheduleAutosave();
  }

  textareaElement.addEventListener("input", onTextareaInput);
  textareaElement.addEventListener("scroll", synchronizeScroll);
  textareaElement.addEventListener("keydown", handleTabKeyIndentation);
  textareaElement.addEventListener("keydown", handleEditorShortcuts);

  if (undoMenuItem) {
    undoMenuItem.addEventListener("click", () => {
      performUndo();
      if (optionsDropdown) {
        optionsDropdown.hidden = true;
      }
    });
  }

  if (redoMenuItem) {
    redoMenuItem.addEventListener("click", () => {
      performRedo();
      if (optionsDropdown) {
        optionsDropdown.hidden = true;
      }
    });
  }

  if (formatMenuItem) {
    formatMenuItem.addEventListener("click", () => {
      formatActiveDocument();
      if (optionsDropdown) {
        optionsDropdown.hidden = true;
      }
    });
  }

  let textareaResizeFrameIdentifier = null;
  const textareaResizeObserver = new ResizeObserver(() => {
    if (textareaResizeFrameIdentifier) {
      cancelAnimationFrame(textareaResizeFrameIdentifier);
    }
    textareaResizeFrameIdentifier = requestAnimationFrame(() => {
      textareaResizeFrameIdentifier = null;
      cachedTextareaClientWidth = textareaElement.clientWidth;
      searchController.synchronizeLayout();
      syntaxHighlighter.synchronizeLayout();
      if (isLineWrapEnabled) {
        refreshLineNumbers();
      }
    });
  });
  textareaResizeObserver.observe(textareaElement);

  if (zoomInButton) {
    zoomInButton.addEventListener("click", () => {
      editorFontSize = Math.min(editorFontSize + 1, 28);
      applyEditorFontSize();
    });
  }

  if (zoomOutButton) {
    zoomOutButton.addEventListener("click", () => {
      editorFontSize = Math.max(editorFontSize - 1, 10);
      applyEditorFontSize();
    });
  }

  if (optionsMenuButton && optionsDropdown) {
    optionsMenuButton.addEventListener("click", (clickEvent) => {
      clickEvent.stopPropagation();
      updateMenuState();
      optionsDropdown.hidden = !optionsDropdown.hidden;
    });

    window.addEventListener("click", (windowClickEvent) => {
      if (
        !optionsDropdown.hidden &&
        !optionsDropdown.contains(windowClickEvent.target)
      ) {
        optionsDropdown.hidden = true;
      }
    });
  }

  if (toggleLineWrapButton) {
    toggleLineWrapButton.addEventListener("click", () => {
      isLineWrapEnabled = !isLineWrapEnabled;
      applyLineWrapMode();
    });
  }

  applyEditorFontSize();
  applyLineWrapMode();

  markdownTabButton.addEventListener("click", () => {
    switchTab("markdown");
  });

  cssTabButton.addEventListener("click", () => {
    switchTab("css");
  });

  openAssetsButton.addEventListener("click", () => {
    if (currentAssetsDirectoryPath) {
      window.atarashiiApi.openAssetsFolder(currentAssetsDirectoryPath);
    }
  });

  return {
    /**
     * Initializes the editor with project metadata and initial document contents.
     * @param {{projectPath: string, markdownFileName: string, cssFileName: string, assetsPath: string}} projectMetadata - Project description.
     * @param {{markdownContent: string, cssContent: string}} documents - File contents.
     * @returns {void}
     */
    setProject(projectMetadata, documents) {
      currentProjectPath = projectMetadata.projectPath;
      activeMarkdownFileName = projectMetadata.markdownFileName;
      activeCssFileName = projectMetadata.cssFileName;
      currentAssetsDirectoryPath = projectMetadata.assetsPath;

      markdownTabButton.textContent = activeMarkdownFileName;
      cssTabButton.textContent = activeCssFileName;

      markdownBuffer = documents.markdownContent;
      cssBuffer = documents.cssContent;

      markdownHistory.reset(markdownBuffer);
      cssHistory.reset(cssBuffer);

      activeFileType = "markdown";
      markdownTabButton.classList.add("active-tab");
      cssTabButton.classList.remove("active-tab");

      textareaElement.value = markdownBuffer;
      cachedTextareaClientWidth = textareaElement.clientWidth;
      cachedPreviousLines = null;
      refreshLineNumbers();
      synchronizeScroll();
      searchController.refreshSearch();
      tocController.setVisible(true);
      syntaxHighlighter.setLanguage("markdown");
      updateMenuState();
      displaySaveIndicator("saved", "Saved");
    },
    flushPendingSave,
    formatDocument: formatActiveDocument,
    syntaxHighlighter,
    tocController,
  };
}
