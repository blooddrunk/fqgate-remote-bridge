import { open } from "node:fs/promises";
import { basename, join } from "node:path";
import type { CompatibilityEvaluation, CompatibilityPolicy } from "../compatibility/policy.js";
import { BridgeError, ERROR_CODES, toBridgeError } from "../../shared/errors.js";
import { StructuredLogger } from "../../shared/logger.js";
import { isActivationHealthy } from "../health/probe.js";
import type { FqgateHealthProbe } from "../health/probe.js";
import type { HealthObservation } from "../health/types.js";
import { selectWindowsX64Package } from "../release/manifest.js";
import type { ArtifactDownloader, DownloadOptions, StagedArtifact } from "../release/downloader.js";
import type { FqgatePackage, FqgateRelease, FqgateReleaseSource } from "../release/types.js";
import type {
  CandidateInspection,
  CandidateValidation,
  FqgateCandidateValidator,
} from "../process/candidate.js";
import type { ManagedProcessController, ManagedProcessSnapshot } from "../process/types.js";
import {
  cleanupStagingArtifacts,
  createFqgateLayout,
  ensureFqgateLayout,
  moveFile,
  pathExists,
  removeFile,
  sha256File,
  writeJsonAtomically,
  type FqgateLayout,
} from "./layout.js";
import {
  readFqgateState,
  writeFqgateState,
  type ArtifactRecord,
  type FqgateState,
} from "./state.js";

export type FqgateLifecycleState =
  "not_installed" | "stopped" | "starting" | "ready" | "unhealthy" | "incompatible";

export interface InstalledArtifact {
  readonly path: string;
  readonly size: number;
  readonly sha256: string;
  readonly version?: string;
  readonly compatibility?: CompatibilityEvaluation;
  readonly validationError?: string;
}

export interface ReleasePlan {
  readonly release: FqgateRelease;
  readonly package: FqgatePackage;
  readonly compatibility: CompatibilityEvaluation;
  readonly current?: InstalledArtifact;
  readonly action: "install" | "update" | "noop" | "blocked";
  readonly reason: string;
}

export interface FqgateStatus {
  readonly lifecycle: FqgateLifecycleState;
  readonly process: ManagedProcessSnapshot;
  readonly installed?: InstalledArtifact;
  readonly compatibility?: CompatibilityEvaluation;
  readonly health: HealthObservation;
}

export interface InstallResult {
  readonly plan: ReleasePlan;
  readonly action: "installed" | "updated" | "noop" | "planned";
  readonly status?: FqgateStatus;
}

export interface LifecycleDependencies {
  readonly layout?: FqgateLayout;
  readonly releaseSource: FqgateReleaseSource;
  readonly downloader: ArtifactDownloader;
  readonly candidateValidator: FqgateCandidateValidator;
  readonly processController: ManagedProcessController;
  readonly healthProbe: FqgateHealthProbe;
  readonly policy: CompatibilityPolicy;
  readonly downloadOptions: DownloadOptions;
  readonly activationHealthTimeoutMs: number;
  readonly activationHealthPollIntervalMs: number;
  readonly processTimeoutMs: number;
  readonly logger?: StructuredLogger;
  readonly now?: () => string;
}

export class FqgateLifecycleManager {
  readonly layout: FqgateLayout;

  private readonly releaseSource: FqgateReleaseSource;
  private readonly downloader: ArtifactDownloader;
  private readonly candidateValidator: FqgateCandidateValidator;
  private readonly processController: ManagedProcessController;
  private readonly healthProbe: FqgateHealthProbe;
  private readonly policy: CompatibilityPolicy;
  private readonly downloadOptions: DownloadOptions;
  private readonly activationHealthTimeoutMs: number;
  private readonly activationHealthPollIntervalMs: number;
  private readonly processTimeoutMs: number;
  private readonly logger: StructuredLogger;
  private readonly now: () => string;

