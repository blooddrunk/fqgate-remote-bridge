#!/usr/bin/env node

import { pathToFileURL } from "node:url";
import { loadConfig } from "../config/config.js";
import { selectWindowsX64Package } from "../fqgate/release/manifest.js";
import { BridgeError, ERROR_CODES, isBridgeError } from "../shared/errors.js";
import { getBuildInfo } from "../shared/build-info.js";
import { Redactor } from "../shared/redaction.js";
import { createApplicationServices } from "../app/runtime.js";
import type { ApplicationServices } from "../app/runtime.js";
import type {
  CloudflaredInstallPlan,
  CloudflaredManager,
  CloudflaredStatus,
} from "../cloudflared/manager.js";
import type {
  FqgateLifecycleManager,
  FqgateStatus,
  ReleasePlan,
} from "../fqgate/install/lifecycle.js";
import { CloudflareApiClient } from "../cloudflare/client.js";
import { loadCloudflareDesiredState } from "../cloudflare/desired.js";
import { CloudflareDiscoveryService } from "../cloudflare/discovery.js";
import { reconcileCloudflareState } from "../cloudflare/reconcile.js";
import { FetchCloudflareGetTransport, getCloudflareApiToken } from "../cloudflare/transport.js";
import { applyCloudflareDnsCheck } from "../cloudflare/apply.js";
import { runRequiredWindowsPhase5cRegression } from "../cloudflare/windows-regression.js";
import {
  FetchCloudflareDnsApplyWriteTransport,
  getCloudflareDnsWriteToken,
} from "../cloudflare/write-transport.js";

export interface CliIo {
  readonly stdout: (line: string) => void;
  readonly stderr: (line: string) => void;
}

const DEFAULT_IO: CliIo = {
  stdout: (line) => process.stdout.write(`${line}\n`),
  stderr: (line) => process.stderr.write(`${line}\n`),
};

interface ParsedArguments {
  readonly positionals: readonly string[];
  readonly json: boolean;
  readonly dryRun: boolean;
  readonly check: boolean;
  readonly apply: boolean;
  readonly configPath?: string;
  readonly desiredStatePath?: string;
  readonly expectedFingerprint?: string;
  readonly checkId?: string;
}

export async function runCli(argv: readonly string[], io: CliIo = DEFAULT_IO): Promise<number> {
  try {
    const args = parseArguments(argv);
    if (args.positionals.length === 0 || args.positionals[0] === "help") {
      io.stdout(usage());
      return 0;
    }

    if (args.positionals[0] === "version") {
      output(getBuildInfo(), args.json, io);
      return 0;
    }

    if (
      args.positionals[0] !== "fqgate" &&
      args.positionals[0] !== "cloudflared" &&
      args.positionals[0] !== "cloudflare"
    ) {
      throw new BridgeError(
        ERROR_CODES.CONFIG_INVALID,
        "Command must begin with fqgate, cloudflared, cloudflare, or version",
      );
    }

    const command = args.positionals[1];
    if (command === undefined) {
      io.stdout(usage());
      return 0;
    }

    if (args.positionals[0] === "cloudflare") {
      if (args.apply) {
        throw new BridgeError(
          ERROR_CODES.CONFIG_INVALID,
          "Phase 6-A Cloudflare commands are read-only; --apply is not supported",
        );
      }
      return await runCloudflare(
        command,
        args.desiredStatePath,
        args.expectedFingerprint,
        args.checkId,
        args.json,
        io,
      );
    }

    const config = await loadConfig(args.configPath);

    if (args.positionals[0] === "cloudflared") {
      return await runCloudflared(
        createApplicationServices(config).cloudflared,
        command,
        args.positionals[2],
        args.dryRun,
        args.json,
        io,
      );
    }

    const application = createApplicationServices(config);
    const manager = application.lifecycle;

    switch (command) {
      case "release":
        return await runRelease(manager, args.json, io);
      case "status":
        return await runStatus(manager, args.json, io);
      case "health":
        return await runHealth(manager, args.json, io);
      case "install":
        return await runInstall(manager, args.dryRun, args.json, io);
      case "qualify":
        return await runQualification(
          manager,
          application.instrumentLookup,
          args.dryRun,
          args.json,
          io,
        );
      case "update":
        return await runUpdate(manager, args.check, args.apply, args.dryRun, args.json, io);
      case "start":
        return await runStatusOperation(() => manager.start(), args.json, io);
      case "stop":
        return await runStatusOperation(() => manager.stop(), args.json, io);
      case "restart":
        return await runStatusOperation(() => manager.restart(), args.json, io);
      default:
        throw new BridgeError(ERROR_CODES.CONFIG_INVALID, `Unknown fqgate command: ${command}`);
    }
  } catch (error) {
    const bridgeError = isBridgeError(error)
      ? error
      : new BridgeError(
          ERROR_CODES.INTERNAL_ERROR,
          error instanceof Error ? error.message : String(error),
        );
    const payload = { error: { code: bridgeError.code, message: bridgeError.message } };
    if (argv.includes("--json")) {
      io.stderr(JSON.stringify(new Redactor().redact(payload)));
    } else {
      io.stderr(`${bridgeError.code}: ${bridgeError.message}`);
    }
    return exitCodeFor(bridgeError.code);
  }
}

