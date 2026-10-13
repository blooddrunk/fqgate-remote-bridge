import { mkdtemp, mkdir, writeFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createFqgateLayout } from "../src/fqgate/install/layout.js";
import { verifyV2LookupIdentity } from "../src/fqgate/market/v2-identity.js";
import * as tree from "../src/fqgate/v2/directory-transaction.js";
import { V2_LOOKUP_TREE_HASH } from "../src/fqgate/market/v2.js";
const roots: string[] = [];
afterEach(async () => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  await Promise.all(roots.splice(0).map((p) => rm(p, { recursive: true, force: true })));
});
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "v2-readonly-identity-"));
  roots.push(root);
  const layout = createFqgateLayout(root);
  await mkdir(layout.currentDirectory, { recursive: true });
  const state = {
    schemaVersion: 1,
    active: {
      version: "2.0.5",
      fileName: "FQGate.exe",
      size: 53590016,
      sha256: "d0a104f6d25b98b971999a585080ccbe0c9bc9470ca86a602d937f6d23816847",
    },
    lastActivation: "succeeded",
    updatedAt: new Date().toISOString(),
  };
  const record = { pid: 123, executablePath: layout.currentExecutable };
  await writeFile(layout.stateFile, JSON.stringify(state));
  await writeFile(layout.processFile, JSON.stringify(record));
  vi.stubGlobal("process", { ...process, platform: "win32" });
  vi.spyOn(tree, "payloadTreeHash").mockResolvedValue(V2_LOOKUP_TREE_HASH);
  const native = { pid: 123, path: layout.currentExecutable, created: "2026-10-13T07:00:00.000Z" };
  const run = vi.fn(async () => ({
    exitCode: 0,
    stdout: JSON.stringify(native),
    stderr: "",
    timedOut: false,
    truncated: false,
  }));
  return { layout, state, record, native, run };
}
describe("read-only v2 payload/process/listener gate", () => {
  it("binds the recorded PID, native path/creation and full payload without process actions", async () => {
    const f = await fixture();
    const first = await verifyV2LookupIdentity(f.layout, { run: f.run });
    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(f.run).toHaveBeenCalledTimes(1);
    f.native.created = "2026-10-13T08:00:00.000Z";
    expect(await verifyV2LookupIdentity(f.layout, { run: f.run })).not.toBe(first);
    expect(f.run.mock.calls[0]?.length).toBe(3);
  });
  it.each([
    "pid",
    "path",
    "creation",
    "nativeFailure",
    "timeout",
    "truncated",
    "payload",
    "record",
    "state",
    "lock",
    "transaction",
  ])("rejects unsafe identity %s", async (kind) => {
    const f = await fixture();
    if (kind === "pid") f.native.pid = 999;
    if (kind === "path") f.native.path = join(tmpdir(), "foreign.exe");
    if (kind === "creation") f.native.created = "unknown";
    if (kind === "nativeFailure")
      f.run.mockResolvedValue({
        exitCode: 4,
        stdout: "",
        stderr: "",
        timedOut: false,
        truncated: false,
      });
    if (kind === "timeout")
      f.run.mockResolvedValue({
        exitCode: 0,
        stdout: "",
        stderr: "",
        timedOut: true,
        truncated: false,
      });
    if (kind === "truncated")
      f.run.mockResolvedValue({
        exitCode: 0,
        stdout: "",
        stderr: "",
        timedOut: false,
        truncated: true,
      });
    if (kind === "payload") vi.mocked(tree.payloadTreeHash).mockResolvedValue("b".repeat(64));
    if (kind === "record")
      await writeFile(f.layout.processFile, JSON.stringify({ ...f.record, pid: 999 }));
    if (kind === "state")
      await writeFile(
        f.layout.stateFile,
        JSON.stringify({ ...f.state, active: { ...f.state.active, sha256: "b".repeat(64) } }),
      );
    if (kind === "lock") await writeFile(f.layout.lockFile, "operator lock");
    if (kind === "transaction") await writeFile(f.layout.transactionFile, "operator transaction");
    await expect(verifyV2LookupIdentity(f.layout, { run: f.run })).rejects.toMatchObject({
      code: "PROCESS_IDENTITY_MISMATCH",
    });
  });
  it("rejects symlink and oversized process records", async () => {
    const f = await fixture();
    await writeFile(f.layout.processFile, " ".repeat(4097));
    await expect(verifyV2LookupIdentity(f.layout, { run: f.run })).rejects.toMatchObject({
      code: "PROCESS_IDENTITY_MISMATCH",
    });
    await rm(f.layout.processFile);
    const target = join(f.layout.home, "record.txt");
    await mkdir(target);
    await writeFile(join(target, "fixture.json"), JSON.stringify(f.record));
    await symlink(target, f.layout.processFile, "junction");
    await expect(verifyV2LookupIdentity(f.layout, { run: f.run })).rejects.toMatchObject({
      code: "PROCESS_IDENTITY_MISMATCH",
    });
    expect(f.run).not.toHaveBeenCalled();
  });
});
