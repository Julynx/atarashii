/**
 * @module pdf
 * PDF document loading, rendering lifecycle, and navigation logic.
 */

import * as pdfjsLib from "../public/pdf.mjs";
import { state } from "./state.js";
import { getUIElements, syncCurrentPageFromScroll } from "./ui.js";

pdfjsLib.GlobalWorkerOptions.workerSrc = "../public/pdf.worker.mjs";

const activeRenderTasks = new WeakMap();
let activeNavigationId = 0;

/**
 * Loads a PDF document from a given local file path.
 * @param {string} filePath - Absolute path of the target PDF file.
 * @returns {Promise<import("pdfjs-dist").PDFDocumentProxy>} The loaded PDF document proxy.
 */
export async function loadPdfDocument(filePath) {
  const loadingTask = pdfjsLib.getDocument(
    `safe-file://${encodeURIComponent(filePath)}`,
  );
  return await loadingTask.promise;
}

/**
 * Creates a link service adapter for PDF.js annotation layer navigation.
 * @param {import("pdfjs-dist").PDFDocumentProxy} pdfDocument - The PDF document instance.
 * @returns {object} Link service configuration object.
 */
function createLinkService(pdfDocument) {
  return {
    getDestinationHash: (dest) => dest,
    getAnchorUrl: (href) => href || "",
    setDocument: () => {},
    executeNamedAction: () => {},
    cachePageRef: () => {},
    isPageVisible: () => true,
    isPageCached: () => true,
    addLinkAttributes: (link, url) => {
      link.href = url;
    },
    goToDestination: (dest) => {
      if (typeof dest === "string") {
        pdfDocument
          .getDestination(dest)
          .then((explicitDest) => {
            if (Array.isArray(explicitDest) && explicitDest.length > 0) {
              const pageRef = explicitDest[0];
              pdfDocument
                .getPageIndex(pageRef)
                .then((pageIndex) => {
                  jumpToPage(pageIndex + 1, explicitDest);
                })
                .catch((err) => {
                  console.error("Failed to resolve destination page index:", err);
                });
            }
          })
          .catch((err) => {
            console.error("Failed to resolve named destination:", err);
          });
      } else if (Array.isArray(dest) && dest.length > 0) {
        const pageRef = dest[0];
        pdfDocument
          .getPageIndex(pageRef)
          .then((pageIndex) => {
            jumpToPage(pageIndex + 1, dest);
          })
          .catch((err) => {
            console.error(
              "Failed to resolve explicit destination page index:",
              err,
            );
          });
      }
    },
  };
}

/**
 * Attaches click event listeners for in-document hash links.
 * @param {HTMLElement} annotationLayerDiv - The annotation layer DOM element.
 * @param {import("pdfjs-dist").PDFDocumentProxy} pdfDocument - The PDF document instance.
 * @returns {void}
 */
function attachAnnotationClickHandler(annotationLayerDiv, pdfDocument) {
  annotationLayerDiv.addEventListener("click", (event) => {
    const linkElement = event.target.closest("a");
    if (!linkElement) {
      return;
    }

    const href = linkElement.getAttribute("href");
    if (!href || !href.startsWith("#")) {
      return;
    }

    event.preventDefault();

    const pageMatch = href.match(/page=(\d+)/);
    if (pageMatch) {
      const targetPageNum = parseInt(pageMatch[1], 10);
      if (!isNaN(targetPageNum)) {
        jumpToPage(targetPageNum);
        return;
      }
    }

    try {
      const parsedDestination = JSON.parse(
        decodeURIComponent(href.substring(1)),
      );
      if (Array.isArray(parsedDestination) && parsedDestination.length > 0) {
        const pageRef = parsedDestination[0];
        pdfDocument
          .getPageIndex(pageRef)
          .then((pageIndex) => {
            jumpToPage(pageIndex + 1, parsedDestination);
          })
          .catch((err) => {
            console.error("Failed to resolve page index from link:", err);
          });
      }
    } catch {
      return;
    }
  });
}

/**
 * Calculates the rendering scale for a page based on current zoom mode.
 * @param {import("pdfjs-dist").PageViewport} unscaledViewport - Unscaled page viewport.
 * @param {number} containerWidth - Available container width.
 * @param {number} containerHeight - Available container height.
 * @param {string} zoomMode - Selected zoom mode.
 * @returns {number} Calculated scale factor.
 */
