import { spawn } from "node:child_process";

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
    const child = spawn(command, args, {
      cwd,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
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
