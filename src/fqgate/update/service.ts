import { randomUUID } from "node:crypto";
import type { CompatibilityEvaluation } from "../compatibility/policy.js";
import type { FqgateStatus, ReleasePlan } from "../install/lifecycle.js";
import { BridgeError, ERROR_CODES, toBridgeError } from "../../shared/errors.js";
import { fingerprintJson } from "../openapi/catalog.js";

export type ReleaseSourceId = "github";
export type UpdateTransactionState = "idle" | "applying" | "succeeded" | "failed" | "rolled_back";
export type UpdateCheckResult = "no_update" | "available" | "blocked" | "failed";

export interface UpdatePlanView {
  readonly planId: string;
  readonly candidateId: string;
  readonly createdAt: string;
  readonly source: ReleaseSourceId;
  readonly installedVersion: string | null;
  readonly targetVersion: string;
  readonly action: ReleasePlan["action"];
  readonly reason: string;
  readonly compatibility: CompatibilityEvaluation;
  readonly package: {
    readonly fileName: string;
    readonly size: number;
    readonly sha256: string;
  };
  readonly releaseNotes: readonly string[];
  readonly restartRequired: boolean;
}

export interface UpdateCheckRecord {
  readonly checkedAt: string;
  readonly result: UpdateCheckResult;
  readonly planId?: string;
  readonly targetVersion?: string;
  readonly message?: string;
}

export interface UpdateTransactionView {
  readonly state: UpdateTransactionState;
  readonly transactionId?: string;
  readonly startedAt?: string;
  readonly completedAt?: string;
  readonly targetVersion?: string;
  readonly errorCode?: string;
  readonly message?: string;
}

export interface UpdateResultView {
  readonly completedAt: string;
  readonly outcome: "installed" | "updated" | "noop" | "failed" | "rolled_back";
  readonly targetVersion: string;
  readonly errorCode?: string;
  readonly message?: string;
}

export interface UpdateStatusView {
  readonly releaseSource: {
    readonly id: ReleaseSourceId;
    readonly label: string;
  };
  readonly lifecycle: FqgateStatus["lifecycle"];
  readonly installedVersion: string | null;
  readonly compatibility: CompatibilityEvaluation | undefined;
  readonly lastCheck?: UpdateCheckRecord;
  readonly plan?: UpdatePlanView;
  readonly transaction: UpdateTransactionView;
  readonly lastResult?: UpdateResultView;
}

interface StoredPlan {
  readonly raw: ReleasePlan;
  readonly view: UpdatePlanView;
}

export interface FqgateUpdateServiceDependencies {
  readonly lifecycle: UpdateLifecyclePort;
  readonly now?: () => string;
  readonly idFactory?: () => string;
}

export interface UpdateLifecyclePort {
  plan(): Promise<ReleasePlan>;
  installPlan(
    plan: ReleasePlan,
    options?: { readonly dryRun?: boolean },
  ): Promise<{
    readonly plan: ReleasePlan;
    readonly action: "installed" | "updated" | "noop" | "planned";
  }>;
  status(): Promise<FqgateStatus>;
}

export interface FqgateUpdateServicePort {
  getStatus(): Promise<UpdateStatusView>;
  checkForUpdate(): Promise<UpdateStatusView>;
  planInstallOrUpdate(): Promise<UpdateStatusView>;
  applyConfirmed(planId: string): Promise<UpdateStatusView>;
}

export class FqgateUpdateService implements FqgateUpdateServicePort {
  private readonly lifecycle: UpdateLifecyclePort;
  private readonly now: () => string;
  private readonly idFactory: () => string;
  private currentPlan: StoredPlan | undefined;
  private lastCheck: UpdateCheckRecord | undefined;
  private lastResult: UpdateResultView | undefined;
  private transaction: UpdateTransactionView = { state: "idle" };
  private mutationActive = false;

  constructor(dependencies: FqgateUpdateServiceDependencies) {
    this.lifecycle = dependencies.lifecycle;
    this.now = dependencies.now ?? (() => new Date().toISOString());
    this.idFactory = dependencies.idFactory ?? randomUUID;
  }

  async getStatus(): Promise<UpdateStatusView> {
    const lifecycle = await this.lifecycle.status();
    return {
      releaseSource: {
        id: "github",
        label: "GitHub · zhuyifang/fqgate-releases（固定可信源）",
      },
      lifecycle: lifecycle.lifecycle,
      installedVersion: lifecycle.installed?.version ?? null,
      compatibility: lifecycle.compatibility ?? lifecycle.installed?.compatibility,
      ...(this.lastCheck === undefined ? {} : { lastCheck: this.lastCheck }),
      ...(this.currentPlan === undefined ? {} : { plan: this.currentPlan.view }),
      transaction: this.transaction,
      ...(this.lastResult === undefined ? {} : { lastResult: this.lastResult }),
    };
  }

  async checkForUpdate(): Promise<UpdateStatusView> {
    return this.createPlan("check");
  }

  async planInstallOrUpdate(): Promise<UpdateStatusView> {
    return this.createPlan("preview");
  }

