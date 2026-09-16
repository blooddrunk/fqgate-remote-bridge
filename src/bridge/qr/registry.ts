import { randomUUID } from "node:crypto";
import { BridgeError, ERROR_CODES } from "../../shared/errors.js";
import { QR_FLOW_TTL_MS } from "./adapter.js";

export type QrTerminalState = "expired" | "replaced" | "connected";

export interface StoredQrFlow {
  /** Server-only upstream identifier. Never serialize this record to a client. */
  readonly flowId: number;
  readonly sessionId: string;
  readonly createdAtMs: number;
  readonly expiresAtMs: number;
}

interface TerminalFlow {
  readonly state: QrTerminalState;
  readonly expiresAtMs: number;
}

export type QrFlowLookup =
  | { readonly kind: "active"; readonly flow: StoredQrFlow }
  | { readonly kind: "terminal"; readonly state: QrTerminalState }
  | { readonly kind: "missing" };

export interface QrFlowRegistryOptions {
  readonly ttlMs?: number;
  readonly maxActiveFlows?: number;
  readonly maxTerminalFlows?: number;
  readonly terminalRetentionMs?: number;
  readonly nowMs?: () => number;
  readonly idFactory?: () => string;
}

export class QrFlowRegistry {
  private readonly ttlMs: number;
  private readonly maxActiveFlows: number;
  private readonly maxTerminalFlows: number;
  private readonly terminalRetentionMs: number;
  private readonly nowMs: () => number;
  private readonly idFactory: () => string;
  private readonly active = new Map<string, StoredQrFlow>();
  private readonly terminal = new Map<string, TerminalFlow>();

  constructor(options: QrFlowRegistryOptions = {}) {
    this.ttlMs = options.ttlMs ?? QR_FLOW_TTL_MS;
    this.maxActiveFlows = options.maxActiveFlows ?? 3;
    this.maxTerminalFlows = options.maxTerminalFlows ?? Math.max(this.maxActiveFlows * 4, 16);
    this.terminalRetentionMs = options.terminalRetentionMs ?? 30_000;
    this.nowMs = options.nowMs ?? Date.now;
    this.idFactory = options.idFactory ?? randomUUID;

    if (!Number.isSafeInteger(this.ttlMs) || this.ttlMs <= 0) {
      throw new BridgeError(ERROR_CODES.BRIDGE_NOT_READY, "QR flow TTL must be a positive integer");
    }
    if (!Number.isSafeInteger(this.maxActiveFlows) || this.maxActiveFlows <= 0) {
      throw new BridgeError(
        ERROR_CODES.BRIDGE_NOT_READY,
        "QR active-flow limit must be a positive integer",
      );
    }
    if (!Number.isSafeInteger(this.maxTerminalFlows) || this.maxTerminalFlows <= 0) {
      throw new BridgeError(
        ERROR_CODES.BRIDGE_NOT_READY,
        "QR terminal-flow limit must be a positive integer",
      );
    }
    if (!Number.isSafeInteger(this.terminalRetentionMs) || this.terminalRetentionMs < 0) {
      throw new BridgeError(
        ERROR_CODES.BRIDGE_NOT_READY,
        "QR terminal-flow retention must be a non-negative integer",
      );
    }
  }

  create(flowId: number, options: { readonly replaceExisting?: boolean } = {}): StoredQrFlow {
    if (!Number.isSafeInteger(flowId) || flowId <= 0) {
      throw new BridgeError(ERROR_CODES.QR_FLOW_INVALID, "The upstream QR flow is invalid");
    }

    this.cleanup();
    if (options.replaceExisting === true) {
      for (const sessionId of this.active.keys()) {
        this.terminate(sessionId, "replaced");
      }
    }
    if (this.active.size >= this.maxActiveFlows) {
      throw new BridgeError(ERROR_CODES.QR_FLOW_LIMIT, "The QR flow limit has been reached");
    }

    const createdAtMs = this.nowMs();
    const flow: StoredQrFlow = {
      flowId,
      sessionId: this.createUniqueSessionId(),
      createdAtMs,
      expiresAtMs: createdAtMs + this.ttlMs,
    };
    this.active.set(flow.sessionId, flow);
    return flow;
  }

  resolve(sessionId: string): QrFlowLookup {
    this.assertSessionId(sessionId);
    this.cleanup();
    const flow = this.active.get(sessionId);
    if (flow !== undefined) {
      return { kind: "active", flow };
    }
    const terminal = this.terminal.get(sessionId);
    if (terminal !== undefined) {
      return { kind: "terminal", state: terminal.state };
    }
    return { kind: "missing" };
  }

  terminate(sessionId: string, state: QrTerminalState): void {
    this.assertSessionId(sessionId);
    this.active.delete(sessionId);
    this.recordTerminal(sessionId, state, this.nowMs());
  }

  cleanup(): void {
    const now = this.nowMs();
    for (const [sessionId, flow] of this.active) {
      if (flow.expiresAtMs <= now) {
        this.active.delete(sessionId);
        this.recordTerminal(sessionId, "expired", now);
      }
    }
    for (const [sessionId, terminal] of this.terminal) {
      if (terminal.expiresAtMs <= now) {
        this.terminal.delete(sessionId);
      }
    }
  }

  get activeCount(): number {
    this.cleanup();
    return this.active.size;
  }

  get terminalCount(): number {
    this.cleanup();
    return this.terminal.size;
  }

  private createUniqueSessionId(): string {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const sessionId = this.idFactory();
      if (this.isValidSessionId(sessionId) && !this.active.has(sessionId)) {
        return sessionId;
      }
    }
    throw new BridgeError(
      ERROR_CODES.BRIDGE_NOT_READY,
      "Unable to allocate a QR session identifier",
    );
  }

  private recordTerminal(sessionId: string, state: QrTerminalState, now: number): void {
    this.terminal.delete(sessionId);
    this.terminal.set(sessionId, {
      state,
      expiresAtMs: now + this.terminalRetentionMs,
    });
    while (this.terminal.size > this.maxTerminalFlows) {
      const oldest = this.terminal.keys().next().value;
      if (oldest === undefined) return;
      this.terminal.delete(oldest);
    }
  }

  private assertSessionId(sessionId: string): void {
    if (!this.isValidSessionId(sessionId)) {
      throw new BridgeError(ERROR_CODES.QR_FLOW_INVALID, "The QR session is invalid");
    }
  }

  private isValidSessionId(sessionId: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(sessionId);
  }
}
