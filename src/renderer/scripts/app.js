/**
 * @module app
 * Renderer entry point wiring window controls, executing the startup sequence, and navigating screens.
 */

import { createScreenManager } from "./screen-manager.js";
import { createErrorModal } from "./error-modal.js";
import { createRequirementsScreen } from "./requirements-screen.js";
import { createUpdateScreen } from "./update-screen.js";
import { createWelcomeScreen } from "./welcome-screen.js";
import { createNewProjectScreen } from "./new-project-screen.js";
import { createMainScreen } from "./main-screen.js";

const api = window.atarashiiApi;

const screenManager = createScreenManager();
const errorModal = createErrorModal();

const mainScreen = createMainScreen(screenManager, errorModal);

const welcomeScreen = createWelcomeScreen(
  screenManager,
  errorModal,
  () => {
    newProjectScreen.show();
  },
  (openedProject) => {
    mainScreen.show(openedProject);
  }
);

const newProjectScreen = createNewProjectScreen(
  screenManager,
  errorModal,
  () => {
    welcomeScreen.show();
  },
  (createdProject) => {
    mainScreen.show(createdProject);
  }
);

const requirementsScreen = createRequirementsScreen(screenManager, errorModal);
const updateScreen = createUpdateScreen(screenManager);

const minimizeButton = document.getElementById("window-minimize-button");
const maximizeButton = document.getElementById("window-maximize-button");
const closeButton = document.getElementById("window-close-button");

minimizeButton.addEventListener("click", () => {
  api.minimizeWindow();
});

maximizeButton.addEventListener("click", () => {
  api.maximizeWindow();
});

closeButton.addEventListener("click", () => {
  api.closeWindow();
});

/**
 * Executes startup checks for requirements and updates, then displays the welcome screen.
 * @returns {Promise<void>}
 */
async function bootstrap() {
  screenManager.show("screen-loading", "");

  const requirementStatuses = await api.checkRequirements();
  const missingCount = requirementStatuses.filter((status) => !status.found).length;

  if (missingCount > 0) {
    requirementsScreen.show(requirementStatuses);
    if (await api.getInstallConsent()) {
      requirementsScreen.installAutomatically();
    }
    return;
  }

  await api.clearInstallConsent();

  const updateStatus = await api.checkForUpdate();
  if (updateStatus.status === "outdated") {
    await updateScreen.run();
  }

  welcomeScreen.show();
}

bootstrap().catch((bootstrapError) => {
  errorModal.show({
    title: "Startup Error",
    message: bootstrapError.message || String(bootstrapError),
    stack: bootstrapError.stack || "",
  });
});
