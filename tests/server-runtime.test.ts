import { describe, expect, it } from "vitest";
import { isClientAbortError } from "../src/server/client-abort.js";

describe("production request error policy", () => {
  it("recognizes client disconnects without requiring a QR or session value", () => {
    expect(isClientAbortError(new Error("aborted"))).toBe(true);
    expect(isClientAbortError(new Error("request failed", { cause: new Error("aborted") }))).toBe(
      true,
    );
    expect(
      isClientAbortError(Object.assign(new Error("socket closed"), { code: "ECONNRESET" })),
    ).toBe(true);
  });

  it("does not classify ordinary upstream or application errors as client aborts", () => {
    expect(isClientAbortError(new Error("FQGate returned an invalid response"))).toBe(false);
    expect(
      isClientAbortError(
        new Error("upstream request failed", {
          cause: Object.assign(new Error(), { code: "ECONNRESET" }),
        }),
      ),
    ).toBe(false);
    expect(isClientAbortError({ name: "TypeError", message: "Failed to fetch" })).toBe(false);
  });
});
