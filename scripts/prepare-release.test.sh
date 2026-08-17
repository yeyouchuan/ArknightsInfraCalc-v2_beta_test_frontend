#!/usr/bin/env bash
set -euo pipefail

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
helper="$repository_root/scripts/prepare-release.sh"
test_root="$(mktemp -d)"
trap 'rm -rf -- "$test_root"' EXIT

test "$("$helper" --contract-version)" = "1"
legacy_develop_caller_sha256="0ab06ae9b1b7d535c6958e84fd06484a05a35975bca1be1dd17031d5de72fec3"
legacy_main_caller_sha256="e6fc105b477d86242aba400d0001d6c9a42b75f0d9c7af2a9fc3d633d691848d"

source_repository="$test_root/source"
origin_repository="$test_root/origin.git"
if command -v cygpath >/dev/null 2>&1; then
  origin_repository="$(cygpath -m "$origin_repository")"
fi
seed_release="$test_root/seed-release"
cache_root="$test_root/cache"

git init -b main "$source_repository" >/dev/null
git -C "$source_repository" config user.name "Deploy Test"
git -C "$source_repository" config user.email "deploy-test@example.invalid"
mkdir -p "$source_repository/public/images" "$source_repository/src"
dd if=/dev/zero of="$source_repository/public/images/removed-before-seed.bin" bs=1024 count=256 status=none
git -C "$source_repository" add .
git -C "$source_repository" commit -m "seed parent" >/dev/null
removed_parent_blob="$(git -C "$source_repository" rev-parse 'HEAD:public/images/removed-before-seed.bin')"
rm "$source_repository/public/images/removed-before-seed.bin"
dd if=/dev/zero of="$source_repository/public/images/unchanged.bin" bs=1024 count=512 status=none
printf 'first\n' > "$source_repository/src/current.txt"
printf 'remove me\n' > "$source_repository/src/remove.txt"
git -C "$source_repository" add .
git -C "$source_repository" commit -m "seed" >/dev/null
seed_sha="$(git -C "$source_repository" rev-parse HEAD)"
seed_tree="$(git -C "$source_repository" rev-parse 'HEAD^{tree}')"

git clone --bare "$source_repository" "$origin_repository" >/dev/null 2>&1
git --git-dir="$origin_repository" config uploadpack.allowFilter true
mkdir -p "$seed_release" "$cache_root"
git -C "$source_repository" archive "$seed_sha" | tar -x -C "$seed_release"
printf 'modified by a production build\n' > "$seed_release/src/current.txt"

run_helper() {
  local environment="$1"
  local sha="$2"
  local tree="$3"
  local archive="$4"
  shift 4
  env \
    ARKNIGHTS_INFRA_PREPARE_TEST_MODE=1 \
    ARKNIGHTS_INFRA_PREPARE_TEST_ROOT="$test_root" \
    ARKNIGHTS_INFRA_PREPARE_TEST_REPOSITORY_URL="$origin_repository" \
    ARKNIGHTS_INFRA_PREPARE_TEST_CACHE_ROOT="$cache_root" \
    ARKNIGHTS_INFRA_PREPARE_TEST_RETRY_DELAY_SECONDS=0 \
    "$@" \
    "$helper" "$environment" "$sha" "$tree" "$archive"
}

run_helper_with_bundle() {
  local environment="$1"
  local sha="$2"
  local tree="$3"
  local archive="$4"
  local bundle="$5"
  shift 5
  env \
    ARKNIGHTS_INFRA_PREPARE_TEST_MODE=1 \
    ARKNIGHTS_INFRA_PREPARE_TEST_ROOT="$test_root" \
    ARKNIGHTS_INFRA_PREPARE_TEST_REPOSITORY_URL="$origin_repository" \
    ARKNIGHTS_INFRA_PREPARE_TEST_CACHE_ROOT="$cache_root" \
    ARKNIGHTS_INFRA_PREPARE_TEST_RETRY_DELAY_SECONDS=0 \
    "$@" \
    "$helper" "$environment" "$sha" "$tree" "$archive" "$bundle"
}

