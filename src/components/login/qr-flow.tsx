import {
  CheckCircle2,
  Clock3,
  Copy,
  Loader2,
  QrCode,
  RefreshCw,
  ShieldCheck,
  WifiOff,
} from "lucide-react";
import type { QrBeginResponse, QrPollResponse } from "../../bridge/contracts.js";
import { Alert } from "../ui/alert.js";
import { Badge } from "../ui/badge.js";
import { Button } from "../ui/button.js";
import { Card, CardContent } from "../ui/card.js";
import type { ReactNode } from "react";

export type QrFlowViewState =
  | { readonly kind: "idle" }
  | { readonly kind: "starting" }
  | {
      readonly kind: "active";
      readonly begin: QrBeginResponse;
      readonly poll?: QrPollResponse;
      readonly isPolling: boolean;
    }
  | { readonly kind: "connected"; readonly loginMethod?: string }
  | { readonly kind: "expired" | "replaced"; readonly message: string }
  | { readonly kind: "error"; readonly message: string };

export interface QrFlowViewProps {
  readonly state: QrFlowViewState;
  readonly onStart: () => void;
  readonly onRetry: () => void;
}

export function QrFlowView({ state, onStart, onRetry }: QrFlowViewProps) {
  return (
    <div className="mx-auto min-w-0 max-w-4xl space-y-7 sm:space-y-8">
      <section className="max-w-2xl">
        <Badge tone="info">
          <QrCode size={13} aria-hidden="true" /> 本机扫码登录
        </Badge>
        <h1 className="mt-5 text-3xl font-semibold tracking-[-0.04em] sm:text-5xl">
          恢复行情会话。
        </h1>
        <p className="mt-4 text-base leading-7 text-slate-600 dark:text-slate-300">
          使用 FQGate 配套应用扫描短时 QR 码。二维码只保存在内存中，上游流程编号不会离开桥接。
        </p>
      </section>

      {state.kind === "idle" ? <StartCard onStart={onStart} /> : null}
      {state.kind === "starting" ? <StartingCard /> : null}
      {state.kind === "active" ? (
        <ActiveCard begin={state.begin} poll={state.poll} isPolling={state.isPolling} />
      ) : null}
      {state.kind === "connected" ? (
        <ConnectedCard
          {...(state.loginMethod === undefined ? {} : { loginMethod: state.loginMethod })}
        />
      ) : null}
      {state.kind === "expired" || state.kind === "replaced" ? (
        <TerminalCard state={state} onRetry={onRetry} />
      ) : null}
      {state.kind === "error" ? <ErrorCard message={state.message} onRetry={onRetry} /> : null}
    </div>
  );
}

function StartCard({ onStart }: { readonly onStart: () => void }) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center px-4 py-10 text-center sm:px-6 sm:py-14">
        <span className="flex h-16 w-16 items-center justify-center rounded-3xl bg-cyan-50 text-cyan-600 dark:bg-cyan-400/10 dark:text-cyan-300">
          <QrCode size={29} aria-hidden="true" />
        </span>
        <h2 className="mt-6 text-xl font-semibold">准备好后开始</h2>
        <p className="mt-2 max-w-md text-sm leading-6 text-slate-500 dark:text-slate-400">
          开始后，桥接会向 FQGate 请求新的 QR 码，并关闭凭据缓存。
        </p>
        <Button className="mt-7" size="lg" onClick={onStart}>
          生成 QR 码
        </Button>
      </CardContent>
    </Card>
  );
}

function StartingCard() {
  return (
    <Card>
      <CardContent className="flex min-h-[24rem] flex-col items-center justify-center text-center sm:min-h-[29rem]">
        <Loader2 className="animate-spin text-cyan-400" size={30} aria-label="正在生成 QR 码" />
        <h2 className="mt-5 text-lg font-semibold">正在生成新的 QR 码…</h2>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
          正在连接本机 FQGate 会话接口。
        </p>
      </CardContent>
    </Card>
  );
}

