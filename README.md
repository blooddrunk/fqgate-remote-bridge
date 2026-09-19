# FQGate Remote Bridge

FQGate Remote Bridge 是运行在 Windows 本机的安全桥接与操作台：FQGate 始终保持本机回环运行，由 Bridge 提供明确、受控的接口和 Dashboard，再逐阶段通过 Cloudflare Tunnel + Access 将需要的能力安全带到远程环境。

当前 **Phase 0–4 已关闭，Phase 4.5 已完成代码实现但仍 OPEN 等待完整真实验收**。Phase 4 实现并验收了“受 Cloudflare Access 保护的远程人工访问”；不会提前开放远程机器行情 API，也不会让 FQGate 或 Bridge 改成 LAN/WAN 监听。

## 当前结论

- FQGate：固定保持 `127.0.0.1:17281`。
- Bridge：生产环境固定保持 IPv4 loopback，默认 `127.0.0.1:17282`。
- Phase 3 已完成本地升级中心、Runtime OpenAPI/API Reference 和目标 Windows x64 验收。
- Phase 4 引入 remotely-managed Cloudflare Tunnel + Cloudflare Access human policy，`cloudflared` 只转发到 Bridge，绝不直接转发到 FQGate。
- Tunnel **不会自动把全部本地操作暴露到远程**。Bridge 会显式区分 local 与 remote-human operation。
- Phase 4 远程允许 Dashboard/status、QR 登录、只读更新状态和 reference-only API Catalog；对 ordinary `remote_human`，更新检查/预览/执行、OpenAPI refresh 仍保持 local-only。
- Phase 4.5C 代码仅向独立、强认证的 `remote_admin` 开放 `updates.check`、`updates.plan`、`updates.apply` 和 `openapi.refresh`；远程 `updates.apply` 还要求 exact admin Origin/Bridge intent 及绑定当前管理员、计划和候选的一次性内存确认。
- 当前 live 管理员采用已批准的低摩擦 Access profile：指定管理员邮箱、MFA、30 分钟会话；不要求 WARP、客户端证书或设备姿态。Bridge 侧 JWT、Origin/intent、操作白名单、一次性确认、完整性、健康和回滚保护仍然有效。
- 远程 human Host 必须是配置的唯一 `remoteAccess.remoteHostname`，并带有 Cloudflare Protect with Access 注入的 `Cf-Access-Jwt-Assertion`；可选的 admin Host 必须是独立的 `remoteAccess.adminHostname`，并使用独立的 Access team domain/AUD 与 Bridge 侧 RS256 验证；unknown Host、缺 assertion 和转发头 spoofing 都 fail closed。
- `cloudflared` 只接受固定 Cloudflare 官方 GitHub release metadata/Windows x64 asset，手工、显式安装；Windows service 使用 repo 外 ACL 保护的 token file 和 `tunnel run --token-file`。
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

Windows 重启后，`cloudflared` 服务可以先恢复为 Running，但 FQGate 是交互式用户会话进程，Bridge 也不是 Windows 服务；在公网访问前仍需在已登录的用户会话中运行上述 launcher。若服务显示 Running 但公网返回 502，先确认 `127.0.0.1:17281` 和 `127.0.0.1:17282` 都有监听，再启动本机 Dashboard。

### 一键启动 Phase 4 本地运行时

Windows 重启后，在已登录的用户会话中执行下面的命令；它会先确认并启动现有的
`FQGateRemoteBridgeCloudflared` 服务，再启动 FQGate 和 loopback Bridge：

```powershell
.\scripts\windows\start-phase4.cmd `
  -ConfigPath D:\code\research\fqgate-acceptance-config.json
