/** Non-executing exact-artifact observation; string presence/absence is NOT flag support. */
import { readFile, lstat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { Buffer } from "node:buffer";
import process from "node:process";
import console from "node:console";

const args = process.argv.slice(2);
try {
  if (args.length !== 2 || args[0] !== "--executable") throw Error();
  const before = await lstat(args[1]);
  if (!before.isFile() || before.isSymbolicLink() || before.size !== 53590016) throw Error();
  const bytes = await readFile(args[1]);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  if (sha256 !== "d0a104f6d25b98b971999a585080ccbe0c9bc9470ca86a602d937f6d23816847") throw Error();
  const tokens = [
    "--port",
    "--data-root",
    "--user-data-dir",
    "--source-worker",
    "--source-worker-parent-pid",
    "interactive-login.dpapi",
    "LOCALAPPDATA",
    "ths-native-sdk",
    "127.0.0.1:17281",
  ];
  const observations = tokens.map((token) => {
    const ascii = bytes.indexOf(token),
      utf16 = bytes.indexOf(Buffer.from(token, "utf16le"));
    return { token, asciiOffset: ascii < 0 ? null : ascii, utf16Offset: utf16 < 0 ? null : utf16 };
  });
  const after = await lstat(args[1]);
  if (before.ino !== after.ino || before.mtimeMs !== after.mtimeMs || before.size !== after.size)
    throw Error();
  console.log(
    JSON.stringify(
      {
        evidence: "EXACT_ARTIFACT_STATIC_OBSERVATION",
        sha256,
        bytes: bytes.length,
        observations,
        supportedIndependentLaunchContract: "UNPROVEN",
        executableInvocations: 0,
        qualification: "LIVE_MULTI_ACCOUNT_ISOLATION_NOT_QUALIFIED",
      },
      null,
      2,
    ),
  );
} catch {
  console.log(
    JSON.stringify({
      evidence: "BLOCKED",
      reason: "EXACT_ARTIFACT_ARGUMENT_OR_IDENTITY_INVALID",
      executableInvocations: 0,
    }),
  );
  process.exitCode = 2;
}
