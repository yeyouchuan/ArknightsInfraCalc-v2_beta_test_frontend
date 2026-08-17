# AGENTS.md

> 本文件是仓库级持久指令。新任务先读本文，再以当前代码、`README.md`、`package.json` 和更靠近工作目录的 `AGENTS.md` / `AGENTS.override.md` 为准。

## 项目定位

本仓库是“明日方舟基建排班助手”的 Next.js 前端与轻量服务端，不是核心求解器仓库。产品主流程包括：

- 线上环境导入 MAA JSON / 兼容的一图流 xlsx；dev 环境还可通过森空岛二维码登录同步干员与基建状态。
- 配置 243、153、333、252、342 布局、设施等级、制造配方和贸易订单。
- 调用长驻的 `infra-cli serve` 生成三班排班、效率概览和练卡建议。
- 展示森空岛当前基建状态，比较当前进驻与排班计划，并导出 MAA JSON。
- 保存 CLI 运行记录和经用户同意的最小反馈；只有显式调试模式才展示额外问题上下文与 CLI 输出。

明确边界：

- 排班搜索、干员技能、策略和核心效率公式属于相邻核心仓库 `../ArknightsInfraCalc-v2`；不要在前端复制一套求解逻辑。
- 本仓库可以维护输入校验、展示换算、房间功耗校验、协议适配和公开 DTO 映射。
- `src/server/` 负责 API 边界、森空岛适配、调用 CLI 和持久化记录，不应演变为第二个求解器。
- 首屏是可直接使用的排班助手，不是营销页或内部运维面板。

## 技术栈与运行方式

- Next.js 16 App Router、React 19、TypeScript strict mode。
- Tailwind CSS v4、shadcn/ui、Base UI primitives。
- Node runtime 的 Next route handlers；禁止改成静态导出。
- `infra-cli serve` 是外部长驻子进程；森空岛访问通过 `skland-kit`。
- CI 使用 Node.js 22 和 npm；不要切换包管理器。
- 页面和 `/api/*` 由同一个 Next 服务提供，没有独立 Express 服务或 Vite 代理。

## 开始任务与改动纪律

1. 先运行 `git status --short --branch`，确认分支、远端差异和用户已有改动。
2. 不丢弃、覆盖、回滚或顺手提交与当前任务无关的改动。
3. 修改前从代码确认事实，不把旧报告、历史提交或 README 示例当成高于当前实现的真相。
4. 保持改动小而聚焦，优先延续现有模块边界；跨层重构应说明必要性。
5. 默认使用 npm。新增或升级依赖时同步提交 `package.json` 与 `package-lock.json`，并说明必要性和风险。
6. 不提交密码、token、Cookie、私钥、森空岛临时凭据、真实用户 Box、服务器登录信息或包含这些内容的日志。
7. 不提交运行产物和本地状态，包括 `.next/`、`test-results/`、`playwright-report/`、`.tmp/`、`bin/data/`、`server/storage/`、`*.local` 和临时部署包。
8. `AGENTS.md` 是已跟踪的团队指令；当仓库约定确实变化时可以更新并提交。

## 每次任务的跨平台检查

- 文本统一使用 UTF-8 与 LF；Windows 本仓库保持`core.autocrlf=false`、`core.eol=lf`。提交前运行`git diff --check`，涉及文本批量修改或 schema/脚本时再检查`git ls-files --eol`。
- 不对 ELF、PE、图片、字体等二进制做行尾或编码转换。不要假定 Windows 能运行 Linux ELF，也不要依赖 Windows 文件系统替代 Linux 的 executable bit、大小写和符号链接语义。
- PowerShell 适合日常前端命令；`scripts/*.sh`发布测试必须在 Linux CI 或显式指定的 WSL Ubuntu 中运行。Windows 裸`bash`可能命中 Docker WSL、Git Bash 或系统 shim，不能作为可重复环境。
- 求解器或协议改动必须把核心 commit、Linux CLI、完整运行数据、同提交 Full E2 fixture、制品 hash 和真实三班冒烟当成一个原子集合核对。
- 跨平台、求解器身份、helper 契约和双分支发布的长期原因与操作见[`docs/DEVELOPMENT_RELEASE_GUARDRAILS.md`](docs/DEVELOPMENT_RELEASE_GUARDRAILS.md)。本节保留每次任务必须执行的动作，不在两处复制全部背景。

