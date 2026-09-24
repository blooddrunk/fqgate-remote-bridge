import { describe, expect, it, vi } from "vitest";
import { applyCloudflareDnsCheck } from "../src/cloudflare/apply.js";
import { runCloudflareDnsCanary } from "../src/cloudflare/canary.js";
import { CloudflareDiscoveryService } from "../src/cloudflare/discovery.js";
import { reconcileCloudflareState } from "../src/cloudflare/reconcile.js";
import type {
  CloudflareApplicationObservation,
  CloudflareContext,
  CloudflareDesiredState,
  CloudflareDiscoveryClient,
  CloudflareDnsObservation,
  CloudflareIngressObservation,
  CloudflareObservedState,
  CloudflarePolicyObservation,
  CloudflareReadOnlyPlan,
  CloudflareSelection,
  CloudflareTunnelConfigurationObservation,
} from "../src/cloudflare/types.js";
import {
  CLOUDFLARE_B1_CANARY_PREFIX,
  FetchCloudflareDnsApplyWriteTransport,
  FetchCloudflareDnsCanaryWriteTransport,
  type CloudflareCreatedDnsRecordHandle,
  type CloudflareDnsApplyWriteTransport,
  type CloudflareDnsCanaryWriteTransport,
  type CloudflareDnsRecordReceipt,
} from "../src/cloudflare/write-transport.js";
import { parseCloudflareDesiredState } from "../src/cloudflare/desired.js";
import { BridgeError, ERROR_CODES } from "../src/shared/errors.js";

const contexts = ["human", "admin", "machine"] as const satisfies readonly CloudflareContext[];

function desired(): CloudflareDesiredState {
  return parseCloudflareDesiredState({
    schemaVersion: "phase6a.v1",
    account: { id: "account-1", name: "Research" },
    zone: { id: "zone-1", name: "example.com" },
    tunnel: { id: "tunnel-1", name: "research-bridge", origin: "http://127.0.0.1:17282" },
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
  });
}

interface StateOptions {
  readonly missingDns?: readonly CloudflareContext[];
  readonly duplicateDns?: CloudflareContext;
  readonly recordIdFor?: Partial<Record<CloudflareContext, string>>;
  readonly directFqgateIngress?: boolean;
  readonly missingAdminApplication?: boolean;
  readonly unprovenAdminMfa?: boolean;
}

