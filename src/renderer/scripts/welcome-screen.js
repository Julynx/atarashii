/**
 * @module welcome-screen
 * Initial launch view offering choices to start a new project or open an existing directory.
 */

/**
 * Creates the welcome screen controller.
 * @param {ReturnType<typeof import("./screen-manager").createScreenManager>} screenManager - Screen manager instance.
 * @param {ReturnType<typeof import("./error-modal").createErrorModal>} errorModal - Error modal instance.
 * @param {Function} onNavigateToNewProject - Callback to navigate to project creation.
 * @param {Function} onProjectOpened - Callback invoked when a project is successfully validated and opened.
 * @returns {{show: Function}} Welcome screen controller instance.
 */
export function createWelcomeScreen(
  screenManager,
  errorModal,
  onNavigateToNewProject,
  onProjectOpened
) {
  const newProjectButton = document.getElementById("welcome-new-project-button");
  const openProjectButton = document.getElementById("welcome-open-project-button");

  /**
   * Displays the welcome screen and clears title text.
   * @returns {void}
   */
  function show() {
    screenManager.show("screen-welcome", "");
  }

  /**
   * Prompts the user to pick a folder and validates it as an Atarashii project.
   * @returns {Promise<void>}
   */
  async function handleOpenProject() {
    try {
      const openResult = await window.atarashiiApi.pickAndOpenProject();
      if (openResult.canceled) {
        return;
      }

      if (!openResult.ok) {
        errorModal.show({
          title: "Cannot Open Project",
          message: openResult.error.message,
          stack: openResult.error.stack,
        });
        return;
      }

      onProjectOpened(openResult.project);
    } catch (openExecutionError) {
      errorModal.show({
        title: "Unexpected Error",
        message: openExecutionError.message,
        stack: openExecutionError.stack,
      });
    }
  }

  newProjectButton.addEventListener("click", () => {
    onNavigateToNewProject();
  });

  openProjectButton.addEventListener("click", () => {
    handleOpenProject();
  });

  return { show };
}