async function runCloudflared(
  manager: CloudflaredManager,
  command: string,
  action: string | undefined,
  dryRun: boolean,
  json: boolean,
  io: CliIo,
): Promise<number> {
  switch (command) {
    case "release":
      output(await manager.release(), json, io);
      return 0;
    case "install":
      output(await manager.install({ dryRun }), json, io);
      return 0;
    case "status":
      output(await manager.status(), json, io);
      return 0;
    case "service":
      switch (action) {
        case "install":
          await manager.installService();
          return 0;
        case "start":
          await manager.startService();
          return 0;
        case "stop":
          await manager.stopService();
          return 0;
        case "restart":
          await manager.restartService();
          return 0;
        case "status":
          output(await manager.status(), json, io);
          return 0;
        default:
          throw new BridgeError(
            ERROR_CODES.CONFIG_INVALID,
            "cloudflared service requires install, start, stop, restart, or status",
          );
      }
    default:
      throw new BridgeError(ERROR_CODES.CONFIG_INVALID, `Unknown cloudflared command: ${command}`);
  }
}

async function runCloudflare(
  command: string,
  desiredStatePath: string | undefined,
  expectedFingerprint: string | undefined,
  checkId: string | undefined,
  json: boolean,
  io: CliIo,
): Promise<number> {
  if (command !== "discover" && command !== "plan" && command !== "apply") {
    throw new BridgeError(
      ERROR_CODES.CONFIG_INVALID,
      `Unknown cloudflare command: ${command}; use discover, plan, or apply`,
    );
  }
  if (command === "apply" && process.platform !== "win32") {
    throw new BridgeError(
      ERROR_CODES.CLOUDFLARE_APPLY_REJECTED,
      "Cloudflare production apply requires the permanent Windows Phase 5-C regression environment",
    );
  }
  const resolvedDesiredStatePath =
    desiredStatePath ?? process.env.FQGATE_REMOTE_BRIDGE_CLOUDFLARE_DESIRED_STATE;
  if (resolvedDesiredStatePath === undefined || resolvedDesiredStatePath.length === 0) {
    throw new BridgeError(
      ERROR_CODES.CONFIG_INVALID,
      "cloudflare command requires --desired-state <repo-external-file>",
    );
  }
  if (command === "apply" && (expectedFingerprint === undefined || checkId === undefined)) {
    throw new BridgeError(
      ERROR_CODES.CONFIG_INVALID,
      "cloudflare apply requires --expected-fingerprint <sha256> and one --check-id <id>",
    );
  }
  if (command !== "apply" && (expectedFingerprint !== undefined || checkId !== undefined)) {
    throw new BridgeError(
      ERROR_CODES.CONFIG_INVALID,
      "--expected-fingerprint and --check-id are only valid with cloudflare apply",
    );
  }
  const desired = await loadCloudflareDesiredState(resolvedDesiredStatePath);
  const transport = new FetchCloudflareGetTransport({
    apiToken: getCloudflareApiToken(),
  });
  const client = new CloudflareApiClient({ transport });
  if (command === "apply") {
    if (expectedFingerprint === undefined || checkId === undefined) {
      throw new BridgeError(
        ERROR_CODES.CONFIG_INVALID,
        "Cloudflare apply arguments are incomplete",
      );
    }
    const result = await applyCloudflareDnsCheck({
      desired,
      expectedFingerprint,
      checkId,
      discoveryClient: client,
      createWriteTransport: () =>
        new FetchCloudflareDnsApplyWriteTransport({ apiToken: getCloudflareDnsWriteToken() }),
      verifyRequiredRegression: ({ expectedFingerprint, checkId: selectedCheckId }) =>
        runRequiredWindowsPhase5cRegression({
          desiredStatePath: resolvedDesiredStatePath,
          expectedFingerprint,
          checkId: selectedCheckId,
        }),
    });
    output(result, json, io);
    return 0;
  }
  const observed = await new CloudflareDiscoveryService(client).discover(desired);
  if (command === "discover") {
    output(observed, json, io);
    return 0;
  }
  const plan = reconcileCloudflareState(desired, observed);
  output(plan, json, io);
  return plan.checks.some(
    (check) =>
      check.classification === "ambiguous" ||
      check.classification === "unsafe_conflict" ||
      check.classification === "manual_required" ||
      check.classification === "blocked",
  )
    ? 1
    : 0;
}

