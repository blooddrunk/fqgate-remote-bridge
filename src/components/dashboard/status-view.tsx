import {
  Activity,
  CheckCircle2,
  CircleAlert,
  Cpu,
  Download,
  Globe2,
  LockKeyhole,
  RefreshCw,
  Server,
} from "lucide-react";
import type { ReactNode } from "react";
import type { BridgeStatusResponse } from "../../bridge/contracts.js";
import { Alert } from "../ui/alert.js";
import { Badge } from "../ui/badge.js";
import { Button } from "../ui/button.js";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card.js";
import { Skeleton } from "../ui/skeleton.js";

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
            <p className="font-semibold">暂时无法读取桥接状态</p>
            <p className="mt-1 text-rose-700/80 dark:text-rose-200/80">{error.message}</p>
            <Button className="mt-4" variant="secondary" size="sm" onClick={onRetry}>
              <RefreshCw size={15} aria-hidden="true" /> 重试
            </Button>
          </div>
        </Alert>
      </div>
    );
  }
  if (status === undefined) return null;

  const fqgate = status.fqgate;
  const managedProcessRunning = fqgate.lifecycle !== "not_installed" && fqgate.process.running;
  const managedHealth = managedProcessRunning ? fqgate.health : undefined;
  const sessionConnected = managedHealth?.session === "connected";
  const compatibilityTone = fqgate.compatibility.validated ? "success" : "warning";
  return (
    <div className="min-w-0 space-y-8 sm:space-y-10">
      <section className="flex min-w-0 flex-col justify-between gap-5 md:flex-row md:items-end">
        <div className="max-w-2xl">
          <h1 className="text-3xl font-semibold tracking-[-0.04em] text-slate-950 sm:text-5xl dark:text-white">
            本机行情连接，一眼看清。
          </h1>
          <p className="mt-4 max-w-xl text-base leading-7 text-slate-600 dark:text-slate-300">
            这里分别展示桥接、FQGate
            进程、网络健康和行情会话状态，遇到问题时可以直接知道下一步该处理什么。
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          <Activity size={15} aria-hidden="true" /> 最后更新于{" "}
          {formatTimestamp(status.lastCheckedAt)}
          {isLoading ? (
            <span
              className="ml-1 h-2 w-2 animate-pulse rounded-full bg-cyan-400"
              aria-label="正在刷新"
            />
          ) : null}
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="桥接状态概览">
        <StatusCard
          icon={<Server size={18} />}
          label="桥接运行"
          value={bridgeStateLabel(status.bridge.state)}
          detail={`v${status.bridge.version}`}
          tone="success"
        />
        <StatusCard
          icon={<Cpu size={18} />}
          label="FQGate 进程"
          value={processLabel(fqgate.process.state)}
          detail={fqgate.process.pid === undefined ? "由桥接管理" : `进程号 ${fqgate.process.pid}`}
          tone={fqgate.process.running ? "success" : "warning"}
        />
        <StatusCard
          icon={<Globe2 size={18} />}
          label="网络可用"
          value={booleanLabel(managedHealth?.networkReady ?? null)}
          detail={healthDetail(
            managedHealth?.available ?? false,
            managedHealth?.validPayload ?? false,
          )}
          tone={managedHealth?.networkReady === true ? "success" : "warning"}
        />
        <StatusCard
          icon={<LockKeyhole size={18} />}
          label="行情会话"
          value={sessionLabel(managedHealth?.session ?? "unknown")}
          detail={loginMethodLabel(managedHealth?.loginMethod ?? null)}
          tone={sessionConnected ? "success" : "warning"}
        />
      </section>

      {fqgate.lifecycle === "not_installed" ? <FqgateInstallNotice /> : null}

      <section className="grid min-w-0 gap-4 lg:grid-cols-[1.3fr_0.7fr]">
        <Card>
          <CardHeader className="flex-col items-start justify-between gap-3 sm:flex-row">
            <div>
              <CardTitle>FQGate 状态</CardTitle>
              <CardDescription className="mt-1">
                来自本机受管 FQGate 实例的标准化状态。
              </CardDescription>
            </div>
            <Badge tone={compatibilityTone}>
              {compatibilityLabel(fqgate.compatibility.status)}
            </Badge>
          </CardHeader>
          <CardContent>
            <div className="grid min-w-0 gap-5 sm:grid-cols-3">
              <Metric label="生命周期" value={lifecycleLabel(fqgate.lifecycle)} />
              <Metric
                label="已安装版本"
                value={fqgate.version === null ? "未检测到" : `FQGate ${fqgate.version}`}
              />
              <Metric
                label="健康检查"
                value={managedHealth?.validPayload ? "响应有效" : "不可用或无效"}
              />
            </div>
            <div className="mt-6 rounded-2xl border border-slate-200/80 bg-slate-50/80 p-4 text-sm dark:border-white/[0.08] dark:bg-white/[0.035]">
              <div className="flex min-w-0 items-start gap-3">
                {sessionConnected ? (
                  <CheckCircle2 className="mt-0.5 text-emerald-500" size={18} aria-hidden="true" />
                ) : (
                  <CircleAlert className="mt-0.5 text-amber-500" size={18} aria-hidden="true" />
                )}
                <div className="min-w-0">
                  <p className="font-medium">
                    {sessionConnected ? "行情会话已连接" : "行情会话需要处理"}
                  </p>
                  <p className="mt-1 leading-6 text-slate-500 dark:text-slate-400">
                    {sessionConnected
                      ? "本机桥接已确认 FQGate 会话可用。"
                      : fqgate.compatibility.validated
                        ? "使用扫码登录恢复会话，不需要打开 FQGate 桌面窗口。"
                        : "当前 FQGate 版本尚未通过兼容性验证，扫码登录已禁用。"}
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="flex flex-col">
          <CardHeader>
            <CardTitle>会话操作</CardTitle>
            <CardDescription className="mt-1">
              QR 数据只返回给扫码页面，桥接不会将它写入文件或浏览器存储。
            </CardDescription>
          </CardHeader>
          <CardContent className="mt-auto">
            {qrAvailable(fqgate) ? (
              <a
                href="/login"
                className={`flex h-12 w-full items-center justify-center rounded-xl px-5 text-base font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-slate-950 ${sessionConnected ? "border border-slate-300/70 bg-white/70 text-slate-800 hover:bg-white dark:border-white/10 dark:bg-white/[0.06] dark:text-slate-100 dark:hover:bg-white/[0.1]" : "bg-cyan-400 text-slate-950 shadow-lg shadow-cyan-950/20 hover:bg-cyan-300"}`}
              >
                {sessionConnected ? "打开扫码登录" : "使用扫码登录"}
              </a>
            ) : (
              <div className="flex h-12 w-full items-center justify-center rounded-xl border border-slate-200 bg-slate-100/80 px-5 text-base font-medium text-slate-400 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-slate-500">
                扫码登录暂不可用
              </div>
            )}
            <p className="mt-3 text-center text-xs leading-5 text-slate-400">
              QR 登录仍由 Bridge operation policy 控制；二维码状态只保存在本次内存会话中。
            </p>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function FqgateInstallNotice() {
  return (
    <Alert tone="warning" className="flex min-w-0 items-start gap-3">
      <Download className="mt-0.5 shrink-0" size={18} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="font-semibold">尚未检测到 FQGate</p>
        <p className="mt-1">
          当前版本不会在后台自动安装。先预览官方安装计划，确认来源、版本和校验信息后再执行安装。
        </p>
        <code className="mt-3 block max-w-full overflow-x-auto rounded-xl bg-black/5 px-3 py-2 text-xs text-slate-800 dark:bg-black/20 dark:text-slate-100">
          node .\dist\cli\main.js fqgate install --dry-run
        </code>
        <p className="mt-2 text-xs opacity-80">
          确认后执行 <code>node .\dist\cli\main.js fqgate install</code>；也可以用
          <code> .\scripts\windows\start-dashboard.cmd -InstallFqgate</code>{" "}
          完成首次安装并启动本机操作台。
        </p>
      </div>
    </Alert>
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
      <CardContent className="flex h-full min-w-0 flex-col justify-between p-4 sm:p-5">
        <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
          <span className="flex items-center gap-2 text-xs font-medium tracking-[0.08em]">
            {icon}
            <span className="truncate">{label}</span>
          </span>
          <span
            className={`h-2 w-2 rounded-full ${tone === "success" ? "bg-emerald-400" : "bg-amber-400"}`}
          />
        </div>
        <div className="mt-7">
          <p className="break-words text-xl font-semibold tracking-tight">{value}</p>
          <p className="mt-1 break-words text-xs text-slate-500 dark:text-slate-400">{detail}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function Metric({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-xs tracking-[0.08em] text-slate-400">{label}</p>
      <p className="mt-2 break-words text-sm font-medium text-slate-800 dark:text-slate-100">
        {value}
      </p>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-10">
      <section>
        <Skeleton className="h-16 w-full max-w-2xl" />
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
    ? "刚刚"
    : date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
}

function capitalize(value: string): string {
  return value.replaceAll("_", " ").replace(/(^|\s)\S/g, (character) => character.toUpperCase());
}

function booleanLabel(value: boolean | null): string {
  return value === null ? "未知" : value ? "是" : "否";
}

function processLabel(value: string): string {
  const labels: Record<string, string> = {
    not_running: "未运行",
    starting: "启动中",
    running: "运行中",
    identity_mismatch: "身份不匹配",
    unknown: "未知",
  };
  return labels[value] ?? capitalize(value);
}

function sessionLabel(value: string): string {
  const labels: Record<string, string> = {
    connected: "已连接",
    guest: "游客状态",
    login_required: "需要登录",
    unknown: "未知",
  };
  return labels[value] ?? capitalize(value);
}

function healthDetail(available: boolean, valid: boolean): string {
  return !available ? "健康接口不可用" : valid ? "响应已验证" : "响应无效";
}

function compatibilityLabel(value: string): string {
  const labels: Record<string, string> = {
    validated: "已验证",
    supported_unvalidated: "待验证",
    unsupported: "不支持",
    pinned_mismatch: "版本不匹配",
    unknown: "未知",
  };
  return labels[value] ?? capitalize(value);
}

function lifecycleLabel(value: string): string {
  const labels: Record<string, string> = {
    not_installed: "未安装",
    stopped: "已停止",
    starting: "启动中",
    ready: "就绪",
    unhealthy: "不健康",
    incompatible: "不兼容",
  };
  return labels[value] ?? capitalize(value);
}

function bridgeStateLabel(value: string): string {
  return value === "ready" ? "就绪" : capitalize(value);
}

function loginMethodLabel(value: string | null): string {
  if (value === null) return "登录状态";
  return value === "formal" ? "正式会话" : value;
}

function qrAvailable(fqgate: BridgeStatusResponse["fqgate"]): boolean {
  return (
    fqgate.lifecycle !== "not_installed" &&
    fqgate.process.running &&
    fqgate.compatibility.validated &&
    fqgate.health.available &&
    fqgate.health.validPayload
  );
}
