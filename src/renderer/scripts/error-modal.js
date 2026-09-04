/**
 * @module error-modal
 * Modal dialog for surfacing application errors and diagnostic stack traces.
 */

/**
 * Creates the error modal controller.
 * @returns {{show: Function, hide: Function}} Modal controller instance.
 */
export function createErrorModal() {
  const modalBackdrop = document.getElementById("application-error-modal");
  const modalTitle = document.getElementById("error-modal-title");
  const modalMessage = document.getElementById("error-modal-message");
  const modalStack = document.getElementById("error-modal-stack");
  const closeIconButton = document.getElementById("error-modal-close-icon");
  const confirmButton = document.getElementById("error-modal-confirm-button");

  /**
   * Hides the error modal dialog.
   * @returns {void}
   */
  function hide() {
    modalBackdrop.hidden = true;
    modalStack.hidden = true;
    modalStack.textContent = "";
  }

  /**
   * Displays the modal with diagnostic information.
   * @param {{title?: string, message: string, stack?: string}} errorDetails - Error presentation data.
   * @returns {void}
   */
  function show(errorDetails) {
    modalTitle.textContent = errorDetails.title || "Error";
    modalMessage.textContent = errorDetails.message;

    if (errorDetails.stack && errorDetails.stack.trim().length > 0) {
      modalStack.textContent = errorDetails.stack;
      modalStack.hidden = false;
    } else {
      modalStack.hidden = true;
    }

    modalBackdrop.hidden = false;
  }

  closeIconButton.addEventListener("click", hide);
  confirmButton.addEventListener("click", hide);

  return { show, hide };
}
