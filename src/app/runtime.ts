import type { AppConfig } from "../config/config.js";
import { CompatibilityPolicy } from "../fqgate/compatibility/policy.js";
import { FqgateHealthProbe } from "../fqgate/health/probe.js";
import { createFqgateLayout } from "../fqgate/install/layout.js";
import { FqgateLifecycleManager } from "../fqgate/install/lifecycle.js";
import { SafeArtifactDownloader } from "../fqgate/release/downloader.js";
import { FetchHttpTransport } from "../fqgate/release/http.js";
import { OfficialFqgateReleaseSource } from "../fqgate/release/official-source.js";
import { ChildProcessRunner } from "../fqgate/process/runner.js";
import { FqgateCandidateValidator } from "../fqgate/process/candidate.js";
import { NativeManagedProcessController } from "../fqgate/process/native.js";
import { StructuredLogger } from "../shared/logger.js";
import { listRequiredFqgateContracts } from "../bridge/policy/registry.js";
import { FqgateOpenApiService, RequiredContractOpenApiProbe } from "../fqgate/openapi/service.js";
import { FqgateUpdateService } from "../fqgate/update/service.js";

export interface ApplicationServices {
  readonly lifecycle: FqgateLifecycleManager;
  readonly openApi: FqgateOpenApiService;
  readonly update: FqgateUpdateService;
}

export function createApplicationServices(config: AppConfig): ApplicationServices {
  const http = new FetchHttpTransport();
  const policy = new CompatibilityPolicy(config.compatibility);
  const runner = new ChildProcessRunner();
  const layout = createFqgateLayout(config.installDirectory);
  const openApi = new FqgateOpenApiService({
    http,
    timeoutMs: Math.min(config.activation.processTimeoutMs, 5_000),
    maxBytes: 4 * 1024 * 1024,
    ttlMs: 5_000,
  });
  const healthProbe = new FqgateHealthProbe({
    baseUrl: config.fqgateBaseUrl,
    http,
    timeoutMs: Math.min(config.activation.processTimeoutMs, 5_000),
  });
  const lifecycle = new FqgateLifecycleManager({
    layout,
    releaseSource: new OfficialFqgateReleaseSource(
      http,
      config.manifestUrl,
      config.download.timeoutMs,
    ),
    downloader: new SafeArtifactDownloader({ http }),
    candidateValidator: new FqgateCandidateValidator({
      runner,
      policy,
      timeoutMs: Math.min(config.activation.processTimeoutMs, 10_000),
    }),
    processController: new NativeManagedProcessController({ runner }),
    healthProbe,
    policy,
    downloadOptions: config.download,
    activationHealthTimeoutMs: config.activation.healthTimeoutMs,
    activationHealthPollIntervalMs: config.activation.healthPollIntervalMs,
    processTimeoutMs: config.activation.processTimeoutMs,
    runtimeOpenApiProbe: new RequiredContractOpenApiProbe(openApi, listRequiredFqgateContracts()),
    logger: new StructuredLogger({ level: config.logLevel }),
  });
  return {
    lifecycle,
    openApi,
    update: new FqgateUpdateService({ lifecycle }),
  };
}

export function createLifecycleManager(config: AppConfig): FqgateLifecycleManager {
  return createApplicationServices(config).lifecycle;
}
