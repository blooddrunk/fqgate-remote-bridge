import { describe, expect, it, vi } from "vitest";
import { applyCloudflareB2Check, refuseCloudflareB2InSyncApply } from "../src/cloudflare/apply.js";
import { parseCloudflareB2Profile } from "../src/cloudflare/b2-profile.js";
import { validateCloudflareB2WriteCapabilities } from "../src/cloudflare/b2-capabilities.js";
import { FetchCloudflareB2WriteTransport } from "../src/cloudflare/b2-write-transport.js";
import { parseCloudflareDesiredState } from "../src/cloudflare/desired.js";
import { CloudflareDiscoveryService } from "../src/cloudflare/discovery.js";
import { reconcileCloudflareState } from "../src/cloudflare/reconcile.js";
import type { CloudflareContext, CloudflareDiscoveryClient } from "../src/cloudflare/types.js";

const contexts = ["human", "admin", "machine"] as const;
const hostnames = {
  human: "bridge.example.com",
  admin: "admin.example.com",
  machine: "machine.example.com",
};
const audiences = { human: "aud-human", admin: "aud-admin", machine: "aud-machine" };

function desired(withoutId?: CloudflareContext) {
  return parseCloudflareDesiredState({
    schemaVersion: "phase6a.v1",
    account: { id: "account-1", name: "Research" },
    zone: { id: "zone-1", name: "example.com" },
    tunnel: { id: "tunnel-1", name: "research", origin: "http://127.0.0.1:17282" },
    access: {
      teamDomain: "research.cloudflareaccess.com",
      teamName: "research",
      applications: Object.fromEntries(
        contexts.map((context) => [
          context,
          {
            ...(withoutId === context ? {} : { id: `app-${context}` }),
            name: `Research ${context}`,
            hostname: hostnames[context],
            audience: audiences[context],
            type: "self_hosted",
          },
        ]),
      ),
      policies: { human: {}, admin: {}, machine: {} },
    },
  });
}

function profile() {
  return parseCloudflareB2Profile({
    schemaVersion: "phase6b2.v1",
    policies: {
      human: {
        name: "human only",
        selector: { kind: "email", value: "operator@example.com" },
        sessionDuration: "12h",
      },
      admin: {
        name: "admin only",
        selector: { kind: "group", value: "admin-group" },
        sessionDuration: "30m",
      },
      machine: {
        name: "machine only",
        selector: { kind: "service_token", value: "machine-token" },
        sessionDuration: "12h",
      },
    },
  });
}

interface State {
  readonly missingRoute?: CloudflareContext;
  readonly unprotectedRoute?: CloudflareContext;
  readonly directFqgate?: CloudflareContext;
  readonly wildcard?: boolean;
  readonly duplicateRoute?: CloudflareContext;
  readonly missingApp?: CloudflareContext;
  readonly duplicateApp?: CloudflareContext;
  readonly missingPolicy?: CloudflareContext;
  readonly broadPolicy?: CloudflareContext;
  readonly wrongAudience?: CloudflareContext;
  readonly duplicateTunnel?: boolean;
  readonly nonLoopback?: CloudflareContext;
  readonly duplicatePolicy?: CloudflareContext;
  readonly crossProfilePolicy?: CloudflareContext;
  readonly renamedApp?: CloudflareContext;
  readonly disabledAdminMfa?: boolean;
}

