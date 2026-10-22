import {
  ALIAS,
  deny,
  exact,
  frozen,
  integer,
  processEvidence,
  same,
  sourceEvidence,
  text,
} from "./types.js";
import type { Registration } from "./types.js";

function registration(input: unknown): Registration {
  const v = exact(input, ["alias", "revision", "enabled", "expectedAccount", "process", "source"]);
  if (
    typeof v.alias !== "string" ||
    !ALIAS.test(v.alias) ||
    !integer(v.revision, 1) ||
    typeof v.enabled !== "boolean" ||
    !text(v.expectedAccount)
  )
    deny("CONFIG_INVALID");
  const source = sourceEvidence(v.source);
  if (source.account.connected && source.account.token !== v.expectedAccount)
    deny("CONFIG_INVALID");
  return frozen({
    alias: v.alias,
    revision: v.revision,
    enabled: v.enabled,
    expectedAccount: v.expectedAccount,
    process: processEvidence(v.process),
    source,
  });
}

/** Fixture-owned enrollment authority. Never exposed as a Bridge operation or config format. */
export class OfflineProfileRegistry {
  #entries = new Map<string, Registration>();
  #generations = new Map<string, number>();
  #revision = 1;
  #listeners = new Set<(alias: string) => void>();
  readonly defaultAlias: string | undefined;

  constructor(input: unknown) {
    try {
      const v = exact(input, ["registrations", "defaultAlias", "legacyQrPin"]);
      if (!Array.isArray(v.registrations) || v.registrations.length > 16) deny("CONFIG_INVALID");
      const rows = v.registrations.map(registration);
      for (const row of rows) {
        if (
          this.#entries.has(row.alias) ||
          rows.some(
            (other) =>
              other !== row &&
              (other.source.id === row.source.id ||
                other.source.number === row.source.number ||
                other.expectedAccount === row.expectedAccount),
          ) ||
          rows.some((other) => !same(other.process, row.process))
        )
          deny("CONFIG_INVALID");
        this.#entries.set(row.alias, row);
        this.#generations.set(row.alias, 1);
      }
      if (
        v.defaultAlias !== undefined &&
        (typeof v.defaultAlias !== "string" || !this.#entries.has(v.defaultAlias))
      )
        deny("CONFIG_INVALID");
      this.defaultAlias = v.defaultAlias as string | undefined;
      if (
        v.legacyQrPin !== undefined &&
        (!integer(v.legacyQrPin, 1) ||
          this.defaultAlias === undefined ||
          this.#entries.get(this.defaultAlias)?.source.number !== v.legacyQrPin)
      )
        deny("CONFIG_INVALID");
    } catch {
      deny("CONFIG_INVALID");
    }
  }
  get revision(): number {
    return this.#revision;
  }
  get count(): number {
    return this.#entries.size;
  }
  get(alias: string): Registration | undefined {
    return this.#entries.get(alias);
  }
  generation(alias: string): number {
    return this.#generations.get(alias) ?? 0;
  }
  onInvalidate(listener: (alias: string) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }
  invalidate(alias: string): void {
    const old = this.#entries.get(alias);
    if (!old) return;
    this.#generations.set(alias, this.generation(alias) + 1);
    this.#entries.set(alias, frozen({ ...old, enabled: false }));
    for (const listener of this.#listeners) listener(alias);
  }
  invalidateAll(): void {
    for (const alias of this.#entries.keys()) this.invalidate(alias);
  }
  disable(alias: string): void {
    this.invalidate(alias);
    this.#revision++;
  }
  remove(alias: string): void {
    this.invalidate(alias);
    this.#entries.delete(alias);
    this.#generations.delete(alias);
    this.#revision++;
  }
  /** Explicit synthetic re-enrollment with expected proof; never invoked by an operation. */
  reenroll(input: unknown): void {
    let next: Registration;
    try {
      next = registration(input);
    } catch {
      deny("CONFIG_INVALID");
    }
    const old = this.#entries.get(next.alias);
    if (
      !old ||
      next.revision <= old.revision ||
      next.expectedAccount !== old.expectedAccount ||
      next.source.id !== old.source.id ||
      !next.enabled
    )
      deny("CONFIG_INVALID");
    if (
      [...this.#entries.values()].some(
        (row) =>
          row.alias !== next.alias &&
          (row.source.id === next.source.id ||
            row.source.number === next.source.number ||
            row.expectedAccount === next.expectedAccount),
      ) ||
      !same(next.process, old.process)
    )
      deny("CONFIG_INVALID");
    this.invalidate(next.alias);
    this.#entries.set(next.alias, next);
    this.#revision++;
  }
}
