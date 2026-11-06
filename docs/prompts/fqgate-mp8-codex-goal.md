# Proposed MP-8 goal — separate authorization required

This prompt is a proposal, not authorization from MP-7.

```text
goal
执行 MP-8：按精确版本、按操作的只读兼容候选与隔离资格工程。

第一步 git status --short、git fetch origin --prune，核对最新 main、MP-7 PR
状态及全部本地分支。在干净独立 codex/ worktree 开发；保留永久 Windows
D:\code\research\fqgate-remote-bridge 的 codex/fqgate206-compatibility、
c06fbcf 历史、dist/.output、配置、凭据、记录和候选。禁止 reset/clean/强推。
阅读 AGENTS/README/architecture/security/upstream-contracts/roadmap，Issue #30、
MP-7 task/matrix/operations/handoff 和完整 MP-6 门禁。

重新运行 MP-7 observer；新正式版本只触发人工审查报告，不自动改变目标。
先逐项审查 preserved 2.0.6 registry、listener authority、QR version binding、
selected-source status 和 route method denial，与最新 main 的 MP-6 精度、
state-0 UNKNOWN、保密及生产导入审计协调；不得整分支覆盖或删除 MP-6 修复。

实现独立精确版本/操作资格注册模型，首项仅已有 market.instruments.lookup。
绑定包/EXE/tree、Windows 架构、所需 path/method+transitive schema 指纹、
parser/probe 版本和本机身份策略。默认 UNKNOWN/DENIED，不以 semver、元数据、
新 OpenAPI 或模拟通过启用。保留 v1 supportedRange >=1.0.0 <2.0.0。
QR/status 为独立 operation，未经证据审查不继承 lookup 资格或新权限。

修复或设计隔离候选的账号采样漂移拒绝，明确目前 main lookup 只检查 connected
而不比较 display 的缺口；display/hash、observed_at、Worker incarnation 和旧版
MarketQueryPoolStatus.session_epoch 都不能充当强账号身份或单调登录 epoch。
未建立原生合同前，只能声称采样单 Source 连续性，保持
LIVE_MULTI_ACCOUNT_ISOLATION_NOT_QUALIFIED；多账号生产 NO-GO。

自动完成 fixture/负向/竞态/泄露测试，涵盖未知版本、包/指纹漂移、503/超时、
非法结果、Source 重建、账号变化、Worker/订阅生命周期及交易路径拒绝。
不增加重试、预算、raw proxy 或 remote 权限。执行 frozen install、typecheck、
lint、全部 unit、隔离 build、format、权限/导入审计、Linux E2E、Windows fixtures
和最终 PR HEAD Ubuntu/Windows CI；明确 Windows browser E2E skip。

本阶段仅实现可审查的候选/离线资格工程；不接入/启用生产。
只有外部已提供独立授权且可验证的运行主机时，才按预先审查的固定 GET-only
census 与有界只读语义探针采集运行证据，否则明确 HOST_BLOCKED/NOT_EXECUTED。
本 prompt 不授权 FQGate/Bridge/cloudflared 启停、升级安装部署、记录或私有文件
修改、登录/QR/短信/MFA、Saved Login/L2 操作、第二账号或生产集成。
需这些动作时提交具体独立决策单，不执行，不以超时推定批准。

完成安全范围代码/测试/文档，记录 UTC/源码与工具 Hash/命令/退出/耗时和受保护
文件前后证据，创建聚焦 PR，停在审查；不自动合并、发布或部署。
给出版本×操作准入状态、真实验证与缺口，不能用 CI/fixture 冒充主机或多账号通过。
```
