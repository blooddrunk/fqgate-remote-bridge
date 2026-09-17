# FQGate Remote Bridge

FQGate Remote Bridge 是运行在 Windows 本机的安全操作台，用来查看 FQGate 状态、完成 QR 登录，并逐步把 FQGate 的只读行情能力安全地带到远程环境。桥接和 FQGate 当前都只绑定 `127.0.0.1`，不会把 FQGate 直接暴露给局域网或公网。

当前仓库已完成 Phase 0、Phase 1 和 Phase 2。下一阶段正式进入 **Phase 3：FQGate 本地升级中心 + Runtime OpenAPI/API Docs 基座**。Cloudflare Tunnel、Cloudflare Access 和远程行情 API 仍然属于后续阶段。

## 先看结论

- FQGate **不会自动安装或自动升级**。首次安装和更新都必须由用户明确触发。
- 当前已有安全的 CLI 生命周期：下载、大小/SHA-256 校验、版本/兼容性检查、健康检查和失败回滚。
- Phase 3 会把这套生命周期接入 Dashboard，但不会另写一套 Web updater。
- Phase 3 会直接读取运行中的 `http://127.0.0.1:17281/openapi.json` 作为 FQGate 当前接口描述的 source of truth，不手工复制官方接口清单。
- **OpenAPI 只负责描述，不负责授权。** 新出现的 FQGate 接口即使能在文档里看到，也不会自动变成 Bridge 可调用接口。
- Cloudflare Tunnel/Access 会在本地升级和 API 文档闭环完成后再进入下一阶段。

## 当前阶段架构

```text
浏览器
  -> 127.0.0.1:17282  FQGate Remote Bridge / Dashboard
       -> 显式 operation policy
       -> lifecycle / update service
       -> runtime OpenAPI catalog
       -> QR / status adapters
            -> 127.0.0.1:17281  FQGate
```

当前不开放 LAN/WAN 监听，也没有 Cloudflare Tunnel。

## 快速开始（Windows）

### 1. 准备环境

需要：

- Windows x64；使用 FQGate 时保持 Windows 桌面用户会话登录；
- Node.js 22 或更高版本；
- Git。

本项目使用锁定版本的 pnpm。优先使用 Corepack：

```powershell
corepack enable
corepack pnpm --version
```

如果系统没有 `corepack`：

```powershell
npm install --global pnpm@11.23.0
pnpm --version
```

### 2. 下载源码

```powershell
Set-Location "<你的代码目录>"
git clone https://github.com/blooddrunk/fqgate-remote-bridge.git
Set-Location .\fqgate-remote-bridge
```

已有工作副本：

```powershell
Set-Location "<你的代码目录>\fqgate-remote-bridge"
git pull --ff-only
```

### 3. 安装依赖并构建

```powershell
corepack pnpm install --frozen-lockfile
corepack pnpm build
```

### 4. 首次安装 FQGate

先预览：

```powershell
node .\dist\cli\main.js fqgate install --dry-run
```

确认来源、版本、大小和 SHA-256 后再执行：

```powershell
node .\dist\cli\main.js fqgate install
node .\dist\cli\main.js fqgate status
```

默认管理目录：

```text
%LOCALAPPDATA%\FQGateRemoteBridge\
```

### 5. 启动 Dashboard 和 FQGate

推荐：

```powershell
.\scripts\windows\start-dashboard.cmd
```

如果 FQGate 尚未安装，普通启动不会自动下载。确认预览后可以明确要求安装：

```powershell
.\scripts\windows\start-dashboard.cmd -InstallFqgate
```

常用选项：

```powershell
.\scripts\windows\start-dashboard.cmd -NoBrowser
.\scripts\windows\start-dashboard.cmd -SkipBuild
.\scripts\windows\start-dashboard.cmd -ConfigPath .\config.local.json
```

手动启动生产桥接：

```powershell
pnpm start
```

浏览器地址：

