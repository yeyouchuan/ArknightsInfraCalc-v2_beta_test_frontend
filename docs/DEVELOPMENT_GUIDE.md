# 明日方舟基建排班助手开发指南

## 产品与工程边界

“明日方舟基建排班助手”是面向用户的多班次排班工具。用户导入干员数据、配置基建设施与求解器支持的换班方式，服务端调用长驻的 `infra-cli serve`，前端展示排班、效率与练卡建议，并可导出到 MAA。

本仓库负责 Next.js 前端、公开 API、CLI 调用适配、运行记录和反馈入口，不在前端实现排班算法、干员技能或效率公式。算法与 CLI 协议变更应进入相邻核心仓库。

以下产品约束必须作为 UI 回归项保留：

- 未生成结果时突出“导入自己的 BOX”和“先看全角色示例”；搜索、导出、班次与折叠控制只在有结果后出现。
- production 只有显式启用森空岛时才显示“森空岛状态中心”并请求对应 API；关闭时保持“基建计算器 / 练卡建议 / 技能查询 / 账号管理”四个一级导航。development 默认显示森空岛，也可显式关闭。
- 1024px 及以上默认使用“一图流布局”；768–1023px 和手机端默认“列表式布局”，手机端继续显示禁用态的“一图流布局”。
- 加工站继续使用现有“暂不显示”按钮和交互。

## 本地启动

```powershell
npm install
npm run dev
```

默认地址为 `http://127.0.0.1:5174`。页面和 `/api/*` 均由同一个 Next.js 服务提供。

常用验证命令：

```powershell
npm run check
npm run build
npm run test:production-client
npm run test:e2e
npm run test:e2e:production-profile
npm run test:e2e:webkit
```

`npm run check`依次运行 lint、单元/持久化测试和公开 API 契约测试。`npm run test:e2e`运行默认 Chromium 发布门禁；涉及响应式、触控或 Safari 兼容性的 UI 改动还应在本地运行独立 WebKit 回归。CI 每日定时运行完整 WebKit 套件，也可从 Actions 手动触发。

Windows 前端命令使用 PowerShell。部署 shell 测试只以 Linux CI 或显式 WSL Ubuntu 结果为准；裸`bash`可能被 Windows 解析到 Docker WSL、Git Bash 或系统 shim。行尾、平台二进制和 helper 生命周期见[开发与发布维护准则](./DEVELOPMENT_RELEASE_GUARDRAILS.md)。

## 核心目录

| 路径 | 责任 |
| --- | --- |
| `src/App.tsx` | 工作台状态、恢复门控、页面编排 |
| `src/website-session.ts`、`src/website-session-data.ts` | 工作台唯一 Website Session Provider、静默请求与公开字段白名单 |
| `src/onboarding.ts` | 内联起步卡偏好迁移与三步状态推导 |
| `src/components/layout/AppTopBar.tsx` | 全局粘性账号入口与移动端侧栏触发器 |
| `src/api.ts` | 统一解析公开 API envelope，抛出带错误码的 `ApiClientError` |
| `src/types.ts` | 内部类型、公开 DTO、错误码 |
| `src/persistence.ts` | v5 本地保存、来源标记、迁移、过期清理和白名单 |
| `src/operbox-normalization.ts` | 导入、森空岛快照和旧会话的求解器名称归一化；同名保留更高练度记录 |
| `src/rotation-settings.ts` | Worker 支持的固定换班 profile 与时长元数据 |
| `src/rotation-result.ts` | Worker rotation 输出到公共 DTO 的严格白名单映射 |
| `src/rotation-presentation.ts` | 班次标签、队伍名称、单位与相对差值展示换算 |
| `src/server/api-contract.ts` | requestId、错误响应、同源、大小、限流和并发保护 |
| `src/server/public-plan.ts` | 内部求解结果到公开排班 DTO 的白名单映射 |
| `src/server/infra.ts` | CLI 查找、长驻进程、内部运行记录和反馈落盘 |
| `src/server/business-records.ts` | 运行/反馈白名单摘要、审计事件与文件回退 |
| `src/server/workspace.ts` | 政策同意后的账号工作区、Box 密文与排班历史 |
| `src/server/plan-cache.ts` | 求解器身份绑定的共享缓存、计算租约与删除驱逐 |
| `src/app/api/*/route.ts` | 公开 HTTP 路由 |
| `e2e/production-readiness.spec.ts` | hydration、产品主流程和锁定区域回归 |
| `scripts/extract-room-emblems.mjs` | 从现有 WebP 确定性提取透明高清设施徽记 |
| `scripts/ci-change-scope.mjs` | CI 变更范围分类、失败关闭和部署判定 |
| `.github/workflows/frontend-quality.yml` | PR 与 main/develop push 的并行质量门禁、部署汇总及定时 WebKit 回归 |

