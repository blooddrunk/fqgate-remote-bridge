const CLIENT_ABORT_MESSAGE = "aborted";
const CLIENT_ABORT_CODE = "ECONNRESET";
const MAX_CAUSE_DEPTH = 4;

export function isClientAbortError(error: unknown): boolean {
  let current: unknown = error;
  const seen = new Set<object>();

  for (let depth = 0; depth < MAX_CAUSE_DEPTH && isRecord(current); depth += 1) {
    if (seen.has(current)) return false;
    seen.add(current);

    const message = current.message;
    const code = current.code;
    const name = current.name;
    if (
      (typeof message === "string" && message.toLowerCase() === CLIENT_ABORT_MESSAGE) ||
      name === "AbortError" ||
      (depth === 0 && code === CLIENT_ABORT_CODE)
    ) {
      return true;
    }
    current = current.cause;
  }

  return false;
}

function isRecord(value: unknown): value is {
  readonly message?: unknown;
  readonly code?: unknown;
  readonly name?: unknown;
  readonly cause?: unknown;
} {
  return typeof value === "object" && value !== null;
}