  async applyConfirmed(planId: string): Promise<UpdateStatusView> {
    assertPlanId(planId);
    if (this.mutationActive) {
      throw new BridgeError(
        ERROR_CODES.UPDATE_IN_PROGRESS,
        "Another FQGate update transaction is already in progress",
      );
    }
    const stored = this.currentPlan;
    if (stored === undefined || stored.view.planId !== planId) {
      throw new BridgeError(
        ERROR_CODES.UPDATE_CONFIRMATION_STALE,
        "The FQGate update plan is stale; check for updates again",
      );
    }
    if (stored.raw.action !== "install" && stored.raw.action !== "update") {
      throw new BridgeError(
        ERROR_CODES.UPDATE_CONFIRMATION_STALE,
        "The selected FQGate plan is not activatable",
      );
    }

    this.mutationActive = true;
    const transactionId = this.idFactory();
    const startedAt = this.now();
    this.transaction = {
      state: "applying",
      transactionId,
      startedAt,
      targetVersion: stored.view.targetVersion,
    };

    try {
      const fresh = await this.lifecycle.plan();
      const freshView = toPlanView(fresh, this.now());
      if (freshView.planId !== stored.view.planId) {
        throw new BridgeError(
          ERROR_CODES.UPDATE_CONFIRMATION_STALE,
          "The FQGate release changed after the preview; check for updates again",
        );
      }

      const result = await this.lifecycle.installPlan(stored.raw);
      const outcome = result.action === "planned" ? "failed" : result.action;
      const completedAt = this.now();
      this.transaction = {
        state: "succeeded",
        transactionId,
        startedAt,
        completedAt,
        targetVersion: stored.view.targetVersion,
      };
      this.lastResult = {
        completedAt,
        outcome,
        targetVersion: stored.view.targetVersion,
      };
      this.currentPlan = undefined;
      return this.getStatus();
    } catch (error) {
      const bridgeError = toBridgeError(
        error,
        ERROR_CODES.ACTIVATION_FAILED,
        "FQGate update failed",
      );
      if (bridgeError.code === ERROR_CODES.UPDATE_CONFIRMATION_STALE) {
        this.transaction = { state: "idle" };
        throw bridgeError;
      }
      const rolledBack = bridgeError.details?.rollbackRestored === true;
      const completedAt = this.now();
      this.transaction = {
        state: rolledBack ? "rolled_back" : "failed",
        transactionId,
        startedAt,
        completedAt,
        targetVersion: stored.view.targetVersion,
        errorCode: bridgeError.code,
        message: safeMessage(bridgeError.message),
      };
      this.lastResult = {
        completedAt,
        outcome: rolledBack ? "rolled_back" : "failed",
        targetVersion: stored.view.targetVersion,
        errorCode: bridgeError.code,
        message: safeMessage(bridgeError.message),
      };
      throw bridgeError;
    } finally {
      this.mutationActive = false;
    }
  }

  private async createPlan(kind: "check" | "preview"): Promise<UpdateStatusView> {
    if (this.mutationActive) {
      throw new BridgeError(
        ERROR_CODES.UPDATE_IN_PROGRESS,
        "An FQGate update transaction is already in progress",
      );
    }

    const checkedAt = this.now();
    try {
      const raw = await this.lifecycle.plan();
      const view = toPlanView(raw, checkedAt);
      this.currentPlan = { raw, view };
      const result: UpdateCheckResult =
        raw.action === "noop" ? "no_update" : raw.action === "blocked" ? "blocked" : "available";
      this.lastCheck = {
        checkedAt,
        result,
        planId: view.planId,
        targetVersion: view.targetVersion,
        ...(kind === "preview" ? { message: "已生成可供确认的安装计划" } : {}),
      };
      return this.getStatus();
    } catch (error) {
      const bridgeError = toBridgeError(
        error,
        ERROR_CODES.MANIFEST_FETCH_FAILED,
        "Unable to check the trusted FQGate release source",
      );
      this.currentPlan = undefined;
      this.lastCheck = {
        checkedAt,
        result: "failed",
        message: safeMessage(bridgeError.message),
      };
      throw bridgeError;
    }
  }
}

function toPlanView(plan: ReleasePlan, createdAt: string): UpdatePlanView {
  const candidateInput = {
    source: "github",
    version: plan.release.version,
    fileName: plan.package.fileName,
    size: plan.package.size,
    sha256: plan.package.sha256,
    assetUrl: plan.package.assetUrl,
  };
  const candidateId = `candidate-${fingerprintJson(candidateInput).slice(0, 32)}`;
  const planId = `plan-${fingerprintJson({
    ...candidateInput,
    action: plan.action,
    installedVersion: plan.current?.version ?? null,
    installedSha256: plan.current?.sha256 ?? null,
    compatibility: plan.compatibility,
  }).slice(0, 32)}`;
  return {
    planId,
    candidateId,
    createdAt,
    source: "github",
    installedVersion: plan.current?.version ?? null,
    targetVersion: plan.release.version,
    action: plan.action,
    reason: safeMessage(plan.reason),
    compatibility: plan.compatibility,
    package: {
      fileName: plan.package.fileName,
      size: plan.package.size,
      sha256: plan.package.sha256,
    },
    releaseNotes: plan.release.releaseNotes.slice(0, 20).map((note) => note.slice(0, 512)),
    restartRequired: plan.action === "install" || plan.action === "update",
  };
}

function assertPlanId(value: string): void {
  if (!/^plan-[a-f0-9]{32}$/.test(value)) {
    throw new BridgeError(ERROR_CODES.REQUEST_INVALID, "planId is invalid");
  }
}

function safeMessage(value: string): string {
  return value.replaceAll(/(https?:\/\/[^\s]+)/gi, "[URL]").slice(0, 512);
}
