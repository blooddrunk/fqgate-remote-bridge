import { BridgeError, ERROR_CODES, isBridgeError } from "../../shared/errors.js";
import { decodeResponseText, type HttpTransport } from "../release/http.js";
import {
  diffOpenApiOperations,
  findMissingContracts,
  fingerprintJson,
  OpenApiDocumentValidationError,
  parseOpenApiDocument,
} from "./catalog.js";
import type {
  BridgeCatalogOperation,
  OpenApiCatalog,
  OpenApiSnapshot,
  RequiredOpenApiContract,
} from "./types.js";

export const FQGATE_OPENAPI_ENDPOINT = "http://127.0.0.1:17281/openapi.json" as const;

export interface FqgateOpenApiServiceOptions {
  readonly http: HttpTransport;
  readonly timeoutMs?: number;
  readonly maxBytes?: number;
  readonly ttlMs?: number;
  readonly now?: () => string;
  readonly nowMs?: () => number;
}

export interface OpenApiFetchOptions {
  readonly refresh?: boolean;
}

export interface FqgateOpenApiServicePort {
  refresh(): Promise<OpenApiSnapshot>;
  catalog(
    bridgeOperations: readonly BridgeCatalogOperation[],
    requiredContracts: readonly RequiredOpenApiContract[],
    options?: OpenApiFetchOptions,
  ): Promise<OpenApiCatalog>;
}

export class FqgateOpenApiService implements FqgateOpenApiServicePort {
  private readonly http: HttpTransport;
  private readonly timeoutMs: number;
  private readonly maxBytes: number;
  private readonly ttlMs: number;
  private readonly now: () => string;
  private readonly nowMs: () => number;
  private cache: { readonly snapshot: OpenApiSnapshot; readonly expiresAtMs: number } | undefined;
  private previous: OpenApiSnapshot | undefined;

  constructor(options: FqgateOpenApiServiceOptions) {
    this.http = options.http;
    this.timeoutMs = options.timeoutMs ?? 3_000;
    this.maxBytes = options.maxBytes ?? 4 * 1024 * 1024;
    this.ttlMs = options.ttlMs ?? 5_000;
    this.now = options.now ?? (() => new Date().toISOString());
    this.nowMs = options.nowMs ?? Date.now;
  }

  invalidate(): void {
    this.cache = undefined;
  }

  async getSnapshot(options: OpenApiFetchOptions = {}): Promise<OpenApiSnapshot> {
    const nowMs = this.nowMs();
    if (!options.refresh && this.cache !== undefined && this.cache.expiresAtMs > nowMs) {
      return { ...this.cache.snapshot, cacheHit: true };
    }

    let response;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      const request = this.http.request(FQGATE_OPENAPI_ENDPOINT, {
        method: "GET",
        timeoutMs: this.timeoutMs,
        maxBytes: this.maxBytes,
      });
      response = await Promise.race([
        request,
        new Promise<never>((_, reject) => {
          timeout = setTimeout(
            () =>
              reject(
                new BridgeError(ERROR_CODES.OPENAPI_FETCH_FAILED, "OpenAPI request timed out"),
              ),
            this.timeoutMs,
          );
        }),
      ]);
    } catch (error) {
      throw normalizeFetchError(error);
    } finally {
      if (timeout !== undefined) clearTimeout(timeout);
    }

    if (response.status < 200 || response.status >= 300) {
      throw new BridgeError(
        ERROR_CODES.OPENAPI_FETCH_FAILED,
        "FQGate runtime OpenAPI is unavailable",
        { status: response.status },
      );
    }
    if (response.body.byteLength > this.maxBytes) {
      throw new BridgeError(
        ERROR_CODES.OPENAPI_RESPONSE_TOO_LARGE,
        "FQGate runtime OpenAPI exceeded the response size limit",
      );
    }

    const bodyText = decodeResponseText(response);
    let value: unknown;
    try {
      value = JSON.parse(bodyText) as unknown;
    } catch (error) {
      throw new BridgeError(
        ERROR_CODES.OPENAPI_INVALID,
        "FQGate runtime OpenAPI is not valid JSON",
        undefined,
        { cause: error },
      );
    }

