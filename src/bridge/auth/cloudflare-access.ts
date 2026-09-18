import {
  createLocalJWKSet,
  decodeProtectedHeader,
  jwtVerify,
  type JSONWebKeySet,
  type JWTPayload,
  type JWK,
} from "jose";
import { BridgeError, ERROR_CODES } from "../../shared/errors.js";
import type { AdminAccessVerifier, BridgePrincipal } from "../policy/request-context.js";

const CLOUDFLARE_TEAM_DOMAIN_SUFFIX = ".cloudflareaccess.com";
const CLOUDFLARE_ACCESS_CERTS_PATH = "/cdn-cgi/access/certs";
const DEFAULT_CACHE_TTL_MS = 5 * 60_000;
const MAX_CACHE_TTL_MS = 5 * 60_000;
const DEFAULT_TIMEOUT_MS = 5_000;
const MAX_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_BYTES = 64 * 1024;
const MAX_JWK_BYTES = 64 * 1024;
const MAX_JWK_KEYS = 16;
const MAX_ASSERTION_LENGTH = 32 * 1024;

export const CLOUDFLARE_ACCESS_CERTS_ENDPOINT_PATH = CLOUDFLARE_ACCESS_CERTS_PATH;

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export interface CloudflareAccessJwtVerifierOptions {
  readonly teamDomain: string;
  readonly audience: string;
  readonly fetcher?: FetchLike;
  readonly nowMs?: () => number;
  readonly cacheTtlMs?: number;
  readonly timeoutMs?: number;
  readonly maxBytes?: number;
}

interface CachedKeySet {
  readonly keySet: ReturnType<typeof createLocalJWKSet>;
  readonly kids: ReadonlySet<string>;
  readonly expiresAtMs: number;
}

/**
 * Verifies only the admin Access application. The ordinary Phase 4 human
 * application intentionally continues to use its edge validation plus the
 * assertion-presence drift check.
 */
export class CloudflareAccessJwtVerifier implements AdminAccessVerifier {
  readonly teamDomain: string;
  readonly issuer: string;
  readonly audience: string;
  readonly certsEndpoint: string;

  private readonly fetcher: FetchLike;
  private readonly nowMs: () => number;
  private readonly cacheTtlMs: number;
  private readonly timeoutMs: number;
  private readonly maxBytes: number;
  private cachedKeySet: CachedKeySet | undefined;
  private fetchInFlight: Promise<CachedKeySet> | undefined;

  constructor(options: CloudflareAccessJwtVerifierOptions) {
    this.teamDomain = validateTeamDomain(options.teamDomain);
    this.issuer = `https://${this.teamDomain}`;
    this.audience = validateAudience(options.audience);
    this.certsEndpoint = `${this.issuer}${CLOUDFLARE_ACCESS_CERTS_PATH}`;
    this.fetcher = options.fetcher ?? ((input, init) => globalThis.fetch(input, init));
    this.nowMs = options.nowMs ?? Date.now;
    this.cacheTtlMs = boundedOption(
      options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS,
      1,
      MAX_CACHE_TTL_MS,
    );
    this.timeoutMs = boundedOption(options.timeoutMs ?? DEFAULT_TIMEOUT_MS, 1, MAX_TIMEOUT_MS);
    this.maxBytes = boundedOption(options.maxBytes ?? DEFAULT_MAX_BYTES, 1, MAX_JWK_BYTES);
  }

