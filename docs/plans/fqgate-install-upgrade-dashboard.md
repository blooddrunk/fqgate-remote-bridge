# FQGate 安装与升级设计草案

状态：**仅规划，未在当前 Phase 2 实现**。

本文记录用户提出的两项后续能力：在 Dashboard 中提示 FQGate 安装/升级状态，以及在技术条件满足时由 Dashboard 发起一次受控的安装或升级。它不改变当前 Phase 2 的 API、权限边界或运行方式，也不提前实现 Phase 3+。

## 当前行为

- FQGate 不会自动安装。首次安装使用 `fqgate install --dry-run` 预览，再使用 `fqgate install` 明确执行。
- Dashboard 只能读取标准化状态。检测不到 FQGate 时展示 CLI 安装命令，不能在页面加载时静默下载。
- Windows 一键启动脚本 `scripts/windows/start-dashboard.cmd` 会启动已经安装但停止的 FQGate；首次安装需要显式传入 `-InstallFqgate`。
- 当前升级流程已经存在于生命周期 CLI：

  ```powershell
  node .\dist\cli\main.js fqgate update --check
  node .\dist\cli\main.js fqgate update --apply --dry-run
  node .\dist\cli\main.js fqgate update --apply
  ```

- 当前发布源是代码中登记的官方 GitHub manifest。任意 URL 不能直接作为发布源，Gitee 还没有适配器或配置项。
- 当前升级会复用下载、大小/哈希校验、版本兼容性检查、启动健康检查和回滚事务；Dashboard 尚未触发这个事务。

## 建议的后续用户体验

### 1. Dashboard 状态卡

在已有 FQGate 状态卡附近增加一块“版本与更新”信息，保持只读、可解释：

- 当前版本、兼容性状态和安装状态；
- 最近一次检查时间和发布源名称；
- 可用版本、是否允许安装/升级、阻断原因；
- “检查更新”是明确的用户操作，不在页面加载时频繁联网；
- 未安装时显示“安装 FQGate”引导，并同时保留 CLI/PowerShell 兜底路径。

页面应明确告诉用户：下载和启动可能需要几十秒、会重启 FQGate、可能需要重新扫码；不要伪造百分比进度。

### 2. 发布源配置

建议配置的是受限的源枚举，而不是任意 URL：

```json
{
  "releaseSource": "github"
}
```

第一版支持：

- `github`：默认值，指向已登记的官方仓库和 stable manifest；
- `gitee`：后续增加一个明确的 Gitee adapter，固定仓库、路径、HTTPS 和 manifest schema。

不允许在 Dashboard 输入任意 manifest 或可执行文件 URL。每个源必须经过代码注册、HTTPS/主机校验、manifest schema 校验、文件大小和 SHA-256 校验；源切换后要在状态中显示来源。若 Gitee 只是镜像而不是独立可信发布源，应继续以官方签名/校验信息为准，不能因镜像可访问就放宽策略。

### 3. 安装与升级操作

Dashboard 内的安装/升级操作如果实现，应使用单一生命周期事务，不另写一套下载逻辑：

1. 用户点击后显示版本、来源、文件大小、SHA-256、兼容性和预计影响；
2. 用户明确确认，页面不自动确认或后台静默升级；
3. 从已登记源下载到 staging 目录，限制超时、重试、响应大小和文件权限；
4. 校验 manifest、文件大小、SHA-256、可执行文件版本和兼容性；
5. 停止受管 FQGate，保留上一份 known-good binary；
6. 激活候选版本并执行健康探针；
7. 健康或启动失败时自动回滚，并把失败原因显示为可操作的提示；
8. 成功后刷新状态；如果市场会话受到重启影响，明确提示用户重新扫码。

未来可在桥接策略注册表中增加一个专门的本机管理操作，而不是把它做成通用代理或隐式 Start server function。该操作必须有独立的 method/path、请求大小/超时、日志脱敏和兼容性门禁测试。

### 4. Dashboard 启动时未发现 FQGate

推荐分两步：

- Phase 2 维持当前安全行为：状态页提示安装命令，一键启动脚本只在用户传入 `-InstallFqgate` 时安装；
- 后续实现一个明确的“安装 FQGate”按钮，点击后先显示计划和确认页，再调用受控安装操作。

不建议“启动 Dashboard 就自动安装”。这会让联网下载、版本替换和桌面进程启动变成用户没有明确同意的隐式副作用，也会让异常网络或错误源更难诊断。

## 安全和回滚要求

- 默认源必须是 GitHub；Gitee 只能作为显式、固定、经过验证的源，不能接受任意镜像 URL。
- 未知版本、manifest 不完整、哈希不匹配、大小不匹配、候选程序版本不符或健康检查失败时，操作必须 fail closed。
- 升级前不能覆盖唯一一份可回退版本；升级中断后要能从 transaction/state 文件恢复。
- 不记录下载内容、QR 内容、session、cookie、token、完整路径中的敏感信息或上游 flow ID。
- 安装/升级只影响本机 FQGate 进程，不得扩展出下单、撤单、转账、券商控制等金融状态操作。
- 不因增加安装/升级按钮而开放 LAN、公网、Cloudflare、Windows 服务或 FQGate 原始接口。

## 建议的验收项

后续实现时至少覆盖：

- 未安装时状态卡和安装引导；
- GitHub 默认源、Gitee 显式源和拒绝任意 URL；
- 无更新、可更新、兼容性阻断和源不可用；
- dry-run 不写入 active binary；
- 下载大小/哈希/版本失败；
- 启动健康失败后自动回滚；
- 安装/升级期间重复点击、页面刷新和桥接重启；
- Windows 交互式桌面会话下的进程身份、loopback 监听和 QR 会话恢复；
- Dashboard 不在加载时自动执行安装或升级。

这些能力应作为后续独立任务包规划。当前 Phase 2 只交付现有 CLI、状态页安装引导和 Windows 一键启动入口。
