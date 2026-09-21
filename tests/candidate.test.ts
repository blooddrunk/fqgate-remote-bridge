import { describe, expect, it } from "vitest";
import { CompatibilityPolicy } from "../src/fqgate/compatibility/policy.js";
import {
  FqgateCandidateValidator,
  parseFqgateVersionOutput,
} from "../src/fqgate/process/candidate.js";
import { BridgeError, ERROR_CODES } from "../src/shared/errors.js";
import type {
  ProcessRunOptions,
  ProcessRunResult,
  ProcessRunner,
} from "../src/fqgate/process/types.js";

class FakeRunner implements ProcessRunner {
  constructor(private readonly result: ProcessRunResult) {}

  async run(
    _executablePath: string,
    _args: readonly string[],
    _options: ProcessRunOptions,
  ): Promise<ProcessRunResult> {
    return this.result;
  }
}

const success = (stdout: string): ProcessRunResult => ({
  exitCode: 0,
  stdout,
  stderr: "",
  timedOut: false,
  truncated: false,
});

const policy = new CompatibilityPolicy({
  supportedRange: ">=1.0.0 <2.0.0",
  validatedVersions: ["1.0.0"],
});

describe("FQGate candidate validation", () => {
  it("parses only conservative FQGate version forms", () => {
    expect(parseFqgateVersionOutput("FQGate 1.0.0\n", "")).toBe("1.0.0");
    expect(parseFqgateVersionOutput("FQGate.exe version v1.0.0", "")).toBe("1.0.0");
    expect(parseFqgateVersionOutput("some-other-program 1.0.0", "")).toBeUndefined();
    expect(parseFqgateVersionOutput("1.0.0", "")).toBeUndefined();
  });

  it("accepts a compatible candidate only after --version succeeds", async () => {
    const validator = new FqgateCandidateValidator({
      runner: new FakeRunner(success("FQGate 1.0.0")),
      policy,
    });
    const result = await validator.validate("/candidate/fqgate.exe", "1.0.0");
    expect(result.version).toBe("1.0.0");
    expect(result.compatibility.status).toBe("validated");
  });

  it.each([
    ["wrong identity", success("OtherApp 1.0.0"), ERROR_CODES.CANDIDATE_INVALID],
    ["non-zero exit", { ...success("FQGate 1.0.0"), exitCode: 1 }, ERROR_CODES.CANDIDATE_INVALID],
    ["timeout", { ...success("FQGate 1.0.0"), timedOut: true }, ERROR_CODES.CANDIDATE_INVALID],
    ["malformed output", success("version unknown"), ERROR_CODES.CANDIDATE_INVALID],
    ["manifest mismatch", success("FQGate 1.1.0"), ERROR_CODES.CANDIDATE_INVALID],
  ])("rejects %s", async (_name, result, expectedCode) => {
    const validator = new FqgateCandidateValidator({ runner: new FakeRunner(result), policy });
    await expect(validator.validate("/candidate/fqgate.exe", "1.0.0")).rejects.toMatchObject({
      code: expectedCode,
    });
  });

  it("rejects a supported but unvalidated candidate at the activation gate", async () => {
    const validator = new FqgateCandidateValidator({
      runner: new FakeRunner(success("FQGate 1.1.0")),
      policy,
    });
    try {
      await validator.validate("/candidate/fqgate.exe", "1.1.0");
      throw new Error("expected compatibility failure");
    } catch (error) {
      expect(error).toBeInstanceOf(BridgeError);
      expect((error as BridgeError).code).toBe(ERROR_CODES.VERSION_INCOMPATIBLE);
    }
  });

  it("still rejects an unsupported major in the quarantined qualification gate", async () => {
    const validator = new FqgateCandidateValidator({
      runner: new FakeRunner(success("FQGate 2.0.0")),
      policy,
    });
    await expect(
      validator.validate("/candidate/fqgate.exe", "2.0.0", {
        allowSupportedUnvalidated: true,
      }),
    ).rejects.toMatchObject({ code: ERROR_CODES.VERSION_INCOMPATIBLE });
  });
});
