#!/usr/bin/env bash
set -euo pipefail

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
helper="$repository_root/scripts/deploy-release.sh"
test_root="$(mktemp -d)"
trap 'rm -rf -- "$test_root"' EXIT

test "$(bash "$helper" --contract-version)" = "1"
legacy_caller_sha256="d04259fb3c4e37d2a0f04afab492834eb2537edc5a11acaa66dcf593b2af021b"

current_sha="1111111111111111111111111111111111111111"
previous_sha="2222222222222222222222222222222222222222"
older_sha="3333333333333333333333333333333333333333"
oldest_sha="4444444444444444444444444444444444444444"
new_sha="9999999999999999999999999999999999999999"

create_complete_release() {
  local root="$1"
  local name="$2"
  local sha="$3"
  mkdir -p "$root/releases/$name/.next"
  printf '%s\n' "$sha" > "$root/releases/$name/.release-sha"
  printf 'completed\n' > "$root/releases/$name/.next/BUILD_ID"
  printf '%s\n' "$name" > "$root/releases/$name/content.txt"
}

setup_fixture() {
  local fixture_name="$1"
  deployment_environment="${2:-development}"
  active_fixture="$fixture_name"
  fixture_root="$test_root/$fixture_name"
  if [[ "$deployment_environment" == "production" ]]; then
    app_root="$fixture_root/opt/arknights-infra"
    service_name="arknights-infra"
    internal_port="4175"
    persistent_root="$fixture_root/var/lib/arknights-infra"
  else
    app_root="$fixture_root/opt/arknights-infra-dev"
    service_name="arknights-infra-dev"
    internal_port="4275"
    persistent_root="$fixture_root/var/lib/arknights-infra-dev"
  fi
  releases_root="$app_root/releases"
  shared_root="$app_root/shared"
  archive_root="$fixture_root/tmp"
  current_release="$releases_root/20000104000000-111111111111"
  previous_release="$releases_root/20000103000000-2222222"
  older_release="$releases_root/20000102000000-333333333333"
  oldest_release="$releases_root/20000101000000-4444444"
  incomplete_release="$releases_root/19991231000000-5555555"
  invalid_release="$releases_root/19991230000000-6666666"
  symlink_release="$releases_root/19991229000000-7777777"
  unknown_release="$releases_root/operator-notes"
  archive_path="$archive_root/arknights-infra-${deployment_environment}-${new_sha}.tar.gz"

  mkdir -p "$releases_root" "$shared_root/bin-data" "$archive_root" "$fixture_root/payload/bin" "$fixture_root/outside" "$persistent_root"
  create_complete_release "$app_root" "$(basename "$current_release")" "$current_sha"
  create_complete_release "$app_root" "$(basename "$previous_release")" "$previous_sha"
  create_complete_release "$app_root" "$(basename "$older_release")" "$older_sha"
  create_complete_release "$app_root" "$(basename "$oldest_release")" "$oldest_sha"
  mkdir "$incomplete_release" "$invalid_release" "$unknown_release"
  mkdir "$invalid_release/.next"
  printf '%s\n' "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" > "$invalid_release/.release-sha"
  printf 'completed\n' > "$invalid_release/.next/BUILD_ID"
  ln -s "$fixture_root/outside" "$symlink_release"
  ln -s "$current_release" "$app_root/current"
  printf '%s\n' "$deployment_environment" > "$shared_root/deployment-environment"
  printf 'keep-authorization\n' > "$shared_root/authorization-state"
  printf '{}\n' > "$shared_root/bin-data/operator_instances.json"
  printf '{}\n' > "$shared_root/bin-data/skill_table.json"
  printf '{}\n' > "$shared_root/bin-data/base_systems.json"
  printf 'keep-persistent-data\n' > "$persistent_root/state"
  printf '{"name":"deploy-fixture","private":true}\n' > "$fixture_root/payload/package.json"
  printf 'test solver artifact\n' > "$fixture_root/payload/bin/infra-cli"
  expected_fixture_solver_sha256="$(sha256sum "$fixture_root/payload/bin/infra-cli" | cut -d ' ' -f 1)"
  tar -czf "$archive_path" -C "$fixture_root/payload" .
}

enable_auth_hooks() {
  printf '%s\n' \
    '{"name":"deploy-fixture","private":true,"scripts":{"db:migrate":"test-migration","auth:check":"test-readiness"}}' \
    > "$fixture_root/payload/package.json"
  tar -czf "$archive_path" -C "$fixture_root/payload" .
}

