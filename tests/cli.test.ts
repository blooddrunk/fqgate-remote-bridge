import { describe, expect, it } from "vitest";
import { runCli } from "../src/cli/main.js";

function ioCapture(): { readonly stdout: string[]; readonly stderr: string[] } {
  return { stdout: [], stderr: [] };
}

describe("local CLI", () => {
  it("reports deterministic build metadata as JSON", async () => {
    const capture = ioCapture();
    const exitCode = await runCli(["version", "--json"], {
      stdout: (line) => capture.stdout.push(line),
      stderr: (line) => capture.stderr.push(line),
    });

    expect(exitCode).toBe(0);
    expect(JSON.parse(capture.stdout[0] ?? "{}")).toMatchObject({
      name: "fqgate-remote-bridge",
      version: "0.1.0",
      commit: "unknown",
    });
    expect(capture.stderr).toEqual([]);
  });

  it("returns a meaningful non-zero code for an unknown option", async () => {
    const capture = ioCapture();
    const exitCode = await runCli(["version", "--no-such-option", "--json"], {
      stdout: (line) => capture.stdout.push(line),
      stderr: (line) => capture.stderr.push(line),
    });

    expect(exitCode).toBe(2);
    expect(JSON.parse(capture.stderr[0] ?? "{}")).toEqual({
      error: { code: "CONFIG_INVALID", message: "Unknown option: --no-such-option" },
    });
  });

  it("shows the local and explicit cloudflared command surfaces", async () => {
    const capture = ioCapture();
    const exitCode = await runCli(["help"], {
      stdout: (line) => capture.stdout.push(line),
      stderr: (line) => capture.stderr.push(line),
    });

    expect(exitCode).toBe(0);
    expect(capture.stdout[0]).toContain("fqgate-remote-bridge fqgate update --check|--apply");
    expect(capture.stdout[0]).toContain("cloudflared service install|start|stop|restart|status");
    expect(capture.stdout[0]).toContain("cloudflare discover|plan --desired-state");
    expect(capture.stdout[0]).toContain("cloudflare apply --desired-state");
  });

  it("rejects an apply flag on the Phase 6-A Cloudflare CLI surface", async () => {
    const capture = ioCapture();
    const exitCode = await runCli(["cloudflare", "plan", "--apply", "--json"], {
      stdout: (line) => capture.stdout.push(line),
      stderr: (line) => capture.stderr.push(line),
    });

    expect(exitCode).toBe(2);
    expect(JSON.parse(capture.stderr[0] ?? "{}")).toEqual({
      error: {
        code: "CONFIG_INVALID",
        message: "Phase 6-A Cloudflare commands are read-only; --apply is not supported",
      },
    });
  });

  it("rejects multiple Cloudflare apply check IDs before any discovery", async () => {
    const capture = ioCapture();
    const exitCode = await runCli(
      [
        "cloudflare",
        "apply",
        "--desired-state",
        "D:\\external\\desired.json",
        "--expected-fingerprint",
        "a".repeat(64),
        "--check-id",
        "dns.human.record",
        "--check-id",
        "dns.machine.record",
        "--json",
      ],
      {
        stdout: (line) => capture.stdout.push(line),
        stderr: (line) => capture.stderr.push(line),
      },
    );

    expect(exitCode).toBe(2);
    expect(JSON.parse(capture.stderr[0] ?? "{}")).toMatchObject({
      error: { code: "CONFIG_INVALID", message: "--check-id requires exactly one check ID" },
    });
  });

  it("refuses production Cloudflare apply outside Windows before resolving credentials", async () => {
    if (process.platform === "win32") return;
    const capture = ioCapture();
    const exitCode = await runCli(
      [
        "cloudflare",
        "apply",
        "--expected-fingerprint",
        "a".repeat(64),
        "--check-id",
        "dns.human.record",
      ],
      {
        stdout: (line) => capture.stdout.push(line),
        stderr: (line) => capture.stderr.push(line),
      },
    );

    expect(exitCode).toBe(1);
    expect(capture.stdout).toEqual([]);
    expect(JSON.parse(capture.stderr[0] ?? "{}")).toMatchObject({
      error: { code: "CLOUDFLARE_APPLY_REJECTED" },
    });
  });
});
