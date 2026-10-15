import { afterEach, describe, expect, it, vi } from "vitest";
import { FqgateV2QrAdapter, V2_QR_FINGERPRINT } from "../src/bridge/qr/v2.js";
import { BridgeService } from "../src/bridge/service.js";
import { FqgateQrAdapter } from "../src/bridge/qr/adapter.js";
import { QrFlowRegistry } from "../src/bridge/qr/registry.js";
import { createBridgeHttpHandler } from "../src/bridge/transport/http.js";
import { parseConfig } from "../src/config/config.js";
import * as contracts from "../src/fqgate/market/contract.js";
import type { HttpRequestOptions } from "../src/fqgate/release/http.js";
import type { FqgateStatus } from "../src/fqgate/install/lifecycle.js";

const image =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
const source = (n = 1) => ({
  instanceId: `private-source-${n}`,
  instanceNo: n,
  pid: 100 + n,
  restartCount: 0,
  autoLogin: true,
  defaultGuest: false,
  providerId: "tonghuashun",
  workerState: "ready",
  session: { state: "disconnected" },
});
function fixture(instanceNumber?: number) {
  const f = {
    sources: [source()],
    version: "2.0.5",
    now: 0,
    postStatus: 200,
    begin: {
      flow_id: 42,
      qr_image_base64: image,
      qr_media_type: "image/png",
      status: "waiting_for_scan",
    } as Record<string, unknown>,
    poll: { status: "waiting_for_confirmation", connected: false } as Record<string, unknown>,
    error: undefined as Record<string, unknown> | undefined,
    bytes: undefined as Uint8Array | undefined,
    modes: ["app_qr"] as unknown[],
    descriptor: true as unknown,
    account: "private-account",
    onInventory: () => {},
    onPost: () => {},
    throwRequest: false,
  };
  vi.spyOn(contracts, "operationContractFingerprint").mockReturnValue(V2_QR_FINGERPRINT);
  const identity = vi.fn(async () => "a".repeat(64));
  const request = vi.fn(async (url: string, options: HttpRequestOptions) => {
    expect(url.startsWith("http://127.0.0.1:17281/")).toBe(true);
    expect(options.redirect).toBe("error");
    expect(options.timeoutMs).toBeGreaterThan(0);
    expect(options.timeoutMs).toBeLessThanOrEqual(5000);
    const path = new URL(url).pathname,
      post = options.method === "POST";
    if (f.throwRequest) throw Error("private exception");
    let value: unknown;
    if (post) {
      expect(path).toMatch(/^\/v2\/source-instances\/private-source-\d+\/authentication$/);
      const command = JSON.parse(options.body!);
      expect(command).toEqual(
        command.action === "app_qr_begin"
          ? { action: "app_qr_begin" }
          : { action: "app_qr_poll", flow_id: 42 },
      );
      f.onPost();
      value = f.error ?? {
        code: 0,
        message: "ok",
        data: command.action === "app_qr_begin" ? f.begin : f.poll,
      };
    } else {
      expect(options.method).toBe("GET");
      expect(options.body).toBeUndefined();
      if (path === "/v2/system/version")
        value = {
          product: "FQGate",
          version: f.version,
          api_version: "2.0",
          platform: "windows",
          architecture: "x86_64",
        };
      else if (path === "/v2/system/health") value = { status: "ready" };
      else if (path === "/openapi.json") value = {};
      else if (path === "/v2/source-instances") {
        f.onInventory();
        value = { instances: f.sources };
      } else if (path.endsWith("/authentication")) value = { modes: f.modes };
      else if (path.endsWith("/account")) {
        const s = f.sources.find((s) => path.includes(`/${s.instanceId}/`))!;
        value = {
          descriptor: {
            session_supported: f.descriptor,
            saved_login_supported: true,
            actions: ["logout", "restore_saved_login", "clear_saved_login"],
          },
          snapshot: {
            state: s.session.state,
            account_display: f.account,
            saved_login: { available: false },
            observed_at: new Date(f.now).toISOString(),
          },
        };
      } else throw Error("Unexpected route");
    }
    return {
      status: post ? f.postStatus : 200,
      headers: {},
      body: post && f.bytes ? f.bytes : Buffer.from(JSON.stringify(value)),
    };
  });
  const adapter = new FqgateV2QrAdapter({
    http: { request },
    identity,
    nowMs: () => f.now,
    ...(instanceNumber === undefined ? {} : { instanceNumber }),
  });
  return { f, adapter, request, identity };
}
afterEach(() => vi.restoreAllMocks());
const posts = (f: ReturnType<typeof fixture>) =>
  f.request.mock.calls.filter(([, o]) => o.method === "POST");