enable_incomplete_auth_hooks() {
  printf '%s\n' \
    '{"name":"deploy-fixture","private":true,"scripts":{"db:migrate":"test-migration"}}' \
    > "$fixture_root/payload/package.json"
  tar -czf "$archive_path" -C "$fixture_root/payload" .
}

run_deploy() {
  local legacy_hash="${4:-}"
  local -a legacy_arg=()
  if [[ -n "$legacy_hash" ]]; then
    legacy_arg=("$legacy_hash")
  fi
  env \
    ARKNIGHTS_INFRA_DEPLOY_TEST_MODE=1 \
    ARKNIGHTS_INFRA_DEPLOY_TEST_ROOT="$fixture_root" \
    ARKNIGHTS_INFRA_DEPLOY_TEST_FAIL_STAGE="${1:-none}" \
    ARKNIGHTS_INFRA_DEPLOY_TEST_AVAILABLE_KIB="${2:-4194304}" \
    bash "$helper" \
      "$deployment_environment" \
      "$new_sha" \
      "$archive_path" \
      "$app_root" \
      "$service_name" \
      test-runner \
      "$internal_port" \
      "${3:-}" \
      1 \
      1 \
      "${legacy_arg[@]}"
}

assert_failure() {
  local expected_stage="$1"
  local available_kib="${2:-4194304}"
  local public_url="${3:-}"
  local legacy_hash="${4:-}"
  set +e
  run_deploy "$expected_stage" "$available_kib" "$public_url" "$legacy_hash" >/dev/null 2>&1
  actual_status=$?
  set -e
  if [[ "$actual_status" -eq 0 ]]; then
    echo "Expected deployment failure for $active_fixture at stage $expected_stage." >&2
    exit 1
  fi
}

