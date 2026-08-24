# 明日方舟基建排班助手

导入干员数据，配置基建设施和换班方式，生成多班次排班、效率概览与练卡建议，并可导出到 MAA。求解由服务端长驻的 `infra-cli serve` 完成，本仓库不实现排班算法和效率公式。所有环境都提供 MAA/兼容文件导入；显式开启森空岛的环境还提供二维码同步。

## 本地开发

```powershell
npm install
npm run dev
```

默认地址：

```text
http://127.0.0.1:5174
```

页面和 `/api/*` route handlers 由同一个 Next.js 服务提供。`npm run dev:full` 是兼容别名。

常用质量检查：

```powershell
npm run check
npm run audit:security
npm run test:deploy
npm run build
npm run test:production-client
npm run test:e2e
npm run test:e2e:production-profile
npm run test:e2e:webkit
```

`npm run test:e2e`运行默认 Chromium 发布门禁；涉及响应式、触控或 Safari 兼容性的 UI 改动还应在本地运行独立 WebKit 回归。CI 每日定时运行完整 WebKit 套件，也可从 Actions 手动触发。

仓库文本由`.gitattributes`和`.editorconfig`统一为 UTF-8/LF。Windows 日常开发使用 PowerShell；部署 shell 测试应在 Linux CI 或显式指定的 WSL Ubuntu 中运行，裸`bash`可能指向 Docker WSL 或 Git Bash。完整跨平台约束见[开发与发布维护准则](./docs/DEVELOPMENT_RELEASE_GUARDRAILS.md)。

设施卡片的透明徽记由现有 WebP 素材确定性提取。调整提取规则后重新生成并核对产物：

```powershell
npm run assets:room-emblems
```

### 服务端诊断

Windows PowerShell：

```powershell
$env:BETA_DEBUG_TOOLS_ENABLED='1'
$env:BETA_RATE_LIMIT_ENABLED='0'
npm run dev
```

