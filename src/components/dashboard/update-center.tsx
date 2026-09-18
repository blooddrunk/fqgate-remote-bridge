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
import type { BridgeRequestContext } from "../../bridge/policy/request-context.js";
import type {
  BridgeUpdateStatusResponse,
  UpdateApplyConfirmationResponse,
} from "../../bridge/contracts.js";
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
  readonly onPrepareApply: (planId: string) => void;
  readonly isPreparingApply: boolean;
  readonly prepareError: Error | null;
  readonly confirmation: UpdateApplyConfirmationResponse | undefined;
  readonly onApply: (planId: string, confirmationGrant?: string) => void;
  readonly isApplying: boolean;
  readonly applyError: Error | null;
  readonly isRemoteHuman?: boolean;
  readonly isRemoteAdmin?: boolean;
  readonly requestContext: BridgeRequestContext | undefined;
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
  onPrepareApply,
  isPreparingApply,
  prepareError,
  confirmation,
  onApply,
  isApplying,
  applyError,
  isRemoteHuman = false,
  isRemoteAdmin = false,
  requestContext,
  contextReady = true,
}: UpdateCenterViewProps) {
  const [confirmedPlanId, setConfirmedPlanId] = useState<string | undefined>();
  const [finalConfirmedPlanId, setFinalConfirmedPlanId] = useState<string | undefined>();

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
  const finalConfirmed = plan !== undefined && finalConfirmedPlanId === plan.planId;
  const confirmationMatches =
    plan !== undefined &&
    confirmation?.operationId === "updates.apply" &&
    confirmation.planId === plan.planId &&
    confirmation.candidateId === plan.candidateId;
  const errorMessage =
    checkError?.message ?? previewError?.message ?? prepareError?.message ?? applyError?.message;
  const localMaintenanceEnabled = contextReady && !isRemoteHuman && !isRemoteAdmin;
  const remoteAdminMaintenanceEnabled = contextReady && isRemoteAdmin;

  return (
    <div className="min-w-0 space-y-7 sm:space-y-8">
      <section className="flex min-w-0 flex-col justify-between gap-5 md:flex-row md:items-end">
        <div className="max-w-2xl">
          {isRemoteAdmin ? (
            <Badge tone="warning">
              <ShieldCheck size={13} aria-hidden="true" /> 远程管理员 · 强认证维护上下文
            </Badge>
          ) : (
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-600 dark:text-cyan-300">
              Local maintenance
            </p>
          )}
          <h1 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-slate-950 sm:text-5xl dark:text-white">
            FQGate 更新中心
          </h1>
          <p className="mt-4 max-w-xl text-base leading-7 text-slate-600 dark:text-slate-300">
            只在你明确操作后检查、预览和执行安装。每一次候选激活都会经过版本、大小、SHA-256、健康与运行时契约校验。
          </p>
        </div>
        <div className="flex w-full flex-col items-stretch gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center">
          <Button
            variant="secondary"
            className="w-full sm:w-auto"
            onClick={onRefreshStatus}
            disabled={isLoading || isApplying}
          >
            <RefreshCw size={16} aria-hidden="true" /> 刷新状态
          </Button>
          {isRemoteHuman ? (
            <span className="rounded-xl border border-amber-300/70 bg-amber-50 px-3 py-2 text-xs font-medium leading-5 text-amber-900 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-100">
              远程人工访问为只读；更新检查、预览和执行仅限本机维护
            </span>
          ) : (
            <Button
              className="w-full sm:w-auto"
              onClick={onCheck}
              disabled={
                (!localMaintenanceEnabled && !remoteAdminMaintenanceEnabled) ||
                isChecking ||
                isApplying
              }
            >
              <Download size={16} aria-hidden="true" />
              {isChecking ? "检查中…" : isRemoteAdmin ? "管理员检查更新" : "检查更新"}
            </Button>
          )}
        </div>
      </section>

      {isRemoteAdmin ? (
        <Alert tone="warning" aria-label="远程管理员上下文">
          <p className="font-semibold">当前上下文：{contextLabel(requestContext)}</p>
          <p className="mt-1 leading-6">
            已通过独立管理员 Cloudflare Access 应用进入。每次远程 apply
            都必须重新核对候选并取得一次性确认；此页面不提供 Tunnel、进程或其他控制面操作。
          </p>
        </Alert>
      ) : null}

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

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="更新状态概览">
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

      <section className="grid min-w-0 gap-4 lg:grid-cols-[1.15fr_0.85fr]">
        <Card>
          <CardHeader className="min-w-0 flex-col items-start justify-between gap-3 sm:flex-row">
            <div className="min-w-0">
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
                <div className="grid min-w-0 gap-4 sm:grid-cols-2">
                  <Metric label="候选版本" value={`FQGate ${plan.targetVersion}`} />
                  <Metric label="已安装版本" value={plan.installedVersion ?? "未安装"} />
                  <Metric label="可信源" value={plan.source + " · " + status.releaseSource.id} />
                  <Metric label="候选身份" value={plan.candidateId} />
                  <Metric label="文件" value={plan.package.fileName} />
                  <Metric label="文件大小" value={formatBytes(plan.package.size)} />
                  <Metric label="当前上下文" value={contextLabel(requestContext)} />
                </div>
                <div className="rounded-2xl border border-slate-200/80 bg-slate-50/80 p-4 text-sm dark:border-white/[0.08] dark:bg-white/[0.035]">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                    SHA-256
                  </p>
                  <code className="mt-2 block max-w-full break-all text-xs leading-5 text-slate-700 dark:text-slate-200">
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
                  isRemoteAdmin ? (
                    <AdminApplyControls
                      plan={plan}
                      confirmed={confirmed}
                      finalConfirmed={finalConfirmed}
                      confirmationMatches={confirmationMatches}
                      confirmation={confirmation}
                      isPreparingApply={isPreparingApply}
                      isPreviewing={isPreviewing}
                      isApplying={isApplying}
                      transactionApplying={status.transaction.state === "applying"}
                      onPreview={onPreview}
                      onPrepareApply={onPrepareApply}
                      onApply={onApply}
                      onReviewChange={(checked) =>
                        setConfirmedPlanId(checked ? plan.planId : undefined)
                      }
                      onFinalConfirmChange={(checked) =>
                        setFinalConfirmedPlanId(checked ? plan.planId : undefined)
                      }
                    />
                  ) : (
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
                      <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:flex-wrap sm:items-center">
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
                      <p className="break-all text-xs opacity-80">
                        {isApplying
                          ? "正在执行生命周期事务；当前没有可用的字节级进度，因此不显示虚假百分比。"
                          : `计划身份：${plan.planId}`}
                      </p>
                    </div>
                  )
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
          {isRemoteAdmin
            ? "远程管理员页面不提供本机 CLI、Tunnel 或进程控制；仅可使用上方显式注册的维护操作。"
            : isRemoteHuman
              ? "远程页面不提供维护命令；请在 Bridge 所在 Windows 主机的本机回环环境执行维护。"
              : "如需在 Dashboard 不可用时操作，可运行"}
          {!isRemoteHuman && !isRemoteAdmin ? (
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

function AdminApplyControls({
  plan,
  confirmed,
  finalConfirmed,
  confirmationMatches,
  confirmation,
  isPreparingApply,
  isPreviewing,
  isApplying,
  transactionApplying,
  onPreview,
  onPrepareApply,
  onApply,
  onReviewChange,
  onFinalConfirmChange,
}: {
  readonly plan: NonNullable<BridgeUpdateStatusResponse["plan"]>;
  readonly confirmed: boolean;
  readonly finalConfirmed: boolean;
  readonly confirmationMatches: boolean;
  readonly confirmation: UpdateApplyConfirmationResponse | undefined;
  readonly isPreparingApply: boolean;
  readonly isPreviewing: boolean;
  readonly isApplying: boolean;
  readonly transactionApplying: boolean;
  readonly onPreview: () => void;
  readonly onPrepareApply: (planId: string) => void;
  readonly onApply: (planId: string, confirmationGrant?: string) => void;
  readonly onReviewChange: (checked: boolean) => void;
  readonly onFinalConfirmChange: (checked: boolean) => void;
}) {
  const confirmationActive =
    confirmationMatches &&
    confirmation !== undefined &&
    Date.parse(confirmation.expiresAt) > Date.now();
  return (
    <div className="space-y-4 rounded-2xl border border-amber-200 bg-amber-50/80 p-4 text-sm text-amber-900 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-100">
      <div>
        <p className="font-semibold">远程管理员二阶段执行确认</p>
        <p className="mt-1 leading-6">
          先核对下面的精确候选，再申请只绑定当前管理员、当前计划和当前候选的一次性确认。
          确认凭据只在本次页面内存中短暂使用。
        </p>
      </div>
      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          className="mt-1 h-4 w-4 accent-cyan-400"
          checked={confirmed}
          onChange={(event) => onReviewChange(event.target.checked)}
          disabled={isPreparingApply || isApplying}
        />
        <span>
          我已核对可信源、候选版本、文件大小、SHA-256、兼容性和当前上下文，并允许桥接停止/重启
          FQGate。
        </span>
      </label>
      <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <Button
          variant="secondary"
          onClick={() => onPrepareApply(plan.planId)}
          disabled={!confirmed || isPreparingApply || isApplying || transactionApplying}
        >
          <ShieldCheck size={16} aria-hidden="true" />
          {isPreparingApply ? "申请确认中…" : "申请一次性执行确认"}
        </Button>
        <Button
          variant="secondary"
          onClick={onPreview}
          disabled={isPreviewing || isPreparingApply || isApplying || transactionApplying}
        >
          <RefreshCw size={16} aria-hidden="true" />
          {isPreviewing ? "生成中…" : "重新生成预览"}
        </Button>
      </div>
      {confirmationActive && confirmation !== undefined ? (
        <div className="space-y-3 rounded-2xl border border-emerald-300/70 bg-emerald-50/80 p-4 text-emerald-900 dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-100">
          <p className="font-semibold">一次性确认已准备</p>
          <p className="text-xs leading-5">
            有效期至 {formatTimestamp(confirmation.expiresAt)}；它只可用于本计划的
            <code className="mx-1 break-all">updates.apply</code>，执行一次后立即失效。
          </p>
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4 accent-cyan-400"
              checked={finalConfirmed}
              onChange={(event) => onFinalConfirmChange(event.target.checked)}
              disabled={isApplying}
            />
            <span>我现在确认执行上述精确候选，并接受执行期间的短暂中断。</span>
          </label>
          <Button
            variant="danger"
            onClick={() => onApply(plan.planId, confirmation.confirmationGrant)}
            disabled={!finalConfirmed || isApplying || transactionApplying}
          >
            <ShieldCheck size={16} aria-hidden="true" />
            {isApplying ? "远程执行中…" : "第二次确认并执行"}
          </Button>
        </div>
      ) : (
        <p className="text-xs leading-5 opacity-80">
          勾选核对项后，先申请一次性确认；在确认返回前不会提供可执行的远程 apply。
        </p>
      )}
      <p className="break-all text-xs opacity-80" aria-live="polite">
        {isApplying
          ? "正在执行生命周期事务；当前没有可用的字节级进度，因此不显示虚假百分比。"
          : "计划身份：" + plan.planId + " · 候选身份：" + plan.candidateId}
      </p>
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
      <CardContent className="flex h-full min-w-0 flex-col justify-between p-4 sm:p-5">
        <div className="flex items-center justify-between gap-2 text-slate-500 dark:text-slate-400">
          <span className="flex min-w-0 items-center gap-2 text-xs font-medium tracking-[0.08em]">
            {icon}
            <span className="truncate">{label}</span>
          </span>
          <span
            className={`h-2 w-2 rounded-full ${tone === "success" ? "bg-emerald-400" : tone === "danger" ? "bg-rose-400" : tone === "warning" ? "bg-amber-400" : "bg-cyan-400"}`}
          />
        </div>
        <div className="mt-6 min-w-0">
          <p className="break-words text-lg font-semibold tracking-tight">{value}</p>
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
    <div className="space-y-7 sm:space-y-8">
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

function contextLabel(value: BridgeRequestContext | undefined): string {
  switch (value) {
    case "local":
      return "本机 loopback";
    case "remote_human":
      return "远程人工（只读维护）";
    case "remote_admin":
      return "远程管理员（独立 Access / 强认证）";
    default:
      return "未确认";
  }
}
