# FQGate Remote Bridge

FQGate Remote Bridge 是一个运行在 Windows 机器上的本地优先桥接层。它把
FQGate 保持在本机 IPv4 loopback，通过独立的 Bridge 提供 Dashboard、生命周期管理、
登录/会话和有限的只读能力；需要远程访问时，再由 Cloudflare Access 和 Cloudflare
Tunnel 把流量安全地送到 Bridge。

这不是一个通用反向代理，也不是交易网关。FQGate 永远不直接暴露到互联网，Bridge
也永远不监听局域网或公网地址。

> 本 README 是部署入口和操作地图，不替代规范文档。涉及安全边界时，以
> [AGENTS.md](AGENTS.md)、当前 task package 和安全文档为准。

## 先看结论：现在能做什么

当前项目仍在持续开发；Phase 0–6-A 已完成。Phase 5 的最终交付是受策略约束的
machine OpenAPI，以及永久 Windows、真实 Cloudflare service-token 和双平台 CI 闭包。

| 能力                   | 当前状态           | 说明                                                                |
| ---------------------- | ------------------ | ------------------------------------------------------------------- |
| FQGate 本机运行        | 可用               | 仅 127.0.0.1:17281                                                  |
| Bridge Dashboard/API   | 可用               | 仅 127.0.0.1:17282                                                  |
| 本地维护               | 可用               | 生命周期、更新和 OpenAPI refresh 保持本地边界                       |
| remote-human           | 可用               | Dashboard、status、QR、只读更新状态、API catalog                    |
| remote-admin           | 可用               | 独立 hostname/AUD；仅有限维护操作，并有额外确认机制                 |
| remote-machine         | 独立认证、受限查询 | 仅允许查询与 machine OpenAPI；所有旧 operation 仍拒绝               |
| Phase 5-B 行情 API     | CLOSED / 已验收    | 已从永久 Windows 实时证据选择一个六位代码查询                       |
| Phase 5-C machine docs | CLOSED / 已验收    | registry-derived 文档与最终远程闭包通过                             |
| Post-Phase-5 兼容维护  | CLOSED / 已验收    | 1.0.2 候选资格、lookup 证据化与永久环境刷新                         |
| Phase 6-A Cloudflare   | CLOSED / 已验收    | 只读 discovery、reconciliation、secret-free plan；不修改 Cloudflare |
| 验收凭据托管与目录退役 | CLOSED / 已验收    | 三项 Windows Vault 凭据、受保护的 Tunnel token 文件、旧目录清理     |
| 交易、下单、撤单、转账 | 永不由本项目提供   | 这是不可突破的安全边界                                              |

如果只想在 Windows 本机试运行，请按“本地部署”章节操作；如果要发布到公网，
再继续完成“Cloudflare 人工配置”和“远程验收”。

### 已完成阶段速览

| 阶段      | 已交付内容                                                                               |
| --------- | ---------------------------------------------------------------------------------------- |
| Phase 0–2 | 本地优先基础、FQGate 生命周期、Bridge/API、QR/session 基础和 loopback 安全边界           |
| Phase 3   | 本地更新中心、版本/健康/回滚保护、Runtime OpenAPI 和 API Reference                       |
| Phase 4   | remotely-managed Tunnel、ordinary human Access、远程 Dashboard/QR/status/reference       |
| Phase 4.5 | 独立 remote-admin、移动 Dashboard、CSRF/intent 和一次性 apply confirmation               |
| Phase 5-A | 独立 remote-machine JWT/context、完整零权限 registry、Windows/CI/真实 service-token 验收 |
| Phase 5-B | 永久 Windows 实时 contract census 与一个受限六位代码查询                                 |
| Phase 5-C | registry-derived machine OpenAPI 与最终 Windows/远程/CI 闭包                             |

每个阶段的关闭证据仍保留在文档索引中；“已关闭”只表示该阶段的验收合同完成，不表示
整个项目停止开发。

## 1. 用人话理解系统

### 1.1 四层结构

```
本机浏览器 / 本机 CLI
        │
        ▼
Bridge  127.0.0.1:17282
        │  先判断 Host、身份和 operation policy
        │
        ▼
FQGate  127.0.0.1:17281

公网客户端 / Agent
        │
        ▼
Cloudflare Access 认证
        │
        ▼
Cloudflare Tunnel / cloudflared
        │  只允许转发到 127.0.0.1:17282
        ▼
Bridge 重新验证 Access JWT，再执行 operation policy
```

Cloudflare Access 是第一道门，Bridge 是第二道门。即使 Tunnel 配错、Access 被
绕过，Bridge 仍然必须拒绝伪造的 JWT、未知 Host、未注册路径和不允许的 operation。

### 1.2 四种请求上下文

| 上下文         | 如何产生                                                | 当前权限                                   |
| -------------- | ------------------------------------------------------- | ------------------------------------------ |
| local          | loopback Host，例如 127.0.0.1:17282                     | 本地策略允许的本地操作                     |
| remote_human   | 精确匹配普通远程 hostname，并通过 human Access          | Phase 4 远程人工只读面                     |
| remote_admin   | 精确匹配独立管理员 hostname，并通过独立 human JWT/AUD   | Phase 4.5 的有限维护面                     |
| remote_machine | 精确匹配独立 machine hostname，并通过 service-token JWT | market.instruments.lookup、openapi.machine |

remote_machine 不是“管理员的另一种登录方式”。它有独立的 hostname、Access
application、AUD、JWT claim validator 和 principal kind。Phase 5-A 的成功标准就是：
合法机器身份能到达 Bridge，但仍然是零权限。

### 1.3 当前远程 operation surface

Bridge 的权限由服务器端 operation registry 决定，不由页面按钮、OpenAPI 文档或
Cloudflare hostname 单独决定。当前远程面是：

