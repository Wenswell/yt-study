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
    let lastActivityAt = startedAt;
    let stdoutBuffer = "";
    let stderrBuffer = "";
    let stdoutPreview = "";
    let stderrPreview = "";

    logger.info("exec", `Running command: ${renderedCommand}${cwd ? ` (cwd: ${cwd})` : ""}`);

    const child = spawn(command, args, {
      cwd,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"]
    });

    const heartbeat = setInterval(() => {
      const now = Date.now();
      const silenceMs = now - lastActivityAt;
      const elapsedMs = now - startedAt;
      if (silenceMs >= 30000) {
        logger.info(
          "exec",
          `Command still running after ${elapsedMs}ms with no new output for ${silenceMs}ms: ${renderedCommand}`
        );
        lastActivityAt = now;
      }
    }, 10000);

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      stdout += text;
      lastActivityAt = Date.now();
      stdoutBuffer += text;
      stdoutPreview = appendPreview(stdoutPreview, text);
      flushBufferedLines("stdout", stdoutBuffer, (remaining) => {
        stdoutBuffer = remaining;
      });
    });

    child.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      stderr += text;
      lastActivityAt = Date.now();
      stderrBuffer += text;
      stderrPreview = appendPreview(stderrPreview, text);
      flushBufferedLines("stderr", stderrBuffer, (remaining) => {
        stderrBuffer = remaining;
      });
    });

    child.on("error", (error) => {
      clearInterval(heartbeat);
      const elapsedMs = Date.now() - startedAt;
      logger.error("exec", `Command failed to start after ${elapsedMs}ms: ${renderedCommand} (${error.message})`);
      reject(error);
    });

    child.on("close", (code) => {
      clearInterval(heartbeat);
      const elapsedMs = Date.now() - startedAt;
      flushRemainder("stdout", stdoutBuffer);
      flushRemainder("stderr", stderrBuffer);

      if (code === 0) {
        logger.info("exec", `Command succeeded in ${elapsedMs}ms: ${renderedCommand}`);
        if (stdoutPreview.trim()) {
          logger.debug("exec", `stdout summary: ${truncateOutput(stdoutPreview)}`);
        }
        if (stderrPreview.trim()) {
          logger.debug("exec", `stderr summary: ${truncateOutput(stderrPreview)}`);
        }
        resolve({ stdout, stderr });
        return;
      }

      logger.error("exec", `Command failed with exit code ${code ?? "unknown"} after ${elapsedMs}ms: ${renderedCommand}`);
      if (stderrPreview.trim()) {
        logger.error("exec", `stderr summary: ${truncateOutput(stderrPreview)}`);
      } else if (stdoutPreview.trim()) {
        logger.error("exec", `stdout summary: ${truncateOutput(stdoutPreview)}`);
      }

      const error = new Error(
        `Command failed: ${command} ${args.join(" ")}\n${stderr || stdout}`
      ) as Error & ExecResult;

      error.stdout = stdout;
      error.stderr = stderr;
      reject(error);
    });
  });
}

function flushBufferedLines(
  streamName: "stdout" | "stderr",
  buffer: string,
  setRemaining: (remaining: string) => void
): void {
  const normalized = buffer.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const parts = normalized.split("\n");
  const remaining = parts.pop() ?? "";

  for (const part of parts) {
    const line = part.trim();
    if (!line) {
      continue;
    }

    logger.info("exec", `${streamName}: ${line}`);
  }

  setRemaining(remaining);
}

function flushRemainder(streamName: "stdout" | "stderr", remainder: string): void {
  const line = remainder.trim();
  if (!line) {
    return;
  }

  logger.info("exec", `${streamName}: ${line}`);
}

function appendPreview(current: string, next: string, maxLength = 4000): string {
  const combined = `${current}${next}`;
  if (combined.length <= maxLength) {
    return combined;
  }

  return combined.slice(combined.length - maxLength);
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