  async verify(assertion: string): Promise<BridgePrincipal> {
    if (
      assertion.length === 0 ||
      assertion.length > MAX_ASSERTION_LENGTH ||
      assertion.trim() !== assertion
    ) {
      throw invalidAssertion();
    }

    let kid: string;
    try {
      const header = decodeProtectedHeader(assertion);
      if (
        header.alg !== "RS256" ||
        typeof header.kid !== "string" ||
        header.kid.length === 0 ||
        header.kid.length > 128
      ) {
        throw new Error("unsupported Access assertion header");
      }
      kid = header.kid;
    } catch {
      throw invalidAssertion();
    }

    let cached = await this.getKeySet(false);
    try {
      return await this.verifyWithKeySet(assertion, cached.keySet);
    } catch {
      // A previously unseen kid is the normal key-rotation signal. Refresh
      // exactly once, and never fall back to an unbounded/arbitrary key URL.
      if (cached.kids.has(kid)) {
        throw invalidAssertion();
      }
      cached = await this.getKeySet(true);
      try {
        return await this.verifyWithKeySet(assertion, cached.keySet);
      } catch {
        throw invalidAssertion();
      }
    }
  }

  /** Clear only the bounded in-memory key cache. No credential is retained. */
  invalidateCache(): void {
    this.cachedKeySet = undefined;
  }

  private async verifyWithKeySet(
    assertion: string,
    keySet: ReturnType<typeof createLocalJWKSet>,
  ): Promise<BridgePrincipal> {
    const currentDate = new Date(this.nowMs());
    const result = await jwtVerify<JWTPayload>(assertion, keySet, {
      algorithms: ["RS256"],
      issuer: this.issuer,
      audience: this.audience,
      currentDate,
      requiredClaims: ["sub", "exp", "iat"],
    });
    const payload = result.payload;
    if (
      typeof payload.sub !== "string" ||
      payload.sub.length === 0 ||
      payload.sub.length > 512 ||
      !isExactAudience(payload.aud, this.audience) ||
      !isValidTemporalPayload(payload, currentDate.getTime() / 1_000)
    ) {
      throw invalidAssertion();
    }
    return {
      kind: "human",
      subject: payload.sub,
      audience: this.audience,
    };
  }

  private async getKeySet(forceRefresh: boolean): Promise<CachedKeySet> {
    const now = this.nowMs();
    if (!forceRefresh && this.cachedKeySet !== undefined && now < this.cachedKeySet.expiresAtMs) {
      return this.cachedKeySet;
    }
    if (this.fetchInFlight !== undefined) return this.fetchInFlight;

    const pending = this.fetchKeySet();
    this.fetchInFlight = pending;
    try {
      const keySet = await pending;
      this.cachedKeySet = keySet;
      return keySet;
    } finally {
      if (this.fetchInFlight === pending) this.fetchInFlight = undefined;
    }
  }

  private async fetchKeySet(): Promise<CachedKeySet> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetcher(this.certsEndpoint, {
        method: "GET",
        headers: { accept: "application/json" },
        signal: controller.signal,
        redirect: "error",
      });
      if (!response.ok) throw invalidAssertion();
      const body = await readBoundedResponse(response, this.maxBytes);
      let value: unknown;
      try {
        value = JSON.parse(body) as unknown;
      } catch {
        throw invalidAssertion();
      }
      const jwks = normalizeJwkSet(value);
      return {
        keySet: createLocalJWKSet(jwks),
        kids: new Set(
          jwks.keys.map((key) => key.kid).filter((kid): kid is string => kid !== undefined),
        ),
        expiresAtMs: this.nowMs() + this.cacheTtlMs,
      };
    } catch (error) {
      if (error instanceof BridgeError) throw error;
      throw invalidAssertion();
    } finally {
      clearTimeout(timeout);
    }
  }
}

export function validateTeamDomain(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (
    normalized !== value ||
    normalized.length <= CLOUDFLARE_TEAM_DOMAIN_SUFFIX.length ||
    normalized.length > 253 ||
    !normalized.endsWith(CLOUDFLARE_TEAM_DOMAIN_SUFFIX) ||
    !isDnsHostname(normalized)
  ) {
    throw new BridgeError(
      ERROR_CODES.CONFIG_INVALID,
      "remoteAccess.adminAccess.teamDomain must be a Cloudflare Access team hostname",
    );
  }
  return normalized;
}

