# Agent 工作约定

这份文档是给编码 Agent 的快速交接说明。规范性约束仍以根目录 `AGENTS.md`、当前任务包和项目安全文档为准；如果内容冲突，以它们为准。

## 当前状态

- Phase 0：已关闭。
- Phase 1：已关闭，并已验证 Windows x64 生命周期、校验和、回滚和健康检查。
- Phase 2：已关闭，并已在目标 Windows x64 主机完成真实 QR begin/poll/scan。
- Phase 3：已关闭，本地升级中心、Runtime OpenAPI/API Reference 和目标 Windows x64 安全验收均完成。
- Phase 4：**已 CLOSED**，已通过真实 Windows x64 + Cloudflare 验收；后续任务仍不得顺手实现 Phase 5+。

当前 Phase 4 仍要求：Bridge 固定 `127.0.0.1:17282`，FQGate 固定 `127.0.0.1:17281`。Cloudflare 只能通过 `cloudflared` 连接 Bridge，不能直连 FQGate。

## Phase 4 最重要的边界

Tunnel 不等于“整个本地控制面都能远程调用”。Bridge 必须显式区分 local 与 remote-human operation。

Phase 4 计划允许远程 human 使用：

```text
bridge.version
bridge.capabilities
bridge.status
session.qr.begin
session.qr.poll
updates.status
openapi.catalog
```

继续 local-only：

```text
updates.check
updates.plan
updates.apply
openapi.refresh
```

服务器端 policy 是最终授权边界，不能只靠前端隐藏按钮。

远程请求上下文：

- 只接受明确配置的 remote hostname；
- 不信任 `X-Forwarded-Host` 之类转发头来决定权限；
- unknown Host fail closed；
- remote hostname 请求必须包含预期的 Cloudflare Access assertion；
- assertion 内容不得进入日志；
- Cloudflare published application 应启用 **Protect with Access**，由 cloudflared 验证 Access JWT 后再转发。

## cloudflared / Tunnel 约定

Phase 4 使用预先创建的 remotely-managed Tunnel，不通过 Cloudflare API 自动创建资源。自动 provisioning 属于 Phase 6。

- cloudflared 只能从固定官方 Cloudflare 来源下载；禁止任意 binary URL。
- 校验官方发布身份和可用的 integrity/SHA-256 信息。
- 安装/升级必须显式触发，不实现后台自动更新。
- Windows service origin 固定到 `http://127.0.0.1:17282`。
- Tunnel token 使用 repo 外、受 Windows ACL 保护的 token file。
- 推荐 service runtime：`cloudflared tunnel run --token-file <protected-token-file>`。
- raw token 不得出现在 Windows service command line、config、日志、诊断、UI、浏览器存储、测试 fixture 或 Git 中。
- token file 无法正确保护时必须阻止启动/重配置。

## 本地 FQGate 安装、启动与升级基线

- FQGate 安装不是隐式行为；用户先 dry-run 再明确执行。
- 推荐 Windows 用户使用 `scripts/windows/start-dashboard.cmd`。
- Windows 重启后需要在交互式用户会话再次启动 FQGate/Bridge；cloudflared 服务单独显示 Running 不代表 `127.0.0.1:17282` origin 已就绪。
- CLI 和 Dashboard 更新共用 lifecycle/update application service。
- GitHub 仍是启用的固定可信 FQGate release source；Gitee 未启用。
- API Reference 使用固定 `127.0.0.1:17281/openapi.json`，reference-only，不提供 raw upstream Try it out。

## 开始工作前

按顺序阅读：

1. `README.md`
2. `AGENTS.md`
3. `docs/architecture.md`
4. `docs/security.md`
5. `docs/upstream-contracts.md`
6. `docs/roadmap.md`
7. `docs/tasks/phase-4-cloudflare-tunnel-access.md`
8. `docs/plans/phase-4-secure-remote-human-access.md`
9. `docs/status/phase-3-implementation-handoff.md`
10. `docs/operations/windows-phase-3-acceptance.md`
11. 本文

