/**
 * @module renderer
 * Main renderer orchestration, crossfade transitions, event handling, and initialization.
 */

import { state, updateState } from "./js/state.js";
import {
  getUIElements,
  updateWindowTitle,
  showMessage,
  hideMessage,
  updateControlsUI,
  setupPageObserver,
  setupVisibilityObserver,
} from "./js/ui.js";
import {
  loadPdfDocument,
  jumpToPage,
  renderDocumentToLayer,
  renderVisiblePages,
  renderAllPagesForPrint,
  cancelAllRenderTasks,
} from "./js/pdf.js";

const ui = getUIElements();

/**
 * Checks for queued render options and executes the next crossfade update if present.
 * @returns {Promise<void>}
 */
async function checkPending() {
  if (state.pendingRenderOptions) {
    const options = state.pendingRenderOptions;
    await updateState({ pendingRenderOptions: null });
    performCrossfadeUpdate(
      state.currentPdfPath,
      options.anchorPage,
      options.isInstant,
      options.forceReload,
    );
  }
}

/**
 * Executes a smooth crossfade transition between two layer elements.
 * @param {string} filePath - Path of the target PDF document.
 * @param {number|null} [anchorPage=null] - Page number to maintain scroll alignment.
 * @param {boolean} [isInstant=false] - Whether to bypass animated opacity transition.
 * @param {boolean} [forceReload=false] - Whether to re-fetch document from disk.
 * @returns {Promise<void>}
 */
async function performCrossfadeUpdate(
  filePath,
  anchorPage = null,
  isInstant = false,
  forceReload = false,
) {
  await updateState({ isRendering: true });
  try {
    let pdfDocument;
    if (
      !forceReload &&
      filePath === state.currentPdfPath &&
      state.currentPdfDocument
    ) {
      pdfDocument = state.currentPdfDocument;
    } else {
      pdfDocument = await loadPdfDocument(filePath);
      await updateState({ currentPdfDocument: pdfDocument });
    }

    await updateState({ totalPages: pdfDocument.numPages });
    updateControlsUI();

    const currentScrollPos = state.currentFront.scrollTop;

    let relativeOffset = 0;
    if (anchorPage) {
      const oldAnchorCanvas = state.currentFront.querySelector(
        `.page-container[data-page-number="${anchorPage}"]`,
      );
      if (oldAnchorCanvas) {
        const distanceIntoPage =
          currentScrollPos + 16 - oldAnchorCanvas.offsetTop;
        relativeOffset = distanceIntoPage / oldAnchorCanvas.offsetHeight;
      }
    }

    const anchorCanvas = await renderDocumentToLayer(
      pdfDocument,
      state.currentBack,
      anchorPage,
    );

    if (anchorCanvas) {
      const newScrollTop =
        anchorCanvas.offsetTop -
        16 +
        relativeOffset * anchorCanvas.offsetHeight;
      state.currentBack.scrollTop = Math.max(0, newScrollTop);
    } else {
      state.currentBack.scrollTop = currentScrollPos;
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

    const temp = state.currentFront;
    await updateState({ currentFront: state.currentBack, currentBack: temp });
  } catch (err) {
    console.error("Crossfade update error:", err);
  } finally {
    await updateState({ isRendering: false });
    checkPending();
  }
}

/**
 * Loads a PDF document and renders initial visible pages onto the front layer.
 * @param {string} filePath - Absolute path to the PDF document.
 * @returns {Promise<void>}
 */
async function loadAndRenderPdf(filePath) {
  await updateState({ isRendering: true });
  try {
    const pdfDocument = await loadPdfDocument(filePath);
    await updateState({
      currentPdfDocument: pdfDocument,
      totalPages: pdfDocument.numPages,
    });

    updateControlsUI();
    if (ui.pdfControls) {
      ui.pdfControls.classList.remove("hidden");
    }

    await renderDocumentToLayer(pdfDocument, state.currentFront);
    await renderVisiblePages(state.currentFront, pdfDocument);

    setupPageObserver(state.currentFront);
    setupVisibilityObserver(state.currentFront, pdfDocument);
    hideMessage();
  } catch (err) {
    console.error("Initial load error:", err);
    showMessage("Failed to load initial PDF");
  } finally {
    await updateState({ isRendering: false });
    checkPending();
  }
}

/**
 * Closes the currently active PDF document and resets UI state.
 * @returns {Promise<void>}
 */
async function closePdf() {
  try {
    await window.api.closeFile();
    await updateState({
      currentPdfPath: null,
      currentPdfDocument: null,
      totalPages: 0,
      currentPageNumber: 1,
    });

    if (state.pageObserver) {
      state.pageObserver.disconnect();
      await updateState({ pageObserver: null });
    }

    if (state.visibilityObserver) {
      state.visibilityObserver.disconnect();
      await updateState({ visibilityObserver: null });
    }

    cancelAllRenderTasks(state.currentFront);
    cancelAllRenderTasks(state.currentBack);
    state.currentFront.innerHTML = "";
    state.currentBack.innerHTML = "";

    if (ui.pdfControls) {
      ui.pdfControls.classList.add("hidden");
    }
    updateWindowTitle(null);

    if (ui.openFileBtn) {
      ui.openFileBtn.classList.remove("hidden");
    }

    showMessage("No PDF loaded. Click 'Open PDF' to begin.");
  } catch (err) {
    console.error("Error closing file:", err);
  }
}

let resizeTimeout;
const containerObserver = new ResizeObserver(() => {
  if (!state.currentPdfPath) {
    return;
  }
  clearTimeout(resizeTimeout);
  resizeTimeout = setTimeout(async () => {
    if (!state.isRendering) {
      await performCrossfadeUpdate(
        state.currentPdfPath,
        state.currentPageNumber,
        true,
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

if (ui.container) {
  containerObserver.observe(ui.container);
}

window.addEventListener("keydown", async (event) => {
  if (!state.currentPdfPath) {
    return;
  }

  if (
    (event.ctrlKey || event.metaKey) &&
    (event.key === "=" || event.key === "+" || event.key === "-")
  ) {
    event.preventDefault();
    let newZoomMode = state.currentZoomMode;

    if (
      state.currentZoomMode === "fit-width" ||
      state.currentZoomMode === "fit-height"
    ) {
      newZoomMode = "1";
    } else {
      const zoomLevels = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4];
      const currentZoomFloat = parseFloat(state.currentZoomMode);
      const currentIndex = zoomLevels.findIndex(
        (z) => Math.abs(z - currentZoomFloat) < 0.01,
      );

      if (currentIndex === -1) {
        newZoomMode = "1";
      } else {
        if (event.key === "-" && currentIndex > 0) {
          newZoomMode = zoomLevels[currentIndex - 1].toString();
        } else if (
          (event.key === "=" || event.key === "+") &&
          currentIndex < zoomLevels.length - 1
        ) {
          newZoomMode = zoomLevels[currentIndex + 1].toString();
        }
      }
    }

    if (newZoomMode !== state.currentZoomMode) {
      await updateState({ currentZoomMode: newZoomMode });
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
          true,
        );
      }
    }
  }
});

if (ui.zoomSelect) {
  ui.zoomSelect.addEventListener("change", async (event) => {
    if (!state.currentPdfPath) {
      event.target.value = state.currentZoomMode;
      return;
    }
    await updateState({ currentZoomMode: event.target.value });
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
        true,
      );
    }
  });
}

if (ui.pageInput) {
  ui.pageInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      ui.pageInput.blur();
    }
  });

  ui.pageInput.addEventListener("blur", () => {
    jumpToPage(ui.pageInput.value);
  });
}