- 总览：<http://127.0.0.1:17282/>
- 扫码登录：<http://127.0.0.1:17282/login>

按 `Ctrl+C` 只停止桥接。停止 FQGate：

```powershell
node .\dist\cli\main.js fqgate stop
```

## 当前 CLI 更新能力

```powershell
node .\dist\cli\main.js fqgate update --check
node .\dist\cli\main.js fqgate update --apply --dry-run
node .\dist\cli\main.js fqgate update --apply
```

Phase 3 会把同一个 lifecycle/update transaction 接入 Dashboard，并增加运行时 OpenAPI compatibility probe。

## Runtime OpenAPI / API Docs 设计

FQGate 官方配套项目公开了本机文档与 OpenAPI：

```text
http://127.0.0.1:17281/docs
http://127.0.0.1:17281/openapi.json
```

Phase 3 不会复制 `/docs` 页面，也不会把 `/v1/*` 透明代理出来，而是：

```text
运行中的 /openapi.json
    -> FQGate 完整参考目录

显式 Bridge operation registry
    -> Bridge API 目录
```

后续进入远程阶段后，也继续区分：

- **FQGate Reference**：告诉你当前安装版本“有什么”；
- **Bridge API**：告诉远程客户端“允许调用什么”。

详细设计见 `docs/plans/runtime-openapi-and-remote-docs.md`。

## 安全边界

- FQGate：`127.0.0.1:17281`；
- Bridge：默认 `127.0.0.1:17282`；
- 不提供下单、撤单、资金划转、券商账户控制或其他金融状态变更能力；
- 不做任意 URL 反向代理；
- 不允许任意 manifest/EXE URL；
- 新上游接口默认拒绝；
- OpenAPI 发现不会自动修改授权；
- QR/session 数据保持临时、脱敏、不写浏览器持久存储；
- FQGate 未通过兼容性验证时相关操作 fail closed。

## 当前 API（Phase 2 已实现，仅本机回环）

```text
GET  /api/v1/version
GET  /api/v1/capabilities
GET  /api/v1/status
POST /api/v1/session/qr/begin
POST /api/v1/session/qr/poll
```

Phase 3 会新增明确注册的本地 update/OpenAPI/catalog 操作；最终路径以实现和 operation registry 为准。

## 当前开发任务

Phase 3 任务包：

```text
docs/tasks/phase-3-fqgate-upgrade-and-runtime-openapi.md
```

Codex goal：

```text
docs/prompts/phase-3-codex-goal.md
```

### 可直接交给 Codex goal 的精简入口

```text
在 https://github.com/blooddrunk/fqgate-remote-bridge 工作。同步最新代码后，严格按照 AGENTS.md 和 docs/prompts/phase-3-codex-goal.md 完整执行 Phase 3：实现本地 FQGate Dashboard 升级中心和 runtime OpenAPI/API Reference 基座，复用现有 lifecycle/update transaction，保持 loopback-only、deny-by-default、无任意 URL/透明代理/交易能力；完成代码、测试、UI、文档和安全可行的 Windows 验收，不要提前实现 Cloudflare/Tunnel/Access 或其他 Phase 4+ 能力。
```

## 文档索引

- [架构](docs/architecture.md)
- [安全模型](docs/security.md)
- [上游契约与兼容性](docs/upstream-contracts.md)
- [开发路线图](docs/roadmap.md)
- [Phase 3 任务包](docs/tasks/phase-3-fqgate-upgrade-and-runtime-openapi.md)
- [Phase 3 Codex Goal](docs/prompts/phase-3-codex-goal.md)
- [升级中心设计](docs/plans/fqgate-install-upgrade-dashboard.md)
- [Runtime OpenAPI / Remote Docs 设计](docs/plans/runtime-openapi-and-remote-docs.md)
- [Phase 2 完成报告](docs/status/phase-2-completion.md)
- [Windows Phase 2 验收](docs/operations/windows-phase-2-acceptance.md)
- [Agent 工作约定](docs/agent-guide.md)
