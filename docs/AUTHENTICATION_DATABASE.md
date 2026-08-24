# 网站账号、登录与 PostgreSQL 技术及运维手册

本文说明当前网站账号系统的真实实现、数据库用途、登录生命周期、安全边界、开发方式和服务器运维流程。内容已按 2026-08-21 的当前代码核对；当本文与代码不一致时，以 Drizzle Schema、已提交 migration、认证配置和部署脚本为准。

不要把本文示例中的占位值直接投入使用，也不要把生成的密钥、连接串、Resend Key、Cookie、验证码、重置链接或真实邮件写入 Git、Issue、日志或聊天记录。

## 快速结论

- PostgreSQL 的 `public` schema 保存网站账号、Session、验证、认证限流和不含森空岛身份明文的绑定；`app` schema 保存按开关启用的业务摘要、云端工作区和共享缓存。
- 当前政策同意并启用云同步后，布局、设置、公开排班和应用层信封加密的 MAA Box 可以入库。森空岛 UID/昵称、森空岛 Box/凭据和完整状态始终禁止入库。
- 登录使用 Better Auth 的邮箱密码模式。注册后必须输入 6 位邮箱验证码，验证成功也不会自动登录；密码重置使用一小时有效链接。
- production 与 development 使用独立 PostgreSQL 容器、卷、账号、连接串、Better Auth 密钥和邮件配置。
- 数据库与认证对象惰性初始化，所以缺少数据库和认证密钥时仍能完成 `npm run build`；真实认证请求、migration 和认证就绪检查会失败关闭。
- 所有 Schema 变化通过仓库内 Drizzle SQL migration 发布，不使用 `drizzle push` 修改线上数据库。

## 1. 系统结构

当前主要依赖为 PostgreSQL 18.4、Better Auth 1.6.x、Drizzle ORM 0.45.x、node-postgres 8.23.x 和 Resend 6.20.x。浏览器、认证 API、数据库和森空岛凭据之间的关系如下：

```mermaid
flowchart LR
  B[浏览器 authClient] -->|Better Auth 原生协议| R[/api/auth/*]
  R --> A[惰性初始化 Better Auth]
  A --> D[Drizzle adapter]
  D --> P[(PostgreSQL)]
  A -->|验证码 / 重置邮件| E[Resend]

  B -->|应用统一响应信封| U[/api/admin/users 与业务 API]
  U --> S[数据库 Session 与实时管理员角色校验]
  S --> P

  B --> K[/api/skland/*]
  K --> S
  K --> C[用户专属加密 HttpOnly Cookie]
  K -->|仅 HMAC 绑定键和授权时间| P

  B -->|当前政策同意后同步| W[/api/workspace 与 /api/account/saved-plans]
  W -->|白名单数据与 MAA Box 密文| P

  M[发布 helper] -->|DATABASE_MIGRATION_URL| G[已提交 Drizzle migration]
  G --> P
  M -->|DATABASE_URL| H[认证就绪检查]
  H --> P
```

### 1.1 代码入口

| 路径 | 责任 |
| --- | --- |
| `src/server/db/schema.ts` | `public` 认证表与 `app` 业务表的 Drizzle Schema，是生成 migration 的来源 |
| `src/server/db/index.ts` | 惰性创建 `pg.Pool` 与 Drizzle 实例 |
| `src/server/auth/index.ts` | Better Auth、邮箱密码、验证码、管理员插件和数据库限流配置 |
| `src/app/api/auth/[...all]/route.ts` | Better Auth 原生路由、原生 admin 路由封锁和森空岛 Cookie 清理 |
| `src/components/auth/WebsiteAccountPanel.tsx` | 注册、验证码、登录、找回密码、设备退出与账号注销 UI |
| `src/app/api/admin/users*`、`src/app/api/admin/plan-runs*`、`src/app/api/admin/feedback*` | 应用自有管理员搜索、封禁、Session 撤销、角色管理与业务记录管理 |
| `src/server/skland/bindings.ts` | HMAC 化森空岛绑定记录的写入、统计与清理 |
| `src/server/business-records.ts`、`src/server/workspace.ts`、`src/server/plan-cache.ts` | 最小运行/反馈摘要、账号云端工作区和共享排班缓存 |
| `drizzle/*.sql` | 生产实际执行、可审查且按顺序追加的 SQL migration |
| `scripts/migrate-db.mts` | 使用 migration 账号执行已提交 migration |
| `scripts/check-auth-readiness.mts` | 使用 runtime 账号检查认证/业务表及已启用功能的密钥配置 |
| `deploy/postgres/*` | 双环境容器、最小权限角色、备份和 systemd 模板 |
| `src/server/auth/postgres.integration.test.mjs` | PostgreSQL 注册、验证、登录、Session、重置、封禁和角色集成测试 |

## 2. PostgreSQL 存储模型

### 2.1 表与用途

