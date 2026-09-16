export interface FqgatePackage {
  readonly platform: string;
  readonly architecture: string;
  readonly installMode: string;
  readonly fileName: string;
  readonly size: number;
  readonly sha256: string;
  readonly assetUrl: string;
}

export interface FqgateRelease {
  readonly schemaVersion: number;
  readonly component: "fqgate";
  readonly channel: "stable";
  readonly status: "published";
  readonly version: string;
  readonly publishedAt: string;
  readonly minimumSupportedVersion?: string;
  readonly releaseNotes: readonly string[];
  readonly packages: readonly FqgatePackage[];
}

export interface FqgateReleaseSource {
  getStableRelease(): Promise<FqgateRelease>;
}