count_valid_releases() {
  local candidate suffix marker count=0
  shopt -s nullglob
  for candidate in "$releases_root"/*; do
    [[ -d "$candidate" && ! -L "$candidate" ]] || continue
    if [[ "$(basename "$candidate")" =~ ^[0-9]{14}-([0-9a-f]{7,12})$ ]]; then
      suffix="${BASH_REMATCH[1]}"
    else
      continue
    fi
    [[ -f "$candidate/.release-sha" && ! -L "$candidate/.release-sha" ]] || continue
    [[ -d "$candidate/.next" && ! -L "$candidate/.next" ]] || continue
    [[ -f "$candidate/.next/BUILD_ID" && ! -L "$candidate/.next/BUILD_ID" ]] || continue
    marker="$(tr -d '[:space:]' < "$candidate/.release-sha")"
    if [[ "$marker" =~ ^[0-9a-f]{40}$ && "$marker" == "$suffix"* ]]; then
      count=$((count + 1))
    fi
  done
  shopt -u nullglob
  printf '%s\n' "$count"
}

assert_fixture_safety() {
  test -f "$shared_root/authorization-state"
  test "$(cat "$shared_root/authorization-state")" = "keep-authorization"
  test -f "$persistent_root/state"
  test "$(cat "$persistent_root/state")" = "keep-persistent-data"
  test -d "$invalid_release"
  test -L "$symlink_release"
  test -d "$unknown_release"
}

set +e
bash "$helper" --contract-version unexpected >/dev/null 2>&1
invalid_contract_query_status=$?
bash "$helper" development >/dev/null 2>&1
invalid_argument_count_status=$?
set -e
test "$invalid_contract_query_status" -eq 2
test "$invalid_argument_count_status" -eq 2

setup_fixture legacy-caller
run_deploy none 4194304 "" "$legacy_caller_sha256"
test "$(cat "$app_root/current/.release-sha")" = "$new_sha"

setup_fixture unknown-legacy-caller
assert_failure none 4194304 "" "${legacy_caller_sha256%?}0"
test "$(readlink -f "$app_root/current")" = "$current_release"

setup_fixture success
legacy_release_output="$(run_deploy none 4194304)"
grep -q 'Skipping authentication database hooks for a legacy release without either script' <<<"$legacy_release_output"
test "$(cat "$app_root/current/.release-sha")" = "$new_sha"
test "$(count_valid_releases)" -eq 3
test ! -e "$incomplete_release"
test ! -e "$oldest_release"
test ! -e "$older_release"
test ! -e "$archive_path"
test "$(awk -F= '$1 == "INFRA_CLI_EXPECTED_SHA256" { print $2 }' "$app_root/current/.env.production.local")" = "$expected_fixture_solver_sha256"
test "$(awk -F= '$1 == "SKLAND_FEATURE_ENABLED" { print $2 }' "$app_root/current/.env.production.local")" = "1"
if [[ "$(awk -F= '$1 == "BETA_TRUST_PROXY_HEADERS" { print $2 }' "$app_root/current/.env.production.local")" != "1" ]]; then
  echo "Deploy must enable trusted proxy headers for per-client rate limiting." >&2
  exit 1
fi
test ! -e "$app_root/current/bin/data"
test -f "$shared_root/bin-data/operator_instances.json"
assert_fixture_safety

setup_fixture development-skland-disabled
printf 'SKLAND_FEATURE_ENABLED=0\n' > "$shared_root/.env.local"
run_deploy none 4194304
test "$(awk -F= '$1 == "SKLAND_FEATURE_ENABLED" { print $2 }' "$app_root/current/.env.production.local")" = "0"
assert_fixture_safety

setup_fixture production-skland-fails-closed production
run_deploy none 4194304
test "$(awk -F= '$1 == "APP_DEPLOYMENT_ENV" { print $2 }' "$app_root/current/.env.production.local")" = "production"
test "$(awk -F= '$1 == "SKLAND_FEATURE_ENABLED" { print $2 }' "$app_root/current/.env.production.local")" = "0"
test "$(awk -F= '$1 == "BETA_DEBUG_TOOLS_ENABLED" { print $2 }' "$app_root/current/.env.production.local")" = "0"
test "$(awk -F= '$1 == "BETA_RATE_LIMIT_ENABLED" { print $2 }' "$app_root/current/.env.production.local")" = "1"
assert_fixture_safety

setup_fixture production-skland-enabled production
printf 'SKLAND_FEATURE_ENABLED=1\n' > "$shared_root/.env.local"
run_deploy none 4194304
test "$(awk -F= '$1 == "SKLAND_FEATURE_ENABLED" { print $2 }' "$app_root/current/.env.production.local")" = "1"
assert_fixture_safety

setup_fixture invalid-skland-flag production
printf 'SKLAND_FEATURE_ENABLED=yes\n' > "$shared_root/.env.local"
assert_failure none
test "$(readlink -f "$app_root/current")" = "$current_release"
assert_fixture_safety

setup_fixture duplicate-skland-flag production
printf 'SKLAND_FEATURE_ENABLED=1\nSKLAND_FEATURE_ENABLED=0\n' > "$shared_root/.env.local"
assert_failure none
test "$(readlink -f "$app_root/current")" = "$current_release"
assert_fixture_safety

setup_fixture auth-hooks-success
enable_auth_hooks
auth_release_output="$(run_deploy none 4194304)"
grep -q 'Authentication database migration and readiness hooks completed' <<<"$auth_release_output"
test "$(cat "$app_root/current/.release-sha")" = "$new_sha"
assert_fixture_safety

setup_fixture complete-runtime-data
printf '{}\n' > "$shared_root/bin-data/training_advice_knowledge.json"
run_deploy none 4194304
test -f "$app_root/current/bin/data/operator_instances.json"
test -f "$app_root/current/bin/data/skill_table.json"
test -f "$app_root/current/bin/data/base_systems.json"
test -f "$app_root/current/bin/data/training_advice_knowledge.json"
assert_fixture_safety

setup_fixture symlink-runtime-data
rm -f -- "$shared_root/bin-data/operator_instances.json" \
  "$shared_root/bin-data/skill_table.json" \
  "$shared_root/bin-data/base_systems.json"
ln -s "$fixture_root/outside" "$shared_root/bin-data/operator_instances.json"
ln -s "$fixture_root/outside" "$shared_root/bin-data/skill_table.json"
ln -s "$fixture_root/outside" "$shared_root/bin-data/base_systems.json"
ln -s "$fixture_root/outside" "$shared_root/bin-data/training_advice_knowledge.json"
run_deploy none 4194304
test ! -e "$app_root/current/bin/data"
assert_fixture_safety

setup_fixture build-failure
assert_failure build
test "$(readlink -f "$app_root/current")" = "$current_release"
test "$(count_valid_releases)" -eq 3
test -z "$(find "$releases_root" -mindepth 1 -maxdepth 1 -type d -name "*-${new_sha:0:12}" -print -quit)"
test ! -e "$archive_path"
assert_fixture_safety

setup_fixture migration-failure
enable_auth_hooks
assert_failure migration
test "$(readlink -f "$app_root/current")" = "$current_release"
test "$(count_valid_releases)" -eq 3
test -z "$(find "$releases_root" -mindepth 1 -maxdepth 1 -type d -name "*-${new_sha:0:12}" -print -quit)"
test ! -e "$archive_path"
assert_fixture_safety

setup_fixture auth-readiness-failure
enable_auth_hooks
assert_failure auth-readiness
test "$(readlink -f "$app_root/current")" = "$current_release"
test "$(count_valid_releases)" -eq 3
test -z "$(find "$releases_root" -mindepth 1 -maxdepth 1 -type d -name "*-${new_sha:0:12}" -print -quit)"
test ! -e "$archive_path"
assert_fixture_safety

setup_fixture incomplete-auth-hooks
enable_incomplete_auth_hooks
assert_failure none
test "$(readlink -f "$app_root/current")" = "$current_release"
test "$(count_valid_releases)" -eq 3
test -z "$(find "$releases_root" -mindepth 1 -maxdepth 1 -type d -name "*-${new_sha:0:12}" -print -quit)"
test ! -e "$archive_path"
assert_fixture_safety

setup_fixture extraction-failure
tar -cf "$fixture_root/corrupt.tar" -C "$fixture_root/payload" .
printf X | dd of="$fixture_root/corrupt.tar" bs=1 seek=0 count=1 conv=notrunc status=none
gzip -n < "$fixture_root/corrupt.tar" > "$archive_path"
assert_failure none
test "$(readlink -f "$app_root/current")" = "$current_release"
test "$(count_valid_releases)" -eq 3
test -z "$(find "$releases_root" -mindepth 1 -maxdepth 1 -type d -name "*-${new_sha:0:12}" -print -quit)"
test ! -e "$archive_path"
assert_fixture_safety

setup_fixture health-failure
assert_failure internal-health
test "$(readlink -f "$app_root/current")" = "$current_release"
test "$(count_valid_releases)" -eq 3
test -z "$(find "$releases_root" -mindepth 1 -maxdepth 1 -type d -name "*-${new_sha:0:12}" -print -quit)"
test ! -e "$archive_path"
assert_fixture_safety

setup_fixture solver-version-mismatch
assert_failure solver-version
test "$(readlink -f "$app_root/current")" = "$current_release"
test -z "$(find "$releases_root" -mindepth 1 -maxdepth 1 -type d -name "*-${new_sha:0:12}" -print -quit)"
test ! -e "$archive_path"
assert_fixture_safety

setup_fixture solver-fingerprint-mismatch
assert_failure solver-fingerprint
test "$(readlink -f "$app_root/current")" = "$current_release"
test -z "$(find "$releases_root" -mindepth 1 -maxdepth 1 -type d -name "*-${new_sha:0:12}" -print -quit)"
test ! -e "$archive_path"
assert_fixture_safety

setup_fixture restart-failure
assert_failure restart
test "$(readlink -f "$app_root/current")" = "$current_release"
test "$(count_valid_releases)" -eq 3
test -z "$(find "$releases_root" -mindepth 1 -maxdepth 1 -type d -name "*-${new_sha:0:12}" -print -quit)"
test ! -e "$archive_path"
assert_fixture_safety

setup_fixture public-health-failure
assert_failure public-health 4194304 https://example.invalid/api/health
test "$(readlink -f "$app_root/current")" = "$current_release"
test "$(count_valid_releases)" -eq 3
test -z "$(find "$releases_root" -mindepth 1 -maxdepth 1 -type d -name "*-${new_sha:0:12}" -print -quit)"
test ! -e "$archive_path"
assert_fixture_safety

setup_fixture low-space
assert_failure none 1024
test "$(readlink -f "$app_root/current")" = "$current_release"
test "$(count_valid_releases)" -eq 3
test -z "$(find "$releases_root" -mindepth 1 -maxdepth 1 -type d -name "*-${new_sha:0:12}" -print -quit)"
test ! -e "$archive_path"
assert_fixture_safety

echo "Release deployment integration tests passed."
