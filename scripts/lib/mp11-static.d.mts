import type { Buffer } from "node:buffer";
export interface SlicePin {
  name: string;
  offset: number;
  bytes: number;
  sha256: string;
  needles: string[];
}
export interface BytePin {
  bytes: number;
  sha256: string;
  slices: SlicePin[];
}
export function sha256(bytes: Uint8Array): string;
export function inspectBytes(
  bytes: Buffer,
  pin: BytePin,
): {
  bytes: number;
  sha256: string;
  slices: (Omit<SlicePin, "needles"> & {
    observations: {
      needle: string;
      state: "MISSING" | "OBSERVED_STATIC";
      firstByteOffset: number | null;
    }[];
  })[];
  runtimeQualified: false;
};
export function compareBytes(
  before: Buffer,
  after: Buffer,
):
  | { equal: true }
  | {
      equal: false;
      beforeRange: [number, number];
      afterRange: [number, number];
      beforeSha256: string;
      afterSha256: string;
    };
