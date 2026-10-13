# Windows FQGate v2 调查与操作边界

当前结论：只能进行只读发现与非执行式 ZIP 审计。没有安全可用的 v2
安装、升级、降级或回滚命令。不得通过扩大版本范围解除门禁。真实升级
**NOT EXECUTED**；v2 实机协议、签名和目录事务资格 **BLOCKED**。

## 自动只读验收

使用现有永久工作树，先检查并保护 operator state。普通 Windows 用户可运行
元数据/ZIP 检查；读取其他用户的进程路径可能需要已提升的 PowerShell，不能
通过重启进程替代权限不足。无需 Cloudflare 凭据、账号登录或 QR 操作。

```powershell
Set-Location D:\code\research\fqgate-remote-bridge
& 'C:\Program Files\Git\cmd\git.exe' -c safe.directory=D:/code/research/fqgate-remote-bridge status --short --branch
node .\dist\cli\main.js fqgate inspect-v2 --json
node .\dist\cli\main.js fqgate audit-v2 --json
powershell -NoProfile -NonInteractive -File .\scripts\windows\fqgate-v2-observation.ps1 -AuditArchive
```

预期 CLI exit 1，报告包含 `signatureVerified:false`、`installAllowed:false`、
`runtimeQualified:false`、`qualification:BLOCKED`。审计成功还包含 `archive`
统计及 `cleanup:REMOVED`。网络、JSON、哈希、ZIP 错误只返回有界错误，不能
解释为成功。Windows 脚本写入 Git 外
`D:\code\research\fqgate-v2-observation-evidence.json`；缺失 Bridge listener、
不能证明托管进程或无 v2 runtime 时保持 BLOCKED。只记录文件哈希/存在性、
监听/进程 identity 分类及公共发布元数据，不保存配置内容、命令行、session、
账号、token、原始 OpenAPI/行情内容或 stderr。

脚本没有更新/重启功能；临时 ZIP 在正常成功/失败后删除。若进程崩溃留下
`%TEMP%\fqgate-v2-audit-*\untrusted.zip`，确认没有审计仍在运行后才删除
相应临时目录。绝不要执行里面的内容。

## 在升级边界前准备

当前无法提供安全的 v2 activation 命令：尚缺认证公钥、签名算法/字节协议、
撤销/轮换规则、认证防回滚、完整目录事务及隔离 Windows runtime 合同。
即使单独授权生产升级，也不能跳过这些工程阻断。保持现有 1.0.5 文件和进程。

真正升级前，必须在单独授权的窗口完成以下准备：

1. 核对安装配置的 `installDirectory`，完整备份其中 `fqgate` 目录，包括
   `current`、`previous`、`state.json`、`process.json`、`transaction.json`、
   `install.lock`（若存在），并记录现有文件哈希。备份实际 FQGate 用户数据
   路径需要先由上游确认，不能假设 ZIP 目录包含所有 session 数据。
2. 可复制的只读文件检查和备份命令如下；备份目的地须为新的 Git 外保护目录，
   session/配置备份不得上传或提交。复制失败、锁/未完成事务存在或进程 identity
   不匹配时停止，不删除 lock，不接管进程。

```powershell
$config = Get-Content D:\code\research\fqgate-acceptance-config.json -Raw | ConvertFrom-Json
$fqgateDir = Join-Path $config.installDirectory 'fqgate'
Get-ChildItem $fqgateDir -Force
Get-FileHash (Join-Path $fqgateDir 'current\fqgate.exe') -Algorithm SHA256
# 仅在另行确认备份目的地和敏感数据保护后执行复制：
$backup = Join-Path 'D:\code\research' ('fqgate-before-v2-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
if (Test-Path $backup) { throw 'Backup destination exists' }
Copy-Item -LiteralPath $fqgateDir -Destination $backup -Recurse -ErrorAction Stop
```

3. 预期完整备份可读取，原文件/进程不变。普通用户须具有数据目录读权限及
   备份目录写权限；未来服务/进程切换权限须按经过审查的事务确定。
4. 未来升级可能中断 FQGate、QR/session 和 Bridge 上游查询；现阶段不执行。
   L2/连接、并发/队列、错误码、OpenAPI、版本/identity 和监听地址必须在
   隔离授权环境实测；只在精确 `LOGIN_REQUIRED` 时人工登录且需要合法账号权限。