## 公开 API 契约

成功响应：

```ts
type ApiSuccess<T> = {
  success: true;
  data: T;
  requestId: string;
};
```

失败响应：

```ts
type ApiFailure = {
  success: false;
  error: {
    code: AppErrorCode;
    message: string;
    requestId: string;
    retryable: boolean;
    fieldErrors?: Array<{
      path: string;
      code: string;
      message: string;
    }>;
  };
};
```

所有响应同时带 `X-Request-Id`。错误日志只记录 requestId、错误码、路由、HTTP 状态和耗时，不记录请求正文、完整干员数据或森空岛会话。

公开路由：

- `GET /api/health`
- `GET /api/sample-operbox`
- `POST /api/plan`
- `POST /api/feedback`
- `GET/DELETE /api/skland/accounts`
- `DELETE /api/skland/accounts/[id]`
- `POST /api/skland/auth/qr`
- `POST /api/skland/auth/qr/status`
- `POST /api/skland/sync`
- `POST /api/skland/role`
- `POST /api/skland/status/refresh`
- `DELETE /api/skland/account-data`
- `GET/POST /api/auth/*`（Better Auth 原生协议，不使用公共响应信封）
- `GET /api/admin/users`
- `PATCH /api/admin/users/[id]`
- `GET/DELETE /api/admin/users/[id]/sessions`
- `GET /api/admin/plan-runs`
- `GET /api/admin/feedback`
- `PATCH /api/admin/feedback/[id]`
- `GET/POST/DELETE /api/account/data-consent`
- `GET/PUT /api/workspace`
- `GET /api/account/saved-plans`
- `PATCH/DELETE /api/account/saved-plans/[id]`

`POST /api/plan` 是即时求解，`/api/account/saved-plans*` 是账号排班历史。旧 `/api/plans*`、`DELETE /api/workspace`、`/api/admin/records`、`POST /api/admin/users`、带 `userId` 查询的 `/api/admin/users`，以及旧 `/api/skland/session`、`/api/skland/status`、`/api/skland/data` 仅保留兼容并返回 successor 链接，不应在新代码中使用。撤销云端同意并清除数据统一使用 `DELETE /api/account/data-consent`。

`/api/auth/*` 是统一响应信封的唯一例外。Better Auth 原生 admin 路由全部返回 404；管理员只能使用应用自有的中文用户管理接口。`BETTER_AUTH_ADMIN_USER_IDS` 定义不可由网页降级的初始管理员；只有初始管理员能在该接口中授予或撤销数据库管理员角色，受委派管理员不能继续扩权。

`/api/plan`默认返回 `profile`、`maa`、`rotation`、`durationMs`、`diagnosticId`，当前 Worker 提供结构化练卡报告时还可返回经过独立 parser 白名单化的 `trainingAdvice`。CLI 路径、命令、stdout、stderr、运行目录和内部协议对象只能进入服务端运行记录；只有服务端环境变量开启且本次请求显式带 `?beta=1` 时，调试模式才允许它们位于 `data.debug`。

`/api/feedback`请求只包含诊断编号、房间摘要、1–1000 字说明和明确 consent。它不再重复上传完整干员数据或调试包，响应只返回反馈编号和保存时间。

完整错误码、状态映射和响应示例见[上线产品化报告](./FRONTEND_PRODUCTION_READINESS_REPORT.md)。

## 请求保护

| 路由 | 限制 |
| --- | --- |
| 排班 | 每 IP 10 分钟 20 次；每 IP 同时 1 个；全局同时 8 个；请求体 2MB |
| 反馈 | 每 IP 每小时 5 次；请求体 128KB；说明 1–1000 字 |
| 森空岛二维码创建 | 每 IP 10 分钟 10 次 |
| 森空岛二维码轮询 | 每 IP 10 分钟 120 次 |
| 森空岛同步/角色/退出 | 每 IP 每小时 30 次 |