## 关键结构

| 路径 | 职责 |
| --- | --- |
| `src/app/layout.tsx`、`src/app/page.tsx` | App Router 根布局与应用入口 |
| `src/App.tsx` | 顶层状态、页面编排、持久化与求解主流程 |
| `src/components/pages/*` | 基建计算器、练卡建议、森空岛状态三个一级页面 |
| `src/components/layout/AppSidebar.tsx`、`src/components/layout/AppTopBar.tsx` | 三个一级导航、移动端侧栏行为与全局账号入口 |
| `src/setup-dialog.tsx` | Box 导入、森空岛入口和布局配置流程 |
| `src/components.tsx` | 业务 UI 组件 |
| `src/components/ui/*` | shadcn/Base UI primitives |
| `src/layouts/*.json`、`src/blueprint.ts` | 布局预设、产品和前端功耗校验 |
| `src/operbox.ts` | MAA JSON / xlsx 解析与 Box 校验 |
| `src/skland*.ts(x)` | 森空岛前端映射、登录 UI 与授权 URL |
| `src/schedule*.ts`、`src/efficiency.ts` | 排班展示、班次整理与服务端效率字段归一化 |
| `src/persistence.ts` | 浏览器 v5 会话、来源标记、旧版本迁移、30 天过期与安全清理 |
| `src/api.ts`、`src/types.ts` | 前端请求封装与共享类型 |
| `src/app/api/*/route.ts` | 公共 API route handlers |
| `src/server/api-contract.ts` | 统一响应、错误码、同源校验、大小限制与限流 |
| `src/server/public-plan.ts` | 内部求解结果到公共排班 DTO 的白名单映射 |
| `src/server/infra.ts` | CLI 查找、长驻 serve 客户端、运行记录、反馈和 CLI release 存储 |
| `src/server/skland/*` | 森空岛会话加密、Cookie、扫码、同步、角色切换与数据归一化 |
| `src/internal-field-safety.ts` | 递归剔除内部字段 |
| `scripts/extract-room-emblems.mjs` | 从现有 WebP 确定性提取透明高清设施徽记 |
| `fixtures/operbox_full_e2.json` | 首页 Full E2 的 243 全精二样例 |
| `bin/infra-cli*`、`bin/data/` | 当前平台 CLI 与可选运行数据 |
| `e2e/production-readiness.spec.ts` | 产品边界、响应式、持久化、调试开关与森空岛 UI 回归 |
| `.github/workflows/frontend-quality.yml` | main / PR 的完整质量门禁 |
| `docs/FRONTEND_PRODUCTION_READINESS_REPORT.md` | 公开边界、错误码和产品化基线 |
| `docs/UPDATE_SOLVER.md` | 只更新线上求解器时的操作与回滚说明 |

UI 控件优先组合 `src/components/ui/*` 中的现有 primitive。不要另造按钮、Tabs、Dialog、Sheet、Select 或 Textarea；若现有 primitive 不足，先扩展 primitive，再由业务组件组合。

## 公共 API

当前 route handlers：

- `GET /api/health`
- `GET /api/sample-operbox`
- `POST /api/plan`
- `POST /api/feedback`
- `GET`、`DELETE /api/skland/session`
- `POST /api/skland/auth/qr`
- `POST /api/skland/auth/qr/status`
- `POST /api/skland/sync`
- `POST /api/skland/role`
- `GET /api/skland/status`
- `DELETE /api/skland/data`

所有公共响应使用 `ApiSuccess<T> | ApiFailure` 信封并返回 `X-Request-Id`。健康检查的公开就绪字段是 `data.plannerReady`，不是内部 `HealthApiResponse` 的 `ok` / `cliReady`。

### 必须保持的安全与契约边界