export function validateAudience(value: string): string {
  if (
    value.length === 0 ||
    value.trim() !== value ||
    value.length > 256 ||
    hasInvalidAudienceCharacter(value)
  ) {
    throw new BridgeError(
      ERROR_CODES.CONFIG_INVALID,
      "remoteAccess.adminAccess.audience must be a bounded opaque audience value",
    );
  }
  return value;
}

function normalizeJwkSet(value: unknown): JSONWebKeySet {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw invalidAssertion();
  }
  const keysValue = (value as Record<string, unknown>).keys;
  if (!Array.isArray(keysValue) || keysValue.length === 0 || keysValue.length > MAX_JWK_KEYS) {
    throw invalidAssertion();
  }

  const seenKids = new Set<string>();
  const keys: JWK[] = [];
  for (const item of keysValue) {
    if (typeof item !== "object" || item === null || Array.isArray(item)) {
      throw invalidAssertion();
    }
    const key = item as Record<string, unknown>;
    const kid = key.kid;
    if (
      typeof kid !== "string" ||
      kid.length === 0 ||
      kid.length > 128 ||
      seenKids.has(kid) ||
      key.kty !== "RSA" ||
      (key.alg !== undefined && key.alg !== "RS256") ||
      (key.use !== undefined && key.use !== "sig") ||
      typeof key.n !== "string" ||
      typeof key.e !== "string"
    ) {
      throw invalidAssertion();
    }
    seenKids.add(kid);
    keys.push({ kty: "RSA", kid, n: key.n, e: key.e, alg: "RS256", use: "sig" });
  }
  return { keys };
}

async function readBoundedResponse(response: Response, maxBytes: number): Promise<string> {
  const contentLength = response.headers.get("content-length");
  if (contentLength !== null && /^\d+$/.test(contentLength) && Number(contentLength) > maxBytes) {
    throw invalidAssertion();
  }
  if (response.body === null) return "";

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      total += result.value.byteLength;
      if (total > maxBytes) {
        await reader.cancel("Access cert response exceeds the configured limit");
        throw invalidAssertion();
      }
      chunks.push(new Uint8Array(result.value));
    }
  } finally {
    reader.releaseLock();
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(body);
}

function isExactAudience(value: JWTPayload["aud"], expected: string): boolean {
  return typeof value === "string"
    ? value === expected
    : Array.isArray(value) && value.length === 1 && value[0] === expected;
}

function isValidTemporalPayload(payload: JWTPayload, nowSeconds: number): boolean {
  if (
    typeof payload.exp !== "number" ||
    !Number.isFinite(payload.exp) ||
    payload.exp <= nowSeconds
  ) {
    return false;
  }
  if (
    payload.nbf !== undefined &&
    (typeof payload.nbf !== "number" || !Number.isFinite(payload.nbf) || payload.nbf > nowSeconds)
  ) {
    return false;
  }
  if (
    payload.iat !== undefined &&
    (typeof payload.iat !== "number" || !Number.isFinite(payload.iat) || payload.iat > nowSeconds)
  ) {
    return false;
  }
  return true;
}

function isDnsHostname(value: string): boolean {
  const labels = value.split(".");
  return (
    labels.length >= 3 &&
    labels.every((label) => {
      return (
        label.length > 0 && label.length <= 63 && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label)
      );
    })
  );
}

function boundedOption(value: number, minimum: number, maximum: number): number {
  if (!Number.isSafeInteger(value)) return minimum;
  return Math.min(Math.max(value, minimum), maximum);
}

function hasInvalidAudienceCharacter(value: string): boolean {
  return Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 0x1f || codePoint === 0x7f || /\s/u.test(character);
  });
}

function invalidAssertion(): BridgeError {
  return new BridgeError(
    ERROR_CODES.ACCESS_ASSERTION_INVALID,
    "The Cloudflare Access assertion could not be validated",
  );
}