  constructor(dependencies: LifecycleDependencies) {
    this.layout = dependencies.layout ?? createFqgateLayout(".");
    this.releaseSource = dependencies.releaseSource;
    this.downloader = dependencies.downloader;
    this.candidateValidator = dependencies.candidateValidator;
    this.processController = dependencies.processController;
    this.healthProbe = dependencies.healthProbe;
    this.policy = dependencies.policy;
    this.downloadOptions = dependencies.downloadOptions;
    this.activationHealthTimeoutMs = dependencies.activationHealthTimeoutMs;
    this.activationHealthPollIntervalMs = dependencies.activationHealthPollIntervalMs;
    this.processTimeoutMs = dependencies.processTimeoutMs;
    this.logger = dependencies.logger ?? new StructuredLogger({ level: "warn" });
    this.now = dependencies.now ?? (() => new Date().toISOString());
  }

  async plan(): Promise<ReleasePlan> {
    const release = await this.releaseSource.getStableRelease();
    const selectedPackage = selectWindowsX64Package(release);
    const compatibility = this.policy.evaluate(release.version);
    const current = await this.inspectArtifact(this.layout.currentExecutable);

    if (
      compatibility.validated &&
      current?.version === release.version &&
      current.sha256 === selectedPackage.sha256 &&
      current.compatibility?.validated === true
    ) {
      return {
        release,
        package: selectedPackage,
        compatibility,
        current,
        action: "noop",
        reason:
          "managed current executable already matches the selected official release hash and version",
      };
    }

    if (!compatibility.validated) {
      return {
        release,
        package: selectedPackage,
        compatibility,
        ...(current === undefined ? {} : { current }),
        action: "blocked",
        reason: `release ${release.version} is not approved for activation: ${compatibility.reason}`,
      };
    }

    return {
      release,
      package: selectedPackage,
      compatibility,
      ...(current === undefined ? {} : { current }),
      action: current === undefined ? "install" : "update",
      reason:
        current === undefined
          ? "no managed current executable exists"
          : "selected release differs from the managed current executable",
    };
  }

  async releaseForCli(): Promise<FqgateRelease> {
    return this.releaseSource.getStableRelease();
  }

  async install(options: { readonly dryRun?: boolean } = {}): Promise<InstallResult> {
    const plan = await this.plan();
    if (options.dryRun) {
      return { plan, action: "planned" };
    }
    if (plan.action === "blocked") {
      this.policy.assertActivatable(plan.release.version);
    }
    if (plan.action === "noop") {
      return { plan, action: "noop", status: await this.status() };
    }

    await ensureInstallablePlan(plan);
    await this.ensureLayoutAndLock(async () => this.applyPlan(plan));
    const status = await this.status();
    return {
      plan,
      action: plan.action === "install" ? "installed" : "updated",
      status,
    };
  }

  async status(): Promise<FqgateStatus> {
    const installed = await this.inspectArtifact(this.layout.currentExecutable);
    const process = await this.processController.status(
      this.layout.currentExecutable,
      this.layout.processFile,
    );
    const health = await this.healthProbe.probe();

    let lifecycle: FqgateLifecycleState;
    if (installed === undefined) {
      lifecycle = "not_installed";
    } else if (installed.compatibility?.validated !== true || installed.version === undefined) {
      lifecycle = "incompatible";
    } else if (process.state === "starting") {
      lifecycle = "starting";
    } else if (process.state === "running") {
      lifecycle = isActivationHealthy(health) ? "ready" : "unhealthy";
    } else if (process.state === "identity_mismatch" || process.state === "unknown") {
      lifecycle = "unhealthy";
    } else {
      lifecycle = "stopped";
    }

    return {
      lifecycle,
      process,
      ...(installed === undefined ? {} : { installed }),
      ...(installed?.compatibility === undefined ? {} : { compatibility: installed.compatibility }),
      health,
    };
  }

  async health(): Promise<HealthObservation> {
    return this.healthProbe.probe();
  }

