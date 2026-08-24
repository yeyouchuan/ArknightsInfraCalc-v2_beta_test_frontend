# 跨平台开发与发布维护准则

本文记录需要长期保持的工程结论和背后的原因。每次任务必须执行的精简规则以仓库根目录的 [`AGENTS.md`](../AGENTS.md) 为准；本文用于解释 Windows/Linux 差异、求解器身份、固定部署 helper 和双分支发布为什么要这样维护。

## 1. 四种身份不要混用

| 身份 | 当前来源 | 用途 | 不应用于 |
| --- | --- | --- | --- |
| 协议版本 | Worker `ping.protocol_version` | 判断前端是否理解 Worker 通信协议 | 标识某个二进制制品 |
| 排班 schema 版本 | Worker `ping.plan_schema_version` 与 `plan.compute.schema_version` | 判断 `plan.compute` 请求/响应结构是否兼容 | 比较 schema 文件原始字节 |
| 契约指纹 | Worker `ping.plan_contract_sha256` | 私有诊断、反馈归因和发布审计 | 运行时路由或 LF/CRLF 兼容性判断 |
| 可执行文件指纹 | 文件 SHA-256 与 Worker `ping.solver_executable_sha256` | 确认部署运行的是预期 Linux 制品 | 替代协议版本判断 |

运行时只在协议版本和排班 schema 版本均受支持时使用 `plan.compute`。契约指纹缺失或不同不会触发 legacy；真正缺失或不兼容的版本才会回退旧 `plan`。部署健康检查更严格：版本必须兼容，且 Worker 自报的可执行文件指纹必须与 release 中 `bin/infra-cli` 的 SHA-256 一致。

构建日期、构建主机和 Rust 版本是审计信息，不是兼容身份。不要再把 schema 文件的原始字节 hash 硬编码到前端。

## 2. Windows 与 Linux 的固定差异

### 文本与行尾

- 仓库文本统一使用 UTF-8、LF 和文件末尾换行；`.gitattributes`决定 Git 索引规则，`.editorconfig`帮助编辑器在保存前保持一致。
- Windows 开发机在本仓库使用 `core.autocrlf=false`、`core.eol=lf`。修改后用 `git ls-files --eol`检查索引，用 `git diff --check`检查空白错误。
- LF/CRLF 是文件表示差异，不等于协议版本变化。不得通过放宽协议校验来解决行尾问题，也不得用原始 schema hash 选择求解路径。
- JSON、shell、YAML、TypeScript 和 Markdown 可以归一化为 LF；ELF、PE、图片、字体等二进制文件必须由 `.gitattributes`标为 binary，禁止文本转换。

### 可执行文件与文件系统

- `bin/infra-cli` 是 Linux x86-64 ELF；`bin/infra-cli.exe` 才是 Windows PE。两个平台不能交叉执行，文件名相同也不代表制品兼容。
- Linux 发布依赖 Git 中的 executable bit。Windows 的 `core.filemode=false`会隐藏本地权限噪声，但修改 shell 或 CLI 后仍要在 Linux/CI 检查模式位。
- Linux 路径区分大小写，并真实支持符号链接；Windows 默认行为不同。新增或改名时必须检查大小写冲突，部署脚本不能把 Windows 上的路径解析结果当作 Linux 事实。
- 前端日常命令可以在 PowerShell 运行；`scripts/*.sh` 的发布测试应在 Linux CI 或明确指定的 WSL Ubuntu 中运行。Windows 的裸 `bash`可能命中默认 Docker WSL、Git Bash 或其他 shim，不能把它当成稳定运行环境。
- 在 Windows 调用 WSL 时显式指定发行版，例如 `wsl.exe -d Ubuntu -- bash -lc '<command>'`。该发行版需要自己的 Node.js 22 和 GNU 工具；Windows 的 Node 安装不等于 WSL 已安装 Node。

## 3. 求解器更新是一个原子制品集合

更新 Worker 时需要同时核对：

1. 固定的核心仓库完整 commit SHA；
2. 由该提交构建的 Linux `bin/infra-cli`；
3. Worker 所需的完整外部运行数据（如果 release 使用 `bin/data`）；
4. 同一提交自带且合法的 Full E2 fixture；
5. 文件 SHA-256、Worker 自报 executable hash 和 `INFRA_CLI_EXPECTED_SHA256`；
6. `protocol_version=1`、`plan_schema_version=1`、真实 `plan.compute` 三班结果；
7. 前端 health、MAA 下载、反馈私有元数据和公开字段泄露检查。

