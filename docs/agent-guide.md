# Agent 工作约定

这份文档是给编码 Agent 的快速交接说明。规范性约束以根目录 AGENTS.md、当前
task package 和安全文档为准。

## 当前状态

- Phase 0–4.5：CLOSED。
- Phase 5-A：CLOSED；remote_machine 身份、独立 JWT claim profile、零权限矩阵、
  永久 Windows / CI / 真实 service-token 验收均已完成。
- Phase 5-B：**ACTIVE**；先做 live contract census，再实现最多两个最小只读行情
  operation。
- Phase 5-C+：尚未授权实施。

稳定拓扑不变：

```text
FQGate  -> 127.0.0.1:17281 only
Bridge  -> 127.0.0.1:17282 only
Tunnel  -> Bridge only
```

## 当前活动入口

按顺序阅读：

1. README.md
2. AGENTS.md
3. docs/architecture.md
4. docs/security.md
5. docs/upstream-contracts.md
6. docs/roadmap.md
7. docs/plans/phase-5-remote-machine-read-only-api.md
8. docs/tasks/phase-5-b-live-contract-census-and-first-read-only-slice.md
9. docs/status/phase-5-a-implementation-handoff.md
10. docs/operations/windows-phase-5-a-acceptance.md
11. 本文

Codex 执行入口：

docs/prompts/phase-5-b-codex-goal.md

## Phase 5-B 的核心判断

不要先写行情接口。先回答三个问题：

1. 永久 Windows 机器上当前运行的 FQGate 实际提供哪些候选 market contracts？
2. 哪些候选能用 live OpenAPI + 官方/公开代码 + 无副作用 semantic probe 证明为
   read-only，并且输入输出可以严格限界？
3. 在这些候选中，哪 1–2 个最适合作为第一批稳定 Bridge-owned API？

Runtime /openapi.json 是描述证据，不是授权来源。即使出现新 path，也必须在
Bridge 中显式 adapter + registry + tests 后才可调用。

## 权限边界

Phase 5-B 新增的行情 operation 的 allowedContexts 必须恰好是：

```text
local
remote_machine
```

不要顺手给 remote_human 或 remote_admin。

Phase 5-A 的旧矩阵保持：remote_machine 对 bridge.version、status、QR/session、
updates、admin、openapi.refresh 等既有 operation 继续全部拒绝；machine hostname
也不能渲染 Dashboard/static 或透传 raw /v1/...。

## 实现方式

每个选中的 upstream capability 必须变成 Bridge-owned contract：

- 固定 upstream method/path；
- typed input；
- unknown/unbounded input fail closed；
- FQGate envelope 与 endpoint data 分层解析；
- normalized Bridge response；
- timeout / bytes / collection count / string / date-range / limit 明确上限；
- compatibility/drift gate；
- 安全、长度受限的错误；
- 不允许 caller 提供任意 path/method/URL。

优先考虑 live contract 证明清晰的 symbol/instrument lookup 与 bounded realtime
quote；bars 只有在行数、时间范围和返回结构都能确定限界时才可进入首批。

## 自动验证优先

永久 Windows 验证环境：D:\code\research。

必须自动执行：

- frozen install；
- typecheck；
- lint；
- unit/integration tests；
- build；
- format check；
- Playwright E2E；
- Windows CLI/loopback smoke；
- Phase 5-A regression acceptance；
- Phase 5-B live OpenAPI census；
- Phase 5-B local semantic probes；
- Phase 5-B remote-machine smoke；
- 最终 GitHub Actions Ubuntu + Windows。

不要创建第二份临时 Windows checkout 规避永久环境问题。

## 允许的人工边界

### 1. Existing machine service-token secret entry

Phase 5-A 已经创建 machine Access application / service token / Tunnel ingress。
Phase 5-B 不创建新的 Cloudflare 资源。

远程 smoke 需要凭据时，operator 只在 PowerShell 的 Read-Host -AsSecureString
隐藏提示中输入既有 Client ID 和 Client Secret。随后全部测试必须自动完成。
凭据不进入 chat、Git、普通配置、命令参数、日志或证据。

### 2. FQGate physical QR login, only when required

如果 live market probe 需要已登录 session，脚本必须先自动检测并明确输出
LOGIN_REQUIRED。operator 只需打开本机 Bridge login 页面：

http://127.0.0.1:17282/login

启动现有 QR flow 并完成物理扫码/确认，然后重新运行原命令。自动化随后通过
health/session contract 判断登录状态并继续，不要求人工读 JSON 或手工判断字段。

## 不可突破的边界

- 不做 generic/raw FQGate proxy。
- 不开放 LAN/WAN listener。
- 不实现交易、下单、撤单、转账、券商控制或其他金融状态变更。
- 不让 runtime OpenAPI 自动授权。
- 不给 machine 任何旧的 QR/session/update/admin/openapi-refresh 权限。
- Phase 5-B 最多两个 read-only market operations。
- 不做 generated machine OpenAPI；那是 Phase 5-C。
- 不做 Cloudflare provisioning；那是 Phase 6。
- 不提前做 supervisor、notifications、automatic updates、MCP/WebSocket、
  packaging 或 turtle-value-engine consumer integration。
- secret/JWT/cookie/QR/Tunnel token/raw OpenAPI/raw market payload 不进入证据或
  持久化。

## Phase 5-B 关闭条件

只有 task package 中的所有 closure criteria 都通过才可标 CLOSED。尤其必须有：

- live census 来自永久 Windows FQGate；
- 至少 1、最多 2 个 evidence-backed read-only operation；
- deterministic + Windows + CI 全绿；
- real remote-machine smoke 通过；
- 旧 remote_machine deny matrix 不回退；
- 没有 secret 或 raw payload 被提交。

失败时写清具体 test ID、HTTP/error、观察到的 contract 差异以及下一项动作。
不要只写“证据未完整记录”。

## 本次实现交接

首个 operation 为 `market.instruments.lookup`（六位代码查询），仅 local +
remote_machine。Phase 5-B 仍 OPEN，继续执行验收，不追加报价或其他 API。
实际实时证据、指纹、剩余工作见 `docs/status/phase-5-b-implementation-handoff.md`；
Windows/远程自动矩阵与隐藏输入步骤见 `docs/operations/windows-phase-5-b-acceptance.md`。
