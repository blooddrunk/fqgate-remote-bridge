import type { CompatibilityEvaluation } from "../fqgate/compatibility/policy.js";
import type { FqgateLifecycleManager, FqgateStatus } from "../fqgate/install/lifecycle.js";
import type { HealthObservation } from "../fqgate/health/types.js";
import { BridgeError, ERROR_CODES, isBridgeError } from "../shared/errors.js";
import type { BuildInfo } from "../shared/build-info.js";
import {
  type BridgeOpenApiCatalogResponse,
  type BridgeCapabilitiesResponse,
  type BridgeStatusResponse,
  type BridgeVersionResponse,
  type QrBeginResponse,
  type QrPollResponse,
  type BridgeUpdateStatusResponse,
  type UpdateApplyConfirmationResponse,
  normalizeCompatibility,
} from "./contracts.js";
import { AdminConfirmationService, bindingForAdminPlan } from "./admin/confirmation.js";
import { QR_FLOW_TTL_MS, type FqgateQrAdapter, type QrPollUpstreamResult } from "./qr/adapter.js";
import type { QrFlowRegistry, StoredQrFlow } from "./qr/registry.js";
import { Redactor } from "../shared/redaction.js";
import type { FqgateOpenApiServicePort } from "../fqgate/openapi/service.js";
import type { FqgateUpdateServicePort } from "../fqgate/update/service.js";
import {
  listBridgeOperations,
  listRequiredFqgateContracts,
  type BridgeOperationPolicy,
} from "./policy/registry.js";
import type { BridgeRequestContext, HumanBridgePrincipal } from "./policy/request-context.js";

export interface LifecycleStatusReader {
  status(): Promise<FqgateStatus>;
}

export interface BridgeServiceOptions {
  readonly buildInfo: BuildInfo;
  readonly lifecycle: LifecycleStatusReader | FqgateLifecycleManager;
  readonly qrAdapter: FqgateQrAdapter;
  readonly qrRegistry: QrFlowRegistry;
  readonly updateService?: FqgateUpdateServicePort;
  readonly openApiService?: FqgateOpenApiServicePort;
  readonly adminConfirmations?: AdminConfirmationService;
  readonly now?: () => string;
}

export class BridgeService {
  private readonly buildInfo: BuildInfo;
  private readonly lifecycle: LifecycleStatusReader;
  private readonly qrAdapter: FqgateQrAdapter;
  private readonly qrRegistry: QrFlowRegistry;
  private readonly updateService: FqgateUpdateServicePort | undefined;
  private readonly openApiService: FqgateOpenApiServicePort | undefined;
  private readonly adminConfirmations: AdminConfirmationService;
  private readonly now: () => string;
  private readonly redactor = new Redactor();

  constructor(options: BridgeServiceOptions) {
    this.buildInfo = options.buildInfo;
    this.lifecycle = options.lifecycle;
    this.qrAdapter = options.qrAdapter;
    this.qrRegistry = options.qrRegistry;
    this.updateService = options.updateService;
    this.openApiService = options.openApiService;
    this.adminConfirmations = options.adminConfirmations ?? new AdminConfirmationService();
    this.now = options.now ?? (() => new Date().toISOString());
  }

  version(): BridgeVersionResponse {
    return { ...this.buildInfo };
  }

  async capabilities(context: BridgeRequestContext = "local"): Promise<BridgeCapabilitiesResponse> {
    const status = await this.lifecycle.status();
    const compatibility = normalizeCompatibility(status);
    return {
      apiVersion: "v1",
      requestContext: context,
      capabilities: { status: true, qrLogin: compatibility.validated },
      fqgate: {
        version: status.installed?.version ?? null,
        compatibility,
      },
    };
  }

  async status(): Promise<BridgeStatusResponse> {
    const checkedAt = this.now();
    const status = await this.lifecycle.status();
    return normalizeBridgeStatus(this.buildInfo, checkedAt, status);
  }

  async beginQr(): Promise<QrBeginResponse> {
    const status = await this.lifecycle.status();
    assertQrReady(status);
    const upstream = await this.qrAdapter.begin();
    const flow = this.qrRegistry.create(upstream.flowId, { replaceExisting: true });
    return {
      sessionId: flow.sessionId,
      qr: {
        mediaType: upstream.mediaType,
        imageBase64: upstream.imageBase64,
      },
      status: upstream.status,
      createdAt: new Date(flow.createdAtMs).toISOString(),
      expiresAt: new Date(flow.expiresAtMs).toISOString(),
    };
  }

