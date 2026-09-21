import { Buffer } from "node:buffer";
import { describe, expect, it } from "vitest";
import {
  buildMachineOpenApiDocument,
  MACHINE_OPENAPI_MAX_BYTES,
  serializeMachineOpenApiDocument,
} from "../src/bridge/openapi/machine.js";
import { listBridgeOperations, type BridgeOperationPolicy } from "../src/bridge/policy/registry.js";
import { assertOperationAllowedForContext } from "../src/bridge/policy/request-context.js";
import { createBridgeHttpHandler } from "../src/bridge/transport/http.js";
import { BridgeService } from "../src/bridge/service.js";
import { FqgateQrAdapter } from "../src/bridge/qr/adapter.js";
import { QrFlowRegistry } from "../src/bridge/qr/registry.js";
import type { HttpTransport } from "../src/fqgate/release/http.js";
import { ERROR_CODES } from "../src/shared/errors.js";

const expectedMachineOperations = ["market.instruments.lookup", "openapi.machine"];
interface TestMachineDocument {
  readonly paths: Record<string, Record<string, { readonly operationId: string }>>;
  readonly components: { readonly schemas: Record<string, unknown> };
}

describe("Phase 5-C registry-derived machine OpenAPI", () => {
  it("contains exactly the two policy-authorized Bridge operations and public schemas", () => {
    const document = buildMachineOpenApiDocument() as unknown as TestMachineDocument;
    expect(Object.keys(document.paths)).toEqual([
      "/api/v1/instruments/lookup",
      "/api/v1/openapi/machine",
    ]);
    expect(document.paths["/api/v1/instruments/lookup"]!.post!.operationId).toBe(
      "market.instruments.lookup",
    );
    expect(document.paths["/api/v1/openapi/machine"]!.get!.operationId).toBe("openapi.machine");
    expect(Object.keys(document.components.schemas)).toEqual([
      "BridgeError",
      "InstrumentLookupItem",
      "InstrumentLookupRequest",
      "InstrumentLookupResponse",
      "MachineOpenApiDocument",
    ]);
  });

  it("uses registry authorization as the only inclusion authority", () => {
    const operations = listBridgeOperations();
    const localOnly = operations.find((operation) => operation.id === "bridge.version");
    if (localOnly === undefined) throw new Error("fixture operation missing");
    const unrelated: BridgeOperationPolicy = {
      ...localOnly,
      path: "/api/v1/unrelated-local",
      allowedContexts: ["local"],
    };
    const serialized = serializeMachineOpenApiDocument([...operations, unrelated]);
    expect(serialized).not.toContain("/api/v1/unrelated-local");
    expect(serialized).not.toContain("/v1/market/catalog/search-symbols");
    expect(serialized).not.toContain("/v1/market/realtime/quote");
  });

  it("serializes deterministically, remains bounded, and contains no private runtime metadata", () => {
    const operations = listBridgeOperations();
    const forward = serializeMachineOpenApiDocument(operations);
    const reverse = serializeMachineOpenApiDocument([...operations].reverse());
    expect(reverse).toBe(forward);
    expect(Buffer.byteLength(forward, "utf8")).toBeLessThanOrEqual(MACHINE_OPENAPI_MAX_BYTES);
    for (const forbidden of [
      "fingerprint",
      "teamDomain",
      "audience",
      "clientSecret",
      "Cf-Access-Jwt-Assertion",
      "C:\\\\",
      "127.0.0.1:17281",
      "session.qr",
      "updates.apply",
      "openapi.refresh",
    ]) {
      expect(forward).not.toContain(forbidden);
    }
  });

  it("preserves the complete four-context operation matrix", () => {
    const expected: Record<string, Set<string>> = {
      local: new Set(listBridgeOperations().map((operation) => operation.id)),
      remote_human: new Set([
        "bridge.version",
        "bridge.capabilities",
        "bridge.status",
        "session.qr.begin",
        "session.qr.poll",
        "updates.status",
        "openapi.catalog",
      ]),
      remote_admin: new Set([
        "bridge.version",
        "bridge.capabilities",
        "bridge.status",
        "session.qr.begin",
        "session.qr.poll",
        "updates.status",
        "updates.check",
        "updates.plan",
        "updates.apply",
        "openapi.catalog",
        "openapi.refresh",
      ]),
      remote_machine: new Set(expectedMachineOperations),
    };
    for (const context of ["local", "remote_human", "remote_admin", "remote_machine"] as const) {
      for (const operation of listBridgeOperations()) {
        const assertion = () => assertOperationAllowedForContext(operation, context);
        if (expected[context]?.has(operation.id)) expect(assertion).not.toThrow();
        else
          expect(assertion).toThrowError(
            expect.objectContaining({ code: ERROR_CODES.OPERATION_FORBIDDEN }),
          );
      }
    }
    expect(
      listBridgeOperations()
        .filter(
          (operation) =>
            operation.allowedContexts.includes("remote_machine") &&
            operation.classification === "market_read",
        )
        .map((operation) => operation.id),
    ).toEqual(["market.instruments.lookup"]);
  });

  it("serves the canonical document only to local and verified machine contexts", async () => {
    const handler = createBridgeHttpHandler({
      service: createService(),
      requestContext: {
        remoteHostname: "human.example.com",
        adminHostname: "admin.example.com",
        machineHostname: "api.example.com",
        adminVerifier: {
          audience: "admin-audience",
          verify: async () => ({
            kind: "human",
            subject: "operator",
            audience: "admin-audience",
          }),
        },
        machineVerifier: {
          audience: "machine-audience",
          verify: async () => ({
            kind: "machine",
            subject: "reader",
            audience: "machine-audience",
          }),
        },
      },
    });
    for (const [host, status] of [
      ["127.0.0.1:17282", 200],
      ["api.example.com", 200],
      ["human.example.com", 403],
      ["admin.example.com", 403],
      ["unknown.example.com", 421],
    ] as const) {
      const response = await handler(
        new Request(`https://${host}/api/v1/openapi/machine`, {
          headers: { host, "cf-access-jwt-assertion": "fixture" },
        }),
      );
      expect(response.status, host).toBe(status);
      if (status === 200) expect(await response.text()).toBe(serializeMachineOpenApiDocument());
    }
  });
});

function createService(): BridgeService {
  return new BridgeService({
    buildInfo: {
      name: "fqgate-remote-bridge",
      version: "0.1.0",
      commit: "phase5c-test",
      node: "v22.0.0",
      platform: "linux",
      architecture: "x64",
    },
    lifecycle: { status: async () => Promise.reject(new Error("not used")) },
    qrAdapter: new FqgateQrAdapter({
      baseUrl: "http://127.0.0.1:17281",
      http: { request: async () => Promise.reject(new Error("not used")) } as HttpTransport,
    }),
    qrRegistry: new QrFlowRegistry(),
  });
}
