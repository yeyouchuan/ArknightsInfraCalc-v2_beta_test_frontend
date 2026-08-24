# 更新线上求解器

本页只描述“当前 release 内单独替换求解器”的高风险例外流程。Windows/Linux 制品差异、协议版本与两个 hash 的长期语义、完整运行数据要求和正常 develop→main 发布顺序见[开发与发布维护准则](./DEVELOPMENT_RELEASE_GUARDRAILS.md)。

当前线上环境：

- SSH：`root@114.66.55.78`
- 应用软链：`/opt/arknights-infra/current`
- 求解器：`/opt/arknights-infra/current/bin/infra-cli`
- 内部 Next 端口：`4175`
- Funnel 回环 nginx：`127.0.0.1:4176`
- 直连/IP 兼容 nginx：`0.0.0.0:4174`（受 Host 限制，不是发布健康检查入口）
- 服务：`arknights-infra`
- 持久化目录：`/var/lib/arknights-infra`

## 当前仓库制品基线

- 求解器提交：`960b2e4b128978167502d578803e22d192c3e985`
- 构建主机：本地 Linux x86-64（隔离临时目录，不覆盖线上 CLI）
- 工具链：`rustc 1.96.0`、`cargo 1.96.0`、`cargo build --release -p infra-cli --locked`
- 构建与验证时间：`2026-08-17T10:21:53Z`
- `bin/infra-cli` SHA-256：`ae517578b464c60abe54ace71429373f84fc7c795560cc179d3b366bf2ef4610`
- 最低观测到的运行时上界：最高引用 `GLIBC_2.34`；发布前仍以目标服务器真实执行为准

构建时间只作审计记录，不参与兼容性或构建身份判定。以后更新仓库制品时，必须同步更新本节、
运行 `npm run test:solver-contract`，并确认 Worker 自报的 executable hash 与文件 SHA-256 相同。

## 1. 准备并上传 Linux 版求解器

在本地或构建机准备 Linux 版 `infra-cli`。不要上传 Windows 版
`infra-cli.exe`。

先记录本地文件哈希：

```bash
sha256sum ./infra-cli
```

上传到服务器临时路径：

```bash
scp ./infra-cli root@114.66.55.78:/root/infra-cli.new
```

## 2. 原子替换并重启服务

登录服务器：

```bash
ssh root@114.66.55.78
```

执行以下命令。脚本会同时备份当前求解器和 release 内部环境文件，计算新制品
SHA-256，并把它写入 `INFRA_CLI_EXPECTED_SHA256`。如果服务重启或健康检查失败，
求解器与预期指纹会一起恢复。

