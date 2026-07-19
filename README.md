# Arknights InfraCalc 排班验收台

独立的 beta 测试工作台，用来验收 `infra-cli serve` 生成的三班排班、房间效率、MAA JSON 和调试包。

## 本地开发

```powershell
npm install
npm run dev
```

兼容旧习惯：

```powershell
npm run dev:full
```

默认地址：

```text
http://127.0.0.1:5174
```

Next.js App Router 同时提供页面和 `/api/*` route handlers，不再需要单独启动 Express API 或 Vite 代理。

## Box 导入与森空岛登录

页面支持两种主要 Box 来源：森空岛扫码同步，以及上传或粘贴 MAA 的 `Arknights_OperBox_Export.json`。旧的一图流 xlsx 和 243 全精二样例仍保留为兼容入口。

启用森空岛登录前必须配置至少 32 字节、长期保持不变的会话密钥：

```powershell
$env:SKLAND_SESSION_SECRET = "请替换为随机生成的长期密钥"
npm run dev
```

森空岛凭证会使用 AES-256-GCM 加密后写入 HttpOnly Cookie，不写入浏览器存储、运行记录或反馈包。localhost 可使用 HTTP 开发；非 localhost 环境必须通过 HTTPS 访问，否则只禁用森空岛入口，MAA 导入和求解仍可使用。

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

`docs/FRONTEND_SERVE_GUIDE.md` 记录了前端接入 `infra-cli serve` 的协议：Next route handler 启动一次 `infra-cli serve`，之后通过 stdin/stdout 逐行发送 JSON 请求和响应。

## 生产运行

```bash
npm ci
npm run build
npm start
```

`npm start` 默认监听 `0.0.0.0:5174`。如需改端口，直接调整 `package.json` 的 `next start -p` 参数或用部署平台提供的启动命令。

## 持久化数据

beta 测试阶段 API 会保留每次 CLI 运行和反馈提交的 JSON，默认写入：

```text
server/storage/cli-runs
server/storage/feedback
```

可以用 `BETA_STORAGE_DIR` 改整体存储目录，也可以分别用 `BETA_CLI_RUN_DIR`、`BETA_FEEDBACK_DIR` 指定运行记录和反馈目录。

## 样例数据

“载入 243 全精二样例”优先读取：

```text
fixtures/operbox_full_e2.json
```

如果仓库内不存在，会回退到本地核心仓库的 `data/fixtures/243/operbox_full_e2.json`。

## 设计目标

- beta 测试者可从森空岛同步或直接导入 MAA 练度表，再选择布局并运行。
- 首屏直接展示排班验收工作台，不做介绍页。
- 房间视角展示三班排班和对应效率。
- 一键导出调试包，便于判断前端、CLI、策略表或用户 box 的问题。
