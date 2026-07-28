# 明日方舟基建排班助手开发指南

## 产品与工程边界

“明日方舟基建排班助手”是面向用户的三班排班工具。用户导入干员数据、配置基建设施，服务端调用长驻的 `infra-cli serve`，前端展示排班、效率与练卡建议，并可导出到 MAA。

本仓库负责 Next.js 前端、公开 API、CLI 调用适配、运行记录和反馈入口，不在前端实现排班算法、干员技能或效率公式。算法与 CLI 协议变更应进入相邻核心仓库。

以下产品约束必须作为 UI 回归项保留：

- `Full E2 测试`保持在计划安排卡片右上角，维持主按钮层级。
- “基建计算器 / 练卡建议 / 森空岛状态”保持三个同级导航。
- 手机端继续显示禁用态的“一图流布局”，不隐藏。
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
npm run test:e2e
```

`npm run check`依次运行 lint、单元/持久化测试和公开 API 契约测试。完整合并门禁还包括生产构建和 Playwright E2E。

## 核心目录

| 路径 | 责任 |
| --- | --- |
| `src/App.tsx` | 工作台状态、恢复门控、页面编排 |
| `src/api.ts` | 统一解析公开 API envelope，抛出带错误码的 `ApiClientError` |
| `src/types.ts` | 内部类型、公开 DTO、错误码 |
| `src/persistence.ts` | v4 本地保存、迁移、过期清理和白名单 |
| `src/server/api-contract.ts` | requestId、错误响应、同源、大小、限流和并发保护 |
| `src/server/public-plan.ts` | 内部求解结果到公开排班 DTO 的白名单映射 |
| `src/server/infra.ts` | CLI 查找、长驻进程、内部运行记录和反馈落盘 |
| `src/app/api/*/route.ts` | 公开 HTTP 路由 |
| `e2e/production-readiness.spec.ts` | hydration、产品主流程和锁定区域回归 |
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
| `BETA_CLI_RUN_DIR` | CLI 运行记录目录 |
| `BETA_FEEDBACK_DIR` | 反馈目录 |
| `BETA_CLI_TIMEOUT_MS` | CLI 超时，默认 120000ms |
| `BETA_PUBLIC_ORIGIN` | 公开 HTTP(S) Origin，用于同源检查 |
| `BETA_DEBUG_TOOLS_ENABLED` | `1`时允许服务端返回调试字段 |
| `BETA_RATE_LIMIT_ENABLED` | `1`启用进程内限流；生产默认启用 |
| `BETA_TRUST_PROXY_HEADERS` | `1`时信任 Nginx 写入的客户端 IP/Origin 相关头 |
| `SKLAND_SESSION_SECRET` | 森空岛 HttpOnly 会话加密密钥，至少 32 字节 |
| `SKLAND_PUBLIC_ORIGIN` | 森空岛会话写请求的公开 HTTP(S) Origin |
| `SKLAND_ALLOW_INSECURE_HTTP` | 仅限可信临时环境；允许非 localhost 使用不安全 HTTP |

建议的生产配置：

```text
BETA_DEBUG_TOOLS_ENABLED=0
BETA_RATE_LIMIT_ENABLED=1
BETA_TRUST_PROXY_HEADERS=1
BETA_PUBLIC_ORIGIN=https://你的公开域名
SKLAND_PUBLIC_ORIGIN=https://你的公开域名
```

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

调试 UI 只有在服务端 feature flag 为 true 且 URL 同时带 `?beta` 时出现。单独添加 `?beta`不能开启调试工具。调试字段也不得写入 v4 本地数据。

详细的 DevTools 排查顺序、接口泄露检查和错误模拟方法见[上线产品化报告的开发调试环境使用指南](./FRONTEND_PRODUCTION_READINESS_REPORT.md#开发调试环境使用指南)。

## v4 本地保存

客户端首次渲染使用确定性默认值；组件挂载后再恢复 `localStorage`，恢复期间展示稳定骨架。持久化 effect 必须等待 `hasRestoredSession`，避免用默认空状态覆盖旧数据。

v4 只保存：

- 当前布局和预设；
- 干员数据及安全来源名；
- 当前班次；
- 白名单化后的最近排班；
- `savedAt`与`expiresAt`。

有效期为 30 天。损坏、过期或类型校验失败的数据会自动删除。v2/v3 仅进行一次白名单迁移，迁移后删除旧 key。严禁保存 debug bundle、路径、CLI 输出、原始异常、反馈草稿或反馈响应。

“清除本地数据”会删除 v2/v3/v4、onboarding 和提示偏好并重置页面；森空岛 HttpOnly cookie 不受影响。

## 测试与合并门禁

GitHub Actions 在面向 `main` 的 PR 和 `main` push 上使用 Node 22，顺序执行：

1. `npm ci`
2. `npm run lint`
3. `npm test`
4. `npm run test:api-contract`
5. `npm run build`
6. `npx playwright install --with-deps chromium`
7. `npm run test:e2e`

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
```

随后在真实浏览器检查 `/api/health`、Full E2、三班切换、MAA 导出、反馈提交和 v4 恢复。生产部署、回滚和存储目录规则继续以仓库 `AGENTS.md` 为准。
