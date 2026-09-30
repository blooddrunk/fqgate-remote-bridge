import { constants } from "node:fs";
import { lstat, open, rename, rm } from "node:fs/promises";
import { join } from "node:path";
import { EventJournal } from "./journal.js";
import {
  RECOVERY_COMPONENTS,
  validateRecoveryDecision,
  validateRecoveryHistory,
} from "./recovery.js";
import type { RecoveryDecision, RecoveryHistory } from "./recovery.js";

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

export function validateRecoveryFile(value: unknown): RecoveryFile {
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
  const history = validateRecoveryHistory(file.history);
  const decisions = RECOVERY_COMPONENTS.map((component, index) =>
    validateRecoveryDecision(file.decisions[index], component, history[component]),
  );
  validateDecisionSet(decisions);
  return { schemaVersion: 1, history, decisions };
}

function validateDecisionSet(decisions: readonly RecoveryDecision[]): void {
  const globalReasons = [
    "login_required",
    "missing_tunnel",
    "probe_failed",
    "unknown_state",
    "transaction_unresolved",
  ] as const;
  for (const reason of globalReasons) {
    if (
      decisions.some((decision) => decision.reason === reason) &&
      !decisions.every(
        (decision) => decision.decision === "forbidden" && decision.reason === reason,
      )
    )
      throw new Error("Invalid recovery decision set");
  }

  const fqgate = decisions[1];
  const tunnel = decisions[2];
  const allForbiddenFor = (reason: RecoveryDecision["reason"]): boolean =>
    decisions.every((decision) => decision.decision === "forbidden" && decision.reason === reason);

  // The evaluator applies these global blocks in this order. Session state is
  // not persisted in RecoveryFile, so a complete login_required vector is
  // accepted as the strongest possible block before checking component state.
  if (allForbiddenFor("login_required")) return;
  if (fqgate.observedState === "incompatible") {
    if (!allForbiddenFor("incompatible")) throw new Error("Invalid recovery decision set");
    return;
  }
  if (tunnel.observedState === "missing") {
    if (!allForbiddenFor("missing_tunnel")) throw new Error("Invalid recovery decision set");
    return;
  }
  if (
    decisions.some((decision) => decision.reason === "incompatible") &&
    (!decisions.some(
      (decision) => decision.component === "fqgate" && decision.reason === "incompatible",
    ) ||
      decisions.some(
        (decision) => decision.reason === "incompatible" && decision.component !== "fqgate",
      ))
  )
    throw new Error("Invalid recovery decision set");
  if (
    decisions.some(
      (decision) => decision.reason === "missing_tunnel" && decision.component !== "tunnel",
    ) &&
    tunnel.observedState !== "missing"
  )
    throw new Error("Invalid recovery decision set");
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
      return validateRecoveryFile(JSON.parse(content) as unknown);
    } finally {
      await handle.close();
    }
  }

  async write(value: RecoveryFile): Promise<void> {
    validateRecoveryFile(value);
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
