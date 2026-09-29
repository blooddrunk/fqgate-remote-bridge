import { BridgeError, ERROR_CODES } from "../shared/errors.js";
import {
  CLOUDFLARE_API_BASE_URL,
  CLOUDFLARE_BRIDGE_ORIGIN,
  type CloudflareContext,
  type CloudflareReadOnlyPlan,
} from "./types.js";
import { parseCloudflareB2Profile, type CloudflareB2Profile } from "./b2-profile.js";

export const CLOUDFLARE_B2_WRITE_TOKEN_ENV = "CLOUDFLARE_B2_WRITE_TOKEN" as const;

interface Route {
  readonly hostname?: string;
  readonly service: string;
  readonly originRequest?: {
    readonly access: {
      readonly required: true;
      readonly teamName: string;
      readonly audTag: readonly string[];
    };
  };
}

export interface CloudflareB2WriteTransport {
  replaceExactTunnelIngress(plan: CloudflareReadOnlyPlan, routes: readonly Route[]): Promise<void>;
  createExactApplication(
    plan: CloudflareReadOnlyPlan,
    context: CloudflareContext,
    profile: CloudflareB2Profile,
  ): Promise<string>;
  correctExactApplicationName(
    plan: CloudflareReadOnlyPlan,
    context: CloudflareContext,
    rawApplication: unknown,
  ): Promise<void>;
  createExactPolicy(
    plan: CloudflareReadOnlyPlan,
    context: CloudflareContext,
    profile: CloudflareB2Profile,
  ): Promise<string>;
  tightenExactPolicy(
    plan: CloudflareReadOnlyPlan,
    context: CloudflareContext,
    policyId: string,
    profile: CloudflareB2Profile,
  ): Promise<void>;
}

export interface CloudflareB2WriteOptions {
  readonly apiToken: string;
  readonly fetchImpl?: typeof fetch;
  readonly timeoutMs?: number;
  readonly maxResponseBytes?: number;
}

interface State {
  readonly apiToken: string;
  readonly fetchImpl: typeof fetch;
  readonly timeoutMs: number;
  readonly maxResponseBytes: number;
}

const states = new WeakMap<object, State>();

export function getCloudflareB2WriteToken(environment: NodeJS.ProcessEnv = process.env): string {
  const token = environment[CLOUDFLARE_B2_WRITE_TOKEN_ENV];
  if (!validString(token, 4096)) {
    throw new BridgeError(
      ERROR_CODES.CLOUDFLARE_WRITE_TOKEN_REQUIRED,
      "A short-lived, account-scoped Cloudflare B2 write token is required",
    );
  }
  return token;
}

export class FetchCloudflareB2WriteTransport implements CloudflareB2WriteTransport {
  constructor(options: CloudflareB2WriteOptions) {
    if (!validString(options.apiToken, 4096)) throw invalid("Cloudflare B2 write token is invalid");
    const timeoutMs = options.timeoutMs ?? 15_000;
    const maxResponseBytes = options.maxResponseBytes ?? 262_144;
    if (
      !Number.isSafeInteger(timeoutMs) ||
      timeoutMs < 1_000 ||
      timeoutMs > 120_000 ||
      !Number.isSafeInteger(maxResponseBytes) ||
      maxResponseBytes < 1_024 ||
      maxResponseBytes > 8 * 1024 * 1024
    ) {
      throw invalid("Cloudflare B2 write limits are invalid");
    }
    states.set(this, {
      apiToken: options.apiToken,
      fetchImpl: options.fetchImpl ?? fetch,
      timeoutMs,
      maxResponseBytes,
    });
  }

  async replaceExactTunnelIngress(
    plan: CloudflareReadOnlyPlan,
    routes: readonly Route[],
  ): Promise<void> {
    const { accountId, tunnelId } = selectedTunnel(plan);
    assertExactRoutes(plan, routes);
    const result = await request(
      states.get(this)!,
      "PUT",
      `/accounts/${accountId}/cfd_tunnel/${tunnelId}/configurations`,
      { config: { ingress: routes } },
    );
    if (
      !record(result) ||
      result.account_id !== accountId ||
      !record(result.config) ||
      !Array.isArray(result.config.ingress)
    ) {
      throw invalidResponse();
    }
  }

  async createExactApplication(
    plan: CloudflareReadOnlyPlan,
    context: CloudflareContext,
    profile: CloudflareB2Profile,
  ): Promise<string> {
    const { accountId } = selectedTunnel(plan);
    const desired = plan.desired.access.applications[context];
    if (desired.id !== undefined || plan.observed.applications[context].status !== "missing")
      throw invalid("Application create needs an unbound, missing exact identity");
    const body = {
      name: desired.name,
      domain: desired.hostname,
      aud: desired.audience,
      type: "self_hosted",
      mfa_config: { mfa_disabled: false },
      policies: [policyBody(context, profile)],
    };
    const result = await request(
      states.get(this)!,
      "POST",
      `/accounts/${accountId}/access/apps`,
      body,
    );
    if (
      !record(result) ||
      !resourceId(result.id) ||
      result.domain !== desired.hostname ||
      result.aud !== desired.audience ||
      result.type !== "self_hosted" ||
      result.name !== desired.name
    )
      throw invalidResponse();
    return result.id;
  }

