import { spawn } from "node:child_process";
import { mkdir, readFile, readlink, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { BridgeError, ERROR_CODES } from "../../shared/errors.js";
import { writeJsonAtomically } from "../install/layout.js";
import { ChildProcessRunner } from "./runner.js";
import type {
  ManagedProcessController,
  ManagedProcessSnapshot,
  ProcessControlOptions,
  ProcessInspection,
  ProcessInspector,
  ProcessLauncher,
  ProcessRunner,
  ProcessTerminator,
} from "./types.js";

interface ProcessRecord {
  readonly pid: number;
  readonly executablePath: string;
  readonly startedAt: string;
}

export interface NativeProcessDependencies {
  readonly platform?: NodeJS.Platform;
  readonly runner?: ProcessRunner;
  readonly inspector?: ProcessInspector;
  readonly launcher?: ProcessLauncher;
  readonly terminator?: ProcessTerminator;
  readonly sleep?: (milliseconds: number) => Promise<void>;
}

export class NativeManagedProcessController implements ManagedProcessController {
  private readonly platform: NodeJS.Platform;
  private readonly inspector: ProcessInspector;
  private readonly launcher: ProcessLauncher;
  private readonly terminator: ProcessTerminator;
  private readonly sleep: (milliseconds: number) => Promise<void>;

  constructor(dependencies: NativeProcessDependencies = {}) {
    this.platform = dependencies.platform ?? process.platform;
    const runner = dependencies.runner ?? new ChildProcessRunner();
    this.inspector =
      dependencies.inspector ?? new NativeProcessInspector({ platform: this.platform, runner });
    this.launcher = dependencies.launcher ?? new NativeProcessLauncher();
    this.terminator =
      dependencies.terminator ?? new NativeProcessTerminator({ platform: this.platform, runner });
    this.sleep =
      dependencies.sleep ??
      ((milliseconds) => new Promise((resolveSleep) => setTimeout(resolveSleep, milliseconds)));
  }

  async status(executablePath: string, recordPath: string): Promise<ManagedProcessSnapshot> {
    const expectedPath = resolve(executablePath);
    const recordResult = await readProcessRecord(recordPath);
    if (recordResult === undefined) {
      return { state: "not_running", expectedPath };
    }
    if (recordResult.error !== undefined) {
      return { state: "identity_mismatch", expectedPath, reason: recordResult.error };
    }
    const record = recordResult.record;
    if (record === undefined) {
      return { state: "identity_mismatch", expectedPath, reason: "process record is missing" };
    }

    const inspection = await this.inspector.inspect(record.pid);
    if (!inspection.running) {
      await rm(recordPath, { force: true });
      return {
        state: "not_running",
        expectedPath,
        ...(inspection.reason === undefined ? {} : { reason: inspection.reason }),
      };
    }

    if (
      inspection.executablePath === undefined ||
      !pathsEqual(expectedPath, inspection.executablePath, this.platform)
    ) {
      return {
        state: "identity_mismatch",
        pid: record.pid,
        expectedPath,
        ...(inspection.executablePath === undefined
          ? {}
          : { actualPath: inspection.executablePath }),
        reason: "recorded PID does not resolve to the bridge-managed executable",
      };
    }

    return {
      state: "running",
      pid: record.pid,
      expectedPath,
      actualPath: inspection.executablePath,
    };
  }

  async start(
    executablePath: string,
    recordPath: string,
    options: ProcessControlOptions,
  ): Promise<ManagedProcessSnapshot> {
    const current = await this.status(executablePath, recordPath);
    if (current.state === "running" || current.state === "starting") {
      return current;
    }
    if (current.state === "identity_mismatch") {
      throw new BridgeError(
        ERROR_CODES.PROCESS_IDENTITY_MISMATCH,
        current.reason ?? "managed process identity mismatch",
      );
    }
    if (current.state === "unknown") {
      throw new BridgeError(
        ERROR_CODES.PROCESS_START_FAILED,
        current.reason ?? "managed process state could not be determined",
      );
    }

    let launched;
    try {
      launched = await this.launcher.launch(
        resolve(executablePath),
        dirname(resolve(executablePath)),
      );
    } catch (error) {
      throw new BridgeError(
        ERROR_CODES.PROCESS_START_FAILED,
        "Unable to start the bridge-managed FQGate executable",
        undefined,
        { cause: error },
      );
    }

    const record: ProcessRecord = {
      pid: launched.pid,
      executablePath: resolve(executablePath),
      startedAt: new Date().toISOString(),
    };
    try {
      await writeProcessRecord(recordPath, record);
    } catch (error) {
      await this.terminator.terminate(launched.pid, true).catch(() => undefined);
      throw new BridgeError(
        ERROR_CODES.PROCESS_START_FAILED,
        "Unable to persist the managed FQGate process record",
        undefined,
        { cause: error },
      );
    }
    await this.sleep(Math.min(50, options.timeoutMs));
    const started = await this.status(executablePath, recordPath);
    if (started.state === "identity_mismatch") {
      throw new BridgeError(
        ERROR_CODES.PROCESS_IDENTITY_MISMATCH,
        started.reason ?? "started process identity mismatch",
      );
    }
    return started.state === "not_running"
      ? { state: "starting", expectedPath: resolve(executablePath), pid: launched.pid }
      : started;
  }

  async stop(
    executablePath: string,
    recordPath: string,
    options: ProcessControlOptions,
  ): Promise<ManagedProcessSnapshot> {
    let current = await this.status(executablePath, recordPath);
    if (current.state === "not_running") {
      return current;
    }
    if (current.state === "identity_mismatch") {
      throw new BridgeError(
        ERROR_CODES.PROCESS_IDENTITY_MISMATCH,
        current.reason ?? "managed process identity mismatch",
      );
    }
    if (current.state === "unknown") {
      throw new BridgeError(
        ERROR_CODES.PROCESS_STOP_FAILED,
        current.reason ?? "managed process state could not be determined",
      );
    }
    if (current.pid === undefined) {
      throw new BridgeError(
        ERROR_CODES.PROCESS_STOP_FAILED,
        "Managed process status did not include a PID",
      );
    }

    try {
      await this.terminator.terminate(current.pid, false);
    } catch (error) {
      throw new BridgeError(
        ERROR_CODES.PROCESS_STOP_FAILED,
        "Unable to stop the bridge-managed FQGate executable",
        undefined,
        { cause: error },
      );
    }

    const deadline = Date.now() + options.timeoutMs;
    while (Date.now() < deadline) {
      current = await this.status(executablePath, recordPath);
      if (current.state === "not_running") {
        return current;
      }
      if (current.state === "identity_mismatch") {
        throw new BridgeError(
          ERROR_CODES.PROCESS_IDENTITY_MISMATCH,
          current.reason ?? "managed process identity mismatch",
        );
      }
      await this.sleep(50);
    }

    if (current.pid !== undefined) {
      try {
        await this.terminator.terminate(current.pid, true);
      } catch (error) {
        throw new BridgeError(
          ERROR_CODES.PROCESS_STOP_FAILED,
          "Unable to force-stop the bridge-managed FQGate executable",
          undefined,
          { cause: error },
        );
      }
    }
    current = await this.status(executablePath, recordPath);
    if (current.state !== "not_running") {
      throw new BridgeError(
        ERROR_CODES.PROCESS_STOP_FAILED,
        "FQGate did not stop before the configured deadline",
      );
    }
    return current;
  }
}

export class NativeProcessLauncher implements ProcessLauncher {
  launch(executablePath: string, cwd: string): Promise<{ pid: number }> {
    return new Promise((resolveLaunch, rejectLaunch) => {
      const child = spawn(executablePath, [], {
        cwd,
        detached: true,
        shell: false,
        windowsHide: false,
        stdio: "ignore",
      });
      child.once("error", rejectLaunch);
      child.once("spawn", () => {
        child.unref();
        if (child.pid === undefined) {
          rejectLaunch(new Error("spawned process did not expose a PID"));
          return;
        }
        resolveLaunch({ pid: child.pid });
      });
    });
  }
}

export class NativeProcessTerminator implements ProcessTerminator {
  private readonly platform: NodeJS.Platform;
  private readonly runner: ProcessRunner;

  constructor(
    dependencies: { readonly platform?: NodeJS.Platform; readonly runner?: ProcessRunner } = {},
  ) {
    this.platform = dependencies.platform ?? process.platform;
    this.runner = dependencies.runner ?? new ChildProcessRunner();
  }

  async terminate(pid: number, force: boolean): Promise<void> {
    if (this.platform === "win32") {
      const result = await this.runner.run("taskkill.exe", ["/PID", String(pid), "/T", "/F"], {
        timeoutMs: 10_000,
        maxOutputBytes: 8_192,
      });
      if (
        result.exitCode !== 0 &&
        !/not found|no running instance/i.test(`${result.stdout}\n${result.stderr}`)
      ) {
        throw new Error(`taskkill exited with code ${String(result.exitCode)}`);
      }
      return;
    }

    try {
      process.kill(pid, force ? "SIGKILL" : "SIGTERM");
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ESRCH") {
        return;
      }
      throw error;
    }
  }
}

