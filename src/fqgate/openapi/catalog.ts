import { createHash } from "node:crypto";
import type {
  OpenApiHttpMethod,
  OpenApiOperation,
  OpenApiOperationChanges,
  RequiredOpenApiContract,
} from "./types.js";

export const OPENAPI_HTTP_METHODS: readonly OpenApiHttpMethod[] = [
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "OPTIONS",
  "HEAD",
  "TRACE",
];

const OPENAPI_METHOD_SET = new Set<string>(OPENAPI_HTTP_METHODS);

export interface ParsedOpenApiDocument {
  readonly openapiVersion: string;
  readonly title: string;
  readonly version: string;
  readonly operations: readonly OpenApiOperation[];
}

export class OpenApiDocumentValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OpenApiDocumentValidationError";
  }
}

export function parseOpenApiDocument(value: unknown): ParsedOpenApiDocument {
  if (!isRecord(value)) {
    throw new OpenApiDocumentValidationError("OpenAPI document must be a JSON object");
  }

  const openapiVersion = readRequiredString(value, "openapi");
  if (!/^3\.(?:0|1)(?:\.\d+)?$/.test(openapiVersion)) {
    throw new OpenApiDocumentValidationError(
      "OpenAPI document must use a supported 3.0 or 3.1 version",
    );
  }

  const info = value.info;
  if (!isRecord(info)) {
    throw new OpenApiDocumentValidationError("OpenAPI document info must be an object");
  }
  const title = readRequiredString(info, "title");
  const version = readRequiredString(info, "version");

  const paths = value.paths;
  if (!isRecord(paths)) {
    throw new OpenApiDocumentValidationError("OpenAPI document paths must be an object");
  }

  const operations: OpenApiOperation[] = [];
  for (const [path, pathItem] of Object.entries(paths)) {
    if (!path.startsWith("/")) {
      throw new OpenApiDocumentValidationError("OpenAPI paths must begin with '/'");
    }
    if (!isRecord(pathItem)) {
      throw new OpenApiDocumentValidationError("OpenAPI path items must be objects");
    }

    for (const [methodValue, operationValue] of Object.entries(pathItem)) {
      const method = methodValue.toUpperCase();
      if (!OPENAPI_METHOD_SET.has(method)) {
        continue;
      }
      if (!isRecord(operationValue)) {
        throw new OpenApiDocumentValidationError(
          `OpenAPI operation ${method} ${path} must be an object`,
        );
      }
      operations.push(parseOperation(method as OpenApiHttpMethod, path, operationValue));
    }
  }

  operations.sort(compareOperations);
  return { openapiVersion, title, version, operations };
}

export function diffOpenApiOperations(
  previous: readonly OpenApiOperation[] | undefined,
  current: readonly OpenApiOperation[],
): OpenApiOperationChanges {
  if (previous === undefined) {
    return { added: current, removed: [], changed: [] };
  }
  const previousByKey = new Map(previous.map((operation) => [operation.key, operation]));
  const currentByKey = new Map(current.map((operation) => [operation.key, operation]));
  const added: OpenApiOperation[] = [];
  const changed: OpenApiOperation[] = [];
  const removed: OpenApiOperation[] = [];

  for (const operation of current) {
    const old = previousByKey.get(operation.key);
    if (old === undefined) {
      added.push(operation);
    } else if (old.structuralFingerprint !== operation.structuralFingerprint) {
      changed.push(operation);
    }
  }
  for (const operation of previous) {
    if (!currentByKey.has(operation.key)) {
      removed.push(operation);
    }
  }

  return { added, removed, changed };
}

export function findMissingContracts(
  operations: readonly OpenApiOperation[],
  required: readonly RequiredOpenApiContract[],
): readonly RequiredOpenApiContract[] {
  const keys = new Set(operations.map((operation) => operation.key));
  return required.filter((contract) => !keys.has(`${contract.method} ${contract.path}`));
}

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(",")}}`;
}

export function fingerprintJson(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value), "utf8").digest("hex");
}

function parseOperation(
  method: OpenApiHttpMethod,
  path: string,
  value: Record<string, unknown>,
): OpenApiOperation {
  const operationId = readOptionalString(value, "operationId", method, path);
  const summary = readOptionalString(value, "summary", method, path);
  const description = readOptionalString(value, "description", method, path);
  const tagsValue = value.tags;
  const tags: string[] = [];
  if (tagsValue !== undefined) {
    if (!Array.isArray(tagsValue) || tagsValue.some((tag) => typeof tag !== "string")) {
      throw new OpenApiDocumentValidationError(`OpenAPI tags for ${method} ${path} are invalid`);
    }
    tags.push(...tagsValue.slice(0, 32).map((tag) => tag.slice(0, 128)));
  }
  const deprecated = value.deprecated === true;
  const key = `${method} ${path}`;
  return {
    key,
    method,
    path,
    ...(operationId === undefined ? {} : { operationId }),
    ...(summary === undefined ? {} : { summary }),
    ...(description === undefined ? {} : { description }),
    tags,
    deprecated,
    structuralFingerprint: fingerprintJson(value),
  };
}

function readRequiredString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new OpenApiDocumentValidationError(`OpenAPI ${key} must be a non-empty string`);
  }
  return value.slice(0, 256);
}

function readOptionalString(
  record: Record<string, unknown>,
  key: string,
  method: OpenApiHttpMethod,
  path: string,
): string | undefined {
  const value = record[key];
  if (value === undefined) return undefined;
  if (typeof value !== "string") {
    throw new OpenApiDocumentValidationError(`OpenAPI ${key} for ${method} ${path} is invalid`);
  }
  return value.slice(0, 1_024);
}

function compareOperations(left: OpenApiOperation, right: OpenApiOperation): number {
  return left.key.localeCompare(right.key);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
