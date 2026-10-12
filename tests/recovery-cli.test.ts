import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";

const { actions, fqgateStatus } = vi.hoisted(() => ({
  actions: vi.fn(),
  fqgateStatus: {
    lifecycle: "ready",
    process: { state: "running" },
    installed: { compatibility: { validated: true } },
    health: { session: "connected" },
  },
}));
vi.mock("../src/app/runtime.js", () => ({
  createApplicationServices: () => ({
    lifecycle: {
      status: async () => fqgateStatus,
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
  fqgateStatus.lifecycle = "ready";
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

it("turns a malformed persisted plan into forbidden decisions without invoking any actuator", async () => {
  root = await mkdtemp(join(tmpdir(), "fqgate-recovery-corrupt-"));
  fqgateStatus.lifecycle = "stopped";
  const state = join(root, "state", "supervisor");
  await mkdir(state, { recursive: true });
  const config = join(root, "config.json");
  await writeFile(config, JSON.stringify({ installDirectory: join(root, "state") }));
  await writeFile(
    join(state, "recovery.json"),
    JSON.stringify({
      schemaVersion: 1,
      history: {
        bridge: {
          consecutive: 0,
          attempts: 0,
          lastAttemptAt: null,
          stableSince: null,
          lastState: "ready",
        },
        fqgate: {
          consecutive: 3,
          attempts: 0,
          lastAttemptAt: null,
          stableSince: null,
          lastState: "stopped",
        },
        tunnel: {
          consecutive: 0,
          attempts: 0,
          lastAttemptAt: null,
          stableSince: null,
          lastState: "running",
        },
      },
      decisions: [
        {
          schemaVersion: 1,
          component: "bridge",
          observedState: "ready",
          decision: "no_action",
          action: "bridge.restart",
          reason: "healthy",
          attemptsInWindow: 0,
        },
        {
          schemaVersion: 1,
          component: "fqgate",
          observedState: "stopped",
          decision: "eligible",
          action: "fqgate.restart",
          reason: "eligible",
          attemptsInWindow: 0,
        },
        {
          schemaVersion: 1,
          component: "tunnel",
          observedState: "running",
          decision: "no_action",
          reason: "healthy",
          attemptsInWindow: 0,
        },
      ],
    }),
  );

  const stdout: string[] = [];
  const stderr: string[] = [];
  const code = await runCli(["supervisor", "recovery-plan", "--config", config, "--json"], {
    stdout: (line) => stdout.push(line),
    stderr: (line) => stderr.push(line),
  });
  expect(code).toBe(0);
  expect(stderr).toEqual([]);
  const decisions = JSON.parse(stdout[0] ?? "{}").decisions as Array<{
    decision: string;
    reason: string;
    action?: string;
  }>;
  expect(decisions).toHaveLength(3);
  expect(
    decisions.every((item) => item.decision === "forbidden" && item.reason === "history_invalid"),
  ).toBe(true);
  expect(decisions.every((item) => item.action === undefined)).toBe(true);
  expect(actions).not.toHaveBeenCalled();
});