| 上下文         | 当前允许的 operation                                                                                                                                           |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| remote_human   | bridge.version、bridge.capabilities、bridge.status、session.qr.begin、session.qr.poll、updates.status、openapi.catalog                                         |
| remote_admin   | 上述七个 operation，外加 updates.check、updates.plan、updates.apply、openapi.refresh；维护操作还要通过独立 admin JWT、Origin/intent 和 apply confirmation 约束 |
| remote_machine | market.instruments.lookup、openapi.machine；全部旧 operation 继续拒绝，包括 bridge.version                                                                     |

任何未列出的 FQGate path 都不是 Bridge API。不要因为某个路径出现在 FQGate 的
Runtime OpenAPI 中，就认为它可以远程调用。

### 1.4 绝对不能破坏的边界

- FQGate 只能监听 127.0.0.1:17281。
- Bridge 只能监听 127.0.0.1:17282。
- Tunnel ingress 只能指向 http://127.0.0.1:17282，绝不能指向 17281。
- 未知 Host、X-Forwarded-Host/Forwarded spoofing、未注册 FQGate path 都必须失败。
- Runtime /openapi.json 只能描述上游能力，不能自动授予 Bridge 权限。
- machine service token、Access assertion、JWT、cookie、Tunnel token 不进入 Git、
  普通配置、日志、命令行参数、浏览器存储或测试证据。
- 不添加交易、下单、撤单、资金划转、券商控制或任何金融状态变更能力。
- Cloudflare Phase 6-A 只提供固定 API 的 GET-only discovery/plan；不创建、更新、删除
  或取得 Tunnel token。任何 Cloudflare mutation 属于独立的 Phase 6-B。

## 2. 文档地图：遇到问题先看哪里

| 目的                         | 文档                                                                                                                                                                                                    |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Agent 的强制工作合同         | [AGENTS.md](AGENTS.md)                                                                                                                                                                                  |
| 当前架构和安全边界           | [docs/architecture.md](docs/architecture.md)、[docs/security.md](docs/security.md)                                                                                                                      |
| 当前阶段总设计               | [phase-5-remote-machine-read-only-api.md](docs/plans/phase-5-remote-machine-read-only-api.md)                                                                                                           |
| Phase 5-C 已关闭任务         | [phase-5-c-filtered-machine-openapi-and-remote-closure.md](docs/tasks/phase-5-c-filtered-machine-openapi-and-remote-closure.md)                                                                         |
| Phase 5-C 实现与关闭证据     | [phase-5-c-implementation-handoff.md](docs/status/phase-5-c-implementation-handoff.md)                                                                                                                  |
| Post-Phase-5 兼容任务        | [post-phase-5-fqgate-release-compatibility-and-1-0-2-refresh.md](docs/tasks/post-phase-5-fqgate-release-compatibility-and-1-0-2-refresh.md)                                                             |
| 1.0.2 永久 Windows 验收      | [windows-post-phase-5-fqgate-1-0-2-qualification.md](docs/operations/windows-post-phase-5-fqgate-1-0-2-qualification.md)                                                                                |
| 1.0.2 实现交接               | [post-phase-5-fqgate-1-0-2-implementation-handoff.md](docs/status/post-phase-5-fqgate-1-0-2-implementation-handoff.md)                                                                                  |
| Phase 6-A 设计/任务          | [phase-6 design](docs/plans/phase-6-cloudflare-provisioning-and-drift-management.md)、[phase-6-a task](docs/tasks/phase-6-a-cloudflare-readonly-discovery-and-plan.md)                                  |
| Phase 6-A Windows 验收       | [windows-phase-6-a-acceptance.md](docs/operations/windows-phase-6-a-acceptance.md)                                                                                                                      |
| Phase 6-A 实现交接           | [phase-6-a-implementation-handoff.md](docs/status/phase-6-a-implementation-handoff.md)                                                                                                                  |
| Phase 5-B 已关闭任务         | [phase-5-b-live-contract-census-and-first-read-only-slice.md](docs/tasks/phase-5-b-live-contract-census-and-first-read-only-slice.md)                                                                   |
| Phase 5-B 已完成 Codex Goal  | [phase-5-b-codex-goal.md](docs/prompts/phase-5-b-codex-goal.md)                                                                                                                                         |
| Phase 5-A 已关闭任务         | [phase-5-a-remote-machine-zero-privilege.md](docs/tasks/phase-5-a-remote-machine-zero-privilege.md)                                                                                                     |
| Phase 5-A 实现和关闭证据     | [phase-5-a-implementation-handoff.md](docs/status/phase-5-a-implementation-handoff.md)                                                                                                                  |
| 永久 Windows 验收步骤        | [windows-phase-5-a-acceptance.md](docs/operations/windows-phase-5-a-acceptance.md)                                                                                                                      |
| 给 Agent 的快速交接          | [docs/agent-guide.md](docs/agent-guide.md)                                                                                                                                                              |
| Phase 4.5 管理员配置和重配置 | [windows-phase-4-5-remote-admin-setup.md](docs/operations/windows-phase-4-5-remote-admin-setup.md)                                                                                                      |
| Phase 4 设计、任务和验收     | [phase-4 design](docs/plans/phase-4-secure-remote-human-access.md)、[phase-4 task](docs/tasks/phase-4-cloudflare-tunnel-access.md)、[phase-4 acceptance](docs/operations/windows-phase-4-acceptance.md) |
| Phase 3 实现和 Windows 验收  | [phase-3 handoff](docs/status/phase-3-implementation-handoff.md)、[phase-3 acceptance](docs/operations/windows-phase-3-acceptance.md)                                                                   |
| 路线图和后续阶段             | [docs/roadmap.md](docs/roadmap.md)                                                                                                                                                                      |

后续每完成一个阶段，至少应同步更新：README 当前状态、可执行部署路径、人工边界、
自动验收命令、非敏感证据和 Agent prompt。不要只改代码而让 README 继续描述旧安全边界。

### 2.1 Phase 6-A 只读检查

先准备 repo 外 desired-state JSON（可从
`config/cloudflare-phase6a-desired.example.json` 开始），再在永久 Windows 工作树执行：

```powershell
Set-Location D:\code\research\fqgate-remote-bridge
node .\dist\cli\main.js cloudflare plan `
  --desired-state D:\code\research\fqgate-phase6a-desired.json --json