  async start(): Promise<FqgateStatus> {
    const installed = await this.requireActivatableCurrent();
    await this.processController.start(this.layout.currentExecutable, this.layout.processFile, {
      timeoutMs: this.processTimeoutMs,
    });
    this.logger.info("FQGate start requested", { version: installed.version });
    return this.status();
  }

  async stop(): Promise<FqgateStatus> {
    const installed = await this.inspectArtifact(this.layout.currentExecutable);
    if (installed === undefined) {
      return this.status();
    }
    await this.processController.stop(this.layout.currentExecutable, this.layout.processFile, {
      timeoutMs: this.processTimeoutMs,
    });
    this.logger.info("FQGate stop requested", { version: installed.version });
    return this.status();
  }

  async restart(): Promise<FqgateStatus> {
    await this.stop();
    return this.start();
  }

  private async applyPlan(plan: ReleasePlan): Promise<void> {
    await cleanupStagingArtifacts(this.layout.downloadsDirectory);
    const currentBefore = await this.inspectArtifact(this.layout.currentExecutable);
    if (!sameInstalledArtifact(plan.current, currentBefore)) {
      throw new BridgeError(
        ERROR_CODES.ACTIVATION_FAILED,
        "Managed current FQGate executable changed while the release plan was being applied; rerun the operation",
      );
    }
    const stateBefore = await readFqgateState(this.layout);
    const previousBefore = await this.inspectArtifact(this.layout.previousExecutable);

    if (currentBefore !== undefined && !(await this.isKnownGood(currentBefore, stateBefore))) {
      throw new BridgeError(
        ERROR_CODES.ACTIVATION_FAILED,
        "Refusing to replace an existing FQGate executable that has not been proven known-good",
      );
    }

    const staged = await this.downloader.stage(
      plan.package,
      this.layout.downloadsDirectory,
      this.downloadOptions,
    );
    let candidateValidation: CandidateValidation;
    try {
      candidateValidation = await this.candidateValidator.validate(
        staged.path,
        plan.release.version,
      );
    } catch (error) {
      await removeFile(staged.path);
      throw error;
    }

    const transactionId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    const previousBackup = join(this.layout.fqgateDirectory, `.previous-${transactionId}.bak`);
    let previousBackedUp = false;
    let currentMovedToPrevious = false;
    let candidateMovedToCurrent = false;
    await writeJsonAtomically(this.layout.transactionFile, {
      schemaVersion: 1,
      id: transactionId,
      phase: "verified",
      version: candidateValidation.version,
      sha256: staged.sha256,
    });

    try {
      await this.stopIfManaged(currentBefore);
      await writeJsonAtomically(this.layout.transactionFile, {
        schemaVersion: 1,
        id: transactionId,
        phase: "process_stopped",
        version: candidateValidation.version,
        sha256: staged.sha256,
      });

      if (await pathExists(this.layout.previousExecutable)) {
        await moveFile(this.layout.previousExecutable, previousBackup);
        previousBackedUp = true;
      }
      if (await pathExists(this.layout.currentExecutable)) {
        await moveFile(this.layout.currentExecutable, this.layout.previousExecutable);
        currentMovedToPrevious = true;
      }
      await moveFile(staged.path, this.layout.currentExecutable);
      candidateMovedToCurrent = true;
      await writeJsonAtomically(this.layout.transactionFile, {
        schemaVersion: 1,
        id: transactionId,
        phase: "candidate_activated",
        version: candidateValidation.version,
        sha256: staged.sha256,
      });

      await this.processController.start(this.layout.currentExecutable, this.layout.processFile, {
        timeoutMs: this.processTimeoutMs,
      });
      const health = await this.healthProbe.waitUntilReady(
        this.activationHealthTimeoutMs,
        this.activationHealthPollIntervalMs,
      );
      if (!isActivationHealthy(health)) {
        throw new BridgeError(
          ERROR_CODES.HEALTH_TIMEOUT,
          "FQGate activation health was not usable",
        );
      }

      const activeRecord = toArtifactRecord(candidateValidation, staged);
      const state: FqgateState = {
        schemaVersion: 1,
        active: activeRecord,
        ...(currentBefore === undefined
          ? previousBefore === undefined
            ? {}
            : { previous: artifactRecordFromInstalled(previousBefore) }
          : { previous: artifactRecordFromInstalled(currentBefore) }),
        lastActivation: "succeeded",
        updatedAt: this.now(),
      };
      await writeFqgateState(this.layout, state);
      await removeFile(previousBackup);
      await removeFile(this.layout.transactionFile);
      this.logger.info("FQGate activation succeeded", {
        version: candidateValidation.version,
        sha256: staged.sha256,
      });
    } catch (error) {
      const activationError = toBridgeError(
        error,
        ERROR_CODES.ACTIVATION_FAILED,
        "FQGate activation failed",
      );
      const rollback = await this.rollback(
        activationError,
        currentBefore,
        previousBefore,
        previousBackup,
        previousBackedUp,
        currentMovedToPrevious,
        candidateMovedToCurrent,
        staged,
      );
      if (!rollback.success) {
        throw rollback.error;
      }
      throw activationError;
    }
  }

