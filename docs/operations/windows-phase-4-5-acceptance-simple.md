# Phase 4.5 一页验收单：谁来做、怎么判断

这页是给不想读实现细节的部署者看的。当前管理员采用已批准的简化策略：指定
邮箱 + MFA + 30 分钟会话，不需要 WARP、客户端证书或设备姿态。Bridge 仍然
执行 JWT、Origin、竞态、registry、候选完整性和回滚检查。脚本和浏览器会执行
检查；你只需要完成真实账户必须由本人完成的登录/MFA，并在确实有安全更新时做
最后一次确认。

## 先做这一件事

在 Windows 的项目目录打开 PowerShell，运行：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File .\scripts\windows\phase45-acceptance.ps1 `
  -ConfigPath D:\code\research\fqgate-phase4-5-acceptance-config.json `
  -RunLocalMaintenance
```

本机检查通过后，如需自动完成已认证请求矩阵，在同一个交互式 PowerShell 里重新运行：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File .\scripts\windows\phase45-acceptance.ps1 `
  -ConfigPath D:\code\research\fqgate-phase4-5-acceptance-config.json `
  -RunAuthenticatedBrowserMatrix
```

这个模式会打开一个不保存 storage state 的 headed 浏览器。你只在浏览器中完成普通
hostname 和管理员 hostname 的 Access 登录/MFA，然后在 PowerShell 提示处按 Enter；
不要复制验证码、JWT、cookie、二维码、完整 session ID 或 confirmation grant。脚本只
输出脱敏标签、PASS/FAIL/SKIP、HTTP/error code 和时间戳，并且不会调用
`updates.apply`。如果目标机没有 Edge，可安装/使用 Playwright Chromium 并追加
`-BrowserChannel chromium`。

如果项目在 `D:\code\research\fqgate-remote-bridge-phase4-5-live`，先进入该目录；
如果使用其他目录，只替换脚本路径和配置路径。这个命令不会安装更新、不会
运行 `updates.apply`、不会读取或打印 Tunnel token/JWT/二维码。

输出含义很简单：

| 输出     | 含义                                       | 下一步                   |
| -------- | ------------------------------------------ | ------------------------ |
| `PASS`   | 这一项已满足                               | 继续                     |
| `FAIL`   | 本机确实有安全问题或服务未运行             | 先修复，不要继续远程验收 |
| `MANUAL` | 当前 PowerShell 权限不足或必须用真实浏览器 | 按下面的唯一人工步骤做   |
| `SKIP`   | 为了避免副作用没有执行                     | 需要时按提示重新运行     |

## 这条命令已经替你完成什么

脚本会自动判断：

- FQGate 是否只有 `127.0.0.1:17281`，Bridge 是否只有
  `127.0.0.1:17282`；
- cloudflared 是否运行、是否使用 `--token-file`，命令行中是否没有原始
  token；
- 本地 `updates.check`、`updates.plan`、`openapi.refresh` 是否可用；
- 普通 Host 和管理员 Host 在没有 Access 断言时是否被 Bridge 拒绝；
- 未知 Host、伪造 `X-Forwarded-Host` 是否返回 `421 HOST_NOT_ALLOWED`；
- `/v1/market/health` 等未注册原始 FQGate 路径是否返回 404；
- 两个公网地址在未登录时是否只返回 Cloudflare Access challenge/denial，
  而不是直接返回 Dashboard。
- 登录后普通用户的四个维护拒绝、管理员 check/plan/OpenAPI refresh、raw/未注册
  路由拒绝，以及安全的无确认/过期/stale-plan/replay-after-expiry negative path。

这些结果就是 T1、T3、T5、T6、T15、T16 的机器证据；不需要你手工复制
响应头，也不应该复制重定向 URL。

## 你只需要做的人工步骤

1. 打开 Windows Edge，访问普通地址
   `https://fqgate.haoqi90.top/`，用允许的普通用户身份登录；再访问
   `https://fqgate-admin.haoqi90.top/`，用同一个预期管理员身份登录。
2. 邮箱验证码、TOTP 或安全密钥必须由你本人在浏览器中输入。不要把验证码、
   Access JWT、cookie 或完整重定向地址发给代理。登录完成后只需说“已登录”。
3. 管理员地址不需要启动 Cloudflare One Client，也不需要选择客户端证书。完成
   指定邮箱的 Access 登录和 MFA 即可。浏览器不弹证书选择框是当前策略的正常结果。

如果看到 `403`：确认访问的是管理员 hostname，检查管理员 Access 应用、指定邮箱、
MFA、独立 AUD 和 Bridge 配置；不要安装 WARP、选择证书或添加 Bypass。

