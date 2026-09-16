import { loadConfig } from "../config/config.js";
import { createLifecycleManager } from "../app/runtime.js";
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

let handlerPromise: Promise<BridgeHttpHandler> | undefined;

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
}

async function createRuntimeHandler(): Promise<BridgeHttpHandler> {
  try {
    const configPath = process.env.FQGATE_REMOTE_BRIDGE_CONFIG;
    const config = await loadConfig(configPath === "" ? undefined : configPath);
    const http = new FetchHttpTransport();
    const service = new BridgeService({
      buildInfo: getBuildInfo(),
      lifecycle: createLifecycleManager(config),
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
    });
  } catch (error) {
    return async () => createBridgeErrorResponse(error);
  }
}