排班输入还限制干员数据不超过 1000 条、布局不超过 64 个房间、来源名称不超过 80 字。限流响应带 `Retry-After`。

所有 POST、PUT、PATCH 和 DELETE 写路由执行同源检查。生产部署在 Nginx 后时启用受信代理头，并保证 Next 内部端口不直接暴露公网。

## 环境变量

| 变量 | 用途 |
| --- | --- |
| `INFRA_CLI_PATH` | 指定 `infra-cli` |
| `INFRA_CORE_ROOT` | 指定核心仓库 |
| `ARKNIGHTS_INFRA_DATA_DIR` | 指定 CLI 数据目录 |
| `BETA_STORAGE_DIR` | 服务端持久化根目录 |
| `BETA_CLI_RUN_DIR` | CLI 运行记录目录；必须是整体存储根目录的严格子目录 |
| `BETA_FEEDBACK_DIR` | 反馈目录；必须是整体存储根目录的严格子目录 |
| `BETA_CLI_TIMEOUT_MS` | CLI 超时，默认 120000ms |
| `BETA_PUBLIC_ORIGIN` | 公开 HTTP(S) Origin，用于同源检查 |
| `BETA_DEBUG_TOOLS_ENABLED` | `1`时允许服务端返回调试字段 |
| `BETA_RATE_LIMIT_ENABLED` | `1`启用进程内限流；生产默认启用 |
| `BETA_TRUST_PROXY_HEADERS` | `1`时信任 Nginx 写入的客户端 IP/Origin 相关头 |
| `SKLAND_SESSION_SECRET` | 森空岛 HttpOnly 会话加密密钥，至少 32 字节 |
| `SKLAND_PUBLIC_ORIGIN` | 森空岛会话写请求的公开 HTTP(S) Origin |
| `SKLAND_ALLOW_INSECURE_HTTP` | 仅限可信临时环境；允许非 localhost 使用不安全 HTTP |
| `APP_DEPLOYMENT_ENV` | `production`或`development`；production 的森空岛默认失败关闭，仅由`SKLAND_FEATURE_ENABLED=1`开启 |
| `SKLAND_FEATURE_ENABLED` | production 仅精确值`1`开启；development/local 可设为`0`主动关闭 |
| `DATABASE_URL` | Next runtime PostgreSQL 连接串，仅授予 `public` 认证表与 `app` 业务表 DML |
| `DATABASE_MIGRATION_URL` | release 执行仓库内 migration 的 DDL 连接串 |
| `BETTER_AUTH_SECRET` | 网站 Session 签名密钥，至少 32 字节且长期稳定 |
| `BETTER_AUTH_URL` | 浏览器实际访问的完整 HTTPS Origin |
| `BETTER_AUTH_ADMIN_USER_IDS` | 逗号分隔的初始管理员 Better Auth user ID；作为网页角色委派的信任根 |
| `RESEND_API_KEY` | 验证与密码重置邮件的 Resend API key |
| `AUTH_EMAIL_FROM` | 已验证独立发信子域的 From 地址 |
| `BETA_BUSINESS_DB_ENABLED` | 启用业务摘要双写和过期清理 |
| `BETA_BUSINESS_DB_READ_ENABLED` | 将运维摘要读取切到 PostgreSQL |
| `BETA_BUSINESS_FILE_READ_FALLBACK` | 短期保留文件读取/更新回退 |
| `ACCOUNT_CLOUD_SYNC_ENABLED` | 开放政策同意与账号云端工作区 |
| `WORKSPACE_ACTIVE_KEY_VERSION`、`WORKSPACE_MASTER_KEYS` | MAA Box 信封加密版本和只存在服务端的 32 字节主密钥集合 |
| `PLAN_CACHE_ENABLED`、`PLAN_CACHE_HMAC_KEY` | 开放共享缓存及其独立 HMAC 密钥 |

建议的生产配置：

```text
BETA_DEBUG_TOOLS_ENABLED=0
BETA_RATE_LIMIT_ENABLED=1
BETA_TRUST_PROXY_HEADERS=1
BETA_PUBLIC_ORIGIN=https://riic.autos
APP_DEPLOYMENT_ENV=production
SKLAND_FEATURE_ENABLED=1
SKLAND_PUBLIC_ORIGIN=https://riic.autos
```