| 表 | 主要内容 | 关键约束与说明 |
| --- | --- | --- |
| `user` | 用户 ID、昵称、邮箱、验证状态、角色、封禁状态与时间戳 | `email` 唯一；昵称由数据库 hook 再校验；应用只把精确的 `admin` 识别为委派管理员，空值或其他值不授予管理员权限 |
| `account` | Better Auth provider 账号映射与邮箱密码凭据记录 | `user_id` 外键级联删除；当前只启用邮箱密码，OAuth token 字段通常为空；密码由 Better Auth 处理，应用代码不得记录明文 |
| `session` | 数据库 Session token、过期时间、用户、IP 与 User-Agent | `token` 唯一，`user_id` 有索引并级联删除；管理员页面最多返回 100 条仍有效 Session |
| `verification` | Better Auth 一次性验证记录 | `identifier` 有索引；邮箱验证码显式配置为哈希存储、10 分钟过期、最多尝试 5 次且成功后不能复用 |
| `rateLimit` | Better Auth 的持久化限流键、次数和最后请求时间 | `key` 唯一；这与应用 API 在 `api-contract.ts` 中的限流是两个独立层次 |
| `skland_binding` | HMAC 化绑定键、网站用户 ID、首次创建和最近扫码授权时间 | 主键不含森空岛 UID 明文；同一森空岛账号不能绑定到两个网站账号；用户删除时级联删除 |

`app` schema 的十张业务表、保留策略、回填、加密和分阶段开关见[业务数据存储与分阶段启用手册](./BUSINESS_DATA_STORAGE.md)。runtime 对两个 schema 都只有 DML；migration 账号负责 DDL；完整加密备份同时覆盖两个 schema。

Drizzle 还会维护 `drizzle.__drizzle_migrations` 元数据，用于判断哪些 migration 已执行。不要手工修改这张表，也不要重命名已经发布的 migration。

### 2.2 不进入 PostgreSQL 的数据

以下内容明确不属于网站账号数据库：

- MAA Box 明文、未经过白名单清理的布局/排班/练卡数据；
- 森空岛 UID、昵称、角色列表、Box、基建快照和完整状态；
- 森空岛 `cred`、token、设备 ID 或二维码临时凭据；
- CLI stdout、stderr、命令、路径、内部调试包、原始请求响应和完整 Box；
- Resend API key、Better Auth secret、数据库密码或 age 私钥。

森空岛凭据使用 `SKLAND_SESSION_SECRET` 派生的 AES-256-GCM 密钥加密，存放在用户浏览器的 HttpOnly、SameSite=Lax、HTTPS 下 Secure Cookie 中。Cookie 还包含网站用户所有者 HMAC；网站账号不匹配时服务端拒绝解密并清理陈旧 Cookie。凭据从扫码成功起固定七天失效，刷新、读取或切换角色不会续期。

### 2.3 数据库连接与最小权限

`deploy/postgres/init-roles.sh` 在空卷首次初始化时创建四类账号：

| 账号 | 用途 | 权限 |
| --- | --- | --- |
| bootstrap | PostgreSQL 容器首次初始化 | 仅初始化阶段持有；应用与日常 migration 不使用 |
| migration | `npm run db:migrate` | 数据库连接、`public`/`app` schema 使用与创建，以及已提交 Schema DDL |
| runtime | Next.js 认证/业务请求与 `npm run auth:check` | migration 创建表的 SELECT/INSERT/UPDATE/DELETE 与序列使用；不能建表 |
| backup | `pg_dump` 与只读检查 | `public`/`app` schema 的 SELECT；不能修改数据 |

脚本会撤销 `PUBLIC` 对 `public` schema 的 CREATE 权限，并通过 migration 用户的 default privileges 将新表 DML 自动授予 runtime、只读权限授予 backup。CI 会实际验证 backup 不能 DELETE、runtime 不能 CREATE TABLE，并确认 backup 可以执行 `pg_dump`。

runtime 连接池只在第一次数据库请求时创建，配置为最大 10 个连接、30 秒 idle timeout、5 秒连接 timeout，以及 10 秒 query/statement timeout。连接池错误只输出固定事件名，不打印连接串或原始凭据。

## 3. 登录生命周期

### 3.1 注册与邮箱验证

1. 用户填写昵称、邮箱和 10–128 位密码。
2. 页面先校验昵称，Better Auth 的数据库 create/update hook 再执行同一规则：昵称为 2–20 个 Unicode 字符，只允许中文、英文字母、数字、空格、下划线和短横线，至少包含一个文字或数字，且不能有连续空格。
3. `signUp.email` 创建未验证用户。Resend 以“可露希尔基建终端”为显示名称发送 6 位验证码。
4. 验证码 10 分钟过期、最多尝试 5 次、数据库只保存哈希，成功后不可复用。前端 60 秒后才允许重新发送。
5. 验证成功只更新邮箱状态，不自动登录；用户需要返回登录表单输入邮箱和密码。

未验证邮箱登录会被 Better Auth 拦截。注册和验证使用 `/api/auth/*` 原生响应，不包装成项目的 `ApiSuccess | ApiFailure`。

### 3.2 登录与 Session

1. 匿名用户点击侧边栏“账号管理”时不会进入账号页，而是打开登录弹窗。
2. `signIn.email` 验证邮箱、密码、封禁状态和邮箱验证状态。
3. 成功后 Better Auth 写入数据库 `session`，浏览器保存 Session Cookie；页面重新获取 Session 后进入账号管理。
4. MAA 导入/求解、development 森空岛接口和管理员接口都会在服务端读取真实 Session。数据库不可用或 Session 不存在时按未认证失败关闭，应用自有 API 返回 `AIC-AUTH-2008`。

