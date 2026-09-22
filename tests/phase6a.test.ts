import { describe, expect, it, vi } from "vitest";
import { CloudflareApiClient } from "../src/cloudflare/client.js";
import { parseCloudflareDesiredState } from "../src/cloudflare/desired.js";
import { CloudflareDiscoveryService } from "../src/cloudflare/discovery.js";
import {
  assertCloudflarePlanSecretFree,
  cloudflarePlanFingerprint,
  reconcileCloudflareState,
} from "../src/cloudflare/reconcile.js";
import { buildCloudflareApiUrl, FetchCloudflareGetTransport } from "../src/cloudflare/transport.js";
import type {
  CloudflareDiscoveryClient,
  CloudflareGetTransport,
  CloudflareObservedState,
  CloudflarePolicyObservation,
  CloudflareTunnelConfigurationObservation,
} from "../src/cloudflare/types.js";
import { BridgeError, ERROR_CODES } from "../src/shared/errors.js";

function desiredInput(): Record<string, unknown> {
  return {
    schemaVersion: "phase6a.v1",
    account: { id: "account-1", name: "Research" },
    zone: { id: "zone-1", name: "example.com" },
    tunnel: {
      id: "tunnel-1",
      name: "research-bridge",
      origin: "http://127.0.0.1:17282",
    },
    access: {
      teamDomain: "research.cloudflareaccess.com",
      teamName: "research",
      applications: {
        human: {
          id: "app-human",
          name: "Research human",
          hostname: "bridge.example.com",
          audience: "aud-human",
          type: "self_hosted",
        },
        admin: {
          id: "app-admin",
          name: "Research admin",
          hostname: "admin.example.com",
          audience: "aud-admin",
          type: "self_hosted",
        },
        machine: {
          id: "app-machine",
          name: "Research machine",
          hostname: "machine.example.com",
          audience: "aud-machine",
          type: "self_hosted",
        },
      },
      policies: {
        human: { minimumCount: 1, requiredDecision: "allow", exactNonIdentitySelectorCount: 0 },
        admin: {
          minimumCount: 1,
          requiredDecision: "allow",
          requireMfa: true,
          exactNonIdentitySelectorCount: 0,
        },
        machine: {
          minimumCount: 1,
          requiredDecision: "non_identity",
          exactNonIdentitySelectorCount: 1,
        },
      },
    },
  };
}

function desired() {
  return parseCloudflareDesiredState(desiredInput());
}

function goodRawState(reverse = false): {
  readonly accounts: readonly unknown[];
  readonly zones: readonly unknown[];
  readonly tunnels: readonly unknown[];
  readonly tunnel: unknown;
  readonly configuration: unknown;
  readonly dns: Readonly<Record<string, readonly unknown[]>>;
  readonly applications: readonly unknown[];
  readonly policies: Readonly<Record<string, readonly unknown[]>>;
} {
  const route = (hostname: string, audience: string) => ({
    hostname,
    service: "http://127.0.0.1:17282",
    originRequest: {
      access: {
        required: true,
        teamName: "research",
        audTag: [audience],
      },
    },
  });
  const policy = (
    id: string,
    decision: string,
    include: readonly Record<string, unknown>[],
    mfaDisabled: boolean | undefined,
  ) => ({
    id,
    name: id,
    decision,
    precedence: 1,
    include,
    require: [],
    exclude: [],
    ...(mfaDisabled === undefined ? {} : { mfa_config: { mfa_disabled: mfaDisabled } }),
  });
  const applications = [
    {
      id: "app-human",
      name: "Research human",
      domain: "bridge.example.com",
      aud: "aud-human",
      type: "self_hosted",
    },
    {
      id: "app-admin",
      name: "Research admin",
      domain: "admin.example.com",
      aud: "aud-admin",
      type: "self_hosted",
      mfa_config: { mfa_disabled: false },
    },
    {
      id: "app-machine",
      name: "Research machine",
      domain: "machine.example.com",
      aud: "aud-machine",
      type: "self_hosted",
    },
  ];
  const policyByContext = {
    human: [
      policy("policy-human", "allow", [{ email_domain: { domain: "example.com" } }], undefined),
    ],
    admin: [policy("policy-admin", "allow", [{ group: { id: "admin-group" } }], false)],
    machine: [
      policy(
        "policy-machine",
        "non_identity",
        [{ service_token: { token_id: "secret" } }],
        undefined,
      ),
    ],
  } satisfies Record<string, readonly Record<string, unknown>[]>;
  const raw = {
    accounts: [{ id: "account-1", name: "Research" }],
    zones: [{ id: "zone-1", name: "example.com", account: { id: "account-1" } }],
    tunnels: [
      {
        id: "tunnel-1",
        name: "research-bridge",
        config_src: "cloudflare",
        remote_config: true,
        status: "healthy",
      },
    ],
    tunnel: {
      id: "tunnel-1",
      name: "research-bridge",
      config_src: "cloudflare",
      remote_config: true,
      status: "healthy",
    },
    configuration: {
      account_id: "account-1",
      version: 7,
      config: {
        ingress: [
          { service: "http_status:404" },
          route("bridge.example.com", "aud-human"),
          route("admin.example.com", "aud-admin"),
          route("machine.example.com", "aud-machine"),
        ],
      },
    },
    dns: {
      "bridge.example.com": [
        {
          id: "dns-human",
          name: "bridge.example.com",
          type: "CNAME",
          content: "tunnel-1.cfargotunnel.com",
          proxied: true,
        },
      ],
      "admin.example.com": [
        {
          id: "dns-admin",
          name: "admin.example.com",
          type: "CNAME",
          content: "tunnel-1.cfargotunnel.com",
          proxied: true,
        },
      ],
      "machine.example.com": [
        {
          id: "dns-machine",
          name: "machine.example.com",
          type: "CNAME",
          content: "tunnel-1.cfargotunnel.com",
          proxied: true,
        },
      ],
    },
    applications,
    policies: policyByContext,
  };
  if (!reverse) return raw;
  return {
    ...raw,
    applications: [...raw.applications].reverse(),
    policies: {
      human: [...raw.policies.human].reverse(),
      admin: [...raw.policies.admin].reverse(),
      machine: [...raw.policies.machine].reverse(),
    },
    configuration: {
      ...raw.configuration,
      config: { ingress: [...raw.configuration.config.ingress].reverse() },
    },
  };
}

