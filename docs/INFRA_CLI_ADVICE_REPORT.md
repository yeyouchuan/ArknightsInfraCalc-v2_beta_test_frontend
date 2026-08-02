# `infra-cli advice` 输出评估

## 结论

`infra-cli advice` 的结构化报告适合未来替换当前简化练卡页，但当前版本不能原样暴露给浏览器，也不应把 `--answer` 生成的 Markdown 当作前端数据源。

推荐的接入前提是：核心 Worker 增加内联 `advice.compute`，Next 新增受保护的 `/api/advice`，并在公开 DTO mapper 中移除路径、证据原文和 RAG 输入。前端只消费白名单化后的业务字段，直接渲染“现在可练 / 获取后可练 / 暂缓体系 / 已达标 / 待复核”五个分区。

本文基于核心仓库 `ArknightsInfraCalc-v2` 的官方 `main@8f2c20cc6feaf150f30ae1f4404c55701fd7c1dc`、实际 CLI 输出和仓库内五组 training-advice fixtures 整理。

## 命令形式

```text
infra-cli advice --operbox <path.json> [--rules <path.json>] [--pretty]
infra-cli advice --operbox <path.json> [--rules <path.json>] --explain [--pretty]
infra-cli advice --operbox <path.json> [--rules <path.json>] --answer
```

参数行为：

- `--operbox`：必需，读取账号干员数据文件。
- `--rules`：可选，覆盖默认 `data/training_recommendations.json`。
- `--pretty`：格式化 JSON；不能和 `--answer` 同时使用。
- `--explain`：返回报告以及供受约束生成使用的 RAG 输入。
- `--answer`：返回确定性中文 Markdown；不能和 `--explain` 同时使用。

当前 `infra-cli serve` 没有 `advice.compute`。因此调用 Advice 只能启动一次性 CLI，并把 operbox 作为文件路径传入。

## 默认结构化报告

默认输出是 `TrainingAdviceReport`，当前 `schema_version` 为 `2`。

| 字段 | 类型 | 含义 | 前端建议 |
| --- | --- | --- | --- |
| `schema_version` | number | Advice 报告协议版本 | 必须校验，只接受已知版本 |
| `operbox_label` | string | 输入 Box 的展示标签；当前 CLI 实际写入文件路径 | 不应直接公开，改用服务端生成的安全标签 |
| `summary` | object | 账号与建议数量汇总 | 可用于页头统计 |
| `now` | `OperatorAdviceItem[]` | 当前拥有且现在可直接培养 | 主结果区 |
| `conditional` | `OperatorAdviceItem[]` | 获取干员后可培养 | 条件建议区 |
| `blocked` | `BlockedRuleReport[]` | 核心条件不满足、当前应暂缓的体系 | 体系级卡片，不应按普通干员卡渲染 |
| `ready` | `OperatorAdviceItem[]` | 已达到目标练度 | 默认折叠或作为完成区 |
| `review` | `OperatorAdviceItem[]` | 规则仍需人工复核 | 必须明确标记为非确定建议 |
| `source_refs` | `EvidenceRef[]` | 报告涉及的证据来源 | 当前包含路径，不进入默认公共 DTO |

### `summary`

```ts
type TrainingAdviceSummary = {
  owned: number;
  modelled_owned: number;
  now_count: number;
  conditional_count: number;
  blocked_count: number;
  review_count: number;
};
```

- `owned`：Box 中已拥有干员数量。
- `modelled_owned`：当前规则和实例数据能够建模的已拥有干员数量。
- `now_count`、`conditional_count`、`blocked_count`、`review_count`：对应分区数量。
- 当前 summary 没有 `ready_count`；如果前端需要，应由公开 mapper 使用 `ready.length` 生成，而不是猜测或依赖 Markdown。

### `OperatorAdviceItem`

`now`、`conditional`、`ready`、`review` 使用同一结构：

```ts
type OperatorAdviceItem = {
  operator: string;
  action: "train" | "acquire_then_train" | "ready" | "blocked" | "review";
  display_priority: "P0" | "P1" | "P2" | "Info";
  current?: { elite: number; level?: number };
  target: { elite: number; level?: number };
  matches: RuleMatch[];
  source_refs: EvidenceRef[];
  needs_review: boolean;
};
```

字段说明：

- `operator`：干员名。
- `action`：前端应依据它决定 CTA 和状态文案，不应从自然语言推断。
- `display_priority`：合并全部命中规则后用于排序和展示的优先级。
- `current`：当前练度；未拥有干员通常省略。
- `target`：目标精英阶段和可选等级。
- `matches`：该干员命中的所有规则，不只是最高优先级规则。
- `needs_review`：存在待复核规则时为 true；UI 不能把它包装为确定结论。