前端隐藏入口只负责体验，不是安全边界。`/api/plan` 的匿名例外只有 `boxSource: "sample"`，此时服务端读取可信全角色数据并拒绝客户端传入 `operbox`；其余来源必须登录。

### 3.3 找回与重置密码

1. 用户提交邮箱后，页面始终显示“如果这个邮箱已注册，重置邮件会很快送达”，避免泄露邮箱是否存在。
2. Resend 发送跳转到 `/account/reset-password` 的一小时有效链接。
3. 页面从 URL 读取 token，要求新密码仍为 10–128 位，然后调用 Better Auth `resetPassword`。
4. 重置成功会撤销该用户已有数据库 Session，旧密码不能再登录；用户需要用新密码重新登录。

### 3.4 退出、封禁与注销

| 操作 | 网站 Session | 森空岛 Cookie | PostgreSQL 绑定记录 |
| --- | --- | --- | --- |
| 退出当前设备 | Better Auth 撤销当前 Session | 清除当前浏览器中 `skland_` 前缀 Cookie | 保留，用于再次登录后提示重新扫码 |
| 退出全部设备 | 撤销该用户全部数据库 Session | 清除发起操作的当前浏览器森空岛 Cookie；其他设备因网站 Session 失效无法读取绑定凭据 | 保留 |
| 重置密码 | 撤销已有数据库 Session | 不把森空岛凭据写入响应；没有网站 Session 时凭据不可读取 | 保留 |
| 管理员封禁 | 设置 `user.banned` 并删除该用户 Session | 没有网站 Session 时凭据不可读取 | 保留，直到解封后用户或管理员流程处理 |
| 永久注销网站账号 | 要求当前密码，删除用户和 Session | 清除当前浏览器森空岛 Cookie | 通过外键级联删除 |
| 退出某个森空岛账号 | 网站 Session 不变 | 删除对应加密账号 Cookie | 删除对应 HMAC 绑定 |
| 删除全部森空岛数据 | 网站 Session 不变 | 删除全部森空岛 Cookie | 删除全部绑定，并清理可关联的服务端森空岛运行记录/反馈 |

## 4. 产品权限与 API 边界

| 能力 | 匿名用户 | 已验证网站账号 |
| --- | --- | --- |
| 技能查询、全角色样例、配置与求解 | 可用 | 可用 |
| MAA JSON / xlsx 导入及求解 | 返回 `AIC-AUTH-2008` | 可用 |
| 森空岛登录、同步和求解 | 不可用 | 仅 development 可用 |
| `/admin/users` | 不可用 | 初始管理员及其通过管理页授予权限的管理员可用 |
| 云端工作区与排班历史 | 不可用 | 当前政策同意且功能开关开启后可用 |

`/api/auth/*` 保持 Better Auth 原生响应，是统一 `ApiSuccess | ApiFailure` 信封的唯一例外。应用自有的 `/api/admin/*`、`/api/plan`、`/api/skland/*`、`/api/account/data-consent`、`/api/workspace` 和 `/api/account/saved-plans*` 继续使用统一信封、请求 ID、同源校验、大小限制和限流。Better Auth 的原生 `/api/auth/admin/*` 全部返回 404，避免开放模拟登录、改密码、删除用户或绕过应用权限边界授予角色等能力。网站昵称为 2–20 个字符，只允许中文、英文字母、数字、空格、下划线和短横线，且不能包含连续空格；页面与 Better Auth 数据库钩子执行同一规则。

`BETTER_AUTH_ADMIN_USER_IDS` 中的账号是不可由网页降级的初始管理员。初始管理员可以在中文管理页将已验证、未封禁的账号设为管理员，角色保存于 PostgreSQL 的 `user.role`。受委派管理员可以搜索、封禁用户及查看或撤销 Session，但不能继续授予或撤销管理员权限，也不能封禁初始管理员或撤销其 Session。服务端每次请求都读取当前数据库角色，因此撤销权限后立即生效。

PostgreSQL 保存网站账号、数据库 Session、验证记录、Better Auth 限流记录，以及 HMAC 化的森空岛绑定标识、对应网站用户和授权时间。森空岛状态中心根据最近授权时间区分七天内有效与待续期绑定，管理后台分别显示两类数量；到期不会删除绑定记录。业务开关启用后，当前政策已同意的用户可以同步白名单布局、设置、公开排班及加密 MAA Box；森空岛 UID/昵称、Box 与第三方游戏凭据仍不写入 PostgreSQL，凭据只保存在绑定网站用户的加密 HttpOnly Cookie 中。

### 4.1 管理员模型

`BETTER_AUTH_ADMIN_USER_IDS` 是权限信任根，值为逗号分隔的 Better Auth user ID：

- 初始管理员始终有管理员权限，网页不能将其降级。
- 只有初始管理员能把已验证、未封禁的用户设为管理员或撤销该角色。
- 受委派管理员可以搜索用户、查看有效 Session、撤销 Session、封禁和解封普通用户，但不能继续扩权，也不能影响初始管理员。
- 每个管理员请求都重新读取 `user.role`，因此撤销委派角色后立即生效。
- 原生 `/api/auth/admin/*` 固定返回 404；所有管理操作只能走应用自有资源型 `/api/admin/*` 接口。

