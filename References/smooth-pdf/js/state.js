/**
 * @module state
 * Centralized application state management for SmoothPDF.
 */

/**
 * Global reactive application state.
 */
export const state = {
  currentPdfPath: null,
  currentPdfDocument: null,
  isRendering: false,
  pendingRenderOptions: null,
  currentZoomMode: "1.25",
  totalPages: 0,
  currentPageNumber: 1,
  isScrollNavigating: false,
  pageObserver: null,
  visibilityObserver: null,
  ignoreScrollEvents: false,
  currentFront: document.getElementById("layer-1"),
  currentBack: document.getElementById("layer-2"),
};

/**
 * Updates application state and cleans up resources if necessary.
 * @param {Partial<typeof state>} updates - State properties to update.
 * @returns {Promise<void>}
 */
export async function updateState(updates) {
  if (
    updates.currentPdfDocument !== undefined &&
    state.currentPdfDocument !== null &&
    state.currentPdfDocument !== updates.currentPdfDocument
  ) {
    try {
      await state.currentPdfDocument.destroy();
    } catch (err) {
      console.error("Error destroying previous PDF document:", err);
    }
  }

  Object.assign(state, updates);
}