- 不得直接从 route handler 返回 `src/server/infra.ts` 的内部对象。排班结果必须经过 `toPublicPlanData`，错误必须经过统一的 `failureResponse`。
- 生产 `plan` 数据只允许公开 `profile`、`maa`、`rotation`、`durationMs`、`diagnosticId`；健康检查不得公开 CLI 路径、PID、候选文件、仓库路径、存储路径或原始 serve 错误。
- `command`、stdout、stderr 和 debug bundle 只有在服务端 `BETA_DEBUG_TOOLS_ENABLED=1` 时才能进入 `data.debug`；页面还必须同时带 `?beta` 才显示调试面板。任一条件缺失都不能暴露调试数据。
- 新增或修改公共 DTO 时，同时更新 `src/types.ts`、白名单 mapper、客户端调用和 `src/server/public-plan.test.ts` / `src/server/api-contract.test.ts`。
- 新增或修改错误码时，同时更新 `AppErrorCode`、`ERROR_DEFINITIONS`、HTTP 映射和契约测试。日志只记录 requestId、code、route、status、durationMs 等最小诊断信息，不打印请求正文或凭据。
- 所有公开写请求必须保留同源校验、请求体大小限制和适当限流。只有在明确的本地测试中关闭限流；不要用重复请求压测线上实例。
- 反馈必须要求用户同意，并保持最小化：公开响应只有 `feedbackId` 和 `savedAt`，不要把文件路径、Box、debug bundle 或内部诊断内容回传给浏览器。
- 森空岛只提供二维码授权流程，不添加账号密码、短信验证码代填或绕过官方授权的登录方式。
- `APP_DEPLOYMENT_ENV=production`必须从页面、客户端请求、健康检查字段和公开 API 访问面强制移除森空岛能力；该限制不能被`SKLAND_FEATURE_ENABLED=1`覆盖。dev 使用`APP_DEPLOYMENT_ENV=development`保留森空岛能力。
- Production browser artifacts must not contain Skland UI copy, `/api/skland` URLs, or the `skland://` app scheme; run `npm run test:production-client` after changing client boundaries.
- production 必须强制关闭调试工具并启用限流，不能被`BETA_DEBUG_TOOLS_ENABLED=1`或`BETA_RATE_LIMIT_ENABLED=0`覆盖；dev 可由部署环境集中管理这两个开关，调试入口仍需`?beta`二次门控。
- `SKLAND_SESSION_SECRET` 必须至少 32 字节且长期稳定。森空岛会话使用 AES-256-GCM 封装在 HttpOnly Cookie 中；凭据不得进入 localStorage、CLI 运行记录、反馈包、console 或公开响应。
- 非 localhost 的森空岛请求默认要求 HTTPS。`SKLAND_ALLOW_INSECURE_HTTP=1` 仅允许临时、可信的本地或内网测试，绝不能作为生产默认值。
- 森空岛凭证从扫码成功起固定 7 天到期，刷新 token、读取会话和切换角色都不得续期；用户同意当前条款与隐私政策并登录后，状态中心默认返回完整状态白名单，排班链路仍只使用最小排班字段。
- 浏览器 v5 持久化可以保存布局、Box、来源标记和经过清理的最近排班，但必须继续剔除 debug、路径、stdout、stderr、请求/响应内部字段和森空岛凭据。

## 环境变量

### CLI 与存储

| 变量 | 用途 |
| --- | --- |
| `INFRA_CLI_PATH` | 本地或未托管环境显式指定当前平台可执行的 `infra-cli`；设置预期制品指纹后不覆盖部署制品 |
| `INFRA_CLI_EXPECTED_SHA256` | 部署生成的 `bin/infra-cli` 制品指纹；启用后固定使用仓库制品，版本或 Worker 自报指纹不一致时健康检查失败，本地可省略 |
| `INFRA_CORE_ROOT` | 指定相邻核心仓库，默认 `../ArknightsInfraCalc-v2` |
| `ARKNIGHTS_INFRA_DATA_DIR` | 指定 CLI 运行数据目录 |
| `BETA_CLI_TIMEOUT_MS` | CLI 请求超时，默认 `120000` |
| `BETA_STORAGE_DIR` | 整体服务端持久化根目录 |
| `BETA_CLI_RUN_DIR` | CLI 运行记录目录；必须是 `BETA_STORAGE_DIR` 的严格子目录 |
| `BETA_FEEDBACK_DIR` | 反馈目录；必须是 `BETA_STORAGE_DIR` 的严格子目录 |
| `BETA_CLI_RELEASE_DIR` | CLI release 存储目录 |