  async correctExactApplicationName(
    plan: CloudflareReadOnlyPlan,
    context: CloudflareContext,
    rawApplication: unknown,
  ): Promise<void> {
    const { accountId } = selectedTunnel(plan);
    const desired = plan.desired.access.applications[context];
    const selected = plan.observed.applications[context].selected;
    if (
      !selected ||
      !record(rawApplication) ||
      rawApplication.id !== selected.id ||
      rawApplication.domain !== desired.hostname ||
      rawApplication.aud !== desired.audience ||
      rawApplication.type !== "self_hosted" ||
      rawApplication.name === desired.name ||
      Object.keys(rawApplication).sort().join(",") !== "aud,domain,id,mfa_config,name,type" ||
      !record(rawApplication.mfa_config) ||
      Object.keys(rawApplication.mfa_config).join(",") !== "mfa_disabled" ||
      rawApplication.mfa_config.mfa_disabled !== false
    )
      throw invalid("Application preimage is not narrow enough for a name correction");
    const body = {
      name: desired.name,
      domain: desired.hostname,
      aud: desired.audience,
      type: "self_hosted",
      mfa_config: { mfa_disabled: false },
    };
    const result = await request(
      states.get(this)!,
      "PUT",
      `/accounts/${accountId}/access/apps/${assertId(selected.id)}`,
      body,
    );
    if (
      !record(result) ||
      result.id !== selected.id ||
      result.name !== desired.name ||
      result.domain !== desired.hostname ||
      result.aud !== desired.audience ||
      result.type !== "self_hosted"
    )
      throw invalidResponse();
  }

  async createExactPolicy(
    plan: CloudflareReadOnlyPlan,
    context: CloudflareContext,
    profile: CloudflareB2Profile,
  ): Promise<string> {
    const { accountId } = selectedTunnel(plan);
    const application = plan.observed.applications[context].selected;
    if (
      !application ||
      plan.observed.policies[context].status !== "found" ||
      plan.observed.policies[context].policies.length !== 0
    )
      throw invalid("Policy create needs one exact selected application with no existing policy");
    const body = policyBody(context, profile);
    const result = await request(
      states.get(this)!,
      "POST",
      `/accounts/${accountId}/access/apps/${assertId(application.id)}/policies`,
      body,
    );
    if (
      !record(result) ||
      !resourceId(result.id) ||
      result.name !== body.name ||
      result.decision !== body.decision ||
      JSON.stringify(result.include) !== JSON.stringify(body.include)
    )
      throw invalidResponse();
    return result.id;
  }

  async tightenExactPolicy(
    plan: CloudflareReadOnlyPlan,
    context: CloudflareContext,
    policyId: string,
    profile: CloudflareB2Profile,
  ): Promise<void> {
    const { accountId } = selectedTunnel(plan);
    const application = plan.observed.applications[context].selected;
    const policy = plan.observed.policies[context].policies.find((item) => item.id === policyId);
    if (
      context !== "admin" ||
      !application ||
      !policy ||
      plan.observed.policies[context].policies.length !== 1 ||
      policy.broadSelector ||
      policy.decision !== "allow" ||
      policy.mfaDisabled !== true
    )
      throw invalid("Policy correction is not uniquely bounded");
    const body = policyBody(context, profile);
    const result = await request(
      states.get(this)!,
      "PUT",
      `/accounts/${accountId}/access/apps/${assertId(application.id)}/policies/${assertId(policyId)}`,
      body,
    );
    if (
      !record(result) ||
      result.id !== policyId ||
      result.decision !== body.decision ||
      JSON.stringify(result.include) !== JSON.stringify(body.include)
    )
      throw invalidResponse();
  }
}

function selectedTunnel(plan: CloudflareReadOnlyPlan): { accountId: string; tunnelId: string } {
  const account = plan.observed.account.selected;
  const tunnel = plan.observed.tunnel.selected;
  if (
    !account ||
    !tunnel ||
    plan.desired.account.id !== account.id ||
    plan.desired.tunnel.id !== tunnel.id ||
    tunnel.configSrc !== "cloudflare" ||
    tunnel.remoteConfig !== true
  )
    throw invalid("Cloudflare B2 resource identity is not exact");
  return { accountId: assertId(account.id), tunnelId: assertId(tunnel.id) };
}

