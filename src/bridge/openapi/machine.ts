import { Buffer } from "node:buffer";
import { BridgeError, ERROR_CODES } from "../../shared/errors.js";
import {
  listBridgeOperations,
  type BridgeOperationPolicy,
  type MachineOpenApiSchemaId,
} from "../policy/registry.js";

export const MACHINE_OPENAPI_MAX_BYTES = 64 * 1024;

type JsonObject = { readonly [key: string]: unknown };

const PUBLIC_SCHEMAS: Readonly<Record<MachineOpenApiSchemaId, JsonObject>> = {
  InstrumentLookupRequest: {
    type: "object",
    additionalProperties: false,
    required: ["code"],
    properties: { code: { type: "string", pattern: "^[0-9]{6}$" } },
  },
  InstrumentLookupResponse: {
    type: "object",
    additionalProperties: false,
    required: ["items"],
    properties: {
      items: {
        type: "array",
        maxItems: 16,
        items: { $ref: "#/components/schemas/InstrumentLookupItem" },
      },
    },
  },
  MachineOpenApiDocument: {
    type: "object",
    additionalProperties: false,
    required: ["openapi", "info", "paths", "components"],
    properties: {
      openapi: { type: "string", const: "3.1.0" },
      info: { type: "object" },
      paths: { type: "object" },
      components: { type: "object" },
    },
  },
};

const SHARED_SCHEMAS: Readonly<Record<string, JsonObject>> = {
  BridgeError: {
    type: "object",
    additionalProperties: false,
    required: ["error"],
    properties: {
      error: {
        type: "object",
        additionalProperties: false,
        required: ["code", "message", "requestId"],
        properties: {
          code: { type: "string", minLength: 1, maxLength: 64 },
          message: { type: "string", minLength: 1, maxLength: 256 },
          requestId: { type: "string", minLength: 1, maxLength: 64 },
        },
      },
    },
  },
  InstrumentLookupItem: {
    type: "object",
    additionalProperties: false,
    required: ["code", "market", "name", "instrumentId"],
    properties: {
      code: { type: "string", pattern: "^[0-9]{6}$" },
      market: { type: "string", minLength: 1, maxLength: 16 },
      name: { type: "string", minLength: 1, maxLength: 128 },
      instrumentId: { type: "string", minLength: 1, maxLength: 32 },
    },
  },
};

export function buildMachineOpenApiDocument(
  operations: readonly BridgeOperationPolicy[] = listBridgeOperations(),
): JsonObject {
  const machineOperations = operations
    .filter((operation) => operation.allowedContexts.includes("remote_machine"))
    .sort((left, right) =>
      `${left.path}\u0000${left.method}\u0000${left.id}`.localeCompare(
        `${right.path}\u0000${right.method}\u0000${right.id}`,
      ),
    );
  const paths: Record<string, Record<string, unknown>> = {};
  const usedSchemas = new Set<MachineOpenApiSchemaId>();

  for (const operation of machineOperations) {
    const metadata = operation.machineOpenApi;
    if (metadata === undefined) {
      throw new BridgeError(
        ERROR_CODES.BRIDGE_NOT_READY,
        `Machine operation lacks OpenAPI metadata: ${operation.id}`,
      );
    }
    usedSchemas.add(metadata.responseSchema);
    if (metadata.requestSchema !== undefined) usedSchemas.add(metadata.requestSchema);
    const responses: Record<string, unknown> = {
      "200": responseForSchema(metadata.responseSchema),
    };
    for (const error of [...metadata.errorStatuses].sort((a, b) => a.status - b.status)) {
      responses[String(error.status)] = {
        description: error.code,
        content: {
          "application/json": { schema: { $ref: "#/components/schemas/BridgeError" } },
        },
      };
    }
    const operationDocument: Record<string, unknown> = {
      operationId: operation.id,
      summary: metadata.summary,
      responses,
    };
    if (metadata.requestSchema !== undefined) {
      operationDocument.requestBody = {
        required: true,
        content: {
          "application/json": {
            schema: { $ref: `#/components/schemas/${metadata.requestSchema}` },
          },
        },
      };
    }
    paths[operation.path] = { [operation.method.toLowerCase()]: operationDocument };
  }

  const schemas: Record<string, JsonObject> = { ...SHARED_SCHEMAS };
  for (const name of [...usedSchemas].sort()) schemas[name] = PUBLIC_SCHEMAS[name];
  const document = canonicalize({
    openapi: "3.1.0",
    info: {
      title: "FQGate Remote Bridge Machine API",
      version: "1.0.0",
      description: "Bridge-owned read-only operations authorized for remote machine callers.",
    },
    paths,
    components: { schemas },
  }) as JsonObject;
  assertBounded(document);
  return document;
}

export function serializeMachineOpenApiDocument(
  operations: readonly BridgeOperationPolicy[] = listBridgeOperations(),
): string {
  const serialized = JSON.stringify(buildMachineOpenApiDocument(operations));
  if (Buffer.byteLength(serialized, "utf8") > MACHINE_OPENAPI_MAX_BYTES) {
    throw new BridgeError(ERROR_CODES.BRIDGE_NOT_READY, "Machine OpenAPI exceeds its size limit");
  }
  return serialized;
}

function responseForSchema(schema: MachineOpenApiSchemaId): JsonObject {
  return {
    description: "Successful response",
    content: { "application/json": { schema: { $ref: `#/components/schemas/${schema}` } } },
  };
}

function assertBounded(document: JsonObject): void {
  if (Buffer.byteLength(JSON.stringify(document), "utf8") > MACHINE_OPENAPI_MAX_BYTES) {
    throw new BridgeError(ERROR_CODES.BRIDGE_NOT_READY, "Machine OpenAPI exceeds its size limit");
  }
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, canonicalize(child)]),
  );
}