function observedState(options: StateOptions = {}): CloudflareObservedState {
  const desiredState = desired();
  const dns = Object.fromEntries(
    contexts.map((context) => {
      const hostname = desiredState.access.applications[context].hostname;
      const normal = {
        id: options.recordIdFor?.[context] ?? `dns-${context}`,
        name: hostname,
        type: "CNAME",
        content: "tunnel-1.cfargotunnel.com",
        proxied: true,
      } satisfies CloudflareDnsObservation;
      if (options.missingDns?.includes(context)) {
        return [
          context,
          {
            status: "missing",
            candidates: [],
          } satisfies CloudflareSelection<CloudflareDnsObservation>,
        ];
      }
      if (options.duplicateDns === context) {
        return [
          context,
          {
            status: "ambiguous",
            candidates: [normal, { ...normal, id: `${normal.id}-duplicate` }],
          } satisfies CloudflareSelection<CloudflareDnsObservation>,
        ];
      }
      return [
        context,
        {
          status: "found",
          candidates: [normal],
          selected: normal,
        } satisfies CloudflareSelection<CloudflareDnsObservation>,
      ];
    }),
  ) as CloudflareObservedState["dns"];

  const applications = Object.fromEntries(
    contexts.map((context) => {
      const app = desiredState.access.applications[context];
      const selected: CloudflareApplicationObservation = {
        id: app.id ?? `app-${context}`,
        name: app.name,
        domain: app.hostname,
        audience: app.audience,
        type: app.type,
        mfaDisabled: context === "admin" ? (options.unprovenAdminMfa ? null : false) : null,
      };
      if (context === "admin" && options.missingAdminApplication) {
        return [
          context,
          {
            status: "missing",
            candidates: [],
          } satisfies CloudflareSelection<CloudflareApplicationObservation>,
        ];
      }
      return [
        context,
        {
          status: "found",
          candidates: [selected],
          selected,
        } satisfies CloudflareSelection<CloudflareApplicationObservation>,
      ];
    }),
  ) as CloudflareObservedState["applications"];

  const ingress: CloudflareIngressObservation[] = contexts.map((context) => {
    const app = desiredState.access.applications[context];
    return {
      hostname: app.hostname,
      path: null,
      service:
        options.directFqgateIngress && context === "machine"
          ? "http://127.0.0.1:17281"
          : "http://127.0.0.1:17282",
      access: { required: true, teamName: "research", audienceTags: [app.audience] },
    };
  });
  ingress.push({ hostname: null, path: null, service: "http_status:404", access: null });
  const configuration: CloudflareTunnelConfigurationObservation = {
    accountId: "account-1",
    version: 4,
    ingress,
  };
  const policies = {
    human: {
      status: "found",
      policies: [policy({ id: "policy-human", decision: "allow", includeKinds: ["email_domain"] })],
    },
    admin: {
      status: options.missingAdminApplication ? "blocked" : "found",
      policies: [
        policy({
          id: "policy-admin",
          decision: "allow",
          includeKinds: ["group"],
          mfaDisabled: options.unprovenAdminMfa ? null : false,
        }),
      ],
    },
    machine: {
      status: "found",
      policies: [
        policy({
          id: "policy-machine",
          decision: "non_identity",
          includeKinds: ["service_token"],
          nonIdentitySelectorCount: 1,
        }),
      ],
    },
  } satisfies CloudflareObservedState["policies"];

  const account = { id: "account-1", name: "Research" };
  const zone = { id: "zone-1", name: "example.com", accountId: "account-1" };
  const tunnel = {
    id: "tunnel-1",
    name: "research-bridge",
    configSrc: "cloudflare",
    remoteConfig: true,
    status: "healthy",
  };
  return {
    account: { status: "found", candidates: [account], selected: account },
    zone: { status: "found", candidates: [zone], selected: zone },
    tunnel: { status: "found", candidates: [tunnel], selected: tunnel },
    tunnelConfiguration: { status: "found", candidates: [configuration], selected: configuration },
    dns,
    applications,
    unexpectedApplications: [],
    policies,
  };
}

function policy(overrides: Partial<CloudflarePolicyObservation> = {}): CloudflarePolicyObservation {
  return {
    id: "policy",
    name: "policy",
    decision: "allow",
    precedence: 1,
    includeKinds: ["group"],
    requireKinds: [],
    excludeKinds: [],
    broadSelector: false,
    nonIdentitySelectorCount: 0,
    mfaDisabled: null,
    sessionDuration: "12h",
    ...overrides,
  };
}

function fakeDiscoveryClient(
  states: readonly CloudflareObservedState[],
  reservedRecords: (hostname: string) => readonly unknown[] = () => [],
): CloudflareDiscoveryClient {
  let index = -1;
  const current = () => states[Math.min(Math.max(index, 0), states.length - 1)] ?? observedState();
  return {
    listAccounts: async () => [rawAccount(current())],
    getAccount: async () => {
      index += 1;
      return rawAccount(current());
    },
    listZones: async () => [rawZone(current())],
    listTunnels: async () => [rawTunnel(current())],
    getTunnel: async () => rawTunnel(current()),
    getTunnelConfiguration: async () => rawConfiguration(current()),
    listDnsRecords: async (_zoneId, hostname) => {
      if (hostname.startsWith(CLOUDFLARE_B1_CANARY_PREFIX)) return reservedRecords(hostname);
      const context = contexts.find(
        (item) => desired().access.applications[item].hostname === hostname,
      );
      if (context === undefined) return [];
      return current().dns[context].candidates.map(rawDns);
    },
    listAccessApplications: async () =>
      contexts
        .flatMap((context) => current().applications[context].candidates.map(rawApplication))
        .concat(current().unexpectedApplications.map(rawApplication)),
    listAccessPolicies: async (_accountId, applicationId) => {
      const context = contexts.find(
        (item) => desired().access.applications[item].id === applicationId,
      );
      return context === undefined ? [] : current().policies[context].policies.map(rawPolicy);
    },
  };
}

function rawAccount(state: CloudflareObservedState): unknown {
  const value = state.account.selected ?? state.account.candidates[0];
  return value === undefined
    ? { id: "account-1", name: "Research" }
    : { id: value.id, name: value.name };
}

