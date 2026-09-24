import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { BridgeError, ERROR_CODES } from "../shared/errors.js";

const execFileAsync = promisify(execFile);
const REGRESSION_TIMEOUT_MS = 5 * 60 * 1_000;
const REGRESSION_MAX_OUTPUT_BYTES = 256 * 1024;

export async function runRequiredWindowsPhase5cRegression(input: {
  readonly desiredStatePath: string;
  readonly expectedFingerprint: string;
  readonly checkId: string;
}): Promise<void> {
  if (process.platform !== "win32") {
    throw new BridgeError(
      ERROR_CODES.CLOUDFLARE_APPLY_REJECTED,
      "Production Cloudflare DNS apply requires the permanent Windows Phase 5-C regression",
    );
  }

  const moduleDirectory = dirname(fileURLToPath(import.meta.url));
  const repositoryRoot = resolve(moduleDirectory, "../..");
  const scriptPath = join(repositoryRoot, "scripts", "windows", "phase5c-acceptance.ps1");
  const configPath =
    process.env.FQGATE_REMOTE_BRIDGE_CONFIG ?? "D:\\code\\research\\fqgate-acceptance-config.json";
  const ingressConfigPath =
    process.env.FQGATE_REMOTE_BRIDGE_TUNNEL_INGRESS_CONFIG ??
    "D:\\code\\research\\fqgate-machine-tunnel-ingress-evidence.json";
  const powershellPath = join(
    process.env.SystemRoot ?? "C:\\Windows",
    "System32",
    "WindowsPowerShell",
    "v1.0",
    "powershell.exe",
  );
  const childEnvironment = { ...process.env };
  delete childEnvironment.CLOUDFLARE_API_TOKEN;
  delete childEnvironment.CLOUDFLARE_DNS_WRITE_TOKEN;

  try {
    await execFileAsync(
      powershellPath,
      [
        "-NoLogo",
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        scriptPath,
        "-ConfigPath",
        configPath,
        "-RunAuthenticatedServiceTokenMatrix",
        "-TunnelIngressConfigPath",
        ingressConfigPath,
        "-CredentialSource",
        "Vault",
      ],
      {
        cwd: repositoryRoot,
        env: childEnvironment,
        timeout: REGRESSION_TIMEOUT_MS,
        maxBuffer: REGRESSION_MAX_OUTPUT_BYTES,
        windowsHide: true,
      },
    );
  } catch (error) {
    const output =
      error instanceof Error
        ? `${"stdout" in error ? String(error.stdout) : ""}\n${"stderr" in error ? String(error.stderr) : ""}`
        : "";
    if (/\bLOGIN_REQUIRED\b/.test(output)) {
      const desiredPath = input.desiredStatePath.replace(/"/g, '""');
      const command = `& "${process.execPath}" "${join(repositoryRoot, "dist", "cli", "main.js")}" cloudflare apply --desired-state "${desiredPath}" --expected-fingerprint ${input.expectedFingerprint} --check-id ${input.checkId} --json`;
      throw new BridgeError(
        ERROR_CODES.CLOUDFLARE_POSTCONDITION_FAILED,
        `Required Phase 5-C regression returned LOGIN_REQUIRED. Open http://127.0.0.1:17282/login, start the existing QR flow, physically scan and approve, then resume with: ${command}`,
        { regression: "phase5c", result: "LOGIN_REQUIRED" },
      );
    }
    throw new BridgeError(
      ERROR_CODES.CLOUDFLARE_POSTCONDITION_FAILED,
      "Required Phase 5-C remote-machine regression failed",
      { regression: "phase5c" },
    );
  } finally {
    delete childEnvironment.CLOUDFLARE_API_TOKEN;
    delete childEnvironment.CLOUDFLARE_DNS_WRITE_TOKEN;
  }
}
