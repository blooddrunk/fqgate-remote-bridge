# FQGate Remote Bridge

在 Windows 本机为 FQGate 提供一个安全、易操作的本地桥接界面。它只监听
127.0.0.1，用于查看状态和完成 QR 登录；不会把 FQGate 暴露到局域网或公网。

> 当前状态：Phase 0、Phase 1、Phase 2 已完成并通过真实 Windows QR 验收。
> Cloudflare Tunnel、Cloudflare Access 和远程行情接口属于后续 Phase，当前未实现。

## 适合做什么

- 管理和检查本机 FQGate 进程、版本、兼容性和健康状态。
- 在浏览器中查看本地运行状态。
- 使用短时 QR 码恢复 FQGate 市场会话。
- 为后续受控的远程访问保留清晰的安全边界。

## 明确不会做什么

- 不提供下单、撤单、转账、券商账户控制等功能。
- 不做任意 URL 反向代理，也不转发未知的 FQGate 接口。
- 不绑定 0.0.0.0、局域网地址或公网地址。
- 当前不安装 Windows 服务，不声称支持 FQGate 无人值守运行。
- 不保存 QR 图片、登录会话或账号凭据到项目目录。

## 快速开始（Windows）

### 1. 准备环境

- Windows x64，并保持用户桌面会话登录（FQGate 是桌面程序）。
- Node.js 22 或更高版本。
- Corepack/pnpm。

首次使用可以执行：

```powershell
corepack enable
pnpm --version
```

### 2. 安装到 D:\code\research

源码目录建议使用：

```text
D:\code\research\fqgate-remote-bridge
```

如果还没有源码：

```powershell
Set-Location D:\code\research
git clone https://github.com/blooddrunk/fqgate-remote-bridge.git
Set-Location .\fqgate-remote-bridge
```

在已经存在的工作副本中，直接进入该目录即可，不要重复克隆。

### 3. 安装依赖并构建

```powershell
pnpm install --frozen-lockfile
pnpm build
```

### 4. 启动并打开页面

```powershell
pnpm start
```

然后在本机浏览器打开：

- 总览：<http://127.0.0.1:17282/>
- QR 登录：<http://127.0.0.1:17282/login>

不要把地址改成电脑 IP，也不要把端口映射到公网。

### 5. 完成扫码

1. 打开 /login。
2. 点击“生成 QR 码”。
3. 使用 FQGate/同花顺配套应用扫码并确认。
4. 等待页面回到总览，并看到“Market session: Connected”。

QR 码只保存在桥接进程内存中，默认约 120 秒过期；刷新页面不会把 QR 会话保存到浏览器。

### 6. 验证安装

在另一个 PowerShell 窗口执行：

```powershell
pwsh -NoProfile -NonInteractive -File .\scripts\windows\acceptance.ps1 -VerifyCli -VerifyBridge
node .\dist\cli\main.js fqgate status --json
node .\dist\cli\main.js fqgate health --json
```

详细验收步骤见 [Windows Phase 2 验收流程](docs/operations/windows-phase-2-acceptance.md)。

## 常用命令

```powershell
pnpm dev                 # 开发模式
pnpm build               # 构建 CLI 和生产桥接
pnpm start               # 启动 127.0.0.1:17282
pnpm typecheck           # 类型检查
pnpm lint                # ESLint
pnpm test                # 单元、集成和 UI 测试
pnpm test:e2e            # Playwright 浏览器测试
pnpm format:check        # 格式检查
```

生命周期 CLI：

```powershell
node .\dist\cli\main.js version
node .\dist\cli\main.js fqgate status
node .\dist\cli\main.js fqgate health
node .\dist\cli\main.js fqgate update --check
```

默认的 FQGate 管理目录是：

```text
%LOCALAPPDATA%\FQGateRemoteBridge\
```

它与源码目录 D:\code\research\fqgate-remote-bridge 分开。FQGate 官方程序只从官方发布源下载，并在激活前校验大小和 SHA-256。

## 当前 API（仅本机回环）

```text
GET  /api/v1/version
GET  /api/v1/capabilities
GET  /api/v1/status
POST /api/v1/session/qr/begin
POST /api/v1/session/qr/poll
```

原始 /v1/market/* 路径不会被桥接。未知路径、错误方法和不兼容的 FQGate 版本会被拒绝。

## 发给 Agent 的 Prompt

复制下面这段给编码 Agent，即可让它在当前边界内继续工作：

```text
在 https://github.com/blooddrunk/fqgate-remote-bridge 工作。

先阅读 README.md、AGENTS.md、docs/architecture.md、docs/security.md、
docs/upstream-contracts.md、docs/roadmap.md，以及当前任务包和
docs/agent-guide.md。Phase 0、Phase 1、Phase 2 已关闭；本次不要实现
Phase 3+，尤其不要加入 Cloudflare、公网/LAN 监听、MCP、WebSocket、
通知、Windows 服务或交易接口。

保持 FQGate 和桥接都只绑定 IPv4 回环；保持显式 API/策略注册、兼容性
失败即拒绝、QR 只存内存、上游 flow_id 不出服务端、无敏感日志和可回滚
的生命周期行为。任何改动都要补测试和对应文档。

开始前同步最新远程代码。完成实现后运行 pnpm typecheck、pnpm lint、
pnpm test、pnpm build、pnpm format:check；涉及 UI 时运行 pnpm test:e2e。
Windows 改动还要按 docs/operations/windows-phase-2-acceptance.md 验证。
不要只写计划；请完成代码、测试、文档和可验证的交接，并如实报告证据。
```

更完整的 Agent 工作约定见 [docs/agent-guide.md](docs/agent-guide.md) 和根目录 [AGENTS.md](AGENTS.md)。

## 文档索引

- [架构](docs/architecture.md)
- [安全模型](docs/security.md)
- [上游契约与兼容性](docs/upstream-contracts.md)
- [开发路线图](docs/roadmap.md)
- [Phase 2 任务包](docs/tasks/phase-2-tanstack-local-bridge-and-qr-ui.md)
- [Phase 2 完成报告](docs/status/phase-2-completion.md)
- [Windows 验收流程](docs/operations/windows-phase-2-acceptance.md)
- [Agent 工作约定](docs/agent-guide.md)
