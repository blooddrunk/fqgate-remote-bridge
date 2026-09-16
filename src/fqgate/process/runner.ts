import { spawn } from "node:child_process";
import { BridgeError, ERROR_CODES } from "../../shared/errors.js";
import type { ProcessRunOptions, ProcessRunResult, ProcessRunner } from "./types.js";

export class ChildProcessRunner implements ProcessRunner {
  run(
    executablePath: string,
    args: readonly string[],
    options: ProcessRunOptions,
  ): Promise<ProcessRunResult> {
    return new Promise((resolve) => {
      let child;
      try {
        child = spawn(executablePath, [...args], {
          cwd: options.cwd,
          shell: false,
          windowsHide: true,
          stdio: ["ignore", "pipe", "pipe"],
        });
      } catch (error) {
        resolve({
          exitCode: null,
          stdout: "",
          stderr: error instanceof Error ? error.message : String(error),
          timedOut: false,
          truncated: false,
        });
        return;
      }

      const stdout: Buffer[] = [];
      const stderr: Buffer[] = [];
      let outputBytes = 0;
      let timedOut = false;
      let truncated = false;
      let settled = false;

      const append = (target: Buffer[], chunk: Buffer): void => {
        if (outputBytes >= options.maxOutputBytes) {
          truncated = true;
          return;
        }
        const remaining = options.maxOutputBytes - outputBytes;
        const accepted = chunk.byteLength <= remaining ? chunk : chunk.subarray(0, remaining);
        target.push(accepted);
        outputBytes += accepted.byteLength;
        if (accepted.byteLength !== chunk.byteLength) {
          truncated = true;
          child.kill();
        }
      };

      const finish = (exitCode: number | null): void => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timeout);
        resolve({
          exitCode,
          stdout: Buffer.concat(stdout).toString("utf8"),
          stderr: Buffer.concat(stderr).toString("utf8"),
          timedOut,
          truncated,
        });
      };

      child.stdout?.on("data", (chunk: Buffer) => append(stdout, chunk));
      child.stderr?.on("data", (chunk: Buffer) => append(stderr, chunk));
      child.once("error", (error: Error) => {
        append(stderr, Buffer.from(error.message));
        finish(null);
      });
      child.once("close", (exitCode: number | null) => finish(exitCode));

      const timeout = setTimeout(() => {
        timedOut = true;
        child.kill();
      }, options.timeoutMs);
    });
  }
}

export function assertSuccessfulProcess(result: ProcessRunResult, context: string): void {
  if (result.timedOut) {
    throw new BridgeError(ERROR_CODES.PROCESS_START_FAILED, `${context} timed out`);
  }
  if (result.truncated) {
    throw new BridgeError(
      ERROR_CODES.PROCESS_START_FAILED,
      `${context} produced more output than permitted`,
    );
  }
  if (result.exitCode !== 0) {
    throw new BridgeError(
      ERROR_CODES.PROCESS_START_FAILED,
      `${context} exited with code ${String(result.exitCode)}`,
    );
  }
}