function rawZone(state: CloudflareObservedState): unknown {
  const value = state.zone.selected ?? state.zone.candidates[0];
  return value === undefined
    ? { id: "zone-1", name: "example.com", account: { id: "account-1" } }
    : { id: value.id, name: value.name, account: { id: value.accountId } };
}

function rawTunnel(state: CloudflareObservedState): unknown {
  const value = state.tunnel.selected ?? state.tunnel.candidates[0];
  if (value === undefined)
    return {
      id: "tunnel-1",
      name: "research-bridge",
      config_src: "cloudflare",
      remote_config: true,
    };
  return {
    id: value.id,
    name: value.name,
    config_src: value.configSrc,
    remote_config: value.remoteConfig,
    status: value.status,
  };
}

function rawConfiguration(state: CloudflareObservedState): unknown {
  const value = state.tunnelConfiguration.selected ?? state.tunnelConfiguration.candidates[0];
  if (value === undefined) return { account_id: "account-1", config: { ingress: [] } };
  return {
    account_id: value.accountId,
    version: value.version,
    config: {
      ingress: value.ingress.map((route) => ({
        hostname: route.hostname,
        path: route.path,
        service: route.service,
        ...(route.access === null
          ? {}
          : {
              originRequest: {
                access: {
                  required: route.access.required,
                  teamName: route.access.teamName,
                  audTag: route.access.audienceTags,
                },
              },
            }),
      })),
    },
  };
}

function rawDns(value: CloudflareDnsObservation): unknown {
  return {
    id: value.id,
    name: value.name,
    type: value.type,
    content: value.content,
    proxied: value.proxied,
  };
}

function rawApplication(value: CloudflareApplicationObservation): unknown {
  return {
    id: value.id,
    name: value.name,
    domain: value.domain,
    aud: value.audience,
    type: value.type,
    mfa_config: { mfa_disabled: value.mfaDisabled },
  };
}

function rawPolicy(value: CloudflarePolicyObservation): unknown {
  return {
    id: value.id,
    name: value.name,
    decision: value.decision,
    precedence: value.precedence,
    include: value.includeKinds.map((kind) => ({ [kind]: {} })),
    require: value.requireKinds.map((kind) => ({ [kind]: {} })),
    exclude: value.excludeKinds.map((kind) => ({ [kind]: {} })),
    mfa_config: { mfa_disabled: value.mfaDisabled },
    session_duration: value.sessionDuration,
  };
}

async function planFor(state: CloudflareObservedState): Promise<CloudflareReadOnlyPlan> {
  const desiredState = desired();
  const observed = await new CloudflareDiscoveryService(fakeDiscoveryClient([state])).discover(
    desiredState,
  );
  return reconcileCloudflareState(desiredState, observed);
}

function fakeWriteTransport(
  options: {
    readonly createError?: Error;
    readonly rollbackError?: Error;
    readonly receiptId?: string;
    readonly calls?: { create: number; rollback: number; input?: unknown; handle?: unknown };
  } = {},
): CloudflareDnsApplyWriteTransport {
  const calls: { create: number; rollback: number; input?: unknown; handle?: unknown } =
    options.calls ?? { create: 0, rollback: 0 };
  const receiptId = options.receiptId ?? "created-record-1";
  const handle = { recordId: receiptId } as CloudflareCreatedDnsRecordHandle;
  return {
    createDesiredCname: async (plan, checkId) => {
      calls.create += 1;
      calls.input = { plan, checkId };
      if (options.createError !== undefined) throw options.createError;
      const context = contexts.find((item) => `dns.${item}.record` === checkId);
      if (context === undefined) throw new Error("invalid fixture check id");
      return {
        id: receiptId,
        name: plan.desired.access.applications[context].hostname,
        type: "CNAME",
        content: "tunnel-1.cfargotunnel.com",
        proxied: true,
        handle,
      };
    },
    rollbackCreatedRecord: async (got) => {
      calls.rollback += 1;
      calls.handle = got;
      if (options.rollbackError !== undefined) throw options.rollbackError;
    },
  };
}

function handleFor(recordId: string): CloudflareCreatedDnsRecordHandle {
  return { recordId } as CloudflareCreatedDnsRecordHandle;
}