  private async rollback(
    activationError: BridgeError,
    currentBefore: InstalledArtifact | undefined,
    previousBefore: InstalledArtifact | undefined,
    previousBackup: string,
    previousBackedUp: boolean,
    currentMovedToPrevious: boolean,
    candidateMovedToCurrent: boolean,
    staged: StagedArtifact,
  ): Promise<{ success: true; restored: boolean } | { success: false; error: BridgeError }> {
    let failure: unknown;
    try {
      const fileChanges = previousBackedUp || currentMovedToPrevious || candidateMovedToCurrent;
      if (candidateMovedToCurrent) {
        await this.stopCandidate();
        if (currentMovedToPrevious || (previousBackedUp && previousBefore !== undefined)) {
          await removeFile(this.layout.currentExecutable);
        }
      } else {
        await removeFile(staged.path);
      }

      if (currentMovedToPrevious && (await pathExists(this.layout.previousExecutable))) {
        await moveFile(this.layout.previousExecutable, this.layout.currentExecutable);
      }

      if (previousBackedUp) {
        if (currentMovedToPrevious) {
          if (await pathExists(previousBackup)) {
            await moveFile(previousBackup, this.layout.previousExecutable);
          }
        } else if (candidateMovedToCurrent && previousBefore !== undefined) {
          if (await pathExists(this.layout.currentExecutable)) {
            await removeFile(this.layout.currentExecutable);
          }
          if (await pathExists(previousBackup)) {
            await moveFile(previousBackup, this.layout.currentExecutable);
          }
        } else if (currentBefore === undefined && previousBefore !== undefined) {
          if (await pathExists(this.layout.currentExecutable)) {
            throw new BridgeError(
              ERROR_CODES.ROLLBACK_FAILED,
              "Cannot restore the previous executable without overwriting an unmanaged file",
            );
          }
          if (await pathExists(previousBackup)) {
            await moveFile(previousBackup, this.layout.currentExecutable);
          }
        } else {
          if (await pathExists(this.layout.previousExecutable)) {
            throw new BridgeError(
              ERROR_CODES.ROLLBACK_FAILED,
              "Cannot restore the previous executable without overwriting an unmanaged file",
            );
          }
          if (await pathExists(previousBackup)) {
            await moveFile(previousBackup, this.layout.previousExecutable);
          }
        }
      }

      const restored = currentBefore ?? (currentMovedToPrevious ? undefined : previousBefore);
      if (restored !== undefined) {
        if (!(await pathExists(this.layout.currentExecutable))) {
          throw new BridgeError(
            ERROR_CODES.ROLLBACK_FAILED,
            "Known-good FQGate executable is missing during rollback",
          );
        }
        await this.processController.start(this.layout.currentExecutable, this.layout.processFile, {
          timeoutMs: this.processTimeoutMs,
        });
        await this.healthProbe.waitUntilReady(
          this.activationHealthTimeoutMs,
          this.activationHealthPollIntervalMs,
        );
      }

      const stateBefore = await readFqgateState(this.layout);
      const state: FqgateState = {
        schemaVersion: 1,
        ...(stateBefore.previous === undefined ? {} : { previous: stateBefore.previous }),
        ...(restored === undefined ? {} : { active: artifactRecordFromInstalled(restored) }),
        lastActivation: restored === undefined || !fileChanges ? "failed" : "rolled_back",
        lastError: {
          code: activationError.code,
          message: activationError.message,
          at: this.now(),
        },
        updatedAt: this.now(),
      };
      await writeFqgateState(this.layout, state);
      await removeFile(previousBackup);
      await removeFile(this.layout.transactionFile);
      if (restored === undefined) {
        this.logger.error("FQGate activation failed without a known-good rollback executable", {
          code: activationError.code,
        });
      } else {
        this.logger.warn("FQGate activation rolled back", { code: activationError.code });
      }
      return { success: true, restored: restored !== undefined };
    } catch (error) {
      failure = error;
    }

    const rollbackError = toBridgeError(
      failure,
      ERROR_CODES.ROLLBACK_FAILED,
      "FQGate rollback failed",
    );
    try {
      const state = await readFqgateState(this.layout);
      await writeFqgateState(this.layout, {
        ...state,
        lastActivation: "rollback_failed",
        lastError: {
          code: rollbackError.code,
          message: rollbackError.message,
          at: this.now(),
        },
        updatedAt: this.now(),
      });
    } catch {
      // Preserve the original rollback failure. The binary layout remains for manual recovery.
    }
    await removeFile(this.layout.transactionFile).catch(() => undefined);
    return {
      success: false,
      error: new BridgeError(
        ERROR_CODES.ROLLBACK_FAILED,
        rollbackError.message,
        {
          activationCode: activationError.code,
          rollbackCode: rollbackError.code,
        },
        { cause: rollbackError },
      ),
    };
  }