默认持久化位置是：

```text
server/storage/cli-runs
server/storage/feedback
server/storage/cli-releases
server/storage/active-cli.json
```

CLI 查找以当前平台文件名为优先，覆盖仓库 `bin/`、仓库根目录和核心仓库 `target/{release,debug}`；不要假定 Windows 能运行 Linux ELF，或 Linux 能运行 PE 文件。`bin/data/` 是可选且被忽略的运行数据目录。

Worker 能力只由`protocol_version`和`plan_schema_version`判断；`plan_contract_sha256`只进入私有诊断，不得硬编码为前端路由条件。部署启用`INFRA_CLI_EXPECTED_SHA256`时还必须核对仓库 Linux 制品 hash 与 Worker 自报的`solver_executable_sha256`，不一致应使健康检查失败并回滚。

### 安全、功能与测试

| 变量 | 用途 |
| --- | --- |
| `SKLAND_SESSION_SECRET` | 森空岛会话密钥，至少 32 字节 |
| `BETA_PUBLIC_ORIGIN` | 所有公开写接口的可信 Origin |
| `SKLAND_PUBLIC_ORIGIN` | 森空岛会话流的可信 Origin |
| `BETA_TRUST_PROXY_HEADERS` | 为 `1` 时信任反向代理的来源/IP 头 |
| `SKLAND_ALLOW_INSECURE_HTTP` | 仅可信临时测试允许非 HTTPS 森空岛请求 |
| `APP_DEPLOYMENT_ENV` | `production`或`development`；production 强制关闭森空岛 |
| `SKLAND_FEATURE_ENABLED` | dev/local 可设为`0`关闭；不能在 production 开启 |
| `LEGAL_OPERATOR_NAME` | 覆盖服务条款和隐私政策中的运营者署名 |
| `LEGAL_CONTACT_EMAIL` | 可选的法律联系邮箱 |
| `LEGAL_CONTACT_URL` | 覆盖法律页面中的联系链接 |
| `BETA_DEBUG_TOOLS_ENABLED` | 为 `1` 时允许服务端生成公开调试字段 |
| `BETA_RATE_LIMIT_ENABLED` | `0` 关闭、`1` 开启；生产默认开启 |
| `PLAYWRIGHT_BASE_URL` | E2E 地址，默认 `http://127.0.0.1:5184` |

反向代理生产环境应明确设置两个公开 Origin，并启用可信代理头；生产保持调试关闭、限流开启。

## 常用命令

建议使用 Node.js 22。

```bash
npm install
npm run dev
```

本地开发默认监听 `http://127.0.0.1:5174`；`npm run dev:full` 是兼容别名。

```bash
npm run lint
npm test
npm run test:api-contract
npm run audit:security
npm run test:deploy
npm run test:solver-contract
npm run check
npm run build
npm run test:production-client
npm run test:e2e
npm run test:e2e:production-profile
npm run test:e2e:webkit
npm start
```

- `npm run check` 依次运行 lint、单元测试和 API 契约测试。
- `npm run audit:security` 阻止 high / critical npm 漏洞进入受保护分支；依赖安全修复交付时仍应运行完整`npm audit`并清零已知漏洞。
- `npm run test:deploy`验证发布包准备、release 淘汰、失败清理、回滚和磁盘空间保护。
- `npm run test:solver-contract` 仅在 Linux 执行，验证仓库内 ELF 制品指纹并用 Full E2 真实调用 `plan.compute`。
- `npm run build` 进行 Next 生产构建并覆盖 TypeScript 集成检查。
- `npm run test:production-client` checks the production browser build for forbidden Skland login content.
- `npm run test:e2e` 默认在 5184 端口自动启动 Next，并用 Playwright 拦截外部 API；通常不需要真实 CLI 或森空岛凭据。
- `npm run test:e2e:webkit` 使用同一套 E2E 场景执行独立 WebKit 兼容性门禁。
- `npm start` 默认监听 `0.0.0.0:5174`。
- CI 依次执行 `npm ci`、lint、单元测试、契约测试、build 和 Chromium E2E。

