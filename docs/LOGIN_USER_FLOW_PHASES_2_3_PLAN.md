# 登录用户解决方案第二、三阶段实施计划

> 状态：已确认方向，待按阶段拆分实施
> 基线：第一阶段完成共享 Website Session、显式登录意图、内联起步卡、768px 列表布局和移动端工具栏收敛
> 适用仓库：`ArknightsInfraCalc-v2_beta_test_frontend`
> 最后更新：2026-08-24

## 1. 目标与边界

第二阶段把已经生成的结果变成用户可以直接执行的行动清单；第三阶段在不收集个人数据的前提下缩短首屏加载、控制长列表成本，并建立可重复验证的体验指标。

主流程保持为：

```text
了解价值 → 登录 → 导入 BOX → 生成方案 → 立即执行 → 返回后持续优化
```

### 1.1 本计划建设的内容

- 重排排班结果信息层级，优先呈现日产物、班次时间、关键调整和 MAA 导出。
- 让练卡建议默认聚焦未完成、可行动项目，并提供明确筛选。
- 让技能查询在存在个人 BOX 时支持“仅看我拥有”和“仅看未解锁技能”。
- 让森空岛入口和状态中心优先表达绑定、续期、同步失败及当前进驻差异。
- 让最近一次有效方案成为返回用户的默认入口，并明确来源、生成时间和匹配状态。
- 按用户主动选择记录无访客标识的聚合体验计数。
- 建立首路由 gzip 体积报告、意图触发预加载、长列表分段渲染和 Web Vitals 门禁。

### 1.2 明确不建设的内容

- 不在前端实现排班搜索、干员技能策略或新的效率公式。
- 不修改 `infra-cli` 协议、`PublicPlanData` 白名单或求解器输出含义。
- 不把森空岛 UID、昵称、完整状态、BOX、搜索词或账号 ID 写入体验统计。
- 不引入第三方分析 SDK、广告标识、指纹、Cookie 标识或稳定访客 ID。
- 不用前端推算“提升百分比”；没有服务端可信基线时只展示绝对日产物和可验证的房间调整。
- 不把虚拟化强加给短列表；只有数据量和实测渲染成本达到门槛时启用。

### 1.3 最脆弱假设

本计划假设当前 `PublicPlanData`、`TrainingAdviceReport v2`、`SavedPlanData` 和 `ShiftComparison` 已包含完成展示所需的事实。如果某个“提升”或“差异”无法从这些白名单字段直接证明，界面必须降级为绝对值或“暂无可比较状态”，不得复制求解公式或扩展内部 CLI 字段。

## 2. 总体架构

阶段二和阶段三预计会触及 8 个以上文件，并有四组组件交换状态，因此按独立 PR 拆分，避免继续扩大 `src/App.tsx` 的职责。

```text
WebsiteSessionProvider
        │
        ▼
Workbench context ───────────────┐
  │ BOX / layout / result        │ saved plan metadata
  │                              ▼
  ├── Calculator ── Plan action summary ── MAA export
  ├── Training ─── Training filters
  ├── Skills ───── Personal BOX filters
  └── Skland ───── Binding state + ShiftComparison

Explicit local consent
        │
        ▼
Experience event client (credentials omitted)
        │ POST /api/experience-events
        ▼
Whitelist validation + same-origin + 4 KiB + rate limit
        │
        ▼
PostgreSQL app.experience_daily (daily aggregate only, 90 days)
```

## 3. 第二阶段：让结果可执行

第二阶段拆成三个可独立回滚的 PR。每个 PR 都不改变求解器协议。

### 3.1 PR 2A：结果行动摘要与最近方案入口

#### 行为

1. 在排班结果顶部按以下顺序展示：
   - 预计日产物：复用 `src/daily-production.ts` 的现有归一化结果。
   - 三班时间：复用 `rotation` 展示模型，不重新计算班次。
   - 关键房间：列出当前班次最需要关注的房间和人员，不创建新的效率排名公式。
   - 主操作：“导出到 MAA”；次操作为班次切换、搜索和反馈。
