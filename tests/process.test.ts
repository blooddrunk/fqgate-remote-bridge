import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { NativeManagedProcessController } from "../src/fqgate/process/native.js";
import { ERROR_CODES } from "../src/shared/errors.js";
import type {
  ProcessInspection,
  ProcessInspector,
  ProcessLaunchResult,
  ProcessLauncher,
  ProcessRunOptions,
  ProcessRunResult,
  ProcessRunner,
  ProcessTerminator,
} from "../src/fqgate/process/types.js";

class FakeInspector implements ProcessInspector {
  running = false;
  actualPath: string | undefined;

  async inspect(pid: number): Promise<ProcessInspection> {
    return {
      pid,
      running: this.running,
      ...(this.actualPath === undefined ? {} : { executablePath: this.actualPath }),
      ...(this.running ? {} : { reason: "not running" }),
    };
  }
}

class FakeLauncher implements ProcessLauncher {
  constructor(
    private readonly inspector: FakeInspector,
    private readonly pid: number,
  ) {}

  async launch(executablePath: string, _cwd: string): Promise<ProcessLaunchResult> {
    this.inspector.running = true;
    this.inspector.actualPath = executablePath;
    return { pid: this.pid };
  }
}

class FakeTerminator implements ProcessTerminator {
  calls = 0;

  constructor(private readonly inspector: FakeInspector) {}

  async terminate(_pid: number, _force: boolean): Promise<void> {
    this.calls += 1;
    this.inspector.running = false;
  }
}

class FakeListenerRunner implements ProcessRunner {
  exitCode = 0;
  stdout = '{"Pid":4321}';

  async run(
    _executablePath: string,
    _args: readonly string[],
    _options: ProcessRunOptions,
  ): Promise<ProcessRunResult> {
    return {
      exitCode: this.exitCode,
      stdout: this.stdout,
      stderr: "",
      timedOut: false,
      truncated: false,
    };
  }
}

describe("managed process control", () => {
  it("adopts only a verified managed Windows loopback listener", async () => {
    const root = await mkdtemp(join(tmpdir(), "fqgate-adopt-"));
    const executable = join(root, "current", "fqgate.exe");
    const record = join(root, "process.json");
    const inspector = new FakeInspector();
    inspector.running = true;
    inspector.actualPath = executable;
    const runner = new FakeListenerRunner();
    const controller = new NativeManagedProcessController({ platform: "win32", inspector, runner });
    expect(await controller.adoptCurrent(executable, record)).toMatchObject({
      state: "running",
      pid: 4321,
    });
    inspector.actualPath = join(root, "other", "fqgate.exe");
    await expect(controller.adoptCurrent(executable, record)).rejects.toMatchObject({
      code: ERROR_CODES.PROCESS_IDENTITY_MISMATCH,
    });
    await rm(root, { recursive: true, force: true });
  });

  it("rejects an ambiguous or non-loopback Windows listener", async () => {
    const root = await mkdtemp(join(tmpdir(), "fqgate-adopt-deny-"));
    const executable = join(root, "current", "fqgate.exe");
    const inspector = new FakeInspector();
    inspector.running = true;
    inspector.actualPath = executable;
    const runner = new FakeListenerRunner();
    runner.exitCode = 4;
    const controller = new NativeManagedProcessController({ platform: "win32", inspector, runner });
    await expect(
      controller.adoptCurrent(executable, join(root, "process.json")),
    ).rejects.toMatchObject({ code: ERROR_CODES.PROCESS_IDENTITY_MISMATCH });
    await rm(root, { recursive: true, force: true });
  });
  it("starts and stops only the process recorded for the managed executable", async () => {
    const root = await mkdtemp(join(tmpdir(), "fqgate-process-"));
    const executable = join(root, "current", "fqgate.exe");
    const record = join(root, "process.json");
    const inspector = new FakeInspector();
    const terminator = new FakeTerminator(inspector);
    const controller = new NativeManagedProcessController({
      inspector,
      launcher: new FakeLauncher(inspector, 4321),
      terminator,
      sleep: async () => undefined,
    });

    expect((await controller.status(executable, record)).state).toBe("not_running");
    expect(await controller.start(executable, record, { timeoutMs: 100 })).toMatchObject({
      state: "running",
      pid: 4321,
    });
    expect((await controller.stop(executable, record, { timeoutMs: 100 })).state).toBe(
      "not_running",
    );
    expect(terminator.calls).toBe(1);
    await rm(root, { recursive: true, force: true });
  });

  it("refuses to terminate a same-name process whose executable path does not match", async () => {
    const root = await mkdtemp(join(tmpdir(), "fqgate-process-"));
    const executable = join(root, "current", "fqgate.exe");
    const record = join(root, "process.json");
    const inspector = new FakeInspector();
    const terminator = new FakeTerminator(inspector);
    const controller = new NativeManagedProcessController({
      inspector,
      launcher: new FakeLauncher(inspector, 9876),
      terminator,
      sleep: async () => undefined,
    });

    await controller.start(executable, record, { timeoutMs: 100 });
    inspector.actualPath = join(root, "other", "fqgate.exe");
    expect((await controller.status(executable, record)).state).toBe("identity_mismatch");
    await expect(controller.stop(executable, record, { timeoutMs: 100 })).rejects.toMatchObject({
      code: ERROR_CODES.PROCESS_IDENTITY_MISMATCH,
    });
    expect(terminator.calls).toBe(0);
    await rm(root, { recursive: true, force: true });
  });

  it("handles a case-only Windows path comparison without broad name matching", async () => {
    const inspector = new FakeInspector();
    inspector.running = true;
    inspector.actualPath = "C:\\Users\\Tester\\FQGate\\current\\FQGate.EXE";
    const controller = new NativeManagedProcessController({
      platform: "win32",
      inspector,
      launcher: new FakeLauncher(inspector, 2468),
      terminator: new FakeTerminator(inspector),
      sleep: async () => undefined,
    });
    const root = await mkdtemp(join(tmpdir(), "fqgate-process-"));
    const record = join(root, "process.json");
    const executable = "C:\\Users\\Tester\\FQGate\\current\\fqgate.exe";
    const { writeFile } = await import("node:fs/promises");
    await writeFile(
      record,
      JSON.stringify({
        pid: 2468,
        executablePath: executable,
        startedAt: new Date(0).toISOString(),
      }),
    );

    expect((await controller.status(executable, record)).state).toBe("running");
    await rm(root, { recursive: true, force: true });
  });
});
