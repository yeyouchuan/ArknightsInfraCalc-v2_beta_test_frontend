# 明日方舟基建排班助手

导入森空岛或 MAA 干员数据，配置基建设施，生成三班排班、效率概览与练卡建议，并可导出到 MAA。求解由服务端长驻的 `infra-cli serve` 完成，本仓库不实现排班算法和效率公式。

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
npm run build
npm run test:e2e
```

### 开发调试模式

Windows PowerShell：

```powershell
$env:BETA_DEBUG_TOOLS_ENABLED='1'
$env:BETA_RATE_LIMIT_ENABLED='0'
npm run dev
```

然后访问：

```text
http://127.0.0.1:5174/?beta
```

调试 UI 只有在服务端 `BETA_DEBUG_TOOLS_ENABLED=1` 且 URL 同时带 `?beta` 时出现。单独添加 `?beta` 不会开启调试字段；生产环境应保持该开关关闭。hydration、接口泄露、错误码、限流和响应式排查流程见[开发指南](./docs/DEVELOPMENT_GUIDE.md#调试模式)和[上线产品化报告](./docs/FRONTEND_PRODUCTION_READINESS_REPORT.md#开发调试环境使用指南)。

## Box 导入与森空岛登录

页面支持两种主要 Box 来源：森空岛同步，以及上传或粘贴 MAA 的 `Arknights_OperBox_Export.json`。桌面端使用森空岛二维码登录；手机端可通过鹰角官方 `u-link` 包装二维码接口返回的 `scanUrl`，尝试拉起森空岛完成同一授权流程。移动端兼容性取决于森空岛 App 是否转交登录载荷，失败时应改用桌面二维码；本项目不提供账号密码登录。旧的一图流 xlsx 仍保留为兼容入口，243 全精二样例可从首页的 “Full E2 测试” 直接载入。

启用森空岛登录前必须配置至少 32 字节、长期保持不变的会话密钥：

```powershell
$env:SKLAND_SESSION_SECRET = "请替换为随机生成的长期密钥"
npm run dev
```

通过反向代理部署时，还应配置浏览器实际访问的完整 Origin（包括非默认端口），用于校验公开写请求的来源：

```powershell
$env:BETA_PUBLIC_ORIGIN = "https://infra.example.com"
$env:SKLAND_PUBLIC_ORIGIN = "https://infra.example.com"
$env:BETA_TRUST_PROXY_HEADERS = "1"
```

`BETA_PUBLIC_ORIGIN`保护全部公开写接口，`SKLAND_PUBLIC_ORIGIN`继续保护森空岛会话流。森空岛凭证会使用 AES-256-GCM 加密后写入 HttpOnly Cookie；扫码临时凭据和登录凭证都不会写入浏览器存储、运行记录或反馈包。localhost 可使用 HTTP 开发；非 localhost 环境默认必须通过 HTTPS 访问，否则只禁用森空岛入口，MAA 导入和求解仍可使用。仅在临时、可信的 HTTP 测试环境中可以显式设置 `SKLAND_ALLOW_INSECURE_HTTP=1`；此时登录流量不会受到 HTTPS 保护。

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

## 生产运行

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

可以用 `BETA_STORAGE_DIR` 改整体存储目录，也可以分别用 `BETA_CLI_RUN_DIR`、`BETA_FEEDBACK_DIR` 指定运行记录和反馈目录。

## 样例数据

首页 “Full E2 测试” 入口优先读取：

```text
fixtures/operbox_full_e2.json
```

如果仓库内不存在，会回退到本地核心仓库的 `data/fixtures/243/operbox_full_e2.json`。

## 文档入口

- [开发指南](./docs/DEVELOPMENT_GUIDE.md)：API 契约、环境变量、本地调试和质量门禁。
- [上线产品化报告](./docs/FRONTEND_PRODUCTION_READINESS_REPORT.md)：改造基线、错误码、数据流、验证结果和 DevTools 排查方法。
- [Frontend Serve Guide](./docs/FRONTEND_SERVE_GUIDE.md)：`infra-cli serve` 协议及公共 DTO 边界。
- [更新线上求解器](./docs/UPDATE_SOLVER.md)：仅在契约或真实求解验证需要时更新服务器 CLI。

## 产品约束

- `Full E2 测试`保持在计划安排卡片右上角，并维持主按钮层级。
- “基建计算器 / 练卡建议 / 森空岛状态”保持同级导航。
- 手机端“一图流布局”继续显示为禁用态。
- 加工站继续使用现有“暂不显示”按钮和交互。
- 调试包、CLI 命令和内部响应只在服务端调试开关开启时显示。
