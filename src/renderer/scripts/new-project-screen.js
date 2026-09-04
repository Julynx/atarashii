/**
 * @module new-project-screen
 * View controller for configuring destination directories and initializing new Atarashii projects.
 */

/**
 * Creates the new project screen controller.
 * @param {ReturnType<typeof import("./screen-manager").createScreenManager>} screenManager - Screen manager instance.
 * @param {ReturnType<typeof import("./error-modal").createErrorModal>} errorModal - Error modal instance.
 * @param {Function} onCancel - Callback to return to welcome screen.
 * @param {Function} onProjectCreated - Callback invoked when a new project has been created.
 * @returns {{show: Function}} New project screen controller instance.
 */
export function createNewProjectScreen(
  screenManager,
  errorModal,
  onCancel,
  onProjectCreated
) {
  const folderInput = document.getElementById("project-folder-input");
  const browseFolderButton = document.getElementById("browse-folder-button");
  const nameInput = document.getElementById("project-name-input");
  const cancelButton = document.getElementById("cancel-new-project-button");
  const confirmButton = document.getElementById("confirm-new-project-button");

  /**
   * Loads initial project folder defaults and computes non-colliding candidate names.
   * @returns {Promise<void>}
   */
  async function loadDefaults() {
    try {
      const defaults = await window.atarashiiApi.getProjectDefaults();
      folderInput.value = defaults.defaultParentDirectory;
      nameInput.value = defaults.nextAvailableProjectName;
    } catch (loadDefaultsError) {
      errorModal.show({
        title: "Initialization Error",
        message: loadDefaultsError.message,
        stack: loadDefaultsError.stack,
      });
    }
  }

  /**
   * Opens folder picker dialog and updates folder path and project name inputs.
   * @returns {Promise<void>}
   */
  async function handleBrowseFolder() {
    try {
      const result = await window.atarashiiApi.pickParentFolder();
      if (result) {
        folderInput.value = result.selectedPath;
        nameInput.value = result.nextName;
      }
    } catch (browseError) {
      errorModal.show({
        title: "Browse Error",
        message: browseError.message,
        stack: browseError.stack,
      });
    }
  }

  /**
   * Validates form inputs and creates the project on disk.
   * @returns {Promise<void>}
   */
  async function handleConfirmCreate() {
    const parentFolder = folderInput.value.trim();
    const projectName = nameInput.value.trim();

    if (!parentFolder) {
      errorModal.show({
        title: "Missing Information",
        message: "Please specify a destination folder for your project.",
      });
      return;
    }

    if (!projectName) {
      errorModal.show({
        title: "Missing Information",
        message: "Please enter a name for the new project.",
      });
      return;
    }

    confirmButton.disabled = true;

    try {
      const creationResult = await window.atarashiiApi.createProject(parentFolder, projectName);
      confirmButton.disabled = false;

      if (!creationResult.ok) {
        errorModal.show({
          title: "Project Creation Failed",
          message: creationResult.error.message,
          stack: creationResult.error.stack,
        });
        return;
      }

      onProjectCreated(creationResult.project);
    } catch (creationExecutionError) {
      confirmButton.disabled = false;
      errorModal.show({
        title: "Unexpected Error",
        message: creationExecutionError.message,
        stack: creationExecutionError.stack,
      });
    }
  }

  browseFolderButton.addEventListener("click", () => {
    handleBrowseFolder();
  });

  cancelButton.addEventListener("click", () => {
    onCancel();
  });

  confirmButton.addEventListener("click", () => {
    handleConfirmCreate();
  });

  nameInput.addEventListener("keydown", (keyboardEvent) => {
    if (keyboardEvent.key === "Enter") {
      handleConfirmCreate();
    }
  });

  return {
    async show() {
      await loadDefaults();
      screenManager.show("screen-new-project", "New project");
      nameInput.focus();
      nameInput.select();
    },
  };
}