```bash
set -euo pipefail

app_root=/opt/arknights-infra
app_link="$app_root/current"
app=$(readlink -f -- "$app_link")
new_cli=/root/infra-cli.new
installed_cli="$app/bin/infra-cli"
env_file="$app/.env.production.local"
ts=$(date +%Y%m%d%H%M%S)
backup_root="$app_root/solver-backups"
install -d -o root -g root -m 0700 "$backup_root"
backup_dir=$(mktemp -d "$backup_root/update-$ts.XXXXXX")
chmod 0700 "$backup_dir"
backup="$backup_dir/infra-cli"
env_backup="$backup_dir/.env.production.local"
staged="$backup_dir/infra-cli.staged"
env_staged="$backup_dir/.env.production.local.staged"
health_file="$backup_dir/health.json"

test -L "$app_link"
case "$app" in
  "$app_root"/releases/*) ;;
  *) echo "current 指向了 release 根目录之外：$app" >&2; exit 1 ;;
esac
test -f "$new_cli"
test -f "$installed_cli"
test -f "$env_file"
test ! -L "$installed_cli"
test ! -L "$env_file"

# infra-cli 会自动发现可执行文件旁的 bin/data。只要存在任一外部核心数据文件，
# 就必须整套匹配当前 Worker；半套旧数据会覆盖内置数据并使 plan.compute 失败。
runtime_data="$app/bin/data"
runtime_data_files=(operator_instances.json skill_table.json base_systems.json training_advice_knowledge.json)
runtime_data_present=0
runtime_data_complete=1
if [[ -L "$runtime_data" ]]; then
  runtime_data_present=1
  runtime_data_complete=0
elif [[ -d "$runtime_data" ]] \
  && [[ -n "$(find "$runtime_data" -mindepth 1 -maxdepth 1 ! -name baked -print -quit)" ]]; then
  runtime_data_present=1
fi
for required_file in "${runtime_data_files[@]}"; do
  if [[ ! -f "$runtime_data/$required_file" || -L "$runtime_data/$required_file" ]]; then
    runtime_data_complete=0
  fi
done
if [[ "$runtime_data_present" -eq 1 && "$runtime_data_complete" -ne 1 ]]; then
  echo "bin/data 是不完整的旧数据集；请改走完整前端 release，或先成套更新 Worker 数据文件。" >&2
  exit 1
fi

echo "Uploaded solver:"
sha256sum "$new_cli"
expected_solver_sha256=$(sha256sum "$new_cli" | cut -d ' ' -f 1)
printf '%s\n' "$expected_solver_sha256" | grep -Eq '^[0-9a-f]{64}$'

# release 目录由应用用户持有；用应用用户权限读取，由 root 在私有目录创建普通文件，
# 避免 root 对可竞争替换的源路径执行 cp/重定向并跟随特权符号链接。
runuser -u arkinfra -- cat -- "$installed_cli" > "$backup"
chmod 0700 "$backup"
test -f "$backup"
test ! -L "$backup"
test "$(stat -c '%u:%g' "$backup")" = "0:0"
test "$(od -An -tx1 -N4 "$backup" | tr -d ' \n')" = "7f454c46"
echo "Current solver backup:"
sha256sum "$backup"
# 环境文件属于应用用户；始终以该用户权限读取，避免 root 跟随其可控链接读取特权文件。
runuser -u arkinfra -- cat -- "$env_file" > "$env_backup"
chmod 0600 "$env_backup"
test -f "$env_backup"
test ! -L "$env_backup"
test "$(stat -c '%u:%g' "$env_backup")" = "0:0"
install -o arkinfra -g arkinfra -m 0755 "$new_cli" "$staged"

runuser -u arkinfra -- awk -v hash="$expected_solver_sha256" '
  BEGIN { written = 0 }
  /^INFRA_CLI_EXPECTED_SHA256=/ {
    print "INFRA_CLI_EXPECTED_SHA256=" hash
    written = 1
    next
  }
  { print }
  END {
    if (!written) print "INFRA_CLI_EXPECTED_SHA256=" hash
  }
' "$env_file" > "$env_staged"
chown arkinfra:arkinfra "$env_staged"
chmod 0600 "$env_staged"

restore_previous() {
  test -f "$backup" && test ! -L "$backup"
  test -f "$env_backup" && test ! -L "$env_backup"
  test "$(stat -c '%u:%g' "$backup")" = "0:0"
  test "$(stat -c '%u:%g' "$env_backup")" = "0:0"
  test "$(od -An -tx1 -N4 "$backup" | tr -d ' \n')" = "7f454c46"
  install -o arkinfra -g arkinfra -m 0755 "$backup" "$backup_dir/infra-cli.restore"
  install -o arkinfra -g arkinfra -m 0600 "$env_backup" "$backup_dir/env.restore"
  mv -Tf "$backup_dir/infra-cli.restore" "$installed_cli"
  mv -Tf "$backup_dir/env.restore" "$env_file"
}

mv -Tf "$staged" "$installed_cli"
mv -Tf "$env_staged" "$env_file"

# 该 CLI 暂无 --help 子命令；无参数启动会打印 Usage 并返回非零。
# 替换后、重启前以服务用户探测；失败时立即成套恢复。
cli_probe=$(runuser -u arkinfra -- "$installed_cli" 2>&1 || true)
if ! printf '%s\n' "$cli_probe" | grep -q '^Usage:'; then
  restore_previous
  echo "新求解器启动探测失败，已恢复：$backup_dir" >&2
  exit 1
fi

if ! systemctl restart arknights-infra; then
  restore_previous
  if systemctl restart arknights-infra; then
    echo "服务重启失败，已恢复旧求解器和预期指纹：$backup_dir" >&2
  else
    echo "已恢复旧文件，但服务仍无法启动；请保留现场并检查 journal：$backup_dir" >&2
  fi
  exit 1
fi

healthy=false
for _ in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:4175/api/health >"$health_file" \
    && node -e '
      const fs = require("node:fs");
      const body = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
      if (body?.success !== true || body?.data?.plannerReady !== true) process.exit(1);
    ' "$health_file"; then
    healthy=true
    break
  fi
  sleep 1
done

if [ "$healthy" != true ]; then
  restore_previous
  if systemctl restart arknights-infra; then
    echo "健康检查失败，已恢复旧求解器和预期指纹：$backup_dir" >&2
  else
    echo "健康检查失败且恢复后服务仍无法启动；请保留现场并检查 journal：$backup_dir" >&2
  fi
  exit 1
fi

echo "Installed solver:"
sha256sum "$installed_cli"
cat "$health_file"
echo "root-only 回滚备份：$backup_dir"
```

