// Offline byte inspection only. Never parse JavaScript as executable code.
import { createHash } from "node:crypto";
import { Buffer } from "node:buffer";
import { TextDecoder } from "node:util";

export const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const MAX_BYTES = 64 * 1024 * 1024;
const hash = (value) => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);

/** Hash authority is supplied by the reviewed offline pins, never by the input. */
export function inspectBytes(bytes, pin) {
  if (
    !Buffer.isBuffer(bytes) ||
    !Number.isSafeInteger(pin?.bytes) ||
    pin.bytes < 1 ||
    pin.bytes > MAX_BYTES ||
    bytes.length !== pin.bytes ||
    !hash(pin.sha256) ||
    sha256(bytes) !== pin.sha256 ||
    !Array.isArray(pin.slices) ||
    pin.slices.length < 1 ||
    pin.slices.length > 8
  )
    throw Error("PIN_OR_INPUT_INVALID");
  const names = new Set();
  const ranges = [];
  const slices = pin.slices.map((slice) => {
    const { name, offset, bytes: size, sha256: digest, needles } = slice;
    if (
      typeof name !== "string" ||
      !/^[a-z][a-z0-9-]{0,39}$/.test(name) ||
      names.has(name) ||
      !Number.isSafeInteger(offset) ||
      !Number.isSafeInteger(size) ||
      offset < 0 ||
      size < 1 ||
      size > 1024 * 1024 ||
      offset > bytes.length - size ||
      !hash(digest) ||
      !Array.isArray(needles) ||
      needles.length > 32 ||
      new Set(needles).size !== needles.length ||
      needles.some((n) => typeof n !== "string" || !n.length || Buffer.byteLength(n) > 256) ||
      ranges.some(([a, b]) => offset < b && offset + size > a)
    )
      throw Error("SLICE_INVALID");
    names.add(name);
    ranges.push([offset, offset + size]);
    const data = bytes.subarray(offset, offset + size);
    if (sha256(data) !== digest) throw Error("SLICE_HASH_MISMATCH");
    new TextDecoder("utf-8", { fatal: true }).decode(data);
    const observations = needles.map((needle) => {
      const at = data.indexOf(Buffer.from(needle));
      return {
        needle,
        state: at < 0 ? "MISSING" : "OBSERVED_STATIC",
        firstByteOffset: at < 0 ? null : offset + at,
      };
    });
    return { name, offset, bytes: size, sha256: digest, observations };
  });
  return { bytes: bytes.length, sha256: pin.sha256, slices, runtimeQualified: false };
}

/** Exact contiguous changed range, without normalization or JS evaluation. */
export function compareBytes(before, after) {
  if (
    !Buffer.isBuffer(before) ||
    !Buffer.isBuffer(after) ||
    before.length > 1024 * 1024 ||
    after.length > 1024 * 1024
  )
    throw Error("COMPARISON_INVALID");
  let start = 0;
  while (start < Math.min(before.length, after.length) && before[start] === after[start]) start++;
  if (start === before.length && start === after.length) return { equal: true };
  let oldEnd = before.length,
    newEnd = after.length;
  while (oldEnd > start && newEnd > start && before[oldEnd - 1] === after[newEnd - 1]) {
    oldEnd--;
    newEnd--;
  }
  return {
    equal: false,
    beforeRange: [start, oldEnd],
    afterRange: [start, newEnd],
    beforeSha256: sha256(before.subarray(start, oldEnd)),
    afterSha256: sha256(after.subarray(start, newEnd)),
  };
}