run_legacy_helper() {
  local caller_sha256="$1"
  local environment="$2"
  local sha="$3"
  local tree="$4"
  local archive="$5"
  shift 5
  env \
    ARKNIGHTS_INFRA_PREPARE_TEST_MODE=1 \
    ARKNIGHTS_INFRA_PREPARE_TEST_ROOT="$test_root" \
    ARKNIGHTS_INFRA_PREPARE_TEST_REPOSITORY_URL="$origin_repository" \
    ARKNIGHTS_INFRA_PREPARE_TEST_CACHE_ROOT="$cache_root" \
    ARKNIGHTS_INFRA_PREPARE_TEST_RETRY_DELAY_SECONDS=0 \
    "$@" \
    "$helper" "$environment" "$sha" "$tree" "$archive" "$caller_sha256"
}

run_legacy_helper_with_bundle() {
  local caller_sha256="$1"
  local environment="$2"
  local sha="$3"
  local tree="$4"
  local archive="$5"
  local bundle="$6"
  shift 6
  env \
    ARKNIGHTS_INFRA_PREPARE_TEST_MODE=1 \
    ARKNIGHTS_INFRA_PREPARE_TEST_ROOT="$test_root" \
    ARKNIGHTS_INFRA_PREPARE_TEST_REPOSITORY_URL="$origin_repository" \
    ARKNIGHTS_INFRA_PREPARE_TEST_CACHE_ROOT="$cache_root" \
    ARKNIGHTS_INFRA_PREPARE_TEST_RETRY_DELAY_SECONDS=0 \
    "$@" \
    "$helper" "$environment" "$sha" "$tree" "$archive" "$caller_sha256" "$bundle"
}

assert_status() {
  local expected_status="$1"
  shift
  set +e
  "$@" >/dev/null 2>&1
  actual_status=$?
  set -e
  if [[ "$actual_status" -ne "$expected_status" ]]; then
    echo "Expected status $expected_status, received $actual_status: $*" >&2
    exit 1
  fi
}

different_hash() {
  local value="$1"
  if [[ "${value: -1}" == "0" ]]; then
    printf '%s1\n' "${value%?}"
  else
    printf '%s0\n' "${value%?}"
  fi
}

seed_archive="$test_root/arknights-infra-production-${seed_sha}.tar.gz"
run_helper production "$seed_sha" "$seed_tree" "$seed_archive" \
  ARKNIGHTS_INFRA_SEED_RELEASE_DIR="$seed_release"
expected_tar_sha="$(git -C "$source_repository" archive --format=tar "$seed_sha" | sha256sum | cut -d ' ' -f 1)"
actual_tar_sha="$(gzip -dc "$seed_archive" | sha256sum | cut -d ' ' -f 1)"
test "$actual_tar_sha" = "$expected_tar_sha"
test "$(stat -c '%a' "$seed_archive")" = "644"
if git --git-dir="$cache_root/repository.git" cat-file -e "$removed_parent_blob" 2>/dev/null; then
  echo "Seed metadata unexpectedly included a blob reachable only from the parent commit." >&2
  exit 1
fi

printf 'second\n' > "$source_repository/src/current.txt"
rm "$source_repository/src/remove.txt"
printf 'added\n' > "$source_repository/src/added.txt"
git -C "$source_repository" add -A
git -C "$source_repository" commit -m "incremental" >/dev/null
incremental_sha="$(git -C "$source_repository" rev-parse HEAD)"
incremental_tree="$(git -C "$source_repository" rev-parse 'HEAD^{tree}')"
git -C "$source_repository" push "$origin_repository" main >/dev/null

