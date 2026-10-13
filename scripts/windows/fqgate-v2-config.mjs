// Read-only validation using the existing application schema; no services are constructed.
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";
import process from "node:process";
try {
  const repository = resolve(process.argv[2]);
  const ownRepository = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
  const normalize = (path) => (process.platform === "win32" ? path.toLowerCase() : path);
  if (
    normalize(repository) !== normalize(ownRepository) &&
    !(
      process.platform === "win32" &&
      normalize(repository) === normalize(resolve("D:/code/research/fqgate-remote-bridge"))
    )
  )
    throw new Error();
  const { loadConfig } = await import(
    pathToFileURL(resolve(repository, "dist/config/config.js")).href
  );
  const config = await loadConfig(process.argv[3]);
  if (config.fqgateBaseUrl !== "http://127.0.0.1:17281") throw new Error();
  process.stdout.write(JSON.stringify({ installDirectory: config.installDirectory }));
} catch {
  process.stdout.write(JSON.stringify({ error: "CONFIG_INVALID_OR_UNREADABLE" }));
  process.exitCode = 2;
}