async function rejected(p: Promise<unknown>, code = "UPSTREAM_RESPONSE_INVALID") {
  try {
    await p;
    throw Error("Expected rejection");
  } catch (e) {
    expect(e).toMatchObject({ code });
    expect(String(e)).not.toMatch(/private-source|private-account|private exception/);
  }
}
describe("exact 2.0.5 QR operation adapter", () => {
  it("inspects a disconnected source read-only, independently of global v1 qualification", async () => {
    const f = fixture();
    await f.adapter.inspect();
    expect(posts(f)).toHaveLength(0);
  });
  it("begins, polls pending, and confirms connected without returning native login identity", async () => {
    const f = fixture();
    expect((await f.adapter.begin()).flowId).toBe(42);
    expect(await f.adapter.poll(42)).toEqual({
      status: "waiting_for_confirmation",
      connected: false,
    });
    f.f.poll = { connected: true, login_method: "private-account" };
    f.f.onPost = () => {
      f.f.sources[0]!.session.state = "connected";
    };
    expect(await f.adapter.poll(42)).toEqual({ status: "connected", connected: true });
    await rejected(f.adapter.poll(42), "QR_FLOW_REPLACED");
    expect(posts(f)).toHaveLength(3);
  });
  it.each([0, 2])("rejects %s ambiguous/absent eligible sources before begin", async (count) => {
    const f = fixture();
    f.f.sources = Array.from({ length: count }, (_, i) => source(i));
    await rejected(f.adapter.begin(), "FQGATE_INCOMPATIBLE");
    expect(posts(f)).toHaveLength(0);
  });
  it("does not use the single-connected predicate, and honors only an operator server pin", async () => {
    const f = fixture(2);
    f.f.sources = [source(1), source(2)];
    f.f.sources[1]!.session.state = "connected";
    await f.adapter.begin();
    expect(posts(f)[0]![0]).toContain("private-source-2");
  });
  it("refuses a disconnected target when it would create a second connected source", async () => {
    const f = fixture(2);
    f.f.sources = [source(1), source(2)];
    f.f.sources[0]!.session.state = "connected";
    await rejected(f.adapter.begin(), "FQGATE_INCOMPATIBLE");
    expect(posts(f)).toHaveLength(0);
  });
  it.each([
    "duplicateId",
    "duplicateNumber",
    "unsafeId",
    "badPid",
    "badState",
    "badModes",
    "badDescriptor",
    "missingPin",
  ])("rejects source %s", async (kind) => {
    const f = fixture(kind === "missingPin" ? 99 : undefined);
    if (kind === "duplicateId")
      f.f.sources.push({ ...source(2), instanceId: f.f.sources[0]!.instanceId });
    if (kind === "duplicateNumber")
      f.f.sources.push({ ...source(1), instanceId: "another-source" });
    if (kind === "unsafeId") f.f.sources[0]!.instanceId = "..";
    if (kind === "badPid") f.f.sources[0]!.pid = 0;
    if (kind === "badState") f.f.sources[0]!.session.state = "unverified";
    if (kind === "badModes") f.f.modes = [["app_qr"]];
    if (kind === "badDescriptor") f.f.descriptor = "true";
    await rejected(
      f.adapter.begin(),
      kind === "missingPin" ? "FQGATE_INCOMPATIBLE" : "UPSTREAM_RESPONSE_INVALID",
    );
    expect(posts(f)).toHaveLength(0);
  });
  it.each(["sourceId", "workerPid", "restartCount", "account", "sourceState", "process"])(
    "rejects %s drift before poll without upstream writes",
    async (kind) => {
      const f = fixture();
      await f.adapter.begin();
      if (kind === "sourceId") f.f.sources[0]!.instanceId = "private-source-2";
      if (kind === "workerPid") f.f.sources[0]!.pid++;
      if (kind === "restartCount") f.f.sources[0]!.restartCount++;
      if (kind === "account") f.f.account = "other-account";
      if (kind === "sourceState") f.f.sources[0]!.session.state = "connected";
      if (kind === "process") f.identity.mockResolvedValue("b".repeat(64));
      await rejected(
        f.adapter.poll(42),
        kind === "process" ? "PROCESS_IDENTITY_MISMATCH" : "QR_FLOW_REPLACED",
      );
      expect(posts(f)).toHaveLength(1);
    },
  );
  it("discards a pending response if account changes during poll", async () => {
    const f = fixture();
    await f.adapter.begin();
    f.f.onPost = () => {
      f.f.account = "changed";
    };
    await rejected(f.adapter.poll(42), "QR_FLOW_REPLACED");
  });
  it("rejects connected response without independently connected account", async () => {
    const f = fixture();
    await f.adapter.begin();
    f.f.poll = { connected: true };
    await rejected(f.adapter.poll(42));
  });
  it.each(["2.0.4", "2.0.6", "1.0.5"])("rejects wrong version %s", async (version) => {
    const f = fixture();
    f.f.version = version;
    await rejected(f.adapter.begin(), "FQGATE_INCOMPATIBLE");
    expect(posts(f)).toHaveLength(0);
  });
  it("rejects contract drift", async () => {
    const f = fixture();
    vi.mocked(contracts.operationContractFingerprint).mockReturnValue("b".repeat(64));
    await rejected(f.adapter.begin(), "OPENAPI_CONTRACT_MISSING");
    expect(posts(f)).toHaveLength(0);
  });
  it("expires locally and never polls an unknown upstream ID", async () => {
    const f = fixture();
    await f.adapter.begin();
    await rejected(f.adapter.poll(99), "QR_FLOW_REPLACED");
    f.f.now = 120000;
    await rejected(f.adapter.poll(42), "QR_FLOW_EXPIRED");
    expect(posts(f)).toHaveLength(1);
  });
  it.each([
    [1003, "交互登录流程已过期，请重新开始", "QR_FLOW_EXPIRED"],
    [3014, "交互登录流程已过期，请重新开始", "QR_FLOW_EXPIRED"],
    [3014, "flow_id 无效或已被替换", "QR_FLOW_REPLACED"],
    [1003, "flow_id 无效或已被替换", "QR_FLOW_REPLACED"],
    [1003, "参数错误", "UPSTREAM_UNAVAILABLE"],
    ["request_cancelled", "行情请求已取消", "UPSTREAM_UNAVAILABLE"],
    [9999, "交互登录流程已过期，请重新开始", "UPSTREAM_UNAVAILABLE"],
  ])("does not infer a terminal state solely from code %s", async (code, message, expected) => {
    const f = fixture();
    await f.adapter.begin();
    f.f.error = { code, message, data: {} };
    f.f.postStatus = 400;
    await rejected(f.adapter.poll(42), expected as string);
  });
  it.each([
    { flow_id: 0 },
    { flow_id: "42" },
    { status: "unknown" },
    { status: ["waiting_for_scan"] },
    { qr_image_base64: "====" },
    { qr_image_base64: "a".repeat(700000) },
    { qr_media_type: "image/svg+xml" },
    { connected: true },
  ])("rejects malformed begin %j", async (bad) => {
    const f = fixture();
    Object.assign(f.f.begin, bad);
    await rejected(f.adapter.begin());
  });
  it.each([
    { status: "unknown" },
    { status: ["waiting_for_scan"] },
    { connected: "true" },
    { flow_id: 99 },
    { login_method: ["qr"] },
  ])("rejects malformed poll %j", async (bad) => {
    const f = fixture();
    await f.adapter.begin();
    Object.assign(f.f.poll, bad);
    await rejected(
      f.adapter.poll(42),
      bad.flow_id ? "QR_FLOW_REPLACED" : "UPSTREAM_RESPONSE_INVALID",
    );
  });
  it.each([
    new Uint8Array([0xc3, 0x28]),
    Buffer.from("{bad"),
    Buffer.from("[]"),
    new Uint8Array(2097153),
  ])("rejects bad UTF8/JSON/type/size", async (bytes) => {
    const f = fixture();
    f.f.bytes = bytes;
    await rejected(f.adapter.begin());
  });
  it("bounds a cancelled or timed-out request without leaking raw errors or retrying", async () => {
    const f = fixture();
    f.f.throwRequest = true;
    await rejected(f.adapter.begin(), "UPSTREAM_UNAVAILABLE");
    expect(f.request).toHaveBeenCalledTimes(1);
  });
  it("rejects concurrent begin/poll", async () => {
    const f = fixture();
    const first = f.adapter.begin();
    await rejected(f.adapter.begin(), "QR_FLOW_LIMIT");
    await first;
    const poll = f.adapter.poll(42);
    await rejected(f.adapter.poll(42), "QR_FLOW_LIMIT");
    await poll;
  });
});

