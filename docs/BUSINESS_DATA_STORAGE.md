# 业务数据存储与分阶段启用手册

本文描述 PostgreSQL `app` schema、受保护文件存储和浏览器 v5 缓存的真实边界。所有功能默认关闭；必须先执行 migration 和就绪检查，再按阶段打开开关。

## 存储边界

| 存储 | 内容 | 保留 |
| --- | --- | --- |
| PostgreSQL `app` | 运行/反馈摘要、政策同意、账号工作区、加密 MAA Box、公开排班历史、共享缓存与引用 | 普通数据滚动 30 天；缓存 24 小时；最多 5 条固定排班长期保留 |
| `/var/lib` 私有目录 | CLI 输入输出、命令、stdout/stderr、调试包和反馈附件 | 7 天 |
| 浏览器 v5 | 白名单布局、Box、设置和最近排班；云同步元数据 | 30 天快速启动缓存 |

数据库不保存命令、路径、stdout/stderr、debug bundle、原始 CLI 请求响应或明文 MAA Box。森空岛 UID、昵称、Box、凭据和完整状态快照始终禁止入库；森空岛来源只允许同步不含身份的布局/设置，不保存来源名、排班历史，也不进入共享缓存。

MAA Box 使用每条独立 256 位数据密钥和 AES-256-GCM 加密。版本化主密钥只存在服务器配置，负责包装数据密钥；AAD 固定包含网站用户 ID、快照 ID、schema 版本和用途。读取旧版本会使用对应旧密钥解密并迁移到活动版本；历史排班的 Box HMAC 成功匹配旧密钥后也会重算为活动版本。缺少密钥、密文篡改或 AAD 不匹配均失败关闭。

## Schema

- 第一阶段：`app.plan_run`、`app.feedback`、`app.feedback_event`、`app.policy_consent`。
- 第二阶段：`app.user_workspace`、`app.workspace_revision`、`app.operbox_snapshot`、`app.saved_plan`。
- 第三阶段：`app.plan_cache`、`app.plan_cache_reference`。

`plan_run` 保存求解输入规模、状态、版本身份和不透明制品定位键/大小/SHA-256；登录用户的 MAA 求解成功后还会保存有 32 KiB 上限的白名单计算上下文、公开结果 SHA-256，以及按网站用户与工作区密钥版本隔离的 Box HMAC，但不保存公开结果或 Box 本身。`saved_plan` 保存经过现有持久化校验与内部字段清理的公开 DTO，并复制首次验证后的上下文与 Box HMAC 绑定。缓存键使用另一把独立密钥计算 HMAC，覆盖规范化布局、完整 Box、来源、全部求解参数和求解器 SHA/协议/schema；公共响应不会出现任何 HMAC、缓存命中状态或其他用户信息。

## 分阶段启用

先在隔离数据库运行：

```bash
npm run db:migrate
npm run auth:check
npm run test:auth-integration
```

随后按以下顺序滚动启用，每步至少观察一个完整保留/备份周期：

1. `BETA_BUSINESS_DB_ENABLED=1`：文件与数据库双写，数据库写失败不阻断排班；反馈数据库写失败会明确返回失败。
2. 运行 `npm run db:backfill-business`：只扫描当前 7 天目录，导入白名单摘要；脚本按主键幂等，损坏、过期和未知记录只计入跳过原因，绝不删除原文件。
3. 核对脚本输出的目录数、成功数、跳过数和数据库行数，再设 `BETA_BUSINESS_DB_READ_ENABLED=1`。稳定期保留 `BETA_BUSINESS_FILE_READ_FALLBACK=1`，确认后改为 `0`。
4. 配置 `WORKSPACE_ACTIVE_KEY_VERSION` 与 `WORKSPACE_MASTER_KEYS` 后设 `ACCOUNT_CLOUD_SYNC_ENABLED=1`。旧用户必须确认当前政策版本；拒绝或未确认时保持纯本地，不上传已有数据。
5. 配置独立的 `PLAN_CACHE_HMAC_KEY` 后设 `PLAN_CACHE_ENABLED=1`。同键并发通过数据库租约合并；租约覆盖 CLI 超时并允许崩溃后回收。

回退时按相反顺序关闭开关，不删除数据库行或私有文件。关闭云同步或缓存不需要移除密钥；仍可能存在旧密文时不得删除旧 `WORKSPACE_MASTER_KEYS` 版本。

## 同步与删除

工作区采用最后写入覆盖。浏览器记录最后同步修订：本地指纹变化时上传，否则云端修订较新时下载；每次覆盖前将旧工作区保存为最多 10 个、最长 30 天的版本。普通排班最多 5 条且 30 天过期，固定排班最多 5 条且不受滚动清理影响。排班结果只有在诊断 ID、账号、公共结果摘要、布局/换班配置和 MAA Box HMAC 全部匹配时才能成为当前结果；历史排班与当前工作区 Box 不匹配时仍可固定或删除，但禁止恢复。固定排班的自证信息保存在 `saved_plan`，不依赖 30 天后会清理的 `plan_run`。

撤销当前政策同意会删除工作区、版本、Box 密文、排班历史与该用户引用的全站缓存；共享缓存即使被其他用户使用也优先驱逐。网站账号删除依赖外键级联清除全部用户业务行，并在 Better Auth 删除成功后驱逐预先收集的缓存键。私有文件继续按既有所有者标记和 7 天 TTL 清理。

## 备份、恢复与核查

备份使用完整数据库 `pg_dump --format=custom`，不按 schema 过滤，因此同时包含 `public` 与 `app`。备份文件继续使用 age 加密；主密钥不进入数据库、备份或仓库。季度恢复演练必须在隔离库完成 migration、恢复和以下核查：

- runtime 只能对 `public` 与 `app` 执行已授权 DML，不能创建表；backup 只能读取并可完成完整 dump。
- `auth:check` 能看到全部业务表，并在云同步/缓存开关开启时验证密钥配置。
- 数据库全文抽查搜不到 Box 明文、token、路径、command、stdout/stderr 或 debug bundle。
- 错误密钥、修改后的密文和错误用户/快照 AAD 均无法解密。
- 过期清理不删除固定排班；用户删除后无工作区、快照、历史或缓存引用残留。

不要把 `AUTH_INTEGRATION_DATABASE_URL` 指向 production 或共享 development 数据库；集成测试会创建并删除账号与业务记录。