```

CLI 不接受 token 参数；永久 Windows 完整验收和隐藏 `Read-Host -AsSecureString`
输入边界见 [Phase 6-A Windows 验收](docs/operations/windows-phase-6-a-acceptance.md)。
这个命令只能发现和生成计划，不能 apply。

## 3. 第一次 Windows 本地部署

下面的步骤不需要 Cloudflare，不会创建公网入口，适合第一次安装和排查 FQGate/Bridge。

### 3.1 前置条件

需要：

- Windows x64，并且有一个已经登录的交互式 Windows 用户会话；FQGate 是桌面进程，
  当前不提供 headless Windows service 模式；
- Node.js 22 或更高版本；
- Git、PowerShell 和 Corepack；
- 可访问 GitHub release metadata 和官方 FQGate release manifest 的网络；
- 如果要做公网验收，还需要自己的 Cloudflare zone、Access 权限和一个已经存在的
  remotely-managed Tunnel。

确认 Node 和 Corepack：

```powershell
node --version
corepack enable
corepack pnpm --version
```

仓库锁定的包管理器版本在 package.json 的 packageManager 字段中。不要自行替换
成未验证的 pnpm 主版本。

### 3.2 获取或同步仓库

永久 Windows 验收环境使用已有工作树，不要为了验收另建临时 checkout：

```powershell
Set-Location D:\code\research
git clone https://github.com/blooddrunk/fqgate-remote-bridge.git
Set-Location .\fqgate-remote-bridge
```

如果目录已经存在，先看有没有 operator 的未提交修改：

```powershell
Set-Location D:\code\research\fqgate-remote-bridge
git status --short --branch
git fetch origin
git pull --ff-only
```

看到未提交修改时，先停下来让修改拥有者决定如何处理。不要用
git reset --hard、git checkout -- 或强制覆盖来“同步最新代码”。

### 3.3 安装依赖并构建

从仓库根目录执行：

```powershell
corepack pnpm install --frozen-lockfile
corepack pnpm typecheck
corepack pnpm lint
corepack pnpm test
corepack pnpm build
corepack pnpm format:check
corepack pnpm test:e2e
```

test:e2e 使用 Playwright；在 Windows GitHub Actions 中，浏览器 E2E 按 workflow
条件跳过，但 Windows CLI 和 production loopback smoke 仍然执行。Ubuntu CI 会执行
浏览器 E2E。

### 3.4 安装并检查 FQGate

先查看当前受支持的官方 release：

```powershell
node .\dist\cli\main.js fqgate release --json
```

首次安装必须先预览：

```powershell
node .\dist\cli\main.js fqgate install --dry-run --json
```

确认输出中的版本、Windows x64 asset、文件大小和 SHA-256 后，再执行明确的安装：

```powershell
node .\dist\cli\main.js fqgate install --json
node .\dist\cli\main.js fqgate status --json
node .\dist\cli\main.js fqgate health --json
```

默认安装目录是当前 Windows 用户的：

```text
C:\Users\<当前用户>\AppData\Local\FQGateRemoteBridge\fqgate\current\fqgate.exe
```

不要假设别的 Windows 用户目录下有同一个 fqgate.exe，也不要手工复制一个未经
校验的 exe。fqgate status --json 输出的 process.expectedPath 才是当前配置真正使用
的路径；如果显示 lifecycle: not_installed，重新执行 dry-run 和显式 install。

### 3.5 本地配置文件

只做本地测试时可以不创建配置文件，程序会使用安全默认值：

```text
FQGate  http://127.0.0.1:17281
Bridge  http://127.0.0.1:17282
```

需要公网 hostname 时，配置文件应放在仓库外，例如：

```text
D:\code\research\fqgate-acceptance-config.json
```

用 Notepad 或受控配置工具创建它。下面是模板；把所有尖括号占位符替换成真实的
非秘密值后再保存。配置 schema 对未知字段会 fail closed，因此不要自行添加字段。

```json
{
  "installDirectory": "C:\\Users\\<WindowsUser>\\AppData\\Local\\FQGateRemoteBridge",
  "fqgateBaseUrl": "http://127.0.0.1:17281",
  "remoteAccess": {
    "remoteHostname": "fqgate.<your-domain>",
    "adminHostname": "fqgate-admin.<your-domain>",
    "machineHostname": "fqgate-api.<your-domain>",
    "adminAccess": {
      "teamDomain": "<your-team>.cloudflareaccess.com",
      "audience": "<ADMIN_APPLICATION_AUD>"
    },
    "machineAccess": {
      "teamDomain": "<your-team>.cloudflareaccess.com",
      "audience": "<MACHINE_APPLICATION_AUD>"
    }
  },
  "cloudflared": {
    "releaseVersion": "2026.9.0",
    "installDirectory": "C:\\Program Files\\FQGateRemoteBridge\\cloudflared",
    "tokenFile": "C:\\ProgramData\\FQGateRemoteBridge\\secrets\\tunnel-token",
    "serviceName": "FQGateRemoteBridgeCloudflared"
  }
}
```

规则：

- 三个 hostname 必须两两不同；每个 hostname 必须和对应 Cloudflare Access application
  对应；
- adminAccess.audience 和 machineAccess.audience 必须来自不同的 Access application；
- teamDomain 只允许形如 <team>.cloudflareaccess.com 的固定团队域名；Bridge 会从它
  派生固定的 /cdn-cgi/access/certs JWK endpoint，不接受任意 JWKS URL；
- audience、hostname 和 release metadata 可以放在 repo 外的普通 JSON；Client ID、
  Client Secret、JWT、cookie 和 Tunnel token 不能放进去；
- cloudflared.tokenFile 必须是仓库外的绝对路径。它是路径，不是 token 本身。

当前永久验收实例使用的非秘密 hostname 是：

```text
ordinary human: fqgate.haoqi90.top
admin:          fqgate-admin.haoqi90.top
machine/API:    fqgate-api.haoqi90.top
team domain:    haoqi90.cloudflareaccess.com
```

如果 Access application 被删除重建，AUD 会改变；从新 application 的 Additional
settings 重新复制 AUD，不要继续使用旧值。

### 3.6 启动本地 Dashboard 和 Bridge

在已经登录的 Windows 用户会话中执行：

```powershell
.\scripts\windows\start-phase4.cmd -ConfigPath D:\code\research\fqgate-acceptance-config.json -NoBrowser
```

如果只做本地测试，可以省略 ConfigPath。如果 FQGate 尚未安装，launcher 会提示
先执行 dry-run；确认 release 后重新运行并明确加上 InstallFqgate：

```powershell
.\scripts\windows\start-phase4.cmd -ConfigPath D:\code\research\fqgate-acceptance-config.json -InstallFqgate -NoBrowser
```

这个 launcher 只负责依赖检查、构建、启动受管 FQGate 和 loopback Bridge。它不会自动
创建 Cloudflare application、DNS、Tunnel、service token，也不会把 FQGate 安装成
Windows service。

本地页面：

- Dashboard：<http://127.0.0.1:17282/>
- QR 登录：<http://127.0.0.1:17282/login>
- 更新中心：<http://127.0.0.1:17282/updates>
- API Reference：<http://127.0.0.1:17282/api-reference>

按 Ctrl+C 停止 launcher 管理的 Bridge。FQGate 是否停止由 CLI 单独决定：

```powershell
node .\dist\cli\main.js fqgate stop --config D:\code\research\fqgate-acceptance-config.json
```

### 3.7 本地最小验证

```powershell
node .\dist\cli\main.js version --json
node .\dist\cli\main.js fqgate status --json --config D:\code\research\fqgate-acceptance-config.json
node .\dist\cli\main.js fqgate health --json --config D:\code\research\fqgate-acceptance-config.json
Get-NetTCPConnection -State Listen -LocalPort 17281,17282 | Select-Object LocalAddress,LocalPort,OwningProcess
```

必须看到：

```text
127.0.0.1:17281  FQGate
127.0.0.1:17282  Bridge
```

然后运行已有 Windows smoke：

```powershell
.\scripts\windows\acceptance.ps1 -ConfigPath D:\code\research\fqgate-acceptance-config.json -VerifyCli -VerifyBridge
```

以及 Phase 5-A 的本地检查：

```powershell
.\scripts\windows\phase5a-acceptance.ps1 -ConfigPath D:\code\research\fqgate-acceptance-config.json -VerifyLocal
```

P5A-W3 SKIP 是正常的：它把外部 Tunnel ingress 检查留给后面的认证验收；其它
loopback、raw path、Host spoofing、配置碰撞检查必须通过。

## 4. Cloudflare 在这里到底做什么

### 4.1 Tunnel 和 Access 的分工

- **Cloudflare Tunnel**：提供一条从 Cloudflare 到 Windows 的出站连接，不需要在路由器
  上开入站端口。它只负责把指定 hostname 的请求送到固定 origin。
- **Cloudflare Access application**：决定哪些请求可以进入某个 hostname，并签发
  Access application JWT。
- **Bridge**：不能只相信请求“经过了 Cloudflare”。它还要验证
  Cf-Access-Jwt-Assertion 的签名、issuer、AUD、时间和身份 claim，然后再检查本地
  operation registry。

因此 machine Access application 的作用是：给无浏览器、无人工 MFA 的程序提供一扇
独立的受控入口。它不等于给程序管理员权限；在已关闭的 Phase 5-A 检查点，合法 machine
service token 只能证明“这是被登记的机器”，随后仍会被 Bridge 的零权限 policy 拒绝。

### 4.2 三个公网 hostname 必须各自隔离

推荐的长期拓扑如下：

| hostname                 | Access application   | 凭据/身份                         | Bridge context |
| ------------------------ | -------------------- | --------------------------------- | -------------- |
| fqgate.haoqi90.top       | ordinary human app   | 人工登录/MFA                      | remote_human   |
| fqgate-admin.haoqi90.top | 独立 admin human app | 管理员身份/MFA                    | remote_admin   |
| fqgate-api.haoqi90.top   | 独立 machine app     | Service Auth + 单个 service token | remote_machine |

三个 hostname 可以共享同一个 Tunnel，但不能共享 application、AUD 或 policy。三个
Published application route 都只能指向：

```text
http://127.0.0.1:17282
```

机器入口不要复用 admin hostname，也不要把 admin 的 Allow/MFA policy 复制给 machine
入口。

## 5. Cloudflare 手动配置：从零完成 machine/API 入口

本节是人工操作说明。仓库当前不自动创建 Cloudflare 资源。Cloudflare 控制台文案
可能有中英文差异，但菜单语义应一致。

官方参考：

- [Publish a self-hosted application](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/self-hosted-public/)
- [Create and use service tokens](https://developers.cloudflare.com/cloudflare-one/access-controls/service-credentials/service-tokens/)
- [Access policy actions](https://developers.cloudflare.com/cloudflare-one/access-controls/policies/)
- [Validate Cloudflare Access JWTs](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/)
- [Configure Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/configure-tunnels/)

### 5.1 准备信息

先准备以下非秘密信息：

```text
machine hostname: fqgate-api.<your-domain>
team domain:     <your-team>.cloudflareaccess.com
origin:          http://127.0.0.1:17282
Tunnel:          已存在的 remotely-managed Tunnel
```

Client ID 和 Client Secret 不要写进这张清单；它们只在隐藏输入或安全凭据管理器中
短暂使用。

### 5.2 创建独立 service token

1. 登录 Cloudflare Dashboard。
2. 进入 Zero Trust → Access controls → Service credentials → Service Tokens。
3. 选择 Create Service Token。
4. 使用可区分用途的名称，例如 fqgate-machine-<environment>。
5. 选择合理的过期时间；不要默认把长期凭据当成永久凭据。
6. 生成后立即把 Client ID 和 Client Secret 放入安全凭据管理器。Cloudflare 不会在
   后续页面再次显示完整 Client Secret，丢失时需要轮换/重新生成。

不要把 Client ID/Secret 粘贴到聊天、Git、README、普通 JSON、URL、PowerShell 命令
参数、shell history、截图或日志。不要用浏览器 cookie 代替 service token。

### 5.3 创建独立 machine Access application

1. 进入 Zero Trust → Access controls → Applications。
2. 选择 Create new application。
3. 选择 Self-hosted（新界面可能显示为 Self-hosted and private）。
4. 添加 public hostname：fqgate-api.<your-domain>。
5. session duration 选择符合运营要求的短周期；machine 凭据本身仍受 token expiry
   控制。
6. 确保这是一个新 application，不要编辑 ordinary human 或 admin application。
7. 保存 application。
8. 打开该 application 的 Additional settings，复制 Application Audience
   (AUD) Tag，只把 AUD 写入 repo 外的非秘密配置文件。

Cloudflare Access application 负责边缘认证；Bridge 仍会用固定的
https://<team>.cloudflareaccess.com/cdn-cgi/access/certs endpoint 验证 JWT 签名。
当前 Bridge 还会要求 machine JWT 是 RS256、精确 issuer/AUD、type=app、有界非空
common_name 和空 sub。不要把 human JWT 的非空 sub 规则套到 machine 上。

### 5.4 添加唯一的 Service Auth policy

在 machine application 的 Access policies 中：

1. 新建 policy。
2. Action 选择 Service Auth。
3. Rule type 选择 Include。
4. Selector 选择 Service Token。
5. Value 只选择刚才创建的那个 machine service token。
6. 保存并确认 policy 生效。

必须同时检查：

- 不存在 Bypass / Everyone；
- 不存在面向所有人的宽泛 Allow；
- 不要把 ordinary human 或 admin group 加到 machine application；
- 如果控制台提供 “401 Response for Service Auth policies”，建议开启，便于无凭据
  请求明确返回 401，而不是被误导到人工登录页面。

Service Auth 的意义是让自动化程序用两个请求头认证：

```text
CF-Access-Client-Id: <CLIENT_ID>
CF-Access-Client-Secret: <CLIENT_SECRET>
```

这两个值只能由验收 harness 通过隐藏提示读取；不要照抄到命令行里测试。

### 5.5 为 machine hostname 添加 Tunnel route

在 Zero Trust → Networks → Tunnels → <现有 Tunnel> → Public Hostnames：

1. 添加 hostname fqgate-api.<your-domain>。
2. service/origin 精确填写：http://127.0.0.1:17282。
3. 不要填写 http://127.0.0.1:17281。
4. 保留或设置 Cloudflare Access protection；不要创建公开 bypass route。
5. 检查同一个 Tunnel 的所有已有 route，确认 machine hostname 没有额外 path route。
6. 保留末尾的 deny/catch-all 行（如果当前 Tunnel 配置使用它）。

Cloudflare Dashboard 管理的 remotely-managed Tunnel 的配置保存在 Cloudflare；但
Windows 端的 cloudflared service 仍然要使用 repo 外、ACL 保护的 token file。

### 5.6 DNS

如果 zone 使用 Cloudflare full DNS setup，添加 Published application route 后通常
会自动创建 proxied DNS 记录。否则在 DNS provider 创建指向现有 Tunnel hostname 的
proxied CNAME；不要创建指向 Windows、家庭路由器、17281 或 17282 的 A/AAAA 记录。

确认 DNS 解析和 Tunnel route 都存在后，再开始 Bridge 验收。DNS 成功不代表 Bridge
成功；还必须检查 Access challenge、Tunnel origin 和 Bridge policy。

### 5.7 把非秘密值写入 Bridge 配置

把 hostname、team domain 和 machine application AUD 写进仓库外的 JSON；不要把 service
token 写进它。当前 machine 部分的最小配置形态是：

```json
{
  "remoteAccess": {
    "machineHostname": "fqgate-api.<your-domain>",
    "machineAccess": {
      "teamDomain": "<your-team>.cloudflareaccess.com",
      "audience": "<MACHINE_APPLICATION_AUD>"
    }
  }
}
```

如果同一实例还提供 human/admin hostname，则把对应的 remoteHostname、
adminHostname、adminAccess 一并配置。每个 hostname 和 Access application 必须
一一对应；缺 hostname 或缺它对应的 team domain/AUD 会被当成 incomplete config 而拒绝。

## 6. Windows cloudflared service 的安全配置

### 6.1 安装官方固定版本

从仓库根目录执行，先看 release，再 dry-run，最后才显式安装：

```powershell
node .\dist\cli\main.js cloudflared release --json --config D:\code\research\fqgate-acceptance-config.json
node .\dist\cli\main.js cloudflared install --dry-run --json --config D:\code\research\fqgate-acceptance-config.json
node .\dist\cli\main.js cloudflared install --json --config D:\code\research\fqgate-acceptance-config.json
```

Bridge 只接受固定的 Cloudflare GitHub release metadata 和 Windows x64 asset，并会
验证版本、大小、SHA-256 以及 --token-file 支持。不要给它任意下载 URL。

### 6.2 创建并保护 Tunnel token file

token file 必须在仓库外，例如：

```text
C:\ProgramData\FQGateRemoteBridge\secrets\tunnel-token
```

通过组织批准的 secret manager 或管理员的隐藏输入流程写入它。最低要求是：

- 文件只有 Tunnel token 和换行；
- Windows ACL 去掉继承；
- NT AUTHORITY\SYSTEM 具有读取权限；
- BUILTIN\Administrators 具有管理权限；
- 不允许 Everyone、BUILTIN\Users 或 Authenticated Users；
- service command line 中只有 --token-file <path>，没有 raw token。

如果必须由人工在 PowerShell 输入 token，使用隐藏提示并在完成后清理变量；不要使用
echo <token>、Set-Content -Value <raw-token> 或把 token 作为命令行参数。现有
Bridge 的 token-file 检查会拒绝 missing、unreadable 或不安全 ACL。

### 6.3 安装、启动和检查 Windows service

```powershell
node .\dist\cli\main.js cloudflared service install --json --config D:\code\research\fqgate-acceptance-config.json
node .\dist\cli\main.js cloudflared service start --json --config D:\code\research\fqgate-acceptance-config.json
node .\dist\cli\main.js cloudflared status --json --config D:\code\research\fqgate-acceptance-config.json
Get-Service -Name FQGateRemoteBridgeCloudflared
```

期望的 service invocation 形态：

```text
cloudflared tunnel run --token-file <protected-token-file>
```

Windows 重启后，cloudflared 可能先显示 Running，但 FQGate 是交互式桌面进程，Bridge
尚未启动时公网返回 502 是预期故障形态。先登录 Windows 用户会话并重新运行
start-phase4.cmd，不要因为 502 就把 Tunnel 改到 17281。

## 7. 远程验收：按这个顺序测试

### 7.1 不带凭据的边缘测试

不要使用 -L 跟随 redirect，也不要把响应头或 body 倾倒到日志：

```powershell
curl.exe -sS -o NUL -w "machine=%{http_code}" https://fqgate-api.haoqi90.top/
```

预期是 Access challenge/deny，通常为 HTTP 401、302、303、307、308 或 403；没有
service credential 时不能直接得到 Bridge 成功响应。

### 7.2 使用隐藏凭据的 Phase 5-A acceptance

确认以下事项后，保持 cloudflared service 和 loopback Bridge 运行：

```powershell
Set-Location D:\code\research\fqgate-remote-bridge
.\scripts\windows\phase5a-acceptance.ps1 -ConfigPath D:\code\research\fqgate-acceptance-config.json -RunAuthenticatedServiceTokenMatrix -TunnelIngressConfigPath D:\code\research\fqgate-machine-tunnel-ingress-evidence.json
```

脚本会用 Read-Host -AsSecureString 隐藏提示 Client ID 和 Client Secret，只在内存
中短暂解密，并通过 child-process environment 传递；不会把它们放在命令行参数中。
脚本结束时会清理 secure string、明文引用和 child environment。它只输出有限的
PASS/FAIL、HTTP status 和规范化 error code，不输出 JWT、cookie、response body 或
凭据。

必须看到的关键结果：

| 检查                                         | 预期                                          |
| -------------------------------------------- | --------------------------------------------- |
| 无凭据 machine hostname                      | Access HTTP 401 challenge/deny                |
| 合法 service token + bridge.version          | 到达 Bridge，但 HTTP 403 OPERATION_FORBIDDEN  |
| machine hostname + raw FQGate path           | 不可达，不能返回 FQGate payload               |
| machine credential + ordinary human hostname | 不能取得 human context，通常 HTTP 302         |
| machine credential + admin hostname          | 不能取得 admin context，通常 HTTP 302         |
| Tunnel ingress                               | 只包含 http://127.0.0.1:17282，绝不包含 17281 |

不要为了验证拒绝行为调用 updates.apply、交易接口或任何会改变状态的操作。完整
operation deny matrix 在 deterministic tests 中执行。

### 7.3 继续验证现有 human/admin 入口

Phase 5-A 不能破坏 Phase 4/4.5。用普通浏览器分别访问：

```text
https://fqgate.haoqi90.top/
https://fqgate-admin.haoqi90.top/
```

普通入口应使用 human Access policy；管理员入口应使用独立 admin application、指定
管理员身份、MFA 和短会话。管理员入口不应使用 machine service token，也不应通过
Bypass 或共享 AUD 放宽策略。

## 8. 失败时如何判断

| 现象                                            | 先检查                                                              | 不要做                                          |
| ----------------------------------------------- | ------------------------------------------------------------------- | ----------------------------------------------- |
| fqgate 显示 not_installed                       | fqgate install --dry-run、fqgate install、expectedPath              | 不要猜 exe 路径或复制别的用户目录               |
| 本地 Bridge 502/无法启动                        | FQGate health、17281/17282 loopback listener、是否重复启动 Bridge   | 不要把 Tunnel 改到 17281                        |
| 公网无凭据返回 401                              | 这是 machine Access challenge，继续做隐藏凭据验收                   | 不要把 token 写入 URL                           |
| 合法 machine token 返回 403 OPERATION_FORBIDDEN | 这是 Phase 5-A 成功的零权限结果                                     | 不要为了“打通”而把 machine 加入 allowedContexts |
| machine token 在 human/admin hostname 302       | 这是预期隔离结果；检查是否访问错 hostname                           | 不要复用 admin AUD 或 Allow policy              |
| 出现 RAW_ROUTE_REACHED 或 FQGate payload        | 立即停止远程验收，检查 Tunnel route 是否误指向 17281                | 不要继续发请求                                  |
| 配置报 hostname/AUD incomplete                  | 检查 hostname 与对应 *Access 是否成对、AUD 是否来自正确 application | 不要填任意 JWKS URL 或共享 AUD                  |
| service status 是 Running 但公网 502            | 交互式启动 FQGate 和 Bridge 后重试                                  | 不要重建 Tunnel 或开路由器端口                  |

如果真实 service-token acceptance 无法完成，Phase 5-A 必须保持 OPEN。报告必须写出
具体失败检查 ID、HTTP status/error code、已经自动验证到哪一步和下一项 operator
确切动作，不能只写“manual evidence incomplete”。

## 9. 给后续 coding Agent 的工作 prompt

将下面的 prompt 原样交给新的 coding Agent，再根据当前任务追加一段具体目标。它的
作用是让 Agent 先理解边界，再动代码或 Cloudflare 外部状态：

```text
你正在维护 blooddrunk/fqgate-remote-bridge。

