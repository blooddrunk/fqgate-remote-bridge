# FQGate 安装与升级设计

状态：**Phase 3 已激活，作为下一阶段正式实现范围**。

本文记录 Dashboard 中 FQGate 安装/升级能力的产品与安全设计。Phase 3 实现必须与 `docs/tasks/phase-3-fqgate-upgrade-and-runtime-openapi.md`、`docs/plans/runtime-openapi-and-remote-docs.md` 一致。

## 当前行为基线

- FQGate 不会自动安装。首次安装使用 CLI 预览并明确执行。
- 当前已有安全的 CLI 安装/升级生命周期：下载、大小/SHA-256 校验、候选版本校验、兼容性检查、启动/健康检查、known-good 回滚。
- Dashboard 当前只展示状态和安装引导，尚未发起更新事务。
- 当前可信发布源为代码登记的官方 GitHub 源。
- 任意 manifest/可执行文件 URL 不能作为发布源。
- Gitee 仅允许作为未来固定可信 adapter；在没有明确可信固定仓库/路径契约前不得启用。

## Phase 3 用户体验

### 1. Dashboard 更新中心

在 Dashboard 增加独立的“更新”页面或等价操作区，显示：

- 当前安装/运行状态；
- 当前版本与兼容性；
- 当前可信发布源；
- 最近一次**主动**检查时间和结果；
- 可用版本；
- 是否允许安装/升级以及阻断原因；
- 候选文件大小、SHA-256；
- 当前更新事务状态；
- 最近一次成功/失败/回滚摘要（仅非敏感、受限元数据）。

“检查更新”必须是用户显式操作。页面加载、桥接启动和后台轮询不得静默触发联网更新检查、下载或激活。

### 2. 发布源配置

发布源必须是受限枚举/registry，而不是自由 URL：

```json
{
  "releaseSource": "github"
}
```

第一版正式启用：

- `github`：默认，固定官方仓库和 stable manifest 规则。

预留：

- `gitee`：只有在验证出明确可信的固定仓库/路径/schema 契约后才能启用。

禁止：

- Dashboard 输入任意 manifest URL；
- 输入任意 EXE/ZIP URL；
- 通过 query/body 选择任意下载主机；
- 因国内镜像更方便而跳过 size/SHA-256/候选身份校验。

### 3. 安装与升级流程

Dashboard 必须调用和 CLI 相同的框架无关 lifecycle/update application service，不重新实现下载/替换逻辑。

推荐事务：

1. 用户显式点击“检查更新”；
2. 显示当前版本、目标版本、来源、大小、SHA-256、兼容性和影响；
3. 生成稳定的 plan/candidate identity；
4. 用户显式确认该计划；
5. 若确认时计划已经陈旧/候选发生变化，拒绝并要求重新检查；
6. 从已登记可信源下载到 staging；
7. 校验 manifest、大小、SHA-256、候选程序版本和兼容性；
8. 停止受管 FQGate，保留上一份 known-good；
9. 激活候选并执行 health；
10. 获取并校验运行时 `/openapi.json`；
11. 验证 Bridge 所依赖的必需 path/method 契约；
12. 执行已有 endpoint-specific 语义探针；
13. 全部通过后标记成功；
14. 任一必需激活检查失败时执行既有 rollback。

OpenAPI 变化不是“整体必须完全一致”的要求。与 Bridge 无关的新接口可以出现，只应在 API Reference/兼容性视图中提示；Bridge 必需契约缺失才应导致 activation fail closed。

### 4. 并发与恢复

- 同时只允许一个 mutating lifecycle transaction；
- 双击、重试、刷新不能启动第二个并行替换；
- 计划确认绑定 candidate identity，避免 stale confirmation；
- 若既有生命周期已经有 transaction/state 文件，优先复用；
- 若需新增持久化状态，只保存最小非敏感事务元数据；
- 不记录下载内容、QR/session/token/cookie 或原始失败响应体。

### 5. Dashboard 未发现 FQGate

Phase 3 可以提供明确的“安装 FQGate”按钮，但必须：

- 先检查可信源；
- 先显示计划；
- 用户明确确认；
- 复用同一生命周期事务；
- 始终保留 CLI/PowerShell 兜底路径。

仍然不允许“启动 Dashboard 就自动安装”。

## 与 Runtime OpenAPI 的关系

Phase 3 同时实现 `docs/plans/runtime-openapi-and-remote-docs.md` 中的运行时 API catalog。

这使升级中心不再只验证：

```text
version + health
```

而是增加：

```text
runtime /openapi.json
+ required bridge contract coverage
+ endpoint-specific semantic probes
```

关键原则：

> `/openapi.json` 是 FQGate 当前运行版本接口描述的 source of truth，但不是 Bridge 的授权清单。

## 安全和回滚要求

- 默认可信源为官方 GitHub；
- 任意 URL 永远不允许；
- manifest 不完整、大小/哈希错误、候选版本不符、必需 OpenAPI 契约缺失、health/语义探针失败时 fail closed；
- 升级前不能覆盖唯一可回退版本；
- 更新事务必须具备确定性的并发行为；
- 不因 Dashboard 增加安装/升级能力而开放 LAN、公网、Cloudflare 或 FQGate 原始接口；
- 不允许任何交易、下单、撤单、资金划转、券商控制能力进入该管理通道。

## Phase 3 验收重点

至少覆盖：

- 未安装时安装计划/确认；
- GitHub 默认可信源；
- Gitee 未验证时保持禁用；
- 拒绝任意 URL；
- 无更新、可更新、兼容性阻断；
- stale plan 拒绝；
- 双击/并行更新保护；
- dry-run/preview 不写 active binary；
- 大小/哈希/版本失败；
- health 失败 rollback；
- runtime OpenAPI/必需契约失败 rollback；
- Dashboard/CLI 复用相同事务；
- Dashboard 不在页面加载时自动联网检查/下载安装；
- Windows 交互式用户会话下 loopback 监听保持不变。
