export type OpenApiHttpMethod =
  "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "OPTIONS" | "HEAD" | "TRACE";

export interface OpenApiOperation {
  readonly key: string;
  readonly method: OpenApiHttpMethod;
  readonly path: string;
  readonly operationId?: string;
  readonly summary?: string;
  readonly description?: string;
  readonly tags: readonly string[];
  readonly deprecated: boolean;
  readonly structuralFingerprint: string;
}

export interface OpenApiOperationChanges {
  readonly added: readonly OpenApiOperation[];
  readonly removed: readonly OpenApiOperation[];
  readonly changed: readonly OpenApiOperation[];
}

export interface OpenApiSnapshot {
  readonly endpoint: "http://127.0.0.1:17281/openapi.json";
  readonly openapiVersion: string;
  readonly info: {
    readonly title: string;
    readonly version: string;
  };
  readonly fetchedAt: string;
  readonly byteLength: number;
  readonly fingerprint: string;
  readonly operations: readonly OpenApiOperation[];
  readonly changes: OpenApiOperationChanges;
  readonly cacheHit: boolean;
}

export interface RequiredOpenApiContract {
  readonly id: string;
  readonly method: OpenApiHttpMethod;
  readonly path: string;
  readonly description: string;
}

export interface OpenApiContractCoverage {
  readonly required: readonly RequiredOpenApiContract[];
  readonly missing: readonly RequiredOpenApiContract[];
}

export interface BridgeCatalogOperation {
  readonly id: string;
  readonly method: string;
  readonly path: string;
  readonly classification: string;
  readonly intent: string;
  readonly allowedContexts: readonly string[];
  readonly requiresConfirmation: boolean;
  readonly requiredCompatibility: string;
  readonly documentationVisible: boolean;
  readonly upstream?: {
    readonly method: OpenApiHttpMethod;
    readonly path: string;
  };
}

export interface OpenApiCatalog {
  readonly source: "runtime_fqgate_openapi";
  readonly snapshot: OpenApiSnapshot;
  readonly bridgeOperations: readonly BridgeCatalogOperation[];
  readonly upstreamOnlyOperations: readonly OpenApiOperation[];
  readonly contractCoverage: OpenApiContractCoverage;
  readonly note: string;
}
