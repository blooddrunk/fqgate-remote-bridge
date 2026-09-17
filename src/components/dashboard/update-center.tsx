import {
  AlertTriangle,
  Check,
  CircleAlert,
  Download,
  FileCheck2,
  LockKeyhole,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import type { BridgeUpdateStatusResponse } from "../../bridge/contracts.js";
import { Alert } from "../ui/alert.js";
import { Badge } from "../ui/badge.js";
import { Button } from "../ui/button.js";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card.js";
import { Skeleton } from "../ui/skeleton.js";

export interface UpdateCenterViewProps {
  readonly status: BridgeUpdateStatusResponse | undefined;
  readonly isLoading: boolean;
  readonly error: Error | null | undefined;
  readonly onRefreshStatus: () => void;
  readonly onCheck: () => void;
  readonly isChecking: boolean;
  readonly checkError: Error | null;
  readonly onPreview: () => void;
  readonly isPreviewing: boolean;
  readonly previewError: Error | null;
  readonly onApply: (planId: string) => void;
  readonly isApplying: boolean;
  readonly applyError: Error | null;
  readonly isRemoteHuman?: boolean;
  readonly contextReady?: boolean;
}

export function UpdateCenterView({
  status,
  isLoading,
  error,
  onRefreshStatus,
  onCheck,
  isChecking,
  checkError,
  onPreview,
  isPreviewing,
  previewError,
  onApply,
  isApplying,
  applyError,
  isRemoteHuman = false,
  contextReady = true,
}: UpdateCenterViewProps) {
  const [confirmedPlanId, setConfirmedPlanId] = useState<string | undefined>();

  if (isLoading && status === undefined) return <UpdateCenterSkeleton />;
  if (status === undefined && error !== null && error !== undefined) {
    return (
      <div className="mx-auto max-w-xl pt-10">
        <Alert tone="danger" className="flex items-start gap-3">
          <CircleAlert className="mt-0.5 shrink-0" size={18} aria-hidden="true" />
          <div className="flex-1">
            <p className="font-semibold">暂时无法读取更新中心</p>
            <p className="mt-1 text-rose-700/80 dark:text-rose-200/80">{error.message}</p>
            <Button className="mt-4" variant="secondary" size="sm" onClick={onRefreshStatus}>
              <RefreshCw size={15} aria-hidden="true" /> 重试
            </Button>
          </div>
        </Alert>
      </div>
    );
  }
  if (status === undefined) return null;

  const plan = status.plan;
  const planCanApply = plan?.action === "install" || plan?.action === "update";
  const confirmed = plan !== undefined && confirmedPlanId === plan.planId;
  const errorMessage = checkError?.message ?? previewError?.message ?? applyError?.message;
  const localMaintenanceEnabled = contextReady && !isRemoteHuman;

  return (
    <div className="space-y-8">
      <section className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
        <div className="max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-600 dark:text-cyan-300">
            Local maintenance
          </p>
          <h1 className="mt-3 text-4xl font-semibold tracking-[-0.04em] text-slate-950 sm:text-5xl dark:text-white">
            FQGate 更新中心
          </h1>
          <p className="mt-4 max-w-xl text-base leading-7 text-slate-600 dark:text-slate-300">
            只在你明确操作后检查、预览和执行安装。每一次候选激活都会经过版本、大小、SHA-256、健康与运行时契约校验。
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" onClick={onRefreshStatus} disabled={isLoading || isApplying}>
            <RefreshCw size={16} aria-hidden="true" /> 刷新状态
          </Button>
          {isRemoteHuman ? (
            <span className="rounded-xl border border-amber-300/70 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-100">
              远程人工访问为只读；更新检查、预览和执行仅限本机维护
            </span>
          ) : (
            <Button
              onClick={onCheck}
              disabled={!localMaintenanceEnabled || isChecking || isApplying}
            >
              <Download size={16} aria-hidden="true" />
              {isChecking ? "检查中…" : "检查更新"}
            </Button>
          )}
        </div>
      </section>

      {errorMessage !== undefined ? (
        <Alert tone="danger" className="flex items-start gap-3">
          <CircleAlert className="mt-0.5 shrink-0" size={18} aria-hidden="true" />
          <div>
            <p className="font-semibold">更新操作未完成</p>
            <p className="mt-1">{errorMessage}</p>
            {applyError !== null ? (
              <p className="mt-2 text-xs opacity-80">
                请重新检查；旧的确认不会复用到新的候选版本。
              </p>
            ) : null}
          </div>
        </Alert>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-label="更新状态概览">
        <SummaryCard
          icon={<FileCheck2 size={18} />}
          label="当前版本"
          value={status.installedVersion ?? "未安装"}
          detail={lifecycleLabel(status.lifecycle)}
          tone={status.installedVersion === null ? "warning" : "success"}
        />
        <SummaryCard
          icon={<ShieldCheck size={18} />}
          label="兼容性"
          value={compatibilityLabel(status.compatibility?.status)}
          detail={status.compatibility?.reason ?? "尚未建立兼容性观察"}
          tone={status.compatibility?.validated === true ? "success" : "warning"}
        />
        <SummaryCard
          icon={<LockKeyhole size={18} />}
          label="固定可信源"
          value={status.releaseSource.id}
          detail="GitHub 官方固定仓库"
          tone="info"
        />
        <SummaryCard
          icon={<RotateCcw size={18} />}
          label="事务"
          value={transactionLabel(status.transaction.state)}
          detail={status.transaction.targetVersion ?? "没有进行中的更新"}
          tone={status.transaction.state === "failed" ? "danger" : "info"}
        />
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
        <Card>
          <CardHeader className="flex-row items-start justify-between">
            <div>
              <CardTitle>安装计划 / 预览</CardTitle>
              <CardDescription className="mt-1">
                计划会绑定候选版本与校验信息；确认前如果候选发生变化，旧计划会失效。
              </CardDescription>
            </div>
            <Badge tone={planCanApply ? "warning" : "neutral"}>
              {plan === undefined ? "未生成" : actionLabel(plan.action)}
            </Badge>
          </CardHeader>
          <CardContent>
            {plan === undefined ? (
              isRemoteHuman ? (
                <Alert tone="neutral">
                  远程仅允许查看 updates.status。更新 check / plan / apply 必须通过 127.0.0.1
                  的本机维护访问执行。
                </Alert>
              ) : (
                <EmptyPlan />
              )
            ) : (
              <div className="space-y-5">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Metric label="候选版本" value={`FQGate ${plan.targetVersion}`} />
                  <Metric label="已安装版本" value={plan.installedVersion ?? "未安装"} />
                  <Metric label="文件" value={plan.package.fileName} />
                  <Metric label="文件大小" value={formatBytes(plan.package.size)} />
                </div>
                <div className="rounded-2xl border border-slate-200/80 bg-slate-50/80 p-4 text-sm dark:border-white/[0.08] dark:bg-white/[0.035]">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                    SHA-256
                  </p>
                  <code className="mt-2 block break-all text-xs leading-5 text-slate-700 dark:text-slate-200">
                    {plan.package.sha256}
                  </code>
                </div>
                <div className="flex items-start gap-3 text-sm leading-6 text-slate-600 dark:text-slate-300">
                  {plan.compatibility.validated ? (
                    <Check
                      className="mt-1 shrink-0 text-emerald-500"
                      size={17}
                      aria-hidden="true"
                    />
                  ) : (
                    <AlertTriangle
                      className="mt-1 shrink-0 text-amber-500"
                      size={17}
                      aria-hidden="true"
                    />
                  )}
                  <span>{plan.reason}</span>
                </div>
                {isRemoteHuman ? (
                  <Alert tone="neutral">
                    远程仅允许查看 updates.status。更新 check / plan / apply 必须通过 127.0.0.1
                    的本机维护访问执行。
                  </Alert>
                ) : planCanApply ? (
                  <div className="space-y-4 rounded-2xl border border-amber-200 bg-amber-50/80 p-4 text-sm text-amber-900 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-100">
                    <label className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        className="mt-1 h-4 w-4 accent-cyan-400"
                        checked={confirmed}
                        onChange={(event) =>
                          setConfirmedPlanId(event.target.checked ? plan.planId : undefined)
                        }
                        disabled={isApplying}
                      />
                      <span>
                        我已确认候选版本、文件大小和 SHA-256，并允许桥接停止/重启
                        FQGate。登录会话可能需要恢复。
                      </span>
                    </label>
                    <div className="flex flex-wrap items-center gap-3">
                      <Button
                        variant="primary"
                        onClick={() => onApply(plan.planId)}
                        disabled={
                          !confirmed || isApplying || status.transaction.state === "applying"
                        }
                      >
                        <ShieldCheck size={16} aria-hidden="true" />
                        {isApplying ? "正在执行…" : "确认安装 / 升级"}
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={onPreview}
                        disabled={isPreviewing || isApplying}
                      >
                        {isPreviewing ? "生成中…" : "重新生成预览"}
                      </Button>
                    </div>
                    <p className="text-xs opacity-80">
                      {isApplying
                        ? "正在执行生命周期事务；当前没有可用的字节级进度，因此不显示虚假百分比。"
                        : `计划身份：${plan.planId}`}
                    </p>
                  </div>
                ) : plan.action === "blocked" ? (
                  <Alert tone="warning">当前候选被兼容性策略阻止，不能确认安装。</Alert>
                ) : (
                  <Alert tone="success">当前受管文件与固定可信源候选一致，无需执行更新。</Alert>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>最近一次主动检查</CardTitle>
              <CardDescription className="mt-1">
                页面加载和桥接启动不会触发发布源检查。
              </CardDescription>
            </CardHeader>
            <CardContent>
              {status.lastCheck === undefined ? (
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  尚未检查。点击“检查更新”开始。
                </p>
              ) : (
                <div className="space-y-3 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-slate-500 dark:text-slate-400">结果</span>
                    <Badge tone={status.lastCheck.result === "failed" ? "danger" : "info"}>
                      {checkLabel(status.lastCheck.result)}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-slate-500 dark:text-slate-400">时间</span>
                    <span>{formatTimestamp(status.lastCheck.checkedAt)}</span>
                  </div>
                  {status.lastCheck.message !== undefined ? (
                    <p className="text-xs leading-5 text-slate-500 dark:text-slate-400">
                      {status.lastCheck.message}
                    </p>
                  ) : null}
                </div>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>事务与回滚摘要</CardTitle>
              <CardDescription className="mt-1">
                只展示受限的非敏感状态，不保存下载内容。
              </CardDescription>
            </CardHeader>
            <CardContent>
              {status.lastResult === undefined ? (
                <p className="text-sm text-slate-500 dark:text-slate-400">暂无安装/升级结果。</p>
              ) : (
                <div className="space-y-2 text-sm">
                  <p className="font-medium">{resultLabel(status.lastResult.outcome)}</p>
                  <p className="text-slate-500 dark:text-slate-400">
                    {status.lastResult.targetVersion} ·{" "}
                    {formatTimestamp(status.lastResult.completedAt)}
                  </p>
                  {status.lastResult.message !== undefined ? (
                    <p className="text-xs leading-5 text-slate-500 dark:text-slate-400">
                      {status.lastResult.message}
                    </p>
                  ) : null}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </section>

      <Alert tone="neutral">
        <p className="font-semibold">CLI 兜底</p>
        <p className="mt-1 leading-6">
          {isRemoteHuman
            ? "远程页面不提供维护命令；请在 Bridge 所在 Windows 主机的本机回环环境执行维护。"
            : "如需在 Dashboard 不可用时操作，可运行"}
          {!isRemoteHuman ? (
            <>
              <code className="mx-1 rounded bg-black/5 px-1.5 py-0.5 text-xs dark:bg-white/10">
                node .\dist\cli\main.js fqgate update --check
              </code>
              或使用
              <code className="mx-1 rounded bg-black/5 px-1.5 py-0.5 text-xs dark:bg-white/10">
                fqgate update --apply --dry-run
              </code>
              预览。GitHub 是当前唯一启用的固定可信源；本页面没有任意 URL 输入框。
            </>
          ) : null}
        </p>
      </Alert>
    </div>
  );
}

function SummaryCard({
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
  readonly tone: "success" | "warning" | "danger" | "info";
}) {
  return (
    <Card className="min-h-36">
      <CardContent className="flex h-full flex-col justify-between p-5">
        <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
          <span className="flex items-center gap-2 text-xs font-medium tracking-[0.08em]">
            {icon}
            {label}
          </span>
          <span
            className={`h-2 w-2 rounded-full ${tone === "success" ? "bg-emerald-400" : tone === "danger" ? "bg-rose-400" : tone === "warning" ? "bg-amber-400" : "bg-cyan-400"}`}
          />
        </div>
        <div className="mt-6 min-w-0">
          <p className="truncate text-lg font-semibold tracking-tight">{value}</p>
          <p className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">{detail}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function Metric({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-xs tracking-[0.08em] text-slate-400">{label}</p>
      <p className="mt-2 truncate text-sm font-medium text-slate-800 dark:text-slate-100">
        {value}
      </p>
    </div>
  );
}

function EmptyPlan() {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300/80 p-6 text-sm leading-6 text-slate-500 dark:border-white/15 dark:text-slate-400">
      还没有候选安装计划。请先点击“检查更新”；检查结果会在这里显示版本、大小、SHA-256
      和兼容性阻断原因。
    </div>
  );
}

function UpdateCenterSkeleton() {
  return (
    <div className="space-y-8">
      <Skeleton className="h-44 w-full" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton className="h-36" key={index} />
        ))}
      </div>
      <Skeleton className="h-[32rem] w-full" />
    </div>
  );
}

function formatBytes(value: number): string {
  if (value < 1_024) return `${value} B`;
  if (value < 1_024 * 1_024) return `${(value / 1_024).toFixed(1)} KiB`;
  return `${(value / (1_024 * 1_024)).toFixed(2)} MiB`;
}

function formatTimestamp(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.valueOf())
    ? value
    : date.toLocaleString("zh-CN", { dateStyle: "short", timeStyle: "short" });
}

function compatibilityLabel(value: string | undefined): string {
  const labels: Record<string, string> = {
    validated: "已验证",
    supported_unvalidated: "待验证",
    unsupported: "不支持",
    pinned_mismatch: "版本不匹配",
  };
  return value === undefined ? "未知" : (labels[value] ?? value);
}

function lifecycleLabel(value: string): string {
  const labels: Record<string, string> = {
    not_installed: "未安装",
    stopped: "已停止",
    starting: "启动中",
    ready: "运行就绪",
    unhealthy: "健康检查异常",
    incompatible: "不兼容",
  };
  return labels[value] ?? value;
}

function actionLabel(value: string): string {
  const labels: Record<string, string> = {
    install: "待安装",
    update: "待升级",
    noop: "无需更新",
    blocked: "已阻断",
  };
  return labels[value] ?? value;
}

function transactionLabel(value: string): string {
  const labels: Record<string, string> = {
    idle: "空闲",
    applying: "执行中",
    succeeded: "成功",
    failed: "失败",
    rolled_back: "已回滚",
  };
  return labels[value] ?? value;
}

function checkLabel(value: string): string {
  const labels: Record<string, string> = {
    no_update: "当前最新",
    available: "有可用版本",
    blocked: "候选被阻断",
    failed: "检查失败",
  };
  return labels[value] ?? value;
}

function resultLabel(value: string): string {
  const labels: Record<string, string> = {
    installed: "安装完成",
    updated: "升级完成",
    noop: "无需更新",
    failed: "更新失败",
    rolled_back: "更新失败，已回滚到 known-good",
  };
  return labels[value] ?? value;
}
