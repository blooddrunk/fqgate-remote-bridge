export const CLOUDFLARED_RELEASE_REPOSITORY = "cloudflare/cloudflared" as const;
export const CLOUDFLARED_RELEASE_API_BASE =
  "https://api.github.com/repos/cloudflare/cloudflared/releases/tags/" as const;
export const CLOUDFLARED_RELEASE_ASSET_NAME = "cloudflared-windows-amd64.exe" as const;
export const CLOUDFLARED_ORIGIN = "http://127.0.0.1:17282" as const;

export interface CloudflaredRelease {
  readonly source: "cloudflare-github";
  readonly version: string;
  readonly tag: string;
  readonly publishedAt: string | null;
  readonly releasePageUrl: string;
  readonly asset: {
    readonly name: typeof CLOUDFLARED_RELEASE_ASSET_NAME;
    readonly url: string;
    readonly size: number;
    readonly sha256: string;
  };
}

export interface CloudflaredReleaseSource {
  getRelease(): Promise<CloudflaredRelease>;
}