async function runRelease(
  manager: FqgateLifecycleManager,
  json: boolean,
  io: CliIo,
): Promise<number> {
  const release = await manager.releaseForCli();
  const selected = selectWindowsX64Package(release);
  output(
    {
      version: release.version,
      publishedAt: release.publishedAt,
      status: release.status,
      package: {
        platform: selected.platform,
        architecture: selected.architecture,
        fileName: selected.fileName,
        size: selected.size,
        sha256: selected.sha256,
        assetUrl: selected.assetUrl,
      },
    },
    json,
    io,
  );
  return 0;
}

async function runStatus(
  manager: FqgateLifecycleManager,
  json: boolean,
  io: CliIo,
): Promise<number> {
  const status = await manager.status();
  output(status, json, io);
  return status.lifecycle === "ready" ||
    status.lifecycle === "stopped" ||
    status.lifecycle === "not_installed"
    ? 0
    : 1;
}

async function runHealth(
  manager: FqgateLifecycleManager,
  json: boolean,
  io: CliIo,
): Promise<number> {
  const health = await manager.health();
  output(health, json, io);
  return health.available && health.validPayload ? 0 : 1;
}

async function runInstall(
  manager: FqgateLifecycleManager,
  dryRun: boolean,
  json: boolean,
  io: CliIo,
): Promise<number> {
  const result = await manager.install({ dryRun });
  output(result, json, io);
  return 0;
}

async function runQualification(
  manager: FqgateLifecycleManager,
  instrumentLookup: ApplicationServices["instrumentLookup"],
  dryRun: boolean,
  json: boolean,
  io: CliIo,
): Promise<number> {
  const result = await manager.qualify({
    probes: [instrumentLookup.createQualificationProbe()],
    dryRun,
  });
  output(result, json, io);
  return 0;
}

async function runUpdate(
  manager: FqgateLifecycleManager,
  check: boolean,
  apply: boolean,
  dryRun: boolean,
  json: boolean,
  io: CliIo,
): Promise<number> {
  if (!apply || check) {
    const plan = await manager.plan();
    output(plan, json, io);
    return plan.action === "blocked" ? 1 : 0;
  }
  const result = await manager.install({ dryRun });
  output(result, json, io);
  return 0;
}

async function runStatusOperation(
  operation: () => Promise<FqgateStatus>,
  json: boolean,
  io: CliIo,
): Promise<number> {
  const status = await operation();
  output(status, json, io);
  return status.lifecycle === "ready" ||
    status.lifecycle === "stopped" ||
    status.lifecycle === "not_installed"
    ? 0
    : 1;
}

function output(value: unknown, json: boolean, io: CliIo): void {
  if (json) {
    io.stdout(JSON.stringify(new Redactor().redact(value)));
    return;
  }
  if (isStatus(value)) {
    io.stdout(formatStatus(value));
    return;
  }
  if (isPlan(value)) {
    io.stdout(formatPlan(value));
    return;
  }
  if (isCloudflaredStatus(value)) {
    io.stdout(formatCloudflaredStatus(value));
    return;
  }
  if (isCloudflaredPlan(value)) {
    io.stdout(formatCloudflaredPlan(value));
    return;
  }
  io.stdout(formatHuman(value));
}

function formatStatus(status: FqgateStatus): string {
  const installed =
    status.installed === undefined
      ? "not installed"
      : `${status.installed.version ?? "unknown version"} sha256=${status.installed.sha256}`;
  return [
    `lifecycle: ${status.lifecycle}`,
    `process: ${status.process.state}${status.process.pid === undefined ? "" : ` (pid ${status.process.pid})`}`,
    `installed: ${installed}`,
    `health: ${status.health.available ? (status.health.validPayload ? "available" : "invalid") : "unavailable"}`,
    `network: ${status.health.networkReady === null ? "unknown" : String(status.health.networkReady)}`,
    `session: ${status.health.session}`,
  ].join("\n");
}

function formatPlan(plan: ReleasePlan): string {
  return [
    `release: ${plan.release.version}`,
    `package: ${plan.package.fileName}`,
    `compatibility: ${plan.compatibility.status}`,
    `action: ${plan.action}`,
    `reason: ${plan.reason}`,
  ].join("\n");
}

