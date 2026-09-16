import { existsSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

const serverPath = join(process.cwd(), ".output", "server", "index.mjs");
if (!existsSync(serverPath)) {
  throw new Error("Production bridge output is missing; run pnpm build:bridge first");
}
const runtimeConfigPath = join(process.cwd(), "dist", "bridge", "runtime-config.js");
if (!existsSync(runtimeConfigPath)) {
  throw new Error("Bridge runtime configuration is missing; run pnpm build first");
}
const { BRIDGE_BIND_HOST, resolveBridgePort } = await import(pathToFileURL(runtimeConfigPath).href);
const port = resolveBridgePort(process.env.BRIDGE_PORT ?? process.env.PORT);

// Nitro honors different names across versions. Force every supported host
// variable instead of inheriting a LAN/public bind from the environment.
process.env.HOST = BRIDGE_BIND_HOST;
process.env.NITRO_HOST = BRIDGE_BIND_HOST;
process.env.HOSTNAME = BRIDGE_BIND_HOST;
process.env.PORT = String(port);
process.env.NITRO_PORT = String(port);

await import(pathToFileURL(serverPath).href);