function service(f: ReturnType<typeof fixture>) {
  const status = {
    installed: {
      version: "2.0.5",
      compatibility: {
        validated: false,
        supported: false,
        status: "incompatible",
        version: "2.0.5",
        reason: "v1 only",
      },
    },
    process: { state: "identity_mismatch" },
    health: { available: false, validPayload: false },
  } as unknown as FqgateStatus;
  const v1 = new FqgateQrAdapter({ baseUrl: "http://127.0.0.1:17281", http: { request: vi.fn() } });
  const bridge = new BridgeService({
    buildInfo: {
      name: "fqgate-remote-bridge",
      version: "0.1.0",
      commit: "fixture",
      node: "v22",
      platform: "win32",
      architecture: "x64",
    },
    lifecycle: { status: async () => status },
    qrAdapter: v1,
    qrV2Adapter: f.adapter,
    qrRegistry: new QrFlowRegistry(),
  });
  return { bridge, status, v1 };
}
describe("2.0.5 scoped Bridge QR and unchanged authorization", () => {
  it("advertises independent QR readiness without validating global v2 lifecycle", async () => {
    const f = fixture(),
      s = service(f),
      caps = await s.bridge.capabilities();
    expect(caps.capabilities.qrLogin).toBe(true);
    expect(caps.fqgate.compatibility.validated).toBe(false);
    expect(posts(f)).toHaveLength(0);
  });
  it("hides unavailable readiness and leaves ambiguous installations denied", async () => {
    const f = fixture();
    f.f.sources.push(source(2));
    const s = service(f);
    expect((await s.bridge.capabilities()).capabilities.qrLogin).toBe(false);
    await rejected(s.bridge.beginQr(), "FQGATE_INCOMPATIBLE");
  });
  it("exposes only a Bridge UUID and never source/flow/account identity", async () => {
    const f = fixture(),
      s = service(f),
      begun = await s.bridge.beginQr();
    expect(begun.sessionId).toMatch(/^[a-f0-9-]{36}$/);
    expect(JSON.stringify(begun)).not.toMatch(/flow_id|private-source|private-account/);
    expect((await s.bridge.pollQr(begun.sessionId)).sessionId).toBe(begun.sessionId);
  });
  it("keeps prior Bridge UUID replaced when a new flow begins", async () => {
    const f = fixture(),
      s = service(f),
      a = await s.bridge.beginQr();
    await s.bridge.beginQr();
    await rejected(s.bridge.pollQr(a.sessionId), "QR_FLOW_REPLACED");
  });
  it("prevents v2 flow IDs being polled through v1 after a version switch", async () => {
    const f = fixture(),
      s = service(f),
      a = await s.bridge.beginQr();
    Object.assign(s.status, {
      installed: { version: "1.0.5", compatibility: { validated: true } },
      process: { state: "running" },
      health: { available: true, validPayload: true },
    });
    const poll = vi.spyOn(s.v1, "poll");
    await rejected(s.bridge.pollQr(a.sessionId), "QR_FLOW_REPLACED");
    expect(poll).not.toHaveBeenCalled();
  });
  it.each(["local", "human", "admin"])(
    "permits existing %s QR begin/poll with the same boundary",
    async (kind) => {
      const f = fixture(),
        s = service(f);
      const handler = createBridgeHttpHandler({
        service: s.bridge,
        requestContext: {
          bridgePort: 17282,
          remoteHostname: "human.example.com",
          adminHostname: "admin.example.com",
          adminVerifier: {
            audience: "admin",
            verify: async () => ({ kind: "human", subject: "operator", audience: "admin" }),
          },
        },
      });
      const host = kind === "local" ? "127.0.0.1:17282" : `${kind}.example.com`;
      const headers = {
        host,
        "content-type": "application/json",
        ...(kind === "local" ? {} : { "cf-access-jwt-assertion": "fixture" }),
        ...(kind === "admin"
          ? {
              origin: "https://admin.example.com",
              "x-bridge-admin-intent": "fqgate-remote-bridge-admin-v1",
            }
          : {}),
      };
      const begin = await handler(
        new Request(`http://${host}/api/v1/session/qr/begin`, {
          method: "POST",
          headers,
          body: "{}",
        }),
      );
      expect(begin.status).toBe(200);
      const value = await begin.json();
      const poll = await handler(
        new Request(`http://${host}/api/v1/session/qr/poll`, {
          method: "POST",
          headers,
          body: JSON.stringify({ sessionId: value.sessionId }),
        }),
      );
      expect(poll.status).toBe(200);
      expect(posts(f)).toHaveLength(2);
    },
  );
  it("requires unchanged admin Origin and intent before v2 upstream calls", async () => {
    const f = fixture(),
      s = service(f),
      handler = createBridgeHttpHandler({
        service: s.bridge,
        requestContext: {
          bridgePort: 17282,
          adminHostname: "admin.example.com",
          adminVerifier: {
            audience: "admin",
            verify: async () => ({ kind: "human", subject: "operator", audience: "admin" }),
          },
        },
      });
    for (const origin of ["https://evil.example.com", "https://admin.example.com"]) {
      const response = await handler(
        new Request("https://admin.example.com/api/v1/session/qr/begin", {
          method: "POST",
          headers: { host: "admin.example.com", "cf-access-jwt-assertion": "fixture", origin },
          body: "{}",
        }),
      );
      expect(response.status).toBe(403);
    }
    expect(f.request).not.toHaveBeenCalled();
    expect(f.identity).not.toHaveBeenCalled();
  });
  it("denies machines and unknown/forwarded Hosts before QR readiness or upstream requests", async () => {
    const f = fixture(),
      s = service(f);
    const handler = createBridgeHttpHandler({
      service: s.bridge,
      requestContext: {
        bridgePort: 17282,
        machineHostname: "machine.example.com",
        machineVerifier: {
          audience: "machine",
          verify: async () => ({ kind: "machine", subject: "machine", audience: "machine" }),
        },
      },
    });
    for (const path of ["begin", "poll"]) {
      for (const host of ["machine.example.com", "unknown.example.com"]) {
        const res = await handler(
          new Request(`http://${host}/api/v1/session/qr/${path}`, {
            method: "POST",
            headers: {
              host,
              "x-forwarded-host": "127.0.0.1:17282",
              "cf-access-jwt-assertion": "fixture",
            },
            body: JSON.stringify({ sessionId: "11111111-1111-4111-8111-111111111111" }),
          }),
        );
        expect([403, 421]).toContain(res.status);
      }
    }
    expect(f.request).not.toHaveBeenCalled();
    expect(f.identity).not.toHaveBeenCalled();
  });
});
describe("operator-only source configuration", () => {
  it("validates the private bounded pin without changing global compatibility", () => {
    const c = parseConfig({ qrV2: { instanceNumber: 2 } });
    expect(c.qrV2).toEqual({ instanceNumber: 2 });
    expect(c.compatibility.supportedRange).toBe(">=1.0.0 <2.0.0");
  });
  it.each([
    null,
    [],
    {},
    "2",
    { instanceNumber: "2" },
    { instanceNumber: -1 },
    { instanceNumber: 1.5 },
    { instanceNumber: 65536 },
    { instanceNumber: 1, sourceId: "injected" },
  ])("rejects invalid server config %j", (qrV2) => {
    expect(() => parseConfig({ qrV2 })).toThrow();
  });
});
