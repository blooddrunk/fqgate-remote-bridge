import { BridgeError, ERROR_CODES } from "../shared/errors.js";

export const BRIDGE_BIND_HOST = "127.0.0.1" as const;
export const DEFAULT_BRIDGE_PORT = 17_282;

export function resolveBridgeHost(configuredHost: string | undefined): typeof BRIDGE_BIND_HOST {
  if (configuredHost !== undefined && configuredHost !== BRIDGE_BIND_HOST) {
    throw new BridgeError(
      ERROR_CODES.CONFIG_INVALID,
      "The Phase 2 bridge host is fixed to IPv4 loopback 127.0.0.1",
    );
  }
  return BRIDGE_BIND_HOST;
}

export function resolveBridgePort(configuredPort: string | undefined): number {
  if (configuredPort === undefined || configuredPort === "") return DEFAULT_BRIDGE_PORT;
  if (!/^\d+$/.test(configuredPort)) {
    throw new BridgeError(ERROR_CODES.CONFIG_INVALID, "bridge port must be an integer");
  }
  const port = Number(configuredPort);
  if (!Number.isSafeInteger(port) || port < 1_024 || port > 65_535) {
    throw new BridgeError(ERROR_CODES.CONFIG_INVALID, "bridge port must be between 1024 and 65535");
  }
  return port;
}