## 3. 发布后验证

确认服务、内部端口和公网入口：

```bash
systemctl is-active arknights-infra
ss -ltnp 'sport = :4175'
curl -fsS http://127.0.0.1:4175/api/health
curl -fsS \
  -H 'Host: riic.autos' \
  -H 'X-Forwarded-Proto: https' \
  http://127.0.0.1:4176/api/health
journalctl -u arknights-infra -n 80 --no-pager
```

健康结果至少应满足：

- `success: true`
- `data.status` 为 `ready`
- `data.plannerReady` 为 `true`
- `data.features`只包含安全 feature flags

公共 `/api/health`不得返回 `cliPath`、PID、候选 CLI、仓库路径、存储路径或原始 `serveError`。求解器进程与契约问题应通过 systemd journal 和真实 Full E2 请求定位：

```bash
journalctl -u arknights-infra -n 120 --no-pager
```

内部健康检查只用 `protocol_version=1` 与 `plan_schema_version=1` 判断协议兼容性，
并将 Worker 自报的 `solver_executable_sha256` 与部署写入的预期制品指纹对账。
`plan_contract_sha256` 仅进入私有运行记录和反馈归因，不参与路由或健康判定；
因此 schema 文件的 LF/CRLF 字节差异不会触发 legacy。

然后在 production 公网 HTTPS `https://riic.autos/` 载入 Full E2 并生成一次排班，
确认 `infra-cli serve` 的真实调用链正常。若前端仍可通过 legacy 模式完成求解，则不应仅为切换内部协议而绕过核心仓库测试门禁更新二进制。

## 4. 手动回滚

如果需要回滚到指定备份：

```bash
set -euo pipefail

app_root=/opt/arknights-infra
app=$(readlink -f -- "$app_root/current")
backup_dir="$app_root/solver-backups/update-<timestamp>.<random>"
backup="$backup_dir/infra-cli"
env_backup="$backup_dir/.env.production.local"

case "$app" in "$app_root"/releases/*) ;; *) exit 1 ;; esac
test -f "$backup"
test -f "$env_backup"
test ! -L "$backup"
test ! -L "$env_backup"
test "$(stat -c '%u:%g' "$backup")" = "0:0"
test "$(stat -c '%u:%g' "$env_backup")" = "0:0"
test "$(od -An -tx1 -N4 "$backup" | tr -d ' \n')" = "7f454c46"
test ! -L "$app/bin/infra-cli"
test ! -L "$app/.env.production.local"
install -o arkinfra -g arkinfra -m 0755 "$backup" "$backup_dir/infra-cli.restore"
install -o arkinfra -g arkinfra -m 0600 "$env_backup" "$backup_dir/env.restore"
mv -Tf "$backup_dir/infra-cli.restore" "$app/bin/infra-cli"
mv -Tf "$backup_dir/env.restore" "$app/.env.production.local"
systemctl restart arknights-infra
curl -fsS http://127.0.0.1:4175/api/health | node -e '
  let input = "";
  process.stdin.on("data", chunk => input += chunk);
  process.stdin.on("end", () => {
    const body = JSON.parse(input);
    if (body?.success !== true || body?.data?.plannerReady !== true) process.exit(1);
  });
'
```

## 5. 避免被下次前端发布覆盖

服务器上的替换只影响当前 release。下次从仓库发布前端时，部署包里的
`bin/infra-cli` 可能覆盖它。确认新求解器稳定后，还应把同一 Linux 二进制
更新到本仓库的 `bin/infra-cli`，通过 PR 合并后再发布一次前端。