function raw(state: State = {}) {
  const route = (context: CloudflareContext) => ({
    hostname: hostnames[context],
    service:
      state.directFqgate === context
        ? "http://127.0.0.1:17281"
        : state.nonLoopback === context
          ? "http://192.0.2.5:17282"
          : "http://127.0.0.1:17282",
    ...(state.unprotectedRoute === context
      ? {}
      : {
          originRequest: {
            access: { required: true, teamName: "research", audTag: [audiences[context]] },
          },
        }),
  });
  const ingress: unknown[] = contexts
    .filter((context) => state.missingRoute !== context)
    .map(route);
  if (state.duplicateRoute) ingress.push(route(state.duplicateRoute));
  if (state.wildcard)
    ingress.push({ hostname: "*.example.com", service: "http://127.0.0.1:17282" });
  ingress.push({ service: "http_status:404" });
  const applications = contexts
    .filter((context) => state.missingApp !== context)
    .map((context) => ({
      id: `app-${context}`,
      name: state.renamedApp === context ? `Old ${context}` : `Research ${context}`,
      domain: hostnames[context],
      aud: state.wrongAudience === context ? "aud-other" : audiences[context],
      type: "self_hosted",
      mfa_config: { mfa_disabled: false },
    }));
  if (state.duplicateApp)
    applications.push({
      id: "app-other",
      name: "duplicate",
      domain: hostnames[state.duplicateApp],
      aud: "aud-other",
      type: "self_hosted",
      mfa_config: { mfa_disabled: false },
    });
  const policies = Object.fromEntries(
    contexts.map((context) => {
      const selector =
        context === "machine"
          ? { service_token: { token_id: "machine-token" } }
          : context === "admin"
            ? { group: { id: "admin-group" } }
            : { email: { email: "operator@example.com" } };
      const entry = {
        id: `policy-${context}`,
        name: `${context} only`,
        decision: context === "machine" ? "non_identity" : "allow",
        precedence: 1,
        include: [
          state.broadPolicy === context
            ? { everyone: {} }
            : state.crossProfilePolicy === context
              ? { group: { id: "admin-group" } }
              : selector,
        ],
        require: [],
        exclude: [],
        session_duration: context === "admin" ? "30m" : "12h",
        ...(context === "admin"
          ? { mfa_config: { mfa_disabled: state.disabledAdminMfa === true } }
          : {}),
      };
      return [
        context,
        state.missingPolicy === context
          ? []
          : state.duplicatePolicy === context
            ? [entry, { ...entry, id: `policy-${context}-other` }]
            : [entry],
      ];
    }),
  ) as Record<CloudflareContext, unknown[]>;
  return {
    account: { id: "account-1", name: "Research" },
    zone: { id: "zone-1", name: "example.com", account: { id: "account-1" } },
    tunnel: {
      id: "tunnel-1",
      name: "research",
      config_src: "cloudflare",
      remote_config: true,
      status: "healthy",
    },
    tunnels: state.duplicateTunnel
      ? [
          {
            id: "tunnel-1",
            name: "research",
            config_src: "cloudflare",
            remote_config: true,
            status: "healthy",
          },
          {
            id: "tunnel-2",
            name: "research",
            config_src: "cloudflare",
            remote_config: true,
            status: "healthy",
          },
        ]
      : [
          {
            id: "tunnel-1",
            name: "research",
            config_src: "cloudflare",
            remote_config: true,
            status: "healthy",
          },
        ],
    configuration: { account_id: "account-1", version: 1, config: { ingress } },
    applications,
    policies,
  };
}

function client(state: () => State): CloudflareDiscoveryClient {
  const current = () => raw(state());
  return {
    listAccounts: async () => [current().account],
    getAccount: async () => current().account,
    listZones: async () => [current().zone],
    listTunnels: async () => current().tunnels,
    getTunnel: async () => current().tunnel,
    getTunnelConfiguration: async () => current().configuration,
    listDnsRecords: async (_zone, hostname) => [
      {
        id: `dns-${hostname}`,
        name: hostname,
        type: "CNAME",
        content: "tunnel-1.cfargotunnel.com",
        proxied: true,
      },
    ],
    listAccessApplications: async () => current().applications,
    listAccessPolicies: async (_account, appId) =>
      current().policies[appId.slice(4) as CloudflareContext],
  };
}

async function plan(state: State, withoutId?: CloudflareContext) {
  const wanted = desired(withoutId);
  return reconcileCloudflareState(
    wanted,
    await new CloudflareDiscoveryService(client(() => state)).discover(wanted),
  );
}

function fakeTransport(onWrite: () => void) {
  const writes: Array<{ type: string; id?: string }> = [];
  return {
    writes,
    transport: {
      replaceExactTunnelIngress: async () => {
        writes.push({ type: "tunnel" });
        onWrite();
      },
      createExactApplication: async () => {
        writes.push({ type: "application" });
        onWrite();
        return "app-human";
      },
      correctExactApplicationName: async () => {
        writes.push({ type: "application-update" });
        onWrite();
      },
      createExactPolicy: async () => {
        writes.push({ type: "policy" });
        onWrite();
        return "policy-machine";
      },
      tightenExactPolicy: async () => {
        writes.push({ type: "policy-update" });
        onWrite();
      },
    },
  };
}