开始前按顺序阅读：
1. README.md
2. AGENTS.md
3. docs/architecture.md
4. docs/security.md
5. docs/upstream-contracts.md
6. docs/roadmap.md
7. 当前 active docs/tasks/ 下的 task package
8. 对应 docs/plans/ 设计文档
9. docs/agent-guide.md

把 task package 当成可执行验收合同。先定位已有 Git working tree；Windows 永久环境
优先使用 D:\code\research\fqgate-remote-bridge。先检查 git status，保护 operator
已有未提交修改，禁止 git reset --hard、git checkout -- 或强制覆盖。

不可破坏的安全边界：
- FQGate 只能是 127.0.0.1:17281；Bridge 只能是 127.0.0.1:17282。
- cloudflared/Tunnel 只能指向 http://127.0.0.1:17282，绝不能指向 17281。
- unknown Host、Forwarded/X-Forwarded-Host spoofing、raw/unregistered path 都必须
  fail closed。
- Runtime /openapi.json 只是描述，不是授权源；Bridge operation registry 才是授权源。
- 不添加交易、下单、撤单、资金划转或其它金融状态变更能力。
- 不把 Client ID、Client Secret、JWT、cookie、Tunnel token、QR/session material、
  confirmation grant 写入 Git、普通配置、日志、命令行参数、聊天或测试证据。

