import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";

const { actions } = vi.hoisted(() => ({ actions: vi.fn() }));
vi.mock("../src/app/runtime.js", () => ({
  createApplicationServices: () => ({
    lifecycle: {
      status: async () => ({
        lifecycle: "ready",
        process: { state: "running" },
        installed: { compatibility: { validated: true } },
        health: { session: "connected" },
      }),
      start: actions,
      stop: actions,
      restart: actions,
      install: actions,
      update: actions,
    },
    cloudflaredService: {
      status: async () => ({ installed: true, running: true }),
      start: actions,
      stop: actions,
      restart: actions,
      install: actions,
    },
    update: { apply: actions, qualify: actions },
    cloudflare: { apply: actions },
    notifications: { send: actions },
  }),
}));
vi.mock("../src/supervisor/adapters.js", () => ({
  createObservationAdapters: (options: {
    lifecycle: { status: () => Promise<unknown> };
    service: { status: () => Promise<unknown> };
  }) => ({
    bridge: async () => true,
    fqgate: () => options.lifecycle.status(),
    tunnel: () => options.service.status(),
  }),
}));

import { runCli } from "../src/cli/main.js";

let root: string | undefined;
afterEach(async () => {
  if (root) await rm(root, { recursive: true, force: true });
  root = undefined;
  actions.mockClear();
});

it("plans a healthy deployment without reaching any actuator, update, Cloudflare or notification method", async () => {
  root = await mkdtemp(join(tmpdir(), "fqgate-recovery-cli-"));
  const config = join(root, "config.json");
  await writeFile(config, JSON.stringify({ installDirectory: join(root, "state") }));
  const stdout: string[] = [];
  const stderr: string[] = [];
  const code = await runCli(["supervisor", "recovery-plan", "--config", config, "--json"], {
    stdout: (line) => stdout.push(line),
    stderr: (line) => stderr.push(line),
  });
  expect(code).toBe(0);
  expect(stderr).toEqual([]);
  expect(
    JSON.parse(stdout[0] ?? "{}").decisions.map((item: { decision: string }) => item.decision),
  ).toEqual(["no_action", "no_action", "no_action"]);
  expect(actions).not.toHaveBeenCalled();
});
