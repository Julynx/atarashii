/**
 * @module state
 * Reactive application state store for the SmoothPDF rendering engine.
 */

/**
 * Shared state instance for PDF rendering, layers, and navigation observers.
 */
export const state = {
  currentPdfPath: null,
  currentPdfDocument: null,
  isRendering: false,
  pendingRenderOptions: null,
  currentZoomMode: "fit-width",
  totalPages: 0,
  currentPageNumber: 1,
  isScrollNavigating: false,
  pageObserver: null,
  visibilityObserver: null,
  ignoreScrollEvents: false,
  currentFront: null,
  currentBack: null,
};

/**
 * Updates application state and releases superseded PDF documents.
 * @param {Partial<typeof state>} stateUpdates - Properties to update.
 * @returns {Promise<void>}
 */
export async function updateState(stateUpdates) {
  if (
    stateUpdates.currentPdfDocument !== undefined &&
    state.currentPdfDocument !== null &&
    state.currentPdfDocument !== stateUpdates.currentPdfDocument
  ) {
    try {
      await state.currentPdfDocument.destroy();
    } catch (destroyError) {
      console.error("Error destroying superseded PDF document:", destroyError);
    }
  }

  Object.assign(state, stateUpdates);
}