incremental_archive="$test_root/arknights-infra-development-${incremental_sha}.tar.gz"
run_helper development "$incremental_sha" "$incremental_tree" "$incremental_archive"
expected_tar_sha="$(git -C "$source_repository" archive --format=tar "$incremental_sha" | sha256sum | cut -d ' ' -f 1)"
actual_tar_sha="$(gzip -dc "$incremental_archive" | sha256sum | cut -d ' ' -f 1)"
test "$actual_tar_sha" = "$expected_tar_sha"
test "$(stat -c '%a' "$incremental_archive")" = "644"
test "$(git --git-dir="$cache_root/repository.git" rev-parse refs/arknights-infra/environments/development)" = "$incremental_sha"
test "$(git --git-dir="$cache_root/repository.git" cat-file -p "$incremental_sha:public/images/unchanged.bin" | sha256sum | cut -d ' ' -f 1)" = \
  "$(sha256sum "$source_repository/public/images/unchanged.bin" | cut -d ' ' -f 1)"

production_archive="$test_root/arknights-infra-production-${incremental_sha}.tar.gz"
rm -f "$incremental_archive"
run_legacy_helper "$legacy_main_caller_sha256" production "$incremental_sha" "$incremental_tree" "$production_archive" &
production_pid=$!
run_legacy_helper "$legacy_develop_caller_sha256" development "$incremental_sha" "$incremental_tree" "$incremental_archive" &
development_pid=$!
wait "$production_pid"
wait "$development_pid"
gzip -t "$production_archive" "$incremental_archive"

printf 'bundle fallback\n' > "$source_repository/src/current.txt"
git -C "$source_repository" add .
git -C "$source_repository" commit -m "bundle fallback" >/dev/null
bundle_sha="$(git -C "$source_repository" rev-parse HEAD)"
bundle_tree="$(git -C "$source_repository" rev-parse 'HEAD^{tree}')"
bundle_path="$test_root/arknights-infra-development-${bundle_sha}.bundle"
bundle_archive="$test_root/arknights-infra-development-${bundle_sha}.tar.gz"
git -C "$source_repository" bundle create "$bundle_path" HEAD "^$incremental_sha"
mv "$origin_repository" "$test_root/origin-unavailable.git"
run_legacy_helper_with_bundle "$legacy_develop_caller_sha256" development \
  "$bundle_sha" "$bundle_tree" "$bundle_archive" "$bundle_path"
mv "$test_root/origin-unavailable.git" "$origin_repository"
expected_tar_sha="$(git -C "$source_repository" archive --format=tar "$bundle_sha" | sha256sum | cut -d ' ' -f 1)"
actual_tar_sha="$(gzip -dc "$bundle_archive" | sha256sum | cut -d ' ' -f 1)"
test "$actual_tar_sha" = "$expected_tar_sha"
test ! -e "$bundle_path"
test "$(git --git-dir="$cache_root/repository.git" rev-parse refs/arknights-infra/environments/development)" = "$bundle_sha"

printf 'missing bundle base\n' > "$source_repository/src/current.txt"
git -C "$source_repository" add .
git -C "$source_repository" commit -m "missing bundle base" >/dev/null
missing_base_sha="$(git -C "$source_repository" rev-parse HEAD)"
missing_base_tree="$(git -C "$source_repository" rev-parse 'HEAD^{tree}')"
missing_base_bundle="$test_root/arknights-infra-development-${missing_base_sha}.bundle"
missing_base_archive="$test_root/arknights-infra-development-${missing_base_sha}.tar.gz"
missing_base_cache="$test_root/missing-base-cache"
mkdir "$missing_base_cache"
git -C "$source_repository" bundle create "$missing_base_bundle" HEAD "^$bundle_sha"
mv "$origin_repository" "$test_root/origin-unavailable.git"
assert_status 75 run_helper_with_bundle development "$missing_base_sha" "$missing_base_tree" \
  "$missing_base_archive" "$missing_base_bundle" \
  ARKNIGHTS_INFRA_PREPARE_TEST_CACHE_ROOT="$missing_base_cache"
mv "$test_root/origin-unavailable.git" "$origin_repository"
test ! -e "$missing_base_bundle"

mismatched_bundle="$test_root/arknights-infra-development-${bundle_sha}.bundle"
git -C "$source_repository" bundle create "$mismatched_bundle" HEAD "^$bundle_sha"
assert_status 2 run_helper_with_bundle development "$bundle_sha" "$bundle_tree" "$bundle_archive" "$mismatched_bundle"
test ! -e "$mismatched_bundle"
assert_status 2 run_helper_with_bundle development "$bundle_sha" "$bundle_tree" "$bundle_archive" "$test_root/wrong.bundle"

