# Agent 工作约定

这份文档是给编码 Agent 的快速交接说明。规范性约束仍以根目录
AGENTS.md、当前任务包和项目安全文档为准；如果内容冲突，以它们为准。

## 当前状态

- Phase 0：已关闭。
- Phase 1：已关闭，并已验证 Windows x64 生命周期、校验和、回滚和健康检查。
- Phase 2：已关闭，并已在目标 Windows x64 主机完成真实 QR begin/poll/scan。
- Phase 3：本地升级中心、Runtime OpenAPI/API Reference 和目标 Windows x64
  安全验收已完成；Phase 4+ 不要在普通维护任务中顺手实现。

Phase 2 的核心边界是：TanStack Start 只作为本地 UI/HTTP 传输层，桥接固定绑定
127.0.0.1:17282，FQGate 固定保持本机回环，接口必须通过显式策略注册。

## 当前安装、启动与升级约定

- FQGate 安装不是隐式行为。用户先运行 `fqgate install --dry-run`，确认后再运行
  `fqgate install`；不要在 Dashboard 加载、普通启动或状态轮询中自动下载/替换 FQGate。
- 推荐 Windows 用户使用 `scripts/windows/start-dashboard.cmd`。它会准备依赖、构建生产产物，
  启动已安装但停止的 FQGate，并启动 loopback Dashboard。只有显式传入 `-InstallFqgate` 才会
  执行首次安装。
- CLI 和 Dashboard 更新都通过同一个生命周期/update application service 完成：CLI 使用
  `fqgate update --check`、`fqgate update --apply --dry-run` 和 `fqgate update --apply`，
  Dashboard 使用 `/updates` 的显式检查、预览和确认操作。页面加载、普通启动和状态轮询
  不会自动更新；GitHub 仍是唯一启用的固定可信源，Gitee 未启用。
- 用户文档中的 Windows 目录必须使用占位符或明确标为示例，不得把开发者个人目录写成推荐安装路径。
- Dashboard 和扫码流程的用户可见文案以简体中文为准；代码、CLI 错误码和上游协议字段仍可保留英文。
- API Reference 使用运行中的固定 `127.0.0.1:17281/openapi.json`，仅提供上游参考目录、
  Bridge registry 目录和兼容性变化；不提供 raw upstream Try it out。

## 开始工作前

按顺序阅读：

1. README.md
2. docs/architecture.md
3. docs/security.md
4. docs/upstream-contracts.md
5. docs/roadmap.md
6. 当前任务包（通常是 docs/tasks/ 下最新的 Phase 任务）
7. 与任务相关的完成报告和 Windows 验收流程

如果任务涉及 Phase 2 的历史决策，还要阅读：

- docs/prompts/phase-2-codex-goal.md
- docs/status/phase-2-completion.md

## 不可突破的边界

- 不添加通配反向代理，不接受任意上游路径。
- 不开放 LAN、公网、Cloudflare、Access、Tunnel 或 Windows 服务，除非任务明确进入对应 Phase。
- 不添加交易、下单、撤单、转账、券商控制或其他改变金融状态的接口。
- FQGate 兼容性未知时必须拒绝操作，不得透明转发。
- QR 图片、上游 flow_id、完整 sessionId、登录材料和凭据不得进入日志、文件或浏览器存储。
- 不用登出已有账号来制造测试条件；真实验收要保留可回退路径。
- 不提交 FQGate 可执行文件、QR 内容、cookie、token 或其他秘密。

## 代码分层

- src/fqgate：上游版本、进程、健康和协议适配。
- src/bridge：策略注册、错误归一化、QR 适配和内存态会话。
- src/routes、src/components：只做薄的 TanStack Start 路由和 React 展示。
- scripts/windows：只做 Windows 启动/验收入口，不复制核心业务逻辑。

新增 HTTP 操作前，必须同时回答：为什么属于当前 Phase、公开方法和路径是什么、
策略注册在哪里、body/timeout 限制是什么、是否会泄露敏感值、兼容性失败如何拒绝、
是否可能改变金融或账号状态。

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

不是每个纯文档改动都需要 E2E，但代码和 UI 改动应按风险运行完整检查。

Windows x64 验收：

```powershell
pwsh -NoProfile -NonInteractive -File .\scripts\windows\acceptance.ps1 -VerifyCli -VerifyBridge
node .\dist\cli\main.js fqgate status --json
node .\dist\cli\main.js fqgate health --json
```

真实 QR 验收只在会话状态允许且不需要破坏性登出时进行。记录状态、版本、监听地址、
原始路径 404 和最终连接状态，不记录二维码、账号、cookie 或完整会话标识。

## 改动交接清单

- 先说明本次改动属于哪个 Phase，并确认没有带入后续 Phase。
- 为核心逻辑补单元/集成测试，为 UI 状态补行为测试。
- 更新受影响的架构、安全、上游契约、运维或完成报告。
- 运行与风险匹配的检查，并记录实际结果，不用“应该通过”代替证据。
- 检查 git diff、git status 和敏感文件。
- 如果未获明确授权，不推送远程、不创建外部服务、不发送消息。

## 可直接发送给 Agent 的短 Prompt

```text
请在当前 fqgate-remote-bridge 工作，不要只做计划。先读 README.md、AGENTS.md、
docs/architecture.md、docs/security.md、docs/upstream-contracts.md、docs/roadmap.md、
当前任务包和 docs/agent-guide.md。确认工作范围属于当前 Phase，禁止顺手实现 Phase 3+。

保持 FQGate/桥接 IPv4 loopback、显式操作 allowlist、兼容性 fail-closed、QR 内存态、
无敏感日志和可回滚生命周期。实现代码、测试和文档后运行与风险匹配的检查；Windows
改动运行 scripts/windows/acceptance.ps1。最后报告真实证据、未完成项和下一步，不要
伪造真实 FQGate/QR/Cloudflare 验收。
```
