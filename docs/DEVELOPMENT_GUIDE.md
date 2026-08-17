# 明日方舟基建排班助手开发指南

## 产品与工程边界

“明日方舟基建排班助手”是面向用户的多班次排班工具。用户导入干员数据、配置基建设施与求解器支持的换班方式，服务端调用长驻的 `infra-cli serve`，前端展示排班、效率与练卡建议，并可导出到 MAA。

本仓库负责 Next.js 前端、公开 API、CLI 调用适配、运行记录和反馈入口，不在前端实现排班算法、干员技能或效率公式。算法与 CLI 协议变更应进入相邻核心仓库。

以下产品约束必须作为 UI 回归项保留：

- “全角色导入”保持在计算器顶部操作栏，并维持主按钮层级。
- dev 保持“基建计算器 / 练卡建议 / 森空岛状态”三个同级导航；production 只显示前两个导航，且不得请求森空岛 API。
- 桌面与平板默认使用“一图流布局”；手机端默认“列表式布局”，并继续显示禁用态的“一图流布局”。
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

`npm run check`依次运行 lint、单元/持久化测试和公开 API 契约测试。`npm run test:e2e`运行默认 Chromium 门禁；涉及响应式、触控或 Safari 兼容性的 UI 改动还应运行独立 WebKit 门禁。完整合并门禁还包括生产构建和 Playwright E2E。

Windows 前端命令使用 PowerShell。部署 shell 测试只以 Linux CI 或显式 WSL Ubuntu 结果为准；裸`bash`可能被 Windows 解析到 Docker WSL、Git Bash 或系统 shim。行尾、平台二进制和 helper 生命周期见[开发与发布维护准则](./DEVELOPMENT_RELEASE_GUARDRAILS.md)。

## 核心目录

| 路径 | 责任 |
| --- | --- |
| `src/App.tsx` | 工作台状态、恢复门控、页面编排 |
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
| `src/app/api/*/route.ts` | 公开 HTTP 路由 |
| `e2e/production-readiness.spec.ts` | hydration、产品主流程和锁定区域回归 |
| `scripts/extract-room-emblems.mjs` | 从现有 WebP 确定性提取透明高清设施徽记 |
| `.github/workflows/frontend-quality.yml` | PR 与 main push 质量门禁 |

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
- `GET/DELETE /api/skland/session`
- `POST /api/skland/auth/qr`
- `POST /api/skland/auth/qr/status`
- `POST /api/skland/sync`
- `POST /api/skland/role`

`/api/plan`只返回 `profile`、`maa`、`rotation`、`durationMs`、`diagnosticId`。CLI 路径、命令、stdout、stderr、运行目录和内部协议对象只能进入服务端运行记录；调试模式允许它们位于 `data.debug`，但必须由服务端环境变量开启。

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

POST 和 DELETE 路由执行同源检查。生产部署在 Nginx 后时启用受信代理头，并保证 Next 内部端口不直接暴露公网。

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
| `APP_DEPLOYMENT_ENV` | `production`或`development`；production 强制移除森空岛访问面 |
| `SKLAND_FEATURE_ENABLED` | dev/local 可设为`0`主动关闭；不能在 production 开启 |

建议的生产配置：

```text
BETA_DEBUG_TOOLS_ENABLED=0
BETA_RATE_LIMIT_ENABLED=1
BETA_TRUST_PROXY_HEADERS=1
BETA_PUBLIC_ORIGIN=https://你的公开域名
APP_DEPLOYMENT_ENV=production
SKLAND_FEATURE_ENABLED=0
```

dev 站点使用`APP_DEPLOYMENT_ENV=development`与`SKLAND_FEATURE_ENABLED=1`，并额外配置`SKLAND_SESSION_SECRET`、`SKLAND_PUBLIC_ORIGIN`。两个站点必须使用不同的应用根目录、systemd 服务、内部端口、公开 Origin 和持久化目录。

## 调试模式

Windows PowerShell：

