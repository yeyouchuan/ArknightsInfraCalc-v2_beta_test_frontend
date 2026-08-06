#!/usr/bin/env bash
set -euo pipefail

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
expected_script_sha256="${11:-}"

if [[ "$deployment_environment" != "production" && "$deployment_environment" != "development" ]]; then
  echo "APP_DEPLOYMENT_ENV must be production or development." >&2
  exit 2
fi
if [[ ! "$release_sha" =~ ^[0-9a-f]{40}$ ]]; then
  echo "Release SHA must be a full Git commit hash." >&2
  exit 2
fi
if [[ ! "$app_root" =~ ^/opt/arknights-infra(-[A-Za-z0-9._-]+)?$ ]]; then
  echo "Deployment root must stay inside the /opt/arknights-infra namespace." >&2
  exit 2
fi
if [[ ! "$service_name" =~ ^arknights-infra(-[A-Za-z0-9_.@-]+)?$ ]]; then
  echo "Invalid systemd service name." >&2
  exit 2
fi
if [[ "$deployment_environment" == "production" ]]; then
  if [[ "$app_root" != "/opt/arknights-infra" || "$service_name" != "arknights-infra" ]]; then
    echo "Production must use the dedicated production root and service." >&2
    exit 2
  fi
elif [[ ! "$app_root" =~ ^/opt/arknights-infra-[A-Za-z0-9._-]+$ || ! "$service_name" =~ ^arknights-infra-[A-Za-z0-9_.@-]+$ ]]; then
  echo "Development must use suffixed root and service names." >&2
  exit 2
fi
if [[ ! "$run_user" =~ ^[A-Za-z0-9_-]+$ || "$run_user" == "root" ]]; then
  echo "Invalid runtime user." >&2
  exit 2
fi
if [[ ! "$internal_port" =~ ^[0-9]{2,5}$ ]]; then
  echo "Invalid internal port." >&2
  exit 2
fi
if [[ ! "$debug_tools_enabled" =~ ^[01]$ || ! "$rate_limit_enabled" =~ ^[01]$ ]]; then
  echo "Debug and rate-limit flags must be 0 or 1." >&2
  exit 2
fi
if [[ ! "$expected_script_sha256" =~ ^[0-9a-f]{64}$ ]]; then
  echo "Deployment script hash must be a SHA-256 digest." >&2
  exit 2
fi
actual_script_sha256="$(sha256sum "$0" | cut -d ' ' -f 1)"
if [[ "$actual_script_sha256" != "$expected_script_sha256" ]]; then
  echo "The reviewed deployment script does not match the server-installed runner." >&2
  exit 2
fi
if [[ ! -f "$archive_path" ]]; then
  echo "Release archive does not exist: $archive_path" >&2
  exit 2
fi
expected_archive_path="/tmp/arknights-infra-${release_sha}.tar.gz"
if [[ "$archive_path" != "$expected_archive_path" ]]; then
  echo "Release archive path does not match the verified commit." >&2
  exit 2
fi

releases_root="$app_root/releases"
shared_root="$app_root/shared"
current_link="$app_root/current"
environment_marker="$shared_root/deployment-environment"
release_stamp="$(date -u +%Y%m%d%H%M%S)"
release_dir="$releases_root/${release_stamp}-${release_sha:0:12}"
next_link="$app_root/.current-${release_sha:0:12}"
previous_release=""

install -d -m 0755 "$app_root"
command -v flock >/dev/null
exec 9>"$app_root/.deploy.lock"
flock 9

if [[ -e "$current_link" && ! -L "$current_link" ]]; then
  echo "Refusing to replace a non-symlink current path: $current_link" >&2
  exit 2
fi
if [[ -L "$current_link" ]]; then
  previous_release="$(readlink -f "$current_link")"
  if [[ "$previous_release" != "$releases_root/"* ]]; then
    echo "Current release points outside the configured releases directory." >&2
    exit 2
  fi
fi

install -d -m 0755 "$releases_root" "$shared_root"
if [[ -f "$environment_marker" ]]; then
  configured_environment="$(tr -d '[:space:]' < "$environment_marker")"
  if [[ "$configured_environment" != "$deployment_environment" ]]; then
    echo "Deployment root belongs to $configured_environment, not $deployment_environment." >&2
    exit 2
  fi
else
  printf '%s\n' "$deployment_environment" > "$environment_marker"
fi

cleanup() {
  rm -f "$archive_path"
  if [[ -L "$next_link" ]]; then rm -f "$next_link"; fi
}
trap cleanup EXIT

install -d -m 0750 -o "$run_user" -g "$run_user" "$release_dir"
runuser -u "$run_user" -- tar --no-same-owner --no-same-permissions -xzf "$archive_path" -C "$release_dir"

if [[ ! -f "$shared_root/.env.local" && -n "$previous_release" && -f "$previous_release/.env.local" ]]; then
  install -m 0600 "$previous_release/.env.local" "$shared_root/.env.local"
fi
if [[ -f "$shared_root/.env.local" ]]; then
  install -m 0600 "$shared_root/.env.local" "$release_dir/.env.local"
fi

if [[ ! -d "$shared_root/bin-data" && -n "$previous_release" && -d "$previous_release/bin/data" ]]; then
  install -d -m 0755 "$shared_root/bin-data"
  cp -a "$previous_release/bin/data/." "$shared_root/bin-data/"
fi
if [[ -d "$shared_root/bin-data" ]]; then
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
EOF

printf '%s\n' "$release_sha" > "$release_dir/.release-sha"
chown -R "$run_user:$run_user" "$release_dir"

runuser -u "$run_user" -- bash -lc "cd '$release_dir' && npm ci"
runuser -u "$run_user" -- env \
  APP_DEPLOYMENT_ENV="$deployment_environment" \
  SKLAND_FEATURE_ENABLED="$skland_enabled" \
  bash -lc "cd '$release_dir' && npm run build"

ln -s "$release_dir" "$next_link"
mv -Tf "$next_link" "$current_link"

rollback() {
  if [[ -z "$previous_release" || ! -d "$previous_release" ]]; then
    echo "Deployment failed and no previous release is available for rollback." >&2
    return 1
  fi
  ln -s "$previous_release" "$next_link"
  mv -Tf "$next_link" "$current_link"
  systemctl restart "$service_name"
  echo "Rolled back to $previous_release" >&2
}

if ! systemctl restart "$service_name"; then
  rollback
  exit 1
fi

health_url="http://127.0.0.1:${internal_port}/api/health"
health_body=""
for _ in {1..30}; do
  if health_body="$(curl -fsS --max-time 3 "$health_url" 2>/dev/null)"; then
    break
  fi
  sleep 1
done

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
  rollback
  exit 1
fi

if [[ -n "$public_health_url" ]] && ! curl -fsS --max-time 10 "$public_health_url" >/dev/null; then
  echo "Public health verification failed: $public_health_url" >&2
  rollback
  exit 1
fi

systemctl enable "$service_name"
echo "Deployed $release_sha to $deployment_environment at $release_dir"
