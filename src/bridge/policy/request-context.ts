import { BridgeError, ERROR_CODES } from "../../shared/errors.js";
import { BRIDGE_BIND_HOST, DEFAULT_BRIDGE_PORT } from "../runtime-config.js";
import type { BridgeOperationPolicy } from "./registry.js";

export const CLOUDFLARE_ACCESS_ASSERTION_HEADER = "cf-access-jwt-assertion" as const;
export const BRIDGE_ADMIN_INTENT_HEADER = "x-bridge-admin-intent" as const;
export const BRIDGE_ADMIN_INTENT_VALUE = "fqgate-remote-bridge-admin-v1" as const;

export type BridgeRequestContext = "local" | "remote_human" | "remote_admin";
export type HostClassification = BridgeRequestContext | "unknown";

export interface BridgePrincipal {
  readonly kind: "human";
  readonly subject: string;
  readonly audience: string;
}

export interface AdminAccessVerifier {
  readonly audience: string;
  verify(assertion: string): Promise<BridgePrincipal>;
}

export interface RequestContextPolicyOptions {
  readonly bridgePort?: number;
  readonly remoteHostname?: string;
  readonly adminHostname?: string;
  readonly adminVerifier?: AdminAccessVerifier;
}

export interface AuthenticatedRequestContext {
  readonly context: BridgeRequestContext;
  readonly principal?: BridgePrincipal;
}

export function classifyHost(
  hostValue: string | undefined,
  options: RequestContextPolicyOptions = {},
): HostClassification {
  const parsed = parseHost(hostValue);
  if (parsed === undefined) return "unknown";

  const bridgePort = options.bridgePort ?? DEFAULT_BRIDGE_PORT;
  const isAcceptedLocalHost =
    (parsed.hostname === BRIDGE_BIND_HOST || parsed.hostname === "localhost") &&
    (parsed.port === undefined || parsed.port === bridgePort);
  if (isAcceptedLocalHost) return "local";

  const remoteHostname = options.remoteHostname?.trim().toLowerCase();
  const adminHostname = options.adminHostname?.trim().toLowerCase();
  if (remoteHostname !== undefined && remoteHostname === adminHostname) {
    return "unknown";
  }
  if (
    remoteHostname !== undefined &&
    parsed.hostname === remoteHostname &&
    parsed.port === undefined
  ) {
    return "remote_human";
  }
  if (
    adminHostname !== undefined &&
    parsed.hostname === adminHostname &&
    parsed.port === undefined
  ) {
    return "remote_admin";
  }
  return "unknown";
}

export async function classifyRequestContext(
  request: Request,
  options: RequestContextPolicyOptions = {},
): Promise<BridgeRequestContext> {
  return (await authenticateRequestContext(request, options)).context;
}

export async function authenticateRequestContext(
  request: Request,
  options: RequestContextPolicyOptions = {},
): Promise<AuthenticatedRequestContext> {
  const hostValue = request.headers.get("host") ?? requestUrlHost(request);
  const classification = classifyHost(hostValue, options);
  if (classification === "unknown") {
    throw new BridgeError(
      ERROR_CODES.HOST_NOT_ALLOWED,
      "The request Host is not an allowed local or remote bridge hostname",
    );
  }

  const assertion = request.headers.get(CLOUDFLARE_ACCESS_ASSERTION_HEADER);
  if (classification === "remote_human") {
    assertAssertionPresence(assertion);
    return { context: classification };
  }
  if (classification === "remote_admin") {
    assertAssertionPresence(assertion);
    if (options.adminVerifier === undefined) {
      throw new BridgeError(
        ERROR_CODES.ACCESS_ASSERTION_INVALID,
        "Remote administrator authentication is not configured",
      );
    }
    let principal: BridgePrincipal;
    try {
      principal = await options.adminVerifier.verify(assertion);
    } catch {
      // Do not let a verifier implementation leak a token-bearing error into
      // the response or structured request log.
      throw new BridgeError(
        ERROR_CODES.ACCESS_ASSERTION_INVALID,
        "The remote administrator assertion could not be validated",
      );
    }
    if (!isValidAdminPrincipal(principal, options.adminVerifier.audience)) {
      throw new BridgeError(
        ERROR_CODES.ACCESS_ASSERTION_INVALID,
        "The remote administrator principal is invalid",
      );
    }
    return { context: classification, principal };
  }
  return { context: classification };
}