```powershell
$env:BETA_DEBUG_TOOLS_ENABLED='1'
$env:BETA_RATE_LIMIT_ENABLED='0'
npm run dev
```

访问：

```text
http://127.0.0.1:5174/?beta
```

调试 UI 只有在服务端 feature flag 为 true 且 URL 同时带 `?beta` 时出现。dev 开关启用后，页脚提供“开启/退出调试工具”入口；production 无论环境变量如何都强制隐藏入口并禁止调试字段。单独添加 `?beta`不能开启调试工具。调试字段也不得写入 v5 本地数据。

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

“清除本地数据”会删除 v2/v3/v4/v5、onboarding 和提示偏好并重置页面；森空岛 HttpOnly cookie 不受影响。状态中心的“删除全部森空岛数据”是另一条流程，只清除森空岛派生的本地字段、全部森空岛 Cookie 及可关联的服务端记录。

## 测试与合并门禁

GitHub Actions 在面向`main`或`develop`的 PR 和 push 上使用 Node 22，顺序执行：

1. `npm ci`
2. `npm run lint`
3. `npm test`
4. `npm run test:api-contract`
5. `npm run test:deploy`
6. `npm run build`
7. `npm run test:production-client`
8. `npx playwright install --with-deps chromium`
9. `npm run test:e2e`
10. `npm run test:e2e:production-profile`

`main`和`develop`都执行相同质量门禁。通过 push 门禁后，部署工作流分别使用 GitHub Environments `production`和`development`中的 SSH Secrets 与部署 Variables 发布对应站点；PR 不部署。工作流先验证两个服务器 helper 是`root:root 0755`普通文件且显式契约版本兼容，再从`/var/cache/arknights-infra-deploy/repository.git`增量准备准确 SHA 的发布包；production/development 使用独立 refs 和共享`flock`。helper 在 GitHub 网络、缓存或锁的临时故障时返回`75`；Runner 随后优先读取对应服务器缓存 ref，并发送从该 ref 到已验证 SHA 的增量 Git bundle，缓存 ref 不可用时才使用上一次 push SHA。服务器校验并导入缓存，只有 bundle 基线或传输不可用时才上传完整发布包。SHA、tree、路径、helper 契约和 bundle HEAD 等完整性错误都直接失败。`DEPLOY_DEBUG_TOOLS_ENABLED`和`DEPLOY_RATE_LIMIT_ENABLED`集中管理 dev 的调试入口与限流，production 则固定为调试关闭、限流开启。production-profile 门禁会故意反向设置森空岛、调试和限流变量，确认 production 的强制策略不可被误配置绕过。
Production client isolation scans static JavaScript and public HTML/RSC; production-profile separately verifies hidden UI, absent requests and health fields, and the API 404 boundary. Both gates are required.

production 和 dev 的 Funnel Nginx 分别只监听`127.0.0.1:4176`与`127.0.0.1:4274`。公网访问由 Tailscale Funnel 的 8443 与 443 HTTPS 入口提供；用`tailscale funnel status`核对持久化配置、公开地址和实际目标。production 另有受 Host 限制的`0.0.0.0:4174`直连/IP 兼容 vhost，它不是 Funnel 目标，不得作为公开 Origin 或发布健康检查地址。服务器 80 端口只重定向到 production HTTPS，不要把两个回环应用端口重新暴露到公网。Actions 部署用户使用独立密钥，sudo 只允许固定的`/usr/local/sbin/arknights-infra-deploy`。root 所有的 deploy runner 和`/usr/local/sbin/arknights-infra-prepare-release`必须保持 LF、普通文件和`root:root 0755`；二者用`--contract-version`报告当前接口版本，文件 SHA-256只作安装/回滚审计。prepare helper 以`arkdeploy`运行，不新增 sudo 权限；缓存根必须由该用户拥有且不能被 group/other 写入。

E2E 使用固定数据和接口拦截，不要求 CI 中存在真实 CLI。每次 UI 修改至少检查 390px、768px、1440px、三个一级导航和两处锁定区域。错误码新增或修改必须同步更新：

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
