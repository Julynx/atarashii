/**
 * @module relaunch-service
 * Cross-platform application relaunch coordinator handling AppImage environment isolation.
 */

const { spawn } = require("child_process");
const { app } = require("electron");

/**
 * Creates environment variables cleaned of AppImage runtime mount paths and library overrides.
 * @param {NodeJS.ProcessEnv} [sourceEnvironment=process.env] - Source environment dictionary.
 * @returns {Record<string, string | undefined>} Sanitized environment object.
 */
function createSanitizedAppImageEnvironment(sourceEnvironment = process.env) {
  const sanitizedEnvironment = { ...sourceEnvironment };
  delete sanitizedEnvironment.APPDIR;
  delete sanitizedEnvironment.APPIMAGE;
  delete sanitizedEnvironment.LD_LIBRARY_PATH;
  delete sanitizedEnvironment.ARGV0;
  delete sanitizedEnvironment.OWD;
  return sanitizedEnvironment;
}

/**
 * Relaunches the current application cleanly across Windows, Linux AppImage, and standard platforms.
 * @param {{info: Function, error: Function}} logger - Logging service.
 * @param {string[]} [processArguments=process.argv.slice(1)] - Command-line arguments for relaunched process.
 * @returns {void}
 */
function relaunchApplication(logger, processArguments = process.argv.slice(1)) {
  logger.info("Relaunching application following successful dependency installation.");

  if (process.platform === "linux" && process.env.APPIMAGE) {
    try {
      const appImagePath = process.env.APPIMAGE;
      const sanitizedEnvironment = createSanitizedAppImageEnvironment(process.env);

      logger.info(`Spawning detached AppImage process: ${appImagePath}`);
      const childProcess = spawn(appImagePath, processArguments, {
        detached: true,
        stdio: "ignore",
        env: sanitizedEnvironment,
      });
      childProcess.unref();

      app.exit(0);
      return;
    } catch (relaunchError) {
      logger.error(`AppImage direct relaunch failed: ${relaunchError.message}`);
      throw relaunchError;
    }
  }

  app.relaunch();
  app.exit(0);
}

module.exports = {
  createSanitizedAppImageEnvironment,
  relaunchApplication,
};
