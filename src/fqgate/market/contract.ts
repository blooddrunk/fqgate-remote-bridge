import { fingerprintJson } from "../openapi/catalog.js";
import { FqgateOpenApiService } from "../openapi/service.js";
import { decodeResponseText, type HttpTransport } from "../release/http.js";
import { BridgeError, ERROR_CODES } from "../../shared/errors.js";

export const LOOKUP_UPSTREAM_PATH = "/v1/market/catalog/search-symbols";

/** Hash only this operation and its transitive local schema references. */
export function lookupContractFingerprint(document: unknown): string {
  const root = record(document);
  const operation = record(record(record(root.paths)[LOOKUP_UPSTREAM_PATH]).post);
  const schemas = record(record(root.components).schemas);
  const references: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  let nodes = 0;
  function visit(value: unknown, depth: number): void {
    if (++nodes > 20_000 || depth > 48) throw invalidContract();
    if (value === null || typeof value !== "object") return;
    if (Array.isArray(value)) {
      for (const item of value) visit(item, depth + 1);
      return;
    }
    const object = value as Record<string, unknown>;
    if (object.$ref !== undefined) {
      if (
        typeof object.$ref !== "string" ||
        !/^#\/components\/schemas\/[A-Za-z0-9_]{1,128}$/.test(object.$ref)
      )
        throw invalidContract();
      const name = object.$ref.slice("#/components/schemas/".length);
      if (!Object.hasOwn(references, name)) {
        if (Object.keys(references).length >= 64 || !Object.hasOwn(schemas, name))
          throw invalidContract();
        references[name] = record(schemas[name]);
        visit(references[name], depth + 1);
      }
    }
    for (const item of Object.values(object)) visit(item, depth + 1);
  }
  visit(operation, 0);
  return fingerprintJson({ operation, references });
}

export async function fetchLookupContract(http: HttpTransport): Promise<string> {
  let document: unknown;
  const service = new FqgateOpenApiService({
    http: {
      async request(url, options) {
        const response = await http.request(url, { ...options, redirect: "error" });
        // Existing service remains the bounded fetch/shape authority.
        if (response.body.byteLength <= 4 * 1024 * 1024 && response.status === 200) {
          try {
            document = JSON.parse(decodeResponseText(response)) as unknown;
          } catch {
            /* service rejects invalid JSON */
          }
        }
        return response;
      },
    },
  });
  try {
    await service.refresh();
    return lookupContractFingerprint(document);
  } catch {
    throw invalidContract();
  }
}

function record(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw invalidContract();
  return value as Record<string, unknown>;
}
function invalidContract(): BridgeError {
  return new BridgeError(
    ERROR_CODES.OPENAPI_CONTRACT_MISSING,
    "Instrument lookup contract is not established",
  );
}
