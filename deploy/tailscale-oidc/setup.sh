#!/usr/bin/env bash
set -euo pipefail

deploy_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
repo_root="$(cd "$deploy_dir/../.." && pwd -P)"
runtime_dir="$deploy_dir/runtime"
runtime_env="$runtime_dir/runtime.env"
app_env="$runtime_dir/wardrowbe.env"

for command_name in tailscale jq docker curl openssl htpasswd uuidgen; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Missing required command: $command_name" >&2
    exit 1
  fi
done

tailscale_json="$(tailscale status --json 2>/dev/null)"
tailscale_dns_name="$(jq -r '.Self.DNSName | sub("\\.$"; "")' <<<"$tailscale_json")"
self_user_id="$(jq -r '.Self.UserID | tostring' <<<"$tailscale_json")"
owner_email="$(jq -r --arg id "$self_user_id" '.User[$id].LoginName // empty' <<<"$tailscale_json")"

if [[ -z "$tailscale_dns_name" || -z "$owner_email" ]]; then
  echo "Unable to resolve current Tailscale DNS name or login" >&2
  exit 1
fi

mkdir -p "$runtime_dir"
chmod 700 "$runtime_dir"
umask 077

verify_existing_owner() {
  if [[ ! -f "$repo_root/backend/.env" ]]; then
    echo "Missing backend/.env; cannot verify existing Wardrowbe owner" >&2
    return 1
  fi

  local result
  result="$({
    set -a
    # shellcheck disable=SC1091
    source "$repo_root/backend/.env"
    set +a
    PYTHONPATH="$repo_root/backend" "$repo_root/.venv/bin/python" - "$owner_email" <<'PY'
import asyncio
import os
import sys

import asyncpg


async def main() -> None:
    database_url = os.environ["DATABASE_URL"].replace("postgresql+asyncpg://", "postgresql://", 1)
    connection = await asyncpg.connect(database_url)
    try:
        total = await connection.fetchval("SELECT count(*) FROM users")
        matching = await connection.fetchval(
            "SELECT count(*) FROM users WHERE lower(email) = lower($1)", sys.argv[1]
        )
    finally:
        await connection.close()
    print("empty" if total == 0 else "match" if matching else "mismatch")


asyncio.run(main())
PY
  } 2>/dev/null)" || {
    echo "Unable to verify existing Wardrowbe owner email" >&2
    return 1
  }

  if [[ "$result" == "mismatch" ]]; then
    echo "Tailscale login does not match any existing Wardrowbe user; refusing account split" >&2
    return 1
  fi
}

verify_existing_owner

if [[ ! -f "$runtime_env" ]]; then
  if [[ "${WARDROWBE_GENERATE_PASSWORD:-0}" == "1" ]]; then
    owner_password="$(openssl rand -hex 16)"
    owner_entry="$(printf '%s\n' "$owner_password" | htpasswd -niBC 12 "$owner_email")"
    if command -v pbcopy >/dev/null 2>&1; then
      printf '%s' "$owner_password" | pbcopy
      echo "Generated local Wardrowbe password copied to clipboard"
    else
      echo "Clipboard unavailable; rerun without WARDROWBE_GENERATE_PASSWORD" >&2
      exit 1
    fi
    unset owner_password
  else
    echo "Create local Wardrowbe password for $owner_email"
    owner_entry="$(htpasswd -nBC 12 "$owner_email")"
  fi

  owner_password_hash="${owner_entry#*:}"
  unset owner_entry
  dex_web_client_secret="$(openssl rand -hex 32)"
  wardrowbe_secret_key="$(openssl rand -hex 32)"
  nextauth_secret="$(openssl rand -hex 32)"
  owner_user_id="$(uuidgen | tr '[:upper:]' '[:lower:]')"

  {
    printf 'TAILSCALE_DNS_NAME=%s\n' "$tailscale_dns_name"
    printf 'OWNER_EMAIL=%s\n' "$owner_email"
    printf 'OWNER_PASSWORD_HASH=%s\n' "$owner_password_hash"
    printf 'OWNER_USER_ID=%s\n' "$owner_user_id"
    printf 'DEX_WEB_CLIENT_SECRET=%s\n' "$dex_web_client_secret"
    printf 'SECRET_KEY=%s\n' "$wardrowbe_secret_key"
    printf 'NEXTAUTH_SECRET=%s\n' "$nextauth_secret"
    printf 'OIDC_ISSUER_URL=https://%s:8446/dex\n' "$tailscale_dns_name"
    printf 'OIDC_CLIENT_ID=wardrowbe-web\n'
    printf 'OIDC_MOBILE_CLIENT_ID=wardrowbe-mobile\n'
    printf 'OIDC_CLIENT_SECRET=%s\n' "$dex_web_client_secret"
    printf 'NEXTAUTH_URL=https://%s:8445\n' "$tailscale_dns_name"
    printf 'NEXTAUTH_URL_INTERNAL=http://127.0.0.1:3000\n'
    printf 'BACKEND_URL=http://127.0.0.1:8001\n'
    printf 'AUTH_TRUST_HOST=true\n'
    printf 'NO_PROXY=127.0.0.1,localhost,.ts.net,%s\n' "$tailscale_dns_name"
    printf 'no_proxy=127.0.0.1,localhost,.ts.net,%s\n' "$tailscale_dns_name"
  } >"$runtime_env"
  chmod 600 "$runtime_env"
else
  existing_dns="$(sed -n 's/^TAILSCALE_DNS_NAME=//p' "$runtime_env")"
  if [[ "$existing_dns" != "$tailscale_dns_name" ]]; then
    echo "Runtime Tailscale DNS name differs from current Mac" >&2
    exit 1
  fi
fi

{
  sed -n \
    -e '/^TAILSCALE_DNS_NAME=/p' \
    -e '/^SECRET_KEY=/p' \
    -e '/^NEXTAUTH_SECRET=/p' \
    -e '/^OIDC_ISSUER_URL=/p' \
    -e '/^OIDC_CLIENT_ID=/p' \
    -e '/^OIDC_MOBILE_CLIENT_ID=/p' \
    -e '/^OIDC_CLIENT_SECRET=/p' \
    -e '/^NEXTAUTH_URL=/p' \
    -e '/^NEXTAUTH_URL_INTERNAL=/p' \
    -e '/^BACKEND_URL=/p' \
    -e '/^AUTH_TRUST_HOST=/p' \
    -e '/^NO_PROXY=/p' \
    -e '/^no_proxy=/p' \
    "$runtime_env"
} >"$app_env"
chmod 600 "$app_env"

python3 "$deploy_dir/render_config.py" \
  "$runtime_env" "$deploy_dir/dex.yaml.template" "$runtime_dir/dex.yaml"

docker compose -f "$deploy_dir/compose.yaml" up -d

for _ in {1..30}; do
  if curl --noproxy '*' --fail --silent --show-error \
    "http://127.0.0.1:5556/dex/.well-known/openid-configuration" >/dev/null; then
    break
  fi
  sleep 1
done

curl --noproxy '*' --fail --silent --show-error \
  "http://127.0.0.1:5556/dex/.well-known/openid-configuration" >/dev/null

tailscale serve --bg --https=8445 http://127.0.0.1:3000
tailscale serve --bg --https=8446 http://127.0.0.1:5556

echo "Dex and private Serve routes configured"
echo "Start Wardrowbe with: $deploy_dir/wardrowbe.sh start"