assert_status 2 run_helper staging "$incremental_sha" "$incremental_tree" "$incremental_archive"
assert_status 2 run_helper development "${incremental_sha%?}x" "$incremental_tree" "$incremental_archive"
assert_status 2 run_helper development "$incremental_sha" "$(different_hash "$incremental_tree")" "$incremental_archive"
assert_status 2 run_helper development "$incremental_sha" "$incremental_tree" "$test_root/wrong.tar.gz"

assert_status 2 "$helper" --contract-version unexpected
assert_status 2 "$helper" development "$incremental_sha" "$incremental_tree"
assert_status 2 "$helper" development "$incremental_sha" "$incremental_tree" "$incremental_archive" \
  "$test_root/wrong.bundle" unexpected
assert_status 2 run_legacy_helper "$(different_hash "$legacy_develop_caller_sha256")" development \
  "$incremental_sha" "$incremental_tree" "$incremental_archive"

git -C "$source_repository" commit --allow-empty -m "unavailable" >/dev/null
unavailable_sha="$(git -C "$source_repository" rev-parse HEAD)"
unavailable_tree="$(git -C "$source_repository" rev-parse 'HEAD^{tree}')"
unavailable_cache="$test_root/unavailable-cache"
unavailable_origin="$test_root/missing-origin.git"
if command -v cygpath >/dev/null 2>&1; then
  unavailable_origin="$(cygpath -m "$unavailable_origin")"
fi
mkdir "$unavailable_cache"
set +e
env \
  ARKNIGHTS_INFRA_PREPARE_TEST_MODE=1 \
  ARKNIGHTS_INFRA_PREPARE_TEST_ROOT="$test_root" \
  ARKNIGHTS_INFRA_PREPARE_TEST_REPOSITORY_URL="$unavailable_origin" \
  ARKNIGHTS_INFRA_PREPARE_TEST_CACHE_ROOT="$unavailable_cache" \
  ARKNIGHTS_INFRA_PREPARE_TEST_RETRY_DELAY_SECONDS=0 \
  "$helper" development "$unavailable_sha" "$unavailable_tree" \
  "$test_root/arknights-infra-development-${unavailable_sha}.tar.gz" >/dev/null 2>&1
unavailable_status=$?
set -e
test "$unavailable_status" -eq 75

grep -Fq 'elif ! is_temporary_failure "$prepare_status"' "$repository_root/.github/workflows/deploy.yml"
grep -Fq 'bundle_base_source="server-cache"' "$repository_root/.github/workflows/deploy.yml"
grep -Fq 'git bundle create "$local_bundle" HEAD "^$bundle_base_sha"' "$repository_root/.github/workflows/deploy.yml"
grep -Fq 'transport_mode="git-bundle"' "$repository_root/.github/workflows/deploy.yml"
grep -Fq 'timeout --kill-after=10s 1500s scp' "$repository_root/.github/workflows/deploy.yml"
grep -Fq 'fetch-depth: 0' "$repository_root/.github/workflows/deploy.yml"
grep -Fq 'test "$DEPLOY_SSH_USER" != "root"' "$repository_root/.github/workflows/deploy.yml"
grep -Fq 'DEPLOY_PREPARE_HELPER_CONTRACT: "1"' "$repository_root/.github/workflows/deploy.yml"
grep -Fq 'DEPLOY_RELEASE_HELPER_CONTRACT: "1"' "$repository_root/.github/workflows/deploy.yml"
grep -Fq 'verify_helper prepare /usr/local/sbin/arknights-infra-prepare-release' "$repository_root/.github/workflows/deploy.yml"
grep -Fq 'verify_helper deploy /usr/local/sbin/arknights-infra-deploy' "$repository_root/.github/workflows/deploy.yml"
grep -Fq -- '--contract-version")"' "$repository_root/.github/workflows/deploy.yml"

echo "Release preparation integration tests passed."
