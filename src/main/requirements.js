/**
 * @module requirements
 * Dependency verification and installation for uv and markdown-convert tools across platforms.
 */

const { runCommand, probeCommand, formatCommandOutput } = require("./process-runner");
const { refreshEnvironmentPath } = require("./environment");
const { warmUpMarkdownConvert } = require("./warmup-service");

/**
 * Returns platform-specific baseline installation steps for uv.
 * @param {string} [platformName] - Target operating system identifier.
 * @returns {Array<{label: string, command: string, args: string[], successCodes: number[]}>} Installation steps.
 */
function getUvInstallSteps(platformName = process.platform) {
  if (platformName === "win32") {
    return [
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
    ];
  }

  return [
    {
      label: "Install uv via official installer",
      command: "sh",
      args: ["-c", "curl -LsSf https://astral.sh/uv/install.sh | sh"],
      successCodes: [0],
    },
  ];
}

/**
 * Detects available system tools to resolve optimal Linux uv installation command.
 * @param {{info?: Function}} [logger] - Optional logger service.
 * @returns {Promise<{label: string, command: string, args: string[], successCodes: number[]}>} Optimal install step.
 */
async function resolvePlatformUvInstallStep(logger) {
  if (process.platform === "win32") {
    return {
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
    };
  }

  const curlCheck = await runCommand("sh", ["-c", "command -v curl"], { timeoutMs: 3000 });
  if (curlCheck.code === 0) {
    logger?.info?.("Detected curl for Linux uv installation.");
    return {
      label: "Install uv via official installer (curl)",
      command: "sh",
      args: ["-c", "curl -LsSf https://astral.sh/uv/install.sh | sh"],
      successCodes: [0],
    };
  }

  const wgetCheck = await runCommand("sh", ["-c", "command -v wget"], { timeoutMs: 3000 });
  if (wgetCheck.code === 0) {
    logger?.info?.("Detected wget for Linux uv installation.");
    return {
      label: "Install uv via official installer (wget)",
      command: "sh",
      args: ["-c", "wget -qO- https://astral.sh/uv/install.sh | sh"],
      successCodes: [0],
    };
  }

  const pythonCheck = await runCommand("sh", ["-c", "command -v python3"], { timeoutMs: 3000 });
  if (pythonCheck.code === 0) {
    logger?.info?.("Detected python3 for Linux uv installation.");
    return {
      label: "Install uv via pip",
      command: "python3",
      args: ["-m", "pip", "install", "--user", "uv"],
      successCodes: [0],
    };
  }

  return {
    label: "Install uv via official installer",
    command: "sh",
    args: ["-c", "curl -LsSf https://astral.sh/uv/install.sh | sh"],
    successCodes: [0],
  };
}

/**
 * Creates system requirement definitions configured for the specified operating system.
 * @param {string} [platformName] - Target operating system identifier.
 * @returns {Array<object>} Configured system requirements list.
 */
function createSystemRequirements(platformName = process.platform) {
  return [
    {
      id: "uv",
      name: "uv",
      description: "Fast Python package manager that executes markdown-convert.",
      icon: "../../assets/icons/uv.svg",
      installSteps: getUvInstallSteps(platformName),
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
}

const SYSTEM_REQUIREMENTS = createSystemRequirements(process.platform);

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
 * Validates all required dependencies for the current platform.
 * @param {{info: Function}} logger - Logging service.
 * @returns {Promise<Array<object>>} Status list for all system requirements.
 */
async function checkRequirements(logger) {
  await refreshEnvironmentPath(logger);
  const activeRequirements = createSystemRequirements(process.platform);
  const requirementStatuses = [];
  for (const requirement of activeRequirements) {
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

  const activeRequirements = createSystemRequirements(process.platform);
  const requirementToInstall = activeRequirements.find(
    (entry) => entry.id === firstMissingStatus.id
  );
  logger.info(`Installing missing requirement: ${requirementToInstall.name}`);

  let executionSteps = requirementToInstall.installSteps;
  if (requirementToInstall.id === "uv") {
    const dynamicStep = await resolvePlatformUvInstallStep(logger);
    executionSteps = [dynamicStep];
  }

  const capturedOutputLines = [];

  for (const step of executionSteps) {
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

  await refreshEnvironmentPath(logger);

  if (requirementToInstall.id === "markdown-convert") {
    const warmUpResult = await warmUpMarkdownConvert(logger);
    if (!warmUpResult.ok) {
      const combinedOutput = [
        capturedOutputLines.join("\n\n"),
        `$ markdown-convert tmp.md --out=tmp.pdf --mode=once\n${warmUpResult.output}`,
      ]
        .filter(Boolean)
        .join("\n\n");
      return {
        ok: false,
        installedId: requirementToInstall.id,
        failedStep: "Initialize headless browser",
        output: combinedOutput,
      };
    }
  }

  logger.info(`Successfully completed installation for requirement: ${requirementToInstall.name}`);
  return { ok: true, installedId: requirementToInstall.id };
}

module.exports = {
  SYSTEM_REQUIREMENTS,
  createSystemRequirements,
  getUvInstallSteps,
  resolvePlatformUvInstallStep,
  checkRequirements,
  installFirstMissingRequirement,
};
