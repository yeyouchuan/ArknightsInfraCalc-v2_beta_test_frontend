#!/usr/bin/env bash
set -euo pipefail

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
helper="$repository_root/deploy/postgres/backup.sh"
test_root="$(mktemp -d)"
trap 'rm -rf -- "$test_root"' EXIT

mock_bin="$test_root/bin"
mkdir -p "$mock_bin"

cat > "$mock_bin/pg_dump" <<'MOCK'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" > "${TEST_PG_DUMP_LOG:?}"
printf 'postgres-custom-dump\n'
MOCK

cat > "$mock_bin/age" <<'MOCK'
#!/usr/bin/env bash
set -euo pipefail
output=''
while (($#)); do
  case "$1" in
    -o)
      output="$2"
      shift 2
      ;;
    *)
      shift
      ;;
  esac
done
test -n "$output"
{
  printf 'age-encrypted\n'
  cat
} > "$output"
MOCK

cat > "$mock_bin/restic" <<'MOCK'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >> "${TEST_RESTIC_LOG:?}"
MOCK
chmod +x "$mock_bin/pg_dump" "$mock_bin/age" "$mock_bin/restic"

run_backup() {
  local backup_dir="$1"
  shift
  env \
    PATH="$mock_bin:$PATH" \
    DATABASE_BACKUP_URL='postgresql://backup@127.0.0.1:55433/auth' \
    PGPASSWORD='test-only-password' \
    BACKUP_AGE_RECIPIENT='age1testrecipient' \
    BACKUP_LOCAL_DIR="$backup_dir" \
    TEST_PG_DUMP_LOG="$backup_dir/pg-dump-args.log" \
    "$@" \
    bash "$helper"
}

local_dir="$test_root/local"
local_log="$test_root/local-restic.log"
mkdir -p "$local_dir"
printf 'expired\n' > "$local_dir/auth-20000101T000000Z.dump.age"
printf 'recent\n' > "$local_dir/auth-20000102T000000Z.dump.age"
touch -d '16 days ago' "$local_dir/auth-20000101T000000Z.dump.age"
touch -d '13 days ago' "$local_dir/auth-20000102T000000Z.dump.age"
run_backup "$local_dir" TEST_RESTIC_LOG="$local_log"
test ! -e "$local_dir/auth-20000101T000000Z.dump.age"
test -e "$local_dir/auth-20000102T000000Z.dump.age"
test "$(find "$local_dir" -maxdepth 1 -type f -name 'auth-*.dump.age' | wc -l)" -eq 2
test ! -e "$local_log"
grep -l '^age-encrypted$' "$local_dir"/auth-*.dump.age >/dev/null
grep -q -- '--format=custom' "$local_dir/pg-dump-args.log"
if grep -Eq -- '--schema(=|[[:space:]])|(^|[[:space:]])-n([[:space:]]|$)' "$local_dir/pg-dump-args.log"; then
  echo 'backup unexpectedly filtered out the app schema' >&2
  exit 1
fi

if run_backup "$test_root/password-url" \
  DATABASE_BACKUP_URL='postgresql://backup:must-not-appear@127.0.0.1:55433/auth' \
  TEST_RESTIC_LOG="$test_root/password-url-restic.log" \
  >"$test_root/password-url.stdout" 2>"$test_root/password-url.stderr"; then
  echo 'backup unexpectedly accepted a password-bearing database URL' >&2
  exit 1
fi
grep -q 'DATABASE_BACKUP_URL must not contain a password' "$test_root/password-url.stderr"
test ! -e "$test_root/password-url-restic.log"

if run_backup "$test_root/incomplete" \
  TEST_RESTIC_LOG="$test_root/incomplete-restic.log" \
  RESTIC_REPOSITORY='s3:https://example.test/backups' \
  >"$test_root/incomplete.stdout" 2>"$test_root/incomplete.stderr"; then
  echo 'backup unexpectedly accepted an incomplete restic configuration' >&2
  exit 1
fi
grep -q 'RESTIC_REPOSITORY and RESTIC_PASSWORD_FILE must be configured together' "$test_root/incomplete.stderr"
test ! -e "$test_root/incomplete-restic.log"

remote_dir="$test_root/remote"
remote_log="$test_root/remote-restic.log"
password_file="$test_root/restic-password"
printf 'test-only-restic-password\n' > "$password_file"
run_backup "$remote_dir" \
  TEST_RESTIC_LOG="$remote_log" \
  RESTIC_REPOSITORY='s3:https://example.test/backups' \
  RESTIC_PASSWORD_FILE="$password_file"
grep -Eq '^backup .*/auth-[0-9]{8}T[0-9]{6}Z\.dump\.age$' "$remote_log"
grep -q '^forget --keep-daily 14 --keep-weekly 8 --prune$' "$remote_log"

echo 'PostgreSQL backup tests passed.'
