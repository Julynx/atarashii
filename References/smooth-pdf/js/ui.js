/**
 * @module ui
 * UI element management, window updates, and scroll/visibility intersection observers.
 */

import { state, updateState } from "./state.js";
import { renderPageContainer, unrenderPageContainer } from "./pdf.js";

const elements = {
  messageOverlay: document.getElementById("message-overlay"),
  container: document.getElementById("container"),
  messageText: document.getElementById("message-text"),
  openFileBtn: document.getElementById("open-file-btn"),
  pdfControls: document.getElementById("pdf-controls"),
  zoomSelect: document.getElementById("zoom-select"),
  pageInput: document.getElementById("page-input"),
  pageCountText: document.getElementById("page-count-text"),
  printBtn: document.getElementById("print-btn"),
  closeBtn: document.getElementById("close-btn"),
  appTitleText: document.getElementById("app-title-text"),
};

/**
 * Retrieves the cached DOM element references for the application UI.
 * @returns {typeof elements} The UI elements object.
 */
export function getUIElements() {
  return elements;
}

/**
 * Updates the application window title text based on the active file.
 * @param {string|null} filePath - Absolute path to the currently open PDF file.
 * @returns {void}
 */
export function updateWindowTitle(filePath) {
  if (!elements.appTitleText) {
    return;
  }
  if (filePath) {
    const fileName = filePath.split(/[/\\]/).pop();
    elements.appTitleText.textContent = `SmoothPDF - ${fileName}`;
  } else {
    elements.appTitleText.textContent = "SmoothPDF";
  }
}

/**
 * Displays an informational or status overlay message to the user.
 * @param {string} message - Status message text to display.
 * @returns {void}
 */
export function showMessage(message) {
  if (elements.messageText) {
    elements.messageText.textContent = message;
  }
  if (elements.messageOverlay) {
    elements.messageOverlay.classList.remove("hidden");
  }
  if (elements.container) {
    elements.container.classList.add("hidden");
  }
}

/**
 * Hides the informational message overlay and displays the PDF viewport container.
 * @returns {void}
 */
export function hideMessage() {
  if (elements.messageOverlay) {
    elements.messageOverlay.classList.add("hidden");
  }
  if (elements.container) {
    elements.container.classList.remove("hidden");
  }
}

/**
 * Synchronizes toolbar input and text elements with current application state.
 * @returns {void}
 */
export function updateControlsUI() {
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
 * Deterministically calculates and updates the active page number from scroll position.
 * @param {HTMLElement} layerElement - The container layer element.
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
    if (elements.pageInput && document.activeElement !== elements.pageInput) {
      elements.pageInput.value = targetPage;
    }
  }
}

/**
 * Sets up scroll event listeners to track the active page number during scrolling.
 * @param {HTMLElement} layerElement - The container layer element to observe.
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
    disconnect: () => {
      layerElement.removeEventListener("scroll", onScroll);
      layerElement.removeEventListener("scrollend", onScrollEnd);
    },
  };

  await updateState({ pageObserver });
  syncCurrentPageFromScroll(layerElement);
}

/**
 * Sets up an intersection observer to lazily render and unrender pages as they enter or leave viewport.
 * @param {HTMLElement} layerElement - The container layer element to observe.
 * @param {import("pdfjs-dist").PDFDocumentProxy} pdfDocument - The active PDF document instance.
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
          renderPageContainer(pageContainer, pdfDocument).catch((err) => {
            console.error("Error rendering visible page container:", err);
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
    },
  );

  await updateState({ visibilityObserver });

  const containers = layerElement.querySelectorAll(".page-container");
  containers.forEach((container) => visibilityObserver.observe(container));
}