管理员用户搜索与 Session 列表各最多返回 100 条；搜索词和 user ID 有长度限制，写操作保留同源校验、16 KiB 请求体上限、请求 ID、统一错误信封和独立限流。

### 4.2 API 协议

| 路由 | 协议与鉴权 |
| --- | --- |
| `GET/POST /api/auth/*` | Better Auth 原生协议；唯一不使用项目统一响应信封的路由族 |
| `GET /api/admin/users`、`PATCH /api/admin/users/[id]`、`GET/DELETE /api/admin/users/[id]/sessions` | 项目统一信封；要求实时管理员权限；写操作要求同源 |
| `GET /api/admin/plan-runs`、`GET /api/admin/feedback`、`PATCH /api/admin/feedback/[id]` | 项目统一信封；要求实时管理员权限；写操作要求同源 |
| `POST /api/plan` | sample 可匿名，MAA/森空岛/旧来源要求网站 Session |
| `/api/skland/*` | 项目统一信封；要求网站 Session，且只在当前部署显式启用森空岛时开放 |
| `GET/POST/DELETE /api/account/data-consent` | 项目统一信封；要求网站 Session；写操作要求同源；云同步开关关闭时返回功能不可用 |
| `GET/PUT /api/workspace` | 项目统一信封；要求网站 Session 与当前政策同意；写操作要求同源 |
| `GET /api/account/saved-plans`、`PATCH/DELETE /api/account/saved-plans/[id]` | 账号排班历史；项目统一信封；要求网站 Session 与当前政策同意；写操作要求同源 |

`POST /api/plan` 只负责即时求解；账号历史使用 `/api/account/saved-plans`，避免以单复数区分完全不同的动作。旧 `/api/plans*` 暂时兼容并返回 `Deprecation: true` 与 successor `Link`。求解成功时服务端从白名单结果确定自动配方，保存带结果 SHA-256 及用户域 Box HMAC 绑定的最小计算上下文（布局、换班方式与菲亚梅塔设置）；workspace 只有在诊断 ID、用户归属、结果摘要、计算上下文和 MAA Box 全部一致时才接受该结果。绑定首次验证后由用户自己的 saved plan 继续自证，因此固定排班不依赖 30 天后会过期的运行摘要；缺少可信上下文的旧记录或 Box 已变化的历史排班不得与当前工作区拼接恢复，任何 HMAC 都不会出现在公共响应中。

旧 `DELETE /api/workspace`、`/api/admin/records`、`POST /api/admin/users`、带 `userId` 查询的 `/api/admin/users`，以及 `/api/skland/session`、`/api/skland/status`、`/api/skland/data` 暂时作为兼容入口并返回 `Deprecation: true` 与 successor `Link`。新客户端应使用资源型路由；撤销云端同意并级联删除统一使用 `DELETE /api/account/data-consent`。

production 的森空岛能力默认失败关闭，只有精确设置`SKLAND_FEATURE_ENABLED=1`才会进入客户端、健康检查和公开 API 面；未设置、空值或其他值均保持关闭。网站账号与数据库能力不依赖该开关。

## 5. 配置、惰性初始化与 migration

### 5.1 环境变量

| 变量 | 使用者 | 要求 |
| --- | --- | --- |
| `DATABASE_URL` | Next runtime、`auth:check` | runtime 最小权限连接串 |
| `DATABASE_MIGRATION_URL` | Drizzle Kit、`db:migrate` | migration DDL 连接串 |
| `BETTER_AUTH_SECRET` | Better Auth | 至少 32 个 UTF-8 字节、长期稳定、环境间不同 |
| `BETTER_AUTH_URL` | Better Auth 链接与 Origin | 浏览器实际访问的完整 Origin；非本地必须 HTTPS，不得含路径、查询或凭据 |
| `BETTER_AUTH_ADMIN_USER_IDS` | 管理员授权 | 逗号分隔 user ID；不要填写邮箱 |
| `RESEND_API_KEY` | 认证邮件 | 对应环境的 Resend key |
| `AUTH_EMAIL_FROM` | 认证邮件 | 已验证域名的 From；显示名会被规范为“可露希尔基建终端” |
| `BETA_BUSINESS_DB_ENABLED` | 业务摘要双写 | migration 完成后才可设为 `1` |
| `BETA_BUSINESS_DB_READ_ENABLED` | 运维摘要读取 | 双写核对稳定后再设为 `1` |
| `ACCOUNT_CLOUD_SYNC_ENABLED` | 账号云端工作区 | 需同时配置版本化工作区主密钥 |
| `WORKSPACE_ACTIVE_KEY_VERSION`、`WORKSPACE_MASTER_KEYS` | MAA Box 信封加密 | 当前版本及历史 32 字节主密钥只保存在服务端 |
| `PLAN_CACHE_ENABLED`、`PLAN_CACHE_HMAC_KEY` | 共享排班缓存 | HMAC 密钥至少 32 字节且独立于其他密钥 |

`src/server/db/index.ts` 和 `src/server/auth/index.ts` 都使用全局缓存进行运行时惰性初始化。Next build 不会因为导入模块而连接数据库；CI 还会显式清空数据库与认证变量执行 production build。以下操作则必须有完整配置并失败关闭：