Cloudflare 规则：
- machine 必须使用独立 hostname、独立 Access application、独立 AUD 和独立 machine
  JWT claim validator；不能复用 human/admin claim validator 或 admin confirmation。
- team domain 只能派生固定 /cdn-cgi/access/certs endpoint；不能接受任意 JWKS URL。
- Cloudflare provisioning automation 属于 Phase 6。没有明确授权时，只给出人工步骤；
  有明确授权且凭据位于 repo 外时，先读现状、做最小有界修改、保留现有 routes/policies，
  从不打印或记录 secret。
- 需要 service credential 的 Windows 验收必须使用 Read-Host -AsSecureString；只在
  内存中短暂解密，经 child-process environment 传递，并在 finally 清理；禁止命令行参数。

实现前先写出影响的 context、operation、hostname、AUD、测试和文档；完成后自动执行
适用的 install/typecheck/lint/test/build/format/e2e、Windows CLI/loopback smoke、
确定性 authorization matrix 和真实 acceptance。没有真实证据不要声称阶段关闭。

本次具体目标：
<在这里填写本次任务；如果任务属于 Phase 5-B 或更晚阶段，先确认 Phase 5-A 证据和
task package 允许开始，不要顺手扩大权限。>
```

如果 Agent 需要修改 Cloudflare 资源，另外明确写清楚：目标 account/zone/Tunnel、
允许修改的 hostname/app/policy、是否允许使用 repo 外 token 文件，以及完成后必须用
非敏感 read-back 证明什么。没有这些授权时，Agent 不应猜测 Cloudflare 账户或创建
宽权限资源。

## 10. 日常 CLI 和开发命令

```powershell
# FQGate
node .\dist\cli\main.js fqgate release --json
node .\dist\cli\main.js fqgate status --json
node .\dist\cli\main.js fqgate health --json
node .\dist\cli\main.js fqgate qualify --json
node .\dist\cli\main.js fqgate start --json
node .\dist\cli\main.js fqgate stop --json
node .\dist\cli\main.js fqgate restart --json

