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