- 第一次访问 `/api/auth/*` 或任何要求网站 Session 的应用 API；
- `npm run db:generate` 与 `npm run db:migrate`；
- `npm run auth:check`；
- PostgreSQL 认证集成测试。

### 5.2 Schema 修改流程

1. 修改 `src/server/db/schema.ts`。
2. 使用 migration 连接串运行 `npm run db:generate`。
3. 审查新生成的 `drizzle/*.sql` 与 `drizzle/meta/*`，确认没有意外 DROP、数据回填或权限变化。
4. 提交 Schema、SQL migration 和 metadata；不要修改已发布 migration。
5. 在临时 PostgreSQL 上执行 `npm run db:migrate`、`npm run auth:check` 和 `npm run test:auth-integration`。
6. 发布 helper 会在新 release 构建完成后、切换 `current` 前依次执行 migration 与认证就绪检查。任一步失败都会保留旧 release。

生产 Schema 不使用 `drizzle push`。需要删除列、改类型或重写大量数据时，采用 expand/contract：先添加兼容结构并双读/双写，确认旧代码不再依赖后再在后续 release 删除。

### 5.3 常用命令

```bash
# 只检查普通前端与 API；不启动 PostgreSQL 集成测试
npm run check

# 根据 schema 生成可审查 SQL；需要 DATABASE_MIGRATION_URL
npm run db:generate

# 执行仓库内已提交 migration；需要 DATABASE_MIGRATION_URL
npm run db:migrate

# 用 runtime 连接检查配置、认证表和已启用的业务能力；不会发送邮件
npm run auth:check

# 需要 AUTH_INTEGRATION_DATABASE_URL 指向可清理的隔离测试库
npm run test:auth-integration
```

认证集成测试会清理测试数据并直接修改用户角色和封禁状态，绝不能指向 production 或共享 development 数据库。

### 5.4 本地启用完整登录流程

只开发匿名样例和普通 UI 时不需要启动 PostgreSQL。需要调试注册、Session、管理员或森空岛账号绑定时，优先使用隔离的本地数据库：

1. 在 `deploy/postgres/` 中把 `example.env` 复制为不入库的 `development.env`，为四类账号生成不同密码。
2. 运行 `docker compose -f deploy/postgres/compose.yml up -d development`，确认只有 `127.0.0.1:55433` 监听。
3. 从 `.env.example` 创建不入库的 `.env.local`，将两个数据库 URL 指向本地 55433 端口，`BETTER_AUTH_URL` 使用 `http://127.0.0.1:5174`。
4. 配置至少 32 字节的本地 Better Auth secret。需要实际收信时再配置 development Resend key 与已验证 From；不要复用 production key。
5. 依次运行 `npm run db:migrate`、`npm run auth:check` 和 `npm run dev`。

通过 Tailscale SSH 可以用 `ssh -L 15432:127.0.0.1:55433 <server>` 临时访问服务器 development 数据库，但仅适合受控运维或只读诊断。不要把会清理数据的 `AUTH_INTEGRATION_DATABASE_URL` 指向这个转发端口，也不要把 PostgreSQL 直接监听到公网或 Tailscale IP。

## 6. 服务器部署与运维

### 6.1 准备发信域名

在 Resend 中添加发信域名，按照 Resend 控制台给出的值在 DNS 服务商配置 SPF 与 DKIM，并为该域名添加 DMARC。当前 development 使用已验证的 `yeyouchuan.me`；production 使用独立的`auth.riic.autos`和独立 API key。DNS 与 Resend 均显示验证成功前不得发布 production 认证流。From 地址分别为：

```text
可露希尔基建终端 <noreply@yeyouchuan.me>
可露希尔基建终端 <noreply@auth.riic.autos>
```

development 和 production 使用不同的 API key、发信配置与公开 Origin。注册邮箱验证码 10 分钟后失效且数据库只保存哈希，密码重置链接一小时后失效。

### 6.2 准备服务器数据库目录

在服务器创建一个不随 Next release 淘汰的运维目录，并从已评审 commit 复制 `deploy/postgres`：

```bash
sudo install -d -m 0755 /opt/arknights-infra-databases
sudo install -m 0644 deploy/postgres/compose.yml /opt/arknights-infra-databases/compose.yml
sudo install -m 0755 deploy/postgres/init-roles.sh /opt/arknights-infra-databases/init-roles.sh
```

分别生成 bootstrap、runtime、migration、backup 密码；每个环境、每个角色都使用不同值：

```bash
openssl rand -hex 32
```

以 `deploy/postgres/example.env` 为模板创建 `/opt/arknights-infra-databases/development.env` 与 `production.env`，设置为 `root:root 0600`。密码使用十六进制可避免 PostgreSQL URL 额外转义。首次启动时初始化脚本会创建：

- runtime 用户：`public` 认证表与 `app` 业务表 DML；不能执行 DDL。
- migration 用户：发布时执行仓库内 migration。
- backup 用户：只读 `public` 与 `app`，供 `pg_dump` 使用。

### 6.3 首次启动 development PostgreSQL

首次只启动 development，避免误建 production 数据卷：

