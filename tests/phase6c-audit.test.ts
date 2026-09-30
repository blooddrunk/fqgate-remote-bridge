import { describe, expect, it } from "vitest";
import {
  ALLOWED_TARGETS,
  evaluateAudit,
  serializeAuditEvidence,
} from "../scripts/windows/phase6c-audit-policy.mjs";

function validSnapshot() {
  return {
    checkout: {
      path: "D:\\code\\research\\fqgate-remote-bridge",
      clean: true,
      commit: "a".repeat(40),
    },
    environment: { processWriteCleared: true, persistentWriteAbsent: true },
    vault: { allowedTargetNames: [...ALLOWED_TARGETS], unexpectedProjectTargets: 0 },
    service: {
      running: true,
      protectedTokenFile: true,
      noInlineToken: true,
      noProvisioningCredential: true,
    },
    legacy: { directoryAbsent: true, consumerCount: 0 },
    runtime: { fqgate: true, bridge: true, listenersExact: true },
    readTransport: { getOnly: true, mutationMethodCount: 0 },
    plan: {
      fingerprint: "b".repeat(64),
      readOnly: true,
      mutationMethodCount: 0,
      checks: ["in_sync", "in_sync"],
    },
    files: {
      externalInputs: true,
      secretFree: true,
      normalStartupNoWriteDependency: true,
      noPersistentCredentialPath: true,
    },
  };
}

describe("Phase 6-C secret-safe credential dependency audit", () => {
  it("emits only bounded fixed IDs and approved target names", () => {
    const evidence = evaluateAudit(validSnapshot());
    expect(evidence.summary).toEqual({ total: 9, passed: 9, failed: 0 });
    expect(evidence.allowedTargetNames).toEqual(ALLOWED_TARGETS);
    expect(serializeAuditEvidence(evidence)).not.toContain("tokenFile");
  });

  it.each([
    [
      "unexpected provisioning Vault target",
      (s: ReturnType<typeof validSnapshot>) => {
        s.vault.unexpectedProjectTargets = 1;
      },
      "P6C-A03-VAULT",
    ],
    [
      "persistent write environment",
      (s: ReturnType<typeof validSnapshot>) => {
        s.environment.persistentWriteAbsent = false;
      },
      "P6C-A02-ENV",
    ],
    [
      "inline Tunnel token",
      (s: ReturnType<typeof validSnapshot>) => {
        s.service.noInlineToken = false;
      },
      "P6C-A04-SERVICE",
    ],
    [
      "runtime write-token dependency",
      (s: ReturnType<typeof validSnapshot>) => {
        s.files.normalStartupNoWriteDependency = false;
      },
      "P6C-A09-FILES",
    ],
    [
      "persistent credential path",
      (s: ReturnType<typeof validSnapshot>) => {
        s.files.noPersistentCredentialPath = false;
      },
      "P6C-A09-FILES",
    ],
    [
      "drifted plan",
      (s: ReturnType<typeof validSnapshot>) => {
        s.plan.checks[0] = "missing";
      },
      "P6C-A08-PLAN",
    ],
    [
      "write method in read transport",
      (s: ReturnType<typeof validSnapshot>) => {
        s.readTransport.mutationMethodCount = 1;
      },
      "P6C-A07-READ-TRANSPORT",
    ],
  ])("fails closed for %s", (_label, change, expectedId) => {
    const snapshot = validSnapshot();
    change(snapshot);
    const evidence = evaluateAudit(snapshot);
    expect(evidence.records.find((record) => record.id === expectedId)?.result).toBe("FAIL");
    expect(evidence.summary.failed).toBeGreaterThan(0);
  });

  it("rejects unknown evidence fields and attempted secret inclusion", () => {
    const evidence = evaluateAudit(validSnapshot());
    expect(() => serializeAuditEvidence({ ...evidence, secret: "cfast_fake" })).toThrow(
      "P6C_AUDIT_EVIDENCE_SCHEMA_INVALID",
    );
    expect(() => serializeAuditEvidence({ ...evidence, task: "jwt" })).toThrow(
      "P6C_AUDIT_EVIDENCE_SECRET_REJECTED",
    );
    expect(() =>
      serializeAuditEvidence({
        ...evidence,
        records: [{ ...evidence.records[0], rawSecret: "hidden" }, ...evidence.records.slice(1)],
      }),
    ).toThrow("P6C_AUDIT_EVIDENCE_SCHEMA_INVALID");
  });

  it("rejects missing and malformed snapshots", () => {
    expect(() => evaluateAudit(null)).toThrow("P6C_AUDIT_SNAPSHOT_INVALID");
    expect(evaluateAudit({}).summary.failed).toBe(9);
  });
});
