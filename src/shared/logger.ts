import { Redactor } from "./redaction.js";

export type LogLevel = "debug" | "info" | "warn" | "error";

const LOG_LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

export type LogSink = (line: string) => void;

export interface LoggerOptions {
  readonly level?: LogLevel;
  readonly sink?: LogSink;
  readonly redactor?: Redactor;
  readonly now?: () => string;
}

export class StructuredLogger {
  private readonly level: LogLevel;
  private readonly sink: LogSink;
  private readonly redactor: Redactor;
  private readonly now: () => string;

  constructor(options: LoggerOptions = {}) {
    this.level = options.level ?? "info";
    this.sink = options.sink ?? ((line) => console.error(line));
    this.redactor = options.redactor ?? new Redactor();
    this.now = options.now ?? (() => new Date().toISOString());
  }

  debug(message: string, context?: Record<string, unknown>): void {
    this.write("debug", message, context);
  }

  info(message: string, context?: Record<string, unknown>): void {
    this.write("info", message, context);
  }

  warn(message: string, context?: Record<string, unknown>): void {
    this.write("warn", message, context);
  }

  error(message: string, context?: Record<string, unknown>): void {
    this.write("error", message, context);
  }

  private write(
    level: LogLevel,
    message: string,
    context: Record<string, unknown> | undefined,
  ): void {
    if (LOG_LEVEL_ORDER[level] < LOG_LEVEL_ORDER[this.level]) {
      return;
    }

    const entry: Record<string, unknown> = {
      timestamp: this.now(),
      level,
      message,
    };
    if (context !== undefined) {
      entry.context = this.redactor.redact(context);
    }
    this.sink(JSON.stringify(entry));
  }
}
