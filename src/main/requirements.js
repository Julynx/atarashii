/**
 * @module requirements
 * Dependency verification and installation for uv and markdown-convert tools.
 */

const { runCommand, probeCommand, formatCommandOutput } = require("./process-runner");

const SYSTEM_REQUIREMENTS = [
  {
    id: "uv",
    name: "uv",
    description: "Fast Python package manager that executes markdown-convert.",
    icon: "../../assets/icons/uv.svg",
    installSteps: [
      {
        label: "Install uv via winget",
        command: "winget",
        args: [
          "install",
          "--id",
          "astral-sh.uv",
          "-e",
          "--accept-package-agreements",
          "--accept-source-agreements",
        ],
        successCodes: [0, -1978335189],
      },
    ],
  },
  {
    id: "markdown-convert",
    name: "markdown-convert package",
    description: "The Markdown to PDF converter backend.",
    icon: "../../assets/icons/markdown-convert.svg",
    installSteps: [
      {
        label: "Install markdown-convert tool",
        command: "uv",
        args: ["tool", "install", "markdown-convert"],
        successCodes: [0],
      },
      {
        label: "Ensure tool path is on PATH",
        command: "uv",
        args: ["tool", "update-shell"],
        successCodes: [0],
      },
    ],
  },
];

const REQUIREMENT_PROBES = {
  /**
   * Probes the installed uv package manager version.
   * @returns {Promise<string>} Installed uv version string.
   */
  async uv() {
    const rawOutput = await probeCommand("uv", ["--version"]);
    return rawOutput.replace(/^uv\s+/i, "").trim();
  },

  /**
   * Probes the installed markdown-convert tool version.
   * @returns {Promise<string>} Installed markdown-convert version string.
   */
  async "markdown-convert"() {
    const rawOutput = await probeCommand("uv", ["tool", "list"]);
    const versionMatch = rawOutput.match(/^markdown-convert\s+v?([\w.\-+]+)/m);
    if (!versionMatch) {
      throw new Error("markdown-convert is not listed by `uv tool list`.");
    }
    return versionMatch[1];
  },
};

/**
 * Checks a specific requirement entry and returns status information.
 * @param {object} requirement - Requirement configuration entry.
 * @param {{info: Function}} logger - Logging service.
 * @returns {Promise<{id: string, name: string, description: string, icon: string, found: boolean, version: string}>} Requirement status.
 */
async function probeRequirement(requirement, logger) {
  try {
    const probeFunction = REQUIREMENT_PROBES[requirement.id];
    const detectedVersion = await probeFunction();
    logger.info(`Requirement found: ${requirement.name} (${detectedVersion})`);
    return {
      id: requirement.id,
      name: requirement.name,
      description: requirement.description,
      icon: requirement.icon,
      found: true,
      version: detectedVersion,
    };
  } catch (probeError) {
    logger.info(`Requirement missing: ${requirement.name} (${probeError.message})`);
    return {
      id: requirement.id,
      name: requirement.name,
      description: requirement.description,
      icon: requirement.icon,
      found: false,
      version: "",
    };
  }
}

/**
 * Validates all required dependencies.
 * @param {{info: Function}} logger - Logging service.
 * @returns {Promise<Array<object>>} Status list for all system requirements.
 */
async function checkRequirements(logger) {
  const requirementStatuses = [];
  for (const requirement of SYSTEM_REQUIREMENTS) {
    const status = await probeRequirement(requirement, logger);
    requirementStatuses.push(status);
  }
  return requirementStatuses;
}

/**
 * Installs the first missing requirement from the status list.
 * @param {Array<{id: string, found: boolean}>} statuses - Output of checkRequirements.
 * @param {{info: Function, error: Function}} logger - Logging service.
 * @returns {Promise<{ok: boolean, installedId?: string, failedStep?: string, output?: string}>} Installation outcome.
 */
async function installFirstMissingRequirement(statuses, logger) {
  const firstMissingStatus = statuses.find((status) => !status.found);
  if (!firstMissingStatus) {
    return { ok: true };
  }

  const requirementToInstall = SYSTEM_REQUIREMENTS.find((entry) => entry.id === firstMissingStatus.id);
  logger.info(`Installing missing requirement: ${requirementToInstall.name}`);

  const capturedOutputLines = [];

  for (const step of requirementToInstall.installSteps) {
    logger.info(`Running step: ${step.label} (${step.command} ${step.args.join(" ")})`);
    const stepResult = await runCommand(step.command, step.args);
    capturedOutputLines.push(`$ ${step.command} ${step.args.join(" ")}\n${formatCommandOutput(stepResult)}`);

    if (!step.successCodes.includes(stepResult.code)) {
      const combinedOutput = capturedOutputLines.join("\n\n");
      logger.error(`Requirement step failed (${step.label}):\n${combinedOutput}`);
      return {
        ok: false,
        installedId: requirementToInstall.id,
        failedStep: step.label,
        output: combinedOutput,
      };
    }
  }

  logger.info(`Successfully completed installation for requirement: ${requirementToInstall.name}`);
  return { ok: true, installedId: requirementToInstall.id };
}

module.exports = { SYSTEM_REQUIREMENTS, checkRequirements, installFirstMissingRequirement };
