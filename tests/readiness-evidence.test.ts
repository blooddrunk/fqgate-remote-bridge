import { mkdtemp, mkdir, writeFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  classifyProcessRecord,
  fileCondition,
  snapshotProtected,
  compareProtected,
} from "../src/fqgate/diagnostics/readiness-evidence.js";
const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((r) => rm(r, { recursive: true, force: true })));
});
const owner = {
  pid: 12,
  parentPid: 1,
  path: "C:\\payload\\fqgate.exe",
  pathSafe: true,
  created: "2026-10-24T00:00:00.1234567Z",
};
const record = () => ({ pid: 12, executablePath: owner.path, startedAt: owner.created });
describe("MP5 redacted evidence integrity", () => {
  it.each([
    ["matching", "OBSERVED"],
    ["pid-reuse", "STALE"],
    ["creation-tick", "STALE"],
    ["rounded", "STALE"],
    ["path", "MISMATCH"],
    ["reparse", "MISMATCH"],
    ["missing-owner", "UNKNOWN"],
    ["unreadable", "UNREADABLE"],
  ])("MP5-04 %s process record has a distinct condition", (kind, expected) => {
    const r = record(),
      p = { ...owner };
    if (kind === "pid-reuse") r.pid++;
    if (kind === "creation-tick") r.startedAt = "2026-10-24T00:00:00.1234566Z";
    if (kind === "rounded") r.startedAt = "2026-10-24T00:00:00.123Z";
    if (kind === "path") r.executablePath = "C:\\OTHER_SECRET\\fqgate.exe";
    if (kind === "reparse") p.pathSafe = false;
    const result = classifyProcessRecord(
      kind === "unreadable" ? "SECRET" : r,
      kind === "missing-owner" ? undefined : p,
      owner.path,
    );
    expect(result).toBe(expected);
    expect(JSON.stringify(result)).not.toMatch(/SECRET|payload|fqgate/);
  });
  it("MP5-05 byte comparison detects edits, additions and deletions without publishing names or values", async () => {
    const root = await mkdtemp(join(tmpdir(), "mp5-integrity-"));
    roots.push(root);
    await mkdir(join(root, "dist"));
    const config = join(root, "SECRET-config.json");
    await writeFile(config, "SECRET_TOKEN");
    await writeFile(join(root, "dist", "old.js"), "old");
    const before = await snapshotProtected(root, [config]);
    expect(compareProtected(before, await snapshotProtected(root, [config])).unchanged).toBe(true);
    await writeFile(config, "CHANGED_SECRET");
    await rm(join(root, "dist", "old.js"));
    await writeFile(join(root, "dist", "new.js"), "new");
    const comparison = compareProtected(before, await snapshotProtected(root, [config]));
    expect(comparison).toMatchObject({ condition: "MISMATCH", changedCount: 3, unchanged: false });
    expect(JSON.stringify(comparison)).not.toMatch(/SECRET|config|old.js|new.js/);
  });
  it("MP5-06 missing file differs from unreadable/unsafe and unsafe snapshots never compare green", async () => {
    const root = await mkdtemp(join(tmpdir(), "mp5-link-"));
    roots.push(root);
    expect((await fileCondition(join(root, "absent"))).condition).toBe("ABSENT");
    expect((await fileCondition(join(root, "missing-parent", "absent"))).condition).toBe(
      "UNREADABLE",
    );
    await writeFile(join(root, "file"), "SECRET");
    expect((await fileCondition(join(root, "file"), 1)).condition).toBe("UNREADABLE");
    // Junctions work without Windows symlink privilege; Unix uses a directory symlink.
    await mkdir(join(root, "target"));
    await symlink(join(root, "target"), join(root, "dist"), "junction");
    const before = await snapshotProtected(root, []),
      after = await snapshotProtected(root, []);
    expect(compareProtected(before, after)).toMatchObject({
      condition: "UNREADABLE",
      unchanged: false,
    });
  });
});
