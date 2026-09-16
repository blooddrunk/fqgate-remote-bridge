import {
  Activity,
  CheckCircle2,
  CircleAlert,
  Cpu,
  Globe2,
  LockKeyhole,
  RefreshCw,
  Server,
} from "lucide-react";
import type { BridgeStatusResponse } from "../../bridge/contracts.js";
import { Alert } from "../ui/alert.js";
import { Badge } from "../ui/badge.js";
import { Button } from "../ui/button.js";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card.js";
import { Skeleton } from "../ui/skeleton.js";
import type { ReactNode } from "react";

export interface StatusViewProps {
  readonly status: BridgeStatusResponse | undefined;
  readonly isLoading: boolean;
  readonly error: Error | null | undefined;
  readonly onRetry: () => void;
}

export function DashboardStatusView({ status, isLoading, error, onRetry }: StatusViewProps) {
  if (isLoading && status === undefined) return <DashboardSkeleton />;
  if (error !== null && error !== undefined && status === undefined) {
    return (
      <div className="mx-auto max-w-xl pt-10">
        <Alert tone="danger" className="flex items-start gap-3">
          <CircleAlert className="mt-0.5 shrink-0" size={18} aria-hidden="true" />
          <div className="flex-1">
            <p className="font-semibold">Bridge status is unavailable</p>
            <p className="mt-1 text-rose-700/80 dark:text-rose-200/80">{error.message}</p>
            <Button className="mt-4" variant="secondary" size="sm" onClick={onRetry}>
              <RefreshCw size={15} aria-hidden="true" /> Try again
            </Button>
          </div>
        </Alert>
      </div>
    );
  }
  if (status === undefined) return null;

  const fqgate = status.fqgate;
  const sessionConnected = fqgate.health.session === "connected";
  const compatibilityTone = fqgate.compatibility.validated ? "success" : "warning";
  return (
    <div className="space-y-10">
      <section className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
        <div className="max-w-2xl">
          <div className="mb-4 flex items-center gap-2">
            <Badge tone="success">
              <span className="h-1.5 w-1.5 rounded-full bg-current" /> Bridge ready
            </Badge>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Loopback operator view
            </span>
          </div>
          <h1 className="text-4xl font-semibold tracking-[-0.04em] text-slate-950 sm:text-5xl dark:text-white">
            One clear view of your local market session.
          </h1>
          <p className="mt-4 max-w-xl text-base leading-7 text-slate-600 dark:text-slate-300">
            The bridge keeps process health, provider readiness, and authenticated session state
            separate so recovery is easy to understand.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          <Activity size={15} aria-hidden="true" /> Updated {formatTimestamp(status.lastCheckedAt)}
          {isLoading ? (
            <span
              className="ml-1 h-2 w-2 animate-pulse rounded-full bg-cyan-400"
              aria-label="Refreshing"
            />
          ) : null}
        </div>
      </section>

      <section
        className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
        aria-label="Bridge status summary"
      >
        <StatusCard
          icon={<Server size={18} />}
          label="Bridge runtime"
          value={capitalize(status.bridge.state)}
          detail={`v${status.bridge.version}`}
          tone="success"
        />
        <StatusCard
          icon={<Cpu size={18} />}
          label="FQGate process"
          value={processLabel(fqgate.process.state)}
          detail={
            fqgate.process.pid === undefined
              ? "Managed process identity"
              : `PID ${fqgate.process.pid}`
          }
          tone={fqgate.process.running ? "success" : "warning"}
        />
        <StatusCard
          icon={<Globe2 size={18} />}
          label="Network ready"
          value={booleanLabel(fqgate.health.networkReady)}
          detail={healthDetail(fqgate.health.available, fqgate.health.validPayload)}
          tone={fqgate.health.networkReady === true ? "success" : "warning"}
        />
        <StatusCard
          icon={<LockKeyhole size={18} />}
          label="Market session"
          value={sessionLabel(fqgate.health.session)}
          detail={fqgate.health.loginMethod ?? "Authentication state"}
          tone={sessionConnected ? "success" : "warning"}
        />
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.3fr_0.7fr]">
        <Card>
          <CardHeader className="flex-row items-start justify-between">
            <div>
              <CardTitle>Provider diagnostics</CardTitle>
              <CardDescription className="mt-1">
                Normalized signals from the managed local FQGate instance.
              </CardDescription>
            </div>
            <Badge tone={compatibilityTone}>
              {compatibilityLabel(fqgate.compatibility.status)}
            </Badge>
          </CardHeader>
          <CardContent>
            <div className="grid gap-5 sm:grid-cols-3">
              <Metric label="Lifecycle" value={capitalize(fqgate.lifecycle)} />
              <Metric
                label="Installed version"
                value={fqgate.version === null ? "Not detected" : `FQGate ${fqgate.version}`}
              />
              <Metric
                label="Health response"
                value={fqgate.health.validPayload ? "Valid envelope" : "Unavailable / invalid"}
              />
            </div>
            <div className="mt-6 rounded-2xl border border-slate-200/80 bg-slate-50/80 p-4 text-sm dark:border-white/[0.08] dark:bg-white/[0.035]">
              <div className="flex items-start gap-3">
                {sessionConnected ? (
                  <CheckCircle2 className="mt-0.5 text-emerald-500" size={18} aria-hidden="true" />
                ) : (
                  <CircleAlert className="mt-0.5 text-amber-500" size={18} aria-hidden="true" />
                )}
                <div>
                  <p className="font-medium">
                    {sessionConnected
                      ? "Authenticated market session is available"
                      : "Market session needs attention"}
                  </p>
                  <p className="mt-1 leading-6 text-slate-500 dark:text-slate-400">
                    {sessionConnected
                      ? "The local bridge can see a connected FQGate session."
                      : fqgate.compatibility.validated
                        ? "Use the QR login flow to restore the session without opening the FQGate desktop UI."
                        : "QR login is disabled until the active FQGate version passes the compatibility gate."}
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="flex flex-col">
          <CardHeader>
            <CardTitle>Session action</CardTitle>
            <CardDescription className="mt-1">
              QR data is returned to the login page only and is never persisted by the bridge.
            </CardDescription>
          </CardHeader>
          <CardContent className="mt-auto">
            <a
              href="/login"
              className={`flex h-12 w-full items-center justify-center rounded-xl px-5 text-base font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-slate-950 ${sessionConnected ? "border border-slate-300/70 bg-white/70 text-slate-800 hover:bg-white dark:border-white/10 dark:bg-white/[0.06] dark:text-slate-100 dark:hover:bg-white/[0.1]" : "bg-cyan-400 text-slate-950 shadow-lg shadow-cyan-950/20 hover:bg-cyan-300"}`}
            >
              {sessionConnected ? "Open QR login" : "Restore with QR"}
            </a>
            <p className="mt-3 text-center text-xs leading-5 text-slate-400">
              No Cloudflare or public network access is enabled in Phase 2.
            </p>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function StatusCard({
  icon,
  label,
  value,
  detail,
  tone,
}: {
  readonly icon: ReactNode;
  readonly label: string;
  readonly value: string;
  readonly detail: string;
  readonly tone: "success" | "warning";
}) {
  return (
    <Card className="min-h-40">
      <CardContent className="flex h-full flex-col justify-between p-5">
        <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
          <span className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.12em]">
            {icon}
            {label}
          </span>
          <span
            className={`h-2 w-2 rounded-full ${tone === "success" ? "bg-emerald-400" : "bg-amber-400"}`}
          />
        </div>
        <div className="mt-7">
          <p className="text-xl font-semibold tracking-tight">{value}</p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{detail}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function Metric({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-[0.12em] text-slate-400">{label}</p>
      <p className="mt-2 text-sm font-medium text-slate-800 dark:text-slate-100">{value}</p>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-10">
      <section>
        <Skeleton className="h-5 w-28" />
        <Skeleton className="mt-5 h-16 w-full max-w-2xl" />
        <Skeleton className="mt-4 h-5 w-full max-w-xl" />
      </section>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton className="h-40" key={index} />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-[1.3fr_0.7fr]">
        <Skeleton className="h-80" />
        <Skeleton className="h-80" />
      </div>
    </div>
  );
}

function formatTimestamp(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.valueOf())
    ? "moments ago"
    : date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function capitalize(value: string): string {
  return value.replaceAll("_", " ").replace(/(^|\s)\S/g, (character) => character.toUpperCase());
}
function booleanLabel(value: boolean | null): string {
  return value === null ? "Unknown" : value ? "Yes" : "No";
}
function processLabel(value: string): string {
  return value === "running" ? "Running" : capitalize(value);
}
function sessionLabel(value: string): string {
  return value === "login_required" ? "Login required" : capitalize(value);
}
function healthDetail(available: boolean, valid: boolean): string {
  return !available ? "Endpoint unavailable" : valid ? "Envelope validated" : "Invalid payload";
}
function compatibilityLabel(value: string): string {
  return value === "validated"
    ? "Validated"
    : value === "supported_unvalidated"
      ? "Needs validation"
      : capitalize(value);
}
