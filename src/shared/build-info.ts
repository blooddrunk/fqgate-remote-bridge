export interface BuildInfo {
  readonly name: string;
  readonly version: string;
  readonly commit: string;
  readonly node: string;
  readonly platform: NodeJS.Platform;
  readonly architecture: string;
}

export function getBuildInfo(env: NodeJS.ProcessEnv = process.env): BuildInfo {
  return {
    name: "fqgate-remote-bridge",
    version: "0.1.0",
    commit: env.FQGATE_REMOTE_BRIDGE_COMMIT_SHA ?? "unknown",
    node: process.version,
    platform: process.platform,
    architecture: process.arch,
  };
}