production 显式启用森空岛时还必须保留既有长期稳定的`SKLAND_SESSION_SECRET`；若要关闭，改为`SKLAND_FEATURE_ENABLED=0`并重新构建发布。dev 站点使用`APP_DEPLOYMENT_ENV=development`与`SKLAND_FEATURE_ENABLED=1`，并额外配置自己的`SKLAND_SESSION_SECRET`、`SKLAND_PUBLIC_ORIGIN`。两个站点必须使用不同的应用根目录、systemd 服务、内部端口、公开 Origin 和持久化目录。

认证与数据库的首次上线、最小权限和恢复演练见[网站账号与 PostgreSQL 上线手册](./AUTHENTICATION_DATABASE.md)。CI 使用临时 PostgreSQL 先执行已提交 migration，再运行注册、验证、登录、密码重置、Session 撤销与封禁集成测试；邮件由测试回调捕获，不发送真实邮件。

## 服务端诊断

Windows PowerShell：

```powershell
$env:BETA_DEBUG_TOOLS_ENABLED='1'
$env:BETA_RATE_LIMIT_ENABLED='0'
npm run dev
```

产品页面不提供调试入口，`/?beta` 不会改变界面，也不会向排班请求传播 beta 参数。dev 开关启用后，只有直接调用 `/api/plan?beta=1` 才能获得 `data.debug`；普通页面始终请求无 `debug` 的公共白名单响应（五个固定字段及可选 `trainingAdvice`）。production 无论环境变量如何都禁止调试字段，调试字段也不得写入 v5 本地数据。

