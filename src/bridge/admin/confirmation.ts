import { randomBytes } from "node:crypto";
import { BridgeError, ERROR_CODES } from "../../shared/errors.js";
import type { HumanBridgePrincipal } from "../policy/request-context.js";

export const ADMIN_CONFIRMATION_OPERATION = "updates.apply" as const;
export const DEFAULT_ADMIN_CONFIRMATION_TTL_MS = 60_000;
export const MAX_ADMIN_CONFIRMATION_TTL_MS = 5 * 60_000;
export const DEFAULT_ADMIN_CONFIRMATION_LIMIT = 64;

export interface AdminConfirmationBinding {
  readonly principalSubject: string;
  readonly adminAudience: string;
  readonly operationId: typeof ADMIN_CONFIRMATION_OPERATION;
  readonly planId: string;
  readonly candidateId: string;
  readonly source: string;
  readonly targetVersion: string;
  readonly packageSize: number;
  readonly packageSha256: string;
}

export interface AdminConfirmationGrant {
  readonly confirmationGrant: string;
  readonly operationId: typeof ADMIN_CONFIRMATION_OPERATION;
  readonly planId: string;
  readonly candidateId: string;
  readonly expiresAt: string;
}

interface StoredConfirmation {
  readonly binding: AdminConfirmationBinding;
  readonly expiresAtMs: number;
}

export interface AdminConfirmationServiceOptions {
  readonly nowMs?: () => number;
  readonly idFactory?: () => string;
  readonly ttlMs?: number;
  readonly maxEntries?: number;
}

/**
 * Process-local, one-time grants for the remote administrator apply step.
 * The map is intentionally never serialized or injected into a logger. A new
 * service instance therefore invalidates every outstanding grant.
 */
export class AdminConfirmationService {
  private readonly nowMs: () => number;
  private readonly idFactory: () => string;
  private readonly ttlMs: number;
  private readonly maxEntries: number;
  private readonly grants = new Map<string, StoredConfirmation>();

  constructor(options: AdminConfirmationServiceOptions = {}) {
    this.nowMs = options.nowMs ?? Date.now;
    this.idFactory = options.idFactory ?? (() => randomBytes(32).toString("base64url"));
    this.ttlMs = boundedTtl(options.ttlMs ?? DEFAULT_ADMIN_CONFIRMATION_TTL_MS);
    this.maxEntries = boundedLimit(options.maxEntries ?? DEFAULT_ADMIN_CONFIRMATION_LIMIT);
  }

  issue(binding: AdminConfirmationBinding): AdminConfirmationGrant {
    if (binding.operationId !== ADMIN_CONFIRMATION_OPERATION) {
      throw new BridgeError(
        ERROR_CODES.ADMIN_CONFIRMATION_INVALID,
        "The administrator confirmation operation is invalid",
      );
    }
    this.cleanupExpired();
    if (this.grants.size >= this.maxEntries) {
      throw new BridgeError(
        ERROR_CODES.ADMIN_CONFIRMATION_LIMIT,
        "Too many administrator confirmations are pending",
      );
    }

    const confirmationGrant = this.idFactory();
    if (!isOpaqueGrant(confirmationGrant)) {
      throw new BridgeError(
        ERROR_CODES.ADMIN_CONFIRMATION_INVALID,
        "The administrator confirmation grant is invalid",
      );
    }
    const expiresAtMs = this.nowMs() + this.ttlMs;
    this.grants.set(confirmationGrant, { binding, expiresAtMs });
    return {
      confirmationGrant,
      operationId: ADMIN_CONFIRMATION_OPERATION,
      planId: binding.planId,
      candidateId: binding.candidateId,
      expiresAt: new Date(expiresAtMs).toISOString(),
    };
  }

  /**
   * Consume synchronously so the delete and binding check cannot be split by
   * an await. Invalid, expired, or mismatched attempts invalidate the opaque
   * grant as well; no caller can probe a grant and then reuse it.
   */
  consume(confirmationGrant: string, binding: AdminConfirmationBinding): void {
    if (!isOpaqueGrant(confirmationGrant)) {
      throw new BridgeError(
        ERROR_CODES.ADMIN_CONFIRMATION_INVALID,
        "The administrator confirmation grant is invalid",
      );
    }
    const stored = this.grants.get(confirmationGrant);
    if (stored === undefined) {
      throw new BridgeError(
        ERROR_CODES.ADMIN_CONFIRMATION_INVALID,
        "The administrator confirmation grant is invalid or already used",
      );
    }

    this.grants.delete(confirmationGrant);
    if (stored.expiresAtMs <= this.nowMs()) {
      throw new BridgeError(
        ERROR_CODES.ADMIN_CONFIRMATION_EXPIRED,
        "The administrator confirmation grant has expired",
      );
    }
    if (!sameBinding(stored.binding, binding)) {
      throw new BridgeError(
        ERROR_CODES.ADMIN_CONFIRMATION_MISMATCH,
        "The administrator confirmation does not match the current principal or update plan",
      );
    }
  }

  clear(): void {
    this.grants.clear();
  }

  get size(): number {
    this.cleanupExpired();
    return this.grants.size;
  }

  private cleanupExpired(): void {
    const now = this.nowMs();
    for (const [grant, stored] of this.grants) {
      if (stored.expiresAtMs <= now) this.grants.delete(grant);
    }
  }
}

export function bindingForAdminPlan(
  principal: HumanBridgePrincipal,
  plan: {
    readonly planId: string;
    readonly candidateId: string;
    readonly source: string;
    readonly targetVersion: string;
    readonly package: { readonly size: number; readonly sha256: string };
  },
): AdminConfirmationBinding {
  return {
    principalSubject: principal.subject,
    adminAudience: principal.audience,
    operationId: ADMIN_CONFIRMATION_OPERATION,
    planId: plan.planId,
    candidateId: plan.candidateId,
    source: plan.source,
    targetVersion: plan.targetVersion,
    packageSize: plan.package.size,
    packageSha256: plan.package.sha256,
  };
}

function sameBinding(left: AdminConfirmationBinding, right: AdminConfirmationBinding): boolean {
  return (
    left.principalSubject === right.principalSubject &&
    left.adminAudience === right.adminAudience &&
    left.operationId === right.operationId &&
    left.planId === right.planId &&
    left.candidateId === right.candidateId &&
    left.source === right.source &&
    left.targetVersion === right.targetVersion &&
    left.packageSize === right.packageSize &&
    left.packageSha256 === right.packageSha256
  );
}

function isOpaqueGrant(value: string): boolean {
  return value.length >= 32 && value.length <= 256 && /^[A-Za-z0-9_-]+$/.test(value);
}

function boundedTtl(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1_000 || value > MAX_ADMIN_CONFIRMATION_TTL_MS) {
    throw new BridgeError(
      ERROR_CODES.CONFIG_INVALID,
      "Administrator confirmation TTL is outside the allowed range",
    );
  }
  return value;
}

function boundedLimit(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > 1_024) {
    throw new BridgeError(
      ERROR_CODES.CONFIG_INVALID,
      "Administrator confirmation limit is outside the allowed range",
    );
  }
  return value;
}
