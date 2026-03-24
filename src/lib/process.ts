import { spawn } from "node:child_process";
import { logger } from "./logger.js";

export interface ExecResult {
  stdout: string;
  stderr: string;
}

export function execCommand(
  command: string,
  args: string[],
  cwd?: string
): Promise<ExecResult> {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const renderedCommand = renderCommand(command, args);
    let settled = false;
    let stdout = "";
    let stderr = "";

    logger.info("exec", `Running command: ${renderedCommand}${cwd ? ` (cwd: ${cwd})` : ""}`);

    const child = spawn(command, args, {
      cwd,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"]
    });

    const heartbeat = setInterval(() => {
      logger.info("exec", `Command still running after ${Date.now() - startedAt}ms: ${renderedCommand}`);
    }, 30000);

    heartbeat.unref?.();

    const finish = (handler: () => void) => {
      if (settled) {
        return;
      }

      settled = true;
      clearInterval(heartbeat);
      handler();
    };

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      finish(() => {
        const elapsedMs = Date.now() - startedAt;
        logger.error("exec", `Command failed to start after ${elapsedMs}ms: ${renderedCommand} (${error.message})`);
        reject(error);
      });
    });

    child.on("close", (code) => {
      finish(() => {
        const elapsedMs = Date.now() - startedAt;

        if (code === 0) {
          logger.info("exec", `Command succeeded in ${elapsedMs}ms: ${renderedCommand}`);
          logDebugSummary("stdout", stdout);
          logDebugSummary("stderr", stderr);
          resolve({ stdout, stderr });
          return;
        }

        logger.error("exec", `Command failed with exit code ${code ?? "unknown"} after ${elapsedMs}ms: ${renderedCommand}`);
        logFailureSummary(stderr, stdout);

        const error = new Error(
          `Command failed: ${command} ${args.join(" ")}\n${stderr || stdout}`
        ) as Error & ExecResult;

        error.stdout = stdout;
        error.stderr = stderr;
        reject(error);
      });
    });
  });
}

function renderCommand(command: string, args: string[]): string {
  return [command, ...args.map((arg) => quoteArg(arg))].join(" ");
}

function quoteArg(arg: string): string {
  return /\s|"/.test(arg) ? `"${arg.replace(/"/g, '\\"')}"` : arg;
}

function truncateOutput(output: string, maxLength = 800): string {
  const normalized = output.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength)}...`;
}

function logDebugSummary(streamName: "stdout" | "stderr", output: string): void {
  const summary = summarizeOutput(output);
  if (summary) {
    logger.debug("exec", `${streamName} summary: ${summary}`);
  }
}

function logFailureSummary(stderr: string, stdout: string): void {
  const summary = summarizeOutput(stderr) ?? summarizeOutput(stdout);
  if (summary) {
    logger.error("exec", `output summary: ${summary}`);
  }
}

function summarizeOutput(output: string): string | undefined {
  const normalized = truncateOutput(output);
  return normalized ? normalized : undefined;
}