# cloudflared：只做显式、可审查的操作
node .\dist\cli\main.js cloudflared release --json
node .\dist\cli\main.js cloudflared install --dry-run --json
node .\dist\cli\main.js cloudflared status --json
node .\dist\cli\main.js cloudflared service install --json
node .\dist\cli\main.js cloudflared service start --json
node .\dist\cli\main.js cloudflared service restart --json
```

CLI 不会在页面加载、Bridge 启动或后台定时器中下载/更新 cloudflared，不会自动
重配置 Tunnel，也不会创建 Access policy。

## 11. 当前阶段和后续边界

Phase 5 已经完成真实 FQGate census、首个受限目录查询、registry-derived machine
OpenAPI，以及永久 Windows、真实 service-token 和双平台 CI 闭包。
机器身份只能调用显式注册的目录查询和机器文档，不能继承其他任何旧 operation 权限。

尚未授权或未实现的工作包括：

- 首批以外的行情 API；
- Phase 6 Cloudflare provisioning automation；
- supervisor、notifications、automatic updates；
- MCP、WebSocket、最终 packaging；
- 任何交易或金融状态变更能力。

## 12. 变更后必须同步的文档

如果修改了 request context、Access/JWT、hostname/AUD、Tunnel origin、Windows
token 行为、operation registry、远程权限或验收流程，必须在同一变更中检查并更新：

1. 本 README 的当前状态、部署步骤和故障判断；
2. [AGENTS.md](AGENTS.md) 的活动阶段与硬约束；
3. [docs/security.md](docs/security.md) 和 [docs/architecture.md](docs/architecture.md)；
4. 当前 phase plan/task package；
5. implementation/status handoff；
6. Windows operator procedure/evidence；
7. 给后续 Agent 的 prompt。

这样 README 才是新 operator 的入口，task package 才是验收合同，status 文档才是事实
证据，三者不会再次脱节。

## Phase 5-B 当前只读 API（CLOSED）

永久 Windows live census 已选择 `market.instruments.lookup`：
`POST /api/v1/instruments/lookup`，JSON body 只能是六位代码对象，例如
`{ "code": "600000" }`。仅 `local` 与 `remote_machine` 可用，human/admin 不允许。
返回 `{ "items": [...] }`，每项只有 `code`、`market`、`name`、`instrumentId`；
按完整代码过滤，零匹配返回空数组。最多 16 项、上游 64 KiB、请求 256 bytes，
不接收任意 pattern、URL、path、method 或 limit。报价仍未开放。

这是历史 Phase 5-B closure 的 1.0.1 证据；当时未来版本或结构漂移会关闭此操作，
本地诊断/维护保留。当前 post-Phase-5 maintenance 改由 operation evidence qualification
处理，见下方 ACTIVE 章节，不把新版本预先加入默认兼容版本列表。
`LOGIN_REQUIRED` 必须使用现有本地 `/login` 物理 QR 登录后重试。

重复执行与隐藏 service-token 输入步骤见
[Phase 5-B Windows 验收](docs/operations/windows-phase-5-b-acceptance.md)，
实际证据与后续边界见 [实现交接](docs/status/phase-5-b-implementation-handoff.md)。
既有 Phase 5-A 命令用于旧权限回归；新行情成功验收使用 Phase 5-B 命令。

## Phase 5-C machine OpenAPI（CLOSED）

`GET /api/v1/openapi/machine` 对 `local` 与 `remote_machine` 开放，对
`remote_human` 与 `remote_admin` 拒绝。文档只从 Bridge operation registry 中
明确允许 `remote_machine` 且带有公开 schema metadata 的条目生成；当前恰好包含：

- `POST /api/v1/instruments/lookup`（`market.instruments.lookup`）；
- `GET /api/v1/openapi/machine`（`openapi.machine`）。

生成器不读取运行时 FQGate `/openapi.json`，不包含上游 path/schema、兼容性指纹、
Access 配置、文件路径、session/update/admin operation 或 secret。输出顺序稳定并限制在
64 KiB。永久 Windows 本地与远程验收命令见
[Phase 5-C Windows 验收](docs/operations/windows-phase-5-c-acceptance.md)，精确提交、
机器生成的检查总数和 CI 证据见
[Phase 5-C 实现交接](docs/status/phase-5-c-implementation-handoff.md)。

## Post-Phase-5 FQGate 1.0.2 兼容维护（CLOSED）

官方 stable manifest 已发布 FQGate 1.0.2。当前维护任务要求先保留已验收的 1.0.1
回滚能力，再通过固定官方 source、精确 size/SHA-256、health、runtime OpenAPI
required-contract、lookup operation fingerprint 和 bounded exact-code semantic probe
自动资格审查候选版本。候选未通过资格审查时，Bridge 不把它视为可用版本，并由现有
transaction 自动恢复 1.0.1。

lookup 的兼容性现在分两层：全局 lifecycle 只判断 supported base range 和候选是否
通过资格事务；`market.instruments.lookup` 还必须有绑定到当前 artifact 的 operation
evidence、approved transitive-schema fingerprint 和 semantic probe。变更 fingerprint
不会自动获批，仍会 fail closed。历史 1.0.1 状态文件通过受限兼容桥保留 Phase 5
行为；新版本不能只依靠 `validatedVersions`。

官方 1.0.2 identity：

```text
FQGate-1.0.2-windows-x64-UNSIGNED.exe
23065088 bytes
024bf1a395977856e70d7b03a3d6616620f82dfbf4872ca710a70b138ae47bc2
```

永久 Windows 的一键有界流程（包括本地 Phase 5-B/5-C 和真实 remote-machine
service-token matrix）见
[1.0.2 永久 Windows 验收](docs/operations/windows-post-phase-5-fqgate-1-0-2-qualification.md)。
该维护任务已于 2026-09-21 闭环：永久 Windows 的 FQGate 1.0.2 qualification、
本地 Phase 5-B/5-C 回归、真实 remote-machine matrix 与最终 Ubuntu/Windows CI 均通过。
详细证据见 `docs/status/post-phase-5-fqgate-1-0-2-implementation-handoff.md`。

## Phase 6-A — Cloudflare 只读发现与计划（CLOSED）

本阶段只做 Cloudflare 控制面的**只读发现、对账和确定性 drift plan**，不修改真实
Cloudflare 资源。执行合同：
`docs/tasks/phase-6-a-cloudflare-readonly-discovery-and-plan.md`；Codex handoff：
`docs/prompts/phase-6-a-codex-goal.md`。

核心边界：

- Cloudflare API transport 在 Phase 6-A 只允许固定 endpoint family 的 GET；禁止
  POST/PUT/PATCH/DELETE、资源创建/更新/删除、token 轮换和 Global API Key。
- 自动读取并核对 account/zone、Tunnel/config、DNS、human/admin/machine Access
  applications/policies，与 repo 外 desired state 生成稳定 plan/fingerprint。
- Tunnel ingress 必须只指向 `http://127.0.0.1:17282`，任何 17281、错误 origin、
  wildcard/模糊资源或宽泛 Bypass 都标记为冲突，而不是自动修复。