function formatCloudflaredPlan(plan: CloudflaredInstallPlan): string {
  return [
    `source: ${plan.source}`,
    `version: ${plan.version}`,
    `asset: ${plan.asset.name}`,
    `sha256: ${plan.asset.sha256}`,
    `action: ${plan.action}`,
    `origin: ${plan.serviceOrigin}`,
  ].join("\n");
}

function formatCloudflaredStatus(status: CloudflaredStatus): string {
  return [
    `origin: ${status.origin}`,
    `installed: ${status.installedVersion ?? "not installed"}`,
    `expected: ${status.expectedReleaseVersion}`,
    `token-file: ${status.tokenFile.state}`,
    `service: ${status.service.supported ? (status.service.installed ? (status.service.running ? "running" : "stopped") : "not installed") : "unsupported on this host"}`,
  ].join("\n");
}

function formatHuman(value: unknown): string {
  if (typeof value === "string") return value;
  return JSON.stringify(value, null, 2) ?? "undefined";
}

function isStatus(value: unknown): value is FqgateStatus {
  return (
    typeof value === "object" &&
    value !== null &&
    "lifecycle" in value &&
    "process" in value &&
    "health" in value
  );
}

function isPlan(value: unknown): value is ReleasePlan {
  return (
    typeof value === "object" &&
    value !== null &&
    "release" in value &&
    "package" in value &&
    "action" in value &&
    "reason" in value
  );
}

function isCloudflaredPlan(value: unknown): value is CloudflaredInstallPlan {
  return (
    typeof value === "object" &&
    value !== null &&
    "source" in value &&
    "asset" in value &&
    "serviceOrigin" in value &&
    "installPath" in value
  );
}

function isCloudflaredStatus(value: unknown): value is CloudflaredStatus {
  return (
    typeof value === "object" &&
    value !== null &&
    "origin" in value &&
    "tokenFile" in value &&
    "service" in value &&
    "expectedReleaseVersion" in value
  );
}

function parseArguments(argv: readonly string[]): ParsedArguments {
  const positionals: string[] = [];
  let json = false;
  let dryRun = false;
  let check = false;
  let apply = false;
  let configPath: string | undefined;
  let desiredStatePath: string | undefined;
  let expectedFingerprint: string | undefined;
  let checkId: string | undefined;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === undefined) {
      continue;
    }
    if (argument === "--json") {
      json = true;
    } else if (argument === "--dry-run") {
      dryRun = true;
    } else if (argument === "--check") {
      check = true;
    } else if (argument === "--apply") {
      apply = true;
    } else if (argument === "--help") {
      positionals.push("help");
    } else if (argument === "--config") {
      const next = argv[index + 1];
      if (next === undefined || next.startsWith("--")) {
        throw new BridgeError(ERROR_CODES.CONFIG_INVALID, "--config requires a file path");
      }
      configPath = next;
      index += 1;
    } else if (argument.startsWith("--config=")) {
      const value = argument.slice("--config=".length);
      if (value.length === 0)
        throw new BridgeError(ERROR_CODES.CONFIG_INVALID, "--config requires a file path");
      configPath = value;
    } else if (argument === "--desired-state") {
      const next = argv[index + 1];
      if (next === undefined || next.startsWith("--")) {
        throw new BridgeError(ERROR_CODES.CONFIG_INVALID, "--desired-state requires a file path");
      }
      desiredStatePath = next;
      index += 1;
    } else if (argument.startsWith("--desired-state=")) {
      const value = argument.slice("--desired-state=".length);
      if (value.length === 0) {
        throw new BridgeError(ERROR_CODES.CONFIG_INVALID, "--desired-state requires a file path");
      }
      desiredStatePath = value;
    } else if (argument === "--expected-fingerprint") {
      const next = argv[index + 1];
      if (next === undefined || next.startsWith("--") || expectedFingerprint !== undefined) {
        throw new BridgeError(
          ERROR_CODES.CONFIG_INVALID,
          "--expected-fingerprint requires one SHA-256 value",
        );
      }
      expectedFingerprint = next;
      index += 1;
    } else if (argument.startsWith("--expected-fingerprint=")) {
      const value = argument.slice("--expected-fingerprint=".length);
      if (value.length === 0 || expectedFingerprint !== undefined) {
        throw new BridgeError(
          ERROR_CODES.CONFIG_INVALID,
          "--expected-fingerprint requires one SHA-256 value",
        );
      }
      expectedFingerprint = value;
    } else if (argument === "--check-id") {
      const next = argv[index + 1];
      if (next === undefined || next.startsWith("--") || checkId !== undefined) {
        throw new BridgeError(
          ERROR_CODES.CONFIG_INVALID,
          "--check-id requires exactly one check ID",
        );
      }
      checkId = next;
      index += 1;
    } else if (argument.startsWith("--check-id=")) {
      const value = argument.slice("--check-id=".length);
      if (value.length === 0 || checkId !== undefined) {
        throw new BridgeError(
          ERROR_CODES.CONFIG_INVALID,
          "--check-id requires exactly one check ID",
        );
      }
      checkId = value;
    } else if (argument.startsWith("--")) {
      throw new BridgeError(ERROR_CODES.CONFIG_INVALID, `Unknown option: ${argument}`);
    } else {
      positionals.push(argument);
    }
  }

  return {
    positionals,
    json,
    dryRun,
    check,
    apply,
    ...(configPath === undefined ? {} : { configPath }),
    ...(desiredStatePath === undefined ? {} : { desiredStatePath }),
    ...(expectedFingerprint === undefined ? {} : { expectedFingerprint }),
    ...(checkId === undefined ? {} : { checkId }),
  };
}

