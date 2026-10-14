import process from "node:process";
import { loadConfig } from "../../dist/config/config.js";
import { createApplicationServices } from "../../dist/app/runtime.js";
import { createFqgateLayout } from "../../dist/fqgate/install/layout.js";
import { ChildProcessRunner } from "../../dist/fqgate/process/runner.js";
import { verifyV2LookupIdentity } from "../../dist/fqgate/market/v2-identity.js";
import { V2_LOOKUP_TREE_HASH, V2_LOOKUP_FINGERPRINT } from "../../dist/fqgate/market/v2.js";
import { ERROR_CODES } from "../../dist/shared/errors.js";
const codes = new Set(Object.values(ERROR_CODES));
let config;
function emit(id, status, details = {}) {
  process.stdout.write(
    JSON.stringify({
      id,
      status,
      utc: new Date().toISOString(),
      environment: "native-windows",
      ...details,
    }) + "\n",
  );
}
try {
  if (process.platform !== "win32" || process.argv.length !== 4 || process.argv[2] !== "--config")
    throw Error();
  config = await loadConfig(process.argv[3]);
  const layout = createFqgateLayout(config.installDirectory),
    runner = new ChildProcessRunner();
  const before = await verifyV2LookupIdentity(layout, runner);
  emit("V205-PAYLOAD-IDENTITY", "PASS", {
    treeHash: V2_LOOKUP_TREE_HASH,
    signatureVerified: false,
  });
  const started = Date.now();
  const result = await createApplicationServices(config).instrumentLookup.lookup({
    code: "600000",
  });
  const after = await verifyV2LookupIdentity(layout, runner);
  if (before !== after || result.items.length !== 1 || result.items[0]?.code !== "600000")
    throw Error();
  emit("V205-READONLY-LOOKUP", "PASS", {
    elapsedMs: Date.now() - started,
    exactMatches: result.items.length,
    contractFingerprint: V2_LOOKUP_FINGERPRINT,
    identityUnchanged: true,
    rawPayloadSaved: false,
  });
} catch (error) {
  emit("V205-READONLY-PROBE", "FAIL", {
    code: codes.has(error?.code) ? error.code : "BOUNDED_PROBE_FAILED",
    rawErrorSaved: false,
  });
  process.exitCode = 1;
}
