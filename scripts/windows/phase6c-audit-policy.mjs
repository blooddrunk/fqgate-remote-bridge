// Pure, deterministic policy. The Windows collector passes booleans and fixed target names only.
import { resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
export const ALLOWED_TARGETS = Object.freeze([
  "FQGateRemoteBridge/acceptance/v1/cloudflare-read",
  "FQGateRemoteBridge/acceptance/v1/machine-client-id",
  "FQGateRemoteBridge/acceptance/v1/machine-client-secret",
]);

export const WRITE_ENV_NAMES = Object.freeze([
  "CLOUDFLARE_DNS_WRITE_TOKEN",
  "CLOUDFLARE_B2_WRITE_TOKEN",
  "CLOUDFLARE_B2_SCOPE_READ_TOKEN",
]);

const SHA = /^[a-f0-9]{40}$/;
const FINGERPRINT = /^[a-f0-9]{64}$/;
const ROOT = /^D:\\code\\research\\fqgate-remote-bridge$/i;
const id = (name, pass) => ({ id: name, result: pass ? "PASS" : "FAIL" });

export function evaluateAudit(snapshot) {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    throw new Error("P6C_AUDIT_SNAPSHOT_INVALID");
  }
  const targetNames = snapshot.vault?.allowedTargetNames;
  const namesValid =
    Array.isArray(targetNames) &&
    targetNames.length === 3 &&
    targetNames.every((name) => ALLOWED_TARGETS.includes(name)) &&
    new Set(targetNames).size === 3;
  const plan = snapshot.plan;
  const checks = Array.isArray(plan?.checks) ? plan.checks : [];
  const results = [
    id(
      "P6C-A01-CHECKOUT",
      ROOT.test(snapshot.checkout?.path ?? "") &&
        snapshot.checkout?.clean === true &&
        SHA.test(snapshot.checkout?.commit ?? ""),
    ),
    id(
      "P6C-A02-ENV",
      snapshot.environment?.processWriteCleared === true &&
        snapshot.environment?.persistentWriteAbsent === true,
    ),
    id("P6C-A03-VAULT", namesValid && snapshot.vault?.unexpectedProjectTargets === 0),
    id(
      "P6C-A04-SERVICE",
      snapshot.service?.running === true &&
        snapshot.service?.protectedTokenFile === true &&
        snapshot.service?.noInlineToken === true &&
        snapshot.service?.noProvisioningCredential === true,
    ),
    id(
      "P6C-A05-LEGACY",
      snapshot.legacy?.directoryAbsent === true && snapshot.legacy?.consumerCount === 0,
    ),
    id(
      "P6C-A06-RUNTIME",
      snapshot.runtime?.fqgate === true &&
        snapshot.runtime?.bridge === true &&
        snapshot.runtime?.listenersExact === true,
    ),
    id(
      "P6C-A07-READ-TRANSPORT",
      snapshot.readTransport?.getOnly === true && snapshot.readTransport?.mutationMethodCount === 0,
    ),
    id(
      "P6C-A08-PLAN",
      FINGERPRINT.test(plan?.fingerprint ?? "") &&
        plan?.readOnly === true &&
        plan?.mutationMethodCount === 0 &&
        checks.length > 0 &&
        checks.every((check) => check === "in_sync"),
    ),
    id(
      "P6C-A09-FILES",
      snapshot.files?.externalInputs === true &&
        snapshot.files?.secretFree === true &&
        snapshot.files?.normalStartupNoWriteDependency === true &&
        snapshot.files?.noPersistentCredentialPath === true,
    ),
  ];
  return Object.freeze({
    schemaVersion: 1,
    task: "phase-6-c-credential-dependency-audit",
    commit: SHA.test(snapshot.checkout?.commit ?? "") ? snapshot.checkout.commit : "",
    planFingerprint: FINGERPRINT.test(plan?.fingerprint ?? "") ? plan.fingerprint : "",
    allowedTargetNames: namesValid ? [...ALLOWED_TARGETS] : [],
    records: results,
    summary: {
      total: results.length,
      passed: results.filter((r) => r.result === "PASS").length,
      failed: results.filter((r) => r.result === "FAIL").length,
    },
  });
}

export function serializeAuditEvidence(evidence) {
  const allowed = [
    "schemaVersion",
    "task",
    "commit",
    "planFingerprint",
    "allowedTargetNames",
    "records",
    "summary",
  ];
  if (!evidence || Object.keys(evidence).some((key) => !allowed.includes(key))) {
    throw new Error("P6C_AUDIT_EVIDENCE_SCHEMA_INVALID");
  }
  if (
    !Array.isArray(evidence.records) ||
    evidence.records.length !== 9 ||
    evidence.records.some(
      (record) =>
        !record ||
        Object.keys(record).some((key) => !["id", "result"].includes(key)) ||
        !/^P6C-A0[1-9]-[A-Z-]+$/.test(record.id) ||
        !["PASS", "FAIL"].includes(record.result),
    ) ||
    !Array.isArray(evidence.allowedTargetNames) ||
    evidence.allowedTargetNames.some((name) => !ALLOWED_TARGETS.includes(name)) ||
    Object.keys(evidence.summary ?? {}).some((key) => !["total", "passed", "failed"].includes(key))
  ) {
    throw new Error("P6C_AUDIT_EVIDENCE_SCHEMA_INVALID");
  }
  const encoded = JSON.stringify(evidence);
  if (
    encoded.length > 8192 ||
    /(?:cf_access|authorization|cookie|jwt|assertion|client_secret|api_token|tunnel_token|qr_payload|cfast_)/i.test(
      encoded,
    )
  ) {
    throw new Error("P6C_AUDIT_EVIDENCE_SECRET_REJECTED");
  }
  return encoded;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let input = "";
  for await (const chunk of process.stdin) {
    input += chunk;
    if (input.length > 16384) throw new Error("P6C_AUDIT_SNAPSHOT_TOO_LARGE");
  }
  process.stdout.write(serializeAuditEvidence(evaluateAudit(JSON.parse(input))));
}
