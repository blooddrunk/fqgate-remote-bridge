export type SessionState = "connected" | "guest" | "login_required" | "unknown";

export interface HealthObservation {
  readonly endpoint: string;
  readonly checkedAt: string;
  readonly available: boolean;
  readonly validPayload: boolean;
  readonly httpStatus?: number;
  readonly networkReady: boolean | null;
  readonly connected: boolean | null;
  readonly session: SessionState;
  readonly status?: string;
  readonly loginMethod?: string;
  readonly level2Permission: boolean | null;
  readonly reason?: string;
  readonly activeSubscriptions?: number;
  readonly diagnostics: Readonly<Record<string, unknown>>;
}
