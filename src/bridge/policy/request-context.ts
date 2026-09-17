import { BridgeError, ERROR_CODES } from "../../shared/errors.js";
import { BRIDGE_BIND_HOST, DEFAULT_BRIDGE_PORT } from "../runtime-config.js";
import type { BridgeOperationPolicy } from "./registry.js";

export const CLOUDFLARE_ACCESS_ASSERTION_HEADER = "cf-access-jwt-assertion" as const;

export type BridgeRequestContext = "local" | "remote_human";
export type HostClassification = BridgeRequestContext | "unknown";

export interface RequestContextPolicyOptions {
  readonly bridgePort?: number;
  readonly remoteHostname?: string;
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
  if (
    remoteHostname !== undefined &&
    parsed.hostname === remoteHostname &&
    parsed.port === undefined
  ) {
    return "remote_human";
  }
  return "unknown";
}

export function classifyRequestContext(
  request: Request,
  options: RequestContextPolicyOptions = {},
): BridgeRequestContext {
  const hostValue = request.headers.get("host") ?? requestUrlHost(request);
  const classification = classifyHost(hostValue, options);
  if (classification === "unknown") {
    throw new BridgeError(
      ERROR_CODES.HOST_NOT_ALLOWED,
      "The request Host is not an allowed local or remote bridge hostname",
    );
  }

  if (classification === "remote_human") {
    const assertion = request.headers.get(CLOUDFLARE_ACCESS_ASSERTION_HEADER);
    if (assertion === null || assertion.trim().length === 0) {
      throw new BridgeError(
        ERROR_CODES.ACCESS_ASSERTION_REQUIRED,
        "The remote bridge request is missing the Cloudflare Access assertion",
      );
    }
  }
  return classification;
}

export function assertOperationAllowedForContext(
  operation: BridgeOperationPolicy,
  context: BridgeRequestContext,
): void {
  if (context === "remote_human" && operation.exposure !== "local_and_remote_human") {
    throw new BridgeError(
      ERROR_CODES.OPERATION_FORBIDDEN,
      "This bridge operation is available only through local maintenance access",
    );
  }
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
