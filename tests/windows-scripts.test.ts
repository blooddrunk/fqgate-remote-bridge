import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Windows entry points", () => {
  it.each(["bootstrap.ps1", "acceptance.ps1"])(
    "resolves and invokes the built CLI from %s",
    (scriptName) => {
      const script = readFileSync(
        new URL(`../scripts/windows/${scriptName}`, import.meta.url),
        "utf8",
      );

      expect(script).toContain("$PSScriptRoot");
      expect(script).toContain('"dist\\cli\\main.js"');
      expect(script).toContain("Test-Path -LiteralPath $cliPath -PathType Leaf");
      expect(script).toContain("Select-Object -First 1");
      expect(script).toContain("--config");
      expect(script).not.toContain("pnpm exec fqgate-remote-bridge");
      if (scriptName === "acceptance.ps1") {
        expect(script).toContain("System.Diagnostics.ProcessStartInfo");
        expect(script).toContain("ConvertTo-ProcessArgument");
      } else {
        expect(script).toContain("& $script:nodePath $script:cliPath @Arguments");
      }
    },
  );

  it("contains a production loopback and raw-route smoke procedure", () => {
    const script = readFileSync(
      new URL("../scripts/windows/acceptance.ps1", import.meta.url),
      "utf8",
    );

    expect(script).toContain("$VerifyBridge");
    expect(script).toContain("Get-NetTCPConnection -State Listen -LocalPort $bridgePort");
    expect(script).toContain('LocalAddress -ne "127.0.0.1"');
    expect(script).toContain("/v1/market/health");
    expect(script).toContain("Stop-Process -Id $bridgeProcess.Id -Force");
  });

  it("contains the non-mutating Phase 3 live OpenAPI and update-source checks", () => {
    const script = readFileSync(
      new URL("../scripts/windows/acceptance.ps1", import.meta.url),
      "utf8",
    );

    expect(script).toContain("[switch]$VerifyPhase3");
    expect(script).toContain("$nodeCandidates");
    expect(script).toContain("Get-NodeVersionText");
    expect(script).toContain('fqgate", "update", "--check", "--json"');
    expect(script).toContain("/api/v1/openapi/catalog");
    expect(script).toContain("http://127.0.0.1:17281/openapi.json");
    expect(script).toContain("/v1/new/unregistered");
    expect(script).toContain("$catalog.snapshot.fingerprint");
  });

  it("provides an explicit Phase 4 loopback, service, and Access acceptance mode", () => {
    const script = readFileSync(
      new URL("../scripts/windows/acceptance.ps1", import.meta.url),
      "utf8",
    );

    expect(script).toContain("[switch]$VerifyPhase4");
    expect(script).toContain("[string]$RemoteUrl");
    expect(script).toContain('@("cloudflared", "status", "--json")');
    expect(script).toContain("Win32_Service");
    expect(script).toContain("--token-file");
    expect(script).toContain("Get-HttpStatusWithoutRedirect");
    expect(script).toContain("AllowAutoRedirect = $false");
    expect(script).toContain(
      "authenticated human and remote-denial checks remain manual evidence steps",
    );
  });

  it("provides a bounded Phase 4.5 live acceptance helper without applying updates", () => {
    const script = readFileSync(
      new URL("../scripts/windows/phase45-acceptance.ps1", import.meta.url),
      "utf8",
    );

    expect(script).toContain("[switch]$RunLocalMaintenance");
    expect(script).toContain("never runs updates.apply");
    expect(script).toContain("AllowAutoRedirect = $false");
    expect(script).toContain("127.0.0.1:17282");
    expect(script).toContain("HOST_NOT_ALLOWED");
    expect(script).toContain("ACCESS_ASSERTION_REQUIRED");
    expect(script).toContain("--token-file");
    expect(script).toContain("never runs updates.apply");
    expect(script).toContain("[switch]$RunAuthenticatedBrowserMatrix");
    expect(script).toContain("phase45-authenticated-acceptance.mjs");
  });

  it("provides a bounded Phase 5-A service-token acceptance boundary", () => {
    const script = readFileSync(
      new URL("../scripts/windows/phase5a-acceptance.ps1", import.meta.url),
      "utf8",
    );
    const harness = readFileSync(
      new URL("../scripts/windows/phase5a-authenticated-acceptance.mjs", import.meta.url),
      "utf8",
    );

    expect(script).toContain("D:\\code\\research");
    expect(script).toContain("rev-parse --show-toplevel");
    expect(script).toContain(
      'Read-Host "Cloudflare service-token Client ID (hidden)" -AsSecureString',
    );
    expect(script).toContain(
      'Read-Host "Cloudflare service-token Client Secret (hidden)" -AsSecureString',
    );
    expect(script).toContain("CF_ACCESS_CLIENT_ID");
    expect(script).toContain("CF_ACCESS_CLIENT_SECRET");
    expect(script).toContain("EnvironmentVariables.Remove");
    expect(script).toContain("will not create a checkout");
    expect(script).toContain("17281");
    expect(script).toContain("http://127.0.0.1:17282");
    expect(script).not.toContain("--client-id");
    expect(script).not.toContain("--client-secret");

    expect(harness).toContain("CF_ACCESS_CLIENT_ID");
    expect(harness).toContain("CF_ACCESS_CLIENT_SECRET");
    expect(harness).toContain("MAX_RESPONSE_BYTES");
    expect(harness).toContain("OPERATION_FORBIDDEN");
    expect(harness).toContain("/v1/market/health");
    expect(harness).not.toContain("console.log(clientId");
    expect(harness).not.toContain("console.log(clientSecret");
  });

  it("keeps the authenticated Phase 4.5 companion harness bounded and secret-safe", () => {
    const harness = readFileSync(
      new URL("../scripts/windows/phase45-authenticated-acceptance.mjs", import.meta.url),
      "utf8",
    );

    expect(harness).toContain("headless: false");
    expect(harness).toContain('credentials: "include"');
    expect(harness).toContain("MAX_RESPONSE_BYTES");
    expect(harness).toContain("never runs updates.apply");
    expect(harness).not.toContain("storageState");
    expect(harness).not.toContain("screenshot");
    expect(harness).not.toContain("confirmationGrant}");
    expect(harness).toContain('checkForbiddenRoutes(page, ordinaryOrigin, "ordinary")');
    expect(harness).toContain('checkForbiddenRoutes(page, adminOrigin, "admin")');
    expect(harness).toContain('checkAuthenticatedViewportSmoke(page, ordinaryOrigin, "ordinary")');
    expect(harness).toContain('checkAuthenticatedViewportSmoke(page, adminOrigin, "admin")');
  });

  it("provides an explicit one-command dashboard launcher without silent FQGate installation", () => {
    const script = readFileSync(
      new URL("../scripts/windows/start-dashboard.ps1", import.meta.url),
      "utf8",
    );
    const wrapper = readFileSync(
      new URL("../scripts/windows/start-dashboard.cmd", import.meta.url),
      "utf8",
    );

    expect(script).toContain("[switch]$InstallFqgate");
    expect(script).toContain("Get-Command node.exe");
    expect(script).toContain("$nodeCandidates");
    expect(script).toContain("Get-NodeVersionText");
    expect(script).toContain("System.Diagnostics.ProcessStartInfo");
    expect(script).toContain("corepack.cmd");
    expect(script).toContain("install --dry-run");
    expect(script).toContain("if (-not $InstallFqgate)");
    expect(script).toContain('fqgate", "start');
    expect(script).toContain("127.0.0.1:$bridgePort/api/v1/version");
    expect(wrapper).toContain("start-dashboard.ps1");
    expect(wrapper).toContain("%*");
  });

  it("provides a Phase 4 launcher that starts the existing service before the local runtime", () => {
    const script = readFileSync(
      new URL("../scripts/windows/start-phase4.ps1", import.meta.url),
      "utf8",
    );
    const wrapper = readFileSync(
      new URL("../scripts/windows/start-phase4.cmd", import.meta.url),
      "utf8",
    );

    expect(script).toContain("[string]$ConfigPath");
    expect(script).toContain("FQGateRemoteBridgeCloudflared");
    expect(script).toContain("Get-Service");
    expect(script).toContain("Start-Service");
    expect(script).toContain("start-dashboard.ps1");
    expect(script).toContain("ConfigPath = $ConfigPath");
    expect(script).toContain("SkipInstall = $true");
    expect(script).toContain("SkipBuild = $true");
    expect(script).toContain("$launcherArguments.NoBrowser = $true");
    expect(wrapper).toContain("start-phase4.ps1");
    expect(wrapper).toContain("%*");
  });
});