  async pollQr(sessionId: string): Promise<QrPollResponse> {
    const lookup = this.qrRegistry.resolve(sessionId);
    if (lookup.kind === "missing") {
      throw new BridgeError(
        ERROR_CODES.QR_FLOW_INVALID,
        "The QR session is invalid or no longer available",
      );
    }
    if (lookup.kind === "terminal") {
      throw terminalFlowError(lookup.state);
    }

    const status = await this.lifecycle.status();
    assertQrReady(status);

    try {
      const result = await this.qrAdapter.poll(lookup.flow.flowId);
      return this.completePoll(sessionId, lookup.flow, result);
    } catch (error) {
      if (isBridgeError(error) && isTerminalErrorCode(error.code)) {
        this.qrRegistry.terminate(
          sessionId,
          error.code === ERROR_CODES.QR_FLOW_EXPIRED ? "expired" : "replaced",
        );
      }
      throw error;
    }
  }

  async updateStatus(): Promise<BridgeUpdateStatusResponse> {
    return this.requireUpdateService().getStatus();
  }

  async checkForUpdate(): Promise<BridgeUpdateStatusResponse> {
    return this.requireUpdateService().checkForUpdate();
  }

  async planInstallOrUpdate(): Promise<BridgeUpdateStatusResponse> {
    return this.requireUpdateService().planInstallOrUpdate();
  }

  async applyUpdate(planId: string): Promise<BridgeUpdateStatusResponse> {
    return this.requireUpdateService().applyConfirmed(planId);
  }

  async prepareAdminUpdateApply(
    planId: string,
    principal: HumanBridgePrincipal,
  ): Promise<UpdateApplyConfirmationResponse> {
    const status = await this.requireUpdateService().getStatus();
    const plan = requireActivatablePlan(status.plan, planId);
    return this.adminConfirmations.issue(bindingForAdminPlan(principal, plan));
  }

  async applyAdminUpdate(
    planId: string,
    confirmationGrant: string,
    principal: HumanBridgePrincipal,
  ): Promise<BridgeUpdateStatusResponse> {
    const updateService = this.requireUpdateService();
    const status = await updateService.getStatus();
    const plan = requireActivatablePlan(status.plan, planId);
    this.adminConfirmations.consume(confirmationGrant, bindingForAdminPlan(principal, plan));
    return updateService.applyConfirmed(planId);
  }

  async openApiCatalog(refresh = false): Promise<BridgeOpenApiCatalogResponse> {
    const service = this.requireOpenApiService();
    if (refresh) {
      await service.refresh();
    }
    return service.catalog(
      listBridgeOperations().map(toCatalogOperation),
      listRequiredFqgateContracts(),
    );
  }

  private requireUpdateService(): FqgateUpdateServicePort {
    if (this.updateService === undefined) {
      throw new BridgeError(ERROR_CODES.BRIDGE_NOT_READY, "The update service is not available");
    }
    return this.updateService;
  }

  private requireOpenApiService(): FqgateOpenApiServicePort {
    if (this.openApiService === undefined) {
      throw new BridgeError(
        ERROR_CODES.BRIDGE_NOT_READY,
        "The runtime OpenAPI service is not available",
      );
    }
    return this.openApiService;
  }

  private completePoll(
    sessionId: string,
    flow: StoredQrFlow,
    result: QrPollUpstreamResult,
  ): QrPollResponse {
    if (result.status === "connected") {
      this.qrRegistry.terminate(sessionId, "connected");
      return {
        sessionId,
        status: "connected",
        connected: true,
        ...(result.loginMethod === undefined
          ? {}
          : { loginMethod: redactBounded(result.loginMethod, this.redactor) }),
      };
    }
    return {
      sessionId,
      status: result.status,
      connected: false,
      expiresAt: new Date(flow.expiresAtMs).toISOString(),
    };
  }
}

