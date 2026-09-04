/**
 * @module update-screen
 * Software package update display and failure recovery controller.
 */

/**
 * Creates the update screen controller.
 * @param {ReturnType<typeof import("./screen-manager").createScreenManager>} screenManager - Screen manager instance.
 * @returns {{run: Function}} Update screen controller instance.
 */
export function createUpdateScreen(screenManager) {
  const errorContainer = document.getElementById("update-error-container");
  const errorOutputText = document.getElementById("update-error-text");
  const retryButton = document.getElementById("update-retry-button");
  const continueButton = document.getElementById("update-continue-button");

  /**
   * Prompts the user with update error details and awaits their action.
   * @param {string} outputDetails - Captured output or error description.
   * @returns {Promise<void>} Resolves when user selects retry or continue.
   */
  function showFailurePrompt(outputDetails) {
    errorOutputText.textContent = outputDetails;
    errorContainer.hidden = false;

    return new Promise((resolve) => {
      const onRetry = () => {
        cleanupListeners();
        errorContainer.hidden = true;
        resolve(attemptUpdate());
      };

      const onContinue = () => {
        cleanupListeners();
        resolve();
      };

      const cleanupListeners = () => {
        retryButton.removeEventListener("click", onRetry);
        continueButton.removeEventListener("click", onContinue);
      };

      retryButton.addEventListener("click", onRetry);
      continueButton.addEventListener("click", onContinue);
    });
  }

  /**
   * Attempts upgrading markdown-convert to the latest release.
   * @returns {Promise<void>}
   */
  async function attemptUpdate() {
    try {
      const updateResult = await window.atarashiiApi.installUpdate();
      if (updateResult.ok) {
        return;
      }
      await showFailurePrompt(updateResult.output || "The updater returned no output.");
    } catch (updateError) {
      await showFailurePrompt(updateError.stack || updateError.message);
    }
  }

  /**
   * Displays the update screen and begins the update workflow.
   * @returns {Promise<void>}
   */
  function run() {
    screenManager.show("screen-update", "Update");
    errorContainer.hidden = true;
    return attemptUpdate();
  }

  return { run };
}