    let parsed;
    try {
      parsed = parseOpenApiDocument(value);
    } catch (error) {
      if (error instanceof OpenApiDocumentValidationError) {
        throw new BridgeError(ERROR_CODES.OPENAPI_INVALID, "FQGate runtime OpenAPI is invalid", {
          reason: error.message.slice(0, 256),
        });
      }
      throw new BridgeError(
        ERROR_CODES.OPENAPI_INVALID,
        "FQGate runtime OpenAPI is invalid",
        undefined,
        { cause: error },
      );
    }

    const snapshot: OpenApiSnapshot = {
      endpoint: FQGATE_OPENAPI_ENDPOINT,
      openapiVersion: parsed.openapiVersion,
      info: { title: parsed.title, version: parsed.version },
      fetchedAt: this.now(),
      byteLength: response.body.byteLength,
      fingerprint: fingerprintJson(value),
      operations: parsed.operations,
      changes: diffOpenApiOperations(this.previous?.operations, parsed.operations),
      cacheHit: false,
    };
    this.previous = snapshot;
    this.cache = { snapshot, expiresAtMs: nowMs + this.ttlMs };
    return snapshot;
  }

  async refresh(): Promise<OpenApiSnapshot> {
    return this.getSnapshot({ refresh: true });
  }

  async assertRequiredContracts(
    required: readonly RequiredOpenApiContract[],
  ): Promise<OpenApiSnapshot> {
    const snapshot = await this.refresh();
    const missing = findMissingContracts(snapshot.operations, required);
    if (missing.length > 0) {
      throw new BridgeError(
        ERROR_CODES.OPENAPI_CONTRACT_MISSING,
        "FQGate runtime OpenAPI is missing a required bridge contract",
        {
          missing: missing.slice(0, 32).map((contract) => `${contract.method} ${contract.path}`),
        },
      );
    }
    return snapshot;
  }

  async catalog(
    bridgeOperations: readonly BridgeCatalogOperation[],
    requiredContracts: readonly RequiredOpenApiContract[],
    options: OpenApiFetchOptions = {},
  ): Promise<OpenApiCatalog> {
    const snapshot = await this.getSnapshot(options);
    const missing = findMissingContracts(snapshot.operations, requiredContracts);
    const approvedUpstreamKeys = new Set(
      bridgeOperations
        .filter((operation) => operation.upstream !== undefined)
        .map((operation) => `${operation.upstream?.method} ${operation.upstream?.path}`),
    );
    return {
      source: "runtime_fqgate_openapi",
      snapshot,
      bridgeOperations,
      upstreamOnlyOperations: snapshot.operations.filter(
        (operation) => !approvedUpstreamKeys.has(operation.key),
      ),
      contractCoverage: { required: requiredContracts, missing },
      note: "FQGate 文档只描述上游能力；只有显式注册的 Bridge operation 才获得授权。",
    };
  }
}

export interface FqgateActivationOpenApiProbe {
  invalidate(): void;
  probe(): Promise<OpenApiSnapshot>;
}

export class RequiredContractOpenApiProbe implements FqgateActivationOpenApiProbe {
  private readonly service: FqgateOpenApiService;
  private readonly requiredContracts: readonly RequiredOpenApiContract[];

  constructor(
    service: FqgateOpenApiService,
    requiredContracts: readonly RequiredOpenApiContract[],
  ) {
    this.service = service;
    this.requiredContracts = requiredContracts;
  }

  invalidate(): void {
    this.service.invalidate();
  }

  async probe(): Promise<OpenApiSnapshot> {
    return this.service.assertRequiredContracts(this.requiredContracts);
  }
}

function normalizeFetchError(error: unknown): BridgeError {
  if (isBridgeError(error) && error.message.includes("size limit")) {
    return new BridgeError(
      ERROR_CODES.OPENAPI_RESPONSE_TOO_LARGE,
      "FQGate runtime OpenAPI exceeded the response size limit",
      undefined,
      { cause: error },
    );
  }
  return new BridgeError(
    ERROR_CODES.OPENAPI_FETCH_FAILED,
    "FQGate runtime OpenAPI is unavailable",
    undefined,
    { cause: error },
  );
}