export class NativeProcessInspector implements ProcessInspector {
  private readonly platform: NodeJS.Platform;
  private readonly runner: ProcessRunner;

  constructor(
    dependencies: { readonly platform?: NodeJS.Platform; readonly runner?: ProcessRunner } = {},
  ) {
    this.platform = dependencies.platform ?? process.platform;
    this.runner = dependencies.runner ?? new ChildProcessRunner();
  }

  async inspect(pid: number): Promise<ProcessInspection> {
    if (!Number.isSafeInteger(pid) || pid <= 0) {
      return { pid, running: false, reason: "invalid PID" };
    }

    if (this.platform === "win32") {
      return this.inspectWindows(pid);
    }

    try {
      process.kill(pid, 0);
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "EPERM") {
        return { pid, running: true, reason: "process exists but access is restricted" };
      }
      return { pid, running: false, reason: "process is not running" };
    }

    try {
      const executablePath = await readlink(`/proc/${pid}/exe`);
      return { pid, running: true, executablePath };
    } catch {
      return { pid, running: true, reason: "process executable path is unavailable" };
    }
  }

  private async inspectWindows(pid: number): Promise<ProcessInspection> {
    const script = `$p = Get-CimInstance -ClassName Win32_Process -Filter 'ProcessId = ${pid}'; if ($null -eq $p) { exit 3 }; [pscustomobject]@{ ProcessId = [int]$p.ProcessId; ExecutablePath = $p.ExecutablePath } | ConvertTo-Json -Compress`;
    const result = await this.runner.run(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", script],
      {
        timeoutMs: 5_000,
        maxOutputBytes: 16_384,
      },
    );
    if (result.exitCode === 3) {
      return { pid, running: false, reason: "process is not running" };
    }
    if (result.exitCode !== 0 || result.timedOut || result.truncated) {
      return { pid, running: true, reason: "Windows process identity could not be verified" };
    }

    try {
      const value = JSON.parse(result.stdout) as unknown;
      if (!isProcessIdentity(value) || value.ProcessId !== pid) {
        return { pid, running: true, reason: "Windows process identity response was invalid" };
      }
      return { pid, running: true, executablePath: value.ExecutablePath };
    } catch {
      return { pid, running: true, reason: "Windows process identity response was not JSON" };
    }
  }
}