开发调试模式仅在本地这样开启：

```powershell
$env:BETA_DEBUG_TOOLS_ENABLED='1'
$env:BETA_RATE_LIMIT_ENABLED='0'
npm run dev
```

然后访问 `http://127.0.0.1:5174/?beta`。调试结束后恢复默认环境并重启服务。

## 验证矩阵

- 纯文档改动：核对所有路径、脚本、环境变量和链接确实存在；若直接推 main，至少运行 `npm run check`。
- TypeScript、状态管理、解析或通用 UI 改动：运行 `npm run check`。
- 依赖、类型、Next 配置、route handler、服务端或公共契约改动：运行 `npm run check`、`npm run audit:security` 和 `npm run build`；依赖安全修复还要运行完整`npm audit`。
- 用户流程、响应式、持久化、调试开关或森空岛 UI 改动：再运行 `npm run test:e2e`。
- CLI 协议或真实求解链改动：启动 `npm run dev`，确认 `/api/health` 的成功信封中 `data.plannerReady: true`，再用 Full E2 生成三班排班。
- 森空岛服务端改动：除自动化外，在安全测试环境验证二维码、轮询、Cookie 刷新、角色切换、同步和退出；不得把真实凭据写入测试夹具。

涉及 UI 时至少检查 390px、768px、1440px，并覆盖：

- 基建计算器、练卡建议、森空岛状态三个一级导航。
- Full E2、配置流程、生成排班、三班切换和 MAA 下载。
- 键盘焦点、Dialog 关闭后焦点恢复、`role="status"` / `role="alert"` 和移动端约 44px 触控目标。
- “一图流布局”仍可见且保持当前禁用状态；加工站“暂不显示”和恢复交互不丢失。
- dev 保持森空岛一级导航、登录和状态中心；production 不显示任何森空岛入口、不发起相关请求，法律页和健康检查也不暴露相关文案或字段。
- v5 会话及旧版本迁移刷新后无 hydration 错误，持久化数据不含内部字段。

真实 CLI 冒烟还要确认：

- `server/storage/cli-runs` 生成运行记录。
- 反馈经用户同意后写入 `server/storage/feedback`。
- 公开 plan、health、feedback 响应没有内部路径、进程信息或调试字段泄露。

不要把“测试文件存在”写成“测试已通过”；只报告本次实际执行的命令和结果。

## Git、PR 与评审

- 默认不要直推 `origin/main`或`origin/develop`；除非用户明确要求，否则使用功能分支和 PR。
- 开始提交前先 `git fetch origin main`，确认基线没有落后；若 main 已前进，先安全同步再继续。
- 只暂存本任务文件，提交前检查 `git diff --check`、`git diff --cached` 和 `git status --short`。
- commit message 使用简短的中文或英文 `<type>: <summary>`。
- PR 说明至少写明改了什么、为什么、验证命令，以及是否影响 CLI、公共 API、森空岛会话、存储、反馈 JSON 或 MAA JSON。
- 合并前确保完整质量门禁通过。不要为消除审计告警擅自运行可能破坏兼容性的 `npm audit fix --force`。

代码评审优先检查高风险行为，不把格式问题重复成评审规则：

- 内部字段或凭据是否可能进入公共 API、localStorage、日志或反馈。
- 写接口是否绕过同源、大小限制、限流或 consent。
- 公共 DTO、错误码和协议变化是否有对应契约测试。
- 失败、超时、CLI 重启、损坏持久化和移动端流程是否仍可恢复。
- 算法变更是否误放在前端仓库。

## 生产与发布

除非用户明确要求，不执行服务器部署、服务重启、线上求解器替换或数据清理。

当前双环境约定：