2. 只有存在森空岛当前进驻快照时才显示“与当前进驻相比”；内容来自 `compareShifts`，不把绝对效率包装成提升幅度。
3. 返回用户的恢复顺序固定为：
   - 先恢复浏览器 v5 中仍有效的最近结果，避免等待网络。
   - Website Session 确认登录、当前政策已同意且云同步开启后，再读取云端最近方案。
   - 本地已有结果时不被云端静默覆盖；只显示“云端有更新方案”的恢复操作。
   - 本地无结果时恢复最新 `SavedPlanData`，并显示来源、`createdAt`、`boxMatchesWorkspace` 和布局匹配状态。
   - `boxMatchesWorkspace=false` 或缺少 `calculationContext` 时允许只读查看，禁止直接恢复为可重新求解的当前工作区。

#### 代码范围

- 重组 `src/components/PlanResultSummary.tsx` 和 `src/components/pages/InfraCalculator.tsx`。
- 从 `src/App.tsx` 抽出纯展示模型到新文件 `src/plan-action-summary.ts`。
- 复用 `src/daily-production.ts`、`src/rotation-result.ts`、`src/skland.ts`。
- 在 `src/components/cloud/CloudDataPanel.tsx` 与工作台上下文中暴露“最新有效方案”摘要，不增加新的公共 API。
- 更新 `src/persistence.ts`，继续通过现有清理函数剔除 debug、路径和内部字段。

#### 测试

- 单元测试覆盖无日产物、部分日产物、三班、无森空岛比较和有比较五种展示模型。
- 持久化测试覆盖本地优先、云端不静默覆盖、BOX 不匹配只读和旧记录过期。
- E2E 覆盖 390px、768px、1440px 的摘要顺序、班次切换、MAA 下载和无横向滚动。
- 公共 plan DTO 快照保持不变，`src/server/public-plan.test.ts` 必须继续通过。

#### 验收

- 首屏结果不滚动即可看到日产物、班次时间和“导出到 MAA”。
- 没有比较基线时不出现“提升百分比”措辞。
- 恢复结果始终显示来源、生成时间以及是否匹配当前 BOX/布局。

### 3.2 PR 2B：练卡建议与个人技能筛选

#### 练卡建议

新增展示层联合类型：

```ts
type TrainingAdviceFilter =
  | "actionable"
  | "all"
  | "newbie"
  | "combination_gap";
```

- 默认选择 `actionable`。
- `actionable` 包含 `recommendations`、实际展示的 `incomplete_newbie`，以及 `state !== "complete"` 的组合。
- `newbie` 只显示新手目标；`newbie_section_status` 为 `complete` 或 `skipped_by_efficiency` 时保留现有解释。
- `combination_gap` 只显示 `needs_training`、`missing_core`、`missing_important`、`needs_review`。
- 已完成组合默认折叠成一行摘要，只有 `all` 筛选主动展开完整内容。
- 筛选使用现有 Tabs/Toggle primitive，按钮保持 44px 移动端触控高度，筛选变化通过 `role="status"` 报告结果数。

#### 技能查询

- `SkillQuery` 通过工作台上下文接收只读 `operbox`，匿名或示例状态继续展示完整公共技能库。
- 存在登录用户的个人 MAA/森空岛 BOX 时显示：
  - “仅看我拥有”：`OperBoxEntry.own === true`。
  - “仅看未解锁技能”：拥有干员但其当前精英化/等级未达到技能解锁条件。
- 未解锁判断只复用技能目录中的既有解锁要求与 BOX 练度，不推导新的技能效果。
- 个人筛选不写 URL、不写日志、不发送服务端；搜索词保持纯客户端状态。

#### 代码范围

- `src/components/pages/TrainingAdvice.tsx`
- `src/components/training-advice/presentation.ts` 及其测试
- `src/components/pages/SkillQuery.tsx`
- `src/components/skill-query/SkillResultRow.tsx`
- `src/workbench-context.tsx`
- `src/components/workbench/TrainingRoute.tsx`
- `src/app/(workbench)/skills/page.tsx`
- 新增 `src/components/skill-query/personal-filters.ts` 及单元测试

#### 验收

- 默认视图中已完成组合不会压过可行动建议。
- 四个练卡筛选的数量与内容互斥规则稳定，清空筛选后焦点不丢失。
- 匿名用户看不到个人筛选，且无需登录即可继续查询完整技能库。
- 个人筛选不会产生任何 API 请求或持久化个人搜索条件。

