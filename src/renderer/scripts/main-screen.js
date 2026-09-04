/**
 * @module main-screen
 * Main workspace coordinator managing dual panel layouts, collapse behaviors, tabs, and live conversion.
 */

import { createTextEditor } from "./text-editor.js";
import { createConversionLog } from "./conversion-log.js";
import { createPdfViewer } from "./pdf-viewer/viewer.js";

/**
 * Creates the primary application workspace screen controller.
 * @param {ReturnType<typeof import("./screen-manager").createScreenManager>} screenManager - Screen manager instance.
 * @param {ReturnType<typeof import("./error-modal").createErrorModal>} errorModal - Error modal instance.
 * @returns {{show: Function}} Main screen controller instance.
 */
export function createMainScreen(screenManager, errorModal) {
  const leftPanelElement = document.getElementById("left-panel");
  const rightPanelElement = document.getElementById("right-panel");

  const leftCollapseButton = document.getElementById("left-panel-collapse-button");
  const rightCollapseButton = document.getElementById("right-panel-collapse-button");

  const leftArrowIcon = document.getElementById("left-panel-arrow-icon");
  const rightArrowIcon = document.getElementById("right-panel-arrow-icon");

  const pdfTabButton = document.getElementById("tab-document-pdf");
  const logTabButton = document.getElementById("tab-conversion-log");

  const pdfPaneElement = document.getElementById("pdf-viewer-tab-pane");
  const logPaneElement = document.getElementById("conversion-log-tab-pane");
  const pdfToolbarElement = document.getElementById("pdf-toolbar-controls");

  const textEditor = createTextEditor(errorModal);
  window.__atarashiiEditor = textEditor;
  const conversionLog = createConversionLog();
  const pdfViewer = createPdfViewer();

  pdfViewer.init();

  let activeProject = null;
  let logStreamUnsubscribe = null;
  let pdfUpdateUnsubscribe = null;

  /**
   * Toggles collapsed presentation on the left workspace panel.
   * @returns {void}
   */
  function toggleLeftPanel() {
    const isCurrentlyCollapsed = leftPanelElement.classList.contains("panel-collapsed");
    if (isCurrentlyCollapsed) {
      leftPanelElement.classList.remove("panel-collapsed");
      leftArrowIcon.src = "../../assets/icons/arrow-left.svg";
      leftCollapseButton.title = "Collapse left panel";
    } else {
      leftPanelElement.classList.add("panel-collapsed");
      leftArrowIcon.src = "../../assets/icons/arrow-right.svg";
      leftCollapseButton.title = "Expand left panel";
    }
  }

  /**
   * Toggles collapsed presentation on the right workspace panel.
   * @returns {void}
   */
  function toggleRightPanel() {
    const isCurrentlyCollapsed = rightPanelElement.classList.contains("panel-collapsed");
    if (isCurrentlyCollapsed) {
      rightPanelElement.classList.remove("panel-collapsed");
      rightArrowIcon.src = "../../assets/icons/arrow-right.svg";
      rightCollapseButton.title = "Collapse right panel";
    } else {
      rightPanelElement.classList.add("panel-collapsed");
      rightArrowIcon.src = "../../assets/icons/arrow-left.svg";
      rightCollapseButton.title = "Expand right panel";
    }
  }

  /**
   * Switches right panel view between the PDF viewer and the conversion log.
   * @param {"pdf" | "log"} targetPane - Desired active view.
   * @returns {void}
   */
  function switchRightPanelTab(targetPane) {
    if (targetPane === "pdf") {
      pdfTabButton.classList.add("active-tab");
      logTabButton.classList.remove("active-tab");
      pdfPaneElement.classList.remove("hidden");
      logPaneElement.classList.add("hidden");
      pdfToolbarElement.classList.remove("hidden");
    } else {
      logTabButton.classList.add("active-tab");
      pdfTabButton.classList.remove("active-tab");
      logPaneElement.classList.remove("hidden");
      pdfPaneElement.classList.add("hidden");
      pdfToolbarElement.classList.add("hidden");
    }
  }

  /**
   * Loads project documents, starts live conversion, and initializes viewers.
   * @param {{projectPath: string, projectName: string, markdownFileName: string, cssFileName: string, pdfFileName: string, assetsPath: string}} projectMetadata - Project metadata.
   * @returns {Promise<void>}
   */
  async function loadProject(projectMetadata) {
    activeProject = projectMetadata;

    if (logStreamUnsubscribe) {
      logStreamUnsubscribe();
      logStreamUnsubscribe = null;
    }
    if (pdfUpdateUnsubscribe) {
      pdfUpdateUnsubscribe();
      pdfUpdateUnsubscribe = null;
    }

    screenManager.show("screen-main", projectMetadata.projectName);

    leftPanelElement.classList.remove("panel-collapsed");
    rightPanelElement.classList.remove("panel-collapsed");
    leftArrowIcon.src = "../../assets/icons/arrow-left.svg";
    rightArrowIcon.src = "../../assets/icons/arrow-right.svg";

    switchRightPanelTab("pdf");

    try {
      const readResult = await window.atarashiiApi.readProjectDocuments(
        projectMetadata.projectPath,
        projectMetadata.markdownFileName,
        projectMetadata.cssFileName
      );

      if (!readResult.ok) {
        errorModal.show({
          title: "File Read Failure",
          message: readResult.error.message,
          stack: readResult.error.stack,
        });
        return;
      }

      textEditor.setProject(projectMetadata, readResult.documents);
      conversionLog.setLog(readResult.documents.conversionLogContent);

      const targetPdfPath = projectMetadata.pdfFilePath;
      await pdfViewer.setPdfPath(targetPdfPath);

      if (readResult.documents.pdfFileExists) {
        pdfViewer.load(targetPdfPath);
      } else {
        await pdfViewer.reset();
      }

      logStreamUnsubscribe = window.atarashiiApi.onConversionLog((logChunk) => {
        conversionLog.appendChunk(logChunk);
      });

      pdfUpdateUnsubscribe = window.atarashiiApi.onPdfUpdated((pdfPath) => {
        pdfViewer.reload(pdfPath);
      });

      const conversionResult = await window.atarashiiApi.startConverter({
        projectPath: projectMetadata.projectPath,
        markdownFileName: projectMetadata.markdownFileName,
        cssFileName: projectMetadata.cssFileName,
        pdfFileName: projectMetadata.pdfFileName,
      });

      if (!conversionResult.ok) {
        errorModal.show({
          title: "Converter Error",
          message: conversionResult.error.message,
          stack: conversionResult.error.stack,
        });
      }
    } catch (openWorkspaceError) {
      errorModal.show({
        title: "Workspace Load Error",
        message: openWorkspaceError.message,
        stack: openWorkspaceError.stack,
      });
    }
  }

  leftCollapseButton.addEventListener("click", toggleLeftPanel);
  rightCollapseButton.addEventListener("click", toggleRightPanel);

  pdfTabButton.addEventListener("click", () => {
    switchRightPanelTab("pdf");
  });

  logTabButton.addEventListener("click", () => {
    switchRightPanelTab("log");
  });

  return {
    show(projectMetadata) {
      loadProject(projectMetadata);
    },
  };
}