export function calculatePageScale(
  unscaledViewport,
  containerWidth,
  containerHeight,
  zoomMode,
) {
  let finalScale = 1.0;
  if (zoomMode === "fit-width") {
    finalScale = containerWidth / unscaledViewport.width;
  } else if (zoomMode === "fit-height") {
    finalScale = (containerHeight - 88) / unscaledViewport.height;
  } else {
    finalScale = parseFloat(zoomMode) * (96 / 72) * (1 / 1.18);
  }
  return Math.min(Math.max(finalScale, 0.1), 5.0);
}

/**
 * Scrolls the document smoothly to a target page and optional destination coordinates.
 * @param {number|string} inputVal - The target page number.
 * @param {Array<any>|null} [destArray=null] - Optional explicit destination array from PDF.js.
 * @returns {void}
 */
export function jumpToPage(inputVal, destArray = null) {
  if (!state.currentPdfPath) {
    return;
  }
  const elements = getUIElements();

  let targetPageNumber = parseInt(inputVal, 10);
  if (isNaN(targetPageNumber)) {
    if (elements.pageInput) {
      elements.pageInput.value = state.currentPageNumber;
    }
    return;
  }

  targetPageNumber = Math.max(1, Math.min(targetPageNumber, state.totalPages));

  const targetContainer = state.currentFront.querySelector(
    `.page-container[data-page-number="${targetPageNumber}"]`,
  );

  if (!targetContainer) {
    return;
  }

  let targetScrollTop = targetContainer.offsetTop - 16;

  if (destArray && Array.isArray(destArray) && destArray.length >= 4) {
    const destType = destArray[1];
    if (destType && destType.name === "XYZ") {
      const unscaledY = destArray[3];
      if (typeof unscaledY === "number") {
        let scaleFactor = 1.0;
        const scaleStr =
          targetContainer.dataset.scaleFactor ||
          targetContainer.style.getPropertyValue("--scale-factor");
        if (scaleStr) {
          scaleFactor = parseFloat(scaleStr);
        }

        const pixelHeight =
          targetContainer.clientHeight ||
          parseFloat(targetContainer.style.height);
        const unscaledHeight = pixelHeight / scaleFactor;

        let yOffsetPoint = 0;
        if (unscaledY <= unscaledHeight) {
          yOffsetPoint = unscaledHeight - unscaledY;
        }

        const yOffsetPx = yOffsetPoint * scaleFactor;
        targetScrollTop = targetContainer.offsetTop + yOffsetPx - 16;

        targetScrollTop = Math.min(
          targetScrollTop,
          targetContainer.offsetTop + pixelHeight - 16,
        );
      }
    }
  }

  if (
    targetPageNumber === 1 &&
    (!destArray ||
      Math.abs(targetScrollTop - targetContainer.offsetTop + 16) < 10)
  ) {
    targetScrollTop = 0;
  }

  targetScrollTop = Math.max(0, targetScrollTop);

  if (Math.abs(state.currentFront.scrollTop - targetScrollTop) < 2) {
    if (state.currentPdfDocument) {
      renderVisiblePages(state.currentFront, state.currentPdfDocument);
    }
    return;
  }

  const currentNavigationId = ++activeNavigationId;
  state.isScrollNavigating = true;
  state.ignoreScrollEvents = true;
  state.currentPageNumber = targetPageNumber;
  if (elements.pageInput) {
    elements.pageInput.value = targetPageNumber;
  }

  let settled = false;
  const onScrollEnd = () => {
    if (settled || activeNavigationId !== currentNavigationId) {
      return;
    }
    settled = true;
    state.isScrollNavigating = false;
    state.ignoreScrollEvents = false;
    if (state.currentPdfDocument) {
      renderVisiblePages(state.currentFront, state.currentPdfDocument);
    }
    syncCurrentPageFromScroll(state.currentFront);
  };

  state.currentFront.addEventListener("scrollend", onScrollEnd, { once: true });
  setTimeout(onScrollEnd, 1200);

  state.currentFront.scrollTo({
    top: targetScrollTop,
    behavior: "smooth",
  });
}

/**
 * Renders the canvas, text layer, and annotation layer for a specific page container.
 * @param {HTMLElement} pageContainer - The DOM container element for the page.
 * @param {import("pdfjs-dist").PDFDocumentProxy} pdfDocument - The PDF document instance.
 * @returns {Promise<void>}
 */
