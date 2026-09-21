import { BridgeError, ERROR_CODES } from "../../shared/errors.js";
import type {
  CandidateQualificationProbe,
  OperationQualificationEvidence,
} from "../compatibility/evidence.js";
import { decodeFqgateResponseEnvelope } from "../http/envelope.js";
import { decodeResponseText, type HttpTransport } from "../release/http.js";
import {
  assertLookupContractApproved,
  assertLookupQualification,
  LOOKUP_OPERATION_ID,
  lookupQualificationEvidence,
} from "./compatibility.js";
import { fetchLookupContract, LOOKUP_UPSTREAM_PATH } from "./contract.js";

export { LOOKUP_CONTRACT_FINGERPRINT } from "./compatibility.js";

export const LOOKUP_MAX_ITEMS = 16;
export const LOOKUP_MAX_BYTES = 65_536;

export interface InstrumentLookupRequest {
  readonly code: string;
}

export interface Instrument {
  readonly code: string;
  readonly market: string;
  readonly name: string;
  readonly instrumentId: string;
}

export interface InstrumentLookupResponse {
  readonly items: readonly Instrument[];
}

export interface LookupRuntime {
  readonly version: string | undefined;
  /** The global supported-range decision; it is not operation authorization. */
  readonly supported: boolean;
  /** The active artifact passed its bounded candidate qualification gate. */
  readonly validated: boolean;
  /** Qualification evidence bound to the active artifact, by operation. */
  readonly operationEvidence: readonly OperationQualificationEvidence[];
  readonly running: boolean;
}

export interface InstrumentLookupPort {
  lookup(input: unknown): Promise<InstrumentLookupResponse>;
}

export function parseInstrumentLookupRequest(value: unknown): InstrumentLookupRequest {
  if (
    !isRecord(value) ||
    Object.keys(value).length !== 1 ||
    typeof value.code !== "string" ||
    value.code.length !== 6 ||
    !/^[0-9]{6}$/.test(value.code)
  ) {
    throw new BridgeError(
      ERROR_CODES.REQUEST_INVALID,
      "Instrument lookup requires exactly one six-digit code",
    );
  }
  return { code: value.code };
}

export class FqgateInstrumentLookup implements InstrumentLookupPort {
  constructor(
    private readonly options: {
      readonly http: HttpTransport;
      readonly runtime: () => Promise<LookupRuntime>;
      readonly contract?: () => Promise<string>;
    },
  ) {}

  async lookup(input: unknown): Promise<InstrumentLookupResponse> {
    const request = parseInstrumentLookupRequest(input);
    const runtime = await this.options.runtime();
    assertRuntime(runtime, true);
    const fingerprint = await this.approvedContractFingerprint();
    assertLookupQualification(runtime.operationEvidence, fingerprint);
    return this.query(request);
  }

  /**
   * Return the fixed, bounded candidate probe used by the quarantine gate.
   * The probe deliberately uses a reviewed exact code and returns only
   * non-secret compatibility metadata.
   */
  createQualificationProbe(): CandidateQualificationProbe {
    return {
      operationId: LOOKUP_OPERATION_ID,
      run: async () => this.runSemanticProbe(),
    };
  }

  private async runSemanticProbe(): Promise<OperationQualificationEvidence> {
    const runtime = await this.options.runtime();
    assertRuntime(runtime, false);
    const fingerprint = await this.approvedContractFingerprint();
    const result = await this.query({ code: "600000" });
    if (result.items.length === 0) {
      throw new BridgeError(
        ERROR_CODES.COMPATIBILITY_PROBE_FAILED,
        "Instrument lookup semantic qualification returned no exact result",
      );
    }
    return lookupQualificationEvidence(fingerprint);
  }

  private async approvedContractFingerprint(): Promise<string> {
    const fingerprint = await (this.options.contract?.() ?? fetchLookupContract(this.options.http));
    assertLookupContractApproved(fingerprint);
    return fingerprint;
  }

  private async query(request: InstrumentLookupRequest): Promise<InstrumentLookupResponse> {
    let response;
    try {
      response = await this.options.http.request(`http://127.0.0.1:17281${LOOKUP_UPSTREAM_PATH}`, {
        method: "POST",
        redirect: "error",
        timeoutMs: 5_000,
        maxBytes: LOOKUP_MAX_BYTES,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pattern: request.code }),
      });
    } catch {
      throw new BridgeError(ERROR_CODES.UPSTREAM_UNAVAILABLE, "Instrument lookup is unavailable");
    }
    if (response.body.byteLength > LOOKUP_MAX_BYTES) throw invalidResponse();
    let value: unknown;
    try {
      value = JSON.parse(decodeResponseText(response)) as unknown;
    } catch {
      throw invalidResponse();
    }
    if (isRecord(value) && Number.isSafeInteger(value.code) && value.code !== 0) {
      // Classify known semantic states without returning or logging the upstream message.
      const message = typeof value.message === "string" ? value.message.slice(0, 512) : "";
      if (/login|登录|登陆|not connected/i.test(message))
        throw new BridgeError(ERROR_CODES.LOGIN_REQUIRED, "Local FQGate login is required");
      if (value.code === 3006)
        throw new BridgeError(
          ERROR_CODES.MARKET_PERMISSION_REQUIRED,
          "Market permission is required",
        );
      throw new BridgeError(ERROR_CODES.UPSTREAM_UNAVAILABLE, "Instrument lookup is unavailable");
    }
    if (response.status !== 200)
      throw new BridgeError(ERROR_CODES.UPSTREAM_UNAVAILABLE, "Instrument lookup is unavailable");
    let data: unknown;
    try {
      data = decodeFqgateResponseEnvelope(value).data;
    } catch {
      throw invalidResponse();
    }
    if (
      !isRecord(data) ||
      !Array.isArray(data.items) ||
      data.items.length > LOOKUP_MAX_ITEMS ||
      data.item_count !== data.items.length
    )
      throw invalidResponse();
    const items = data.items.map((item: unknown): Instrument => {
      if (
        !isRecord(item) ||
        !boundedString(item.code, 16) ||
        !/^[A-Za-z0-9]{1,16}$/.test(item.code) ||
        !boundedString(item.market, 16) ||
        !/^[A-Za-z0-9_]{1,16}$/.test(item.market) ||
        !boundedString(item.name, 128) ||
        !boundedString(item.ths_code, 32) ||
        !/^[A-Za-z0-9_.-]{1,32}$/.test(item.ths_code)
      )
        throw invalidResponse();
      return { code: item.code, market: item.market, name: item.name, instrumentId: item.ths_code };
    });
    // Search may contain related matches. Only exact requested codes are public.
    return { items: items.filter((item) => item.code === request.code) };
  }
}

function assertRuntime(runtime: LookupRuntime, requireValidated: boolean): void {
  if (!runtime.supported || (requireValidated && !runtime.validated)) {
    throw new BridgeError(
      ERROR_CODES.FQGATE_INCOMPATIBLE,
      "Instrument lookup requires a supported and qualified FQGate runtime",
    );
  }
  if (!runtime.running)
    throw new BridgeError(ERROR_CODES.FQGATE_NOT_RUNNING, "FQGate is not running");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function boundedString(value: unknown, max: number): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= max &&
    !/[\p{Cc}\p{Cf}]/u.test(value)
  );
}

function invalidResponse(): BridgeError {
  return new BridgeError(
    ERROR_CODES.UPSTREAM_RESPONSE_INVALID,
    "Instrument lookup response is invalid",
  );
}
