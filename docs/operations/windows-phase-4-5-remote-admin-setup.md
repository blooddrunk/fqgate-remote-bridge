# Phase 4.5 远程管理员配置与重配置（中文长期参考）

本文是 Phase 4.5 的长期运维手册。它面向第一次配置、换电脑、增加实例、修改
Cloudflare Access 策略和排查远程管理员网络问题的操作者。README 会长期保留本
文档入口；后续如果页面名称变化，应更新本文，而不是另起一份互相矛盾的说明。

本文不自动创建 Cloudflare 资源，不实现 Phase 5 行情 API，也不改变交易、下单、
撤单、转账、券商控制和其他金融状态变更能力仍然禁止远程暴露的约束。Cloudflare
资源自动化仍属于 Phase 6。

## 先看结论：最简单、最适合家庭代理网络的用法

远程管理员每天真正需要做的事情只有：

1. Windows 用户已经登录；
2. Cloudflare One Client 已注册，并处于 **Posture only（仅设备姿态）** 模式；
3. 在浏览器书签打开 `https://<admin-hostname>/`；
4. Access 会话过期时重新完成 MFA。

不需要每天打开 Access App Launcher，也不需要为了访问管理页面手动切换“全流量
WARP”。管理员仍然保留独立 hostname、独立 Access 应用和 AUD、MFA、Windows
设备姿态、Bridge 侧 JWT 校验、精确 Origin/intent 校验以及 `updates.apply` 的
一次性确认。

这里推荐 **Posture only**，是因为它保留 Cloudflare 对设备注册和姿态的判断，
但不接管 Windows 的普通互联网流量和 DNS。这样 OpenWrt + daed/passwall2
继续负责家庭网络的出网路径，Cloudflare One 不再和它争抢默认路由或 DNS。

如果当前客户端显示 `WarpWithDnsOverHttps`，说明它仍在全流量/全 DNS 模式；这
是本手册后面的第一项网络简化调整。切换设备配置文件可能让客户端短暂重启，
所以不要在重要网络操作中途切换。Cloudflare 的官方说明见：