```bash
cd /opt/arknights-infra-databases
sudo docker compose -f compose.yml up -d development
sudo docker compose -f compose.yml ps development
sudo ss -ltnp | grep 55433
```

验收要求：容器为 healthy，主机只出现 `127.0.0.1:55433`，不得出现 `0.0.0.0:55433`、公网 IP 或 Tailscale IP。初始化脚本只在空数据卷运行；如果首次初始化失败，不要直接删除数据卷，先保留日志并确认目标卷后再处理。

### 6.4 配置 development 应用环境

编辑 `/opt/arknights-infra-dev/shared/.env.local`，保持 `root:arkinfra 0640` 或更严格权限，并加入：

```text
DATABASE_URL=postgresql://<dev-runtime-user>:<dev-runtime-password>@127.0.0.1:55433/<dev-db>
DATABASE_MIGRATION_URL=postgresql://<dev-migration-user>:<dev-migration-password>@127.0.0.1:55433/<dev-db>
BETTER_AUTH_SECRET=<至少32字节、长期稳定且仅供development使用的随机值>
BETTER_AUTH_URL=https://instance-pi2ohhfj.tail2dca9.ts.net
BETTER_AUTH_ADMIN_USER_IDS=
RESEND_API_KEY=<development Resend API key>
AUTH_EMAIL_FROM=可露希尔基建终端 <noreply@yeyouchuan.me>
```

同时保留 development 已有的 `APP_DEPLOYMENT_ENV=development`、`BETA_PUBLIC_ORIGIN`、`SKLAND_PUBLIC_ORIGIN`、`SKLAND_SESSION_SECRET` 等配置。当前 development 的浏览器 Origin 是 `https://instance-pi2ohhfj.tail2dca9.ts.net`，`BETTER_AUTH_URL`、`BETA_PUBLIC_ORIGIN` 和 `SKLAND_PUBLIC_ORIGIN` 都必须与它一致，并保持 `SKLAND_ALLOW_INSECURE_HTTP=0`。SSH 隧道只用于数据库运维，不改变网站 Origin。以后更换 dev 域名时，将三个 Origin 一起改为浏览器实际访问的 HTTPS Origin；不要填写内部 Next 或 nginx 端口，也绝不能复用 production 的公网 Origin。

`BETTER_AUTH_SECRET` 可以用 `openssl rand -hex 32` 生成。它与 `SKLAND_SESSION_SECRET` 必须不同；两者都要长期稳定，轮换会使现有会话失效。

### 6.5 固定 deploy helper（首次安装或契约升级）

认证 release 在构建成功后、切换 `current` 前依次运行 `npm run db:migrate` 与 `npm run auth:check`。后者会用 runtime 连接确认认证配置和已提交表均可用，但不会发送真实邮件。工作流调用服务器固定的 `/usr/local/sbin/arknights-infra-deploy`；首次启用或 helper 契约不兼容升级时，必须在合并目标分支前把已评审脚本原子安装到服务器。安装后核对：

```bash
sudo install -o root -g root -m 0755 scripts/deploy-release.sh /usr/local/sbin/arknights-infra-deploy.new
sudo mv /usr/local/sbin/arknights-infra-deploy.new /usr/local/sbin/arknights-infra-deploy
sudo stat -c '%U:%G:%a' /usr/local/sbin/arknights-infra-deploy
/usr/local/sbin/arknights-infra-deploy --contract-version
sha256sum /usr/local/sbin/arknights-infra-deploy
```

预期 owner/mode 为 `root:root:755`、契约版本为 `1`。不要跳过工作流的 owner、mode 或 contract 检查。migration 或认证就绪检查失败时，helper 会删除失败 release，保持原 `current` 与服务不变。

### 6.6 首次发布与管理员初始化

合并并推送 `develop` 后等待 `Frontend quality` 与 `Deploy verified branch` 全部成功。第一次发布时 `BETTER_AUTH_ADMIN_USER_IDS` 为空是正常的：先用运营邮箱注册并完成验证，再从数据库只读查询 user ID：

```bash
psql 'postgresql://<dev-backup-user>:<password>@127.0.0.1:55433/<dev-db>' \
  -c 'select id, email, email_verified, created_at from "user" order by created_at desc;'
```

把确认无误的 ID 写入 `BETTER_AUTH_ADMIN_USER_IDS`，多个 ID 用逗号分隔；随后重启 development 服务并访问 `/admin/users`。这些 ID 是权限恢复与后续委派的信任根，不应删除最后一个可用的初始管理员。日常管理员可由初始管理员在页面中授予，不需要继续修改服务器环境变量。

### 6.7 配置每日加密备份

服务器至少需要 `pg_dump` 和 `age`。创建专用 `arkbackup` 用户与 age 接收者密钥；私钥离线保存，服务器只需 age 公钥。将脚本与 systemd 模板安装为 root 所有：

