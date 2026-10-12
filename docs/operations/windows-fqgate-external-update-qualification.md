# Windows 外部更新后的 FQGate 资格验证

适用情形：操作者已经通过 FQGate 自带更新功能升级，Bridge 显示 `supported_unvalidated`。命令只在永久 Windows 工作树 `D:\code\research\fqgate-remote-bridge` 中由本机操作者显式运行。

```powershell
Set-Location D:\code\research\fqgate-remote-bridge
node .\dist\cli\main.js fqgate qualify-current --config D:\code\research\fqgate-acceptance-config.json --json
```

这条命令核对官方 stable manifest 与托管 `current\fqgate.exe` 的版本、大小、SHA-256；要求 17281 只有一个 IPv4 loopback 监听且进程路径是这个文件；然后运行健康、Bridge 所需 OpenAPI 和已批准的六位代码 lookup 语义探针。它会在全部通过后写入当前文件绑定的资格证据和进程记录，不下载、替换、停止或重启 FQGate。

若得到 `LOGIN_REQUIRED`，只在本机完成 FQGate 正常 QR 登录，再原样重跑命令。其他错误不能通过手动写 `state.json`、复制 exe 或扩大权限绕过。资格失败时当前版本继续标记为未验证；若需要恢复旧版，只能通过单独、已核对的已知良好二进制恢复流程处理，不能把不存在的 `previous` 当作回滚证据。

成功后运行：

```powershell
node .\dist\cli\main.js fqgate status --config D:\code\research\fqgate-acceptance-config.json --json
.\scripts\windows\phase7a-acceptance.ps1 -ConfigPath D:\code\research\fqgate-acceptance-config.json
```

常规未来升级仍应优先使用 Bridge 本地 `/updates` 的预览和资格验证流程，它拥有更新前的已知良好回滚文件。若使用 FQGate 自带更新器，上面的单条显式命令负责恢复 Bridge 资格；它不会自动执行，也不会改变任何远程操作权限。