export async function renderPageContainer(pageContainer, pdfDocument) {
  if (
    pageContainer.dataset.renderStatus === "rendered" ||
    pageContainer.dataset.renderStatus === "rendering"
  ) {
    return;
  }

  const pageNumber = parseInt(pageContainer.dataset.pageNumber, 10);
  if (isNaN(pageNumber)) {
    return;
  }

  pageContainer.dataset.renderStatus = "rendering";

  let page;
  try {
    page = await pdfDocument.getPage(pageNumber);
  } catch (err) {
    pageContainer.dataset.renderStatus = "idle";
    console.error(`Failed to load page ${pageNumber}:`, err);
    return;
  }

  const scaleFactor = parseFloat(
    pageContainer.dataset.scaleFactor ||
      pageContainer.style.getPropertyValue("--scale-factor") ||
      "1",
  );
  const viewport = page.getViewport({ scale: scaleFactor });
  const outputScale = window.devicePixelRatio || 1;

  let canvas = pageContainer.querySelector("canvas");
  if (!canvas) {
    canvas = document.createElement("canvas");
    pageContainer.appendChild(canvas);
  }

  canvas.width = Math.floor(viewport.width * outputScale);
  canvas.height = Math.floor(viewport.height * outputScale);
  canvas.style.width = "100%";
  canvas.style.height = "100%";

  const context = canvas.getContext("2d");
  const transform =
    outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : null;

  const renderContext = { canvasContext: context, transform, viewport };
  const renderTask = page.render(renderContext);

  activeRenderTasks.set(pageContainer, renderTask);

  try {
    await renderTask.promise;
  } catch (err) {
    if (err && err.name === "RenderingCancelledException") {
      return;
    }
    pageContainer.dataset.renderStatus = "idle";
    console.error(`Page ${pageNumber} canvas render error:`, err);
    return;
  } finally {
    activeRenderTasks.delete(pageContainer);
  }

  if (pageContainer.dataset.renderStatus !== "rendering") {
    return;
  }

  try {
    let textLayerDiv = pageContainer.querySelector(".textLayer");
    if (!textLayerDiv) {
      textLayerDiv = document.createElement("div");
      textLayerDiv.className = "textLayer";
      textLayerDiv.style.setProperty("--scale-factor", viewport.scale);
      pageContainer.appendChild(textLayerDiv);
    } else {
      textLayerDiv.innerHTML = "";
    }

    const textContent = await page.getTextContent();
    const textLayer = new pdfjsLib.TextLayer({
      textContentSource: textContent,
      container: textLayerDiv,
      viewport: viewport,
    });
    await textLayer.render();

    let annotationLayerDiv = pageContainer.querySelector(".annotationLayer");
    if (!annotationLayerDiv) {
      annotationLayerDiv = document.createElement("div");
      annotationLayerDiv.className = "annotationLayer";
      annotationLayerDiv.style.setProperty("--scale-factor", viewport.scale);
      pageContainer.appendChild(annotationLayerDiv);
    } else {
      annotationLayerDiv.innerHTML = "";
    }

    const annotations = await page.getAnnotations();
    const annotationLayer = new pdfjsLib.AnnotationLayer({
      div: annotationLayerDiv,
      accessibilityManager: null,
      annotationCanvasMap: null,
      annotationEditorUIManager: null,
      page: page,
      viewport: viewport,
      structTreeLayer: null,
    });

    await annotationLayer.render({
      viewport: viewport,
      div: annotationLayerDiv,
      annotations: annotations,
      page: page,
      linkService: createLinkService(pdfDocument),
      downloadManager: null,
      renderForms: false,
    });

    attachAnnotationClickHandler(annotationLayerDiv, pdfDocument);

    pageContainer.dataset.renderStatus = "rendered";
  } catch (err) {
    pageContainer.dataset.renderStatus = "idle";
    console.error(`Page ${pageNumber} layer render error:`, err);
  }
}

/**
 * Unmounts canvas, text layer, and annotation layer from a page container to reclaim memory.
 * @param {HTMLElement} pageContainer - The DOM container element to unrender.
 * @returns {void}
 */