- [Cloudflare One Client 模式](https://developers.cloudflare.com/cloudflare-one/team-and-resources/devices/cloudflare-one-client/configure/modes/)
- [Posture only 模式](https://developers.cloudflare.com/cloudflare-one/team-and-resources/devices/cloudflare-one-client/configure/modes/device-information-only/)

## 1. 目标拓扑和不可改变的边界

推荐使用 service-scoped 的一级子域名：

```text
fqgate.example.com          普通 remote_human
fqgate-admin.example.com    remote_admin
```

对 `haoqi90.top` 当前实例，对应的是：

```text
fqgate.haoqi90.top
fqgate-admin.haoqi90.top
```

不建议把通用的 `admin.example.com` 作为多个服务共用的管理域名，也不建议在没有
确认 Cloudflare 证书覆盖能力时使用更深的 `admin.fqgate.example.com`。

所有公网请求必须经过同一个固定链路：

```text
浏览器 -> Cloudflare Access -> cloudflared
                              -> http://127.0.0.1:17282 -> Bridge
                                                          -> http://127.0.0.1:17281 -> FQGate
```

必须始终满足：

- FQGate 只监听 `127.0.0.1:17281`；
- Bridge 只监听 `127.0.0.1:17282`；
- Tunnel 只指向 `http://127.0.0.1:17282`，绝不能指向 `17281`；
- 不设置 LAN/WAN 监听，不做路由器端口转发；
- 未知 Host、伪造 `X-Forwarded-Host` 或 `Forwarded` 都不能取得权限；
- `/openapi.json` 只是描述，不能成为授权来源；
- 不增加通用 raw upstream proxy；
- 交易、下单、撤单、转账、券商控制和其他金融状态变更能力仍然禁止远程暴露。

## 2. 先判断：是复用，还是新建实例

配置前先写下四个信息：Windows 电脑、该电脑绑定的 FQGate 账号/登录会话、
Cloudflare zone、两个公网 hostname。不要把不同电脑的 FQGate 账号简单理解成
同一个 Tunnel 下的两个后端。

| 项目                   | 同一台电脑增加管理员入口                             | 新电脑或独立 FQGate 账号               |
| ---------------------- | ---------------------------------------------------- | -------------------------------------- |
| FQGate/Bridge          | 保留现有本地进程和 loopback 端口                     | 在新电脑安装并验证独立的一对进程       |
| Tunnel                 | 可以复用现有 named Tunnel，增加 admin hostname       | 建议新建 named Tunnel 和新 token-file  |
| Tunnel token           | 只在同一台电脑复用现有受保护文件                     | 新电脑重新生成并保护，绝不复制旧 token |
| DNS                    | 增加或替换指向现有 Tunnel 的 service-scoped hostname | 为新实例建立唯一 hostname              |
| 普通 Access 应用       | hostname 和电脑不变时可复用                          | 为新 hostname 新建应用                 |
| 管理员 Access 应用/AUD | hostname 不变时可复用                                | 新建独立 admin 应用和独立 AUD          |
| Bridge 配置            | 更新 `adminHostname`/`adminAccess.audience`          | 使用新实例的完整外部配置               |
| WARP/MFA               | 当前操作者设备重新确认已注册                         | 每台新设备独立注册和验证               |
| FQGate 登录会话        | 仍属于这台电脑和这个实例，不共享                     | 在新电脑建立新账号/会话                |

同一个 named Tunnel 可以安全发布多个 hostname，前提是它们有意指向同一台电脑
上的同一个 Bridge。不同电脑不能共用一个 Tunnel 来“自动选择”不同 FQGate 账号；
多个 connector 会形成池，请求可能到达错误电脑。不同电脑应使用不同 Tunnel。

同一个 Cloudflare Zero Trust 组织可以复用 team domain 和通用身份策略，但以下
内容要按实例核对：管理员 hostname、管理员 Access 应用、管理员 AUD、Bridge
配置和 Tunnel token。一次性确认 grant 只存在某个 Bridge 的内存中，不能跨电脑
复制。

## 3. Windows 外部配置

配置文件放在仓库外、token 目录外。从 `config/example.json` 开始，只填写本实例
的非秘密值：

```json
{
  "remoteAccess": {
    "remoteHostname": "fqgate.example.com",
    "adminHostname": "fqgate-admin.example.com",
    "adminAccess": {
      "teamDomain": "your-team.cloudflareaccess.com",
      "audience": "admin-application-audience"
    }
  },
  "cloudflared": {
    "tokenFile": "C:\\ProgramData\\FQGateRemoteBridge\\secrets\\tunnel-token"
  }
}
```

这些字段为什么必须精确：

- `remoteHostname` 和 `adminHostname` 是唯一能产生远程 caller context 的公网 Host；
  其他 Host 必须失败关闭；
- `teamDomain` 只用于派生固定的 Cloudflare 证书/JWK 端点，不能配置任意 JWKS URL；
- `audience` 必须来自独立的管理员 Access 应用，不能填普通用户应用的 AUD；
- `tokenFile` 只保存文件位置，Tunnel token 本身不进 JSON。

JSON、Tunnel token、Access assertion、QR payload、登录会话、MFA seed 和一次性
确认 secret 都不能提交 Git、粘贴到聊天、写入日志或放进浏览器 localStorage。

## 4. 手动配置 Cloudflare Access

Cloudflare 控制台名称可能略有变化，但安全意图不能变化。

### 4.1 普通 remote_human 应用

进入 **Zero Trust → Access controls → Applications**，创建或检查普通 hostname
对应的 self-hosted application：

1. hostname 填精确的 `remoteHostname`；
2. 开启 **Protect with Access**；
3. Allow 只写允许访问的普通用户身份/组；
4. 不添加 Bypass 或 Service Auth 作为捷径；
5. App Launcher 可保持关闭，日常直接使用书签更简单。

它只提供 Phase 4 的普通远程只读能力。普通 remote_human 即使绕过前端直接调用
接口，也必须被 Bridge 拒绝四个维护操作。

### 4.2 独立 remote_admin 应用

新建第二个 self-hosted application，不要把普通应用改成管理员应用：

1. hostname 填精确的 `adminHostname`；
2. 使用新建的 Access application，取得不同于普通应用的 AUD；
3. 开启 **Protect with Access**；
4. Allow 只写预期的管理员身份/组；
5. 要求 WARP/device posture 和 Windows OS posture；
6. 要求独立 MFA（例如 TOTP 或安全密钥）；
7. 使用短管理员会话，目前按 15 分钟配置；
8. 如果策略要求直接走 IdP 登录，保持该应用的 WARP 登录认证关闭；
9. 确认整个应用没有 Bypass policy，也没有 Service Auth policy。

Cloudflare Access 是第一道门。Bridge 还会独立校验管理员 JWT 的 RS256 签名、
精确 issuer、精确管理员 AUD、时间声明和 `kid`。Access 页面显示通过，不代表
Bridge 自动授予管理员权限。

### 4.3 首次 MFA、WARP 注册和姿态策略

首次配置时需要人工完成 Cloudflare 账号登录、MFA 注册、设备注册和姿态确认。
可按以下顺序做：

1. 在 **Access → Access settings → Manage your App Launcher** 中，为预期操作者
   建立 identity-only Allow policy（这只是登录入口，不是管理员 hostname 的授权）；
2. 为 WARP enrollment 准备 identity-only Allow policy；不要在设备还未注册时就
   要求设备 posture；
3. 需要重新添加 MFA 时，在浏览器打开：

   ```text
   https://<team-domain>/AddMfaDevice
   ```

4. 在登录的 Windows 用户会话中执行：

   ```powershell
   & "C:\Program Files\Cloudflare\Cloudflare WARP\warp-cli.exe" registration new <team-name>
   ```

5. 在浏览器中完成预期身份和 MFA；不要把 enrollment URL、Access JWT 或 MFA secret
   发到聊天或写入日志。

### 4.4 推荐：改成 Posture only，避免抢占家庭网络

这是针对 OpenWrt + daed/passwall2 的推荐配置。它不是取消 WARP 设备姿态，而是
让 Cloudflare One Client 只提供设备身份/姿态，不代理普通互联网流量和 DNS。

在切换 profile 前，先确认当前 zone 已开启 **client certificate provisioning**。
Posture only 依靠 Cloudflare One Client 为设备生成客户端证书；这个开关只是允许
证书 provisioning，不等于给管理员 hostname 增加 mTLS/WAF 强制规则。本实例已
开启该开关。手动配置可在 Cloudflare 官方文档给出的 zone API 执行：

```bash
curl "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/devices/policy/certificates" \
  --request PATCH \
  --header "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  --json '{"enabled":true}'
```

这一步需要 `SSL and Certificates Write` 权限；它与后面的 `Zero Trust Write` 是
不同权限。执行后读取同一接口，必须看到 `enabled: true`。不要把 token 写入脚本、
日志或聊天，也不要为了省事添加 Bypass/Service Auth。

如果多个设备共用当前 General profile，先新建一个只分配给这台 Windows 管理电脑
的设备 profile，避免影响其他设备。然后在 Cloudflare 控制台执行：

1. **Zero Trust → Team & Resources → Devices → Device profiles**；
2. 打开 **General profiles**，找到该 Windows 电脑使用的 profile，点击编辑；
3. 将 **Service mode** 改为 **Posture only mode**；
4. 保存并等待策略传播；
5. 保持 Windows 用户已登录，首次访问管理员 hostname 时按浏览器提示允许使用
   Cloudflare 客户端证书。

切换后，在 Windows 中检查：

```powershell
& "C:\Program Files\Cloudflare\Cloudflare WARP\warp-cli.exe" settings
& "C:\Program Files\Cloudflare\Cloudflare WARP\warp-cli.exe" status
```

输出名称因客户端版本可能略有不同，但应能确认 service mode 为 `PostureOnly`
或等价的 **Posture only**，而不是 `WarpWithDnsOverHttps`。然后依次测试普通
互联网、OpenWrt/daed/passwall2 原有访问、普通 FQGate 页面和管理员页面。

注意：修改设备 profile 可能导致客户端短暂重启或短暂断网，控制台策略传播也可能
需要几分钟。因此这一步必须由能观察家庭网络的操作者执行。官方文档还说明，
Posture only 不适用于 Windows 登录前场景；Windows 用户需要先登录。

不要把 **Split Tunnels** 当作第一选择：它主要处理 IP 流量，DNS 仍可能与家庭
代理策略冲突。Posture only 已足够满足本阶段的设备姿态目标，故障面更小。

### 4.5 App Launcher 不是日常入口

App Launcher 只是 Cloudflare 账户级的应用列表。如果曾经看到“请管理员启用 App
Launcher”，不代表管理员 hostname 配置错误，也不代表必须依赖它访问服务。

日常使用直接把下面的地址加入浏览器书签即可：

```text
https://<admin-hostname>/
```

管理员 hostname 自己的 Access application、MFA、设备姿态和 Bridge JWT 校验仍然
生效；不需要为了省一步点击而添加 Bypass 或 Service Auth。

## 5. DNS 和 Tunnel ingress

对每个公网 hostname，创建 proxied CNAME，目标是现有 Tunnel 的 Cloudflare 目标
（通常是 Tunnel UUID 加 `.cfargotunnel.com`）。DNS 不能直接指向 Windows、FQGate
或 Bridge 的 IP。

在 **Zero Trust → Networks → Tunnels → <named Tunnel> → Public Hostnames**：

1. 普通 hostname 指向 `http://127.0.0.1:17282`；
2. 管理员 hostname 也指向 `http://127.0.0.1:17282`；
3. 两个 hostname 分别绑定各自的 Access application；
4. 保留末尾 `http_status:404` catch-all；
5. 逐条检查 ingress，确认没有任何 `17281`。

普通 hostname 不得使用管理员 AUD，管理员 hostname 不得使用普通 AUD。

## 6. 启动 Windows 实例和最小检查

在已登录的 Windows 用户会话中，从仓库目录执行：

```powershell
.\scripts\windows\start-phase4.cmd `
  -ConfigPath D:\code\research\fqgate-phase4-5-acceptance-config.json `
  -NoBrowser
```

启动器只负责使用已有配置启动/检查 cloudflared、FQGate 和 loopback Bridge；它不
安装任意软件、不创建 Cloudflare 资源，也不会打印 Tunnel token。

执行有界检查：

```powershell
Get-NetTCPConnection -State Listen -LocalPort 17281,17282 |
  Select-Object LocalAddress,LocalPort,OwningProcess
Get-Service -Name FQGateRemoteBridgeCloudflared
curl.exe -sS -o NUL -w "ordinary=%{http_code}`n" https://fqgate.example.com/
curl.exe -sS -o NUL -w "admin=%{http_code}`n" https://fqgate-admin.example.com/
```

判断依据：

- 17281、17282 的 `LocalAddress` 都必须是 `127.0.0.1`；
- cloudflared 服务应为 Running；
- 未登录公网请求出现 Access challenge/redirect 是正常的；
- 不要用 `-L` 跟随 redirect，不要倾倒响应头，因为 Access redirect 可能含会话材料。

随后按顺序测试：

1. 普通 remote_human 的 Dashboard/status/QR/reference；
2. 普通用户四个维护操作都被服务器拒绝；
3. MFA + 合规 WARP/Windows posture 的管理员登录；
4. 管理员 `updates.check`、`updates.plan`、`openapi.refresh`；
5. 先验证 apply 的过期、重放、错人、错操作、错计划等失败用例；
6. 最后才在有批准的安全候选版本时验证 apply；
7. 本地维护和移动浏览器冒烟测试。

完整验收清单见 [Windows Phase 4.5 验收](windows-phase-4-5-acceptance.md)，
易读操作版见 [一页验收单](windows-phase-4-5-acceptance-simple.md)。缺少真实
Windows/Cloudflare 证据，或者没有已批准的安全更新候选版本时，Phase 4.5 必须
保持 OPEN。

## 7. 日常使用和故障判断

### 正常日常流程

1. 登录 Windows；
2. 确认 Cloudflare One Client 已注册且是 Posture only；
3. 打开管理员书签；
4. Access 会话过期时完成 MFA；
5. 页面中的管理员标识、操作结果和失败原因应与当前上下文一致。

### 常见现象怎么判断

| 现象                                           | 先看什么                                                       | 不要做什么                                   |
| ---------------------------------------------- | -------------------------------------------------------------- | -------------------------------------------- |
| 普通 hostname 可以访问，管理员被拒绝           | 是否确实访问了 admin hostname；Access app/AUD 是否对应         | 不要把普通应用改成管理员应用                 |
| 登录后 Bridge 返回 `ACCESS_ASSERTION_REQUIRED` | 是否经过正确 Access app；请求是否被脚本/代理改写               | 不要把 JWT 手工塞进 URL、localStorage 或日志 |
| 管理员被 `DEVICE_POSTURE_REQUIRED` 拒绝        | WARP 是否注册、Windows posture 是否合规、profile 是否传播完成  | 不要用 Bypass/Service Auth 绕过              |
| WARP 能用但家庭网络变慢或 DNS 异常             | `warp-cli settings` 是否仍为 `WarpWithDnsOverHttps`            | 不要同时强行叠加全流量 WARP 和 passwall2     |
| 管理员页面打不开但普通互联网正常               | Access policy、admin DNS、Tunnel hostname、Bridge admin config | 不要把 Tunnel 改到 17281                     |
| App Launcher 不显示应用                        | App Launcher 自身策略和可见性                                  | 不要把 Launcher 当作管理员授权               |

如果 Posture only 仍不能解决家庭网络问题，临时关闭 WARP 会让管理员设备姿态
失败，这是预期的安全结果；不要为了连通性删除姿态策略。完全不安装 WARP 的
替代方案需要另一种可验证设备身份/证书姿态设计，应单独评审，不是本阶段的快捷
改动。

## 8. 操作者与 agent 的分工

| 工作                                        | 必须由操作者完成           | agent 可以完成                                                                     |
| ------------------------------------------- | -------------------------- | ---------------------------------------------------------------------------------- |
| 选择 hostname、电脑和 FQGate 账号归属       | 是                         | 解释取舍                                                                           |
| Cloudflare 登录、账单、MFA seed、安全密钥   | 是                         | 不能安全代替人操作                                                                 |
| DNS、Access policy、设备 profile 的最终确认 | 是，尤其是会造成断网的改动 | 读配置、给出逐步操作和检查标准                                                     |
| WARP 注册、浏览器证书提示、真实 MFA         | 是                         | 准备策略和执行有界状态检查                                                         |
| 仓库代码、配置 schema、测试、文档           | 可复核                     | 可以实现、验证、提交和推送                                                         |
| 已存在资源的受限 API 修改                   | 明确授权后                 | 可以使用最小权限凭据执行；当前令牌没有 Zero Trust 写权限，不能直接替你切换 profile |
| 已批准安全更新的最终 apply                  | 是                         | 只能在明确批准和全部检查通过后执行                                                 |
| Phase 4.5 CLOSED 判断                       | 共同                       | 没有 T1–T17 证据时不能宣称关闭                                                     |

## 9. 常见重配置场景

- **hostname 改名：** 修改 DNS、对应 Access application、Tunnel public hostname、
  外部 JSON 的 `adminHostname`/`remoteHostname`，重启 Bridge 后先测未认证请求。
- **管理员 Access 应用重建：** 从新应用复制新 AUD 写入外部 JSON，确认 Tunnel
  hostname 的 Access 映射一致，测试通过后再停用旧应用。
- **team domain 改名：** 同步修改 Access 策略和外部 JSON；Bridge 会根据新的固定
  team domain 派生证书端点。绝不能填自定义 JWKS URL。
- **设备 profile 改为 Posture only：** 先确认该 profile 不会误伤其他设备，保存后
  等待传播，再用 `warp-cli settings` 和实际网页访问双重确认。
- **Windows 电脑更换：** 建立新 Tunnel、新 token、新 hostname，不能复制旧 token，
  也不能假设共享 Tunnel 会把请求送到正确的 FQGate 账号。
- **同一台电脑只要普通用户访问：** 可以省略整个 admin 配置；此时 admin hostname
  未知，四个维护操作仍只能本地执行。

本地 cloudflared 管理命令是显式操作，不会在页面加载、Bridge 启动或后台定时器中
下载、更新或重配置：

```powershell
node .\dist\cli\main.js cloudflared release --json
node .\dist\cli\main.js cloudflared install --dry-run --json
node .\dist\cli\main.js cloudflared status --json
node .\dist\cli\main.js cloudflared service install --json
node .\dist\cli\main.js cloudflared service restart --json
```

配置只保存 hostname、固定 origin、cloudflared release version、安装目录和
token-file 路径；Tunnel token 不进入配置、service command、日志、UI、浏览器存储、
tests 或 Git。

## 10. 与验收和未来计划的关系

本手册只描述 Phase 4.5 的现有边界。它不实现 Phase 5 `remote_machine`，不实现
Phase 6 Cloudflare 自动 provision，不实现自动更新、supervisor、MCP/WebSocket、
最终打包，也不增加任何金融能力。

未来可以实现一个不改变权限的 setup doctor/launcher：检查 WARP 是否为 Posture only、
hostname/AUD 是否匹配、DNS/Tunnel 是否正确、loopback 是否正常，然后用浏览器打开
管理员书签。它不能静默创建宽权限 Cloudflare policy，也不能自动关闭 MFA、姿态或
一次性确认。多账号/多 Profile 另见
[future-multi-profile-account-isolation.md](../plans/future-multi-profile-account-isolation.md)，
当前不实现。