随后再检查实际代码：operation registry、HTTP transport、TanStack routes/components、config、Windows scripts 和测试。

## 不可突破的边界

- 不添加 catch-all reverse proxy，不接受任意 FQGate path。
- 不开放 Bridge/FQGate LAN/WAN listener。
- 不添加交易、下单、撤单、转账、券商控制或其他改变金融状态的接口。
- 不在 Phase 4 增加 remote machine market-data API 或 Access service-token auth。
- 不在 Phase 4 自动创建 Tunnel/DNS/Access，不请求 Global API Key。
- 不提前实现 supervisor/notifications、automatic updates、MCP/WebSocket 或最终 packaging。
- FQGate 兼容性未知时 fail closed。
- QR、upstream flow_id、完整 sessionId、Access assertion、Tunnel token、cookies 和 credentials 不得进入日志或持久存储。

## 代码分层

- `src/fqgate`：FQGate 上游版本、进程、健康、OpenAPI 与协议适配。
- `src/bridge`：operation policy、request context、错误归一化、QR 和远程暴露授权。
- 新增 cloudflared 核心逻辑应保持框架无关；Windows service/ACL 细节放窄层 integration 中。
- `src/routes`、`src/components`：薄 TanStack transport/UI，不拥有授权和 secret handling。
- `scripts/windows`：Windows 启动/验收/系统集成入口，不复制 TypeScript 核心业务逻辑。

Phase 4 当前代码入口：

- `src/bridge/policy/request-context.ts`：Host 分类、Access assertion presence 和 remote-human exposure gate；
- `src/cloudflared/`：固定 Cloudflare release source/integrity、候选激活、token-file 和 Windows service 适配；
- `src/cli/main.ts`：显式 `cloudflared release/install/status` 与 `cloudflared service ...` 命令；
- `scripts/windows/acceptance.ps1 -VerifyPhase4`：安全 loopback/service/Access 验收工具，不自动创建 Cloudflare 资源。

配置使用 `remoteAccess.remoteHostname` 和 `cloudflared.tokenFile`。token-file
必须是 repo 外绝对路径；运行时只报告安全状态，不返回文件内容。默认/强制
origin 是 `http://127.0.0.1:17282`。

## 本地检查

```text
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm format:check
pnpm test:e2e
```

Phase 4 的 normal CI 不得依赖真实 Cloudflare credentials。

## Phase 4 Windows 验收

实现时新增/维护 `docs/operations/windows-phase-4-acceptance.md` 和相应 acceptance mode。

真实 closure 至少要证明：

- FQGate/Bridge 仍只有 loopback listener；
- cloudflared Windows service 正常；
- raw Tunnel token 不在 service/process command；
- token-file ACL 安全；
- unauthenticated public access 被 Access 拒绝/挑战；
- authenticated human Dashboard/status 可用；
- QR begin/poll 在安全条件下可用；
- remote update check/plan/apply 与 OpenAPI refresh 被拒绝；
- raw/unregistered FQGate path 仍不可达；
- local maintenance 仍可通过 loopback 使用；
- cloudflared service restart 后能恢复连接。

本次实现的 deterministic 和质量门禁结果、真实环境证据与 closure 记录统一在
`docs/status/phase-4-implementation-handoff.md` 和
`docs/operations/windows-phase-4-acceptance.md`。Phase 4 已 CLOSED；若未来
修改远程管理员边界，必须作为独立规划/任务重新评审，不得隐式扩大现有 remote-human 策略。

## Phase 4 历史 Codex handoff

```text
docs/prompts/phase-4-codex-goal.md
```

Phase 4 已完成并关闭。未来如需继续工作，应先为下一阶段建立新的任务包；不能把下面的历史入口当作活动任务：

```text
Phase 4 已按 `docs/prompts/phase-4-codex-goal.md` 完成并关闭。后续任务必须继续保持
FQGate/Bridge loopback-only、现有 remote-human operation 边界和 token-file 秘密处理；远程管理员强化策略与移动端 Dashboard UI 优化只能作为新的规划任务，不得在未评审时混入 Phase 5+。
```
