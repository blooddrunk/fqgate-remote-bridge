import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { compareBytes, inspectBytes, sha256 } from "../scripts/lib/mp11-static.mjs";

const fixture = (bytes = Buffer.from("prefix:GET /v2/example:suffix")) => ({
  bytes,
  pin: {
    bytes: bytes.length,
    sha256: sha256(bytes),
    slices: [
      {
        name: "client",
        offset: 7,
        bytes: 15,
        sha256: sha256(bytes.subarray(7, 22)),
        needles: ["GET /v2/example", "session_epoch"],
      },
    ],
  },
});

describe("MP11 non-executing pinned static evidence", () => {
  it("reports absolute byte offsets and confines missing evidence to the slice", () => {
    const { bytes, pin } = fixture();
    expect(inspectBytes(bytes, pin).slices[0]!.observations).toEqual([
      { needle: "GET /v2/example", state: "OBSERVED_STATIC", firstByteOffset: 7 },
      { needle: "session_epoch", state: "MISSING", firstByteOffset: null },
    ]);
    expect(inspectBytes(bytes, pin).runtimeQualified).toBe(false);
  });
  it.each(["truncate", "append", "corrupt", "wrong-hash", "bad-hash"])(
    "rejects %s full input before trusting slices",
    (kind) => {
      let { bytes } = fixture();
      const { pin } = fixture();
      if (kind === "truncate") bytes = bytes.subarray(0, -1);
      if (kind === "append") bytes = Buffer.concat([bytes, Buffer.from("x")]);
      if (kind === "corrupt") bytes[0] = 0;
      if (kind === "wrong-hash") pin.sha256 = "0".repeat(64);
      if (kind === "bad-hash") pin.sha256 = "INVALID";
      expect(() => inspectBytes(bytes, pin)).toThrow();
    },
  );
  it.each([-1, 0.5, Number.MAX_SAFE_INTEGER, Infinity, NaN])(
    "rejects unsafe slice offset %s",
    (offset) => {
      const { bytes, pin } = fixture();
      pin.slices[0]!.offset = offset;
      expect(() => inspectBytes(bytes, pin)).toThrow();
    },
  );
  it.each([0, -1, 0.5, 1024 * 1024 + 1, 100])("rejects invalid slice size %s", (size) => {
    const { bytes, pin } = fixture();
    pin.slices[0]!.bytes = size;
    expect(() => inspectBytes(bytes, pin)).toThrow();
  });
  it("rejects slice hash disagreement even with a matching whole input", () => {
    const { bytes, pin } = fixture();
    pin.slices[0]!.sha256 = "0".repeat(64);
    expect(() => inspectBytes(bytes, pin)).toThrow("SLICE_HASH_MISMATCH");
  });
  it("rejects empty, duplicate, overlapping and unbounded slice specifications", () => {
    const { bytes, pin } = fixture();
    for (const slices of [
      [],
      [pin.slices[0]!, pin.slices[0]!],
      [pin.slices[0]!, { ...pin.slices[0]!, name: "overlap" }],
      Array.from({ length: 9 }, () => pin.slices[0]!),
    ])
      expect(() => inspectBytes(bytes, { ...pin, slices })).toThrow();
  });
  it.each([[""], ["x".repeat(257)], ["x", "x"], Array(33).fill("x") as string[]])(
    "rejects malformed or unbounded needle lists %j",
    (...needles) => {
      const { bytes, pin } = fixture();
      pin.slices[0]!.needles = needles;
      expect(() => inspectBytes(bytes, pin)).toThrow();
    },
  );
  it("rejects malformed UTF-8 despite matching hashes", () => {
    const { bytes } = fixture();
    bytes[8] = 0xff;
    const { pin } = fixture(bytes);
    expect(() => inspectBytes(bytes, pin)).toThrow();
  });
  it("never executes a matching hostile embedded JavaScript slice", () => {
    const bytes = Buffer.from('throw Error("MUST_NOT_RUN");fetch("https://invalid.example")');
    const pin = {
      bytes: bytes.length,
      sha256: sha256(bytes),
      slices: [
        {
          name: "hostile",
          offset: 0,
          bytes: bytes.length,
          sha256: sha256(bytes),
          needles: ["fetch"],
        },
      ],
    };
    expect(inspectBytes(bytes, pin).slices[0]!.observations[0]!.state).toBe("OBSERVED_STATIC");
  });
  it.each([
    ["abc", "abc", null],
    [
      "abc",
      "axc",
      [
        [1, 2],
        [1, 2],
      ],
    ],
    [
      "ac",
      "abc",
      [
        [1, 1],
        [1, 2],
      ],
    ],
    [
      "abc",
      "ac",
      [
        [1, 2],
        [1, 1],
      ],
    ],
    [
      "a",
      "z",
      [
        [0, 1],
        [0, 1],
      ],
    ],
    [
      "",
      "x",
      [
        [0, 0],
        [0, 1],
      ],
    ],
  ] as const)("finds exact contiguous change for %s / %s", (a, b, range) => {
    const result = compareBytes(Buffer.from(a), Buffer.from(b));
    expect(result.equal).toBe(range === null);
    if (!result.equal) expect([result.beforeRange, result.afterRange]).toEqual(range);
  });
  it("does not ignore changes to an imported module or the executable UI body", () => {
    for (const after of ['import"./new.js";ok()', 'import"./old.js";bad()'])
      expect(compareBytes(Buffer.from('import"./old.js";ok()'), Buffer.from(after)).equal).toBe(
        false,
      );
    expect(() => compareBytes(Buffer.alloc(1024 * 1024 + 1), Buffer.alloc(0))).toThrow();
  });
  it("rejects CLI mutations, missing input and private paths without echoing input", () => {
    const script = fileURLToPath(new URL("../scripts/mp11-static-review.mjs", import.meta.url));
    for (const args of [
      [],
      ["--apply"],
      ["--archive-207", "PRIVATE_DO_NOT_ECHO", "--exe-206", "SECRET"],
    ]) {
      const child = spawnSync(process.execPath, [script, ...args], {
        encoding: "utf8",
        timeout: 5000,
      });
      expect(child.status).toBe(1);
      expect(JSON.parse(child.stdout)).toEqual({
        state: "DENIED",
        reason: "STATIC_INPUT_INVALID",
        runtimeQualified: false,
      });
      expect(child.stdout + child.stderr).not.toMatch(/PRIVATE_DO_NOT_ECHO|SECRET/);
    }
  });
  it("keeps recorded static success separate from native and publisher authority", () => {
    const report = JSON.parse(
      readFileSync(
        new URL("../docs/compatibility/fqgate-mp11-static-report.json", import.meta.url),
        "utf8",
      ),
    );
    expect(report).toMatchObject({
      admission: "DENIED",
      productionAllowed: false,
      runtimeQualified: false,
      runtime: "NOT_EXECUTED",
      runtimeFingerprint207: null,
      nativeSessionEpoch: "UNKNOWN",
      strongAccountIdentity: "UNKNOWN",
      publisherTrust: "UNKNOWN",
    });
    expect(report.legacyOpenapi.requiredOperations).toHaveLength(7);
    expect(
      report.legacyOpenapi.requiredOperations.every(
        (o: { state: string }) => o.state === "MISSING",
      ),
    ).toBe(true);
    expect(report.comparison).toMatchObject([
      { name: "local-api", equal: true },
      { name: "qr-ui", equal: false, beforeRange: [271, 279], afterRange: [271, 279] },
    ]);
  });
});
