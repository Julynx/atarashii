/**
 * @module viewer
 * Orchestrator for SmoothPDF crossfade transitions, zoom, and printing in Atarashii.
 */

import { state, updateState } from "./state.js";
import {
  getUIElements,
  showMessage,
  hideMessage,
  updateControlsUI,
  setupPageObserver,
  setupVisibilityObserver,
} from "./ui.js";
import {
  loadPdfDocument,
  jumpToPage,
  renderDocumentToLayer,
  renderVisiblePages,
  renderAllPagesForPrint,
  cancelAllRenderTasks,
} from "./pdf.js";

/**
 * Executes queued crossfade render options when active rendering completes.
 * @returns {Promise<void>}
 */
async function checkPending() {
  if (state.pendingRenderOptions) {
    const options = state.pendingRenderOptions;
    await updateState({ pendingRenderOptions: null });
    await performCrossfadeUpdate(
      state.currentPdfPath,
      options.anchorPage,
      options.isInstant,
      options.forceReload
    );
  }
}

/**
 * Performs smooth opacity crossfade transition between two layer DOM elements.
 * @param {string} filePath - Target PDF file path.
 * @param {number|null} [anchorPage=null] - Page number to maintain scroll alignment.
 * @param {boolean} [isInstant=false] - Whether to bypass animation transition.
 * @param {boolean} [forceReload=false] - Whether to reload document proxy from disk.
 * @returns {Promise<void>}
 */
async function performCrossfadeUpdate(
  filePath,
  anchorPage = null,
  isInstant = false,
  forceReload = false
) {
  await updateState({ isRendering: true });
  try {
    const resolvedPath = filePath || state.currentPdfPath;
    let pdfDocument;
    if (
      !forceReload &&
      resolvedPath === state.currentPdfPath &&
      state.currentPdfDocument
    ) {
      pdfDocument = state.currentPdfDocument;
    } else {
      pdfDocument = await loadPdfDocument(resolvedPath);
    }

    await updateState({
      currentPdfPath: resolvedPath,
      currentPdfDocument: pdfDocument,
      totalPages: pdfDocument.numPages,
    });
    updateControlsUI();

    const currentScrollPosition = state.currentFront.scrollTop;

    let relativeOffset = 0;
    if (anchorPage) {
      const oldAnchorCanvas = state.currentFront.querySelector(
        `.page-container[data-page-number="${anchorPage}"]`
      );
      if (oldAnchorCanvas) {
        const distanceIntoPage = currentScrollPosition + 16 - oldAnchorCanvas.offsetTop;
        relativeOffset = distanceIntoPage / oldAnchorCanvas.offsetHeight;
      }
    }

    const anchorCanvas = await renderDocumentToLayer(
      pdfDocument,
      state.currentBack,
      anchorPage
    );

    if (anchorCanvas) {
      const targetScrollTop =
        anchorCanvas.offsetTop - 16 + relativeOffset * anchorCanvas.offsetHeight;
      state.currentBack.scrollTop = Math.max(0, targetScrollTop);
    } else {
      state.currentBack.scrollTop = currentScrollPosition;
    }

    await renderVisiblePages(state.currentBack, pdfDocument);

    state.currentBack.style.transition = "none";
    state.currentBack.classList.remove("hidden");
    void state.currentBack.offsetWidth;

    if (isInstant) {
      state.currentFront.style.transition = "none";
    } else {
      state.currentBack.style.transition = "";
    }

    state.currentFront.classList.add("hidden");

    if (!isInstant) {
      await new Promise((resolve) => {
        state.currentFront.addEventListener("transitionend", resolve, {
          once: true,
        });
      });
    }

    state.currentBack.classList.add("is-front");
    state.currentBack.classList.remove("is-back");
    state.currentFront.classList.add("is-back");
    state.currentFront.classList.remove("is-front");

    cancelAllRenderTasks(state.currentFront);
    state.currentFront.innerHTML = "";

    setupPageObserver(state.currentBack);
    setupVisibilityObserver(state.currentBack, pdfDocument);

    if (isInstant) {
      void state.currentFront.offsetWidth;
      void state.currentBack.offsetWidth;
      state.currentFront.style.transition = "";
      state.currentBack.style.transition = "";
    }

    const previousFront = state.currentFront;
    await updateState({ currentFront: state.currentBack, currentBack: previousFront });
    hideMessage();
  } catch (crossfadeError) {
    console.error("Crossfade update error:", crossfadeError);
  } finally {
    await updateState({ isRendering: false });
    checkPending();
  }
}

