/**
 * @module screen-manager
 * Top-level view routing and titlebar text synchronization.
 */

const SCREEN_IDENTIFIERS = [
  "screen-loading",
  "screen-requirements",
  "screen-update",
  "screen-welcome",
  "screen-new-project",
  "screen-main",
];

/**
 * Creates the application screen manager.
 * @returns {{show: Function, getCurrentScreenId: Function}} Screen manager instance.
 */
export function createScreenManager() {
  const projectTitleLabel = document.getElementById("titlebar-project-name");
  let currentScreenId = "screen-loading";

  /**
   * Switches the active viewport to the requested screen identifier.
   * @param {string} targetScreenId - Target screen DOM element ID.
   * @param {string} [titlebarCenterText=""] - Text displayed in the center of the titlebar.
   * @returns {void}
   */
  function show(targetScreenId, titlebarCenterText = "") {
    for (const screenId of SCREEN_IDENTIFIERS) {
      const screenElement = document.getElementById(screenId);
      if (screenElement) {
        const isTargetScreen = screenId === targetScreenId;
        screenElement.hidden = !isTargetScreen;
        screenElement.classList.toggle("active-screen", isTargetScreen);
      }
    }

    currentScreenId = targetScreenId;
    projectTitleLabel.textContent = titlebarCenterText;
  }

  return {
    show,
    getCurrentScreenId() {
      return currentScreenId;
    },
  };
}