5. 当前没有 v2 rollback 实现，不能给出会覆盖运行文件的恢复命令。出现异常
   时停止操作、保留备份/脱敏证据和原始 1.0.5 运行状态；恢复必须由单独
   审核的目录事务完成。上面只读验收命令可随时重跑以恢复证据采集，不能恢复
   安装资格。不得手写 state、强杀进程或误称不存在的 previous 为可用回滚。

## v2-R1：逐项阻断与恢复自动验证

本轮不修改永久工作树。最终审查脚本的相同字节副本位于 Git 外
`D:\code\research\fqgate-v2-r1-evidence\observer-code`；它固定读取现有永久
工作树及其已构建 CLI。新脚本与旧 checkout 的 SHA 分开记录，不能称为新 head
已部署。无需改 execution policy。普通 Windows PowerShell 可直接复制：

```powershell
powershell -NoProfile -NonInteractive -File D:\code\research\fqgate-v2-r1-evidence\observer-code\fqgate-v2-observation.ps1 -AuditArchive -EvidencePath D:\code\research\fqgate-v2-r1-evidence\windows-observation-resume.json
```

预期 exit 1（qualification 始终 BLOCKED）；schemaVersion 2，全部 Gate
逐项 `PASS/BLOCKED/NOT_EXECUTED`。只有合法 report 且 exit 1 才算观测成功。
配置读取/校验失败、CLI 异常或 ZIP 清理失败都不得成为 PASS。输出只包含有界
分类/哈希，任何 raw stdout/stderr/config 都不保存。证据里 snapshot 比较仅证明
固定文件在两次取样时相同，不证明两次之间没有瞬时修改或未来回滚可用。

| 阻断             | 无法自动完成的原因 / 所需身份                                                                         | 准确只读命令与通过条件                                                                                                                                                                      | 禁止 / 失败时停止 / 恢复自动化                                                                                                                 |
| ---------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| 17281 路径不可读 | 当前 Windows 身份不能读进程路径；需要操作者 UAC 同意进入 Administrator PowerShell                     | 执行下方 identity 命令，单一 127.0.0.1 owner 且本地输出 MATCH                                                                                                                               | UNREADABLE/MISMATCH 即停止，不接管/终止进程，不公开路径；保留 PID/分类，重跑上方 observer                                                      |
| 17282 缺失       | 只读诊断不能创造服务可用性；恢复启动需要另行授权并审查身份/状态                                       | `Get-NetTCPConnection -State Listen -LocalPort 17281,17282 -ErrorAction SilentlyContinue \| Select LocalAddress,LocalPort,OwningProcess`；每个 port 恰好一个 127.0.0.1 才通过 listener Gate | 本任务不得 start/stop/restart；缺失则停止 availability 验收，保留分类证据；获单独修复后重跑 observer                                           |
| previous 缺失    | 未保留 rollback artifact；文件存在也不能证明可用回滚                                                  | `Test-Path -LiteralPath (Join-Path $fqgateDir 'previous\fqgate.exe') -PathType Leaf`；False = BLOCKED。变量由下方合法配置读取建立                                                           | 不复制 current 冒充 previous，不手写 state、不清 lock；先另立 v1 rollback 资格任务，失败保留现状；修复后重跑 observer，仍需事务验收            |
| 签名信任         | 已检查公开来源不提供完整 application ZIP 验签合同；需要发布者可验证规范和独立认证公钥渠道             | `node D:\code\research\fqgate-remote-bridge\dist\cli\main.js fqgate inspect-v2 --json` 只恢复观察；没有可解除 trust Gate 的现成命令                                                         | 不从 signature 长度推断算法，不 TOFU、不使用 MCP Apps key；无证明即停止。拿到规范后先实现离线负向 tests，再运行 CI；不得执行 ZIP               |
| 防重放/目录事务  | 需要签名与客户端序列/时间/撤销规范，以及另行批准实现 crash recovery/rollback；目前没有安全 actuator   | 当前仅可运行上方 observer 与 CI fixtures；不存在安全 activation/rollback 命令                                                                                                               | 不清 security state、锁或 history，不修改 v1 replaceExecutable。需新任务先实施独立目录事务，fixtures 通过后才讨论 runtime 授权；失败保持 1.0.5 |
| 真实 v2 runtime  | 无可信 artifact，且 R1 未授权隔离执行；需要单独批准 Windows x64 测试机、独立数据目录，无生产凭据/路由 | 当前 `NOT_EXECUTED`；不能提供尚未实现的启动/安装命令。未来规范确定后另行编写可复制的隔离 runbook                                                                                            | 不执行 v2 EXE/updater，不用生产 token/session，不做 QR/queue/L2 故障注入；失败停止隔离验收并保留脱敏证据，不切生产                             |