function canaryReceipt(
  name: string,
  content: string,
  recordId = "canary-id",
): CloudflareDnsRecordReceipt {
  return {
    id: recordId,
    name,
    type: "TXT",
    content,
    proxied: false,
    handle: handleFor(recordId),
  };
}

describe("Phase 6-B1 guarded Cloudflare DNS apply", () => {
  it("rejects a stale initial fingerprint before constructing a write transport", async () => {
    const state = observedState({ missingDns: ["human"] });
    const calls: { create: number; rollback: number; input?: unknown; handle?: unknown } = {
      create: 0,
      rollback: 0,
    };
    await expect(
      applyCloudflareDnsCheck({
        desired: desired(),
        expectedFingerprint: "0".repeat(64),
        checkId: "dns.human.record",
        discoveryClient: fakeDiscoveryClient([state]),
        createWriteTransport: () => fakeWriteTransport({ calls }),
        verifyRequiredRegression: async () => undefined,
      }),
    ).rejects.toMatchObject({ code: ERROR_CODES.CLOUDFLARE_APPLY_STALE });
    expect(calls.create).toBe(0);
  });

  it("re-reads immediately before POST and rejects safe TOCTOU drift", async () => {
    const initial = observedState({ missingDns: ["human"] });
    const changed = observedState();
    const expected = (await planFor(initial)).fingerprint;
    const calls: { create: number; rollback: number; input?: unknown; handle?: unknown } = {
      create: 0,
      rollback: 0,
    };
    await expect(
      applyCloudflareDnsCheck({
        desired: desired(),
        expectedFingerprint: expected,
        checkId: "dns.human.record",
        discoveryClient: fakeDiscoveryClient([initial, changed]),
        createWriteTransport: () => fakeWriteTransport({ calls }),
        verifyRequiredRegression: async () => undefined,
      }),
    ).rejects.toMatchObject({ code: ERROR_CODES.CLOUDFLARE_APPLY_STALE });
    expect(calls.create).toBe(0);
  });

  it.each([
    ["unsafe", observedState({ missingDns: ["human"], directFqgateIngress: true })],
    ["ambiguous", observedState({ missingDns: ["human"], duplicateDns: "machine" })],
    ["blocked", observedState({ missingDns: ["human"], missingAdminApplication: true })],
    ["manual-required", observedState({ missingDns: ["human"], unprovenAdminMfa: true })],
  ])("rejects a plan containing a %s check before any write", async (_label, state) => {
    const expected = (await planFor(state)).fingerprint;
    const calls = { create: 0, rollback: 0 };
    await expect(
      applyCloudflareDnsCheck({
        desired: desired(),
        expectedFingerprint: expected,
        checkId: "dns.human.record",
        discoveryClient: fakeDiscoveryClient([state]),
        createWriteTransport: () => fakeWriteTransport({ calls }),
        verifyRequiredRegression: async () => undefined,
      }),
    ).rejects.toMatchObject({ code: ERROR_CODES.CLOUDFLARE_UNSAFE_CONFLICT });
    expect(calls.create).toBe(0);
  });

  it("rejects unsupported check IDs and non-create actions", async () => {
    const missing = observedState({ missingDns: ["human"] });
    const expected = (await planFor(missing)).fingerprint;
    await expect(
      applyCloudflareDnsCheck({
        desired: desired(),
        expectedFingerprint: expected,
        checkId: "access.policy.human.shape",
        discoveryClient: fakeDiscoveryClient([missing]),
        createWriteTransport: () => fakeWriteTransport(),
        verifyRequiredRegression: async () => undefined,
      }),
    ).rejects.toMatchObject({ code: ERROR_CODES.CLOUDFLARE_APPLY_REJECTED });

    const inSync = observedState();
    const inSyncFingerprint = (await planFor(inSync)).fingerprint;
    await expect(
      applyCloudflareDnsCheck({
        desired: desired(),
        expectedFingerprint: inSyncFingerprint,
        checkId: "dns.human.record",
        discoveryClient: fakeDiscoveryClient([inSync]),
        createWriteTransport: () => fakeWriteTransport(),
        verifyRequiredRegression: async () => undefined,
      }),
    ).rejects.toMatchObject({ code: ERROR_CODES.CLOUDFLARE_APPLY_REJECTED });
  });

  it("applies only the selected DNS record and derives its CNAME from the plan", async () => {
    const missing = observedState({ missingDns: ["admin"] });
    const created = observedState({ recordIdFor: { admin: "created-record-1" } });
    const expected = (await planFor(missing)).fingerprint;
    const calls: { create: number; rollback: number; input?: unknown; handle?: unknown } = {
      create: 0,
      rollback: 0,
    };
    const write = fakeWriteTransport({ calls });
    let regressionCalls = 0;
    const result = await applyCloudflareDnsCheck({
      desired: desired(),
      expectedFingerprint: expected,
      checkId: "dns.admin.record",
      discoveryClient: fakeDiscoveryClient([missing, missing, created]),
      createWriteTransport: () => write,
      verifyRequiredRegression: async () => {
        regressionCalls += 1;
      },
    });
    expect(calls.create).toBe(1);
    expect(calls.rollback).toBe(0);
    expect(regressionCalls).toBe(1);
    expect(result).toMatchObject({
      status: "applied",
      checkId: "dns.admin.record",
      hostname: "admin.example.com",
      type: "CNAME",
      content: "tunnel-1.cfargotunnel.com",
      proxied: true,
      oldFingerprintInvalidated: true,
    });
    expect(result.fingerprintBefore).toBe(expected);
    expect(result.fingerprintAfter).not.toBe(expected);
    expect(calls.input).toMatchObject({
      checkId: "dns.admin.record",
      plan: {
        observed: {
          zone: { selected: { id: "zone-1" } },
          tunnel: { selected: { id: "tunnel-1" } },
        },
      },
    });
  });

  it("does not try rollback when the DNS POST fails", async () => {
    const missing = observedState({ missingDns: ["human"] });
    const expected = (await planFor(missing)).fingerprint;
    const calls = { create: 0, rollback: 0 };
    await expect(
      applyCloudflareDnsCheck({
        desired: desired(),
        expectedFingerprint: expected,
        checkId: "dns.human.record",
        discoveryClient: fakeDiscoveryClient([missing, missing]),
        createWriteTransport: () =>
          fakeWriteTransport({
            calls,
            createError: new BridgeError(ERROR_CODES.CLOUDFLARE_WRITE_FAILED, "create failed"),
          }),
        verifyRequiredRegression: async () => undefined,
      }),
    ).rejects.toMatchObject({ code: ERROR_CODES.CLOUDFLARE_WRITE_FAILED });
    expect(calls).toMatchObject({ create: 1, rollback: 0 });
  });

  it("rolls back the exact create receipt when postcondition verification fails", async () => {
    const missing = observedState({ missingDns: ["human"] });
    const expected = (await planFor(missing)).fingerprint;
    const calls: { create: number; rollback: number; input?: unknown; handle?: unknown } = {
      create: 0,
      rollback: 0,
    };
    await expect(
      applyCloudflareDnsCheck({
        desired: desired(),
        expectedFingerprint: expected,
        checkId: "dns.human.record",
        discoveryClient: fakeDiscoveryClient([missing, missing, missing, missing]),
        createWriteTransport: () => fakeWriteTransport({ calls }),
        verifyRequiredRegression: async () => undefined,
      }),
    ).rejects.toMatchObject({
      code: ERROR_CODES.CLOUDFLARE_POSTCONDITION_FAILED,
      details: { recordId: "created-record-1", rolledBack: true },
    });
    expect(calls.create).toBe(1);
    expect(calls.rollback).toBe(1);
    expect(calls.handle).toMatchObject({ recordId: "created-record-1" });
  });

  it("rolls back when the required regression fails and reports rollback failure distinctly", async () => {
    const missing = observedState({ missingDns: ["human"] });
    const created = observedState({ recordIdFor: { human: "created-record-1" } });
    const expected = (await planFor(missing)).fingerprint;
    const rollbackCalls = { create: 0, rollback: 0 };
    await expect(
      applyCloudflareDnsCheck({
        desired: desired(),
        expectedFingerprint: expected,
        checkId: "dns.human.record",
        discoveryClient: fakeDiscoveryClient([missing, missing, created, missing]),
        createWriteTransport: () =>
          fakeWriteTransport({ calls: rollbackCalls, rollbackError: new Error("delete rejected") }),
        verifyRequiredRegression: async () => {
          throw new BridgeError(ERROR_CODES.CLOUDFLARE_POSTCONDITION_FAILED, "regression failed");
        },
      }),
    ).rejects.toMatchObject({ code: ERROR_CODES.CLOUDFLARE_POSTCONDITION_FAILED });
    expect(rollbackCalls.rollback).toBe(1);

    const failedRestoreCalls = { create: 0, rollback: 0 };
    await expect(
      applyCloudflareDnsCheck({
        desired: desired(),
        expectedFingerprint: expected,
        checkId: "dns.human.record",
        discoveryClient: fakeDiscoveryClient([missing, missing, created, created]),
        createWriteTransport: () =>
          fakeWriteTransport({
            calls: failedRestoreCalls,
            rollbackError: new BridgeError(ERROR_CODES.CLOUDFLARE_WRITE_FAILED, "delete failed"),
          }),
        verifyRequiredRegression: async () => {
          throw new Error("regression failed");
        },
      }),
    ).rejects.toSatisfy((error: unknown) => {
      return (
        error instanceof BridgeError &&
        error.code === ERROR_CODES.CLOUDFLARE_ROLLBACK_FAILED &&
        error.details?.recordId === "created-record-1" &&
        !JSON.stringify(error).includes("secret")
      );
    });
  });
});