  private async stopIfManaged(current: InstalledArtifact | undefined): Promise<void> {
    if (current === undefined) {
      return;
    }
    const process = await this.processController.status(
      this.layout.currentExecutable,
      this.layout.processFile,
    );
    if (process.state === "identity_mismatch") {
      throw new BridgeError(
        ERROR_CODES.PROCESS_IDENTITY_MISMATCH,
        process.reason ?? "managed FQGate process identity mismatch",
      );
    }
    if (process.state === "unknown") {
      throw new BridgeError(
        ERROR_CODES.PROCESS_STOP_FAILED,
        process.reason ?? "managed FQGate process state could not be determined",
      );
    }
    if (process.state === "running" || process.state === "starting") {
      await this.processController.stop(this.layout.currentExecutable, this.layout.processFile, {
        timeoutMs: this.processTimeoutMs,
      });
    }
  }

  private async stopCandidate(): Promise<void> {
    const process = await this.processController.status(
      this.layout.currentExecutable,
      this.layout.processFile,
    );
    if (process.state === "identity_mismatch") {
      throw new BridgeError(
        ERROR_CODES.PROCESS_IDENTITY_MISMATCH,
        process.reason ?? "candidate process identity could not be verified",
      );
    }
    if (process.state === "unknown") {
      throw new BridgeError(
        ERROR_CODES.PROCESS_STOP_FAILED,
        process.reason ?? "candidate process state could not be determined",
      );
    }
    if (process.state === "running" || process.state === "starting") {
      await this.processController.stop(this.layout.currentExecutable, this.layout.processFile, {
        timeoutMs: this.processTimeoutMs,
      });
    }
  }