提升权限后的只读 identity 判定（配置内容/真实路径仅在本机使用，不上传）：

```powershell
Set-Location D:\code\research\fqgate-remote-bridge
$config = Get-Content D:\code\research\fqgate-acceptance-config.json -Raw -ErrorAction Stop | ConvertFrom-Json -ErrorAction Stop
$fqgateDir = Join-Path $config.installDirectory 'fqgate'
$owners = @(Get-NetTCPConnection -State Listen -LocalPort 17281 -ErrorAction Stop)
if ($owners.Count -ne 1 -or $owners[0].LocalAddress -ne '127.0.0.1') { throw 'BLOCKED_LISTENER' }
$ownerPid = $owners[0].OwningProcess
$owner = Get-CimInstance Win32_Process -Filter "ProcessId=$ownerPid" -ErrorAction Stop
$identity = 'UNREADABLE'
if ($owner.ExecutablePath) {
  $identity = if ([IO.Path]::GetFullPath($owner.ExecutablePath) -ieq [IO.Path]::GetFullPath((Join-Path $fqgateDir 'current\fqgate.exe'))) { 'MATCH' } else { 'MISMATCH' }
}
[pscustomobject]@{ PID=$ownerPid; Identity=$identity }
if ($identity -ne 'MATCH') { throw 'BLOCKED_IDENTITY_STOP' }
# 然后在同一个已提升 PowerShell 中重跑上方 observer；不启动任何生产服务。
```

若 evidence 写入失败，停止，不宣布验收完成；保存 shell exit code 与有界错误分类，
选择可写的现有 Git 外证据目录后重跑。若审计子进程异常退出，cleanup Gate 不能
推定 PASS；只列出 `%TEMP%\fqgate-v2-audit-*` 是否残留，未确认无活跃审计前不要
删除。任何允许的未来清理也不得指向安装目录。CI fixture 在新随机 temp 目录内
写入惰性文本文件、模拟失败后删除自身 fixture，绝不向生产伪造 listener/fault。

最后复核（2026-10-13 01:55 UTC）发现 17281 与 17282 均无监听，原 PID 30284
已不存在。此前 17281/health/lookup PASS 是较早观测；当前 availability BLOCKED。
用以下命令只读恢复证据采集，不能恢复服务：

```powershell
Get-NetTCPConnection -State Listen -ErrorAction Stop | Where-Object { $_.LocalPort -in @(17281,17282) } | Select LocalAddress,LocalPort,OwningProcess
@(Get-CimInstance Win32_Process -Filter 'ProcessId=30284' -ErrorAction Stop).Count
```

当前预期无 listener 输出、PID count 0。不要固定用旧 PID 作为未来 owner；恢复后
必须重新读取实际 owning PID，并按上方 identity procedure 判定。进程退出原因
尚未由只读证据建立。本轮不得启动/重启 FQGate 或 Bridge；须另行批准基于 v1
的恢复窗口，不得执行 v2、假造 previous、清 lock/state。停止可用性验收，保留
earlier/current 两份 JSON 和 final listener receipt；获单独恢复授权并完成修复后
重跑 observer，publisher/transaction/runtime 阻断仍不能因此解除。

## R2：已授权的生产基线启动与工程验证

用户已授权进程启动，并选择“前置 Gate 通过后再升级到 v2”。本轮已经用现有
命令启动已验证 1.0.5 和 Bridge，未执行 v2。对应可复制命令：

```powershell
Set-Location D:\code\research\fqgate-remote-bridge
node .\dist\cli\main.js fqgate start --config D:\code\research\fqgate-acceptance-config.json --json
$env:FQGATE_REMOTE_BRIDGE_CONFIG = 'D:\code\research\fqgate-acceptance-config.json'
$env:BRIDGE_PORT = '17282'
Start-Process -FilePath 'C:\Program Files\nodejs\node.exe' -ArgumentList 'scripts/start-bridge.mjs' -WorkingDirectory (Get-Location)
node .\scripts\windows\phase5c-matrix.mjs --local
```

