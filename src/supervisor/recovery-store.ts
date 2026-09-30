import { constants } from "node:fs";
import { lstat, open, rename, rm } from "node:fs/promises";
import { join } from "node:path";
import { EventJournal } from "./journal.js";
import { validateRecoveryHistory } from "./recovery.js";
import type { RecoveryComponent, RecoveryDecision, RecoveryHistory } from "./recovery.js";

export const MAX_RECOVERY_FILE_BYTES = 4_096;
const FILE = "recovery.json";
const TEMP = "recovery.tmp";

export interface RecoveryFile {
  readonly schemaVersion: 1;
  readonly history: RecoveryHistory;
  readonly decisions: readonly RecoveryDecision[];
}

async function safeFile(path: string): Promise<boolean> {
  try {
    const info = await lstat(path);
    if (
      !info.isFile() ||
      info.isSymbolicLink() ||
      info.nlink !== 1 ||
      info.size > MAX_RECOVERY_FILE_BYTES
    )
      throw new Error("Invalid recovery file");
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

function validateFile(value: unknown): RecoveryFile {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new Error("Invalid recovery file");
  const file = value as RecoveryFile;
  if (
    Object.keys(file).sort().join() !== "decisions,history,schemaVersion" ||
    file.schemaVersion !== 1 ||
    !Array.isArray(file.decisions) ||
    file.decisions.length !== 3
  )
    throw new Error("Invalid recovery file");
  validateRecoveryHistory(file.history);
  const components = ["bridge", "fqgate", "tunnel"];
  const kinds = ["no_action", "eligible", "suppressed", "exhausted", "forbidden"];
  const reasons = [
    "healthy",
    "threshold",
    "cooldown",
    "attempt_limit",
    "eligible",
    "login_required",
    "incompatible",
    "missing_tunnel",
    "unknown_state",
    "probe_failed",
    "identity_unknown",
    "transaction_unresolved",
    "history_invalid",
  ];
  const actions = ["bridge.restart", "fqgate.restart", "tunnel.restart"];
  for (const [index, decision] of file.decisions.entries()) {
    if (
      typeof decision !== "object" ||
      decision === null ||
      decision.schemaVersion !== 1 ||
      decision.component !== components[index] ||
      !kinds.includes(decision.decision) ||
      !reasons.includes(decision.reason) ||
      !Number.isSafeInteger(decision.attemptsInWindow) ||
      decision.attemptsInWindow < 0 ||
      decision.attemptsInWindow > 5 ||
      (decision.action !== undefined && decision.action !== actions[index]) ||
      (decision.notBefore !== undefined &&
        (typeof decision.notBefore !== "string" ||
          decision.notBefore.length !== 24 ||
          !Number.isFinite(Date.parse(decision.notBefore)))) ||
      Object.keys(decision).some(
        (key) =>
          ![
            "schemaVersion",
            "component",
            "observedState",
            "decision",
            "action",
            "reason",
            "notBefore",
            "attemptsInWindow",
          ].includes(key),
      )
    )
      throw new Error("Invalid recovery file");
    if (decision.observedState !== file.history[components[index] as RecoveryComponent].lastState)
      throw new Error("Invalid recovery file");
  }
  return file;
}

export class RecoveryStore {
  private readonly journal: EventJournal;
  constructor(
    readonly directory: string,
    repository?: string,
  ) {
    this.journal = new EventJournal(directory, repository);
  }

  async acquire(): Promise<() => Promise<void>> {
    const release = await this.journal.acquire();
    try {
      await safeFile(join(this.directory, FILE));
      // A previous interrupted write is ambiguous: never infer permission from it.
      if (await safeFile(join(this.directory, TEMP))) throw new Error("Invalid recovery file");
      return release;
    } catch (error) {
      await release();
      throw error;
    }
  }

  async read(): Promise<RecoveryFile | undefined> {
    await this.journal.prepare();
    const path = join(this.directory, FILE);
    if (!(await safeFile(path))) return undefined;
    const handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    try {
      const info = await handle.stat();
      if (!info.isFile() || info.nlink !== 1 || info.size > MAX_RECOVERY_FILE_BYTES)
        throw new Error("Invalid recovery file");
      const content = await handle.readFile("utf8");
      if (Buffer.byteLength(content) > MAX_RECOVERY_FILE_BYTES)
        throw new Error("Invalid recovery file");
      return validateFile(JSON.parse(content) as unknown);
    } finally {
      await handle.close();
    }
  }

  async write(value: RecoveryFile): Promise<void> {
    validateFile(value);
    await this.journal.prepare();
    const content = JSON.stringify(value);
    if (Buffer.byteLength(content) > MAX_RECOVERY_FILE_BYTES)
      throw new Error("Invalid recovery file");
    const target = join(this.directory, FILE);
    const temp = join(this.directory, TEMP);
    await safeFile(target);
    if (await safeFile(temp)) throw new Error("Invalid recovery file");
    const handle = await open(
      temp,
      constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | (constants.O_NOFOLLOW ?? 0),
      0o600,
    );
    try {
      await handle.writeFile(content, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
    try {
      await rename(temp, target);
    } catch (error) {
      await rm(temp, { force: true });
      throw error;
    }
  }
}