如果验证码输入正确但最后显示 `Network error`，不要继续使用当前验证码页。关闭
所有 `cloudflareaccess.com` 和管理员标签页，从管理员 hostname 根地址重新开始，
再申请一封新验证码。不要反复提交旧验证码，也不要把验证码、JWT、cookie 或完整
重定向地址发给代理。

登录完成后，代理可以在不读取秘密的情况下继续操作浏览器，验证 Dashboard、
更新页面、API Reference、直接 API 调用、CSRF、移动尺寸和管理员 JWT 的真实
请求路径。

## 浏览器上分别看什么

普通用户：

- `/`、`/login`、`/api-reference` 能打开；
- `/updates` 可以看状态，但不应出现可执行的 check/plan/apply/refresh；
- 直接调用四个维护 POST 必须得到 403。UI 被绕过也不能成功。

管理员：

- 页面顶部必须显示“远程管理员/强认证”上下文；
- `check`、`plan`、`OpenAPI refresh` 成功；页面展示来源、版本、大小、SHA-256
  和当前兼容性；
- `apply` 必须先申请一次性确认，再进行第二次确认；刷新页面、过期、重放、
  换操作、换计划和并发双击都必须失败或最多成功一次；
- 不得出现 cloudflared、Tunnel、Windows 任意进程、原始 FQGate 路径或金融
  操作入口。

## 关于“批准的安全更新”

当前机器已经完成 1.0.1 的真实 Windows x64 验证：官方文件大小和 SHA-256 一致，
`--verify-installation` 和 `--version` 成功；临时 17283 实例的 OpenAPI、健康接口
和 Bridge 所需 health/QR 合同通过。1.0.1 已加入这台实例的 validated list。
随后本机 loopback 的真实 apply 先有两次因 `HEALTH_TIMEOUT` 自动回滚；完成临时
候选目录和受管目录各自的 FQGate 首次风险确认后，第三次受管 apply 于
`2026-09-18T13:32:33Z` 开始、`2026-09-18T13:32:56Z` 成功，安装版本为 1.0.1，
健康接口 HTTP 200，事务结果为 `updated`，没有回滚。现场临时使用的 10 分钟等待窗口
随后已恢复为正式的 120 秒配置。此结果证明 Windows x64 的受管本地激活已通过；它
不替代管理员公网浏览器路径的独立验收证据。

以后遇到新 FQGate 安装指纹时，第一次启动可能再次出现 FQGate 自己的风险/首次启动
确认窗口。由操作者在 Windows 本机确认一次即可；不要删除 WebView/登录目录，不要
修改状态文件伪造确认，也不要把这类上游确认替换成 Bypass。

执行真实管理员 apply 前，页面必须明确显示：来源、目标版本、文件大小、SHA-256、
兼容性和健康状态；执行后必须看到成功或受控回滚。未得到最终明确批准时，不要
调用 apply；验证通过不等于已经安装。

## 谁负责哪些项目

| 项目                                            | 代理可以完成             | 必须由你完成                                     |
| ----------------------------------------------- | ------------------------ | ------------------------------------------------ |
| 本机监听、Tunnel 路由、未认证拒绝、原始路径拒绝 | 是                       | 否                                               |
| 本地 check/plan/OpenAPI refresh                 | 是                       | 否                                               |
| 普通用户页面和直接 API 拒绝                     | 登录后由代理执行         | 提供一次普通用户登录                             |
| 管理员 JWT、MFA 和管理员策略                    | 登录后由代理验证请求结果 | 你输入验证码/MFA                                 |
| apply 过期/重放/竞态/计划不匹配                 | 是，代理执行，不安装更新 | 否                                               |
| 真实安全更新 apply                              | 可以执行流程和回滚验证   | 你完成 FQGate 自身首次确认，并做最后一次明确批准 |
| 没有安全候选时的处理                            | 记录 `NOT AVAILABLE`     | 不要批准未验证候选                               |

错 principal、错 operation、成功 redemption 后的 replay、并发 double redemption 由
deterministic suite 使用 fake update service 证明；两个已认证 hostname 的
raw/unregistered route denial 和 ordinary/admin 两个 viewport 上下文由 companion
harness 自动检查。把这些用例放进真实 apply 请求会
产生真实状态变更，因而不属于无副作用的浏览器矩阵。T17 的真实手机/平板视觉和触控仍
需人在真实设备上确认，CSS viewport 自动化不能替代它。

完整证据表仍在
[`windows-phase-4-5-acceptance.md`](./windows-phase-4-5-acceptance.md)；本页只是
把执行顺序和判断标准翻译成可操作步骤。