```bash
id -u arkbackup >/dev/null 2>&1 || sudo useradd --system --home-dir /var/lib/arkbackup --shell /usr/sbin/nologin arkbackup
sudo install -d -o arkbackup -g arkbackup -m 0700 /var/lib/arkbackup
sudo install -d -o arkbackup -g arkbackup -m 0700 /var/backups/arknights-infra/development
sudo install -o root -g root -m 0755 deploy/postgres/backup.sh /usr/local/sbin/arknights-infra-db-backup
sudo install -o root -g root -m 0644 deploy/postgres/arknights-infra-db-backup@.service /etc/systemd/system/
sudo install -o root -g root -m 0644 deploy/postgres/arknights-infra-db-backup@.timer /etc/systemd/system/
```

development 的 `BACKUP_LOCAL_DIR` 固定填写 `/var/backups/arknights-infra/development`。在 `/etc/arknights-infra/db-backup-development.env` 配置不含密码的 `DATABASE_BACKUP_URL`（例如 `postgresql://arknights_dev_backup@127.0.0.1:55433/arknights_infra_auth`）、独立的 `PGPASSWORD`、`BACKUP_AGE_RECIPIENT` 与 `BACKUP_LOCAL_DIR`。不要把密码嵌入连接 URL，否则会暴露在 `pg_dump` 的进程参数中。环境文件权限设为 `root:arkbackup 0640`。

development 测试期可以省略异地存储；此时脚本只保留最近 14 天的本地加密文件。配置异地存储时，必须同时设置 `RESTIC_REPOSITORY` 与 `RESTIC_PASSWORD_FILE`，并提供对象存储凭据；两个变量只设置一个会使任务失败。restic 密码文件必须只允许 `arkbackup` 读取。首期 production 按已接受风险只配置服务器本机 age 加密备份，不配置 restic/S3；后续若启用异地仓库必须与 development 完全隔离。先手工运行一次并完成隔离恢复，再启用定时器：

```bash
sudo systemctl daemon-reload
sudo systemctl start arknights-infra-db-backup@development.service
sudo systemctl enable --now arknights-infra-db-backup@development.timer
systemctl list-timers 'arknights-infra-db-backup@*'
```

本地模式保留最近 14 天的加密文件；异地模式另由 restic 保留 14 个日快照和 8 个周快照。每季度必须在隔离 PostgreSQL 中执行一次解密恢复，并验证迁移版本、账号行数以及注册/验证/登录链路；“备份任务成功”不能代替恢复演练。仅有本地备份无法抵御服务器磁盘损坏或整机丢失；首期 production 明确接受该风险，但必须在每次发布与恢复演练记录中继续披露。

### 6.8 development 上线验收

上线后逐项确认：

1. PostgreSQL 容器 healthy，只有 `127.0.0.1:55433` 监听。
2. release 的 `.release-sha` 等于已验证 `develop` SHA，systemd 为 active。
3. `/api/health` 成功且 `data.plannerReady: true`；健康响应不含数据库 URL、用户名、版本或原始错误。
4. 注册、验证邮箱、未验证登录拦截、正常登录、找回密码、重置后旧 Session 失效均正常。
5. 匿名全角色样例可求解；匿名 MAA 返回 `AIC-AUTH-2008`；登录后 MAA 可求解。
6. development 森空岛全部入口要求网站账号；退出网站账号、退出全部设备或注销后，原森空岛 Cookie 不能被其他网站用户读取。
7. 管理页只能由初始或受委派管理员访问，可搜索、查看/撤销 Session、封禁和解封；只有初始管理员能授予或撤销管理员角色，受委派管理员不能影响初始管理员；原生 `/api/auth/admin/*` 返回 404。
8. 390px、768px、1440px 下分别完成账号管理的注册、验证提示与账号设置，以及森空岛状态中心的权限引导、七天扫码续期和管理页检查。
9. backup service 成功且本地加密文件存在；配置异地存储时还需确认 restic 快照存在，并在隔离库完成至少一次恢复验证。

production 显式启用森空岛后必须保留对应代码、文案、健康字段和 API 访问面；关闭构建仍必须完整移除。production 数据库、Better Auth、Resend、工作区主密钥和备份凭据不得复用 development 的值，既有 production `SKLAND_SESSION_SECRET`则应长期保持稳定。

### 6.9 production 一次性启用清单

production 使用全新账号库，不复制 development 用户、Session、管理员、政策同意、云工作区、排班历史或森空岛绑定。上线前按以下原子顺序执行，任一前置条件失败都不得合并`main`：

1. 确认`riic.autos`指向 production HTTPS 入口，`ark.riic.autos`只做永久跳转；`auth.riic.autos`的 SPF、DKIM、DMARC 与 Resend 验证全部通过。
2. 使用仅属于 production 的 bootstrap、runtime、migration、backup 四组随机密码创建`production.env`，再启动并核对数据库：

   ```bash
   cd /opt/arknights-infra-databases
   sudo docker compose -f compose.yml up -d production
   sudo docker compose -f compose.yml ps production
   sudo ss -ltnp | grep 55432
   ```

   只允许`127.0.0.1:55432`监听，production volume 不得复用 development。