function isProcessIdentity(value: unknown): value is { ProcessId: number; ExecutablePath: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "ProcessId" in value &&
    typeof value.ProcessId === "number" &&
    "ExecutablePath" in value &&
    typeof value.ExecutablePath === "string" &&
    value.ExecutablePath.length > 0
  );
}

function pathsEqual(left: string, right: string, platform: NodeJS.Platform): boolean {
  const normalize = (value: string): string => {
    const resolved = resolve(value);
    return platform === "win32" ? resolved.replaceAll("/", "\\").toLowerCase() : resolved;
  };
  return normalize(left) === normalize(right);
}

async function readProcessRecord(
  filePath: string,
): Promise<{ record?: ProcessRecord; error?: string } | undefined> {
  let contents: string;
  try {
    contents = await readFile(filePath, "utf8");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return undefined;
    }
    throw new BridgeError(
      ERROR_CODES.PROCESS_START_FAILED,
      "Unable to read the FQGate process record",
      undefined,
      { cause: error },
    );
  }

  try {
    const value = JSON.parse(contents) as unknown;
    if (!isProcessRecord(value)) {
      return { error: "process record is malformed" };
    }
    return { record: value };
  } catch {
    return { error: "process record is not valid JSON" };
  }
}

async function writeProcessRecord(filePath: string, record: ProcessRecord): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  await writeJsonAtomically(filePath, record);
}

function isProcessRecord(value: unknown): value is ProcessRecord {
  return (
    typeof value === "object" &&
    value !== null &&
    "pid" in value &&
    typeof value.pid === "number" &&
    Number.isSafeInteger(value.pid) &&
    value.pid > 0 &&
    "executablePath" in value &&
    typeof value.executablePath === "string" &&
    "startedAt" in value &&
    typeof value.startedAt === "string"
  );
}