```text
production branch: main
production app root: /opt/arknights-infra
production systemd: arknights-infra
production internal Next: 127.0.0.1:4175
production Funnel nginx: 127.0.0.1:4176
production direct-IP nginx: 0.0.0.0:4174 (Host-restricted compatibility listener; not the Funnel target)
production public HTTPS: https://instance-pi2ohhfj.tail2dca9.ts.net:8443 (Tailscale Funnel to 127.0.0.1:4176)
production HTTP redirect: port 80 redirects to public HTTPS
production persistent storage: /var/lib/arknights-infra

development branch: develop
development app root: /opt/arknights-infra-dev
development systemd: arknights-infra-dev
development internal Next: 127.0.0.1:4275
development loopback nginx: 127.0.0.1:4274 (SSH tunnel only until a dev domain is available)
development persistent storage: /var/lib/arknights-infra-dev
```

`main`和`develop` push 必须先通过`Frontend quality`，随后由`Deploy verified branch`从已验证 SHA 自动发布到各自 GitHub Environment。发布包只包含 Git 跟踪内容；服务器优先通过`/usr/local/sbin/arknights-infra-prepare-release`和`/var/cache/arknights-infra-deploy/repository.git`增量准备准确 SHA。helper 返回临时故障码`75`时，Runner 优先读取对应服务器缓存 ref，并发送从该 ref 到已验证 SHA 的增量 Git bundle；缓存 ref 不可用时才使用上一次 push SHA。helper 校验路径、HEAD、前置对象、tree、完整对象图后导入，仅在 bundle 不可用时回退完整 SCP。SHA、tree、路径、bundle 或 helper 契约错误必须直接失败。新 release 从应用根目录的`shared/.env.local`继承环境配置；`shared/bin-data`只有包含当前 Worker 所需的完整数据文件集时才注入 release，不完整的旧数据保留但不得覆盖制品内置数据。随后以`arkinfra`用户执行`npm ci`/`npm run build`，再原子切换`current`并重启对应 systemd。部署锁内只允许清理命名和提交标记均合法的 release 直属目录；每个环境保留当前 release 加两个回滚版本，失败半成品必须移除，清理后可用空间少于 3 GiB 时必须在创建新 release 前失败。`shared`和`/var/lib`永不进入 release 淘汰范围。不得把服务器密码写入文件或命令；只使用受保护的 SSH key 与 known_hosts。手动发布仍必须基于对应已合并、已验证的远端分支。

两个固定 helper 必须是`root:root 0755`普通文件并支持`--contract-version`；当前 prepare/deploy 契约均为`1`。工作流以契约版本做兼容握手，并把服务器文件 SHA-256只作为审计信息。内部实现保持参数、退出码和权限语义兼容时不得随意升级版本；任何不兼容修改必须成套更新脚本、工作流、测试和文档，先通过完整 PR 门禁，再在合并前原子安装并复核新 helper。不得通过跳过 owner/mode/version 检查让部署通过。

发布后至少验证：

- `current` 指向预期 SHA，`arknights-infra` 为 active。
- 4175 正常监听，内部与公网 `/api/health` 返回成功信封，`data.plannerReady: true`。
- 生产 `debugTools: false`、`rateLimit: true`，公开响应不泄露内部字段。
- 浏览器可载入 Full E2、生成三班、刷新恢复、下载 MAA 并提交一次最小反馈。
- `/var/lib/arknights-infra/cli-runs` 和 `/var/lib/arknights-infra/feedback` 保持持久化且有正确所有权。
- 每个环境最多存在当前 release 和两个合法回滚 release，没有失败半成品，应用分区剩余空间不少于 3 GiB。

前端发布失败时，把 `current` 原子切回已确认的上一 release 后重启并复查健康检查。只更新线上 CLI 时遵循 `docs/UPDATE_SOLVER.md`，不要借机发布未合并的前端工作区。

## 完成标准

最终回复明确说明：

- 修改了哪些文件和主要行为。
- 实际运行了哪些验证命令及结果。
- 是否创建 commit、push、PR；如有，给出分支、commit 或 PR。
- 是否执行生产部署；如执行，说明 release、端口、健康检查和持久化状态。
- 仍未验证或尚未解决的风险。

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