function fakeClient(raw: ReturnType<typeof goodRawState>): CloudflareDiscoveryClient {
  return {
    listAccounts: async () => raw.accounts,
    getAccount: async () => raw.accounts[0],
    listZones: async () => raw.zones,
    listTunnels: async () => raw.tunnels,
    getTunnel: async () => raw.tunnel,
    getTunnelConfiguration: async () => raw.configuration,
    listDnsRecords: async (_zoneId, hostname) => raw.dns[hostname] ?? [],
    listAccessApplications: async () => raw.applications,
    listAccessPolicies: async (_accountId, applicationId) => {
      const context =
        applicationId === "app-human"
          ? "human"
          : applicationId === "app-admin"
            ? "admin"
            : "machine";
      return raw.policies[context] ?? [];
    },
  };
}

async function goodObserved(reverse = false): Promise<CloudflareObservedState> {
  return new CloudflareDiscoveryService(fakeClient(goodRawState(reverse))).discover(desired());
}

function replaceConfiguration(
  observed: CloudflareObservedState,
  configuration: CloudflareTunnelConfigurationObservation,
): CloudflareObservedState {
  return {
    ...observed,
    tunnelConfiguration: { status: "found", candidates: [configuration], selected: configuration },
  };
}

function policy(overrides: Partial<CloudflarePolicyObservation> = {}): CloudflarePolicyObservation {
  return {
    id: "policy-test",
    name: "test",
    decision: "allow",
    precedence: 1,
    includeKinds: ["group"],
    requireKinds: [],
    excludeKinds: [],
    broadSelector: false,
    nonIdentitySelectorCount: 0,
    mfaDisabled: null,
    sessionDuration: null,
    ...overrides,
  };
}

