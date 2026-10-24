import { createHash } from "node:crypto";
import { lstat, readFile, readdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import type { NativeProcessFact } from "./source-readiness-mp5.js";

export const digest = (bytes: Uint8Array | string) =>
  createHash("sha256").update(bytes).digest("hex");
export type Condition = "OBSERVED" | "ABSENT" | "UNREADABLE" | "MISMATCH" | "STALE" | "UNKNOWN";

// Private data stays inside the caller. Only enum reasons leave this classifier.
export function classifyProcessRecord(
  record: unknown,
  owner: NativeProcessFact | undefined,
  expectedPath: string,
): Condition {
  if (!record || typeof record !== "object" || Array.isArray(record)) return "UNREADABLE";
  const r = record as Record<string, unknown>;
  if (!owner) return "UNKNOWN";
  if (
    !Number.isSafeInteger(r.pid) ||
    typeof r.executablePath !== "string" ||
    typeof r.startedAt !== "string"
  )
    return "UNREADABLE";
  const normalize = (p: string) => p.replaceAll("/", "\\").toLowerCase();
  if (
    normalize(r.executablePath) !== normalize(expectedPath) ||
    normalize(owner.path) !== normalize(expectedPath) ||
    !owner.pathSafe
  )
    return "MISMATCH";
  // Seven decimals fence PID reuse; missing precision is unproven, never rounded to a match.
  const ticks = (v: string) => {
    const m = /^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d)\.(\d{3,7})Z$/.exec(v);
    return m && Number.isFinite(Date.parse(v)) ? `${m[1]}.${m[2]!.padEnd(7, "0")}Z` : null;
  };
  const recorded = ticks(r.startedAt),
    created = ticks(owner.created);
  if (!recorded || !created) return "UNREADABLE";
  return r.pid === owner.pid && recorded === created ? "OBSERVED" : "STALE";
}

export async function safeAncestors(path: string) {
  let cursor = resolve(path);
  for (let i = 0; i < 64; i++) {
    const st = await lstat(cursor);
    if (st.isSymbolicLink()) throw Error("UNSAFE_PATH");
    const parent = dirname(cursor);
    if (parent === cursor) return;
    cursor = parent;
  }
  throw Error("PATH_DEPTH");
}
export async function boundedFile(path: string, max = 65536): Promise<Uint8Array> {
  await safeAncestors(path);
  const st = await lstat(path);
  if (!st.isFile() || st.size > max) throw Error("UNSAFE_FILE");
  const bytes = await readFile(path);
  const after = await lstat(path);
  if (
    bytes.length !== st.size ||
    after.size !== st.size ||
    after.mtimeMs !== st.mtimeMs ||
    after.ino !== st.ino ||
    after.isSymbolicLink()
  )
    throw Error("FILE_CHANGED");
  return bytes;
}
export async function fileCondition(
  path: string,
  max = 65536,
): Promise<{
  condition: Condition;
  bytes?: Uint8Array;
}> {
  try {
    return { condition: "OBSERVED", bytes: await boundedFile(path, max) };
  } catch (e) {
    // ENOENT is absence only if its parent is readable and safe.
    if ((e as NodeJS.ErrnoException).code === "ENOENT") {
      try {
        await safeAncestors(dirname(path));
        return { condition: "ABSENT" };
      } catch {
        /* unreadable */
      }
    }
    return { condition: "UNREADABLE" };
  }
}

export interface ProtectedSnapshot {
  readonly entries: Readonly<Record<string, string>>;
  readonly complete: boolean;
  readonly count: number;
  readonly sha256: string;
}
// Only Bridge outputs and explicit operator configuration/state/record files. Never WebView data.
export async function snapshotProtected(
  root: string,
  files: readonly string[],
): Promise<ProtectedSnapshot> {
  const entries: Record<string, string> = {};
  let total = 0,
    count = 0,
    complete = true;
  const capture = async (path: string, label: string) => {
    const result = await fileCondition(path, 128 * 1024 * 1024);
    if (result.condition === "UNREADABLE") complete = false;
    if (result.bytes) {
      total += result.bytes.length;
      if (total > 1024 * 1024 * 1024) throw Error();
    }
    entries[label] = result.bytes ? digest(result.bytes) : result.condition;
    count++;
    if (count > 8192) throw Error();
  };
  const scan = async (path: string, label: string, depth = 0) => {
    if (depth > 32 || count > 8192 || total > 1024 * 1024 * 1024) {
      complete = false;
      return;
    }
    try {
      await safeAncestors(path);
      const st = await lstat(path);
      if (!st.isDirectory()) {
        await capture(path, label);
        return;
      }
      entries[label] = "DIRECTORY";
      count++;
      if (count > 8192) throw Error();
      for (const name of (await readdir(path)).sort())
        await scan(join(path, name), `${label}/${name}`, depth + 1);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") {
        try {
          await safeAncestors(dirname(path));
          entries[label] = "ABSENT";
          return;
        } catch {
          /* unreadable */
        }
      }
      complete = false;
      entries[label] = "UNREADABLE";
    }
  };
  for (const name of ["dist", ".output"]) await scan(join(root, name), name);
  for (let i = 0; i < files.length; i++) {
    try {
      await capture(files[i]!, `private-${i + 1}`);
    } catch {
      complete = false;
      entries[`private-${i + 1}`] = "UNREADABLE";
    }
  }
  const ordered = Object.fromEntries(
    Object.entries(entries).sort(([a], [b]) => a.localeCompare(b)),
  );
  return { entries: ordered, complete, count, sha256: digest(JSON.stringify(ordered)) };
}
export function compareProtected(before: ProtectedSnapshot, after: ProtectedSnapshot) {
  const labels = new Set([...Object.keys(before.entries), ...Object.keys(after.entries)]);
  const changed = [...labels].filter((k) => before.entries[k] !== after.entries[k]).length;
  return {
    condition:
      !before.complete || !after.complete ? "UNREADABLE" : changed ? "MISMATCH" : "OBSERVED",
    unchanged: before.complete && after.complete && changed === 0,
    beforeSha256: before.sha256,
    afterSha256: after.sha256,
    beforeCount: before.count,
    afterCount: after.count,
    changedCount: changed,
  };
}
