/**
 * @module pdf
 * Document loading, scaling, dynamic canvas and text-layer rendering lifecycle.
 */

import * as pdfjsLib from "../../../../assets/vendor/pdf.mjs";
import { state } from "./state.js";
import { getUIElements, syncCurrentPageFromScroll } from "./ui.js";

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "../../../../assets/vendor/pdf.worker.mjs",
  import.meta.url,
).href;

const activeRenderTasks = new WeakMap();
const pageRenderGenerations = new WeakMap();
let activeNavigationIdentifier = 0;

/**
 * Loads a PDF document from local disk via the registered protocol.
 * @param {string} filePath - Target PDF absolute file path.
 * @returns {Promise<import("pdfjs-dist").PDFDocumentProxy>} PDF document proxy.
 */
export async function loadPdfDocument(filePath) {
  const loadingTask = pdfjsLib.getDocument(
    `safe-file://${encodeURIComponent(filePath)}`,
  );
  return await loadingTask.promise;
}

/**
 * Creates link navigation adapter for PDF annotation anchors.
 * @param {import("pdfjs-dist").PDFDocumentProxy} pdfDocument - PDF document instance.
 * @returns {object} Link service configuration.
 */
function createLinkService(pdfDocument) {
  return {
    getDestinationHash(destination) {
      return destination;
    },
    getAnchorUrl(href) {
      return href || "";
    },
    setDocument() {},
    executeNamedAction() {},
    cachePageRef() {},
    isPageVisible() {
      return true;
    },
    isPageCached() {
      return true;
    },
    addLinkAttributes(link, targetUrl) {
      link.href = targetUrl;
    },
    goToDestination(destination) {
      if (typeof destination === "string") {
        pdfDocument
          .getDestination(destination)
          .then((explicitDestination) => {
            if (
              Array.isArray(explicitDestination) &&
              explicitDestination.length > 0
            ) {
              const pageReference = explicitDestination[0];
              pdfDocument
                .getPageIndex(pageReference)
                .then((pageIndex) => {
                  jumpToPage(pageIndex + 1, explicitDestination);
                })
                .catch((indexError) => {
                  console.error(
                    "Failed resolving destination index:",
                    indexError,
                  );
                });
            }
          })
          .catch((destError) => {
            console.error("Failed resolving named destination:", destError);
          });
      } else if (Array.isArray(destination) && destination.length > 0) {
        const pageReference = destination[0];
        pdfDocument
          .getPageIndex(pageReference)
          .then((pageIndex) => {
            jumpToPage(pageIndex + 1, destination);
          })
          .catch((indexError) => {
            console.error("Failed resolving explicit page index:", indexError);
          });
      }
    },
  };
}

/**
 * Attaches in-document anchor click routing to annotation layer links.
 * @param {HTMLElement} annotationLayerDiv - Annotation layer DOM node.
 * @param {import("pdfjs-dist").PDFDocumentProxy} pdfDocument - PDF document instance.
 * @returns {void}
 */
function attachAnnotationClickHandler(annotationLayerDiv, pdfDocument) {
  annotationLayerDiv.addEventListener("click", (mouseEvent) => {
    const linkElement = mouseEvent.target.closest("a");
    if (!linkElement) {
      return;
    }

    const href = linkElement.getAttribute("href");
    if (!href) {
      return;
    }

    if (!href.startsWith("#")) {
      mouseEvent.preventDefault();
      if (
        href.startsWith("http://") ||
        href.startsWith("https://") ||
        href.startsWith("mailto:")
      ) {
        window.open(href, "_blank");
      }
      return;
    }

    mouseEvent.preventDefault();

    const pageMatch = href.match(/page=(\d+)/);
    if (pageMatch) {
      const targetPage = parseInt(pageMatch[1], 10);
      if (!isNaN(targetPage)) {
        jumpToPage(targetPage);
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
            console.error("Failed resolving page index from link:", err);
          });
      }
    } catch {
      const namedDestination = decodeURIComponent(href.substring(1));
      if (namedDestination) {
        pdfDocument
          .getDestination(namedDestination)
          .then((resolvedDestination) => {
            if (
              Array.isArray(resolvedDestination) &&
              resolvedDestination.length > 0
            ) {
              const pageRef = resolvedDestination[0];
              pdfDocument
                .getPageIndex(pageRef)
                .then((pageIndex) => {
                  jumpToPage(pageIndex + 1, resolvedDestination);
                })
                .catch((err) => {
                  console.error("Failed resolving destination index:", err);
                });
            }
          })
          .catch((destError) => {
            console.error("Failed resolving named destination:", destError);
          });
      }
    }
  });
}