export function assertOperationAllowedForContext(
  operation: BridgeOperationPolicy,
  context: BridgeRequestContext,
): void {
  if (!operation.allowedContexts.includes(context)) {
    throw new BridgeError(
      ERROR_CODES.OPERATION_FORBIDDEN,
      "This bridge operation is not allowed for the current request context",
    );
  }
}

export function assertRemoteAdminControlRequest(
  request: Request,
  options: RequestContextPolicyOptions,
): void {
  const adminHostname = options.adminHostname?.trim().toLowerCase();
  if (adminHostname === undefined) {
    throw new BridgeError(
      ERROR_CODES.CSRF_ORIGIN_INVALID,
      "Remote administrator origin protection is not configured",
    );
  }
  const expectedOrigin = `https://${adminHostname}`;
  if (request.headers.get("origin") !== expectedOrigin) {
    throw new BridgeError(
      ERROR_CODES.CSRF_ORIGIN_INVALID,
      "The remote administrator request Origin is not allowed",
    );
  }
  if (request.headers.get(BRIDGE_ADMIN_INTENT_HEADER) !== BRIDGE_ADMIN_INTENT_VALUE) {
    throw new BridgeError(
      ERROR_CODES.CSRF_INTENT_REQUIRED,
      "The remote administrator request is missing the bridge intent header",
    );
  }
}

function assertAssertionPresence(assertion: string | null): asserts assertion is string {
  if (assertion === null || assertion.trim().length === 0) {
    throw new BridgeError(
      ERROR_CODES.ACCESS_ASSERTION_REQUIRED,
      "The remote bridge request is missing the Cloudflare Access assertion",
    );
  }
}

function isValidAdminPrincipal(value: unknown, expectedAudience: string): value is BridgePrincipal {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const principal = value as Record<string, unknown>;
  return (
    principal.kind === "human" &&
    principal.audience === expectedAudience &&
    typeof principal.subject === "string" &&
    principal.subject.length > 0 &&
    principal.subject.length <= 512
  );
}

function requestUrlHost(request: Request): string | undefined {
  try {
    return new URL(request.url).host;
  } catch {
    return undefined;
  }
}

interface ParsedHost {
  readonly hostname: string;
  readonly port?: number;
}

function parseHost(value: string | undefined): ParsedHost | undefined {
  if (value === undefined) return undefined;
  const normalized = value.trim().toLowerCase();
  if (normalized.length === 0 || /[\s,\\/]/.test(normalized)) return undefined;

  if (normalized.startsWith("[") || normalized.includes("::")) return undefined;
  const colonIndex = normalized.lastIndexOf(":");
  const hostname = colonIndex === -1 ? normalized : normalized.slice(0, colonIndex);
  const portText = colonIndex === -1 ? undefined : normalized.slice(colonIndex + 1);
  if (hostname.length === 0) return undefined;
  if (portText !== undefined && !/^\d+$/.test(portText)) return undefined;
  if (normalized.indexOf(":") !== colonIndex && colonIndex !== -1) return undefined;

  const port = portText === undefined ? undefined : Number(portText);
  if (port !== undefined && (!Number.isSafeInteger(port) || port < 1 || port > 65_535)) {
    return undefined;
  }
  if (hostname !== BRIDGE_BIND_HOST && hostname !== "localhost" && !isDnsHostname(hostname)) {
    return undefined;
  }
  return port === undefined ? { hostname } : { hostname, port };
}

function isDnsHostname(value: string): boolean {
  if (value.length > 253 || value.endsWith(".")) return false;
  const labels = value.split(".");
  return (
    labels.length >= 2 &&
    labels.every(
      (label) =>
        label.length > 0 && label.length <= 63 && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label),
    )
  );
}