### 3.3 PR 2C：森空岛行动状态与当前进驻差异

#### 行为

- 侧栏和状态中心统一使用以下行动状态：
  - 已绑定且凭证有效：显示最近同步时间和“刷新状态”。
  - 已绑定但满七天：显示“重新扫码续期”。
  - 同步失败且有缓存：说明已保留上次成功数据，并提供重试。
  - 同步失败且无缓存：提供扫码或重试，不展示空白状态。
- 进入状态中心后，排班结果存在时先展示 `closestShift(shiftComparisons)`：
  - 最匹配班次。
  - 匹配率。
  - 需要替换、移入、移出的关键房间。
  - 无排班结果时显示“先生成排班”，不触发自动求解。
- 完整状态页在显式启用森空岛的 production 与 development 均可见；关闭构建继续不包含森空岛文案、URL 或 App Scheme。

#### 代码范围

- `src/skland-binding-state.ts`
- `src/skland.ts`
- `src/components/pages/DevelopmentSklandStatusCenter.tsx`
- `src/components/pages/SklandStatus.tsx`
- `src/components/layout/AppSidebar.tsx`
- `src/App.tsx` 中的状态适配移入独立 hook，避免页面组件继续承担协议恢复逻辑

#### 验收

- 所有入口对同一账号状态使用一致文案和主操作。
- Session 未确认或匿名时仍保持零 `/api/skland/*` 请求。
- `npm run test:production-client` 继续通过。

## 4. 第三阶段：性能、分段渲染与隐私友好的体验指标

第三阶段拆成性能 PR 和指标 PR；先建立测量，再调整预算，避免为了数字牺牲可恢复性或可访问性。

### 4.1 PR 3A：意图预加载、路由体积与长列表

#### 预加载策略

- 移除 `AppSidebar` 的无差别一级路由预取标记。
- 登录弹窗、设置弹窗和非当前业务页只在以下意图出现时预加载：
  - 鼠标 `pointerenter`。
  - 键盘 `focus`。
  - 触摸 `pointerdown`。
  - 完成当前前置步骤后预加载唯一下一步。
- 保留当前路由必要组件；不得用延迟加载制造点击后空白。
- 继续让 `CompactScheduleView`、xlsx、账号中心、森空岛完整状态和技能目录保持独立 chunk。

#### 体积报告

- 扩展 `scripts/check-bundle-budget.mjs`，同时输出各工作台路由 raw/gzip 字节、共享 chunk 和文档初始脚本数量。
- 新增 `npm run report:bundle`，读取 `.next/diagnostics/route-bundle-stats.json` 并输出稳定 JSON 到标准输出；CI 把结果写入 Job Summary，不提交 `.next` 或临时报告。
- 第一轮目标以实施前同一 Node 22、同一 lockfile、同一 production 环境测得的 `/` gzip 首路由为基线，降低至少 20%。
- 当前硬上限继续保留：根路由 raw JS 1,130,000 字节、文档初始 gzip JS 395,000 字节、初始 JS 文件不超过 18；只有基线报告稳定后才收紧上限，不允许放宽预算来通过 CI。

#### 分段渲染

- 技能查询沿用当前每批 10 条的 `LoadMore`，将头像和技能详情保持懒加载；新增个人筛选后每次筛选重置到首批。
- 练卡建议使用每批 12 条的分段渲染；已完成组合摘要不挂载成员明细，用户展开后再渲染。
- 只有当单页超过 200 行且 390px 实测 INP 仍超过 200ms 时才引入虚拟化；优先不新增依赖。
- 求解完成后只预加载当前班次首屏可见头像，其他房间头像继续使用原生 lazy loading。

#### 验收

- `/` 首路由 gzip 传输量比同环境基线下降至少 20%。
- 登录、设置、训练、技能和森空岛 chunk 不因空闲预取进入匿名首屏。
- 390px 中 200 条练卡数据和完整技能目录操作时无长时间主线程阻塞，键盘焦点和读屏顺序保持稳定。

### 4.2 PR 3B：显式选择的第一方聚合体验指标