describe("Phase 6-B2 exact policy profile", () => {
  it("rejects broad, machine-human reuse and admin sessions over 30 minutes", () => {
    const base = profile();
    expect(base.fingerprint).toMatch(/^[a-f0-9]{64}$/);
    const input = { schemaVersion: "phase6b2.v1", policies: structuredClone(base.policies) };
    (input.policies.machine as { selector: { kind: string; value: string } }).selector.kind =
      "email";
    expect(() => parseCloudflareB2Profile(input)).toThrow();
    (input.policies.machine as { selector: { kind: string; value: string } }).selector.kind =
      "service_token";
    (input.policies.admin as { sessionDuration: string }).sessionDuration = "1h";
    expect(() => parseCloudflareB2Profile(input)).toThrow();
  });
});

describe("Phase 6-B2 stale-plan and safety matrix", () => {
  it("refuses a live in-sync plan before any write credential or transport", async () => {
    const current = await plan({});
    await expect(
      refuseCloudflareB2InSyncApply({
        desired: desired(),
        expectedFingerprint: current.fingerprint,
        checkId: "tunnel.ingress.human.route",
        discoveryClient: client(() => ({})),
      }),
    ).rejects.toThrow("zero writes");
  });
  it("creates exactly one missing protected ingress route after two matching reads", async () => {
    let state: State = { missingRoute: "human" };
    const wanted = desired();
    const before = await plan(state);
    const { transport, writes } = fakeTransport(() => {
      state = {};
    });
    const result = await applyCloudflareB2Check({
      desired: wanted,
      expectedFingerprint: before.fingerprint,
      checkId: "tunnel.ingress.human.route",
      profile: profile(),
      expectedProfileFingerprint: profile().fingerprint,
      discoveryClient: client(() => state),
      createWriteTransport: () => transport,
      verifyRequiredRegression: async () => undefined,
    });
    expect(result.mutationCount).toBe(1);
    expect(writes).toEqual([{ type: "tunnel" }]);
  });

  it.each([
    ["direct 17281", { missingRoute: "human", directFqgate: "admin" }],
    ["non-loopback origin", { missingRoute: "human", nonLoopback: "admin" }],
    ["wildcard", { missingRoute: "human", wildcard: true }],
    ["duplicate route", { missingRoute: "human", duplicateRoute: "admin" }],
    ["wrong audience", { missingRoute: "human", wrongAudience: "admin" }],
    ["ambiguous Tunnel", { missingRoute: "human", duplicateTunnel: true }],
    ["broad policy", { missingRoute: "human", broadPolicy: "machine" }],
    ["duplicate policy", { missingRoute: "human", duplicatePolicy: "machine" }],
    ["cross-profile policy", { missingRoute: "human", crossProfilePolicy: "machine" }],
  ] as const)("rejects %s before any B2 write", async (_label, initial) => {
    const state: State = initial;
    const before = await plan(state);
    const { transport, writes } = fakeTransport(() => undefined);
    await expect(
      applyCloudflareB2Check({
        desired: desired(),
        expectedFingerprint: before.fingerprint,
        checkId: "tunnel.ingress.human.route",
        profile: profile(),
        expectedProfileFingerprint: profile().fingerprint,
        discoveryClient: client(() => state),
        createWriteTransport: () => transport,
        verifyRequiredRegression: async () => undefined,
      }),
    ).rejects.toThrow();
    expect(writes).toHaveLength(0);
  });

  it("rejects a stale fingerprint and an unrelated DNS check", async () => {
    const state: State = { missingRoute: "human" };
    const { transport, writes } = fakeTransport(() => undefined);
    const common = {
      desired: desired(),
      profile: profile(),
      expectedProfileFingerprint: profile().fingerprint,
      discoveryClient: client(() => state),
      createWriteTransport: () => transport,
      verifyRequiredRegression: async () => undefined,
    };
    await expect(
      applyCloudflareB2Check({
        ...common,
        expectedFingerprint: "0".repeat(64),
        checkId: "tunnel.ingress.human.route",
      }),
    ).rejects.toThrow();
    await expect(
      applyCloudflareB2Check({
        ...common,
        expectedFingerprint: (await plan(state)).fingerprint,
        checkId: "dns.human.record",
      }),
    ).rejects.toThrow();
    expect(writes).toHaveLength(0);
  });

  it("creates one exact machine policy without affecting human/admin identities", async () => {
    let state: State = { missingPolicy: "machine" };
    const before = await plan(state);
    const { transport, writes } = fakeTransport(() => {
      state = {};
    });
    const result = await applyCloudflareB2Check({
      desired: desired(),
      expectedFingerprint: before.fingerprint,
      checkId: "access.policy.machine.shape",
      profile: profile(),
      expectedProfileFingerprint: profile().fingerprint,
      discoveryClient: client(() => state),
      createWriteTransport: () => transport,
      verifyRequiredRegression: async () => undefined,
    });
    expect(result.resourceType).toBe("access_policy");
    expect(writes).toEqual([{ type: "policy" }]);
  });

  it("creates an exact application with an embedded narrow policy in one action", async () => {
    let state: State = { missingApp: "human" };
    const wanted = desired("human");
    const before = reconcileCloudflareState(
      wanted,
      await new CloudflareDiscoveryService(client(() => state)).discover(wanted),
    );
    const { transport, writes } = fakeTransport(() => {
      state = {};
    });
    const result = await applyCloudflareB2Check({
      desired: wanted,
      expectedFingerprint: before.fingerprint,
      checkId: "access.application.human.identity",
      profile: profile(),
      expectedProfileFingerprint: profile().fingerprint,
      discoveryClient: client(() => state),
      createWriteTransport: () => transport,
      verifyRequiredRegression: async () => undefined,
    });
    expect(result.resourceType).toBe("access_application");
    expect(writes).toEqual([{ type: "application" }]);
  });

  it("corrects an exact application name without changing its hostname or audience", async () => {
    let state: State = { renamedApp: "admin" };
    const before = await plan(state);
    const { transport, writes } = fakeTransport(() => {
      state = {};
    });
    const result = await applyCloudflareB2Check({
      desired: desired(),
      expectedFingerprint: before.fingerprint,
      checkId: "access.application.admin.identity",
      profile: profile(),
      expectedProfileFingerprint: profile().fingerprint,
      discoveryClient: client(() => state),
      createWriteTransport: () => transport,
      verifyRequiredRegression: async () => undefined,
    });
    expect(result.resourceId).toBe("app-admin");
    expect(writes).toEqual([{ type: "application-update" }]);
  });

  it("tightens the exact admin MFA policy in one action", async () => {
    let state: State = { disabledAdminMfa: true };
    const before = await plan(state);
    const { transport, writes } = fakeTransport(() => {
      state = {};
    });
    const result = await applyCloudflareB2Check({
      desired: desired(),
      expectedFingerprint: before.fingerprint,
      checkId: "access.policy.admin.mfa",
      profile: profile(),
      expectedProfileFingerprint: profile().fingerprint,
      discoveryClient: client(() => state),
      createWriteTransport: () => transport,
      verifyRequiredRegression: async () => undefined,
    });
    expect(result.resourceId).toBe("policy-admin");
    expect(writes).toEqual([{ type: "policy-update" }]);
  });
});