/**
 * Loads a PDF and mounts initial pages onto the front layer.
 * @param {string} filePath - Absolute path to target PDF document.
 * @returns {Promise<void>}
 */
async function loadAndRenderPdf(filePath) {
  await updateState({ isRendering: true });
  try {
    const pdfDocument = await loadPdfDocument(filePath);
    await updateState({
      currentPdfPath: filePath,
      currentPdfDocument: pdfDocument,
      totalPages: pdfDocument.numPages,
    });

    updateControlsUI();

    await renderDocumentToLayer(pdfDocument, state.currentFront);
    await renderVisiblePages(state.currentFront, pdfDocument);

    setupPageObserver(state.currentFront);
    setupVisibilityObserver(state.currentFront, pdfDocument);
    hideMessage();
  } catch (initialLoadError) {
    console.error("Initial PDF load error:", initialLoadError);
    showMessage("Waiting for document.pdf generation...");
  } finally {
    await updateState({ isRendering: false });
    checkPending();
  }
}

let isViewerInitialized = false;

/**
 * Creates the embedded SmoothPDF viewer controller.
 * @returns {{init: Function, load: Function, reload: Function, reset: Function}} PDF viewer controller.
 */
export function createPdfViewer() {
  const uiElements = getUIElements();
  let resizeDebounceTimer = null;

  /**
   * Binds event listeners for toolbar controls, keyboard zoom, and viewport changes.
   * @returns {void}
   */
  function bindEventListeners() {
    state.currentFront = document.getElementById("layer-1");
    state.currentBack = document.getElementById("layer-2");

    if (uiElements.container) {
      const resizeObserver = new ResizeObserver(() => {
        if (!state.currentPdfPath) {
          return;
        }
        if (
          state.currentZoomMode !== "fit-width" &&
          state.currentZoomMode !== "fit-height"
        ) {
          return;
        }
        clearTimeout(resizeDebounceTimer);
        resizeDebounceTimer = setTimeout(async () => {
          if (!state.isRendering) {
            await performCrossfadeUpdate(
              state.currentPdfPath,
              state.currentPageNumber,
              true
            );
          } else {
            await updateState({
              pendingRenderOptions: {
                anchorPage: state.currentPageNumber,
                isInstant: true,
              },
            });
          }
        }, 150);
      });
      resizeObserver.observe(uiElements.container);
    }

    if (uiElements.zoomSelect) {
      uiElements.zoomSelect.addEventListener("change", async (changeEvent) => {
        const targetPdfPath = state.currentPdfPath;
        if (!targetPdfPath && !state.currentPdfDocument) {
          return;
        }
        await updateState({ currentZoomMode: changeEvent.target.value });
        updateControlsUI();
        if (state.isRendering) {
          await updateState({
            pendingRenderOptions: {
              anchorPage: state.currentPageNumber,
              isInstant: true,
            },
          });
        } else {
          performCrossfadeUpdate(
            targetPdfPath,
            state.currentPageNumber,
            true
          );
        }
      });
    }

    window.addEventListener("keydown", async (keyboardEvent) => {
      if (!state.currentPdfPath && !state.currentPdfDocument) {
        return;
      }

      if (
        (keyboardEvent.ctrlKey || keyboardEvent.metaKey) &&
        (keyboardEvent.key === "=" || keyboardEvent.key === "+" || keyboardEvent.key === "-")
      ) {
        keyboardEvent.preventDefault();
        let nextZoomMode = state.currentZoomMode;

        if (
          state.currentZoomMode === "fit-width" ||
          state.currentZoomMode === "fit-height"
        ) {
          nextZoomMode = "1";
        } else {
          const zoomLevelScaleSteps = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4];
          const currentZoomValue = parseFloat(state.currentZoomMode);
          const currentStepIndex = zoomLevelScaleSteps.findIndex(
            (zoomStep) => Math.abs(zoomStep - currentZoomValue) < 0.01
          );

          if (currentStepIndex === -1) {
            nextZoomMode = "1";
          } else if (keyboardEvent.key === "-" && currentStepIndex > 0) {
            nextZoomMode = zoomLevelScaleSteps[currentStepIndex - 1].toString();
          } else if (
            (keyboardEvent.key === "=" || keyboardEvent.key === "+") &&
            currentStepIndex < zoomLevelScaleSteps.length - 1
          ) {
            nextZoomMode = zoomLevelScaleSteps[currentStepIndex + 1].toString();
          }
        }

        if (nextZoomMode !== state.currentZoomMode) {
          await updateState({ currentZoomMode: nextZoomMode });
          updateControlsUI();

          if (state.isRendering) {
            await updateState({
              pendingRenderOptions: {
                anchorPage: state.currentPageNumber,
                isInstant: true,
              },
            });
          } else {
            performCrossfadeUpdate(
              state.currentPdfPath,
              state.currentPageNumber,
              true
            );
          }
        }
      }
    });

    window.addEventListener("contextmenu", (contextMenuEvent) => {
      if (contextMenuEvent.target && contextMenuEvent.target.closest("#left-panel")) {
        return;
      }
      const activeSelection = window.getSelection();
      if (activeSelection && activeSelection.toString().trim().length > 0) {
        contextMenuEvent.preventDefault();
        window.atarashiiApi.showContextMenu();
      }
    });

    if (uiElements.pageInput) {
      uiElements.pageInput.addEventListener("keydown", (keyboardEvent) => {
        if (keyboardEvent.key === "Enter") {
          uiElements.pageInput.blur();
        }
      });

      uiElements.pageInput.addEventListener("blur", () => {
        jumpToPage(uiElements.pageInput.value);
      });
    }

    if (uiElements.printBtn) {
      uiElements.printBtn.addEventListener("click", async () => {
        if (state.currentPdfPath && state.currentPdfDocument) {
          await renderAllPagesForPrint(state.currentFront, state.currentPdfDocument);
          window.print();
        }
      });
    }
  }

  return {
    init() {
      if (isViewerInitialized) {
        return;
      }
      isViewerInitialized = true;
      bindEventListeners();
    },

    async setPdfPath(filePath) {
      await updateState({ currentPdfPath: filePath });
    },

    async load(filePath) {
      await updateState({ currentPdfPath: filePath });
      showMessage("Loading document.pdf...");
      await loadAndRenderPdf(filePath);
    },

    async reload(filePath) {
      await updateState({ currentPdfPath: filePath });
      if (state.isRendering) {
        await updateState({
          pendingRenderOptions: {
            anchorPage: null,
            isInstant: false,
            forceReload: true,
          },
        });
      } else {
        await performCrossfadeUpdate(filePath, null, false, true);
      }
    },

    async reset() {
      if (state.pageObserver) {
        state.pageObserver.disconnect();
      }
      if (state.visibilityObserver) {
        state.visibilityObserver.disconnect();
      }
      if (state.currentFront) {
        cancelAllRenderTasks(state.currentFront);
        state.currentFront.innerHTML = "";
      }
      if (state.currentBack) {
        cancelAllRenderTasks(state.currentBack);
        state.currentBack.innerHTML = "";
      }
      await updateState({
        currentPdfPath: null,
        currentPdfDocument: null,
        totalPages: 0,
        currentPageNumber: 1,
      });
      showMessage("Generating document.pdf...");
    },
  };
}
