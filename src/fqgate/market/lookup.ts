import { BridgeError, ERROR_CODES } from "../../shared/errors.js";
import { decodeFqgateResponseEnvelope } from "../http/envelope.js";
import { decodeResponseText, type HttpTransport } from "../release/http.js";
import { fetchLookupContract, LOOKUP_UPSTREAM_PATH } from "./contract.js";

export const LOOKUP_CONTRACT_FINGERPRINT =
  "a0b2bb5b2cdf5ec6e4f22e5a15ef9217bc20b2d4f1cb589fe680fb87d0b39ed5";
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
  readonly validated: boolean;
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
    if (!runtime.validated || runtime.version !== "1.0.1") {
      throw new BridgeError(
        ERROR_CODES.FQGATE_INCOMPATIBLE,
        "Instrument lookup requires the live-validated version",
      );
    }
    if (!runtime.running)
      throw new BridgeError(ERROR_CODES.FQGATE_NOT_RUNNING, "FQGate is not running");
    const fingerprint = await (this.options.contract?.() ?? fetchLookupContract(this.options.http));
    if (fingerprint !== LOOKUP_CONTRACT_FINGERPRINT) {
      throw new BridgeError(
        ERROR_CODES.OPENAPI_CONTRACT_MISSING,
        "Instrument lookup contract has changed",
      );
    }
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