3. 将`/opt/arknights-infra/shared/.env.local`设为`root:arkinfra 0640`或更严格，并配置下列非仓库值：

   ```text
   APP_DEPLOYMENT_ENV=production
   SKLAND_FEATURE_ENABLED=1
   DATABASE_URL=postgresql://<prod-runtime-user>:<prod-runtime-password>@127.0.0.1:55432/<prod-db>
   DATABASE_MIGRATION_URL=postgresql://<prod-migration-user>:<prod-migration-password>@127.0.0.1:55432/<prod-db>
   BETTER_AUTH_SECRET=<production专用且至少32字节的长期随机值>
   BETTER_AUTH_URL=https://riic.autos
   BETTER_AUTH_ADMIN_USER_IDS=
   RESEND_API_KEY=<production专用Resend key>
   AUTH_EMAIL_FROM=可露希尔基建终端 <noreply@auth.riic.autos>
   BETA_PUBLIC_ORIGIN=https://riic.autos
   SKLAND_PUBLIC_ORIGIN=https://riic.autos
   SKLAND_SESSION_SECRET=<保留既有production长期稳定值>
   SKLAND_ALLOW_INSECURE_HTTP=0
   BETA_BUSINESS_DB_ENABLED=1
   BETA_BUSINESS_DB_READ_ENABLED=1
   BETA_BUSINESS_FILE_READ_FALLBACK=1
   ACCOUNT_CLOUD_SYNC_ENABLED=1
   WORKSPACE_ACTIVE_KEY_VERSION=v1
   WORKSPACE_MASTER_KEYS=<production专用版本化32字节主密钥JSON>
   PLAN_CACHE_ENABLED=0
   ```

   三个公开 Origin 必须完全一致，不得使用内部 Next、Nginx、旧 Tailscale 地址或`ark.riic.autos`。production `BETTER_AUTH_SECRET`、Resend key、工作区主密钥和备份凭据均不得复用 development。
4. 从待合并、已评审 commit 原子安装固定 deploy helper，确认普通文件、`root:root 0755`、契约版本`1`和 SHA-256。该兼容修改不增加参数，也不升级契约版本；helper 会从`shared/.env.local`读取严格的`SKLAND_FEATURE_ENABLED=0|1`，production 未设置时继续失败关闭。
5. 为 production 生成独立 age recipient，把`BACKUP_LOCAL_DIR`设为`/var/backups/arknights-infra/production`，手工运行`arknights-infra-db-backup@production.service`并在隔离 PostgreSQL 完成一次解密恢复。首期不设置`RESTIC_REPOSITORY`或`RESTIC_PASSWORD_FILE`。
6. 合并并发布准确的已验证`main` SHA；migration 与`auth:check`必须在切换`current`前成功。发布后运行一次`npm run db:backfill-business`，只回填 production 当前七天内的运行/反馈白名单摘要，并记录成功、跳过与数据库行数。
7. 在 production 新注册并验证运营网站账号，用 backup 只读账号查询 Better Auth user ID，把确认后的 ID 写入`BETTER_AUTH_ADMIN_USER_IDS`再重启服务。不得填写邮箱或复制 development 管理员 ID。

首发验收必须覆盖邮件验证码、登录/退出、找回密码、Session 撤销、管理员权限、MAA 求解、云工作区、排班历史、森空岛扫码/切角/同步/求解/退出/删除全部数据，并确认公开响应、日志、数据库和浏览器存储不含凭据、明文 Box、内部路径或调试字段。失败时原子回滚应用 release；已执行的向前兼容 migration 保留。关闭森空岛需要修改开关后重新构建发布，不能只重启旧构建。

## 7. 故障定位

| 现象 | 优先检查 |
| --- | --- |
| `npm run build` 成功，但登录接口报错 | 这是惰性初始化的预期差异；检查 `DATABASE_URL`、`BETTER_AUTH_SECRET`、`BETTER_AUTH_URL` 和数据库连通性 |
| `db:migrate` 提示缺少 URL | 只读取 `DATABASE_MIGRATION_URL`，不要用 runtime 连接串替代 |
| `auth:check` 提示缺表 | migration 未执行、连错环境，或 runtime 用户看不到 public schema；先核对目标主机/端口/数据库名 |
| 注册成功但收不到验证码 | 检查 Resend key、已验证域名、`AUTH_EMAIL_FROM` 和 Resend 投递记录；不要在日志中打印验证码 |
| 登录返回 403 | 常见原因是邮箱未验证或账号已封禁；不要通过直接改 Session 绕过 |
| 应用 API 返回 `AIC-AUTH-2008` | Session 不存在、数据库访问失败或认证配置失败都会按未认证关闭；结合最小化服务日志和 request ID 排查 |
| 管理页返回 `AIC-AUTH-2009` | 核对 user ID 是否在 `BETTER_AUTH_ADMIN_USER_IDS`，或 `user.role` 是否精确为 `admin` |
| 森空岛显示已绑定但当前未登录 | PostgreSQL 绑定记录仍在，但七天凭据 Cookie 缺失或过期；用户需要重新扫码，不要从数据库恢复凭据 |
| migration 成功但 runtime 写入失败 | 检查 migration 是否由 migration 用户创建，以及 default privileges 是否正确授予 runtime |
| 备份任务成功但无法恢复 | 备份成功不等于可恢复；在隔离库用 age 解密并执行 `pg_restore`，再跑认证生命周期冒烟 |

公开健康检查只能说明求解器与公开能力状态，不能返回数据库地址、用户、版本或原始连接错误。数据库与登录验收应使用 `auth:check`、隔离集成测试和真实注册/验证/登录冒烟共同完成。
