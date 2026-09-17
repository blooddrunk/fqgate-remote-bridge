import { mkdir, rename, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import type { CloudflaredConfig } from "../config/config.js";
import type { DownloadOptions } from "../fqgate/release/downloader.js";
import type { ProcessRunner } from "../fqgate/process/types.js";
import { BridgeError, ERROR_CODES } from "../shared/errors.js";
import type { CloudflaredArtifactDownloader } from "./release/downloader.js";
import type { CloudflaredRelease, CloudflaredReleaseSource } from "./release/types.js";
import type { ProtectedTokenFileStore, TokenFileStatus } from "./token-file.js";
import type { CloudflaredServiceController } from "./windows/service.js";

export interface CloudflaredInstallPlan {
  readonly source: "cloudflare-github";
  readonly version: string;
  readonly asset: {
    readonly name: string;
    readonly size: number;
    readonly sha256: string;
    readonly url: string;
  };
  readonly installPath: string;
  readonly serviceOrigin: "http://127.0.0.1:17282";
  readonly action: "install" | "update" | "noop";
}

export interface CloudflaredStatus {
  readonly origin: "http://127.0.0.1:17282";
  readonly executablePath: string;
  readonly installedVersion: string | null;
  readonly expectedReleaseVersion: string;
  readonly tokenFile: TokenFileStatus;
  readonly service: {
    readonly supported: boolean;
    readonly installed: boolean;
    readonly running: boolean;
  };
}

export interface CloudflaredManagerOptions {
  readonly config: CloudflaredConfig;
  readonly releaseSource: CloudflaredReleaseSource;
  readonly downloader: CloudflaredArtifactDownloader;
  readonly runner: ProcessRunner;
  readonly tokenFiles: ProtectedTokenFileStore;
  readonly serviceController?: CloudflaredServiceController;
  readonly serviceAccount?: string;
  readonly downloadOptions?: DownloadOptions;
  readonly platform?: NodeJS.Platform;
}

export class CloudflaredManager {
  private readonly config: CloudflaredConfig;
  private readonly releaseSource: CloudflaredReleaseSource;
  private readonly downloader: CloudflaredArtifactDownloader;
  private readonly runner: ProcessRunner;
  private readonly tokenFiles: ProtectedTokenFileStore;
  private readonly serviceController: CloudflaredServiceController | undefined;
  private readonly serviceAccount: string;
  private readonly downloadOptions: DownloadOptions;
  private readonly platform: NodeJS.Platform;
  private readonly executablePath: string;

  constructor(options: CloudflaredManagerOptions) {
    this.config = options.config;
    this.releaseSource = options.releaseSource;
    this.downloader = options.downloader;
    this.runner = options.runner;
    this.tokenFiles = options.tokenFiles;
    this.serviceController = options.serviceController;
    this.serviceAccount = options.serviceAccount ?? "LocalSystem";
    this.downloadOptions = options.downloadOptions ?? {
      timeoutMs: 30_000,
      maxRetries: 0,
      retryDelayMs: 0,
    };
    this.platform = options.platform ?? process.platform;
    this.executablePath = join(
      this.config.installDirectory,
      this.platform === "win32" ? "cloudflared.exe" : "cloudflared",
    );
  }

  async release(): Promise<CloudflaredRelease> {
    return this.releaseSource.getRelease();
  }

  async plan(): Promise<CloudflaredInstallPlan> {
    const release = await this.release();
    const installedVersion = await this.detectVersion();
    return this.planFromRelease(release, installedVersion);
  }

  async install(options: { readonly dryRun?: boolean } = {}): Promise<CloudflaredInstallPlan> {
    const release = await this.release();
    const installedVersion = await this.detectVersion();
    const plan = this.planFromRelease(release, installedVersion);
    if (options.dryRun || plan.action === "noop") return plan;

    await mkdir(this.config.installDirectory, { recursive: true });
    const staged = await this.downloader.stage(
      release,
      join(this.config.installDirectory, "downloads"),
      this.downloadOptions,
    );
    const previousPath = `${this.executablePath}.previous`;
    let movedExisting = false;
    try {
      await assertCandidate(this.runner, staged.path, release.version);
      if (await fileExists(this.executablePath)) {
        await rm(previousPath, { force: true });
        await rename(this.executablePath, previousPath);
        movedExisting = true;
      }
      await rename(staged.path, this.executablePath);
    } catch (error) {
      if (movedExisting) {
        await rm(this.executablePath, { force: true }).catch(() => undefined);
        if (await fileExists(previousPath)) {
          await rename(previousPath, this.executablePath).catch(() => undefined);
        }
      }
      if (error instanceof BridgeError) throw error;
      throw new BridgeError(
        ERROR_CODES.ACTIVATION_FAILED,
        "Unable to activate the verified cloudflared binary; the previous binary was restored where possible",
        undefined,
        { cause: error },
      );
    } finally {
      await rm(staged.path, { force: true }).catch(() => undefined);
    }
    return plan;
  }

  async status(): Promise<CloudflaredStatus> {
    const tokenFile = await this.tokenFiles.inspect(this.config.tokenFile, this.serviceAccount);
    const installedVersion = await this.detectVersion();
    let service: CloudflaredStatus["service"] = {
      supported: false,
      installed: false,
      running: false,
    };
    if (this.serviceController !== undefined) {
      const current = await this.serviceController.status();
      service = { supported: true, ...current };
    }
    return {
      origin: this.config.origin,
      executablePath: this.executablePath,
      installedVersion,
      expectedReleaseVersion: this.config.releaseVersion,
      tokenFile,
      service,
    };
  }

  async installService(): Promise<void> {
    this.requireWindowsService();
    await this.ensureInstalledExecutable();
    await assertTokenFile(this.tokenFiles, this.config.tokenFile, this.serviceAccount);
    await assertTokenFileSupport(this.runner, this.executablePath);
    await this.serviceController?.install(
      this.executablePath,
      this.config.tokenFile,
      this.serviceAccount,
    );
  }

  async startService(): Promise<void> {
    this.requireWindowsService();
    await assertTokenFile(this.tokenFiles, this.config.tokenFile, this.serviceAccount);
    await this.serviceController?.start();
  }

  async stopService(): Promise<void> {
    this.requireWindowsService();
    await this.serviceController?.stop();
  }

  async restartService(): Promise<void> {
    this.requireWindowsService();
    await assertTokenFile(this.tokenFiles, this.config.tokenFile, this.serviceAccount);
    await this.serviceController?.restart();
  }

  private planFromRelease(
    release: CloudflaredRelease,
    installedVersion: string | null,
  ): CloudflaredInstallPlan {
    return {
      source: release.source,
      version: release.version,
      asset: release.asset,
      installPath: this.executablePath,
      serviceOrigin: this.config.origin,
      action:
        installedVersion === release.version
          ? "noop"
          : installedVersion === null
            ? "install"
            : "update",
    };
  }

  private async detectVersion(): Promise<string | null> {
    if (!(await fileExists(this.executablePath))) return null;
    const result = await this.runner.run(this.executablePath, ["--version"], {
      timeoutMs: 10_000,
      maxOutputBytes: 16 * 1024,
    });
    if (result.exitCode !== 0 || result.timedOut || result.truncated) return null;
    return parseCloudflaredVersion(`${result.stdout}\n${result.stderr}`);
  }

  private async ensureInstalledExecutable(): Promise<void> {
    if (!(await fileExists(this.executablePath))) {
      throw new BridgeError(
        ERROR_CODES.CLOUDFLARED_SERVICE_FAILED,
        "cloudflared is not installed; perform an explicit verified install first",
      );
    }
  }

  private requireWindowsService(): void {
    if (this.platform !== "win32" || this.serviceController === undefined) {
      throw new BridgeError(
        ERROR_CODES.CLOUDFLARED_UNSUPPORTED,
        "cloudflared Windows service integration is available only on Windows",
      );
    }
  }
}

async function assertCandidate(
  runner: ProcessRunner,
  executablePath: string,
  expectedVersion: string,
): Promise<void> {
  const result = await runner.run(executablePath, ["--version"], {
    timeoutMs: 10_000,
    maxOutputBytes: 16 * 1024,
  });
  if (result.exitCode !== 0 || result.timedOut || result.truncated) {
    throw new BridgeError(
      ERROR_CODES.CLOUDFLARED_RELEASE_INVALID,
      "The staged cloudflared candidate did not execute successfully",
    );
  }
  if (parseCloudflaredVersion(`${result.stdout}\n${result.stderr}`) !== expectedVersion) {
    throw new BridgeError(
      ERROR_CODES.CLOUDFLARED_RELEASE_INVALID,
      "The staged cloudflared candidate identity does not match the official release",
    );
  }
  await assertTokenFileSupport(runner, executablePath);
}

async function assertTokenFile(
  tokenFiles: ProtectedTokenFileStore,
  path: string,
  serviceAccount: string,
): Promise<void> {
  await tokenFiles.assertUsable(path, serviceAccount);
}

async function assertTokenFileSupport(
  runner: ProcessRunner,
  executablePath: string,
): Promise<void> {
  const result = await runner.run(executablePath, ["tunnel", "run", "--help"], {
    timeoutMs: 10_000,
    maxOutputBytes: 32 * 1024,
  });
  if (result.exitCode !== 0 || result.timedOut || result.truncated) {
    throw new BridgeError(
      ERROR_CODES.CLOUDFLARED_UNSUPPORTED,
      "The installed cloudflared version could not be checked for --token-file support",
    );
  }
  if (!/\B--token-file\b/.test(`${result.stdout}\n${result.stderr}`)) {
    throw new BridgeError(
      ERROR_CODES.CLOUDFLARED_UNSUPPORTED,
      "The installed cloudflared version does not support --token-file",
    );
  }
}

function parseCloudflaredVersion(output: string): string | null {
  return output.match(/\b(\d{4}\.\d+\.\d+)\b/)?.[1] ?? null;
}

async function fileExists(path: string): Promise<boolean> {
  try {
    const metadata = await stat(path);
    return metadata.isFile();
  } catch {
    return false;
  }
}
