# Agent 工作约定

这份文档是给编码 Agent 的快速交接说明。规范性约束仍以根目录
`AGENTS.md`、当前任务包和安全文档为准；如果内容冲突，以它们为准。

## 当前状态

- Phase 0-4：CLOSED。
- Phase 4.5：CLOSED；独立 `remote_admin`、移动 Dashboard、一次性 apply
  confirmation 和真实 Windows x64 + Cloudflare 验收已完成。
- Phase 5：ACTIVE，但**只允许执行 Phase 5-A**。
- Phase 5-A：建立 `remote_machine` 身份/上下文并保持零 operation 权限。
- Phase 5-B+：尚未授权实施。

当前稳定运行边界：

```text
FQGate  -> 127.0.0.1:17281 only
Bridge  -> 127.0.0.1:17282 only
Tunnel  -> Bridge only
```

## 当前活动入口

按顺序阅读：

1. `README.md`
2. `AGENTS.md`
3. `docs/architecture.md`
4. `docs/security.md`
5. `docs/upstream-contracts.md`
6. `docs/roadmap.md`
7. `docs/plans/phase-5-remote-machine-read-only-api.md`
8. `docs/tasks/phase-5-a-remote-machine-zero-privilege.md`
9. `docs/status/phase-4-5-implementation-handoff.md`
10. 本文

Codex 执行入口：

`docs/prompts/phase-5-a-codex-goal.md`

## Phase 5-A 的核心判断

Phase 5-A 不是行情 API 阶段。它只回答两个问题：

1. Cloudflare service token 能否在 Bridge origin 被严格识别成
   `remote_machine`？
2. 被识别以后，能否保证它对当前所有 Bridge operations 仍然是
   server-side deny？

两项都通过，才允许进入 5-B。

## Cloudflare machine 与 human/admin 的差异

管理员 JWT 当前是 human profile，需要非空 `sub`。

service-token application JWT 是 machine profile。必须独立校验至少：

```text
type = app
exact issuer
exact machine AUD
iat / exp / optional nbf
bounded non-empty common_name
sub = ""
RS256 + fixed team-domain cert endpoint
```

机器 principal 使用 `kind: "machine"`。不要为了复用代码而放宽
管理员 verifier；也不要让 machine verifier 接受 human token。

service token 的 Client ID/Secret 只存在于客户端到 Cloudflare Access 的认证
边界。它们不是 Bridge JSON 配置，不进入 Git、日志、文档、测试 fixture、
命令参数或浏览器存储。

## Phase 5-A 零权限矩阵

当前所有 operation 对 `remote_machine` 都必须拒绝：

```text
bridge.version
bridge.capabilities
bridge.status
session.qr.begin
session.qr.poll
updates.status
updates.check
updates.plan
updates.apply
openapi.catalog
openapi.refresh
```

不要用 UI 隐藏代替授权。transport/page/static/raw route 也必须不能形成绕过。

## 自动验证优先

永久 Windows 验证环境位于 `D:\code\research`。

Agent 必须先定位这里现有的 Git working tree，并尽量在该永久环境完成：

- install/frozen-lockfile；
- typecheck；
- lint；
- unit tests；
- build；
- format check；
- Playwright E2E；
- Windows CLI/loopback smoke；
- Phase 5-A Windows acceptance；
- 最终 GitHub Actions Ubuntu + Windows matrix。

Phase 5-A 的 Windows 脚本入口为
`scripts/windows/phase5a-acceptance.ps1`，真实 credential matrix companion 为
`scripts/windows/phase5a-authenticated-acceptance.mjs`。它们先解析已有的
`D:\\code\\research` Git root，不创建第二份 checkout；credential matrix 只
通过两个 `Read-Host -AsSecureString` 隐藏提示接收 Client ID/Secret，随后以
child-process environment 传递并在 `finally` 清理。

普通 CI 不得依赖真实 Cloudflare credentials。

## 允许的人工边界

只有两类人工动作：

1. **MANUAL_CLOUDFLARE_SETUP**：如果 machine Access app/service token/Tunnel
   hostname 尚不存在，由 operator 在 Cloudflare 控制台创建，因为自动
   provisioning 明确属于 Phase 6。
2. **MANUAL_SECRET_ENTRY**：operator 把 service-token Client ID/Secret 输入
   Phase 5-A acceptance script 的隐藏提示；脚本随后自动执行远程矩阵。

任何人工项都必须在任务包里给出编号步骤、预期结果和自动化恢复点。不得写
“需要人工验证”后不说明如何验证。

## 不可突破的边界

- 不添加 catch-all/raw FQGate proxy。
- 不开放 LAN/WAN listener。
- 不实现交易/下单/撤单/转账/券商控制或其他金融状态变更。
- Phase 5-A 不增加任何行情 operation。
- 不给 machine QR/session/update/admin/OpenAPI-refresh 权限。
- 不自动创建 Tunnel/DNS/Access；那是 Phase 6。
- 不提前实现 supervisor、notifications、automatic updates、MCP/WebSocket
  或 packaging。
- runtime `/openapi.json` 只做描述/契约证据，永远不能自动授权。
- secret/JWT/cookie/QR/Tunnel token/confirmation grant 不得进入日志或持久化。

## Phase 4/4.5 回归基线

继续保持：

- ordinary `remote_human` 只能使用既有七个安全操作；
- `remote_admin` 只额外拥有
  `updates.check`、`updates.plan`、`updates.apply`、
  `openapi.refresh`；
- remote admin apply 继续要求 exact Origin/intent 和一次性
  principal/AUD/plan/candidate-bound confirmation；
- unknown Host / forwarded-host spoofing fail closed；
- cloudflared origin 固定 `http://127.0.0.1:17282`；
- raw FQGate path 不可达。

Phase 4.5 真实验收历史证据仍在
`docs/operations/windows-phase-4-5-acceptance.md`，不要为 Phase 5-A
改写历史事实。

## Phase 5-A 关闭条件

只有以下全部通过才可标 CLOSED：

- deterministic test matrix green；
- permanent Windows `D:\code\research` checks green；
- GitHub Actions Ubuntu/Windows green；
- real Cloudflare service-token JWT 被 Bridge 识别成 machine；
- valid machine identity 仍被 current operation policy 拒绝；
- raw/unregistered routes 仍拒绝；
- human/admin regressions green；
- no secret-bearing evidence committed。

若真实 service-token acceptance 未完成，保持 OPEN，并写清具体失败 test、
HTTP/error code 和下一项人工动作。
