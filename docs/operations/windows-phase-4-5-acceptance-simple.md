# Phase 4.5 一页验收单：谁来做、怎么判断

这页是给不想读实现细节的部署者看的。Phase 4.5 的安全条件不会删掉，
但不需要你逐项理解 JWT、Origin、竞态或 Bridge registry。脚本和浏览器会
执行检查；你只需要完成真实账户必须由本人完成的登录/MFA，并在确实有安全
更新时做最后一次确认。

## 先做这一件事

在 Windows 的项目目录打开 PowerShell，运行：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File .\scripts\windows\phase45-acceptance.ps1 `
  -ConfigPath D:\code\research\fqgate-phase4-5-acceptance-config.json `
  -RunLocalMaintenance
```

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

这些结果就是 T1、T3、T5、T6、T15、T16 的机器证据；不需要你手工复制
响应头，也不应该复制重定向 URL。

## 你只需要做的人工步骤

1. 打开 Windows Edge，访问普通地址
   `https://fqgate.haoqi90.top/`，用允许的普通用户身份登录；再访问
   `https://fqgate-admin.haoqi90.top/`，用同一个预期管理员身份登录。
2. 邮箱验证码、TOTP 或安全密钥必须由你本人在浏览器中输入。不要把验证码、
   Access JWT、cookie 或完整重定向地址发给代理。登录完成后只需说“已登录”。
3. 管理员地址登录前，Cloudflare One Client 必须已经注册，且
   `warp-cli settings` 能确认 service mode 为 **PostureOnly**（不要是
   `WarpWithDnsOverHttps`），Windows 设备姿态也必须合规。首次访问可能需要在
   浏览器中允许使用 Cloudflare 客户端证书；未注册或姿态不合规会被拒绝，这是
   预期行为。

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

当前机器的真实计划已经说明了原因：候选 `1.0.1` 是 `UNSIGNED`，且尚未通过
项目验证门，计划状态为 `blocked`。因此不能为了满足验收而安装它。

只有当固定可信源提供一个已验证、兼容、完整性校验通过的候选时，才执行一次
真实管理员 apply。执行前页面必须明确显示：来源、目标版本、文件大小、SHA-256、
兼容性和健康状态；执行后必须看到成功或受控回滚。没有这样的候选时，把 T13
记为 `NOT AVAILABLE`，Phase 4.5 保持 OPEN；这不是用户操作失败，而是系统
正确阻止了不安全更新。

## 谁负责哪些项目

| 项目                                            | 代理可以完成             | 必须由你完成                                   |
| ----------------------------------------------- | ------------------------ | ---------------------------------------------- |
| 本机监听、Tunnel 路由、未认证拒绝、原始路径拒绝 | 是                       | 否                                             |
| 本地 check/plan/OpenAPI refresh                 | 是                       | 否                                             |
| 普通用户页面和直接 API 拒绝                     | 登录后由代理执行         | 提供一次普通用户登录                           |
| 管理员 JWT、MFA、设备姿态                       | 登录后由代理验证请求结果 | 你输入验证码/MFA，并确认 Client 为 PostureOnly |
| apply 过期/重放/竞态/计划不匹配                 | 是，代理执行，不安装更新 | 否                                             |
| 真实安全更新 apply                              | 可以执行流程             | 你只做最后一次明确批准                         |
| 没有安全候选时的处理                            | 记录 `NOT AVAILABLE`     | 不要批准未验证候选                             |

完整证据表仍在
[`windows-phase-4-5-acceptance.md`](./windows-phase-4-5-acceptance.md)；本页只是
把执行顺序和判断标准翻译成可操作步骤。