- 永久 Windows 环境固定使用 `D:\code\research\fqgate-remote-bridge`；Cloudflare
  read token 仅通过隐藏输入进入内存，现有 machine service token 继续走既有隐藏输入。
- 只有自动化明确返回 `LOGIN_REQUIRED` 时才允许人工完成本地 FQGate QR；其他确实
  无法自动读取的项必须给出精确 Dashboard 路径、字段、期望值、原因和恢复自动化命令。

Phase 6-B 的真实 provisioning mutation 与 Phase 6-C 闭环均需单独授权。
Phase 6-A 最终实现提交 `9c6babb` 在永久 Windows 通过 14/14 项真实验收，
其中既有 Phase 5-C 远程矩阵 21/21 通过；同一提交的 Ubuntu/Windows CI 通过。
证据与运行 ID 见 [Phase 6-A 实现交接](docs/status/phase-6-a-implementation-handoff.md)。

## Windows 凭据托管与旧 secrets 目录退役（CLOSED）

任务合同见 [验收凭据托管任务](docs/tasks/post-phase-6-a-permanent-windows-acceptance-credential-vault.md)。
目标是在当前 Windows 用户的 Credential Manager 中一次性隐藏录入现有 Cloudflare
只读 API token、machine Client ID 和 Client Secret，以便之后显式选择自动验收。
现在可显式选择 `Prompt` 或 `Vault`；三项真实凭据已在永久 Windows 用户的
Credential Manager 中登记。`LocalSystem` 使用的 Tunnel token 已迁移到受保护的
`C:\ProgramData\FQGateRemoteBridge\secrets\tunnel-token`。服务重启、回滚演练和
真实 human/admin/machine 验证通过后，旧 `D:\code\research\fqgate-secrets` 目录已
清理。Tunnel token 仍是服务文件，不进入用户 Credential Manager。删除旧的本地
Cloudflare API-token 文件不等于撤销远端 token。本任务不授权 Cloudflare 资源变更
或 Phase 6-B。证据见
[实现交接](docs/status/post-phase-6-a-credential-custody-implementation-handoff.md)。
