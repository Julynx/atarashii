/**
 * @module requirements-screen
 * Requirements dependency presentation and automated installation coordinator.
 */

/**
 * Creates the requirements screen controller.
 * @param {ReturnType<typeof import("./screen-manager").createScreenManager>} screenManager - Screen manager instance.
 * @param {ReturnType<typeof import("./error-modal").createErrorModal>} errorModal - Error modal instance.
 * @returns {{show: Function, installAutomatically: Function}} Requirements controller instance.
 */
export function createRequirementsScreen(screenManager, errorModal) {
  const cardsContainer = document.getElementById("requirements-card-list");
  const installButton = document.getElementById("install-requirements-button");
  const progressIndicator = document.getElementById("install-progress-indicator");
  const progressMessage = document.getElementById("install-progress-message");
  const errorContainer = document.getElementById("requirements-error-container");
  const errorOutputText = document.getElementById("requirements-error-text");

  let requirementStatuses = [];

  /**
   * Renders dependency cards showing status and icons.
   * @returns {void}
   */
  function renderRequirementCards() {
    cardsContainer.replaceChildren();

    for (const status of requirementStatuses) {
      const cardRow = document.createElement("div");
      cardRow.className = `requirement-row-item ${status.found ? "found" : "missing"}`;

      const iconElement = document.createElement("img");
      iconElement.className = "requirement-icon";
      iconElement.src = status.icon;
      iconElement.alt = "";

      const textContainer = document.createElement("div");
      textContainer.className = "requirement-info";

      const titleElement = document.createElement("span");
      titleElement.className = "requirement-title";
      titleElement.textContent = status.name;

      const descriptionElement = document.createElement("span");
      descriptionElement.className = "requirement-desc";
      descriptionElement.textContent = status.description;

      textContainer.append(titleElement, descriptionElement);

      const statusBadge = document.createElement("span");
      statusBadge.className = `requirement-badge ${status.found ? "found" : "missing"}`;
      statusBadge.textContent = status.found ? "Installed" : "Missing";

      cardRow.append(iconElement, textContainer, statusBadge);
      cardsContainer.appendChild(cardRow);
    }
  }

  /**
   * Displays the requirements screen with given status list.
   * @param {Array<object>} statuses - Dependency status array.
   * @returns {void}
   */
  function show(statuses) {
    requirementStatuses = statuses;
    renderRequirementCards();
    installButton.disabled = false;
    progressIndicator.hidden = true;
    errorContainer.hidden = true;
    screenManager.show("screen-requirements", "Requirements");
  }

  /**
   * Executes installation of missing dependencies sequentially.
   * @returns {Promise<void>}
   */
  async function executeInstall() {
    const firstMissing = requirementStatuses.find((status) => !status.found);
    installButton.disabled = true;
    errorContainer.hidden = true;
    progressIndicator.hidden = false;
    progressMessage.textContent = firstMissing
      ? `Installing ${firstMissing.name}...`
      : "Installing requirements...";

    try {
      const installResult = await window.atarashiiApi.installRequirements();
      progressIndicator.hidden = true;
      installButton.disabled = false;

      if (!installResult.ok) {
        errorOutputText.textContent = installResult.output || "Installation returned an unexpected error.";
        errorContainer.hidden = false;
      }
    } catch (installExecutionError) {
      progressIndicator.hidden = true;
      installButton.disabled = false;
      errorModal.show({
        title: "Installation Error",
        message: installExecutionError.message,
        stack: installExecutionError.stack,
      });
    }
  }

  /**
   * Grants persistent consent and begins installation.
   * @returns {Promise<void>}
   */
  async function grantConsentAndExecuteInstall() {
    await window.atarashiiApi.grantInstallConsent();
    await executeInstall();
  }

  installButton.addEventListener("click", () => {
    grantConsentAndExecuteInstall();
  });

  return {
    show,
    installAutomatically: executeInstall,
  };
}