不要重复启动已经监听的 Bridge。启动前必须核对官方 current 文件哈希、无
未完成 transaction/lock，并检查两个端口是否已有未知 owner；发现未知身份则
停止，不终止/接管它。本次结果为 FQGate managed/ready，两个端口均为 127.0.0.1，
local matrix 6/6。previous 仍缺失，不能声称已建立生产回滚。

Git 外自动 wrapper（自动核对上述前提；重跑遇到已有监听会停止而非创建第二进程）：

```powershell
powershell -NoProfile -NonInteractive -File D:\code\research\fqgate-v2-r2-evidence\restore-v1-baseline.ps1
powershell -NoProfile -NonInteractive -File D:\code\research\fqgate-v2-r2-evidence\diagnose-existing-runtime.ps1
powershell -NoProfile -NonInteractive -File D:\code\research\fqgate-v2-r2-evidence\cloudflare-read-diagnostics.ps1
```

后两个命令直接读取已有 current-user Vault，在子进程环境中临时传递凭据；
不要求用户提供签名材料，不输出凭据，不写 Cloudflare。当前 real remote matrix
3/22（授权请求 502/timeout），Cloudflare read-only plan 46/46。失败时保留逐项
JSON，停止远程验收；不得因 local PASS 而忽略远程失败，也不得关闭 Access/JWT。

新目录核心仅能由自动测试验证，未接入生产 CLI。Linux/Windows CI 的关键命令：

```text
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm format:check
pnpm test:e2e
pnpm exec vitest run tests/fqgate-v2-transaction.test.ts
```

75 项目录/防重放测试使用假信任与假进程端口、惰性文本文件；不执行 FQGate。
缺少可信签名/bootstrap/revocation/expiry 适配器和真实 Windows v2 runtime 时，
没有可安全复制执行的 v2 upgrade/start 命令。发行者规范的检索及协议请求由 agent
处理；公开向发行者发送 Issue 仍需人类明确授权，不要求用户找密钥或手工越过 Gate。

## R3：个人实验环境、明确接受签名风险后的手动升级

用户明确接受本次 2.0.5 缺少签名依据的现实；没有生产用户，不要求 Sandbox。
2.0.5 已整目录安装并保持运行；用户物理扫码后唯一 connected 数据连接的
账户状态和精确证券查询通过。原始签名/完整 runtime 资格仍未通过，Bridge 的
v1 范围/协议适配器未扩展，因此不能声称 Bridge 的 v2 门禁全通过。
详见 `docs/status/fqgate-v2-operator-risk-upgrade-handoff.md`。

已执行一次的安装入口（现在不要重跑，不会复用旧资格伪造 PASS）：

```powershell
powershell -NoProfile -NonInteractive -File D:\code\research\fqgate-v2-r3-evidence\run-install-and-hold.ps1
```

目前应使用只读复验，不关闭正在使用的 App：

```powershell
powershell -NoProfile -NonInteractive -File D:\code\research\fqgate-v2-r3-evidence\read-current-state.ps1
powershell -NoProfile -NonInteractive -File D:\code\research\fqgate-v2-r3-evidence\run-held-verification.ps1
```

预期：实际 2.0.5、两个 loopback listener 与路径 MATCH；唯一 connected source，
saved login available；固定 canonical search HTTP 200/code 0/one exact match。
不能使用旧 `/v1/market/health` 的 disconnected 代表 v2 已登录连接的状态。
多个 connected source 时自动选择必须拒绝；不公开实例 ID/账号/QR/session。
失败保留脱敏 receipt，不自动终止 App/回退、不修改 Cloudflare、权限或范围。
旧版/config 只作临时回退；验证完成后可按用户许可删除，无永久保留要求。

今后需要显式启动已安装的同一 2.0.5，可使用以下本机入口；它校验 exact EXE
哈希和本次 operator exception，遇到已有受管进程保持运行，不做重启。旧版
`fqgate start` 仍按未扩展的兼容范围拒绝 v2，不能修改其安全语义来绕过。

```powershell
powershell -NoProfile -NonInteractive -File D:\code\research\fqgate-v2-r3-evidence\run-start-held.ps1
```