function requireActivatablePlan(
  plan: BridgeUpdateStatusResponse["plan"],
  planId: string,
): NonNullable<BridgeUpdateStatusResponse["plan"]> {
  if (
    plan === undefined ||
    plan.planId !== planId ||
    (plan.action !== "install" && plan.action !== "update")
  ) {
    throw new BridgeError(
      ERROR_CODES.UPDATE_CONFIRMATION_STALE,
      "The FQGate update plan is stale or not activatable",
    );
  }
  return plan;
}

function toCatalogOperation(operation: BridgeOperationPolicy) {
  return {
    id: operation.id,
    method: operation.method,
    path: operation.path,
    classification: operation.classification,
    intent: operation.intent,
    allowedContexts: operation.allowedContexts,
    requiresConfirmation: operation.requiresConfirmation,
    requiredCompatibility: operation.requiredCompatibility,
    documentationVisible: operation.documentationVisible,
    ...(operation.upstream === undefined ? {} : { upstream: operation.upstream }),
  };
}

function assertQrReady(status: FqgateStatus): void {
  if (status.installed === undefined) {
    throw new BridgeError(ERROR_CODES.FQGATE_NOT_INSTALLED, "FQGate is not installed");
  }
  const compatibility = status.compatibility ?? status.installed.compatibility;
  if (compatibility?.validated !== true) {
    throw new BridgeError(
      ERROR_CODES.FQGATE_INCOMPATIBLE,
      "The active FQGate version is not validated for QR login",
    );
  }
  if (status.process.state !== "running") {
    throw new BridgeError(ERROR_CODES.FQGATE_NOT_RUNNING, "FQGate is not running");
  }
  if (!status.health.available || !status.health.validPayload) {
    throw new BridgeError(ERROR_CODES.FQGATE_UNHEALTHY, "FQGate health is not available");
  }
}

function normalizeBridgeStatus(
  buildInfo: BuildInfo,
  checkedAt: string,
  status: FqgateStatus,
): BridgeStatusResponse {
  const health = normalizeHealth(status.health);
  const compatibility = normalizeCompatibility(status);
  const process = {
    state: status.process.state,
    running: status.process.state === "running",
    ...(status.process.pid === undefined ? {} : { pid: status.process.pid }),
  };
  return {
    bridge: { state: "ready", version: buildInfo.version, checkedAt },
    fqgate: {
      lifecycle: status.lifecycle,
      process,
      version: status.installed?.version ?? null,
      compatibility,
      health,
    },
    session: {
      state: health.session,
      loginMethod: health.loginMethod,
    },
    lastCheckedAt: status.health.checkedAt,
  };
}

function normalizeHealth(observation: HealthObservation) {
  return {
    available: observation.available,
    validPayload: observation.validPayload,
    httpStatus: observation.httpStatus ?? null,
    networkReady: observation.networkReady,
    connected: observation.connected,
    session: observation.session,
    status: optionalBounded(observation.status),
    loginMethod: optionalBounded(observation.loginMethod),
    level2Permission: observation.level2Permission,
    reason: optionalBounded(observation.reason),
    activeSubscriptions: observation.activeSubscriptions ?? null,
  };
}

function optionalBounded(value: string | undefined): string | null {
  if (value === undefined) return null;
  return redactBounded(value, new Redactor());
}

function redactBounded(value: string, redactor: Redactor): string {
  const redacted = redactor.redact(value);
  return (typeof redacted === "string" ? redacted : "[REDACTED]").slice(0, 256);
}

function isTerminalErrorCode(code: string): boolean {
  return code === ERROR_CODES.QR_FLOW_EXPIRED || code === ERROR_CODES.QR_FLOW_REPLACED;
}

function terminalFlowError(state: "expired" | "replaced" | "connected"): BridgeError {
  if (state === "expired") {
    return new BridgeError(
      ERROR_CODES.QR_FLOW_EXPIRED,
      "The QR login flow expired. Start a new flow.",
    );
  }
  if (state === "replaced") {
    return new BridgeError(
      ERROR_CODES.QR_FLOW_REPLACED,
      "The QR login flow was replaced. Start a new flow.",
    );
  }
  return new BridgeError(ERROR_CODES.QR_FLOW_INVALID, "The QR login flow has already completed");
}

export function qrFlowTtlSeconds(): number {
  return Math.ceil(QR_FLOW_TTL_MS / 1_000);
}

export function compatibilityFromStatus(status: FqgateStatus): CompatibilityEvaluation | undefined {
  return status.compatibility ?? status.installed?.compatibility;
}