当前 Worker 的外部数据最小完整集是：

```text
operator_instances.json
skill_table.json
base_systems.json
training_advice_knowledge.json
```

只要 `bin/data` 存在任一外部核心数据文件，就必须成套匹配当前 Worker。不完整的旧数据会优先覆盖内置数据，可能导致 health 正常但真实 `plan.compute` 失败。自动发布只在 `shared/bin-data`完整时注入；不完整目录保留作人工审计，但不得覆盖 release 自带数据。

只更新线上 CLI 的特殊流程见 [`UPDATE_SOLVER.md`](./UPDATE_SOLVER.md)。稳定后仍要把同一制品合入仓库，否则下一次完整前端发布会恢复仓库版本。

## 4. 固定部署 helper 使用显式契约版本

服务器固定文件：

```text
/usr/local/sbin/arknights-infra-prepare-release
/usr/local/sbin/arknights-infra-deploy
```

两个脚本都支持：

```bash
<helper> --contract-version
```

当前契约版本均为 `1`。`Deploy verified branch`在准备 release 前检查：

- 文件是普通文件而不是符号链接；
- 所有者是 `root:root`，模式是 `0755`；
- `--contract-version`与工作流期望值一致；
- 文件 SHA-256 可读取并写入 Actions summary，作为审计记录。

工作流不再要求 helper 与当前分支脚本逐字节相同。这样 `main`和`develop`可以运行内容不同但调用接口兼容的实现，不需要在两次部署之间手工切换固定脚本。安全边界来自 root 所有权、不可由部署用户修改、显式接口版本和输入校验，不来自分支脚本的字节相等。

契约 v1 还包含一次性迁移桥：在 main/develop 都切换到版本握手之前，只接受迁移时两条受保护分支最后一版工作流的精确脚本 SHA 参数；任意其他 legacy hash 都拒绝。该桥只用于先安装新 helper 后保持旧工作流可回滚，不是长期扩展点。两条分支迁移完成并跨过既定回滚窗口后，应单独移除 allowlist 与兼容参数，并保持契约版本`1`（删除已不再使用的兼容入口不改变新调用接口）。

### 何时保持版本，何时升级

- 只修复内部实现、错误信息、缓存策略或安全检查，且参数、退出码和副作用保持兼容：保持当前契约版本。
- 改变参数数量/顺序、路径约定、退出码语义、权限模型或工作流依赖的输出：升级对应 helper 契约版本。
- 不允许为了让部署变绿而只修改工作流期望值、跳过所有权检查或删除版本检查。

### 契约升级顺序

1. 在功能分支成套修改 helper、工作流、集成测试和文档。
2. 让 PR 的完整 `Frontend quality` 门禁通过；此时不要合并，因为旧服务器 helper 可能不理解新契约。
3. 计算已评审提交中两个脚本的 SHA-256，准备 root-only 备份。
4. 以 root 在服务器私有临时目录暂存，验证 LF、语法、`--contract-version`和文件 hash，再原子安装为 `root:root 0755`普通文件。
5. 用部署用户只读复核 owner/mode/version/hash；失败立即恢复两个 helper，不能只恢复其中一个。
6. 合并 develop，验证 development；再把同一提交移植到 main。只要两边期望同一契约，期间不再切换 helper。

helper 的精确 SHA-256 仍应在安装和回滚时记录，但不参与每个分支的日常握手。

## 5. 路径感知门禁必须失败关闭

`Frontend quality`不在 workflow 触发器上使用`paths-ignore`。每个 PR 和受保护分支 push 都先运行`Change scope`，从可靠的 base/head commit 生成 NUL 分隔路径列表，并由`scripts/ci-change-scope.mjs`输出 Core、Chromium 和 deploy 判定。这样`quality`这个稳定的受保护检查名始终存在，不会因整个 workflow 未创建而永久等待。

分类只对明确白名单放行：

| 范围 | Core | Chromium | Deploy |
| --- | --- | --- | --- |
| `docs/**`、根目录 Markdown、`.gitignore`、`.editorconfig`、LICENSE | 跳过 | 跳过 | 跳过 |
| 单元测试、非发布型`.github/**`和分类器自身 | 执行 | 跳过 | 跳过 |
| `e2e/**`或 Playwright 配置 | 执行 | 执行 | 跳过 |
| `frontend-quality.yml`或`deploy.yml` | 执行 | 跳过 | 受保护分支 push 执行 |
| 其他任何路径 | 执行 | 执行 | 受保护分支 push 执行 |

