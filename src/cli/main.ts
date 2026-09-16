#!/usr/bin/env node

import { pathToFileURL } from "node:url";
import { loadConfig } from "../config/config.js";
import { selectWindowsX64Package } from "../fqgate/release/manifest.js";
import { BridgeError, ERROR_CODES, isBridgeError } from "../shared/errors.js";
import { getBuildInfo } from "../shared/build-info.js";
import { Redactor } from "../shared/redaction.js";
import { createLifecycleManager } from "../app/runtime.js";
import type {
  FqgateLifecycleManager,
  FqgateStatus,
  ReleasePlan,
} from "../fqgate/install/lifecycle.js";

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

    if (args.positionals[0] !== "fqgate") {
      throw new BridgeError(
        ERROR_CODES.CONFIG_INVALID,
        "Command must begin with fqgate or version",
      );
    }

    const config = await loadConfig(args.configPath);
    const manager = createLifecycleManager(config);
    const command = args.positionals[1];
    if (command === undefined) {
      io.stdout(usage());
      return 0;
    }

    switch (command) {
      case "release":
        return await runRelease(manager, args.json, io);
      case "status":
        return await runStatus(manager, args.json, io);
      case "health":
        return await runHealth(manager, args.json, io);
      case "install":
        return await runInstall(manager, args.dryRun, args.json, io);
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

function parseArguments(argv: readonly string[]): ParsedArguments {
  const positionals: string[] = [];
  let json = false;
  let dryRun = false;
  let check = false;
  let apply = false;
  let configPath: string | undefined;

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
  };
}

function exitCodeFor(code: string): number {
  if (code === ERROR_CODES.CONFIG_INVALID || code === ERROR_CODES.STATE_INVALID) return 2;
  if (
    code === ERROR_CODES.MANIFEST_FETCH_FAILED ||
    code === ERROR_CODES.MANIFEST_INVALID ||
    code === ERROR_CODES.PACKAGE_NOT_FOUND ||
    code === ERROR_CODES.PACKAGE_AMBIGUOUS
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
  if (code === ERROR_CODES.HEALTH_TIMEOUT || code === ERROR_CODES.HEALTH_INVALID) return 7;
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
    "fqgate-remote-bridge fqgate update --check|--apply [--dry-run] [--json]",
    "fqgate-remote-bridge fqgate start|stop|restart [--json]",
  ].join("\n");
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void runCli(process.argv.slice(2)).then((exitCode) => {
    process.exitCode = exitCode;
  });
}
