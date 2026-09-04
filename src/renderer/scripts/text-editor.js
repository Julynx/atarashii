/**
 * @module text-editor
 * Source text editor component managing document tabs, line numbers, indentation, and automated formatting.
 */

const AUTOSAVE_DEBOUNCE_MILLISECONDS = 500;

/**
 * Creates the text editor component.
 * @param {ReturnType<typeof import("./error-modal").createErrorModal>} errorModal - Error modal instance.
 * @returns {{setProject: Function, flushPendingSave: Function}} Text editor controller instance.
 */
export function createTextEditor(errorModal) {
  const textareaElement = document.getElementById("editor-textarea");
  const lineGutterElement = document.getElementById("editor-line-gutter");
  const markdownTabButton = document.getElementById("tab-document-markdown");
  const cssTabButton = document.getElementById("tab-document-css");
  const openAssetsButton = document.getElementById("button-open-assets");
  const saveIndicatorElement = document.getElementById("editor-save-indicator");

  const zoomInButton = document.getElementById("editor-zoom-in-button");
  const zoomOutButton = document.getElementById("editor-zoom-out-button");
  const optionsMenuButton = document.getElementById("editor-options-menu-button");
  const optionsDropdown = document.getElementById("editor-options-dropdown");
  const toggleLineWrapButton = document.getElementById("editor-toggle-linewrap");

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
   * Applies font size and proportional line height to textarea and line gutter.
   * @returns {void}
   */
  function applyEditorFontSize() {
    const calculatedLineHeight = Math.round(editorFontSize * 1.54);
    textareaElement.style.fontSize = `${editorFontSize}px`;
    textareaElement.style.lineHeight = `${calculatedLineHeight}px`;
    lineGutterElement.style.fontSize = `${editorFontSize}px`;
    lineGutterElement.style.lineHeight = `${calculatedLineHeight}px`;

    const gutterLines = lineGutterElement.querySelectorAll(".editor-gutter-line");
    gutterLines.forEach((lineElement) => {
      lineElement.style.height = `${calculatedLineHeight}px`;
    });
  }

  /**
   * Applies line wrapping configuration to the code textarea.
   * @returns {void}
   */
  function applyLineWrapMode() {
    if (isLineWrapEnabled) {
      textareaElement.wrap = "on";
      textareaElement.classList.remove("no-wrap");
      if (toggleLineWrapButton) {
        toggleLineWrapButton.classList.add("checked-item");
      }
    } else {
      textareaElement.wrap = "off";
      textareaElement.classList.add("no-wrap");
      if (toggleLineWrapButton) {
        toggleLineWrapButton.classList.remove("checked-item");
      }
    }
  }

  /**
   * Refreshes the line numbers in the editor gutter.
   * @returns {void}
   */
  function refreshLineNumbers() {
    const totalLines = textareaElement.value.split("\n").length;
    const currentGutterCount = lineGutterElement.children.length;

    if (totalLines === currentGutterCount) {
      return;
    }

    const calculatedLineHeight = Math.round(editorFontSize * 1.54);
    const fragment = document.createDocumentFragment();
    for (let lineNumber = 1; lineNumber <= totalLines; lineNumber += 1) {
      const lineDiv = document.createElement("div");
      lineDiv.className = "editor-gutter-line";
      lineDiv.style.height = `${calculatedLineHeight}px`;
      lineDiv.textContent = String(lineNumber);
      fragment.appendChild(lineDiv);
    }

    lineGutterElement.replaceChildren(fragment);
  }

  /**
   * Synchronizes the gutter vertical scroll with the textarea scroll.
   * @returns {void}
   */
  function synchronizeScroll() {
    lineGutterElement.scrollTop = textareaElement.scrollTop;
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
   * Persists and auto-formats the active document.
   * @returns {Promise<void>}
   */
  async function performAutosave() {
    autosaveTimerIdentifier = null;
    displaySaveIndicator("saving", "Saving...");

    const fileTypeToSave = activeFileType;
    const fileNameToSave = fileTypeToSave === "markdown" ? activeMarkdownFileName : activeCssFileName;
    const contentToSave = fileTypeToSave === "markdown" ? markdownBuffer : cssBuffer;

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

      const formattedContent = saveResponse.formattedContent;
      if (fileTypeToSave === "markdown") {
        markdownBuffer = formattedContent;
      } else {
        cssBuffer = formattedContent;
      }

      if (activeFileType === fileTypeToSave && textareaElement.value !== formattedContent) {
        const previousSelectionStart = textareaElement.selectionStart;
        const previousSelectionEnd = textareaElement.selectionEnd;

        textareaElement.value = formattedContent;
        refreshLineNumbers();

        const safeSelectionStart = Math.min(previousSelectionStart, formattedContent.length);
        const safeSelectionEnd = Math.min(previousSelectionEnd, formattedContent.length);
        textareaElement.setSelectionRange(safeSelectionStart, safeSelectionEnd);
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
        const lineStart = currentValue.lastIndexOf("\n", selectionStart - 1) + 1;
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
        textareaElement.selectionEnd = selectionEnd + (indentedBlock.length - targetBlock.length);
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
        selectionEnd - (targetBlock.length - dedentedBlock.length)
      );
    }

    onTextareaInput();
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

    refreshLineNumbers();
    scheduleAutosave();
  }

  textareaElement.addEventListener("input", onTextareaInput);
  textareaElement.addEventListener("scroll", synchronizeScroll);
  textareaElement.addEventListener("keydown", handleTabKeyIndentation);

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
      optionsDropdown.hidden = !optionsDropdown.hidden;
    });

    window.addEventListener("click", (windowClickEvent) => {
      if (!optionsDropdown.hidden && !optionsDropdown.contains(windowClickEvent.target)) {
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

      activeFileType = "markdown";
      markdownTabButton.classList.add("active-tab");
      cssTabButton.classList.remove("active-tab");

      textareaElement.value = markdownBuffer;
      refreshLineNumbers();
      synchronizeScroll();
      displaySaveIndicator("saved", "Saved");
    },
    flushPendingSave,
  };
}