详细的 DevTools 排查顺序、接口泄露检查和错误模拟方法见[上线产品化报告的开发调试环境使用指南](./FRONTEND_PRODUCTION_READINESS_REPORT.md#开发调试环境使用指南)。

## v5 本地保存

客户端首次渲染使用确定性默认值；组件挂载后再恢复 `localStorage`，恢复期间展示稳定骨架。持久化 effect 必须等待 `hasRestoredSession`，避免用默认空状态覆盖旧数据。

v5 只保存：

- 当前布局和预设；
- 干员数据及安全来源名；
- Box 与布局的来源标记，用于只删除森空岛派生数据；
- 当前换班 profile；
- 当前班次；
- 白名单化后的最近排班；
- `savedAt`与`expiresAt`。

有效期为 30 天。损坏、过期或类型校验失败的数据会自动删除；恢复时还会按求解器使用的干员名称归一化旧 Box，同名记录保留练度更高的一条。v2/v3/v4 仅进行一次白名单迁移，迁移后删除旧 key。严禁保存 debug bundle、路径、CLI 输出、原始异常、反馈草稿、反馈响应、森空岛凭据或完整状态快照。

“清除本地数据”会删除 v2/v3/v4/v5、onboarding 和提示偏好并重置页面；森空岛 HttpOnly cookie 不受影响。状态中心的“删除全部森空岛数据”是另一条流程，只清除森空岛派生的本地字段、全部森空岛 Cookie 及可关联的服务端记录。账号云同步只在当前政策同意后开启；首次上传成功后仍保留经过同一白名单清理的 v5 本地副本，用于快速首屏。撤销授权会删除云端工作区、Box 密文、排班历史及缓存引用，并回到纯本地模式。

## 测试与合并门禁

GitHub Actions 在面向`main`或`develop`的 PR 和 push 上使用 Node 22。`Change scope`先从 PR base/head 或 push before/head 生成 NUL 分隔路径列表，再调用`scripts/ci-change-scope.mjs`选择门禁：

| 范围 | Core | Chromium | Deploy |
| --- | --- | --- | --- |
| 纯文档和仓库文本元数据 | 跳过 | 跳过 | 跳过 |
| 单元测试或非发布型 CI 配置 | 执行 | 跳过 | 跳过 |
| 浏览器测试或 Playwright 配置 | 执行 | 执行 | 跳过 |
| 两个发布工作流 | 执行 | 跳过 | push 时执行 |
| 运行时、依赖、部署脚本、未知路径 | 执行 | 执行 | push 时执行 |

无法读取可靠 commit、空差异和手动触发都按完整范围处理。Core 包含数据库权限与 migration、security audit、lint、单元与契约测试、求解器/部署脚本测试、production build 和客户端隔离检查；Chromium 包含完整 E2E 与 production profile 隔离测试。保持原状态名称的`quality`汇总门禁始终运行，逐项验证必需 Job 成功或按分类预期跳过。不得对整个 workflow 使用`paths-ignore`，否则受保护分支可能等不到必需检查。PR 的新提交会取消同一 PR 的旧运行，push 与已经开始的部署不会被取消。

完整 WebKit E2E 作为 Safari 兼容性回归每日定时运行，也可通过`workflow_dispatch`手动触发。它不阻塞逐次 PR 与发布；涉及响应式、触控或 Safari 行为的改动仍应在提交前运行`npm run test:e2e:webkit`。

`main`和`develop`使用相同分类规则。只有受保护分支 push、`quality`成功且`deploy_required=true`时，部署工作流才使用 GitHub Environments `production`和`development`中的 SSH Secrets 与部署 Variables 发布对应站点；PR、文档、测试和非发布型 CI 变更不创建服务器 release。工作流先验证两个服务器 helper 是`root:root 0755`普通文件且显式契约版本兼容，再从`/var/cache/arknights-infra-deploy/repository.git`增量准备准确 SHA 的发布包；production/development 使用独立 refs 和共享`flock`。helper 在 GitHub 网络、缓存或锁的临时故障时返回`75`；Runner 随后优先读取对应服务器缓存 ref，并发送从该 ref 到已验证 SHA 的增量 Git bundle，缓存 ref 不可用时才使用上一次 push SHA。服务器校验并导入缓存，只有 bundle 基线或传输不可用时才上传完整发布包。SHA、tree、路径、helper 契约和 bundle HEAD 等完整性错误都直接失败。`DEPLOY_DEBUG_TOOLS_ENABLED`和`DEPLOY_RATE_LIMIT_ENABLED`集中管理 dev 的服务端诊断字段与限流，production 则固定为调试关闭、限流开启。production-profile 门禁显式开启森空岛并故意反向设置调试和限流变量，确认生产森空岛访问面存在，同时安全策略不可被误配置绕过。
Production client boundary checks scan static JavaScript and public HTML/RSC and require the artifacts to match the resolved Skland switch. The production profile separately verifies explicitly enabled UI, health fields and API access while keeping debug disabled and rate limiting enabled. Whenever runtime scope selects the full gate, both checks remain required.

production 和 dev 的 Funnel Nginx 分别只监听`127.0.0.1:4176`与`127.0.0.1:4274`。公网访问由 Tailscale Funnel 的 8443 与 443 HTTPS 入口提供；用`tailscale funnel status`核对持久化配置、公开地址和实际目标。production 另有受 Host 限制的`0.0.0.0:4174`直连/IP 兼容 vhost，它不是 Funnel 目标，不得作为公开 Origin 或发布健康检查地址。服务器 80 端口只重定向到 production HTTPS，不要把两个回环应用端口重新暴露到公网。Actions 部署用户使用独立密钥，sudo 只允许固定的`/usr/local/sbin/arknights-infra-deploy`。root 所有的 deploy runner 和`/usr/local/sbin/arknights-infra-prepare-release`必须保持 LF、普通文件和`root:root 0755`；二者用`--contract-version`报告当前接口版本，文件 SHA-256只作安装/回滚审计。prepare helper 以`arkdeploy`运行，不新增 sudo 权限；缓存根必须由该用户拥有且不能被 group/other 写入。

E2E 使用固定数据和接口拦截，不要求 CI 中存在真实 CLI。每次 UI 修改至少检查 390px、768px、1440px、四个常驻一级导航、development 的森空岛状态中心和两处锁定区域。错误码新增或修改必须同步更新：

- `src/types.ts`
- `src/server/api-contract.ts`
- `src/server/api-contract.test.ts`
- `docs/FRONTEND_PRODUCTION_READINESS_REPORT.md`

## 发布前检查

```powershell
npm ci
npm run check
npm run build
npm run test:e2e
npm run test:e2e:webkit
```

随后在真实浏览器检查 `/api/health`、Full E2、2/3/4 班切换、MAA 导出、反馈提交和 v5/旧版本迁移恢复。生产部署、回滚和存储目录的强制规则以仓库 `AGENTS.md` 为准，长期维护原因与 helper 升级顺序见[开发与发布维护准则](./DEVELOPMENT_RELEASE_GUARDRAILS.md)。
