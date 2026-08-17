#!/usr/bin/env bash
set -euo pipefail

readonly release_retention_count=3
readonly minimum_free_kib=$((3 * 1024 * 1024))
readonly helper_contract_version=1
# Temporary rollout bridge for the final byte-hash caller shared by both protected branches.
readonly legacy_caller_sha256="d04259fb3c4e37d2a0f04afab492834eb2537edc5a11acaa66dcf593b2af021b"

if [[ "${1:-}" == "--contract-version" ]]; then
  if (( $# != 1 )); then
    echo "--contract-version does not accept additional arguments." >&2
    exit 2
  fi
  printf '%s\n' "$helper_contract_version"
  exit 0
fi

if (( $# == 11 )); then
  if [[ "${11:-}" != "$legacy_caller_sha256" ]]; then
    echo "Legacy deployment caller hash is not allowlisted." >&2
    exit 2
  fi
elif (( $# != 10 )); then
  echo "Usage: $0 <environment> <release-sha> <archive-path> <app-root> <service> <run-user> <internal-port> <public-health-url> <debug-tools> <rate-limit>" >&2
  exit 2
fi

deployment_environment="${1:-}"
release_sha="${2:-}"
archive_path="${3:-}"
app_root="${4:-}"
service_name="${5:-}"
run_user="${6:-}"
internal_port="${7:-}"
public_health_url="${8:-}"
debug_tools_enabled="${9:-0}"
rate_limit_enabled="${10:-1}"

test_mode="${ARKNIGHTS_INFRA_DEPLOY_TEST_MODE:-0}"
test_root="${ARKNIGHTS_INFRA_DEPLOY_TEST_ROOT:-}"
test_fail_stage="${ARKNIGHTS_INFRA_DEPLOY_TEST_FAIL_STAGE:-none}"
test_available_kib="${ARKNIGHTS_INFRA_DEPLOY_TEST_AVAILABLE_KIB:-}"

fail_validation() {
  echo "$1" >&2
  exit 2
}

if [[ "$deployment_environment" != "production" && "$deployment_environment" != "development" ]]; then
  fail_validation "APP_DEPLOYMENT_ENV must be production or development."
fi
if [[ ! "$release_sha" =~ ^[0-9a-f]{40}$ ]]; then
  fail_validation "Release SHA must be a full Git commit hash."
fi
if [[ ! "$service_name" =~ ^arknights-infra(-[A-Za-z0-9_.@-]+)?$ ]]; then
  fail_validation "Invalid systemd service name."
fi
if [[ ! "$run_user" =~ ^[A-Za-z0-9_-]+$ || "$run_user" == "root" ]]; then
  fail_validation "Invalid runtime user."
fi
if [[ ! "$internal_port" =~ ^[0-9]{2,5}$ ]]; then
  fail_validation "Invalid internal port."
fi
if [[ ! "$debug_tools_enabled" =~ ^[01]$ || ! "$rate_limit_enabled" =~ ^[01]$ ]]; then
  fail_validation "Debug and rate-limit flags must be 0 or 1."
fi
for required_command in awk basename bash cat chmod cp cut date df dirname flock gzip install ln mkdir mv node readlink realpath rm sha256sum sleep sort tar tr; do
  command -v "$required_command" >/dev/null || fail_validation "Required command is unavailable: $required_command"
done

if [[ "$test_mode" == "1" ]]; then
  if [[ "$(realpath "$0")" == "/usr/local/sbin/arknights-infra-deploy" ]]; then
    fail_validation "The server-installed deployment runner cannot run in test mode."
  fi
  [[ -n "$test_root" && -d "$test_root" && ! -L "$test_root" ]] || fail_validation "Test root must be an existing real directory."
  test_root="$(realpath "$test_root")"
  case "$test_root" in
    /tmp/*) ;;
    *) fail_validation "Test mode requires an isolated directory below /tmp." ;;
  esac
  case "$test_fail_stage" in
    none|install|build|restart|internal-health|solver-version|solver-fingerprint|public-health) ;;
    *) fail_validation "Invalid test failure stage." ;;
  esac
  if [[ -n "$test_available_kib" && ! "$test_available_kib" =~ ^[0-9]+$ ]]; then
    fail_validation "Test available space must be an integer."
  fi
  if [[ "$deployment_environment" == "production" ]]; then
    expected_app_root="$test_root/opt/arknights-infra"
    expected_service="arknights-infra"
  else
    expected_app_root="$test_root/opt/arknights-infra-dev"
    expected_service="arknights-infra-dev"
  fi
  expected_archive_path="$test_root/tmp/arknights-infra-${deployment_environment}-${release_sha}.tar.gz"
elif [[ "$test_mode" == "0" ]]; then
  if [[ -n "${ARKNIGHTS_INFRA_DEPLOY_TEST_ROOT:-}${ARKNIGHTS_INFRA_DEPLOY_TEST_FAIL_STAGE:-}${ARKNIGHTS_INFRA_DEPLOY_TEST_AVAILABLE_KIB:-}" ]]; then
    fail_validation "Test overrides require ARKNIGHTS_INFRA_DEPLOY_TEST_MODE=1."
  fi
  if [[ "$deployment_environment" == "production" ]]; then
    expected_app_root="/opt/arknights-infra"
    expected_service="arknights-infra"
  else
    expected_app_root="/opt/arknights-infra-dev"
    expected_service="arknights-infra-dev"
  fi
  expected_archive_path="/tmp/arknights-infra-${deployment_environment}-${release_sha}.tar.gz"
  for required_command in chown curl runuser systemctl; do
    command -v "$required_command" >/dev/null || fail_validation "Required command is unavailable: $required_command"
  done
else
  fail_validation "ARKNIGHTS_INFRA_DEPLOY_TEST_MODE must be 0 or 1."
fi

if [[ "$app_root" != "$expected_app_root" || "$service_name" != "$expected_service" ]]; then
  fail_validation "Deployment root and service do not match the selected environment."
fi
if [[ "$archive_path" != "$expected_archive_path" ]]; then
  fail_validation "Release archive path does not match the verified commit."
fi
if [[ ! -f "$archive_path" || -L "$archive_path" ]]; then
  fail_validation "Release archive must be an existing regular file: $archive_path"
fi
if ! gzip -t "$archive_path"; then
  rm -f -- "$archive_path"
  fail_validation "Release archive failed gzip validation."
fi

cleanup_archive_only() {
  local status=$?
  rm -f -- "$archive_path"
  return "$status"
}
trap cleanup_archive_only EXIT

releases_root="$app_root/releases"
shared_root="$app_root/shared"
current_link="$app_root/current"
environment_marker="$shared_root/deployment-environment"
release_stamp="$(date -u +%Y%m%d%H%M%S)"
release_dir="$releases_root/${release_stamp}-${release_sha:0:12}"
next_link="$app_root/.current-${release_sha:0:12}"
previous_release=""
release_dir_created=0
deployment_succeeded=0

if [[ -e "$app_root" && ( ! -d "$app_root" || -L "$app_root" ) ]]; then
  fail_validation "Deployment root must be a real directory."
fi
install -d -m 0755 "$app_root"
exec 9>"$app_root/.deploy.lock"
flock 9

for protected_directory in "$releases_root" "$shared_root"; do
  if [[ -e "$protected_directory" && ( ! -d "$protected_directory" || -L "$protected_directory" ) ]]; then
    fail_validation "Deployment directories must be real directories: $protected_directory"
  fi
done
install -d -m 0755 "$releases_root" "$shared_root"
releases_root="$(realpath "$releases_root")"
shared_root="$(realpath "$shared_root")"

if [[ -e "$current_link" && ! -L "$current_link" ]]; then
  fail_validation "Refusing to replace a non-symlink current path: $current_link"
fi
if [[ -L "$current_link" ]]; then
  previous_release="$(readlink -f "$current_link")"
  if [[ -z "$previous_release" || ! -d "$previous_release" || -L "$previous_release" ]]; then
    fail_validation "Current release must resolve to a real directory."
  fi
  case "$previous_release" in
    "$releases_root"/*) ;;
    *) fail_validation "Current release points outside the configured releases directory." ;;
  esac
fi

if [[ -f "$environment_marker" ]]; then
  configured_environment="$(tr -d '[:space:]' < "$environment_marker")"
  if [[ "$configured_environment" != "$deployment_environment" ]]; then
    fail_validation "Deployment root belongs to $configured_environment, not $deployment_environment."
  fi
else
  printf '%s\n' "$deployment_environment" > "$environment_marker"
fi

managed_release_suffix() {
  local candidate_name
  candidate_name="$(basename "$1")"
  if [[ "$candidate_name" =~ ^[0-9]{14}-([0-9a-f]{7,12})$ ]]; then
    printf '%s\n' "${BASH_REMATCH[1]}"
    return 0
  fi
  return 1
}

safe_remove_release_dir() {
  local candidate="$1"
  local candidate_resolved candidate_parent
  [[ -d "$candidate" && ! -L "$candidate" ]] || return 1
  managed_release_suffix "$candidate" >/dev/null || return 1
  candidate_resolved="$(realpath "$candidate")" || return 1
  candidate_parent="$(dirname "$candidate_resolved")"
  [[ "$candidate_parent" == "$releases_root" ]] || return 1
  echo "Removing managed release: $candidate_resolved"
  rm -rf --one-file-system -- "$candidate_resolved"
}

validate_current_release_marker() {
  local suffix marker
  [[ -n "$previous_release" ]] || return 0
  suffix="$(managed_release_suffix "$previous_release")" || fail_validation "Current release has an unsupported directory name."
  [[ -f "$previous_release/.release-sha" && ! -L "$previous_release/.release-sha" ]] || fail_validation "Current release is missing its commit marker."
  [[ -d "$previous_release/.next" && ! -L "$previous_release/.next" ]] || fail_validation "Current release is missing its build output."
  [[ -f "$previous_release/.next/BUILD_ID" && ! -L "$previous_release/.next/BUILD_ID" ]] || fail_validation "Current release is missing its build completion marker."
  marker="$(tr -d '[:space:]' < "$previous_release/.release-sha")"
  if [[ ! "$marker" =~ ^[0-9a-f]{40}$ || "$marker" != "$suffix"* ]]; then
    fail_validation "Current release commit marker does not match its directory."
  fi
}

prune_releases() {
  local candidate suffix marker current_target=""
  local kept=0
  local -a complete_releases=()
  local -a sorted_releases=()

  if [[ -L "$current_link" ]]; then
    current_target="$(readlink -f "$current_link")"
  fi

  shopt -s nullglob
  for candidate in "$releases_root"/*; do
    if [[ -L "$candidate" ]]; then
      echo "Skipping symlink in releases directory: $candidate" >&2
      continue
    fi
    if [[ ! -d "$candidate" ]]; then
      echo "Skipping non-directory in releases directory: $candidate" >&2
      continue
    fi
    suffix="$(managed_release_suffix "$candidate" 2>/dev/null || true)"
    if [[ -z "$suffix" ]]; then
      echo "Skipping unrecognized release directory: $candidate" >&2
      continue
    fi
    if [[ "$candidate" == "$current_target" ]]; then
      complete_releases+=("$candidate")
      continue
    fi
    if [[ -L "$candidate/.release-sha" || -L "$candidate/.next" || -L "$candidate/.next/BUILD_ID" ]]; then
      echo "Skipping release with unsafe completion markers: $candidate" >&2
      continue
    fi
    if [[ ! -e "$candidate/.release-sha" || ! -e "$candidate/.next/BUILD_ID" ]]; then
      safe_remove_release_dir "$candidate" || fail_validation "Refusing to remove incomplete release: $candidate"
      continue
    fi
    if [[ ! -f "$candidate/.release-sha" || ! -d "$candidate/.next" || ! -f "$candidate/.next/BUILD_ID" ]]; then
      echo "Skipping release with unsafe completion marker types: $candidate" >&2
      continue
    fi
    marker="$(tr -d '[:space:]' < "$candidate/.release-sha")"
    if [[ ! "$marker" =~ ^[0-9a-f]{40}$ || "$marker" != "$suffix"* ]]; then
      echo "Skipping release with a mismatched commit marker: $candidate" >&2
      continue
    fi
    complete_releases+=("$candidate")
  done
  shopt -u nullglob

  if (( ${#complete_releases[@]} > 0 )); then
    mapfile -t sorted_releases < <(printf '%s\n' "${complete_releases[@]}" | sort -r)
  fi
  if [[ -n "$current_target" ]]; then
    kept=1
  fi
  for candidate in "${sorted_releases[@]}"; do
    if [[ "$candidate" == "$current_target" ]]; then
      continue
    fi
    if (( kept < release_retention_count )); then
      kept=$((kept + 1))
      continue
    fi
    safe_remove_release_dir "$candidate" || fail_validation "Refusing to prune release: $candidate"
  done
}

available_space_kib() {
  if [[ "$test_mode" == "1" && -n "$test_available_kib" ]]; then
    printf '%s\n' "$test_available_kib"
  else
    df -Pk "$app_root" | awk 'NR == 2 { print $4 }'
  fi
}

simulate_failure() {
  local stage="$1"
  if [[ "$test_mode" == "1" && "$test_fail_stage" == "$stage" ]]; then
    echo "Simulated deployment failure at stage: $stage" >&2
    return 1
  fi
  return 0
}

restart_service() {
  simulate_failure restart || return 1
  if [[ "$test_mode" == "1" ]]; then
    return 0
  fi
  systemctl restart "$service_name"
}

cleanup() {
  local status=$?
  local active_release=""
  set +e
  rm -f -- "$archive_path"
  if [[ -L "$next_link" ]]; then
    rm -f -- "$next_link"
  fi
  if (( release_dir_created == 1 && deployment_succeeded == 0 )); then
    if [[ -L "$current_link" ]]; then
      active_release="$(readlink -f "$current_link" 2>/dev/null || true)"
    fi
    if [[ "$active_release" != "$release_dir" && -d "$release_dir" && ! -L "$release_dir" ]]; then
      safe_remove_release_dir "$release_dir" || echo "Warning: failed release cleanup was skipped: $release_dir" >&2
    fi
  fi
  return "$status"
}
trap cleanup EXIT

validate_current_release_marker
prune_releases

available_kib="$(available_space_kib)"
if [[ ! "$available_kib" =~ ^[0-9]+$ ]]; then
  fail_validation "Unable to determine free deployment space."
fi
if (( available_kib < minimum_free_kib )); then
  echo "Deployment requires at least ${minimum_free_kib} KiB free after release pruning; only ${available_kib} KiB is available." >&2
  exit 1
fi

if [[ -e "$release_dir" || -L "$release_dir" ]]; then
  fail_validation "Refusing to reuse an existing release path: $release_dir"
fi
if [[ -e "$next_link" && ! -L "$next_link" ]]; then
  fail_validation "Refusing to replace a non-symlink next-release path: $next_link"
fi
if [[ -L "$next_link" ]]; then
  rm -f -- "$next_link"
fi

if [[ "$test_mode" == "1" ]]; then
  install -d -m 0750 "$release_dir"
  release_dir_created=1
  tar --no-same-owner --no-same-permissions -xzf "$archive_path" -C "$release_dir"
else
  install -d -m 0750 -o "$run_user" -g "$run_user" "$release_dir"
  release_dir_created=1
  runuser -u "$run_user" -- tar --no-same-owner --no-same-permissions -xzf "$archive_path" -C "$release_dir"
fi

solver_executable="$release_dir/bin/infra-cli"
if [[ ! -f "$solver_executable" || -L "$solver_executable" ]]; then
  fail_validation "Release is missing a regular Linux solver executable: bin/infra-cli"
fi
expected_solver_sha256="$(sha256sum "$solver_executable" | cut -d ' ' -f 1)"
if [[ ! "$expected_solver_sha256" =~ ^[0-9a-f]{64}$ ]]; then
  fail_validation "Unable to calculate the solver artifact SHA-256 digest."
fi

if [[ ! -f "$shared_root/.env.local" && -n "$previous_release" && -f "$previous_release/.env.local" ]]; then
  install -m 0600 "$previous_release/.env.local" "$shared_root/.env.local"
fi
if [[ -f "$shared_root/.env.local" ]]; then
  install -m 0600 "$shared_root/.env.local" "$release_dir/.env.local"
fi

has_complete_solver_data() {
  local data_root="$1"
  local required_file
  [[ -d "$data_root" && ! -L "$data_root" ]] || return 1
  for required_file in operator_instances.json skill_table.json base_systems.json training_advice_knowledge.json; do
    [[ -f "$data_root/$required_file" && ! -L "$data_root/$required_file" ]] || return 1
  done
}

if [[ ! -d "$shared_root/bin-data" \
  && -n "$previous_release" \
  && -d "$previous_release/bin/data" ]] \
  && has_complete_solver_data "$previous_release/bin/data"; then
  install -d -m 0755 "$shared_root/bin-data"
  cp -a "$previous_release/bin/data/." "$shared_root/bin-data/"
fi
if [[ -d "$shared_root/bin-data" ]] && has_complete_solver_data "$shared_root/bin-data"; then
  install -d -m 0755 "$release_dir/bin/data"
  cp -a "$shared_root/bin-data/." "$release_dir/bin/data/"
fi

skland_enabled="1"
if [[ "$deployment_environment" == "production" ]]; then
  skland_enabled="0"
  debug_tools_enabled="0"
  rate_limit_enabled="1"
fi
cat > "$release_dir/.env.production.local" <<EOF
APP_DEPLOYMENT_ENV=$deployment_environment
SKLAND_FEATURE_ENABLED=$skland_enabled
BETA_DEBUG_TOOLS_ENABLED=$debug_tools_enabled
BETA_RATE_LIMIT_ENABLED=$rate_limit_enabled
BETA_TRUST_PROXY_HEADERS=1
INFRA_CLI_EXPECTED_SHA256=$expected_solver_sha256
EOF

printf '%s\n' "$release_sha" > "$release_dir/.release-sha"
if [[ "$test_mode" == "0" ]]; then
  chown -R "$run_user:$run_user" "$release_dir"
fi

simulate_failure install
if [[ "$test_mode" == "1" ]]; then
  install -d "$release_dir/node_modules"
else
  runuser -u "$run_user" -- bash -lc "cd '$release_dir' && npm ci"
fi

simulate_failure build
if [[ "$test_mode" == "1" ]]; then
  install -d "$release_dir/.next"
  printf 'test-build\n' > "$release_dir/.next/BUILD_ID"
else
  runuser -u "$run_user" -- env \
    APP_DEPLOYMENT_ENV="$deployment_environment" \
    SKLAND_FEATURE_ENABLED="$skland_enabled" \
    bash -lc "cd '$release_dir' && npm run build"
fi

ln -s "$release_dir" "$next_link"
mv -Tf "$next_link" "$current_link"

rollback() {
  if [[ -z "$previous_release" || ! -d "$previous_release" ]]; then
    echo "Deployment failed and no previous release is available for rollback." >&2
    return 1
  fi
  ln -s "$previous_release" "$next_link"
  mv -Tf "$next_link" "$current_link"
  if ! restart_service; then
    echo "Rollback restored the previous release link but failed to restart $service_name." >&2
    return 1
  fi
  echo "Rolled back to $previous_release" >&2
}

if ! restart_service; then
  rollback || true
  exit 1
fi

health_url="http://127.0.0.1:${internal_port}/api/health"
health_body=""
if [[ "$test_mode" == "1" ]]; then
  if simulate_failure internal-health \
    && simulate_failure solver-version \
    && simulate_failure solver-fingerprint; then
    if [[ "$deployment_environment" == "production" ]]; then
      health_body='{"success":true,"data":{"plannerReady":true}}'
    else
      health_body='{"success":true,"data":{"plannerReady":true,"skland":{"available":true}}}'
    fi
  else
    health_body='{"success":false,"data":{"plannerReady":false}}'
  fi
else
  for _ in {1..30}; do
    if health_body="$(curl -fsS --max-time 3 "$health_url" 2>/dev/null)"; then
      break
    fi
    sleep 1
  done
fi

if ! printf '%s' "$health_body" | node -e '
  let input = "";
  process.stdin.on("data", (chunk) => input += chunk);
  process.stdin.on("end", () => {
    const body = JSON.parse(input);
    if (body?.success !== true || body?.data?.plannerReady !== true) process.exit(1);
    const expected = process.argv[1];
    const hasSkland = Object.prototype.hasOwnProperty.call(body.data, "skland");
    if ((expected === "production" && hasSkland) || (expected === "development" && !hasSkland)) process.exit(1);
  });
' "$deployment_environment"; then
  echo "Internal health verification failed: $health_url" >&2
  rollback || true
  exit 1
fi

if [[ -n "$public_health_url" ]]; then
  if [[ "$test_mode" == "1" ]]; then
    if ! simulate_failure public-health; then
      echo "Public health verification failed: $public_health_url" >&2
      rollback || true
      exit 1
    fi
  elif ! curl -fsS --max-time 10 "$public_health_url" >/dev/null; then
    echo "Public health verification failed: $public_health_url" >&2
    rollback || true
    exit 1
  fi
fi

if [[ "$test_mode" == "0" ]] && ! systemctl enable "$service_name"; then
  rollback || true
  exit 1
fi
deployment_succeeded=1
prune_releases
echo "Deployed $release_sha to $deployment_environment at $release_dir"