describe("Phase 6-B2 fixed HTTP and scope contract", () => {
  it("uses one fixed Tunnel PUT with a bounded, protected four-route body", async () => {
    const observed = await plan({ missingRoute: "human" });
    const requests: Array<{ url: string; method: string; body: unknown }> = [];
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      requests.push({
        url: String(url),
        method: init?.method ?? "",
        body: JSON.parse(String(init?.body)),
      });
      return new Response(
        JSON.stringify({
          success: true,
          result: { account_id: "account-1", config: { ingress: [1, 2, 3, 4] } },
        }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;
    const transport = new FetchCloudflareB2WriteTransport({
      apiToken: "hidden-write-token",
      fetchImpl,
    });
    await transport.replaceExactTunnelIngress(observed, [
      ...contexts.map((context) => ({
        hostname: hostnames[context],
        service: "http://127.0.0.1:17282",
        originRequest: {
          access: { required: true as const, teamName: "research", audTag: [audiences[context]] },
        },
      })),
      { service: "http_status:404" },
    ]);
    expect(requests).toHaveLength(1);
    expect(requests[0]?.url).toBe(
      "https://api.cloudflare.com/client/v4/accounts/account-1/cfd_tunnel/tunnel-1/configurations",
    );
    expect(requests[0]?.method).toBe("PUT");
    expect(JSON.stringify(requests[0]?.body)).not.toContain("17281");
  });

  it("rejects a direct 17281 payload with zero HTTP requests", async () => {
    const observed = await plan({ missingRoute: "human" });
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    const transport = new FetchCloudflareB2WriteTransport({
      apiToken: "hidden-write-token",
      fetchImpl,
    });
    const routes = contexts.map((context) => ({
      hostname: hostnames[context],
      service: context === "human" ? "http://127.0.0.1:17281" : "http://127.0.0.1:17282",
      originRequest: {
        access: { required: true as const, teamName: "research", audTag: [audiences[context]] },
      },
    }));
    await expect(
      transport.replaceExactTunnelIngress(observed, [...routes, { service: "http_status:404" }]),
    ).rejects.toThrow();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("requires an active, short-lived account token with exactly two scoped permissions", async () => {
    const calls: Array<{ url: string; method: string }> = [];
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), method: init?.method ?? "" });
      const result = String(url).endsWith("/verify")
        ? { id: "token-id", status: "active" }
        : {
            id: "token-id",
            status: "active",
            expires_on: new Date(Date.now() + 3600_000).toISOString(),
            policies: [
              {
                effect: "allow",
                permission_groups: [
                  { name: "Access: Apps and Policies Write" },
                  { name: "Cloudflare One Connector: cloudflared Write" },
                ],
                resources: { "com.cloudflare.api.account.account-1": "*" },
              },
            ],
          };
      return new Response(JSON.stringify({ success: true, result }), { status: 200 });
    }) as unknown as typeof fetch;
    await validateCloudflareB2WriteCapabilities({
      accountId: "account-1",
      writeToken: "hidden-write",
      scopeReadToken: "hidden-read",
      fetchImpl,
    });
    expect(calls).toEqual([
      {
        url: "https://api.cloudflare.com/client/v4/accounts/account-1/tokens/verify",
        method: "GET",
      },
      {
        url: "https://api.cloudflare.com/client/v4/accounts/account-1/tokens/token-id",
        method: "GET",
      },
    ]);
  });

  it.each([
    [
      "redirect",
      () => new Response("", { status: 302, headers: { location: "https://evil.example" } }),
    ],
    [
      "unexpected envelope",
      () =>
        new Response(
          JSON.stringify({ success: false, errors: [{ message: "hidden-write-token" }] }),
          { status: 200 },
        ),
    ],
    ["oversized body", () => new Response("x".repeat(2048), { status: 200 })],
  ] as const)(
    "fails a %s response without disclosing the write token",
    async (_label, response) => {
      const observed = await plan({ missingRoute: "human" });
      const fetchImpl = vi.fn(async () => response()) as unknown as typeof fetch;
      const transport = new FetchCloudflareB2WriteTransport({
        apiToken: "hidden-write-token",
        fetchImpl,
        maxResponseBytes: 1024,
      });
      const routes = [
        ...contexts.map((context) => ({
          hostname: hostnames[context],
          service: "http://127.0.0.1:17282",
          originRequest: {
            access: { required: true as const, teamName: "research", audTag: [audiences[context]] },
          },
        })),
        { service: "http_status:404" },
      ];
      const error = await transport
        .replaceExactTunnelIngress(observed, routes)
        .catch((failure: unknown) => failure);
      expect(String(error)).not.toContain("hidden-write-token");
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    },
  );

  it("reports a bounded manual-required result after a partial write with no compensating write", async () => {
    let state: State = { missingRoute: "human" };
    const before = await plan(state);
    const { transport, writes } = fakeTransport(() => {
      state = { missingRoute: "human", wildcard: true };
    });
    const error = await applyCloudflareB2Check({
      desired: desired(),
      expectedFingerprint: before.fingerprint,
      checkId: "tunnel.ingress.human.route",
      profile: profile(),
      expectedProfileFingerprint: profile().fingerprint,
      discoveryClient: client(() => state),
      createWriteTransport: () => transport,
      verifyRequiredRegression: async () => undefined,
    }).catch((failure: unknown) => failure);
    expect(String(error)).toContain("MANUAL_REQUIRED");
    expect(JSON.stringify(error)).not.toContain("machine-token");
    expect(writes).toEqual([{ type: "tunnel" }]);
  });

  it("rejects an over-scoped token before mutation", async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      const result = String(url).endsWith("/verify")
        ? { id: "token-id", status: "active" }
        : {
            id: "token-id",
            status: "active",
            expires_on: new Date(Date.now() + 3600_000).toISOString(),
            policies: [
              {
                effect: "allow",
                permission_groups: [
                  { name: "Access: Apps and Policies Write" },
                  { name: "Cloudflare One Connector: cloudflared Write" },
                  { name: "DNS Write" },
                ],
                resources: { "com.cloudflare.api.account.account-1": "*" },
              },
            ],
          };
      return new Response(JSON.stringify({ success: true, result }), { status: 200 });
    }) as unknown as typeof fetch;
    await expect(
      validateCloudflareB2WriteCapabilities({
        accountId: "account-1",
        writeToken: "hidden-write",
        scopeReadToken: "hidden-read",
        fetchImpl,
      }),
    ).rejects.toThrow("MANUAL_REQUIRED");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
