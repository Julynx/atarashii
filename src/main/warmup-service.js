/**
 * @module warmup-service
 * Pre-initialization runner for markdown-convert to preinstall headless browser dependencies.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const { runCommand, formatCommandOutput } = require("./process-runner");

/**
 * Runs markdown-convert on a temporary document to initialize headless browser dependencies.
 * @param {{info: Function, warn: Function, error: Function}} logger - Logging service.
 * @returns {Promise<{ok: boolean, output?: string}>} Execution result.
 */
async function warmUpMarkdownConvert(logger) {
  logger.info("Initializing markdown-convert headless browser dependencies via warm-up run.");

  const temporaryDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), "atarashii-warmup-")
  );
  const sampleMarkdownPath = path.join(temporaryDirectory, "tmp.md");

  try {
    fs.writeFileSync(sampleMarkdownPath, "# Title", "utf8");

    const commandArguments = [
      sampleMarkdownPath,
      "--out=tmp.pdf",
      "--mode=once",
    ];

    logger.info(`Running warm-up command: markdown-convert ${commandArguments.join(" ")} in ${temporaryDirectory}`);

    const warmUpResult = await runCommand("markdown-convert", commandArguments, {
      cwd: temporaryDirectory,
    });

    if (warmUpResult.code !== 0) {
      const formattedOutput = formatCommandOutput(warmUpResult);
      logger.error(`markdown-convert warm-up execution failed:\n${formattedOutput}`);
      return { ok: false, output: formattedOutput };
    }

    logger.info("markdown-convert headless browser initialized successfully.");
    return { ok: true, output: warmUpResult.stdout };
  } catch (executionError) {
    logger.error(`Error during markdown-convert warm-up execution: ${executionError.message}`);
    return {
      ok: false,
      output: executionError.stack || executionError.message,
    };
  } finally {
    try {
      fs.rmSync(temporaryDirectory, { recursive: true, force: true });
    } catch (cleanupError) {
      logger.warn(`Failed cleaning up warm-up temporary directory: ${cleanupError.message}`);
    }
  }
}

module.exports = { warmUpMarkdownConvert };