#### 用户选择

- 首次成功生成个人方案后，在结果详情关闭后显示“帮助改进体验”开关，默认关闭。
- 选择只保存在本地键 `arknights-infra-experience-consent-v1`；清除本地数据时一并删除。
- 关闭开关后立即停止发送，不补发关闭期间的事件。
- 请求使用 `credentials: "omit"`，服务端不读取 Website Session，不创建访客标识。

#### 公共类型

在 `src/types.ts` 增加严格联合类型，所有事件带粗粒度视口 `small | medium | large`：

```ts
type ExperienceViewport = "small" | "medium" | "large";
type ExperienceDurationBucket =
  | "lt_1s"
  | "1_2_5s"
  | "2_5_5s"
  | "5_10s"
  | "10_30s"
  | "gte_30s";

type ExperienceEvent = { viewport: ExperienceViewport } & (
  | { name: "auth_gate_shown"; intent: "account" | "run" | "setup" | "skland" }
  | { name: "box_import_succeeded"; source: "maa_json" | "xlsx" | "skland" }
  | { name: "first_plan_started"; source: "maa" | "skland" }
  | { name: "first_plan_succeeded"; duration: ExperienceDurationBucket }
  | { name: "first_plan_failed"; code: AppErrorCode }
  | { name: "onboarding_completed" }
  | { name: "onboarding_skipped" }
  | { name: "web_vital"; metric: "LCP" | "INP" | "CLS"; rating: "good" | "needs_improvement" | "poor" }
);
```

耗时只允许以下区间，不上传毫秒值：

```text
lt_1s | 1_2_5s | 2_5_5s | 5_10s | 10_30s | gte_30s
```

Web Vitals 分桶固定为：

- LCP：`good <= 2500ms`，`needs_improvement <= 4000ms`，其余 `poor`。
- INP：`good <= 200ms`，`needs_improvement <= 500ms`，其余 `poor`。
- CLS：`good <= 0.1`，`needs_improvement <= 0.25`，其余 `poor`。

#### API 与存储

- 新增 `POST /api/experience-events`，使用 `ApiSuccess | ApiFailure` 信封和 `X-Request-Id`。
- 依次执行：同源校验、每 IP 每小时 120 次限流、4 KiB 正文限制、严格联合类型校验。
- 成功响应固定为 `{ accepted: true }`，不返回聚合值、数据库状态或内部路径。
- PostgreSQL 新增 `app.experience_daily`：
  - `day date`
  - `event text`
  - `dimension text`
  - `viewport text`
  - `count integer`
  - `(day, event, dimension, viewport)` 复合主键
- 每次写入只执行原子 `INSERT ... ON CONFLICT ... count = count + 1`，不保存事件时间、IP、requestId、账号、Session 或正文副本。
- `dimension` 由服务端从联合类型映射到固定字符串；拒绝额外字段、未知错误码和任意文本。
- `BETA_BUSINESS_DB_ENABLED` 关闭或数据库不可用时，验证后的请求仍返回 `accepted: true` 并静默放弃统计，不能影响排班主流程。
- 每个进程在 UTC 日期首次成功写入前删除 90 天以前的行；重复清理必须幂等，数据库维护脚本再提供独立清理入口。
- 日志继续只包含 requestId、code、route、status、durationMs，不记录 IP 或事件正文。

#### 客户端采集

- 新增 `src/experience-events.ts`，只暴露白名单事件函数和分桶函数。
- Web Vitals 使用浏览器 `PerformanceObserver`，不引入第三方 SDK；不支持的浏览器直接跳过。
- 页面隐藏时使用不带凭据的 `fetch(..., { keepalive: true })`；普通交互使用相同 API，不缓存失败事件。
- “首次”只由当前本地会话状态判定，不创建跨设备标识。

#### 测试

- 单元测试覆盖事件联合类型、额外字段拒绝、视口/耗时/Web Vitals 分桶和 consent 默认关闭。
- API 契约覆盖非法字段、未知错误码、4 KiB 超限、跨源、限流、数据库关闭降级和响应白名单。
- PostgreSQL 集成测试覆盖并发累加、复合主键、90 天边界和不含用户标识的 schema。
- E2E 验证未同意时零请求；同意后只发送白名单事件；关闭后停止；生产响应无内部字段。

