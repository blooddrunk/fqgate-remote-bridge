import { BridgeError, ERROR_CODES } from "../../shared/errors.js";
import { parseVersion } from "../../shared/semver.js";
import type { CompatibilityEvaluation, CompatibilityPolicy } from "../compatibility/policy.js";
import type { ProcessRunner } from "./types.js";

export interface CandidateInspection {
  readonly version: string;
  readonly compatibility: CompatibilityEvaluation;
}

export interface CandidateValidation extends CandidateInspection {
  readonly executablePath: string;
}

export class FqgateCandidateValidator {
  private readonly runner: ProcessRunner;
  private readonly policy: CompatibilityPolicy;
  private readonly timeoutMs: number;

  constructor(dependencies: {
    readonly runner: ProcessRunner;
    readonly policy: CompatibilityPolicy;
    readonly timeoutMs?: number;
  }) {
    this.runner = dependencies.runner;
    this.policy = dependencies.policy;
    this.timeoutMs = dependencies.timeoutMs ?? 5_000;
  }

  async inspect(executablePath: string): Promise<CandidateInspection> {
    const result = await this.runner.run(executablePath, ["--version"], {
      timeoutMs: this.timeoutMs,
      maxOutputBytes: 16_384,
    });
    if (result.timedOut) {
      throw new BridgeError(ERROR_CODES.CANDIDATE_INVALID, "FQGate candidate --version timed out");
    }
    if (result.truncated) {
      throw new BridgeError(
        ERROR_CODES.CANDIDATE_INVALID,
        "FQGate candidate --version output exceeded the safety limit",
      );
    }
    if (result.exitCode !== 0) {
      throw new BridgeError(
        ERROR_CODES.CANDIDATE_INVALID,
        `FQGate candidate --version exited with code ${String(result.exitCode)}`,
      );
    }

    const version = parseFqgateVersionOutput(result.stdout, result.stderr);
    if (version === undefined) {
      throw new BridgeError(
        ERROR_CODES.CANDIDATE_INVALID,
        "FQGate candidate did not identify itself with a supported version string",
      );
    }
    return { version, compatibility: this.policy.evaluate(version) };
  }

  async validate(
    executablePath: string,
    expectedVersion?: string,
    options: { readonly allowSupportedUnvalidated?: boolean } = {},
  ): Promise<CandidateValidation> {
    const inspected = await this.inspect(executablePath);
    if (expectedVersion !== undefined && inspected.version !== expectedVersion) {
      throw new BridgeError(
        ERROR_CODES.CANDIDATE_INVALID,
        `FQGate candidate version ${inspected.version} does not match manifest version ${expectedVersion}`,
        {
          expectedVersion,
          actualVersion: inspected.version,
        },
      );
    }
    if (options.allowSupportedUnvalidated === true) {
      this.policy.assertSupported(inspected.version);
    } else {
      this.policy.assertActivatable(inspected.version);
    }
    return { executablePath, ...inspected };
  }
}

export function parseFqgateVersionOutput(stdout: string, stderr: string): string | undefined {
  const combined = `${stdout}\n${stderr}`;
  const match =
    /^\s*FQGate(?:\.exe)?\s+(?:version\s+)?v?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)\s*$/im.exec(
      combined,
    );
  if (match === null || parseVersion(match[1]) === undefined) {
    return undefined;
  }
  return match[1];
}
