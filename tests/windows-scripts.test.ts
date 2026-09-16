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
      expect(script).toContain("& $script:nodePath $script:cliPath @Arguments");
      expect(script).toContain("--config");
      expect(script).not.toContain("pnpm exec fqgate-remote-bridge");
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
});
