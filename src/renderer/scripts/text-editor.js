/**
 * @module text-editor
 * Source text editor component managing document tabs, line numbers, indentation, manual formatting, search, and undo/redo history.
 */

import { createEditorSearch } from "./editor-search.js";
import { createDocumentHistoryBuffer } from "./editor-history.js";

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

  const searchController = createEditorSearch(
    textareaElement,
    searchBackdropElement,
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

  /**
   * Computes the rendered pixel height for each document line.
   * @param {string[]} textLines - Array of string lines from the editor textarea.
   * @param {number} calculatedLineHeight - Single un-wrapped line height in pixels.
   * @returns {number[]} Array containing the rendered height in pixels for each line.
   */
  function measureLineHeights(textLines, calculatedLineHeight) {
    if (!isLineWrapEnabled || textareaElement.clientWidth === 0) {
      return new Array(textLines.length).fill(calculatedLineHeight);
    }

    lineMeasurerElement.style.fontSize = `${editorFontSize}px`;
    lineMeasurerElement.style.lineHeight = `${calculatedLineHeight}px`;
    lineMeasurerElement.style.width = `${textareaElement.clientWidth}px`;
    lineMeasurerElement.style.padding = "0 14px";

    const fragment = document.createDocumentFragment();
    for (let index = 0; index < textLines.length; index += 1) {
      const lineDivision = document.createElement("div");
      lineDivision.textContent = textLines[index] || "\u200b";
      fragment.appendChild(lineDivision);
    }
    lineMeasurerElement.replaceChildren(fragment);

    const measuredHeights = [];
    const children = lineMeasurerElement.children;
    for (let index = 0; index < children.length; index += 1) {
      measuredHeights.push(
        children[index].offsetHeight || calculatedLineHeight,
      );
    }
    return measuredHeights;
  }

  /**
   * Applies font size and proportional line height to textarea, backdrop, and line gutter.
   * @returns {void}
   */
  function applyEditorFontSize() {
    const calculatedLineHeight = Math.round(editorFontSize * 1.54);
    textareaElement.style.fontSize = `${editorFontSize}px`;
    textareaElement.style.lineHeight = `${calculatedLineHeight}px`;
    searchBackdropElement.style.fontSize = `${editorFontSize}px`;
    searchBackdropElement.style.lineHeight = `${calculatedLineHeight}px`;
    lineGutterElement.style.fontSize = `${editorFontSize}px`;
    lineGutterElement.style.lineHeight = `${calculatedLineHeight}px`;

    searchController.synchronizeLayout();
    refreshLineNumbers();
  }

  /**
   * Applies line wrapping configuration to both textarea and search backdrop.
   * @returns {void}
   */
  function applyLineWrapMode() {
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
    if (existingChildrenCount !== totalLines) {
      const fragment = document.createDocumentFragment();
      for (let lineNumber = 1; lineNumber <= totalLines; lineNumber += 1) {
        const lineDiv = document.createElement("div");
        lineDiv.className = "editor-gutter-line";
        lineDiv.textContent = String(lineNumber);
        lineDiv.style.height = `${lineHeights[lineNumber - 1]}px`;
        fragment.appendChild(lineDiv);
      }
      lineGutterElement.replaceChildren(fragment);
    } else {
      for (let index = 0; index < totalLines; index += 1) {
        const lineDiv = lineGutterElement.children[index];
        const targetHeight = `${lineHeights[index]}px`;
        if (lineDiv.style.height !== targetHeight) {
          lineDiv.style.height = targetHeight;
        }
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
    } else {
      cssTabButton.classList.add("active-tab");
      markdownTabButton.classList.remove("active-tab");
      textareaElement.value = cssBuffer;
    }

    refreshLineNumbers();
    synchronizeScroll();
    searchController.refreshSearch();
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
      searchController.synchronizeLayout();
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
      refreshLineNumbers();
      synchronizeScroll();
      searchController.refreshSearch();
      updateMenuState();
      displaySaveIndicator("saved", "Saved");
    },
    flushPendingSave,
    formatDocument: formatActiveDocument,
  };
}