建议的前端优先级映射：

| Advice | 产品显示 | 用途 |
| --- | --- | --- |
| `P0` | 高 | 核心或立即收益明显的动作 |
| `P1` | 中 | 重要成员或稳定提升 |
| `P2` | 低 | 次要补强，可默认收起 |
| `Info` | 信息 | 状态说明，不作为培养催促 |

### `RuleMatch`

```ts
type RuleMatch = {
  rule_id: string;
  kind: "system" | "combo" | "standalone" | "soft_combo";
  label: string;
  role: "core" | "important" | "hanger" | "independent";
  priority: "P0" | "P1" | "P2" | "Info";
  target: { elite: number; level?: number };
  benefit?: {
    facility?: string;
    product?: string;
    efficiency_tier?: string;
    note?: string;
  };
  source_refs: EvidenceRef[];
  needs_review: boolean;
  plan_note?: string;
};
```

它提供：

- 规则 ID、类型和展示名称；
- 干员在体系中的角色；
- 单条规则要求的目标练度与优先级；
- 可选设施、产品、收益层级和补充说明；
- 条件计划，例如核心组尚需多少成员；
- 证据来源和人工复核状态。

一个干员可能同时命中多条规则。前端可以在主卡显示 `display_priority` 和聚合目标，在详情中列出全部 `matches`，但不能只保留第一条规则。

### `blocked`

`blocked` 描述的是体系未准入，不是单个干员的培养动作：

```ts
type BlockedRuleReport = {
  rule_id: string;
  kind: "system" | "combo" | "standalone" | "soft_combo";
  label: string;
  missing_core: string[];
  missing_core_groups?: Array<{
    label: string;
    required_count: number;
    owned: string[];
    candidates: string[];
  }>;
  owned_core: string[];
  deferred_members: string[];
  conditional_acquire: string[];
  source_refs: EvidenceRef[];
  needs_review: boolean;
};
```

- `missing_core`：必须拥有但当前缺失的固定核心。
- `missing_core_groups`：N 选 M 核心组，包含要求人数、已拥有成员和候选成员。
- `owned_core`：已经满足的核心条件。
- `deferred_members`：虽然已经拥有，但体系未准入前建议暂缓培养的成员。
- `conditional_acquire`：满足获取策略、可作为条件建议展示的缺失成员。
- `needs_review`：为 true 时只能放入“待复核”，不能写成“确定缺核心”。

## `--explain` 输出

`--explain` 返回：

```ts
type TrainingAdviceBundle = {
  report: TrainingAdviceReport;
  rag_input: {
    schema_version: 1;
    fact_skeleton: TrainingAdviceFact[];
    evidence_snippets: EvidenceSnippet[];
    unavailable_source_refs: EvidenceRef[];
    guardrails: string[];
  };
};
```

### `fact_skeleton`

把结构化报告转换为可供生成模型使用的事实句，每条包括：

- `action`
- 可选 `operator`
- 可选 `rule_id`
- 可选 `priority`
- 确定性 `text`
- `source_refs`

它不会引入报告之外的新干员，但仍可能携带证据路径。

### `evidence_snippets`

包含：

- `source_ref.path`
- 可选 `source_ref.heading`
- 最多约 1600 字符的 Markdown `excerpt`

证据原文适合服务端审核或受约束生成，不适合默认下发浏览器。它可能包含内部规则文本、仓库结构或未来不希望公开的内容。

### `unavailable_source_refs`

记录无法读取的来源。绝对路径、越出核心仓库工作区的路径和无法读取的 Markdown 都会进入这里，因此它可能暴露本地或 vault 路径。

### `guardrails`

当前生成护栏固定为：

1. 不得新增 report 中不存在的干员。
2. 不得修改 action、target 或 display_priority。
3. 不得把 conditional 表述为当前可直接培养。
4. 不得把 blocked 或 review 表述为已成立的确定事实。

这些护栏适合留在服务端生成链路，不需要作为普通产品数据返回。

## `--answer` 输出

`--answer` 输出确定性中文 Markdown，包含：

- 账号标签；
- 当前可练、获取后可练、暂缓体系、待复核和已达标数量；
- 五个对应标题；
- 由事实骨架渲染的项目列表。

它适合 CLI 用户直接阅读，但不适合作为前端数据源：

- 标题和句子是展示文本，不是稳定 DTO；
- 前端无法可靠恢复完整 `matches`、收益和阻塞核心组；
- 账号标签当前是输入文件路径；
- 解析 Markdown 会在后端文案调整时产生隐式破坏。

## 实际 fixture 输出摘要

以下数字来自 `main@8f2c20c` 的五组仓库 fixture，仅用于确认字段和分区行为，不代表真实账号的常见分布：