describe("Phase 6-B1 fixed DNS write transport", () => {
  it("exposes only typed create and same-invocation rollback methods with an exact CNAME payload", async () => {
    const plan = await planFor(observedState({ missingDns: ["human"] }));
    const calls: { url: string; init: RequestInit }[] = [];
    const transport = new FetchCloudflareDnsApplyWriteTransport({
      apiToken: "scoped-write-token",
      fetchImpl: async (input, init) => {
        calls.push({ url: String(input), init: init ?? {} });
        const result =
          init?.method === "POST"
            ? {
                id: "cloudflare-record-id",
                name: "bridge.example.com",
                type: "CNAME",
                content: "tunnel-1.cfargotunnel.com",
                proxied: true,
              }
            : { id: "cloudflare-record-id" };
        return new Response(JSON.stringify({ success: true, result }), { status: 200 });
      },
    });
    const publicMethods = Object.getOwnPropertyNames(Object.getPrototypeOf(transport)).sort();
    expect(publicMethods).toEqual(["constructor", "createDesiredCname", "rollbackCreatedRecord"]);
    expect(Object.keys(transport)).toEqual([]);

    const receipt = await transport.createDesiredCname(plan, "dns.human.record");
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({
      type: "CNAME",
      name: "bridge.example.com",
      content: "tunnel-1.cfargotunnel.com",
      proxied: true,
    });
    expect(calls[0]?.url).toBe("https://api.cloudflare.com/client/v4/zones/zone-1/dns_records");
    expect(calls[0]?.init).toMatchObject({ method: "POST", redirect: "error" });
    await transport.rollbackCreatedRecord(receipt.handle);
    expect(calls[1]?.url).toBe(
      "https://api.cloudflare.com/client/v4/zones/zone-1/dns_records/cloudflare-record-id",
    );
    expect(calls[1]?.init).toMatchObject({ method: "DELETE", redirect: "error" });
    await expect(
      transport.rollbackCreatedRecord(handleFor("caller-chosen-id")),
    ).rejects.toMatchObject({
      code: ERROR_CODES.CLOUDFLARE_WRITE_FAILED,
    });
    expect(calls).toHaveLength(2);
  });

  it("keeps TXT creation scoped to the fixed reserved canary name and bounded commit metadata", async () => {
    const plan = await planFor(observedState());
    const calls: { url: string; init: RequestInit }[] = [];
    const name = `${CLOUDFLARE_B1_CANARY_PREFIX}example.com`;
    const content = `phase6b1;commit=${"d".repeat(40)};evidence=P6B1-W3`;
    const transport = new FetchCloudflareDnsCanaryWriteTransport({
      apiToken: "scoped-write-token",
      fetchImpl: async (input, init) => {
        calls.push({ url: String(input), init: init ?? {} });
        const result =
          init?.method === "POST"
            ? { id: "canary-returned-id", name, type: "TXT", content, proxied: false }
            : { id: "canary-returned-id" };
        return new Response(JSON.stringify({ success: true, result }), { status: 200 });
      },
    });
    expect(Object.getOwnPropertyNames(Object.getPrototypeOf(transport)).sort()).toEqual([
      "constructor",
      "createReservedCanary",
      "deleteCanaryRecord",
    ]);
    const created = await transport.createReservedCanary(plan, "d".repeat(40));
    expect(created.content).toBe(content);
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({
      type: "TXT",
      name,
      content,
      proxied: false,
    });
    expect(calls[0]?.url).toBe("https://api.cloudflare.com/client/v4/zones/zone-1/dns_records");
    await transport.deleteCanaryRecord(created.receipt.handle);
    expect(calls[1]?.url).toBe(
      "https://api.cloudflare.com/client/v4/zones/zone-1/dns_records/canary-returned-id",
    );
    expect(calls[1]?.init.method).toBe("DELETE");
  });

  it("rejects arbitrary check IDs and invalid zone/hostname-derived data before network", async () => {
    const plan = await planFor(observedState({ missingDns: ["human"] }));
    const fetchImpl = vi.fn(async () => new Response("{}", { status: 200 }));
    const transport = new FetchCloudflareDnsApplyWriteTransport({
      apiToken: "write-token",
      fetchImpl,
    });
    await expect(transport.createDesiredCname(plan, "dns.foo.record")).rejects.toMatchObject({
      code: ERROR_CODES.CLOUDFLARE_APPLY_REJECTED,
    });
    const tampered = {
      ...plan,
      observed: {
        ...plan.observed,
        zone: {
          status: "found",
          candidates: [{ id: "../zone", name: "example.com", accountId: "account-1" }],
          selected: { id: "../zone", name: "example.com", accountId: "account-1" },
        },
      },
    } as unknown as CloudflareReadOnlyPlan;
    await expect(transport.createDesiredCname(tampered, "dns.human.record")).rejects.toMatchObject({
      code: ERROR_CODES.CLOUDFLARE_APPLY_REJECTED,
    });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect("get" in transport).toBe(false);
    expect("request" in transport).toBe(false);
  });

  it("rejects redirects, bounded-body overflow, invalid envelopes, timeouts, and token leakage", async () => {
    const plan = await planFor(observedState({ missingDns: ["human"] }));
    const redirect = new FetchCloudflareDnsApplyWriteTransport({
      apiToken: "write-token",
      fetchImpl: async (_input, init) => {
        expect(init?.redirect).toBe("error");
        return new Response("redirect", {
          status: 302,
          headers: { location: "https://evil.invalid" },
        });
      },
    });
    await expect(redirect.createDesiredCname(plan, "dns.human.record")).rejects.toMatchObject({
      code: ERROR_CODES.CLOUDFLARE_WRITE_FAILED,
    });

    const oversized = new FetchCloudflareDnsApplyWriteTransport({
      apiToken: "write-token",
      maxResponseBytes: 1_024,
      fetchImpl: async () => new Response("x".repeat(1_025), { status: 200 }),
    });
    await expect(oversized.createDesiredCname(plan, "dns.human.record")).rejects.toMatchObject({
      code: ERROR_CODES.CLOUDFLARE_API_RESPONSE_TOO_LARGE,
    });

    const invalidEnvelope = new FetchCloudflareDnsApplyWriteTransport({
      apiToken: "write-token",
      fetchImpl: async () => new Response(JSON.stringify({ success: true }), { status: 200 }),
    });
    await expect(
      invalidEnvelope.createDesiredCname(plan, "dns.human.record"),
    ).rejects.toMatchObject({
      code: ERROR_CODES.CLOUDFLARE_WRITE_FAILED,
    });

    vi.useFakeTimers();
    try {
      const timeout = new FetchCloudflareDnsApplyWriteTransport({
        apiToken: "write-token",
        timeoutMs: 1_000,
        fetchImpl: async (_input, init) =>
          await new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () =>
              reject(new DOMException("aborted", "AbortError")),
            );
          }),
      });
      const pending = timeout.createDesiredCname(plan, "dns.human.record");
      const rejection = expect(pending).rejects.toMatchObject({
        code: ERROR_CODES.CLOUDFLARE_WRITE_FAILED,
      });
      await vi.advanceTimersByTimeAsync(1_000);
      await rejection;
    } finally {
      vi.useRealTimers();
    }

    const secret = "write-token-very-secret";
    const redacting = new FetchCloudflareDnsApplyWriteTransport({
      apiToken: secret,
      fetchImpl: async () => {
        throw new Error(`Authorization: Bearer ${secret}`);
      },
    });
    await expect(redacting.createDesiredCname(plan, "dns.human.record")).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof Error &&
        !error.message.includes(secret) &&
        !JSON.stringify(error).includes(secret),
    );
  });
});

