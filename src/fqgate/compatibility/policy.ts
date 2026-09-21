import type { CompatibilityConfig } from "../../config/config.js";
import { BridgeError, ERROR_CODES } from "../../shared/errors.js";
import {
  formatVersion,
  parseVersion,
  parseVersionRange,
  satisfiesRange,
  versionsEqual,
} from "../../shared/semver.js";

export type CompatibilityStatus =
  "validated" | "supported_unvalidated" | "unsupported" | "pinned_mismatch";

export interface CompatibilityEvaluation {
  readonly version: string;
  readonly status: CompatibilityStatus;
  readonly supported: boolean;
  readonly validated: boolean;
  readonly reason: string;
}

export class CompatibilityPolicy {
  readonly supportedRange: string;
  readonly validatedVersions: readonly string[];
  readonly pinnedVersion?: string;

  private readonly parsedRange: ReturnType<typeof parseVersionRange>;

  constructor(config: CompatibilityConfig) {
    const parsedRange = parseVersionRange(config.supportedRange);
    if (parsedRange === undefined) {
      throw new BridgeError(
        ERROR_CODES.CONFIG_INVALID,
        "compatibility.supportedRange is not a supported semantic version range",
      );
    }

    const validatedVersions = config.validatedVersions.map((version) => {
      if (parseVersion(version) === undefined) {
        throw new BridgeError(
          ERROR_CODES.CONFIG_INVALID,
          `Invalid validated FQGate version: ${version}`,
        );
      }
      return version;
    });
    const pinnedVersion = config.pinnedVersion;
    if (pinnedVersion !== undefined && parseVersion(pinnedVersion) === undefined) {
      throw new BridgeError(
        ERROR_CODES.CONFIG_INVALID,
        `Invalid pinned FQGate version: ${pinnedVersion}`,
      );
    }

    this.supportedRange = config.supportedRange;
    this.validatedVersions = validatedVersions;
    if (pinnedVersion !== undefined) {
      this.pinnedVersion = pinnedVersion;
    }
    this.parsedRange = parsedRange;
  }

  evaluate(version: string): CompatibilityEvaluation {
    const parsed = parseVersion(version);
    if (parsed === undefined) {
      return {
        version,
        status: "unsupported",
        supported: false,
        validated: false,
        reason: "version is not valid semantic version syntax",
      };
    }

    if (this.pinnedVersion !== undefined && !versionsEqual(version, this.pinnedVersion)) {
      return {
        version,
        status: "pinned_mismatch",
        supported: false,
        validated: false,
        reason: `version does not match configured pin ${this.pinnedVersion}`,
      };
    }

    const supported = this.parsedRange !== undefined && satisfiesRange(parsed, this.parsedRange);
    if (!supported) {
      return {
        version,
        status: "unsupported",
        supported: false,
        validated: false,
        reason: `version is outside supported range ${this.supportedRange}`,
      };
    }

    const validated = this.validatedVersions.some((candidate) => versionsEqual(candidate, version));
    return {
      version,
      status: validated ? "validated" : "supported_unvalidated",
      supported: true,
      validated,
      reason: validated
        ? `version is explicitly validated (${formatVersion(parsed)})`
        : "version is in the supported range but has not passed the project's validation gate",
    };
  }

  /**
   * A quarantined candidate may be admitted only when it is inside the
   * configured base range (and does not violate an operator pin). This does
   * not certify any upstream-backed Bridge operation.
   */
  assertSupported(version: string): CompatibilityEvaluation {
    const evaluation = this.evaluate(version);
    if (!evaluation.supported) {
      throw new BridgeError(
        ERROR_CODES.VERSION_INCOMPATIBLE,
        `FQGate ${version} is outside the supported activation range: ${evaluation.reason}`,
        {
          version,
          status: evaluation.status,
          supportedRange: this.supportedRange,
        },
      );
    }
    return evaluation;
  }

  /**
   * Promote an artifact only after a bounded candidate qualification has
   * completed. The configured pin and supported range remain authoritative.
   */
  evaluateQualified(version: string): CompatibilityEvaluation {
    const evaluation = this.assertSupported(version);
    return {
      ...evaluation,
      status: "validated",
      validated: true,
      reason: `version passed the bounded candidate qualification gate (${evaluation.version})`,
    };
  }

  assertActivatable(version: string): CompatibilityEvaluation {
    const evaluation = this.evaluate(version);
    if (!evaluation.validated) {
      throw new BridgeError(
        ERROR_CODES.VERSION_INCOMPATIBLE,
        `FQGate ${version} is not approved for activation: ${evaluation.reason}`,
        {
          version,
          status: evaluation.status,
          supportedRange: this.supportedRange,
        },
      );
    }
    return evaluation;
  }
}