export function unrenderPageContainer(pageContainer) {
  const currentTask = activeRenderTasks.get(pageContainer);
  if (currentTask) {
    try {
      currentTask.cancel();
    } catch (err) {
      console.error("Error cancelling render task:", err);
    }
    activeRenderTasks.delete(pageContainer);
  }

  pageContainer.dataset.renderStatus = "idle";
  pageContainer.innerHTML = "";
}

/**
 * Cancels all active render tasks and clears page contents in a layer element.
 * @param {HTMLElement} layerElement - The container layer element.
 * @returns {void}
 */
export function cancelAllRenderTasks(layerElement) {
  const containers = layerElement.querySelectorAll(".page-container");
  containers.forEach((container) => {
    unrenderPageContainer(container);
  });
}

/**
 * Renders all page containers that are currently within the visible viewport buffer.
 * @param {HTMLElement} layerElement - The container layer element.
 * @param {import("pdfjs-dist").PDFDocumentProxy} pdfDocument - The PDF document instance.
 * @param {number} [bufferPx=800] - Additional pixel buffer above and below viewport.
 * @returns {Promise<void[]>}
 */
export async function renderVisiblePages(
  layerElement,
  pdfDocument,
  bufferPx = 800,
) {
  const visibleTop = layerElement.scrollTop - bufferPx;
  const visibleBottom =
    layerElement.scrollTop + layerElement.clientHeight + bufferPx;

  const containers = layerElement.querySelectorAll(".page-container");
  const renderPromises = [];

  containers.forEach((container) => {
    const containerTop = container.offsetTop;
    const containerBottom = containerTop + container.offsetHeight;

    if (containerBottom >= visibleTop && containerTop <= visibleBottom) {
      renderPromises.push(renderPageContainer(container, pdfDocument));
    }
  });

  return Promise.all(renderPromises);
}

/**
 * Generates lightweight page container skeletons for the entire document and attaches them to the layer.
 * @param {import("pdfjs-dist").PDFDocumentProxy} pdfDocument - The PDF document instance.
 * @param {HTMLElement} targetLayer - The DOM layer receiving page skeletons.
 * @param {number|null} [pageToAnchor=null] - Optional page number to anchor scroll position.
 * @returns {Promise<HTMLElement|null>} The anchored container element if requested.
 */
export async function renderDocumentToLayer(
  pdfDocument,
  targetLayer,
  pageToAnchor = null,
) {
  cancelAllRenderTasks(targetLayer);
  targetLayer.innerHTML = "";

  const targetWidth = targetLayer.clientWidth * 0.9;
  let targetAnchorCanvas = null;

  const pagePromises = Array.from(
    { length: pdfDocument.numPages },
    (_, index) => pdfDocument.getPage(index + 1),
  );
  const pages = await Promise.all(pagePromises);

  const fragment = document.createDocumentFragment();

  for (let index = 0; index < pages.length; index++) {
    const page = pages[index];
    const pageNum = index + 1;
    const unscaledViewport = page.getViewport({ scale: 1.0 });

    const finalScale = calculatePageScale(
      unscaledViewport,
      targetWidth,
      targetLayer.clientHeight,
      state.currentZoomMode,
    );

    const viewport = page.getViewport({ scale: finalScale });
    const pageContainer = document.createElement("div");
    pageContainer.className = "page-container";
    pageContainer.dataset.pageNumber = String(pageNum);
    pageContainer.dataset.scaleFactor = String(viewport.scale);
    pageContainer.dataset.renderStatus = "idle";
    pageContainer.style.setProperty("--scale-factor", String(viewport.scale));
    pageContainer.style.width = Math.floor(viewport.width) + "px";
    pageContainer.style.height = Math.floor(viewport.height) + "px";

    if (pageNum === pageToAnchor) {
      targetAnchorCanvas = pageContainer;
    }

    fragment.appendChild(pageContainer);
  }

  targetLayer.appendChild(fragment);
  return targetAnchorCanvas;
}

/**
 * Renders all pages across the document for printing.
 * @param {HTMLElement} layerElement - The container layer element.
 * @param {import("pdfjs-dist").PDFDocumentProxy} pdfDocument - The PDF document instance.
 * @returns {Promise<void>}
 */
export async function renderAllPagesForPrint(layerElement, pdfDocument) {
  const containers = layerElement.querySelectorAll(".page-container");
  const renderPromises = Array.from(containers).map((container) =>
    renderPageContainer(container, pdfDocument),
  );
  await Promise.all(renderPromises);
}