/**
 * Computes viewport scale according to active zoom configuration.
 * @param {import("pdfjs-dist").PageViewport} unscaledViewport - Unscaled page viewport.
 * @param {number} containerWidth - Container client width.
 * @param {number} containerHeight - Container client height.
 * @param {string} zoomMode - Zoom configuration option.
 * @returns {number} Final scale factor.
 */
export function calculatePageScale(
  unscaledViewport,
  containerWidth,
  containerHeight,
  zoomMode,
) {
  let computedScale = 1.0;
  if (zoomMode === "fit-width") {
    computedScale = containerWidth / unscaledViewport.width;
  } else if (zoomMode === "fit-height") {
    computedScale = (containerHeight - 88) / unscaledViewport.height;
  } else {
    computedScale = parseFloat(zoomMode) * (96 / 72) * (1 / 1.18);
  }
  return Math.min(Math.max(computedScale, 0.1), 5.0);
}

/**
 * Smoothly scrolls the layer to the target page and coordinate anchor.
 * @param {number|string} inputPage - Target page index or string.
 * @param {Array<any>|null} [destinationArray=null] - Optional destination specification.
 * @returns {void}
 */
export function jumpToPage(inputPage, destinationArray = null) {
  if (!state.currentFront) {
    return;
  }
  const elements = getUIElements();

  let targetPageNumber = parseInt(String(inputPage), 10);
  if (isNaN(targetPageNumber)) {
    if (elements.pageInput) {
      elements.pageInput.value = state.currentPageNumber;
    }
    return;
  }

  targetPageNumber = Math.max(1, Math.min(targetPageNumber, state.totalPages));
  state.currentPageNumber = targetPageNumber;
  if (elements.pageInput) {
    elements.pageInput.value = targetPageNumber;
  }

  const targetContainer = state.currentFront.querySelector(
    `.page-container[data-page-number="${targetPageNumber}"]`,
  );

  if (!targetContainer) {
    return;
  }

  let targetScrollTop = targetContainer.offsetTop - 16;

  if (
    destinationArray &&
    Array.isArray(destinationArray) &&
    destinationArray.length >= 2
  ) {
    const destinationType = destinationArray[1];
    let unscaledY = null;
    if (
      destinationType &&
      destinationType.name === "XYZ" &&
      typeof destinationArray[3] === "number"
    ) {
      unscaledY = destinationArray[3];
    } else if (
      destinationType &&
      (destinationType.name === "FitH" || destinationType.name === "FitBH") &&
      typeof destinationArray[2] === "number"
    ) {
      unscaledY = destinationArray[2];
    }

    if (typeof unscaledY === "number") {
      let scaleFactor = 1.0;
      const scaleString =
        targetContainer.dataset.scaleFactor ||
        targetContainer.style.getPropertyValue("--scale-factor");
      if (scaleString) {
        scaleFactor = parseFloat(scaleString);
      }

      const pixelHeight =
        targetContainer.clientHeight ||
        parseFloat(targetContainer.style.height);
      const unscaledHeight = pixelHeight / scaleFactor;

      let yOffsetPoint = 0;
      if (unscaledY <= unscaledHeight) {
        yOffsetPoint = unscaledHeight - unscaledY;
      }

      const yOffsetPixel = yOffsetPoint * scaleFactor;
      targetScrollTop = targetContainer.offsetTop + yOffsetPixel - 16;
      targetScrollTop = Math.min(
        targetScrollTop,
        targetContainer.offsetTop + pixelHeight - 16,
      );
    }
  }

  if (
    targetPageNumber === 1 &&
    (!destinationArray ||
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

  const currentNavId = ++activeNavigationIdentifier;
  state.isScrollNavigating = true;
  state.ignoreScrollEvents = true;
  state.currentPageNumber = targetPageNumber;
  if (elements.pageInput) {
    elements.pageInput.value = targetPageNumber;
  }

  let isSettled = false;
  const onScrollEnd = () => {
    if (isSettled || activeNavigationIdentifier !== currentNavId) {
      return;
    }
    isSettled = true;
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
 * Determines whether a page container is within active render distance of the viewport.
 * @param {HTMLElement} pageContainer - Page container DOM element.
 * @param {number} [bufferPixels=1400] - Margin above and below viewport.
 * @returns {boolean} Whether container is within render buffer.
 */
function isContainerWithinRenderBuffer(pageContainer, bufferPixels = 1400) {
  const layerElement = pageContainer.parentElement;
  if (!layerElement) {
    return false;
  }
  const visibleTop = layerElement.scrollTop - bufferPixels;
  const visibleBottom =
    layerElement.scrollTop + layerElement.clientHeight + bufferPixels;
  const containerTop = pageContainer.offsetTop;
  const containerBottom = containerTop + pageContainer.offsetHeight;

  return containerBottom >= visibleTop && containerTop <= visibleBottom;
}

/**
 * Renders canvas, text, and annotations for a page container.
 * @param {HTMLElement} pageContainer - Target container DOM node.
 * @param {import("pdfjs-dist").PDFDocumentProxy} pdfDocument - PDF document instance.
 * @param {boolean} [forceWithinBuffer=false] - Whether to bypass viewport buffer check.
 * @returns {Promise<void>}
 */
export async function renderPageContainer(
  pageContainer,
  pdfDocument,
  forceWithinBuffer = false,
) {
  const existingCanvas = pageContainer.querySelector("canvas");
  if (
    (pageContainer.dataset.renderStatus === "rendered" && existingCanvas) ||
    pageContainer.dataset.renderStatus === "rendering"
  ) {
    return;
  }

  const pageNumber = parseInt(pageContainer.dataset.pageNumber, 10);
  if (isNaN(pageNumber)) {
    return;
  }

  const targetGeneration = (pageRenderGenerations.get(pageContainer) || 0) + 1;
  pageRenderGenerations.set(pageContainer, targetGeneration);
  pageContainer.dataset.renderStatus = "rendering";

  let page;
  try {
    page = await pdfDocument.getPage(pageNumber);
  } catch (pageLoadError) {
    if (pageRenderGenerations.get(pageContainer) === targetGeneration) {
      pageContainer.dataset.renderStatus = "idle";
    }
    console.error(`Failed loading page ${pageNumber}:`, pageLoadError);
    return;
  }

  if (
    pageRenderGenerations.get(pageContainer) !== targetGeneration ||
    pageContainer.dataset.renderStatus !== "rendering"
  ) {
    return;
  }

  if (!forceWithinBuffer && !isContainerWithinRenderBuffer(pageContainer)) {
    if (pageRenderGenerations.get(pageContainer) === targetGeneration) {
      pageContainer.dataset.renderStatus = "idle";
    }
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
  if (canvas) {
    canvas.remove();
  }
  canvas = document.createElement("canvas");
  pageContainer.appendChild(canvas);

  canvas.width = Math.floor(viewport.width * outputScale);
  canvas.height = Math.floor(viewport.height * outputScale);
  canvas.style.width = "100%";
  canvas.style.height = "100%";

  const canvasContext = canvas.getContext("2d");
  const transform =
    outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : null;

  const renderContext = { canvasContext, transform, viewport };
  const renderTask = page.render(renderContext);

  activeRenderTasks.set(pageContainer, renderTask);

  try {
    await renderTask.promise;
  } catch (renderError) {
    if (pageRenderGenerations.get(pageContainer) === targetGeneration) {
      pageContainer.dataset.renderStatus = "idle";
    }
    if (renderError && renderError.name === "RenderingCancelledException") {
      return;
    }
    console.error(`Page ${pageNumber} canvas render error:`, renderError);
    return;
  } finally {
    if (activeRenderTasks.get(pageContainer) === renderTask) {
      activeRenderTasks.delete(pageContainer);
    }
  }

  if (
    pageRenderGenerations.get(pageContainer) !== targetGeneration ||
    pageContainer.dataset.renderStatus !== "rendering"
  ) {
    return;
  }

  try {
    let textLayerDiv = pageContainer.querySelector(".textLayer");
    if (!textLayerDiv) {
      textLayerDiv = document.createElement("div");
      textLayerDiv.className = "textLayer";
      textLayerDiv.style.setProperty("--scale-factor", String(viewport.scale));
      pageContainer.appendChild(textLayerDiv);
    } else {
      textLayerDiv.innerHTML = "";
    }

    const textContent = await page.getTextContent();
    if (
      pageRenderGenerations.get(pageContainer) !== targetGeneration ||
      pageContainer.dataset.renderStatus !== "rendering"
    ) {
      return;
    }

    const textLayer = new pdfjsLib.TextLayer({
      textContentSource: textContent,
      container: textLayerDiv,
      viewport,
    });
    await textLayer.render();

    if (
      pageRenderGenerations.get(pageContainer) !== targetGeneration ||
      pageContainer.dataset.renderStatus !== "rendering"
    ) {
      return;
    }

    let annotationLayerDiv = pageContainer.querySelector(".annotationLayer");
    if (!annotationLayerDiv) {
      annotationLayerDiv = document.createElement("div");
      annotationLayerDiv.className = "annotationLayer";
      annotationLayerDiv.style.setProperty(
        "--scale-factor",
        String(viewport.scale),
      );
      pageContainer.appendChild(annotationLayerDiv);
    } else {
      annotationLayerDiv.innerHTML = "";
    }

    const annotations = await page.getAnnotations();
    if (
      pageRenderGenerations.get(pageContainer) !== targetGeneration ||
      pageContainer.dataset.renderStatus !== "rendering"
    ) {
      return;
    }

    const annotationLayer = new pdfjsLib.AnnotationLayer({
      div: annotationLayerDiv,
      accessibilityManager: null,
      annotationCanvasMap: null,
      annotationEditorUIManager: null,
      page,
      viewport,
      structTreeLayer: null,
    });

    await annotationLayer.render({
      viewport,
      div: annotationLayerDiv,
      annotations,
      page,
      linkService: createLinkService(pdfDocument),
      downloadManager: null,
      renderForms: false,
    });

    if (
      pageRenderGenerations.get(pageContainer) !== targetGeneration ||
      pageContainer.dataset.renderStatus !== "rendering"
    ) {
      return;
    }

    attachAnnotationClickHandler(annotationLayerDiv, pdfDocument);
    pageContainer.dataset.renderStatus = "rendered";
  } catch (layerError) {
    if (pageRenderGenerations.get(pageContainer) === targetGeneration) {
      pageContainer.dataset.renderStatus = "idle";
    }
    console.error(`Page ${pageNumber} layer render error:`, layerError);
  }
}

/**
 * Clears canvas and overlay layers to reclaim system memory.
 * @param {HTMLElement} pageContainer - Page container DOM node.
 * @returns {void}
 */
export function unrenderPageContainer(pageContainer) {
  const currentGeneration = (pageRenderGenerations.get(pageContainer) || 0) + 1;
  pageRenderGenerations.set(pageContainer, currentGeneration);

  const currentTask = activeRenderTasks.get(pageContainer);
  if (currentTask) {
    try {
      currentTask.cancel();
    } catch (cancelError) {
      console.error("Error cancelling render task:", cancelError);
    }
    activeRenderTasks.delete(pageContainer);
  }

  pageContainer.dataset.renderStatus = "idle";
  pageContainer.innerHTML = "";
}

/**
 * Cancels all pending tasks and clears container children.
 * @param {HTMLElement} layerElement - Container layer element.
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
 * @param {HTMLElement} layerElement - Container layer element.
 * @param {import("pdfjs-dist").PDFDocumentProxy} pdfDocument - PDF document instance.
 * @param {number} [bufferPixels=800] - Pixel buffer above and below viewport.
 * @returns {Promise<void[]>}
 */
export async function renderVisiblePages(
  layerElement,
  pdfDocument,
  bufferPixels = 800,
) {
  const visibleTop = layerElement.scrollTop - bufferPixels;
  const visibleBottom =
    layerElement.scrollTop + layerElement.clientHeight + bufferPixels;

  const containers = layerElement.querySelectorAll(".page-container");
  const renderPromises = [];

  containers.forEach((container) => {
    const containerTop = container.offsetTop;
    const containerBottom = containerTop + container.offsetHeight;

    if (containerBottom >= visibleTop && containerTop <= visibleBottom) {
      renderPromises.push(renderPageContainer(container, pdfDocument, true));
    }
  });

  return Promise.all(renderPromises);
}

/**
 * Generates page containers skeletons for document.
 * @param {import("pdfjs-dist").PDFDocumentProxy} pdfDocument - PDF document instance.
 * @param {HTMLElement} targetLayer - Destination DOM layer.
 * @param {number|null} [pageToAnchor=null] - Page number to maintain in view.
 * @returns {Promise<HTMLElement|null>} Anchored container if found.
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

  for (let index = 0; index < pages.length; index += 1) {
    const page = pages[index];
    const pageNumber = index + 1;
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
    pageContainer.dataset.pageNumber = String(pageNumber);
    pageContainer.dataset.scaleFactor = String(viewport.scale);
    pageContainer.dataset.renderStatus = "idle";
    pageContainer.style.setProperty("--scale-factor", String(viewport.scale));
    pageContainer.style.width = `${Math.floor(viewport.width)}px`;
    pageContainer.style.height = `${Math.floor(viewport.height)}px`;

    if (pageNumber === pageToAnchor) {
      targetAnchorCanvas = pageContainer;
    }

    fragment.appendChild(pageContainer);
  }

  targetLayer.appendChild(fragment);
  return targetAnchorCanvas;
}

/**
 * Renders all pages across the document for printing.
 * @param {HTMLElement} layerElement - Container layer element.
 * @param {import("pdfjs-dist").PDFDocumentProxy} pdfDocument - PDF document instance.
 * @returns {Promise<void>}
 */
export async function renderAllPagesForPrint(layerElement, pdfDocument) {
  const containers = layerElement.querySelectorAll(".page-container");
  const renderPromises = Array.from(containers).map((container) =>
    renderPageContainer(container, pdfDocument, true),
  );
  await Promise.all(renderPromises);
}
