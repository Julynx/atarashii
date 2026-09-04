/**
 * @module process-runner
 * Promise-based process execution utility capturing standard output and error streams.
 */

const { spawn } = require("child_process");

const DEFAULT_COMMAND_TIMEOUT_MILLISECONDS = 10 * 60 * 1000;

/**
 * Runs a command and resolves with its exit code and captured output.
 * @param {string} command - Executable name or file path.
 * @param {string[]} args - Argument list passed to the executable.
 * @param {object} [options] - Optional execution parameters.
 * @param {string} [options.cwd] - Working directory for process execution.
 * @param {number} [options.timeoutMs] - Process timeout in milliseconds.
 * @returns {Promise<{code: number, stdout: string, stderr: string}>} Execution result.
 */
function runCommand(command, args = [], options = {}) {
  const { cwd, timeoutMs = DEFAULT_COMMAND_TIMEOUT_MILLISECONDS } = options;

  return new Promise((resolve, reject) => {
    const childProcess = spawn(command, args, {
      cwd,
      windowsHide: true,
      shell: false,
    });

    const standardOutputChunks = [];
    const standardErrorChunks = [];

    childProcess.stdout.on("data", (chunk) => standardOutputChunks.push(chunk));
    childProcess.stderr.on("data", (chunk) => standardErrorChunks.push(chunk));

    const timeoutTimer = setTimeout(() => {
      childProcess.kill();
      reject(new Error(`Command timed out after ${timeoutMs} ms: ${command} ${args.join(" ")}`));
    }, timeoutMs);

    childProcess.on("error", (spawnError) => {
      clearTimeout(timeoutTimer);
      reject(spawnError);
    });

    childProcess.on("close", (exitCode) => {
      clearTimeout(timeoutTimer);
      resolve({
        code: exitCode ?? 1,
        stdout: Buffer.concat(standardOutputChunks).toString("utf8"),
        stderr: Buffer.concat(standardErrorChunks).toString("utf8"),
      });
    });
  });
}

/**
 * Executes a lightweight command expected to succeed quickly.
 * @param {string} command - Executable name or file path.
 * @param {string[]} args - Argument list passed to the executable.
 * @returns {Promise<string>} Combined output from standard output and error streams.
 */
async function probeCommand(command, args = []) {
  const executionResult = await runCommand(command, args, { timeoutMs: 30 * 1000 });
  if (executionResult.code !== 0) {
    throw new Error(`Probe failed (${command}): ${executionResult.stderr.trim() || executionResult.stdout.trim()}`);
  }
  return `${executionResult.stdout}\n${executionResult.stderr}`.trim();
}

/**
 * Formats captured command output for user presentation and error logging.
 * @param {{code: number, stdout: string, stderr: string}} executionResult - Command execution result.
 * @returns {string} Formatted output text.
 */
function formatCommandOutput(executionResult) {
  const sections = [`Exit code: ${executionResult.code}`];
  if (executionResult.stdout.trim()) {
    sections.push(`Output:\n${executionResult.stdout.trim()}`);
  }
  if (executionResult.stderr.trim()) {
    sections.push(`Errors:\n${executionResult.stderr.trim()}`);
  }
  return sections.join("\n\n");
}

module.exports = { runCommand, probeCommand, formatCommandOutput };
