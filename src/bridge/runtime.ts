import { loadConfig } from "../config/config.js";
import { createApplicationServices } from "../app/runtime.js";
import { getBuildInfo } from "../shared/build-info.js";
import { StructuredLogger } from "../shared/logger.js";
import { BridgeService } from "./service.js";
import { FqgateQrAdapter } from "./qr/adapter.js";
import { QrFlowRegistry } from "./qr/registry.js";
import {
  createBridgeErrorResponse,
  createBridgeHttpHandler,
  type BridgeHttpHandler,
} from "./transport/http.js";
import { FetchHttpTransport } from "../fqgate/release/http.js";
import { resolveBridgePort } from "./runtime-config.js";
import type { RequestContextPolicyOptions } from "./policy/request-context.js";

let handlerPromise: Promise<BridgeHttpHandler> | undefined;
let requestContextOptionsPromise: Promise<RequestContextPolicyOptions> | undefined;

/**
 * Build the single production bridge runtime. The promise is intentionally
 * process-local: no lifecycle or QR state is written to disk by the web layer.
 */
export function getBridgeHttpHandler(): Promise<BridgeHttpHandler> {
  handlerPromise ??= createRuntimeHandler();
  return handlerPromise;
}

export function resetBridgeHttpHandlerForTests(): void {
  handlerPromise = undefined;
  requestContextOptionsPromise = undefined;
}

export function getBridgeRequestContextOptions(): Promise<RequestContextPolicyOptions> {
  requestContextOptionsPromise ??= loadConfig(
    process.env.FQGATE_REMOTE_BRIDGE_CONFIG === ""
      ? undefined
      : process.env.FQGATE_REMOTE_BRIDGE_CONFIG,
  ).then((config) => ({
    bridgePort: resolveBridgePort(process.env.BRIDGE_PORT ?? process.env.PORT),
    ...(config.remoteAccess.remoteHostname === undefined
      ? {}
      : { remoteHostname: config.remoteAccess.remoteHostname }),
  }));
  return requestContextOptionsPromise;
}

async function createRuntimeHandler(): Promise<BridgeHttpHandler> {
  try {
    const configPath = process.env.FQGATE_REMOTE_BRIDGE_CONFIG;
    const config = await loadConfig(configPath === "" ? undefined : configPath);
    const http = new FetchHttpTransport();
    const application = createApplicationServices(config);
    const service = new BridgeService({
      buildInfo: getBuildInfo(),
      lifecycle: application.lifecycle,
      updateService: application.update,
      openApiService: application.openApi,
      qrAdapter: new FqgateQrAdapter({
        baseUrl: config.fqgateBaseUrl,
        http,
        timeoutMs: 5_000,
      }),
      qrRegistry: new QrFlowRegistry(),
    });
    return createBridgeHttpHandler({
      service,
      logger: new StructuredLogger({ level: config.logLevel }),
      requestContext: {
        bridgePort: resolveBridgePort(process.env.BRIDGE_PORT ?? process.env.PORT),
        ...(config.remoteAccess.remoteHostname === undefined
          ? {}
          : { remoteHostname: config.remoteAccess.remoteHostname }),
      },
    });
  } catch (error) {
    return async () => createBridgeErrorResponse(error);
  }
}
