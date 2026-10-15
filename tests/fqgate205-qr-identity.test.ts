import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { verifyV2QrIdentity } from "../src/bridge/qr/v2-identity.js";
import * as lookup from "../src/fqgate/market/v2-identity.js";
import { fingerprintJson } from "../src/fqgate/openapi/catalog.js";
import { V2_LOOKUP_TREE_HASH } from "../src/fqgate/market/v2.js";
import { createFqgateLayout } from "../src/fqgate/install/layout.js";
const roots: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(roots.splice(0).map((p) => rm(p, { recursive: true, force: true })));
});
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "qr-native-fixture-"));
  roots.push(root);
  const layout = createFqgateLayout(root);
  await mkdir(layout.currentDirectory, { recursive: true });
  const record = { pid: 123, startedAt: "2026-10-14T03:15:00.220Z" };
  await writeFile(layout.processFile, JSON.stringify(record));
  const native = {
    pid: 123,
    path: layout.currentExecutable,
    created: "2026-10-14T03:15:00.2208930Z",
    profileOutside: true,
  };
  const binding = fingerprintJson({
    pid: native.pid,
    path: resolve(native.path).replaceAll("/", "\\").toLowerCase(),
    created: native.created,
    tree: V2_LOOKUP_TREE_HASH,
  });
  vi.spyOn(lookup, "verifyV2LookupIdentity").mockResolvedValue(binding);
  const f = {
    result: {
      exitCode: 0 as number | null,
      timedOut: false,
      truncated: false,
      stdout: "",
      stderr: "",
    },
    mutate: async () => {},
  };
  const run = vi.fn(async () => {
    await f.mutate();
    return { ...f.result, stdout: f.result.stdout || JSON.stringify(native) };
  });
  return { layout, native, record, run, f, binding };
}
describe("exact QR native creation and profile gate", () => {
  it("adds read-only profile and timestamp binding to the pinned lookup identity", async () => {
    const f = await fixture();
    expect(await verifyV2QrIdentity(f.layout, { run: f.run })).toBe(f.binding);
    expect(f.run.mock.calls[0]).toHaveLength(3);
  });
  it.each([
    "pid",
    "path",
    "time",
    "profile",
    "failure",
    "timeout",
    "truncated",
    "recordChanged",
    "badRecord",
    "badJson",
    "sampleDrift",
  ])("rejects %s", async (kind) => {
    const f = await fixture();
    if (kind === "pid") f.native.pid = 999;
    if (kind === "path") f.native.path = join(tmpdir(), "foreign.exe");
    if (kind === "time") f.native.created = "2026-10-14T03:15:01.220Z";
    if (kind === "profile") f.native.profileOutside = false;
    if (kind === "failure") f.f.result.exitCode = 5;
    if (kind === "timeout") f.f.result.timedOut = true;
    if (kind === "truncated") f.f.result.truncated = true;
    if (kind === "recordChanged")
      f.f.mutate = async () => {
        await writeFile(f.layout.processFile, JSON.stringify({ ...f.record, pid: 999 }));
      };
    if (kind === "badRecord")
      await writeFile(
        f.layout.processFile,
        JSON.stringify({ ...f.record, startedAt: "not-native-creation" }),
      );
    if (kind === "badJson") f.f.result.stdout = "{bad";
    if (kind === "sampleDrift")
      vi.mocked(lookup.verifyV2LookupIdentity).mockResolvedValue("b".repeat(64));
    await expect(verifyV2QrIdentity(f.layout, { run: f.run })).rejects.toMatchObject({
      code: "PROCESS_IDENTITY_MISMATCH",
    });
  });
});
