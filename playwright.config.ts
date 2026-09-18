import { defineConfig, devices } from "@playwright/test";

const isCI = Boolean(process.env.CI);

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  reporter: isCI ? "github" : "list",
  use: {
    baseURL: "http://127.0.0.1:17282",
    trace: "retain-on-failure",
    ...devices["Desktop Chrome"],
  },
  expect: {
    timeout: 15_000,
  },
  webServer: isCI
    ? {
        command: "node scripts/start-bridge.mjs",
        wait: { stdout: /Listening on:/ },
        timeout: 120_000,
      }
    : {
        command: "pnpm dev",
        port: 17282,
        reuseExistingServer: true,
        timeout: 120_000,
      },
});
