# Agent 入口文档

> 新会话先读本文。这里是 `ArknightsInfraCli-v2` 明日方舟基建排班求解器的 beta 测试前端，不是核心求解器仓库。

## 项目定位

本仓库提供一个面向 beta 测试者的排班验收工作台，用来调用本地或指定路径下的 `infra-cli`，验收 `infra-cli serve` 生成的结果。

主要目标：

- 上传或载入干员练度表。
- 选择基建布局并运行三班排班求解。
- 展示房间排班、效率、调试信息和可导出的 MAA JSON。
- 收集 CLI 运行记录与反馈 JSON，方便定位前端、CLI、策略表或用户 box 的问题。

非目标：

- 不在前端重写排班、技能、效率或策略求解逻辑。
- 不在 `src/server/` 中实现机制公式；服务端只负责接收请求、调用 CLI、保存记录和提供 Next 页面。
- 不把 beta 测试页面做成介绍页或营销页；首屏应直接是验收工作台。

## 技术栈

- 前端：Next.js App Router + React + TypeScript。
- UI：shadcn/ui，Base UI primitive，Tailwind CSS v4。
- 本地 API：Next route handlers，入口在 `src/app/api/*/route.ts`。
- 服务端逻辑：`src/server/infra.ts`。
- 求解器：外部可执行文件 `infra-cli`。
- 样例数据：`fixtures/operbox_full_e2.json`。

## 常用命令

```bash
npm install
npm run dev
```

默认地址：

```text
http://127.0.0.1:5174
```

其他常用命令：

```bash
npm run build
npm run lint
npm start
```

`npm run dev:full` 保留为 `npm run dev` 的别名，兼容旧习惯。页面和 `/api/*` 由同一个 Next dev server 提供，不再启动单独的 Express 服务。

## CLI 关系

服务端优先查找：

```text
bin/infra-cli
bin/infra-cli.exe
```

也可以通过环境变量指定：

```bash
INFRA_CLI_PATH=/path/to/infra-cli npm run dev
```

如果仓库内没有 CLI，服务端会尝试回退到相邻核心仓库：

```text
../ArknightsInfraCalc-v2/target/release/infra-cli*
../ArknightsInfraCalc-v2/target/debug/infra-cli*
```

Linux 环境下确认可执行权限：

```bash
chmod +x bin/infra-cli
```

## 关键文件

| 路径 | 说明 |
|------|------|
| `src/app/layout.tsx` | Next App Router 根布局 |
| `src/app/page.tsx` | 首屏工作台入口 |
| `src/app/api/*/route.ts` | health、sample-operbox、plan、feedback API |
| `src/server/infra.ts` | CLI 查找、`infra-cli serve` 客户端、运行记录和反馈保存 |
| `src/App.tsx` | 主工作台状态与页面编排 |
| `src/components.tsx` | shadcn/base 业务 UI 组件 |
| `src/components/ui/*` | shadcn 生成的 UI primitives |
| `src/api.ts` | 前端 API 调用 |
| `src/types.ts` | 前后端共享的 TypeScript 数据形状 |
| `src/operbox.ts` | 练度表解析与样例载入 |
| `src/schedule.ts` | 排班结果整理 |
| `src/blueprint.ts` | 布局 / 蓝图相关处理 |
| `src/download.ts` | 调试包、MAA JSON 等导出 |
| `fixtures/operbox_full_e2.json` | 243 全精二样例 box |
| `bin/infra-cli` | Linux CLI 可执行文件 |
| `bin/infra-cli.exe` | Windows CLI 可执行文件 |

## 存储与环境变量

beta 测试阶段会保留 CLI 运行记录和反馈提交，默认写入：

```text
server/storage/cli-runs
server/storage/feedback
```

可用环境变量：

| 变量 | 用途 |
|------|------|
| `INFRA_CLI_PATH` | 指定 CLI 可执行文件 |
| `INFRA_CORE_ROOT` | 指定相邻核心仓库路径 |
| `ARKNIGHTS_INFRA_DATA_DIR` | 指定 CLI 运行数据目录 |
| `BETA_STORAGE_DIR` | 整体存储根目录 |
| `BETA_CLI_RUN_DIR` | CLI 运行记录目录 |
| `BETA_FEEDBACK_DIR` | 反馈记录目录 |
| `BETA_CLI_TIMEOUT_MS` | CLI 请求超时时间，默认 120000ms |

## 实现原则

1. 前端只展示和校验，不发明求解口径。
2. CLI 输出 JSON 是排班、效率、导出数据的事实源。
3. 修改数据结构时，同时检查 `src/types.ts`、`src/api.ts`、`src/server/infra.ts` 和 UI 展示。
4. 任何与排班算法、干员技能、效率公式相关的问题，优先去核心仓库 `../ArknightsInfraCalc-v2` 修改。
5. beta 用户路径要短：上传 box、选择布局、运行、查看结果、导出调试包。
6. 保持首屏为实际工具界面，不新增落地页。
7. UI 控件优先使用 `src/components/ui/*` 中的 shadcn/base primitives，不回退到手写按钮、弹窗或 tabs。

## 验证建议

文档或小 UI 改动后至少运行：

```bash
npm run lint
```

涉及类型、构建或 API 契约时运行：

```bash
npm run build
```

涉及 CLI 调用链时，用可用的 `infra-cli` 跑：

```bash
npm run dev
```

然后在页面中载入 243 全精二样例并执行一次排班。
