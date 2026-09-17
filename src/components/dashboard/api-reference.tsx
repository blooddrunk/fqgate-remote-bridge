import {
  BookOpen,
  CheckCircle2,
  CircleAlert,
  GitCompareArrows,
  RefreshCw,
  Shield,
} from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import type { BridgeOpenApiCatalogResponse } from "../../bridge/contracts.js";
import type { OpenApiOperation } from "../../fqgate/openapi/types.js";
import { Alert } from "../ui/alert.js";
import { Badge } from "../ui/badge.js";
import { Button } from "../ui/button.js";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card.js";
import { Skeleton } from "../ui/skeleton.js";

type ReferenceTab = "upstream" | "bridge" | "compatibility";

export interface ApiReferenceViewProps {
  readonly catalog: BridgeOpenApiCatalogResponse | undefined;
  readonly isLoading: boolean;
  readonly error: Error | null | undefined;
  readonly onRefresh: () => void;
  readonly isRefreshing: boolean;
  readonly refreshError: Error | null;
}

export function ApiReferenceView({
  catalog,
  isLoading,
  error,
  onRefresh,
  isRefreshing,
  refreshError,
}: ApiReferenceViewProps) {
  const [tab, setTab] = useState<ReferenceTab>("upstream");
  const [search, setSearch] = useState("");
  const filteredUpstream = useMemo(() => {
    if (catalog === undefined) return [];
    const query = search.trim().toLowerCase();
    if (query.length === 0) return catalog.snapshot.operations;
    return catalog.snapshot.operations.filter((operation) =>
      [operation.key, operation.operationId, operation.summary, ...operation.tags]
        .filter((value): value is string => value !== undefined)
        .some((value) => value.toLowerCase().includes(query)),
    );
  }, [catalog, search]);

  if (isLoading && catalog === undefined) return <ApiReferenceSkeleton />;
  if (catalog === undefined && error !== null && error !== undefined) {
    return (
      <div className="mx-auto max-w-xl pt-10">
        <Alert tone="danger" className="flex items-start gap-3">
          <CircleAlert className="mt-0.5 shrink-0" size={18} aria-hidden="true" />
          <div className="flex-1">
            <p className="font-semibold">暂时无法读取 FQGate Runtime OpenAPI</p>
            <p className="mt-1">{error.message}</p>
            <Button className="mt-4" variant="secondary" size="sm" onClick={onRefresh}>
              <RefreshCw size={15} aria-hidden="true" /> 重试
            </Button>
          </div>
        </Alert>
      </div>
    );
  }
  if (catalog === undefined) return null;

  const upstreamOnlyKeys = new Set(
    catalog.upstreamOnlyOperations.map((operation) => operation.key),
  );

  return (
    <div className="space-y-8">
      <section className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
        <div className="max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-indigo-600 dark:text-indigo-300">
            Runtime contract
          </p>
          <h1 className="mt-3 text-4xl font-semibold tracking-[-0.04em] text-slate-950 sm:text-5xl dark:text-white">
            API Reference
          </h1>
          <p className="mt-4 max-w-xl text-base leading-7 text-slate-600 dark:text-slate-300">
            运行中的 FQGate OpenAPI 是上游接口描述的动态来源；Bridge operation registry
            才是授权边界。
          </p>
        </div>
        <Button variant="secondary" onClick={onRefresh} disabled={isRefreshing}>
          <RefreshCw size={16} aria-hidden="true" />
          {isRefreshing ? "刷新中…" : "刷新 Runtime OpenAPI"}
        </Button>
      </section>

      {refreshError !== null ? (
        <Alert tone="danger" className="flex items-start gap-3">
          <CircleAlert className="mt-0.5 shrink-0" size={18} aria-hidden="true" />
          <div>
            <p className="font-semibold">Runtime OpenAPI 刷新失败</p>
            <p className="mt-1">{refreshError.message}</p>
          </div>
        </Alert>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-label="OpenAPI 观察摘要">
        <Summary
          label="OpenAPI"
          value={catalog.snapshot.openapiVersion}
          detail={catalog.snapshot.info.title}
        />
        <Summary
          label="FQGate API 版本"
          value={catalog.snapshot.info.version}
          detail={`${catalog.snapshot.operations.length} 个 operation`}
        />
        <Summary
          label="Schema fingerprint"
          value={catalog.snapshot.fingerprint.slice(0, 12)}
          detail="SHA-256 · 当前运行时观察"
        />
        <Summary
          label="Required contracts"
          value={`${catalog.contractCoverage.required.length - catalog.contractCoverage.missing.length}/${catalog.contractCoverage.required.length}`}
          detail={catalog.contractCoverage.missing.length === 0 ? "全部存在" : "存在缺失契约"}
        />
      </section>

      <Card>
        <CardContent className="p-2">
          <div className="flex flex-wrap gap-1" role="tablist" aria-label="API Reference 视图">
            <TabButton active={tab === "upstream"} onClick={() => setTab("upstream")}>
              <BookOpen size={15} aria-hidden="true" /> Upstream FQGate Reference
            </TabButton>
            <TabButton active={tab === "bridge"} onClick={() => setTab("bridge")}>
              <Shield size={15} aria-hidden="true" /> Bridge API
            </TabButton>
            <TabButton active={tab === "compatibility"} onClick={() => setTab("compatibility")}>
              <GitCompareArrows size={15} aria-hidden="true" /> Compatibility / Changes
            </TabButton>
          </div>
        </CardContent>
      </Card>

      {tab === "upstream" ? (
        <section className="space-y-4" aria-label="Upstream FQGate Reference">
          <Card>
            <CardHeader>
              <CardTitle>Upstream FQGate Reference</CardTitle>
              <CardDescription className="mt-1">
                来自固定本机地址 <code>127.0.0.1:17281/openapi.json</code> 的完整有效
                catalog。这里仅供参考，不提供 raw upstream Try it out。
              </CardDescription>
              <div className="mt-4">
                <label className="sr-only" htmlFor="operation-search">
                  搜索上游 operation
                </label>
                <input
                  id="operation-search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="搜索路径、operationId、tag…"
                  className="h-10 w-full rounded-xl border border-slate-200 bg-white/70 px-3 text-sm outline-none ring-cyan-400 placeholder:text-slate-400 focus:ring-2 dark:border-white/10 dark:bg-white/[0.05] dark:text-white"
                />
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {filteredUpstream.map((operation) => (
                  <OperationRow
                    key={operation.key}
                    operation={operation}
                    approved={!upstreamOnlyKeys.has(operation.key)}
                  />
                ))}
                {filteredUpstream.length === 0 ? (
                  <p className="py-6 text-center text-sm text-slate-500 dark:text-slate-400">
                    没有匹配的 operation。
                  </p>
                ) : null}
              </div>
            </CardContent>
          </Card>
        </section>
      ) : null}

      {tab === "bridge" ? (
        <section aria-label="Bridge API">
          <Card>
            <CardHeader>
              <CardTitle>Bridge API</CardTitle>
              <CardDescription className="mt-1">
                仅显示代码中显式注册、经过策略审查的 Bridge
                operation。上游新接口不会自动出现在这里，也不会自动获得调用权。
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 md:grid-cols-2">
                {catalog.bridgeOperations.map((operation) => (
                  <div
                    className="rounded-2xl border border-slate-200/80 bg-slate-50/70 p-4 dark:border-white/[0.08] dark:bg-white/[0.035]"
                    key={operation.id}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-mono text-xs font-semibold text-cyan-700 dark:text-cyan-300">
                          {operation.id}
                        </p>
                        <p className="mt-2 font-mono text-sm font-medium">
                          {operation.method} {operation.path}
                        </p>
                      </div>
                      <Badge tone="success">已注册</Badge>
                    </div>
                    <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                      {operation.upstream === undefined
                        ? "Bridge-owned operation"
                        : `映射上游：${operation.upstream.method} ${operation.upstream.path}`}
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </section>
      ) : null}

      {tab === "compatibility" ? (
        <section
          className="grid gap-4 lg:grid-cols-[1fr_1fr]"
          aria-label="Compatibility and changes"
        >
          <Card>
            <CardHeader>
              <CardTitle>Required Bridge contracts</CardTitle>
              <CardDescription className="mt-1">
                activation 只要求 Bridge 依赖的契约存在，不要求上游接口整体完全不变。
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {catalog.contractCoverage.required.map((contract) => {
                const missing = catalog.contractCoverage.missing.some(
                  (item) => item.id === contract.id,
                );
                return (
                  <div
                    className="flex items-start gap-3 rounded-xl border border-slate-200/70 p-3 text-sm dark:border-white/[0.08]"
                    key={contract.id}
                  >
                    {missing ? (
                      <CircleAlert
                        className="mt-0.5 shrink-0 text-amber-500"
                        size={16}
                        aria-hidden="true"
                      />
                    ) : (
                      <CheckCircle2
                        className="mt-0.5 shrink-0 text-emerald-500"
                        size={16}
                        aria-hidden="true"
                      />
                    )}
                    <div className="min-w-0">
                      <p className="font-mono text-xs">
                        {contract.method} {contract.path}
                      </p>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        {missing ? "缺失 · activation fail closed" : "存在"}
                      </p>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Schema changes</CardTitle>
              <CardDescription className="mt-1">
                当前 fingerprint：{catalog.snapshot.fingerprint}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <ChangeGroup
                label="Added"
                operations={catalog.snapshot.changes.added}
                tone="success"
              />
              <ChangeGroup
                label="Removed"
                operations={catalog.snapshot.changes.removed}
                tone="danger"
              />
              <ChangeGroup
                label="Changed"
                operations={catalog.snapshot.changes.changed}
                tone="warning"
              />
              <p className="border-t border-slate-200/70 pt-4 text-xs leading-5 text-slate-500 dark:border-white/[0.08] dark:text-slate-400">
                {catalog.note} “Appears in FQGate” 不等于“可通过 Bridge
                调用”，也不等于“可远程调用”。
              </p>
            </CardContent>
          </Card>
        </section>
      ) : null}
    </div>
  );
}

function Summary({
  label,
  value,
  detail,
}: {
  readonly label: string;
  readonly value: string;
  readonly detail: string;
}) {
  return (
    <Card className="min-h-32">
      <CardContent className="flex h-full flex-col justify-between p-5">
        <p className="text-xs font-medium tracking-[0.08em] text-slate-500 dark:text-slate-400">
          {label}
        </p>
        <div className="mt-5 min-w-0">
          <p className="truncate text-lg font-semibold">{value}</p>
          <p className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">{detail}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  readonly active: boolean;
  readonly onClick: () => void;
  readonly children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-cyan-400 ${active ? "bg-slate-900 text-white dark:bg-white dark:text-slate-950" : "text-slate-600 hover:bg-slate-900/5 dark:text-slate-300 dark:hover:bg-white/[0.08]"}`}
    >
      {children}
    </button>
  );
}

function OperationRow({
  operation,
  approved,
}: {
  readonly operation: OpenApiOperation;
  readonly approved: boolean;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-slate-200/70 p-4 sm:flex-row sm:items-center sm:justify-between dark:border-white/[0.08]">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-md bg-slate-900 px-2 py-1 font-mono text-[11px] font-semibold text-white dark:bg-white dark:text-slate-950">
            {operation.method}
          </span>
          <code className="break-all text-sm font-medium">{operation.path}</code>
          {operation.deprecated ? <Badge tone="warning">deprecated</Badge> : null}
        </div>
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
          {operation.operationId ?? "无 operationId"}
          {operation.summary === undefined ? "" : ` · ${operation.summary}`}
        </p>
      </div>
      <Badge tone={approved ? "success" : "warning"}>
        {approved ? "Bridge 已有映射" : "仅上游参考"}
      </Badge>
    </div>
  );
}

function ChangeGroup({
  label,
  operations,
  tone,
}: {
  readonly label: string;
  readonly operations: readonly OpenApiOperation[];
  readonly tone: "success" | "danger" | "warning";
}) {
  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <span className="font-medium">{label}</span>
        <Badge tone={tone}>{String(operations.length)}</Badge>
      </div>
      {operations.length > 0 ? (
        <div className="mt-2 max-h-32 space-y-1 overflow-y-auto rounded-xl bg-slate-50/80 p-2 font-mono text-xs dark:bg-white/[0.035]">
          {operations.map((operation) => (
            <p key={operation.key}>{operation.key}</p>
          ))}
        </div>
      ) : (
        <p className="mt-1 text-xs text-slate-400">无</p>
      )}
    </div>
  );
}

function ApiReferenceSkeleton() {
  return (
    <div className="space-y-8">
      <Skeleton className="h-44 w-full" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton className="h-32" key={index} />
        ))}
      </div>
      <Skeleton className="h-96 w-full" />
    </div>
  );
}
