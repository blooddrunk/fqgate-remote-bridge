import process from "node:process";

import { loadCloudflareDesiredState } from "../../dist/cloudflare/desired.js";
import { CloudflareApiClient } from "../../dist/cloudflare/client.js";
import { runCloudflareDnsCanary } from "../../dist/cloudflare/canary.js";
import {
  FetchCloudflareGetTransport,
  getCloudflareApiToken,
} from "../../dist/cloudflare/transport.js";
import {
  FetchCloudflareDnsCanaryWriteTransport,
  getCloudflareDnsWriteToken,
} from "../../dist/cloudflare/write-transport.js";
import { isBridgeError } from "../../dist/shared/errors.js";

const desiredPath = process.argv[2];
const commitSha = process.argv[3];

try {
  if (desiredPath === undefined || commitSha === undefined) {
    throw new Error("P6B1_CANARY_ARGUMENTS_INVALID");
  }
  const desired = await loadCloudflareDesiredState(desiredPath);
  const readTransport = new FetchCloudflareGetTransport({ apiToken: getCloudflareApiToken() });
  const discoveryClient = new CloudflareApiClient({ transport: readTransport });
  const writeTransport = new FetchCloudflareDnsCanaryWriteTransport({
    apiToken: getCloudflareDnsWriteToken(),
  });
  const result = await runCloudflareDnsCanary({
    desired,
    discoveryClient,
    writeTransport,
    commitSha,
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
} catch (error) {
  const code = isBridgeError(error) ? error.code : "P6B1_CANARY_FAILED";
  process.stderr.write(`${JSON.stringify({ error: { code } })}\n`);
  process.exitCode = 1;
} finally {
  process.env.CLOUDFLARE_API_TOKEN = "";
  process.env.CLOUDFLARE_DNS_WRITE_TOKEN = "";
}
