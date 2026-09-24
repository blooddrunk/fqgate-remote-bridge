import { defineConfig, devices } from "@playwright/test";

const isCI = Boolean(process.env.CI);
const e2ePort = 17283;

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  reporter: isCI ? "github" : "list",
  use: {
    baseURL: `http://127.0.0.1:${e2ePort}`,
    trace: "retain-on-failure",
    ...devices["Desktop Chrome"],
  },
  expect: {
    timeout: 15_000,
  },
  webServer: {
    command: isCI
      ? "node scripts/start-bridge.mjs"
      : `pnpm exec vite dev --host 127.0.0.1 --port ${e2ePort}`,
    port: e2ePort,
    reuseExistingServer: false,
    timeout: 120_000,
    env: { BRIDGE_PORT: String(e2ePort), PORT: String(e2ePort) },
  },
});
