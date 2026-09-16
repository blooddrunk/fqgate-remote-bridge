export interface ProcessRunOptions {
  readonly cwd?: string;
  readonly timeoutMs: number;
  readonly maxOutputBytes: number;
}

export interface ProcessRunResult {
  readonly exitCode: number | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly timedOut: boolean;
  readonly truncated: boolean;
}

export interface ProcessRunner {
  run(
    executablePath: string,
    args: readonly string[],
    options: ProcessRunOptions,
  ): Promise<ProcessRunResult>;
}

export interface ProcessInspection {
  readonly pid: number;
  readonly running: boolean;
  readonly executablePath?: string;
  readonly reason?: string;
}

export interface ProcessInspector {
  inspect(pid: number): Promise<ProcessInspection>;
}

export interface ProcessLaunchResult {
  readonly pid: number;
}

export interface ProcessLauncher {
  launch(executablePath: string, cwd: string): Promise<ProcessLaunchResult>;
}

export interface ProcessTerminator {
  terminate(pid: number, force: boolean): Promise<void>;
}

export type ManagedProcessState =
  "not_running" | "starting" | "running" | "identity_mismatch" | "unknown";

export interface ManagedProcessSnapshot {
  readonly state: ManagedProcessState;
  readonly pid?: number;
  readonly expectedPath: string;
  readonly actualPath?: string;
  readonly reason?: string;
}

export interface ProcessControlOptions {
  readonly timeoutMs: number;
}

export interface ManagedProcessController {
  status(executablePath: string, recordPath: string): Promise<ManagedProcessSnapshot>;
  start(
    executablePath: string,
    recordPath: string,
    options: ProcessControlOptions,
  ): Promise<ManagedProcessSnapshot>;
  stop(
    executablePath: string,
    recordPath: string,
    options: ProcessControlOptions,
  ): Promise<ManagedProcessSnapshot>;
}
