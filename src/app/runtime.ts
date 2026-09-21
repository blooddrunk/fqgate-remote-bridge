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
import { CloudflaredManager } from "../cloudflared/manager.js";
import { SafeCloudflaredArtifactDownloader } from "../cloudflared/release/downloader.js";
import { OfficialCloudflaredReleaseSource } from "../cloudflared/release/source.js";
import { PosixTokenFileAcl, ProtectedTokenFileStore } from "../cloudflared/token-file.js";
import { WindowsTokenFileAcl } from "../cloudflared/windows/acl.js";
import { WindowsCloudflaredServiceController } from "../cloudflared/windows/service.js";
import { FqgateInstrumentLookup } from "../fqgate/market/lookup.js";
import { legacyLookupQualificationEvidence } from "../fqgate/market/compatibility.js";

export interface ApplicationServices {
  readonly lifecycle: FqgateLifecycleManager;
  readonly instrumentLookup: FqgateInstrumentLookup;
  readonly openApi: FqgateOpenApiService;
  readonly update: FqgateUpdateService;
  readonly cloudflared: CloudflaredManager;
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
  const instrumentLookup = new FqgateInstrumentLookup({
    http,
    runtime: async () => {
      const status = await lifecycle.status();
      const compatibility = status.compatibility ?? status.installed?.compatibility;
      const operationEvidence =
        status.installed?.qualification?.operations ??
        legacyLookupQualificationEvidence(
          status.installed?.version,
          compatibility?.validated === true,
        );
      return {
        version: status.installed?.version,
        supported: compatibility?.supported === true,
        validated: compatibility?.validated === true,
        operationEvidence,
        running: status.process.state === "running",
      };
    },
  });
  const cloudflaredTokenAcl =
    process.platform === "win32"
      ? new WindowsTokenFileAcl({ runner, platform: process.platform })
      : new PosixTokenFileAcl();
  const cloudflaredTokenFiles = new ProtectedTokenFileStore({
    platform: process.platform,
    acl: cloudflaredTokenAcl,
  });
  const cloudflaredService =
    process.platform === "win32"
      ? new WindowsCloudflaredServiceController({
          runner,
          tokenFiles: cloudflaredTokenFiles,
          serviceName: config.cloudflared.serviceName,
        })
      : undefined;
  const cloudflared = new CloudflaredManager({
    config: config.cloudflared,
    releaseSource: new OfficialCloudflaredReleaseSource(
      http,
      config.cloudflared.releaseVersion,
      config.download.timeoutMs,
    ),
    downloader: new SafeCloudflaredArtifactDownloader(http),
    runner,
    tokenFiles: cloudflaredTokenFiles,
    ...(cloudflaredService === undefined ? {} : { serviceController: cloudflaredService }),
    downloadOptions: config.download,
    platform: process.platform,
  });
  return {
    lifecycle,
    instrumentLookup,
    openApi,
    update: new FqgateUpdateService({ lifecycle }),
    cloudflared,
  };
}

export function createLifecycleManager(config: AppConfig): FqgateLifecycleManager {
  return createApplicationServices(config).lifecycle;
}