function ActiveCard({
  begin,
  poll,
  isPolling,
}: {
  readonly begin: QrBeginResponse;
  readonly poll: QrPollResponse | undefined;
  readonly isPolling: boolean;
}) {
  const status = poll?.status ?? begin.status;
  return (
    <Card>
      <CardContent className="grid min-w-0 gap-6 p-4 sm:gap-8 sm:p-6 md:grid-cols-[minmax(18rem,22rem)_1fr] md:p-8">
        <div className="flex aspect-square min-h-0 min-w-0 items-center justify-center rounded-3xl border border-slate-200 bg-white p-4 shadow-inner dark:border-white/[0.08] dark:bg-white sm:min-h-[23rem] sm:p-5">
          <img
            className="aspect-square h-auto w-full max-w-[19rem] object-contain"
            src={`data:${begin.qr.mediaType};base64,${begin.qr.imageBase64}`}
            alt="FQGate 扫码登录二维码"
          />
        </div>
        <div className="flex min-w-0 flex-col justify-center">
          <Badge tone={status === "waiting_for_confirmation" ? "warning" : "info"}>
            <span className="h-1.5 w-1.5 rounded-full bg-current" />
            {status === "waiting_for_confirmation" ? "请在手机上确认" : "等待扫码"}
          </Badge>
          <h2 className="mt-5 text-2xl font-semibold tracking-tight">
            {status === "waiting_for_confirmation" ? "即将完成" : "请扫描此二维码"}
          </h2>
          <p className="mt-3 text-sm leading-6 text-slate-500 dark:text-slate-400">
            请保持此页面打开，桥接会检查短时登录流程。{" "}
            {isPolling ? "系统会每隔几秒安全检查一次。" : "等待下一次状态更新。"}
          </p>
          <div className="mt-7 space-y-3 text-sm">
            <InfoRow
              icon={<Clock3 size={16} />}
              label="过期时间"
              value={formatExpiry(begin.expiresAt)}
            />
            <InfoRow icon={<ShieldCheck size={16} />} label="保存位置" value="仅内存" />
            <InfoRow icon={<WifiOff size={16} />} label="网络范围" value="127.0.0.1" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ConnectedCard({ loginMethod }: { readonly loginMethod?: string }) {
  return (
    <Card>
      <CardContent className="flex min-h-[24rem] flex-col items-center justify-center text-center sm:min-h-[29rem]">
        <span className="flex h-16 w-16 items-center justify-center rounded-3xl bg-emerald-50 text-emerald-600 dark:bg-emerald-400/10 dark:text-emerald-300">
          <CheckCircle2 size={31} aria-hidden="true" />
        </span>
        <h2 className="mt-6 text-2xl font-semibold">行情会话已连接</h2>
        <p className="mt-2 max-w-md text-sm leading-6 text-slate-500 dark:text-slate-400">
          FQGate 已接受扫码登录
          {loginMethod === undefined ? "" : `（${formatLoginMethod(loginMethod)}）`}
          。桥接已停止轮询，总览状态也已刷新。
        </p>
        <div className="mt-7 flex w-full flex-col justify-center gap-3 sm:w-auto sm:flex-row">
          <Button
            variant="secondary"
            onClick={() => void navigator.clipboard?.writeText("行情会话已连接")}
          >
            <Copy size={15} aria-hidden="true" /> 复制状态
          </Button>
          <a
            href="/"
            className="inline-flex min-h-11 items-center justify-center rounded-xl bg-cyan-400 px-4 text-sm font-medium text-slate-950 outline-none hover:bg-cyan-300 focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2"
          >
            返回总览
          </a>
        </div>
        <p className="mt-6 text-xs text-slate-400">本次 QR 内容已从页面状态中清除。</p>
      </CardContent>
    </Card>
  );
}

function TerminalCard({
  state,
  onRetry,
}: {
  readonly state: Extract<QrFlowViewState, { readonly kind: "expired" | "replaced" }>;
  readonly onRetry: () => void;
}) {
  return (
    <Card>
      <CardContent className="flex min-h-[24rem] flex-col items-center justify-center text-center sm:min-h-[29rem]">
        <span className="flex h-16 w-16 items-center justify-center rounded-3xl bg-amber-50 text-amber-600 dark:bg-amber-400/10 dark:text-amber-300">
          <RefreshCw size={28} aria-hidden="true" />
        </span>
        <h2 className="mt-6 text-2xl font-semibold">
          {state.kind === "expired" ? "二维码已过期" : "二维码已被替换"}
        </h2>
        <p className="mt-2 max-w-md text-sm leading-6 text-slate-500 dark:text-slate-400">
          {state.message}
        </p>
        <Button className="mt-7" size="lg" onClick={onRetry}>
          <RefreshCw size={16} aria-hidden="true" /> 生成新的二维码
        </Button>
      </CardContent>
    </Card>
  );
}

function ErrorCard({
  message,
  onRetry,
}: {
  readonly message: string;
  readonly onRetry: () => void;
}) {
  return (
    <Alert tone="danger" className="flex items-start gap-3">
      <WifiOff className="mt-0.5 shrink-0" size={18} aria-hidden="true" />
      <div>
        <p className="font-semibold">无法开始扫码登录</p>
        <p className="mt-1">{message}</p>
        <Button className="mt-4" variant="secondary" size="sm" onClick={onRetry}>
          <RefreshCw size={15} aria-hidden="true" /> 重试
        </Button>
      </div>
    </Alert>
  );
}

function InfoRow({
  icon,
  label,
  value,
}: {
  readonly icon: ReactNode;
  readonly label: string;
  readonly value: string;
}) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-slate-200/70 pb-3 last:border-b-0 last:pb-0 dark:border-white/[0.08]">
      <span className="flex min-w-0 items-center gap-2 text-slate-500 dark:text-slate-400">
        {icon}
        {label}
      </span>
      <span className="break-words text-right font-medium text-slate-800 dark:text-slate-100">
        {value}
      </span>
    </div>
  );
}
function formatExpiry(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.valueOf())
    ? "即将过期"
    : date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
}

function formatLoginMethod(value: string): string {
  return value === "formal" ? "正式会话" : value;
}
