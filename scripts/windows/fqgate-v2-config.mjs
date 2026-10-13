// Read-only validation using the existing application schema; no services are constructed.
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import process from "node:process";
try {
  const { loadConfig } = await import(
    pathToFileURL(resolve(process.argv[2], "dist/config/config.js")).href
  );
  const config = await loadConfig(process.argv[3]);
  if (config.fqgateBaseUrl !== "http://127.0.0.1:17281") throw new Error();
  process.stdout.write(JSON.stringify({ installDirectory: config.installDirectory }));
} catch {
  process.stdout.write(JSON.stringify({ error: "CONFIG_INVALID_OR_UNREADABLE" }));
  process.exitCode = 2;
}
