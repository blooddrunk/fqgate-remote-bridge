# FQGate Remote Bridge

FQGate Remote Bridge 是运行在 Windows 本机的安全桥接与操作台：FQGate 始终保持本机回环运行，由 Bridge 提供明确、受控的接口和 Dashboard，再逐阶段通过 Cloudflare Tunnel + Access 将需要的能力安全带到远程环境。

当前 **Phase 0–3 已关闭，Phase 4 已正式开启**。Phase 4 只实现“受 Cloudflare Access 保护的远程人工访问”，不会提前开放远程机器行情 API，也不会让 FQGate 或 Bridge 改成 LAN/WAN 监听。

## 当前结论

- FQGate：固定保持 `127.0.0.1:17281`。
- Bridge：生产环境固定保持 IPv4 loopback，默认 `127.0.0.1:17282`。
- Phase 3 已完成本地升级中心、Runtime OpenAPI/API Reference 和目标 Windows x64 验收。
- Phase 4 引入 remotely-managed Cloudflare Tunnel + Cloudflare Access human policy，`cloudflared` 只转发到 Bridge，绝不直接转发到 FQGate。
- Tunnel **不会自动把全部本地操作暴露到远程**。Bridge 会显式区分 local 与 remote-human operation。
- Phase 4 远程允许 Dashboard/status、QR 登录、只读更新状态和 reference-only API Catalog；更新检查/预览/执行、OpenAPI refresh 继续保持 local-only。
- OpenAPI 只负责描述 FQGate 当前“有什么”，不负责授权；新上游路径默认不可调用。
- 不提供下单、撤单、资金划转、券商控制或其他金融状态变更能力。

## 当前与目标架构

当前本地：

```text
浏览器
  -> 127.0.0.1:17282  Bridge / TanStack Dashboard
       -> explicit operation policy
       -> lifecycle / update / OpenAPI / QR services
            -> 127.0.0.1:17281  FQGate
```

Phase 4 目标：

```text
远程浏览器
  -> Cloudflare Access
  -> Cloudflare Tunnel
  -> cloudflared Windows service
  -> 127.0.0.1:17282 Bridge
  -> remote-human exposure policy
  -> FQGate adapters
  -> 127.0.0.1:17281 FQGate
```

不会出现 `cloudflared -> 127.0.0.1:17281`。

## 快速开始（Windows，本地 Phase 3 基线）

需要 Windows x64、Node.js 22+、Git。项目使用锁定 pnpm 版本，优先使用 Corepack：

```powershell
corepack enable
corepack pnpm --version
```

下载与构建：

```powershell
Set-Location "<你的代码目录>"
git clone https://github.com/blooddrunk/fqgate-remote-bridge.git
Set-Location .\fqgate-remote-bridge
corepack pnpm install --frozen-lockfile
corepack pnpm build
```

首次安装 FQGate 先预览：

```powershell
node .\dist\cli\main.js fqgate install --dry-run
```

确认来源、版本、大小、SHA-256 后执行：

```powershell
node .\dist\cli\main.js fqgate install
node .\dist\cli\main.js fqgate status
```

推荐启动方式：

```powershell
.\scripts\windows\start-dashboard.cmd
```

本地页面：

- Dashboard：<http://127.0.0.1:17282/>
- QR 登录：<http://127.0.0.1:17282/login>
- 更新中心：<http://127.0.0.1:17282/updates>
- API Reference：<http://127.0.0.1:17282/api-reference>

## Phase 3 已有更新能力

CLI：

```powershell
node .\dist\cli\main.js fqgate update --check
node .\dist\cli\main.js fqgate update --apply --dry-run
node .\dist\cli\main.js fqgate update --apply
```

Dashboard 与 CLI 共用同一个 lifecycle/update transaction；候选激活会经过大小/SHA-256、版本、兼容性、health、Runtime OpenAPI required contract 与既有语义探针，并保留 known-good rollback。

## Runtime OpenAPI / API Reference

FQGate 本机提供：

```text
http://127.0.0.1:17281/docs
http://127.0.0.1:17281/openapi.json
```

Bridge 使用运行中的 `/openapi.json` 构建 upstream reference，而不是手工复制接口清单：

```text
runtime FQGate /openapi.json
    -> FQGate Reference（描述）

explicit Bridge operation registry
    -> Bridge API（授权）
```

因此“FQGate 文档中出现”不等于“Bridge 可以调用”。

## Phase 4：远程人工访问

Phase 4 的关键不是简单运行 `cloudflared`，而是同时建立三层约束：

1. Cloudflare Access 对远程 human 做身份认证；
2. Tunnel 只连接 `127.0.0.1:17282`；
3. Bridge 根据请求上下文继续执行显式 operation exposure policy。

计划中的 remote-human operation：

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

Tunnel token 使用受保护的 token file，目标 service command 形态为：

```text
cloudflared tunnel run --token-file <protected-token-file>
```

原始 token 不应出现在 Windows service command line、普通配置、日志、诊断、浏览器或仓库中。

Phase 4 使用**预先创建的 remotely-managed Tunnel 和人工 Access policy**。自动通过 Cloudflare API 创建 Tunnel/DNS/Access 属于 Phase 6，不在当前开发范围。

## 当前开发任务

Phase 4 task package：

```text
docs/tasks/phase-4-cloudflare-tunnel-access.md
```

设计：

```text
docs/plans/phase-4-secure-remote-human-access.md
```

Codex goal：

```text
docs/prompts/phase-4-codex-goal.md
```

可直接交给 Codex goal 的入口：

```text
在 https://github.com/blooddrunk/fqgate-remote-bridge 工作。同步最新 main 后，严格按照 AGENTS.md、docs/tasks/phase-4-cloudflare-tunnel-access.md、docs/plans/phase-4-secure-remote-human-access.md 和 docs/prompts/phase-4-codex-goal.md 完整执行 Phase 4。实现 Cloudflare Tunnel + Access 保护下的远程人工 Dashboard/QR/status/reference 访问，同时保持 FQGate 和 Bridge loopback-only，并用显式 local/remote-human operation policy 保证 updates.check/plan/apply 与 openapi.refresh 仍然只能本地调用。使用 remotely-managed Tunnel 和受 Windows ACL 保护的 token file，不在 service command line/日志/配置中暴露 raw token。完成代码、测试、文档和可执行的 Windows 验收；如果没有真实 Cloudflare 资源，不得伪造验收或关闭 Phase 4。不要提前实现 Phase 5+ 的机器行情 API、service-token auth、自动 Cloudflare provisioning、supervisor、自动更新、MCP/WebSocket 或交易能力。
```

## 文档索引

- [Agent 规范](AGENTS.md)
- [架构](docs/architecture.md)
- [安全模型](docs/security.md)
- [上游契约](docs/upstream-contracts.md)
- [开发路线图](docs/roadmap.md)
- [Phase 4 设计](docs/plans/phase-4-secure-remote-human-access.md)
- [Phase 4 任务包](docs/tasks/phase-4-cloudflare-tunnel-access.md)
- [Phase 4 Codex Goal](docs/prompts/phase-4-codex-goal.md)
- [Phase 3 完成交接](docs/status/phase-3-implementation-handoff.md)
- [Windows Phase 3 验收](docs/operations/windows-phase-3-acceptance.md)
- [Agent 快速交接](docs/agent-guide.md)