混合变更按其中最高风险处理。`.gitattributes`会改变归档、行尾或 executable bit 语义，因此不属于元数据快路径。未知路径、空差异、零 before SHA、缺失 commit 和手动触发全部回退完整门禁；不能为了加速而扩大模糊白名单。`quality`必须同时核对`Change scope`成功、选中 Job 为`success`、未选中 Job 为`skipped`。发布仍要求 push、`quality`成功和`deploy_required=true`三者同时成立。

修改分类规则时必须成套更新分类器单测、`scripts/build-tooling.test.mjs`、工作流与本节文档。新增运行时目录或构建输入默认先按完整范围处理，只有能证明不会进入 Next build、服务端运行、CLI、数据库、公共资源或部署包语义时才能加入快路径。

## 6. develop 到 main 的发布顺序

当前策略是先在 `develop`验证，再把本任务提交用 `cherry-pick -x`移植到最新 `main`；不要为一个修复合并 develop 的其他提交。

```mermaid
flowchart LR
  F["功能分支"] --> P1["PR 到 develop"]
  P1 --> Q1["范围感知 quality 门禁"]
  Q1 --> D["运行时变更自动发布 development"]
  D --> S["真实 Full E2 / MAA / 反馈冒烟"]
  S --> C["从最新 main cherry-pick -x"]
  C --> P2["PR 到 main"]
  P2 --> Q2["范围感知 quality 门禁"]
  Q2 --> R["运行时变更自动发布 production"]
  R --> A["生产验收"]
```

每次移植前后检查 `git log --left-right`和 PR 文件列表，确认没有 develop-only 提交。长期应安排独立任务收敛 main/develop 分叉；日常修复不应顺手完成大规模分支合并。

文档、测试和非发布型 CI 变更通过`quality`后不会创建 release，也不需要服务器冒烟；一旦分类要求 deploy，仍必须完成图中的真实环境验证。

## 7. 健康检查不是发布完成

自动 health 只证明进程、协议版本、制品指纹和公开 readiness 达标。每次求解器、协议、部署脚本或运行数据变更后，还要验证：

- `current`和 `.release-sha`指向预期完整 SHA，systemd active 且没有重启循环；
- 内部端口和对应 Nginx 入口返回成功信封，`plannerReady:true`；
- production 强制 `debugTools:false`、`rateLimit:true`；森空岛访问面必须与显式`SKLAND_FEATURE_ENABLED`构建开关一致；
- Full E2 真实产生三班，刷新可恢复，并能下载 MAA；
- 最小反馈成功，运行记录与反馈 `meta.json.solver`使用同一私有 observation；
- 公共 health/plan/feedback 递归不含 hash、CLI 路径、PID、stdout/stderr 或 debug 对象；
- `/var/lib`持久化目录仍由正确用户拥有；每个环境最多保留当前 release 和两个回滚版本，剩余空间至少 3 GiB。

如果 health 通过但 Full E2 或反馈失败，回滚整个前端 release，不要只替换 CLI。代码、预期指纹、Worker 和 fixture 必须保持成套。

## 8. 凭据与运维边界

- GitHub Actions 只使用专用 `arkdeploy`密钥、known_hosts 和最小 sudo 规则；不要把 root 私钥、密码或临时构建密钥写入仓库、命令历史或 Actions。
- 临时 root 构建公钥完成任务后应从 `authorized_keys`移除或收紧来源/命令限制；删除前先确认自动部署使用的是独立 key。
- root 不直接信任应用用户可写 release 中的符号链接。手动求解器更新继续使用 `runuser -u arkinfra -- cat`读取应用文件，由 root 在私有目录创建普通备份并在恢复前重新验证。
- `shared`和`/var/lib`从不进入 release 淘汰范围；任何清理都必须单独授权、先只读确认精确目标。

## 9. 后续治理清单

以下是独立改进项，不是普通功能 PR 的顺手改动：

- 规划 main/develop 的一次受控收敛，减少长期 cherry-pick 冲突。
- 为 deployment、Worker 重启循环、`plannerReady`和磁盘空间增加持续监控与告警。
- 将 Linux 求解器构建升级为可复现、带 commit/toolchain/hash 证明的 CI 制品流程。
- 定期审计服务器 `authorized_keys`、sudoers、固定 helper hash 和所有权。
- 在确认没有回滚依赖后，单独清理不完整的旧 `shared/bin-data`和过期 root-only 备份。
- 若进入 schema 治理下一阶段，先在核心仓库定义机器可读版本迁移政策；不要重新引入前端原始字节 hash 路由。
