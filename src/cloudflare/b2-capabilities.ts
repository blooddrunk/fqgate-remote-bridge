import { BridgeError, ERROR_CODES } from "../shared/errors.js";
import { CLOUDFLARE_API_BASE_URL } from "./types.js";

export const CLOUDFLARE_B2_SCOPE_READ_TOKEN_ENV = "CLOUDFLARE_B2_SCOPE_READ_TOKEN" as const;
const timeoutMs = 15_000;
const maximumBytes = 262_144;

export function getCloudflareB2ScopeReadToken(
  environment: NodeJS.ProcessEnv = process.env,
): string {
  const value = environment[CLOUDFLARE_B2_SCOPE_READ_TOKEN_ENV];
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > 4096 ||
    value.trim() !== value ||
    Array.from(value).some((character) => {
      const code = character.codePointAt(0) ?? 0;
      return code <= 31 || code === 127;
    })
  ) {
    throw new BridgeError(
      ERROR_CODES.CLOUDFLARE_WRITE_TOKEN_REQUIRED,
      "A transient Cloudflare account-token scope-read credential is required before B2 write",
    );
  }
  return value;
}

/** The write token cannot inspect its own policy with only Tunnel/Access write scope. */
export async function validateCloudflareB2WriteCapabilities(input: {
  readonly accountId: string;
  readonly writeToken: string;
  readonly scopeReadToken: string;
  readonly fetchImpl?: typeof fetch;
}): Promise<void> {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(input.accountId)) throw rejected();
  const fetchImpl = input.fetchImpl ?? fetch;
  const prefix = `/accounts/${input.accountId}/tokens`;
  const verification = await fixedGet(fetchImpl, `${prefix}/verify`, input.writeToken);
  if (!record(verification) || !id(verification.id) || verification.status !== "active")
    throw rejected();
  const detail = await fixedGet(fetchImpl, `${prefix}/${verification.id}`, input.scopeReadToken);
  if (
    !record(detail) ||
    detail.id !== verification.id ||
    detail.status !== "active" ||
    !Array.isArray(detail.policies) ||
    detail.policies.length !== 1
  )
    throw rejected();
  const expiry = typeof detail.expires_on === "string" ? Date.parse(detail.expires_on) : NaN;
  if (
    !Number.isFinite(expiry) ||
    expiry <= Date.now() ||
    expiry > Date.now() + 7 * 24 * 60 * 60 * 1000
  )
    throw rejected();
  const policy = detail.policies[0];
  if (
    !record(policy) ||
    policy.effect !== "allow" ||
    !Array.isArray(policy.permission_groups) ||
    policy.permission_groups.length !== 2 ||
    !record(policy.resources)
  )
    throw rejected();
  const groupNames = policy.permission_groups
    .map((group: unknown) => (record(group) ? group.name : null))
    .sort();
  if (
    JSON.stringify(groupNames) !==
    JSON.stringify(
      ["Access: Apps and Policies Write", "Cloudflare One Connector: cloudflared Write"].sort(),
    )
  )
    throw rejected();
  const resourceKeys = Object.keys(policy.resources);
  if (
    resourceKeys.length !== 1 ||
    resourceKeys[0] !== `com.cloudflare.api.account.${input.accountId}` ||
    policy.resources[resourceKeys[0]] !== "*"
  )
    throw rejected();
}

async function fixedGet(fetchImpl: typeof fetch, path: string, token: string): Promise<unknown> {
  if (!/^\/accounts\/[A-Za-z0-9_-]{1,128}\/tokens\/(?:verify|[A-Za-z0-9_-]{1,128})$/.test(path))
    throw rejected();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(`${CLOUDFLARE_API_BASE_URL}${path}`, {
      method: "GET",
      redirect: "error",
      signal: controller.signal,
      headers: { accept: "application/json", authorization: `Bearer ${token}` },
    });
    if (response.status !== 200 || !response.body) throw rejected();
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    try {
      while (true) {
        const next = await reader.read();
        if (next.done) break;
        total += next.value.byteLength;
        if (total > maximumBytes) throw rejected();
        chunks.push(next.value);
      }
    } finally {
      reader.releaseLock();
    }
    const bytes = new Uint8Array(total);
    let position = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, position);
      position += chunk.byteLength;
    }
    let envelope: unknown;
    try {
      envelope = JSON.parse(new TextDecoder().decode(bytes)) as unknown;
    } catch {
      throw rejected();
    }
    if (!record(envelope) || envelope.success !== true || !record(envelope.result))
      throw rejected();
    return envelope.result;
  } catch {
    throw rejected();
  } finally {
    clearTimeout(timeout);
  }
}

function id(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value);
}
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function rejected(): BridgeError {
  return new BridgeError(
    ERROR_CODES.CLOUDFLARE_MANUAL_REQUIRED,
    "MANUAL_REQUIRED: Cloudflare B2 write-token account, lifetime and exact Tunnel/Access permission scope could not be proven; zero writes performed",
  );
}
