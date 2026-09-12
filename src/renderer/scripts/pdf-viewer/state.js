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
  renderPassIdentifier: 0,
};

/**
 * Destroys a superseded PDF document proxy after detachment.
 * @param {import("pdfjs-dist").PDFDocumentProxy|null} documentProxy - PDF document proxy to destroy.
 * @returns {Promise<void>}
 */
export async function destroyPdfDocument(documentProxy) {
  if (!documentProxy) {
    return;
  }
  try {
    await documentProxy.destroy();
  } catch (destroyError) {
    console.error("Error destroying superseded PDF document:", destroyError);
  }
}

/**
 * Updates application state properties.
 * @param {Partial<typeof state>} stateUpdates - Properties to update.
 * @returns {Promise<void>}
 */
export async function updateState(stateUpdates) {
  Object.assign(state, stateUpdates);
}
