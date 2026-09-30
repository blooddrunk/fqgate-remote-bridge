import { constants } from "node:fs";
import { lstat, mkdir, open, readdir, realpath, rename, rm, stat } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Transition } from "./model.js";

export const MAX_RECORD_BYTES = 512;
export const MAX_JOURNAL_BYTES = 64 * 1024;
export const MAX_JOURNAL_FILES = 4;
const FILE = "events.jsonl";
const LOCK = "watch.lock";
const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

export interface JournalRecord {
  readonly schemaVersion: 1;
  readonly at: string;
  readonly event: "observation";
  readonly component: Transition["component"];
  readonly previous?: Transition["previous"];
  readonly current: Transition["current"];
  readonly reason: Transition["reason"];
}

function inside(parent: string, child: string): boolean {
  const rel = relative(parent, child);
  return (
    rel === "" ||
    (rel !== ".." &&
      !rel.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) &&
      !isAbsolute(rel))
  );
}

export async function assertSafeStateDirectory(
  stateDir: string,
  repository = REPOSITORY_ROOT,
): Promise<void> {
  if (!isAbsolute(stateDir)) throw new Error("Supervisor state directory must be absolute");
  const target = resolve(stateDir);
  const repo = resolve(repository);
  if (inside(repo, target) || inside(target, repo))
    throw new Error("Supervisor state directory overlaps repository");
  const segments: string[] = [];
  let cursor = target;
  while (true) {
    segments.push(cursor);
    const parent = dirname(cursor);
    if (parent === cursor) break;
    cursor = parent;
  }
  for (const segment of segments.reverse()) {
    let info;
    try {
      info = await lstat(segment);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
      throw error;
    }
    if (info.isSymbolicLink() || !info.isDirectory())
      throw new Error("Supervisor state path contains a link or non-directory");
    const canonical = await realpath(segment);
    if (inside(repo, canonical)) throw new Error("Supervisor state path resolves into repository");
  }
}

async function assertRegularOrMissing(path: string): Promise<void> {
  try {
    const info = await lstat(path);
    if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1)
      throw new Error("Supervisor journal path is not a regular private file");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

export class EventJournal {
  constructor(
    readonly directory: string,
    readonly repository = REPOSITORY_ROOT,
  ) {}

  async prepare(): Promise<void> {
    await assertSafeStateDirectory(this.directory, this.repository);
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    await assertSafeStateDirectory(this.directory, this.repository);
    for (let i = 0; i < MAX_JOURNAL_FILES; i += 1) {
      await assertRegularOrMissing(join(this.directory, i === 0 ? FILE : `${FILE}.${i}`));
    }
    await assertRegularOrMissing(join(this.directory, LOCK));
  }

  async acquire(): Promise<() => Promise<void>> {
    await this.prepare();
    const path = join(this.directory, LOCK);
    const handle = await open(
      path,
      constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY,
      0o600,
    );
    let released = false;
    return async () => {
      if (released) return;
      released = true;
      const opened = await handle.stat();
      const current = await lstat(path);
      await handle.close();
      if (opened.ino !== current.ino || opened.dev !== current.dev)
        throw new Error("Supervisor lock identity changed");
      await rm(path);
    };
  }

  async append(transition: Transition, at: string): Promise<void> {
    await this.prepare();
    const record = makeRecord(transition, at);
    const line = `${JSON.stringify(record)}\n`;
    const bytes = Buffer.byteLength(line);
    if (bytes > MAX_RECORD_BYTES) throw new Error("Supervisor journal record exceeds bound");
    const path = join(this.directory, FILE);
    const size = await stat(path).then(
      (value) => value.size,
      (error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") return 0;
        throw error;
      },
    );
    if (size > MAX_JOURNAL_BYTES) throw new Error("Supervisor journal exceeds bound");
    if (size + bytes > MAX_JOURNAL_BYTES) await this.rotate();
    await assertRegularOrMissing(path);
    const handle = await open(
      path,
      constants.O_APPEND | constants.O_CREAT | constants.O_WRONLY | (constants.O_NOFOLLOW ?? 0),
      0o600,
    );
    try {
      await handle.writeFile(line, "utf8");
    } finally {
      await handle.close();
    }
  }

  private async rotate(): Promise<void> {
    const oldest = join(this.directory, `${FILE}.${MAX_JOURNAL_FILES - 1}`);
    await assertRegularOrMissing(oldest);
    await rm(oldest, { force: true });
    for (let i = MAX_JOURNAL_FILES - 2; i >= 0; i -= 1) {
      const from = join(this.directory, i === 0 ? FILE : `${FILE}.${i}`);
      const to = join(this.directory, `${FILE}.${i + 1}`);
      await assertRegularOrMissing(from);
      if (
        await stat(from).then(
          () => true,
          () => false,
        )
      )
        await rename(from, to);
    }
  }

  async counts(): Promise<{ records: number; rotatedFiles: number }> {
    await this.prepare();
    const names = await readdir(this.directory);
    let records = 0;
    let rotatedFiles = 0;
    for (const name of names.filter(
      (value) => value === FILE || /^events\.jsonl\.[1-3]$/.test(value),
    )) {
      if (name !== FILE) rotatedFiles += 1;
      const path = join(this.directory, name);
      await assertRegularOrMissing(path);
      const handle = await open(path, "r");
      try {
        const size = (await handle.stat()).size;
        if (size > MAX_JOURNAL_BYTES) throw new Error("Supervisor journal exceeds bound");
        const data = await handle.readFile("utf8");
        for (const line of data.split("\n").filter(Boolean)) {
          if (Buffer.byteLength(`${line}\n`) > MAX_RECORD_BYTES)
            throw new Error("Supervisor record exceeds bound");
          records += 1;
        }
      } finally {
        await handle.close();
      }
    }
    return { records, rotatedFiles };
  }
}

export function makeRecord(transition: Transition, at: string): JournalRecord {
  if (!Number.isFinite(Date.parse(at)) || at.length > 32)
    throw new Error("Invalid supervisor timestamp");
  const allowed: Record<Transition["component"], readonly string[]> = {
    bridge: ["ready", "unavailable"],
    fqgate: ["ready", "unhealthy", "stopped", "incompatible", "unknown"],
    session: ["connected", "guest", "login_required", "unknown"],
    tunnel: ["running", "stopped", "missing", "unknown"],
  };
  const states = allowed[transition.component];
  if (
    !states ||
    !states.includes(transition.current) ||
    (transition.previous !== undefined && !states.includes(transition.previous)) ||
    !["initial", "state_changed", "probe_failed", "probe_recovered"].includes(transition.reason)
  ) {
    throw new Error("Invalid supervisor transition");
  }
  return {
    schemaVersion: 1,
    at,
    event: "observation",
    component: transition.component,
    ...(transition.previous === undefined ? {} : { previous: transition.previous }),
    current: transition.current,
    reason: transition.reason,
  };
}
