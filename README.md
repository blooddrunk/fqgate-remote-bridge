# FQGate Remote Bridge

FQGate Remote Bridge 是运行在 Windows 本机的安全操作台，用来查看 FQGate
状态并完成 QR 登录。桥接和 FQGate 都只绑定 `127.0.0.1`，不会把 FQGate
暴露给局域网或公网。

当前仓库已完成 Phase 0、Phase 1 和 Phase 2。Cloudflare Tunnel、Cloudflare
Access、远程行情接口和交易能力不在当前版本中。

## 先看结论

- FQGate **不会自动安装**。首次安装必须由你明确执行，并在安装前检查官方来源、版本和 SHA-256。
- Dashboard 启动后如果没有检测到 FQGate，会显示安装命令；普通启动不会静默下载或安装程序。
- 当前已有安全的 CLI 升级流程，但没有 Dashboard 内的一键升级和 Gitee 源配置。
- 推荐使用 Windows 一键入口启动：它会准备依赖、构建 Dashboard、检查并启动已安装的 FQGate，然后打开浏览器。

## 快速开始（Windows）

### 1. 准备环境

需要：

- Windows x64；使用 FQGate 时保持 Windows 桌面用户会话登录。
- [Node.js 22 或更高版本](https://nodejs.org/)。FQGate 是桌面程序，当前不支持无人值守 Windows 服务模式。
- Git。

本项目使用锁定版本的 pnpm。你不需要手动安装一个全局 pnpm，优先使用 Node.js 自带的 Corepack：

```powershell
corepack enable
corepack pnpm --version
```

如果系统没有 `corepack`，可以改用全局安装：

```powershell
npm install --global pnpm@11.23.0
pnpm --version
```

后面的命令可以使用 `pnpm`；如果没有把 pnpm 加入 PATH，就把 `pnpm` 替换为 `corepack pnpm`。

### 2. 下载源码

源码可以放在任意有写入权限的目录。下面的路径只是示例，请替换成你自己的目录，不要照抄某个开发者的本机路径：

```powershell
# 示例：把 <你的代码目录> 替换为 C:\projects、D:\workspace 等实际目录
Set-Location "<你的代码目录>"
git clone https://github.com/blooddrunk/fqgate-remote-bridge.git
Set-Location .\fqgate-remote-bridge
```

如果已经有工作副本，只需要进入它并同步代码：

```powershell
Set-Location "<你的代码目录>\fqgate-remote-bridge"
git pull --ff-only
```

### 3. 安装 JavaScript 依赖并构建

```powershell
corepack pnpm install --frozen-lockfile
corepack pnpm build
```

如果你已经启用了 `pnpm` 命令，也可以写成 `pnpm install --frozen-lockfile` 和 `pnpm build`。

### 4. 首次安装 FQGate（不会自动执行）

先查看安装计划：

```powershell
node .\dist\cli\main.js fqgate install --dry-run
```

确认计划中的来源、版本、文件大小和 SHA-256 后，再执行：

```powershell
node .\dist\cli\main.js fqgate install
node .\dist\cli\main.js fqgate status
```

程序只从当前登记的官方 GitHub 发布源下载，并在激活前校验文件大小、SHA-256、版本和健康状态。默认管理目录为：

```text
%LOCALAPPDATA%\FQGateRemoteBridge\
```

该目录与源码目录相互独立，仓库不会提交或携带 FQGate 可执行文件。

### 5. 启动 Dashboard 和 FQGate

推荐使用一键启动入口：

```powershell
.\scripts\windows\start-dashboard.cmd
```

它会：

1. 在依赖尚未安装时使用锁定版本安装依赖；
2. 构建 CLI 和生产 Dashboard；
3. 检查 FQGate 是否已安装；
4. 对已安装但未运行的 FQGate 执行启动；
5. 启动只监听 `127.0.0.1:17282` 的桥接并打开浏览器。

如果 FQGate 尚未安装，脚本会停止并打印预览命令，不会暗中下载。确认过 `--dry-run` 后，可以明确要求它完成首次安装：

```powershell
.\scripts\windows\start-dashboard.cmd -InstallFqgate
```

常用选项：

```powershell
.\scripts\windows\start-dashboard.cmd -NoBrowser       # 不自动打开浏览器
.\scripts\windows\start-dashboard.cmd -SkipBuild        # 已确认构建产物最新时使用
.\scripts\windows\start-dashboard.cmd -ConfigPath .\config.local.json
```

也可以手动启动生产桥接：

```powershell
pnpm start
```

浏览器地址：

- 总览：<http://127.0.0.1:17282/>
- 扫码登录：<http://127.0.0.1:17282/login>

按 `Ctrl+C` 只会停止本次启动的桥接；FQGate 仍会继续运行。需要停止 FQGate 时，明确执行：

```powershell
node .\dist\cli\main.js fqgate stop
```

### 6. 扫码登录

1. 打开 Dashboard 的“扫码登录”页面。
2. 点击“生成 QR 码”。
3. 用 FQGate/同花顺配套应用扫码并确认。
4. 等待页面显示“行情会话已连接”，再回到总览查看状态。

QR 内容只在桥接进程内存中短暂存在，默认约 120 秒过期；不会写入源码目录、文件、`localStorage` 或 `sessionStorage`。

## 常用命令

开发和检查：

```powershell
pnpm dev
pnpm build
pnpm typecheck
pnpm lint
pnpm test
pnpm test:e2e
pnpm format:check
```

FQGate 生命周期：

```powershell
node .\dist\cli\main.js version
node .\dist\cli\main.js fqgate release
node .\dist\cli\main.js fqgate status
node .\dist\cli\main.js fqgate health
node .\dist\cli\main.js fqgate start
node .\dist\cli\main.js fqgate stop
node .\dist\cli\main.js fqgate restart
```

当前版本的升级是**明确执行的 CLI 操作**，不会由 Dashboard 或后台自动触发：

```powershell
node .\dist\cli\main.js fqgate update --check
node .\dist\cli\main.js fqgate update --apply --dry-run
node .\dist\cli\main.js fqgate update --apply
```

升级会复用安装事务：下载、校验、兼容性检查、健康检查失败时保留或恢复上一份已知可用版本。当前发布源只有登记的 GitHub 官方源，Gitee 切换和 Dashboard 内升级属于后续设计，见[《FQGate 安装与升级设计草案》](docs/plans/fqgate-install-upgrade-dashboard.md)。

## 安全边界

- 只监听 IPv4 回环 `127.0.0.1`，默认端口为 `17282`。
- 不提供下单、撤单、转账、券商账户控制或其他改变金融状态的接口。
- 不做任意 URL 反向代理；未知路径和原始 `/v1/market/*` 路径会被拒绝。
- FQGate 版本未通过兼容性验证时，扫码操作会被拒绝。
- 不记录 QR base64、上游 flow ID、登录材料、cookie、token 或完整会话信息。
- 当前不安装 Windows 服务，也不声称支持 FQGate 无人值守运行。

## 当前 API（仅本机回环）

```text
GET  /api/v1/version
GET  /api/v1/capabilities
GET  /api/v1/status
POST /api/v1/session/qr/begin
POST /api/v1/session/qr/poll
```

## 发给 Agent 的 Prompt

复制下面这段给编码 Agent，可以让它在当前阶段继续工作：

```text
在 https://github.com/blooddrunk/fqgate-remote-bridge 工作。

先按顺序阅读 README.md、AGENTS.md、docs/architecture.md、docs/security.md、
docs/upstream-contracts.md、docs/roadmap.md、当前任务包和 docs/agent-guide.md。
当前 Phase 0、Phase 1、Phase 2 已关闭；不要实现 Phase 3+，尤其不要加入
Cloudflare/Tunnel/Access、公网或 LAN 监听、MCP、WebSocket、通知、Windows
服务、交易接口，或未经计划批准的 Dashboard 安装/升级 API。

保持 FQGate 和桥接都只绑定 IPv4 loopback；保持显式 API/策略注册、兼容性
fail-closed、QR 只存内存、上游 flow_id 不出服务端、无敏感日志和可回滚的
生命周期行为。FQGate 安装不是自动行为；当前使用 CLI 的 install/update
命令，Dashboard 只展示状态和安装引导。不要把用户文档中的示例目录当作
固定路径。

开始前同步最新远程代码。完成实现后运行与风险匹配的 typecheck、lint、test、
build、format:check；涉及 UI 时运行 test:e2e；Windows 改动还要按
docs/operations/windows-phase-2-acceptance.md 验证。不要只写计划，要完成代码、
测试、文档和可验证的交接，并如实报告证据。
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
- [FQGate 安装与升级设计草案](docs/plans/fqgate-install-upgrade-dashboard.md)
- [Agent 工作约定](docs/agent-guide.md)