| Fixture | owned / modelled | now | conditional | blocked | ready | review |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `all_ready` | 14 / 14 | 0 | 24 | 2 | 10 | 0 |
| `closure_partial` | 2 / 2 | 0 | 26 | 1 | 1 | 0 |
| `standalone_e1_four_star` | 15 / 15 | 13 | 14 | 1 | 2 | 0 |
| `witch_only_tequila` | 1 / 1 | 0 | 26 | 1 | 0 | 0 |
| `witch_ready_untrained` | 3 / 3 | 3 | 26 | 0 | 0 | 0 |

对 `standalone_e1_four_star` 使用 `--explain` 时，实测得到 30 条事实、2 段可读取证据、2 个不可读取来源和 4 条护栏。`--answer` 对同一输入生成五个固定分区的中文 Markdown。

## 为什么当前不能直接接入前端

### 1. Worker 没有内联方法

当前 `serve` 只提供排班相关方法，没有 `advice.compute`。Next 若直接调用 Advice，就需要为每次请求启动一次性进程、写临时 Box 文件并传路径，和现有长驻 Worker 架构不一致。

### 2. 路径属于内部数据

当前 `operbox_label` 使用 operbox 文件路径，`source_refs.path`、`unavailable_source_refs` 也可能包含绝对路径或外部 vault 路径。它们不能进入公共 API、浏览器存储、反馈或日志。

### 3. `--explain` 不是普通业务 DTO

证据片段和 RAG 护栏是服务端生成上下文。直接下发会扩大公开边界，并让浏览器承担不必要的证据读取和安全判断。

### 4. 推荐范围有限

当前规则主要考虑：

- 是否拥有干员；
- 精英阶段与等级；
- 干员稀有度和获取策略；
- 基建体系、组合与成员角色。

当前不考虑：

- 用户选择的 243/153/252 等布局；
- 当前制造配方、贸易订单和无人机策略；
- 龙门币、经验、芯片等培养资源成本；
- 技能专精和模组投入；
- 战斗培养价值或关卡需求；
- 当前排班结果的边际收益排序。

因此产品文案必须明确这是“基建规则练卡建议”，不能包装为账号完整培养规划。

## 推荐的公共接入方案

### 核心 Worker

新增内联方法：

```text
advice.compute
```

输入建议只包含：

- `schema_version`
- 内联 operbox
- 服务端生成的安全展示标签
- 可选、受枚举约束的规则版本

不要允许浏览器提交任意规则文件路径或证据路径。

### Next API

新增：

```text
POST /api/advice
```

保持和 `/api/plan` 相同的边界：

- 统一 `ApiSuccess | ApiFailure` envelope；
- 同源校验、大小限制、限流和 requestId；
- 严格公共 DTO mapper；
- 生产响应不包含路径、证据原文、RAG 输入、command、stdout/stderr 或原始 Worker 对象；
- 浏览器持久化只保存确有产品价值且经过清理的业务数据。

建议的默认公共数据：

- 安全 summary，包括由服务端补出的 `ready_count`；
- `now / conditional / blocked / ready / review`；
- 干员、action、优先级、当前/目标练度；
- 去路径化的规则 ID、名称、角色、收益和条件计划；
- `needs_review`。

默认不公开：

- `operbox_label` 原值；
- `source_refs.path`；
- `evidence_snippets`；
- `unavailable_source_refs`；
- `rag_input`；
- `--answer` 文本。

### 前端展示

| 分区 | 建议行为 |
| --- | --- |
| 现在可练 | 按 P0 → P1 → P2 排序，显示当前 → 目标和全部命中体系 |
| 获取后可练 | 明确“未拥有”，把获取作为条件而不是立即培养 CTA |
| 暂缓体系 | 显示缺失核心、N 选 M 核心组和建议暂缓成员 |
| 已达标 | 默认折叠，作为账号完成度反馈 |
| 待复核 | 使用中性警示，明确规则尚未确认 |

前端不应复制推荐规则、重新计算 action、解析 `--answer`，或把 `blocked` 推导成强制培养顺序。

## 验收标准

未来接入至少需要覆盖：

- 五个结果分区和空状态；
- P0/P1/P2/Info 排序与样式；
- 已拥有、未拥有、已达标和待复核状态；
- 多规则命中与目标聚合；
- 固定核心和 N 选 M 核心组；
- 路径、证据、RAG、命令和调试字段不进入公共响应；
- 损坏 schema、Worker 超时、规则版本不支持和空 Box 的错误恢复；
- 390px、768px、1440px 以及键盘焦点与 live region；
- 公开 DTO 契约测试和真实 Worker 冒烟。
