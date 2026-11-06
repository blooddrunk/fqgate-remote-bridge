import process from "node:process";
import console from "node:console";
// Explicit standalone GET-only entry. No production configuration or application construction.
import { readFile, lstat } from "node:fs/promises";
import {
  observeReleases,
  parseObservationBaseline,
} from "../dist/fqgate/diagnostics/release-observer.js";
import { FetchHttpTransport } from "../dist/fqgate/release/http.js";
const args = process.argv.slice(2);
try {
  if (!(args.length === 0 || (args.length === 2 && args[0] === "--baseline" && args[1])))
    throw Error();
  if (args[1]) {
    const stat = await lstat(args[1]);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 4096) throw Error();
  }
  const baseline = args[1]
    ? parseObservationBaseline(JSON.parse(await readFile(args[1], "utf8")))
    : undefined;
  const result = await observeReleases(new FetchHttpTransport(), baseline ? { baseline } : {});
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = 0; // observation success only; all qualification flags remain false.
} catch {
  console.log(
    JSON.stringify({
      status: "FAIL_CLOSED",
      compatibility: "UNKNOWN",
      installAllowed: false,
      runtimeQualified: false,
      signatureVerified: false,
    }),
  );
  process.exitCode = 1;
}