```

如果不需要自动打开浏览器，可追加 `-NoBrowser`。首次安装、服务安装或 token-file
ACL 调整仍须使用对应的显式命令和管理员 PowerShell；这个 launcher 不会自动安装
FQGate、cloudflared 或修改 Cloudflare 资源。

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

Phase 4 remote-human operation：

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

本地 cloudflared 管理命令为显式操作，不会在页面加载、Bridge 启动或后台定时器中下载/更新：

```powershell
node .\dist\cli\main.js cloudflared release --json
node .\dist\cli\main.js cloudflared install --dry-run --json
node .\dist\cli\main.js cloudflared status --json
node .\dist\cli\main.js cloudflared service install --json
node .\dist\cli\main.js cloudflared service restart --json
```

配置只保存 remote hostname、固定 origin、cloudflared release version、安装目录和 token-file 路径；Tunnel token 本身不进入配置、service command、日志、UI、浏览器存储、tests 或 Git。

Phase 4 实现、deterministic tests 以及真实 Windows x64 + Cloudflare 验收均已完成，状态为
**CLOSED**。边界、运行步骤和不含敏感值的验收证据见 [Windows Phase 4 验收](docs/operations/windows-phase-4-acceptance.md)；实现与 live handoff 见 [Phase 4 implementation handoff](docs/status/phase-4-implementation-handoff.md)。

## Phase 4.5 closure 当前活动任务

Phase 4.5 的代码实现已经完成，但在开始 Phase 5 前，当前活动工作是先恢复完整绿色的跨平台 CI，并把剩余 T1-T17 真实验收尽可能自动化。活动任务包：

```text
docs/tasks/phase-4-5-closure-and-phase-5-foundation.md
```

Codex goal：

```text
docs/prompts/phase-4-5-closure-and-phase-5-foundation-codex-goal.md
```

只有 GitHub Actions 的 Ubuntu/Windows 都通过，且 T1-T17（包括真实 authenticated remote-admin apply）都有非敏感证据后，Phase 4.5 才能 CLOSED，随后才进入 Phase 5 remote-machine read-only API。

Windows 目标机完成两个人工 Access 登录后，可在同一个非持久化 headed 浏览器上下文中运行有界的已认证请求矩阵；它只输出 PASS/FAIL、HTTP/error code、脱敏标签和时间戳，不保存或打印 cookie、JWT、QR、confirmation grant，也不会调用 `updates.apply`：

```powershell
.\scripts\windows\phase45-acceptance.ps1 `
  -ConfigPath D:\code\research\fqgate-acceptance-config.json `
  -RunAuthenticatedBrowserMatrix
```

该 companion harness 会验证 ordinary/admin 页面和安全 API、ordinary maintenance denial、admin check/plan/OpenAPI refresh、无确认/过期/安全 stale-plan/replay negative path、两个已认证 hostname 上的 raw/unregistered route denial，以及 ordinary/admin 两个上下文的认证模拟 viewport；绑定错人/错 operation、成功 redemption 后的 replay、竞态 double-redemption 和真实 apply 仍分别由 deterministic tests 或 T13 的人工边界证明。

## Phase 4.5：远程管理员基础与移动 Dashboard

Phase 4.5A 的正交 caller-context/operation-policy 基础已实现：`local`、
`remote_human` 和独立强认证的 `remote_admin` 使用同一套 Bridge registry，
但 4.5A 仍不授予管理员维护权限。管理员配置是可选的，缺少
`adminHostname`、`adminAccess.teamDomain` 或 `adminAccess.audience` 时该 Host
不会启用。

4.5B 已在同一 React/TanStack 前端中完成移动端响应式优化，覆盖现有四个
页面和目标 viewport。4.5C 的远程 check/plan/apply/OpenAPI refresh、CSRF
和一次性 apply confirmation 已实现；ordinary remote human 仍由服务器拒绝
这些操作。真实 Windows x64 + Cloudflare 管理员验收完成前，Phase 4.5 保持
OPEN，验收记录见 [Windows Phase 4.5 验收](docs/operations/windows-phase-4-5-acceptance.md)，
不熟悉实现细节时先看[一页验收单](docs/operations/windows-phase-4-5-acceptance-simple.md)，
实现交接见 [Phase 4.5 implementation handoff](docs/status/phase-4-5-implementation-handoff.md)。
重新配置、新环境、多实例部署，以及 OpenWrt + daed/passwall2 网络兼容步骤，长期
统一维护在中文参考文档
[Phase 4.5 远程管理员配置与重配置（中文长期参考）](docs/operations/windows-phase-4-5-remote-admin-setup.md)。

## 已完成的 Phase 4 任务包

Phase 4 已关闭；以下文件保留为实现、设计和历史执行指令的完整记录：

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

Phase 4 历史 Codex goal 入口（不是新的活动任务）：

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
- [Windows Phase 4 验收](docs/operations/windows-phase-4-acceptance.md)
- [Windows Phase 4.5 远程管理员配置与重配置（中文长期参考）](docs/operations/windows-phase-4-5-remote-admin-setup.md)
- [Windows Phase 4.5 一页验收单](docs/operations/windows-phase-4-5-acceptance-simple.md)
- [未来多 Profile 账号隔离计划](docs/plans/future-multi-profile-account-isolation.md)
- [Phase 4 实现交接](docs/status/phase-4-implementation-handoff.md)
- [Phase 4.5 实现交接](docs/status/phase-4-5-implementation-handoff.md)
- [Agent 快速交接](docs/agent-guide.md)
