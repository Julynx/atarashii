/**
 * @module ui
 * UI element coordination and intersection/scroll observers for SmoothPDF.
 */

import { state, updateState } from "./state.js";
import { renderPageContainer, unrenderPageContainer } from "./pdf.js";

let cachedUiElements = null;

/**
 * Retrieves and caches the DOM references for PDF viewer controls.
 * @returns {object} Cached UI element references.
 */
export function getUIElements() {
  if (!cachedUiElements) {
    cachedUiElements = {
      messageOverlay: document.getElementById("pdf-message-overlay"),
      container: document.getElementById("pdf-viewport-container"),
      messageText: document.getElementById("pdf-message-label"),
      pdfControls: document.getElementById("pdf-toolbar-controls"),
      zoomSelect: document.getElementById("pdf-zoom-select"),
      pageInput: document.getElementById("pdf-page-number-input"),
      pageCountText: document.getElementById("pdf-page-total-label"),
      printBtn: document.getElementById("pdf-print-action-button"),
    };
  }
  return cachedUiElements;
}

/**
 * Displays status message overlay.
 * @param {string} statusMessage - Informational message string.
 * @returns {void}
 */
export function showMessage(statusMessage) {
  const elements = getUIElements();
  if (elements.messageText) {
    elements.messageText.textContent = statusMessage;
  }
  if (elements.messageOverlay) {
    elements.messageOverlay.classList.remove("hidden");
  }
}

/**
 * Hides message overlay and exposes viewport container.
 * @returns {void}
 */
export function hideMessage() {
  const elements = getUIElements();
  if (elements.messageOverlay) {
    elements.messageOverlay.classList.add("hidden");
  }
}

/**
 * Updates page count, zoom dropdown, and page input fields.
 * @returns {void}
 */
export function updateControlsUI() {
  const elements = getUIElements();
  if (elements.pageCountText) {
    elements.pageCountText.textContent = `/ ${state.totalPages}`;
  }
  if (elements.zoomSelect) {
    elements.zoomSelect.value = state.currentZoomMode;
  }
  if (elements.pageInput) {
    elements.pageInput.value = state.currentPageNumber;
  }
}

/**
 * Synchronizes the active page number based on current scroll position.
 * @param {HTMLElement} layerElement - Scrollable PDF layer.
 * @returns {void}
 */
export function syncCurrentPageFromScroll(layerElement) {
  if (!layerElement || state.ignoreScrollEvents || state.totalPages <= 0) {
    return;
  }

  const scrollTop = layerElement.scrollTop;
  const clientHeight = layerElement.clientHeight;
  const scrollHeight = layerElement.scrollHeight;

  let targetPage = 1;
  if (scrollTop <= 16) {
    targetPage = 1;
  } else if (scrollTop + clientHeight >= scrollHeight - 16) {
    targetPage = state.totalPages;
  } else {
    const targetCenter = scrollTop + clientHeight / 2;
    const containers = layerElement.querySelectorAll(".page-container");
    let low = 0;
    let high = containers.length - 1;

    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      const container = containers[mid];
      const containerTop = container.offsetTop;
      const containerBottom = containerTop + container.offsetHeight + 24;

      if (targetCenter >= containerTop && targetCenter < containerBottom) {
        targetPage = parseInt(container.dataset.pageNumber, 10) || mid + 1;
        break;
      } else if (targetCenter < containerTop) {
        high = mid - 1;
      } else {
        low = mid + 1;
      }
    }
  }

  targetPage = Math.max(1, Math.min(targetPage, state.totalPages));
  if (targetPage !== state.currentPageNumber) {
    state.currentPageNumber = targetPage;
    const elements = getUIElements();
    if (elements.pageInput && document.activeElement !== elements.pageInput) {
      elements.pageInput.value = targetPage;
    }
  }
}

/**
 * Sets up scroll event listeners on the active layer to synchronize page numbering.
 * @param {HTMLElement} layerElement - Container layer element.
 * @returns {Promise<void>}
 */
export async function setupPageObserver(layerElement) {
  if (state.pageObserver) {
    state.pageObserver.disconnect();
  }

  let isScrollScheduled = false;
  const onScroll = () => {
    if (isScrollScheduled) {
      return;
    }
    isScrollScheduled = true;
    requestAnimationFrame(() => {
      isScrollScheduled = false;
      syncCurrentPageFromScroll(layerElement);
    });
  };

  const onScrollEnd = () => {
    syncCurrentPageFromScroll(layerElement);
  };

  layerElement.addEventListener("scroll", onScroll, { passive: true });
  layerElement.addEventListener("scrollend", onScrollEnd, { passive: true });

  const pageObserver = {
    disconnect() {
      layerElement.removeEventListener("scroll", onScroll);
      layerElement.removeEventListener("scrollend", onScrollEnd);
    },
  };

  await updateState({ pageObserver });
  syncCurrentPageFromScroll(layerElement);
}

/**
 * Sets up an intersection observer to render and unrender pages on viewport intersection.
 * @param {HTMLElement} layerElement - Container layer element.
 * @param {import("pdfjs-dist").PDFDocumentProxy} pdfDocument - Active PDF document.
 * @returns {Promise<void>}
 */
export async function setupVisibilityObserver(layerElement, pdfDocument) {
  if (state.visibilityObserver) {
    state.visibilityObserver.disconnect();
  }

  const visibilityObserver = new IntersectionObserver(
    (entries) => {
      if (state.isScrollNavigating) {
        return;
      }

      entries.forEach((entry) => {
        const pageContainer = entry.target;
        if (entry.isIntersecting) {
          renderPageContainer(pageContainer, pdfDocument).catch((renderError) => {
            console.error("Error rendering visible page container:", renderError);
          });
        } else {
          unrenderPageContainer(pageContainer);
        }
      });
    },
    {
      root: layerElement,
      rootMargin: "1200px 0px 1200px 0px",
      threshold: 0,
    }
  );

  await updateState({ visibilityObserver });

  const containers = layerElement.querySelectorAll(".page-container");
  containers.forEach((container) => visibilityObserver.observe(container));
}