function assertExactRoutes(plan: CloudflareReadOnlyPlan, routes: readonly Route[]): void {
  if (routes.length < 2 || routes.length > 4)
    throw invalid("Tunnel ingress must contain bounded protected hostnames and a terminal deny");
  const expected = ["human", "admin", "machine"] as const;
  const names = new Set<string>();
  for (const route of routes.slice(0, -1)) {
    const context = expected.find(
      (candidate) => plan.desired.access.applications[candidate].hostname === route.hostname,
    );
    if (
      !context ||
      !route.hostname ||
      names.has(route.hostname) ||
      route.service !== CLOUDFLARE_BRIDGE_ORIGIN ||
      route.originRequest?.access.required !== true ||
      route.originRequest.access.teamName !== plan.desired.access.teamName ||
      JSON.stringify(route.originRequest.access.audTag) !==
        JSON.stringify([plan.desired.access.applications[context].audience])
    ) {
      throw invalid("Tunnel ingress contains an unexpected or unprotected route");
    }
    names.add(route.hostname);
  }
  if (
    names.size !== routes.length - 1 ||
    JSON.stringify(routes.at(-1)) !== JSON.stringify({ service: "http_status:404" })
  )
    throw invalid("Tunnel ingress terminal deny is missing");
}

function policyBody(context: CloudflareContext, profile: CloudflareB2Profile) {
  const checked = parseCloudflareB2Profile({
    schemaVersion: "phase6b2.v1",
    policies: profile.policies,
  });
  if (checked.fingerprint !== profile.fingerprint)
    throw invalid("Cloudflare B2 policy profile fingerprint is invalid");
  const template = checked.policies[context];
  if (!template || !/^[a-f0-9]{64}$/.test(profile.fingerprint))
    throw invalid("Cloudflare B2 policy profile is invalid");
  const include =
    template.selector.kind === "email"
      ? [{ email: { email: template.selector.value } }]
      : template.selector.kind === "group"
        ? [{ group: { id: template.selector.value } }]
        : [{ service_token: { token_id: template.selector.value } }];
  return {
    name: template.name,
    decision: context === "machine" ? "non_identity" : "allow",
    include,
    require: [],
    exclude: [],
    session_duration: template.sessionDuration,
    mfa_config: { mfa_disabled: false },
  };
}

async function request(
  state: State,
  method: "PUT" | "POST",
  path: string,
  body: object,
): Promise<unknown> {
  if (
    !/^\/accounts\/[A-Za-z0-9_-]{1,128}\/(?:cfd_tunnel\/[A-Za-z0-9_-]{1,128}\/configurations|access\/apps(?:\/[A-Za-z0-9_-]{1,128}(?:\/policies(?:\/[A-Za-z0-9_-]{1,128})?)?)?)$/.test(
      path,
    )
  )
    throw invalid("Cloudflare B2 write path is invalid");
  const url = new URL(`${CLOUDFLARE_API_BASE_URL}${path}`);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), state.timeoutMs);
  try {
    const response = await state.fetchImpl(url, {
      method,
      redirect: "error",
      signal: controller.signal,
      headers: {
        accept: "application/json",
        authorization: `Bearer ${state.apiToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (response.status < 200 || response.status >= 300)
      throw new BridgeError(
        ERROR_CODES.CLOUDFLARE_WRITE_FAILED,
        "Cloudflare B2 write returned an unsuccessful status",
        { status: response.status },
      );
    if (!response.body) throw invalidResponse();
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    try {
      while (true) {
        const next = await reader.read();
        if (next.done) break;
        total += next.value.byteLength;
        if (total > state.maxResponseBytes)
          throw new BridgeError(
            ERROR_CODES.CLOUDFLARE_API_RESPONSE_TOO_LARGE,
            "Cloudflare B2 write response is too large",
          );
        chunks.push(next.value);
      }
    } finally {
      reader.releaseLock();
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    let envelope: unknown;
    try {
      envelope = JSON.parse(new TextDecoder().decode(bytes)) as unknown;
    } catch {
      throw invalidResponse();
    }
    if (!record(envelope) || envelope.success !== true || !("result" in envelope))
      throw invalidResponse();
    return envelope.result;
  } catch (error) {
    if (error instanceof BridgeError) throw error;
    throw new BridgeError(
      ERROR_CODES.CLOUDFLARE_WRITE_FAILED,
      "Cloudflare B2 write request failed",
    );
  } finally {
    clearTimeout(timeout);
  }
}

function assertId(value: string): string {
  if (!resourceId(value)) throw invalid("Cloudflare B2 resource ID is invalid");
  return value;
}
function resourceId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value);
}
function validString(value: unknown, maximum: number): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= maximum &&
    value.trim() === value &&
    !Array.from(value).some((character) => {
      const code = character.codePointAt(0) ?? 0;
      return code <= 31 || code === 127;
    })
  );
}
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function invalid(message: string): BridgeError {
  return new BridgeError(ERROR_CODES.CLOUDFLARE_APPLY_REJECTED, message);
}
function invalidResponse(): BridgeError {
  return new BridgeError(
    ERROR_CODES.CLOUDFLARE_API_RESPONSE_INVALID,
    "Cloudflare B2 write response is invalid",
  );
}