if (ui.closeBtn) {
  ui.closeBtn.addEventListener("click", async () => {
    await closePdf();
  });
}

if (ui.printBtn) {
  ui.printBtn.addEventListener("click", async () => {
    if (state.currentPdfPath && state.currentPdfDocument) {
      await renderAllPagesForPrint(
        state.currentFront,
        state.currentPdfDocument,
      );
      window.print();
    }
  });
}

window.addEventListener("beforeprint", async () => {
  if (state.currentPdfDocument && state.currentFront) {
    await renderAllPagesForPrint(
      state.currentFront,
      state.currentPdfDocument,
    );
  }
});

window.addEventListener("afterprint", () => {
  if (state.currentPdfDocument && state.currentFront) {
    setupVisibilityObserver(state.currentFront, state.currentPdfDocument);
  }
});

if (ui.openFileBtn) {
  ui.openFileBtn.addEventListener("click", async () => {
    try {
      const filePath = await window.api.selectFile();
      if (filePath) {
        await updateState({ currentPdfPath: filePath });
        updateWindowTitle(filePath);
        ui.openFileBtn.classList.add("hidden");
        showMessage("Loading PDF...");
        await loadAndRenderPdf(filePath);
      }
    } catch (err) {
      console.error("Error opening file:", err);
    }
  });
}

window.addEventListener("contextmenu", (event) => {
  const selection = window.getSelection();
  if (selection && selection.toString().trim() !== "") {
    event.preventDefault();
    window.api.showContextMenu();
  }
});

/**
 * Initializes application state, checks initial launch arguments, and sets up file watchers.
 * @returns {Promise<void>}
 */
async function init() {
  try {
    const filePath = await window.api.getFilePath();
    if (filePath) {
      await updateState({ currentPdfPath: filePath });
      updateWindowTitle(filePath);
      ui.openFileBtn.classList.add("hidden");
      showMessage("Loading PDF...");
      await loadAndRenderPdf(filePath);
    } else {
      showMessage("No PDF loaded. Click 'Open PDF' to begin.");
    }

    window.api.onFileUpdated(async (updatedPath) => {
      await updateState({ currentPdfPath: updatedPath });
      if (state.isRendering) {
        await updateState({
          pendingRenderOptions: {
            anchorPage: null,
            isInstant: false,
            forceReload: true,
          },
        });
      } else {
        await performCrossfadeUpdate(updatedPath, null, false, true);
      }
    });
  } catch (err) {
    console.error("Init Error:", err);
    showMessage("Application Init Failed");
  }
}

init();
