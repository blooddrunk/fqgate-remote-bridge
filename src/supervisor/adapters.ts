import type { FqgateLifecycleManager } from "../fqgate/install/lifecycle.js";
import type { CloudflaredServiceController } from "../cloudflared/windows/service.js";
import type { ObservationAdapters } from "./model.js";

export function createObservationAdapters(options: {
  readonly lifecycle: Pick<FqgateLifecycleManager, "status">;
  readonly service: Pick<CloudflaredServiceController, "status"> | undefined;
  readonly fetcher?: typeof fetch;
}): ObservationAdapters {
  const fetcher = options.fetcher ?? fetch;
  return {
    bridge: async () => {
      try {
        const response = await fetcher("http://127.0.0.1:17282/api/v1/status", {
          method: "GET",
          redirect: "error",
          signal: AbortSignal.timeout(5_000),
        });
        // The status body is deliberately neither read nor retained.
        await response.body?.cancel();
        return response.ok;
      } catch {
        throw new Error("bridge_probe_failed");
      }
    },
    fqgate: () => options.lifecycle.status(),
    tunnel: () =>
      options.service === undefined
        ? Promise.reject(new Error("unsupported"))
        : options.service.status(),
  };
}