function exitCodeFor(code: string): number {
  if (
    code === ERROR_CODES.CONFIG_INVALID ||
    code === ERROR_CODES.STATE_INVALID ||
    code === ERROR_CODES.CLOUDFLARE_TOKEN_REQUIRED ||
    code === ERROR_CODES.CLOUDFLARE_DESIRED_STATE_INVALID
  )
    return 2;
  if (
    code === ERROR_CODES.MANIFEST_FETCH_FAILED ||
    code === ERROR_CODES.MANIFEST_INVALID ||
    code === ERROR_CODES.PACKAGE_NOT_FOUND ||
    code === ERROR_CODES.PACKAGE_AMBIGUOUS ||
    code === ERROR_CODES.CLOUDFLARE_API_REQUEST_FAILED ||
    code === ERROR_CODES.CLOUDFLARE_API_RESPONSE_INVALID ||
    code === ERROR_CODES.CLOUDFLARE_API_RESPONSE_TOO_LARGE ||
    code === ERROR_CODES.CLOUDFLARE_PAGINATION_LIMIT
  )
    return 3;
  if (
    code === ERROR_CODES.DOWNLOAD_FAILED ||
    code === ERROR_CODES.SIZE_MISMATCH ||
    code === ERROR_CODES.CHECKSUM_MISMATCH
  )
    return 4;
  if (code === ERROR_CODES.CANDIDATE_INVALID || code === ERROR_CODES.VERSION_INCOMPATIBLE) return 5;
  if (
    code === ERROR_CODES.NOT_INSTALLED ||
    code === ERROR_CODES.PROCESS_START_FAILED ||
    code === ERROR_CODES.PROCESS_STOP_FAILED ||
    code === ERROR_CODES.PROCESS_IDENTITY_MISMATCH
  )
    return 6;
  if (
    code === ERROR_CODES.HEALTH_TIMEOUT ||
    code === ERROR_CODES.HEALTH_INVALID ||
    code === ERROR_CODES.UPSTREAM_RESPONSE_INVALID ||
    code === ERROR_CODES.COMPATIBILITY_PROBE_FAILED
  )
    return 7;
  if (code === ERROR_CODES.ROLLBACK_FAILED || code === ERROR_CODES.ACTIVATION_FAILED) return 8;
  return 1;
}

function usage(): string {
  return [
    "fqgate-remote-bridge version",
    "fqgate-remote-bridge fqgate release [--json]",
    "fqgate-remote-bridge fqgate status [--json]",
    "fqgate-remote-bridge fqgate health [--json]",
    "fqgate-remote-bridge fqgate install [--dry-run] [--json]",
    "fqgate-remote-bridge fqgate qualify [--dry-run] [--json]",
    "fqgate-remote-bridge fqgate update --check|--apply [--dry-run] [--json]",
    "fqgate-remote-bridge fqgate start|stop|restart [--json]",
    "fqgate-remote-bridge cloudflared release|install|status [--dry-run] [--json]",
    "fqgate-remote-bridge cloudflared service install|start|stop|restart|status [--json]",
    "fqgate-remote-bridge cloudflare discover|plan --desired-state <repo-external-file> [--json]",
    "fqgate-remote-bridge cloudflare apply --desired-state <repo-external-file> --expected-fingerprint <sha256> --check-id <dns.context.record> [--json]",
  ].join("\n");
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void runCli(process.argv.slice(2)).then((exitCode) => {
    process.exitCode = exitCode;
  });
}