## 5. 实施顺序与合并门槛

| 顺序 | PR | 依赖 | 合并门槛 |
| --- | --- | --- | --- |
| 1 | 2A 结果行动摘要 | 第一阶段 | DTO 不变；恢复与导出 E2E 通过 |
| 2 | 2B 练卡/技能筛选 | 2A 的工作台上下文 | 四类筛选、匿名技能库、个人数据不出浏览器 |
| 3 | 2C 森空岛行动状态 | 2A 的摘要模型 | dev 与显式开启的 production 可用；关闭构建隔离通过 |
| 4 | 3A 性能与分段渲染 | 第二阶段 UI 稳定 | gzip 基线可重复，首路由下降至少 20% |
| 5 | 3B 聚合体验指标 | 3A 的指标基线 | 默认关闭、无标识、API/数据库契约通过 |

每个 PR 至少运行：

```powershell
npm run check
npm run audit:security
npm run build
npm run test:production-client
npm run test:e2e
```

涉及数据库的 3B 还必须运行：

```powershell
npm run db:generate
npm run db:migrate
npm run test:auth-integration
```

涉及响应式交互的 2A、2B、2C、3A 必须覆盖 390px、768px、1440px，并断言 `scrollWidth <= clientWidth + 1`。3A 完成后补跑 WebKit；3B 在安全测试数据库验证迁移、受限运行账号 DML 和备份账号只读权限。

## 6. 发布、观测与回滚

### 发布

- 所有阶段先合并 `develop`，由现有范围感知工作流完成 development 发布。
- development 验收至少包含健康检查、Full E2、三班切换、MAA 下载、刷新恢复和最小反馈。
- 稳定后从最新 `main` 建迁移分支，以 `cherry-pick -x` 移植对应提交，不合并 develop-only 历史。

### 目标指标

- 匿名冷启动：一次 Better Auth Session 请求、零森空岛请求。
- 移动端：LCP < 2.5s、INP < 200ms、CLS < 0.1。
- `/` 首路由 gzip 传输量：相对 3A 实施前基线下降至少 20%。
- 体验指标：只有显式开启后产生每日聚合行，90 天以前数据自动删除。

### 回滚

- 2A、2B、2C 都只改变展示与客户端编排，可按 PR 单独回滚，不需要数据迁移。
- 3A 可回滚动态导入和预算配置；不得删除仍被旧 release 引用的静态资源。
- 3B 回滚顺序为先停止客户端发送，再下线 route，最后在确认无旧 release 写入后单独删除 `experience_daily`；常规前端回滚不删除表中数据。
- 任一阶段出现健康检查正常但真实 Full E2、MAA 导出或反馈失败时，回滚完整前端 release，不替换 CLI。

## 7. 外部依赖与凭据

- 不新增 npm 依赖或第三方账号。
- 继续使用现有 Next.js、React、PostgreSQL、Playwright 和浏览器 Performance APIs。
- 不需要新的 API key、Cookie 或服务端密钥。
- 3B 依赖现有 `DATABASE_URL`、`DATABASE_MIGRATION_URL` 和 `BETA_BUSINESS_DB_ENABLED`；这些值只存在部署环境，不进入代码、测试夹具或文档示例。

## 8. 完成定义

第二、三阶段只有在以下条件全部满足后才算完成：

- 用户可以从结果首屏理解产物、班次、关键调整并直接导出 MAA。
- 练卡页默认优先未完成行动，技能页的个人筛选不会影响匿名公共查询。
- 森空岛入口提供一致的续期、重试和差异行动；production 显式开启时保持完整能力，关闭构建继续完全隔离。
- 返回用户能看见最近方案的来源、时间和匹配状态，过期或不匹配数据不会静默覆盖当前工作区。
- 性能报告可在 Node 22 CI 重复生成，首路由 gzip 目标达成，长列表无明显交互阻塞。
- 体验统计默认关闭、可随时撤销、无稳定访客标识，只保留 90 天每日聚合计数。
- 完整质量门禁和 development 真实发布验收通过，未修改求解器或公共排班 DTO。
