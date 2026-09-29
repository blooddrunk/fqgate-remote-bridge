import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { BridgeError, ERROR_CODES } from "../shared/errors.js";
import { CLOUDFLARE_CONTEXTS, type CloudflareContext } from "./types.js";

/** Exact policy identities are kept outside the Phase 6-A plan and its evidence. */
export interface CloudflareB2PolicyTemplate {
  readonly name: string;
  readonly selector: { readonly kind: "email" | "group" | "service_token"; readonly value: string };
  readonly sessionDuration: string;
}

export interface CloudflareB2Profile {
  readonly policies: Readonly<Record<CloudflareContext, CloudflareB2PolicyTemplate>>;
  readonly fingerprint: string;
}

export function parseCloudflareB2Profile(input: unknown): CloudflareB2Profile {
  if (
    !record(input) ||
    Object.keys(input).sort().join(",") !== "policies,schemaVersion" ||
    input.schemaVersion !== "phase6b2.v1"
  )
    invalid();
  if (
    !record(input.policies) ||
    Object.keys(input.policies).sort().join(",") !== "admin,human,machine"
  )
    invalid();
  const policies = {} as Record<CloudflareContext, CloudflareB2PolicyTemplate>;
  for (const context of CLOUDFLARE_CONTEXTS) {
    const value = input.policies[context];
    if (!record(value) || Object.keys(value).sort().join(",") !== "name,selector,sessionDuration")
      invalid();
    if (!record(value.selector) || Object.keys(value.selector).sort().join(",") !== "kind,value")
      invalid();
    const kind = value.selector.kind;
    const selectorValue = value.selector.value;
    const name = value.name;
    const sessionDuration = value.sessionDuration;
    if (
      !bounded(name, 200) ||
      !bounded(selectorValue, 256) ||
      !bounded(sessionDuration, 16) ||
      !/^(?:[1-9][0-9]*)(?:m|h)$/.test(sessionDuration) ||
      (context === "machine" ? kind !== "service_token" : kind !== "email" && kind !== "group") ||
      (kind === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(selectorValue)) ||
      (kind !== "email" && !/^[A-Za-z0-9_-]{1,128}$/.test(selectorValue))
    )
      invalid();
    const durationMinutes =
      Number.parseInt(sessionDuration, 10) * (sessionDuration.endsWith("h") ? 60 : 1);
    if (durationMinutes < 1 || durationMinutes > (context === "admin" ? 30 : 1440)) invalid();
    policies[context] = {
      name,
      selector: { kind: kind as "email" | "group" | "service_token", value: selectorValue },
      sessionDuration,
    };
  }
  const selectorKeys = CLOUDFLARE_CONTEXTS.map(
    (context) => `${policies[context].selector.kind}:${policies[context].selector.value}`,
  );
  if (new Set(selectorKeys).size !== selectorKeys.length) invalid();
  const fingerprint = createHash("sha256")
    .update(JSON.stringify({ schemaVersion: "phase6b2.v1", policies }))
    .digest("hex");
  return { policies, fingerprint };
}

export async function loadCloudflareB2Profile(path: string): Promise<CloudflareB2Profile> {
  if (!bounded(path, 4096)) invalid();
  let contents: string;
  try {
    contents = await readFile(path, "utf8");
  } catch {
    invalid();
  }
  if (new TextEncoder().encode(contents).byteLength > 16 * 1024) invalid();
  try {
    return parseCloudflareB2Profile(JSON.parse(contents) as unknown);
  } catch {
    invalid();
  }
}

function bounded(value: unknown, maximum: number): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= maximum &&
    value.trim() === value &&
    !Array.from(value).some((character) => {
      const code = character.codePointAt(0) ?? 0;
      return code <= 31 || code === 127;
    })
  );
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function invalid(): never {
  throw new BridgeError(
    ERROR_CODES.CLOUDFLARE_DESIRED_STATE_INVALID,
    "Cloudflare B2 write profile is invalid",
  );
}