describe("Phase 6-B1 reserved DNS write canary", () => {
  it("refuses a pre-existing reserved name without writing or deleting it", async () => {
    const planState = observedState();
    const desiredState = desired();
    const writeTransport: CloudflareDnsCanaryWriteTransport = {
      createReservedCanary: vi.fn(async () => {
        throw new Error("must not write");
      }),
      deleteCanaryRecord: vi.fn(async () => undefined),
    };
    await expect(
      runCloudflareDnsCanary({
        desired: desiredState,
        discoveryClient: fakeDiscoveryClient([planState], () => [{ id: "existing-record" }]),
        writeTransport,
        commitSha: "a".repeat(40),
      }),
    ).rejects.toMatchObject({ code: ERROR_CODES.CLOUDFLARE_CANARY_COLLISION });
    expect(writeTransport.createReservedCanary).not.toHaveBeenCalled();
    expect(writeTransport.deleteCanaryRecord).not.toHaveBeenCalled();
  });

  it("creates, reads, deletes only the returned TXT ID, and verifies absence", async () => {
    const planState = observedState();
    const desiredState = desired();
    const name = `${CLOUDFLARE_B1_CANARY_PREFIX}${desiredState.zone.name}`;
    let records: readonly unknown[] = [];
    let readCount = 0;
    const content = `phase6b1;commit=${"b".repeat(40)};evidence=P6B1-W3`;
    const receipt = canaryReceipt(name, content, "returned-canary-record-id");
    const writeTransport: CloudflareDnsCanaryWriteTransport = {
      createReservedCanary: vi.fn(async () => {
        records = [{ id: receipt.id, name, type: "TXT", content, proxied: false }];
        return { receipt, content };
      }),
      deleteCanaryRecord: vi.fn(async (handle) => {
        expect(handle).toBe(receipt.handle);
        records = [];
      }),
    };
    const discoveryClient = fakeDiscoveryClient([planState], () => {
      readCount += 1;
      return records;
    });
    const result = await runCloudflareDnsCanary({
      desired: desiredState,
      discoveryClient,
      writeTransport,
      commitSha: "b".repeat(40),
    });
    expect(result).toMatchObject({
      status: "created_and_cleaned",
      name,
      type: "TXT",
      recordId: receipt.id,
      cleanupVerified: true,
    });
    expect(writeTransport.createReservedCanary).toHaveBeenCalledTimes(1);
    expect(writeTransport.deleteCanaryRecord).toHaveBeenCalledTimes(1);
    expect(readCount).toBe(3);
    expect(records).toEqual([]);
  });

  it("always cleans up after a failed canary postcondition", async () => {
    const planState = observedState();
    const desiredState = desired();
    const name = `${CLOUDFLARE_B1_CANARY_PREFIX}${desiredState.zone.name}`;
    const content = `phase6b1;commit=${"c".repeat(40)};evidence=P6B1-W3`;
    const receipt = canaryReceipt(name, content);
    let reads = 0;
    let recordPresent = false;
    const writeTransport: CloudflareDnsCanaryWriteTransport = {
      createReservedCanary: async () => {
        recordPresent = true;
        return { receipt, content };
      },
      deleteCanaryRecord: async (handle) => {
        expect(handle).toBe(receipt.handle);
        recordPresent = false;
      },
    };
    await expect(
      runCloudflareDnsCanary({
        desired: desiredState,
        discoveryClient: fakeDiscoveryClient([planState], () => {
          reads += 1;
          if (!recordPresent) return [];
          return [{ id: receipt.id, name, type: "TXT", content: "wrong-content", proxied: false }];
        }),
        writeTransport,
        commitSha: "c".repeat(40),
      }),
    ).rejects.toMatchObject({ code: ERROR_CODES.CLOUDFLARE_CANARY_FAILED });
    expect(reads).toBe(3);
    expect(recordPresent).toBe(false);
  });
});
