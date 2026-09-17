import type { ProcessRunner } from "../../fqgate/process/types.js";
import { BridgeError, ERROR_CODES } from "../../shared/errors.js";
import { CLOUDFLARED_ORIGIN } from "../release/types.js";
import type { ProtectedTokenFileStore } from "../token-file.js";

export interface CloudflaredServiceStatus {
  readonly installed: boolean;
  readonly running: boolean;
}

export interface CloudflaredServiceController {
  install(executablePath: string, tokenFilePath: string, serviceAccount: string): Promise<void>;
  start(): Promise<void>;
  stop(): Promise<void>;
  restart(): Promise<void>;
  status(): Promise<CloudflaredServiceStatus>;
}

export interface CloudflaredInvocation {
  readonly executablePath: string;
  readonly tokenFilePath: string;
  readonly arguments: readonly string[];
  readonly serviceBinPath: string;
  readonly origin: typeof CLOUDFLARED_ORIGIN;
}

export function buildCloudflaredInvocation(
  executablePath: string,
  tokenFilePath: string,
): CloudflaredInvocation {
  const args = ["tunnel", "run", "--token-file", tokenFilePath] as const;
  return {
    executablePath,
    tokenFilePath,
    arguments: args,
    serviceBinPath: [
      quoteWindowsArgument(executablePath),
      ...args.slice(0, 3),
      quoteWindowsArgument(tokenFilePath),
    ].join(" "),
    origin: CLOUDFLARED_ORIGIN,
  };
}

export class WindowsCloudflaredServiceController implements CloudflaredServiceController {
  private readonly runner: ProcessRunner;
  private readonly tokenFiles: ProtectedTokenFileStore;
  private readonly serviceName: string;

  constructor(options: {
    readonly runner: ProcessRunner;
    readonly tokenFiles: ProtectedTokenFileStore;
    readonly serviceName: string;
  }) {
    this.runner = options.runner;
    this.tokenFiles = options.tokenFiles;
    this.serviceName = options.serviceName;
  }

  async install(
    executablePath: string,
    tokenFilePath: string,
    serviceAccount: string,
  ): Promise<void> {
    await this.tokenFiles.assertUsable(tokenFilePath, serviceAccount);
    const invocation = buildCloudflaredInvocation(executablePath, tokenFilePath);
    const create = await this.runSc([
      "create",
      this.serviceName,
      "binPath=",
      invocation.serviceBinPath,
      "start=",
      "auto",
      "obj=",
      serviceAccount,
    ]);
    if (create.exitCode === 0) return;
    if (!/already exists|1073/i.test(`${create.stdout}\n${create.stderr}`)) {
      throw serviceError("Unable to install the cloudflared Windows service");
    }
    const configured = await this.runSc([
      "config",
      this.serviceName,
      "binPath=",
      invocation.serviceBinPath,
      "start=",
      "auto",
      "obj=",
      serviceAccount,
    ]);
    if (configured.exitCode !== 0) {
      throw serviceError("Unable to reconfigure the cloudflared Windows service");
    }
  }

  async start(): Promise<void> {
    const result = await this.runSc(["start", this.serviceName]);
    if (result.exitCode !== 0)
      throw serviceError("Unable to start the cloudflared Windows service");
  }

  async stop(): Promise<void> {
    const result = await this.runSc(["stop", this.serviceName]);
    if (result.exitCode !== 0 && !/not started|1062/i.test(`${result.stdout}\n${result.stderr}`)) {
      throw serviceError("Unable to stop the cloudflared Windows service");
    }
  }

  async restart(): Promise<void> {
    await this.stop();
    await this.start();
  }

  async status(): Promise<CloudflaredServiceStatus> {
    const result = await this.runSc(["query", this.serviceName]);
    if (result.exitCode !== 0) {
      if (/1060|does not exist|not found/i.test(`${result.stdout}\n${result.stderr}`)) {
        return { installed: false, running: false };
      }
      throw serviceError("Unable to query the cloudflared Windows service");
    }
    return { installed: true, running: /\bRUNNING\b/i.test(result.stdout) };
  }

  private runSc(args: readonly string[]) {
    return this.runner.run("sc.exe", args, { timeoutMs: 15_000, maxOutputBytes: 16 * 1024 });
  }
}

function quoteWindowsArgument(value: string): string {
  return `"${value.replace(/"/g, '\\"')}"`;
}

function serviceError(message: string): BridgeError {
  return new BridgeError(ERROR_CODES.CLOUDFLARED_SERVICE_FAILED, message);
}