describe("Phase 6-A Cloudflare desired state and transport", () => {
  it("rejects a non-Bridge origin and duplicate application identities", () => {
    expect(() =>
      parseCloudflareDesiredState({
        ...desiredInput(),
        tunnel: {
          ...(desiredInput().tunnel as Record<string, unknown>),
          origin: "http://127.0.0.1:17281",
        },
      }),
    ).toThrowError(/17282/);

    const duplicate = desiredInput();
    const access = duplicate.access as Record<string, unknown>;
    const applications = access.applications as Record<string, Record<string, unknown>>;
    applications.admin = { ...applications.admin, audience: applications.human?.audience };
    expect(() => parseCloudflareDesiredState(duplicate)).toThrowError(/distinct audiences/);
  });

  it("enforces a fixed allowlisted API path and GET-only fetch options", async () => {
    const calls: RequestInit[] = [];
    const transport = new FetchCloudflareGetTransport({
      apiToken: "read-token",
      fetchImpl: async (_input, init) => {
        calls.push(init ?? {});
        return new Response(JSON.stringify({ success: true, result: [] }), { status: 200 });
      },
    });
    await transport.get("/accounts", { page: "1" });
    await transport.get("/accounts/account-1");
    expect(calls[0]).toMatchObject({ method: "GET", redirect: "error" });
    expect(new Headers(calls[0]?.headers).get("authorization")).toBe("Bearer read-token");
    expect(buildCloudflareApiUrl("/zones", { "account.id": "account-1" })).toContain(
      "/zones?account.id=account-1",
    );
    expect(() => buildCloudflareApiUrl("/accounts/other-endpoint/nested")).toThrow();
    expect(() => buildCloudflareApiUrl("/accounts/../zones")).toThrow();
    expect(Object.getOwnPropertyNames(FetchCloudflareGetTransport.prototype)).not.toEqual(
      expect.arrayContaining(["post", "put", "patch", "delete"]),
    );
  });

  it("bounds pagination and body size without exposing the token", async () => {
    const pages: Array<Readonly<Record<string, unknown>>> = [
      {
        status: 200,
        payload: {
          success: true,
          result: [{ id: "a" }],
          result_info: { total_pages: 2, total_count: 2 },
        },
      },
      {
        status: 200,
        payload: {
          success: true,
          result: [{ id: "b" }],
          result_info: { total_pages: 2, total_count: 2 },
        },
      },
    ];
    const queries: readonly Record<string, string>[] = [];
    const transport: CloudflareGetTransport = {
      get: async (_path, query) => {
        (queries as Record<string, string>[]).push(query ?? {});
        return pages.shift() as { status: number; payload: unknown };
      },
    };
    await expect(new CloudflareApiClient({ transport }).listAccounts()).resolves.toEqual([
      { id: "a" },
      { id: "b" },
    ]);
    expect(queries).toHaveLength(2);
    await expect(
      new FetchCloudflareGetTransport({
        apiToken: "secret-token",
        maxResponseBytes: 16 * 1024,
        fetchImpl: async () => new Response("x".repeat(16 * 1024 + 1), { status: 200 }),
      }).get("/accounts"),
    ).rejects.toMatchObject({ code: ERROR_CODES.CLOUDFLARE_API_RESPONSE_TOO_LARGE });
  });

  it("times out an unresponsive GET", async () => {
    vi.useFakeTimers();
    try {
      const transport = new FetchCloudflareGetTransport({
        apiToken: "read-token",
        timeoutMs: 1_000,
        fetchImpl: async (_input, init) =>
          await new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () =>
              reject(new DOMException("aborted", "AbortError")),
            );
          }),
      });
      const pending = transport.get("/accounts");
      const rejection = expect(pending).rejects.toMatchObject({
        code: ERROR_CODES.CLOUDFLARE_API_REQUEST_FAILED,
      });
      await vi.advanceTimersByTimeAsync(1_000);
      await rejection;
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("Phase 6-A discovery and deterministic reconciliation", () => {
  it("produces the same secret-free fingerprint regardless of API ordering", async () => {
    const first = reconcileCloudflareState(desired(), await goodObserved(false));
    const second = reconcileCloudflareState(desired(), await goodObserved(true));
    expect(first.summary.unsafeConflicts).toBe(0);
    expect(first.summary.manualRequired).toBe(0);
    expect(first.fingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(first.fingerprint).toBe(second.fingerprint);
    expect(first.fingerprint).toBe(cloudflarePlanFingerprint(first));
    expect(JSON.stringify(first)).not.toContain("token_id");
    expect(JSON.stringify(first)).not.toContain("secret");
    expect(first.mutationMethods).toEqual([]);
    expect(first.readOnly).toBe(true);
  });

  it("classifies direct FQGate, wildcard, unexpected audience, and duplicate DNS as conflicts", async () => {
    const observed = await goodObserved();
    const base = observed.tunnelConfiguration.selected;
    if (base === undefined) throw new Error("fixture tunnel configuration was not selected");
    const altered = replaceConfiguration(observed, {
      ...base,
      ingress: [
        ...base.ingress,
        {
          hostname: "unsafe.example.com",
          path: null,
          service: "https://10.0.0.2:17281",
          access: null,
        },
        { hostname: "*.example.com", path: null, service: "http://127.0.0.1:17282", access: null },
      ],
    });
    const alteredAdminApplication = altered.applications.admin.selected;
    if (alteredAdminApplication === undefined)
      throw new Error("fixture admin application was not selected");
    const alteredHumanApplication = altered.applications.human.selected;
    if (alteredHumanApplication === undefined)
      throw new Error("fixture human application was not selected");
    const withDuplicateDns: CloudflareObservedState = {
      ...altered,
      dns: {
        ...altered.dns,
        human: {
          status: "ambiguous",
          candidates: altered.dns.human.candidates,
        },
      },
      applications: {
        ...altered.applications,
        admin: {
          ...altered.applications.admin,
          selected: {
            ...alteredAdminApplication,
            audience: "unexpected-audience",
          },
        },
      },
      unexpectedApplications: [{ ...alteredHumanApplication, id: "duplicate-human-app" }],
    };
    const plan = reconcileCloudflareState(desired(), withDuplicateDns);
    expect(plan.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          reason: "direct_fqgate_origin_17281",
          classification: "unsafe_conflict",
        }),
        expect.objectContaining({
          reason: "wildcard_or_broad_ingress",
          classification: "unsafe_conflict",
        }),
        expect.objectContaining({
          reason: "duplicate_or_ambiguous_resource",
          classification: "ambiguous",
        }),
        expect.objectContaining({
          reason: "application_audience_mismatch",
          classification: "unsafe_conflict",
        }),
        expect.objectContaining({
          reason: "duplicate_expected_hostname_application",
          classification: "unsafe_conflict",
        }),
      ]),
    );
  });

  it("detects bypass, Everyone/widening selectors, and policy isolation violations", async () => {
    const observed = await goodObserved();
    const withUnsafePolicies: CloudflareObservedState = {
      ...observed,
      policies: {
        ...observed.policies,
        human: {
          status: "found",
          policies: [
            policy({ decision: "bypass", broadSelector: true, includeKinds: ["everyone"] }),
            policy({
              id: "human-machine",
              decision: "non_identity",
              includeKinds: ["service_token"],
              nonIdentitySelectorCount: 1,
            }),
          ],
        },
        machine: {
          status: "found",
          policies: [
            policy({
              id: "machine-wide",
              decision: "non_identity",
              includeKinds: ["any_valid_service_token"],
              broadSelector: true,
            }),
          ],
        },
      },
    };
    const plan = reconcileCloudflareState(desired(), withUnsafePolicies);
    expect(plan.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "access.policy.human.broad",
          classification: "unsafe_conflict",
        }),
        expect.objectContaining({
          id: "access.policy.human.bypass",
          classification: "unsafe_conflict",
        }),
        expect.objectContaining({
          id: "access.policy.human.machine-isolation",
          classification: "unsafe_conflict",
        }),
        expect.objectContaining({
          id: "access.policy.machine.service-token",
          classification: "unsafe_conflict",
        }),
      ]),
    );
  });

  it("fails closed when administrator MFA cannot be proven", async () => {
    const observed = await goodObserved();
    const adminApplication = observed.applications.admin.selected;
    if (adminApplication === undefined)
      throw new Error("fixture admin application was not selected");
    const withoutMfaProof: CloudflareObservedState = {
      ...observed,
      applications: {
        ...observed.applications,
        admin: {
          ...observed.applications.admin,
          selected: {
            ...adminApplication,
            mfaDisabled: null,
          },
        },
      },
      policies: {
        ...observed.policies,
        admin: {
          status: "found",
          policies: observed.policies.admin.policies.map((item) => ({
            ...item,
            mfaDisabled: null,
          })),
        },
      },
    };
    const plan = reconcileCloudflareState(desired(), withoutMfaProof);
    expect(plan.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "access.policy.admin.mfa",
          classification: "manual_required",
          reason: "api_response_does_not_prove_administrator_mfa",
        }),
      ]),
    );
    expect(() => assertCloudflarePlanSecretFree(JSON.stringify(plan))).not.toThrow();
  });
});

describe("Phase 6-A error boundaries", () => {
  it("keeps sensitive transport failures out of the public error", async () => {
    const transport = new FetchCloudflareGetTransport({
      apiToken: "super-secret-token",
      fetchImpl: async () => {
        throw new Error("Authorization: Bearer super-secret-token");
      },
    });
    await expect(transport.get("/accounts")).rejects.toSatisfy((error: unknown) => {
      return (
        error instanceof BridgeError &&
        error.code === ERROR_CODES.CLOUDFLARE_API_REQUEST_FAILED &&
        !error.message.includes("super-secret-token") &&
        !JSON.stringify(error.details).includes("super-secret-token")
      );
    });
  });
});
