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
  });
});
