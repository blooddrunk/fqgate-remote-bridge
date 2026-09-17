import type { ProcessRunner } from "../../fqgate/process/types.js";
import { BridgeError, ERROR_CODES } from "../../shared/errors.js";
import type { TokenFileAcl } from "../token-file.js";

const FORBIDDEN_ACL_PRINCIPALS = [
  "everyone:",
  "builtin\\users:",
  "authenticated users:",
  "all application packages:",
];

export class WindowsTokenFileAcl implements TokenFileAcl {
  private readonly runner: ProcessRunner;
  private readonly platform: NodeJS.Platform;

  constructor(options: { readonly runner: ProcessRunner; readonly platform?: NodeJS.Platform }) {
    this.runner = options.runner;
    this.platform = options.platform ?? process.platform;
  }

  async secure(path: string, serviceAccount: string): Promise<void> {
    this.assertWindows();
    const principal = servicePrincipal(serviceAccount);
    const result = await this.runner.run(
      "icacls.exe",
      [path, "/inheritance:r", "/grant:r", `${principal}:(R)`, "BUILTIN\\Administrators:(F)"],
      { timeoutMs: 10_000, maxOutputBytes: 16 * 1024 },
    );
    if (result.exitCode !== 0 || result.timedOut || result.truncated) {
      throw new BridgeError(
        ERROR_CODES.CLOUDFLARED_TOKEN_INVALID,
        "Windows ACL protection for the cloudflared Tunnel token file failed",
      );
    }
  }

  async isSecure(path: string, serviceAccount: string): Promise<boolean> {
    if (this.platform !== "win32") return false;
    const result = await this.runner.run("icacls.exe", [path], {
      timeoutMs: 10_000,
      maxOutputBytes: 16 * 1024,
    });
    if (result.exitCode !== 0 || result.timedOut || result.truncated) return false;
    const output = `${result.stdout}\n${result.stderr}`.toLowerCase();
    if (FORBIDDEN_ACL_PRINCIPALS.some((principal) => output.includes(principal))) return false;
    const expectedPrincipal = servicePrincipal(serviceAccount).toLowerCase();
    return output.includes(`${expectedPrincipal.toLowerCase()}:`);
  }

  private assertWindows(): void {
    if (this.platform !== "win32") {
      throw new BridgeError(
        ERROR_CODES.CLOUDFLARED_UNSUPPORTED,
        "Windows ACL integration is available only on Windows",
      );
    }
  }
}

function servicePrincipal(serviceAccount: string): string {
  if (serviceAccount === "LocalSystem") return "NT AUTHORITY\\SYSTEM";
  return serviceAccount;
}