产品页面不再提供 `/?beta` 调试入口，也不会向排班请求传播 beta 参数或展示 CLI 输出。`BETA_DEBUG_TOOLS_ENABLED=1` 仅保留给本地直接调用 `/api/plan?beta=1` 的服务端排障；production 即使误设为 `1` 也会强制关闭调试字段。hydration、接口泄露、错误码、限流和响应式排查流程见[开发指南](./docs/DEVELOPMENT_GUIDE.md#服务端诊断)和[上线产品化报告](./docs/FRONTEND_PRODUCTION_READINESS_REPORT.md#开发调试环境使用指南)。

## Box 导入与森空岛登录

所有环境均支持上传或粘贴 MAA 的 `Arknights_OperBox_Export.json`。森空岛开关启用时，用户分别同意本站服务条款与隐私政策后，页面会自动显示二维码，使用森空岛 App 扫码即可完成授权；本项目不提供账号密码登录。旧的一图流 xlsx 仍保留为兼容入口，243 全精二样例可从首页的“全角色导入”直接载入。

网站账号与森空岛状态使用两个独立的侧边栏页面：“账号管理”提供注册、登录、邮箱验证码、找回密码、设备退出和销户；启用后的“森空岛状态中心”保留“概览 / 基建”页签，并负责扫码绑定与七天续期。同一浏览器最多保留 5 个森空岛账号。生成二维码前必须分别同意[本站服务条款](./src/app/terms/page.tsx)与[本站隐私政策](./src/app/privacy/page.tsx)。登录成功后，状态中心会按隐私政策列明的白名单直接读取 Box、设施、当前进驻、头像、理智、任务、公招、皮肤、活动和游戏进度等完整状态，并展示已接入界面的数据，不再设置二次授权；传给排班流程的仍只有求解所需最小字段。具体范围与排除项见 [森空岛数据能力矩阵](docs/SKLAND_DATA_CAPABILITIES.md)。

启用森空岛登录前必须配置至少 32 字节、长期保持不变的会话密钥：

```powershell
$env:SKLAND_SESSION_SECRET = "请替换为随机生成的长期密钥"
$env:APP_DEPLOYMENT_ENV = "development"
npm run dev
```

通过反向代理部署时，还应配置浏览器实际访问的完整 Origin（包括非默认端口），用于校验公开写请求的来源：

```powershell
$env:BETA_PUBLIC_ORIGIN = "https://infra.example.com"
$env:SKLAND_PUBLIC_ORIGIN = "https://infra.example.com"
$env:BETA_TRUST_PROXY_HEADERS = "1"
```

`BETA_PUBLIC_ORIGIN`保护全部公开写接口，`SKLAND_PUBLIC_ORIGIN`继续保护森空岛会话流。每个森空岛账号的凭证会使用 AES-256-GCM 加密后写入独立的 HttpOnly Cookie，另有一个加密索引 Cookie 记录当前账号；凭证从扫码成功起固定保存 7 天，刷新、读取会话或切换角色不会续期。PostgreSQL 只额外保存 HMAC 化的森空岛绑定标识、对应网站用户和授权时间，让森空岛状态中心与管理后台区分“有效授权”和“待扫码续期”；绑定标记不会因七天到期自动删除，也不保存森空岛 UID、昵称、Box 或令牌。扫码临时凭据和登录凭证都不会写入浏览器存储、运行记录或反馈包，完整状态快照也只停留在页面内存。状态中心提供退出当前账号和“删除全部森空岛数据”，两者会解除相应绑定，后者还会清除可关联的服务端运行记录与反馈，并保留独立导入的 MAA 数据和手动布局。localhost 可使用 HTTP 开发；非 localhost 环境默认必须通过 HTTPS 访问，否则只禁用森空岛入口，MAA 导入和求解仍可使用。仅在临时、可信的 HTTP 测试环境中可以显式设置 `SKLAND_ALLOW_INSECURE_HTTP=1`；此时登录流量不会受到 HTTPS 保护。

`APP_DEPLOYMENT_ENV=production`默认对森空岛失败关闭，只有同时精确设置`SKLAND_FEATURE_ENABLED=1`才会在构建产物、健康检查和`/api/skland/*`访问面启用。未设置、空值、`0`或其他值都不会开启；本地`next dev`默认保持兼容，也可用`0`关闭。production 的调试工具与限流策略仍分别强制为关闭和开启，不受该开关影响。
`npm run test:production-client`会扫描静态 JavaScript 与公开 HTML/RSC：关闭构建必须剔除森空岛文案、API URL 和 App Scheme，显式开启构建则必须完整保留三类边界。该命令必须使用与`npm run build`相同的`APP_DEPLOYMENT_ENV`和`SKLAND_FEATURE_ENABLED`。

## 网站账号与数据库

MAA JSON / xlsx 与已启用的森空岛能力要求先登录已验证的网站账号；全角色样例、技能查询、配置和样例求解仍可匿名使用。网站账号使用 Better Auth、PostgreSQL 和 Resend；注册邮箱使用 6 位验证码验证，验证码 10 分钟过期且只保存哈希，密码重置继续使用一小时有效链接。数据库与认证实例在真实请求时惰性初始化，因此没有数据库或认证密钥时仍可完成 production build。`/api/auth/*` 使用 Better Auth 原生协议，不套公共 API 信封；应用自有管理和业务接口仍使用统一信封。

业务数据使用 PostgreSQL `app` schema 与受保护文件目录混合保存。功能开关启用后，运行与反馈只双写白名单摘要；CLI 请求响应、命令和 stdout/stderr 仍只在文件目录保留 7 天。登录用户确认当前版本政策后会自动同步布局、设置、最近排班和应用层信封加密的 MAA Box；普通云端数据滚动保留 30 天，最多固定 5 条排班长期保留。森空岛 UID、昵称、Box、凭据和完整状态不会进入业务数据库，森空岛来源也不会进入共享排班缓存。部署与回填顺序见[业务数据存储与分阶段启用手册](./docs/BUSINESS_DATA_STORAGE.md)。

数据库容器、runtime/migration/backup 最小权限账号、邮件域名、固定 deploy helper、管理员初始化、加密备份和双环境验收顺序见[网站账号与 PostgreSQL 上线手册](./docs/AUTHENTICATION_DATABASE.md)。

法律页面默认以“明日方舟基建排班助手项目维护者”署名并链接仓库 Issues，可通过 `LEGAL_OPERATOR_NAME`、`LEGAL_CONTACT_EMAIL`、`LEGAL_CONTACT_URL` 覆盖。修改政策正文时还应同步更新 `src/legal-policy.ts` 中的政策版本，使旧同意失效并要求重新确认。

## CLI 设置

服务端 route handler 会优先使用本仓库内的 CLI：

```text
bin/infra-cli        # Linux
bin/infra-cli.exe    # Windows
bin/data/            # 可选运行数据；部署时也可显式提供
```

也可以通过 `INFRA_CLI_PATH` 指向任意可执行文件。如果仓库内没有 CLI，服务端会尝试读取 `../ArknightsInfraCalc-v2/target/{release,debug}/infra-cli*`。

Linux 部署前请把 Linux 版本的 `infra-cli` 放到 `bin/infra-cli`，并确认有执行权限：

```bash
chmod +x bin/infra-cli
```

`infra-cli serve` 的内部响应不得直接作为公共 API 数据返回，必须经过 `src/server/public-plan.ts` 的白名单映射。协议与公共边界见[Frontend Serve Guide](./docs/FRONTEND_SERVE_GUIDE.md)。

## 双环境自动部署

分支与站点一一对应：

| 分支 | GitHub Environment | 部署目标 | 森空岛 |
| --- | --- | --- | --- |
| `main` | `production` | 线上站点 | 仅显式`SKLAND_FEATURE_ENABLED=1`开启 |
| `develop` | `development` | dev 站点 | 开启，可由环境变量主动关闭 |

推送到两个分支都会先执行`Frontend quality`，但`Change scope`会先用保守白名单判断实际影响范围。`quality`汇总检查始终存在；它要求被选中的 Job 成功，并核对未选中的 Job 确实是`skipped`，因此不会因 workflow 级路径过滤而让受保护分支永久等待。

| 变更范围 | Core checks | Chromium E2E | 服务器部署 |
| --- | --- | --- | --- |
| `docs/**`、根 Markdown、`.gitignore`、`.editorconfig`、LICENSE | 跳过 | 跳过 | 跳过 |
| 单元测试、非发布型 GitHub 配置 | 执行 | 跳过 | 跳过 |
| E2E 或 Playwright 配置 | 执行 | 执行 | 跳过 |
| `frontend-quality.yml`、`deploy.yml` | 执行 | 跳过 | 受保护分支 push 执行 |
| 运行时代码、依赖、部署脚本或未知路径 | 执行 | 执行 | 受保护分支 push 执行 |

手动触发、无法取得可靠基线或空差异都会失败关闭为完整门禁。PR 检查不部署；push 只有在门禁成功且分类输出`deploy_required=true`时，`Deploy verified branch`才会发布该次验证 SHA。部署工作流先确认服务器两个固定 helper 是`root:root 0755`普通文件且`--contract-version`与当前工作流兼容，再从共享 Git 缓存增量取得对象并在服务器本地生成只包含 Git 跟踪内容的发布包。helper 以状态码`75`报告临时 GitHub 网络、缓存或锁故障时，Runner 会读取该环境的服务器缓存 ref，并优先上传从该 ref 到已验证 SHA 的增量 Git bundle；缓存 ref 不可用时才尝试上一次 push SHA。服务器严格校验 bundle 的路径、所有者、HEAD、前置对象、commit tree 和完整对象图后导入缓存。只有 bundle 基线不可用、传输失败或缓存缺少前置对象时才退回完整 SCP；SHA、tree、路径或 helper 契约错误会直接终止。`scripts/deploy-release.sh`负责独立 release 目录、原子切换`current`软链、内部/公网健康检查和失败回滚；它在构建前及成功后都只清理经过严格校验的旧 release，每个环境保留当前版本和两个回滚版本，并在清理后可用空间不足 3 GiB 时于创建新 release 前失败。失败构建的本次目录会自动移除，`shared`和`/var/lib`持久化数据不参与清理。

生产构建同时限制 Next route 统计和首页 HTML 实际引用的全部首轮 JavaScript 文件数、原始体积与 gzip 体积，避免 SSR 动态预加载逃过 bundle 门禁。发布完成后还会用真实 GET 请求核对公网 HTML 与 JavaScript 的 gzip/Brotli 响应；HEAD 不作为压缩验收依据。

需要在 GitHub 仓库创建`production`与`development`两个 Environment，并在每个 Environment 中配置同名、不同值的项目：

Secrets：

- `DEPLOY_HOST`
- `DEPLOY_SSH_USER`
- `DEPLOY_SSH_PRIVATE_KEY`
- `DEPLOY_SSH_KNOWN_HOSTS`

Variables：

- `DEPLOY_APP_ROOT`：例如线上`/opt/arknights-infra`、dev `/opt/arknights-infra-dev`
- `DEPLOY_SERVICE`：例如`arknights-infra`、`arknights-infra-dev`
- `DEPLOY_RUN_USER`：默认`arkinfra`
- `DEPLOY_INTERNAL_PORT`：例如线上`4175`、dev `4275`
- `DEPLOY_PUBLIC_HEALTH_URL`：对应站点的完整`/api/health`地址
- `DEPLOY_DEBUG_TOOLS_ENABLED`：dev 可设为`1`，production 会强制改为`0`
- `DEPLOY_RATE_LIMIT_ENABLED`：通常保持`1`；production 会强制开启

服务器需要预先创建两套 systemd 服务、Nginx 站点和独立持久化目录。每套应用根目录的`shared/.env.local`保存该环境的非仓库配置；启用森空岛的环境都必须配置独立或既有的长期稳定会话密钥及正确 Origin。SSH 部署账号只应获得运行发布脚本所需的最小免密 sudo 权限。`develop`首次启用前应从已验证的`main`创建，并为两个分支启用必须通过`Frontend quality`的保护规则。

增量发布还需要一次性以 root 将已评审提交中的两个 helper 按`root:root 0755`原子安装到`/usr/local/sbin`，并创建`arkdeploy:arkdeploy 0750`的`/var/cache/arknights-infra-deploy`。首次启用时以当前 production release 和准确的 commit/tree 运行 prepare helper，并设置`ARKNIGHTS_INFRA_SEED_RELEASE_DIR=/opt/arknights-infra/current`；helper 会逐个核对并导入未变化的本地 blob，只从 GitHub 补取元数据及被构建改写的少量文件。演练生成的`/tmp`发布包验证后删除，不调用 root 部署 runner，也不重启服务。

production 主入口统一为`https://riic.autos`，`https://ark.riic.autos`只做永久跳转；现有`https://instance-pi2ohhfj.tail2dca9.ts.net:8443`继续作为 Tailscale Funnel 兼容入口并转发到专用回环 Nginx`127.0.0.1:4176`。dev 继续使用`https://instance-pi2ohhfj.tail2dca9.ts.net`并转发到`127.0.0.1:4274`；两个 Next 内部端口`127.0.0.1:4175`和`127.0.0.1:4275`都不直接开放公网。production 的`0.0.0.0:4174`是受 Host 限制的直连/IP 兼容 vhost，不是主域名或 Funnel 目标，也不应写入公开 Origin。服务器 80 端口只将请求`308`重定向到`https://riic.autos`。production GitHub Environment 的`DEPLOY_PUBLIC_HEALTH_URL`必须使用`https://riic.autos/api/health`；`BETTER_AUTH_URL`、`BETA_PUBLIC_ORIGIN`和`SKLAND_PUBLIC_ORIGIN`也必须统一为主域名并保持`SKLAND_ALLOW_INSECURE_HTTP=0`。

Actions 使用独立`arkdeploy`密钥，并且 sudo 仅允许调用服务器上 root 所有的`/usr/local/sbin/arknights-infra-deploy`。prepare helper 不使用 sudo；两个固定脚本当前使用契约版本`1`，工作流检查普通文件、`root:root 0755`和版本一致性，并把服务器文件 SHA-256写入审计摘要。兼容的内部修改不要求在 main/develop 部署之间切换脚本；不兼容升级必须先通过完整 PR 门禁，再以 root 原子安装并复核 owner/mode/version/hash，最后才合并。现有 root SSH 私钥不会进入 GitHub。Git 缓存只保存公开仓库对象和两个环境 ref，临时 bundle 在 helper 退出时清理；两者都不保存 Environment Secrets、应用配置或用户数据。

## 手动运行

```bash
npm ci
npm run build
npm start
```

`npm start` 默认监听 `0.0.0.0:5174`。如需改端口，直接调整 `package.json` 的 `next start -p` 参数或用部署平台提供的启动命令。

## 持久化数据

服务端会保留 CLI 运行记录和反馈提交，默认写入：

```text
server/storage/cli-runs
server/storage/feedback
```

可以用 `BETA_STORAGE_DIR` 改整体存储目录，也可以分别用 `BETA_CLI_RUN_DIR`、`BETA_FEEDBACK_DIR` 指定运行记录和反馈目录；后两者必须位于整体存储目录内部，避免清理任务越过私有存储边界。

## 样例数据

首页“全角色导入”入口优先读取：

```text
fixtures/operbox_full_e2.json
```

如果仓库内不存在，会回退到本地核心仓库的 `data/fixtures/243/operbox_full_e2.json`。

## 文档入口

- [开发指南](./docs/DEVELOPMENT_GUIDE.md)：API 契约、环境变量、本地调试和质量门禁。
- [登录用户主流程第二、三阶段计划](./docs/LOGIN_USER_FLOW_PHASES_2_3_PLAN.md)：结果行动化、个人筛选、性能门禁与显式选择的聚合体验指标。
- [网站账号与 PostgreSQL 上线手册](./docs/AUTHENTICATION_DATABASE.md)：认证生命周期、管理员权限、数据库迁移、备份与 production/development 验收。
- [PostgreSQL 部署资产](./deploy/postgres/README.md)：双环境容器、最小权限角色和加密备份模板。
- [业务数据存储与分阶段启用手册](./docs/BUSINESS_DATA_STORAGE.md)：`app` schema、保留策略、加密、回填、备份与功能开关顺序。
- [预计日产物计算逻辑](./docs/计算逻辑.md)：经验、龙门币、赤金、源石碎片、合成玉和历史排班上下文的计算口径。
- [森空岛数据能力矩阵](./docs/SKLAND_DATA_CAPABILITIES.md)：账号状态白名单、排班最小字段与禁止持久化的数据。
- [开发与发布维护准则](./docs/DEVELOPMENT_RELEASE_GUARDRAILS.md)：Windows/Linux 差异、求解器身份、helper 契约和双分支发布。
- [上线产品化报告](./docs/FRONTEND_PRODUCTION_READINESS_REPORT.md)：改造基线、错误码、数据流、验证结果和 DevTools 排查方法。
- [Frontend Serve Guide](./docs/FRONTEND_SERVE_GUIDE.md)：`infra-cli serve` 协议及公共 DTO 边界。
- [`infra-cli advice` 输出评估](./docs/INFRA_CLI_ADVICE_REPORT.md)：结构化练卡报告、字段说明、安全边界和未来前端接入方案。
- [贸易产出契约差异](./docs/TRADE_PRODUCTION_CONTRACT_GAP.md)：求解器贸易效率与展示换算的已知边界。
- [键盘快捷键](./docs/keyboard-shortcuts.md)：当前快捷键约定及实现状态。
- [更新线上求解器](./docs/UPDATE_SOLVER.md)：仅在契约或真实求解验证需要时更新服务器 CLI。
- [第三方素材说明](./THIRD_PARTY_ASSETS.md)：素材来源、许可与再分发说明。
- [设计 QA 记录](./design-qa.md)：森空岛与练卡页面的视觉对照、实现截图和历史检查结果。