  private async isKnownGood(current: InstalledArtifact, state: FqgateState): Promise<boolean> {
    if (current.version === undefined || current.compatibility?.validated !== true) {
      return false;
    }
    if (state.active !== undefined && artifactMatches(current, state.active)) {
      return true;
    }

    const process = await this.processController.status(
      this.layout.currentExecutable,
      this.layout.processFile,
    );
    if (process.state !== "running") {
      return false;
    }
    return isActivationHealthy(await this.healthProbe.probe());
  }

  private async inspectArtifact(filePath: string): Promise<InstalledArtifact | undefined> {
    if (!(await pathExists(filePath))) {
      return undefined;
    }

    const digest = await sha256File(filePath);
    let validation: CandidateInspection | undefined;
    let validationError: string | undefined;
    try {
      validation = await this.candidateValidator.inspect(filePath);
    } catch (error) {
      validationError = error instanceof Error ? error.message : String(error);
    }

    return {
      path: filePath,
      size: digest.size,
      sha256: digest.sha256,
      ...(validation === undefined
        ? {}
        : { version: validation.version, compatibility: validation.compatibility }),
      ...(validationError === undefined ? {} : { validationError }),
    };
  }

  private async requireActivatableCurrent(): Promise<InstalledArtifact> {
    const installed = await this.inspectArtifact(this.layout.currentExecutable);
    if (installed === undefined) {
      throw new BridgeError(
        ERROR_CODES.NOT_INSTALLED,
        "FQGate is not installed in the managed directory",
      );
    }
    if (installed.version === undefined || installed.compatibility?.validated !== true) {
      throw new BridgeError(
        ERROR_CODES.VERSION_INCOMPATIBLE,
        installed.validationError ?? "Managed FQGate executable is not compatible",
      );
    }
    return installed;
  }

  private async ensureLayoutAndLock(action: () => Promise<void>): Promise<void> {
    await ensureLayout(this.layout);
    const lock = await acquireLock(this.layout.lockFile);
    try {
      await action();
    } finally {
      await lock.close();
      await removeFile(this.layout.lockFile);
    }
  }
}

async function ensureInstallablePlan(plan: ReleasePlan): Promise<void> {
  if (plan.action !== "install" && plan.action !== "update") {
    throw new BridgeError(
      ERROR_CODES.ACTIVATION_FAILED,
      `Plan cannot be activated: ${plan.reason}`,
    );
  }
  if (!plan.compatibility.validated) {
    throw new BridgeError(
      ERROR_CODES.VERSION_INCOMPATIBLE,
      `FQGate ${plan.release.version} is not approved for activation`,
    );
  }
}

async function acquireLock(lockPath: string): Promise<Awaited<ReturnType<typeof open>>> {
  try {
    return await open(lockPath, "wx");
  } catch (error) {
    throw new BridgeError(
      ERROR_CODES.ACTIVATION_FAILED,
      "Another FQGate install/update transaction is already in progress",
      undefined,
      { cause: error },
    );
  }
}

async function ensureLayout(layout: FqgateLayout): Promise<void> {
  await ensureFqgateLayout(layout);
}

function artifactRecordFromInstalled(artifact: InstalledArtifact): ArtifactRecord {
  return {
    version: artifact.version ?? "unknown",
    fileName: basename(artifact.path),
    size: artifact.size,
    sha256: artifact.sha256,
  };
}

function toArtifactRecord(validation: CandidateValidation, staged: StagedArtifact): ArtifactRecord {
  return {
    version: validation.version,
    fileName: staged.fileName,
    size: staged.size,
    sha256: staged.sha256,
  };
}

function artifactMatches(artifact: InstalledArtifact, record: ArtifactRecord): boolean {
  return (
    artifact.sha256 === record.sha256 &&
    artifact.size === record.size &&
    artifact.version === record.version
  );
}

function sameInstalledArtifact(
  planned: InstalledArtifact | undefined,
  current: InstalledArtifact | undefined,
): boolean {
  if (planned === undefined || current === undefined) {
    return planned === current;
  }
  return (
    planned.sha256 === current.sha256 &&
    planned.size === current.size &&
    planned.version === current.version &&
    planned.validationError === current.validationError
  );
}
