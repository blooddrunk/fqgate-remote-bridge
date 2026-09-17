export const REDACTED = "[REDACTED]";

const DEFAULT_SENSITIVE_KEY_PATTERN =
  /(?:authorization|api[_-]?key|token|secret|password|cookie|credential|qr.*base64|cf-access-jwt-assertion|access[_-]?(?:token|secret|assertion|jwt)|session[_-]?(?:token|secret|cookie|credential))/i;

export interface RedactorOptions {
  readonly sensitiveKeys?: readonly string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export class Redactor {
  private readonly sensitiveKeys: ReadonlySet<string>;

  constructor(options: RedactorOptions = {}) {
    this.sensitiveKeys = new Set((options.sensitiveKeys ?? []).map((key) => key.toLowerCase()));
  }

  redact(value: unknown): unknown {
    return this.redactValue(value, undefined);
  }

  private redactValue(value: unknown, key: string | undefined): unknown {
    if (
      key !== undefined &&
      (DEFAULT_SENSITIVE_KEY_PATTERN.test(key) || this.sensitiveKeys.has(key.toLowerCase()))
    ) {
      return REDACTED;
    }

    if (typeof value === "string") {
      return redactSensitiveString(value);
    }
    if (Array.isArray(value)) {
      return value.map((item) => this.redactValue(item, undefined));
    }
    if (isRecord(value)) {
      return Object.fromEntries(
        Object.entries(value).map(([entryKey, entryValue]) => [
          entryKey,
          this.redactValue(entryValue, entryKey),
        ]),
      );
    }
    return value;
  }
}

function redactSensitiveString(value: string): string {
  return value
    .replace(/\b(Bearer|Basic)\s+[^\s,;]+/gi, "$1 ${REDACTED}")
    .replace(
      /((?:token|secret|password|authorization|api[_-]?key)\s*[=:]\s*)[^\s,;&]+/gi,
      `$1${REDACTED}`,
    );
}

export function redactRecord(
  value: Record<string, unknown>,
  options?: RedactorOptions,
): Record<string, unknown> {
  const redacted = new Redactor(options).redact(value);
  return redacted as Record<string, unknown>;
}
