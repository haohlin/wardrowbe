#!/usr/bin/env bash
set -euo pipefail

deploy_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
app_env="$deploy_dir/runtime/wardrowbe.env"

if [[ ! -f "$app_env" ]]; then
  echo "Missing wardrowbe.env; run setup.sh first" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$app_env"
set +a

wardrowbe_origin="https://${TAILSCALE_DNS_NAME}:8445"
dex_origin="https://${TAILSCALE_DNS_NAME}:8446"

curl --noproxy '*' --fail --silent --show-error \
  "http://127.0.0.1:8001/api/v1/health" >/dev/null
curl --noproxy '*' --fail --silent --show-error \
  "http://127.0.0.1:5556/dex/.well-known/openid-configuration" \
  | jq -e --arg issuer "$OIDC_ISSUER_URL" '.issuer == $issuer' >/dev/null

auth_config="$(curl --noproxy '*' --fail --silent --show-error \
  "$wardrowbe_origin/api/v1/auth/config")"
jq -e \
  '.oidc.enabled == true and .oidc.client_id == "wardrowbe-mobile" and .dev_mode == false' \
  <<<"$auth_config" >/dev/null

callback_headers="$(mktemp)"
trap 'rm -f "$callback_headers"' EXIT
curl --noproxy '*' --silent --show-error --output /dev/null --dump-header "$callback_headers" \
  "$wardrowbe_origin/api/v1/auth/mobile-callback?code=probe&state=probe"
grep -qi '^location: wardrowbe://auth/callback?' "$callback_headers"

curl --noproxy '*' --fail --silent --show-error \
  "$dex_origin/dex/.well-known/openid-configuration" \
  | jq -e --arg issuer "$OIDC_ISSUER_URL" '.issuer == $issuer' >/dev/null

serve_status="$(tailscale serve status --json)"
jq -e --arg host "${TAILSCALE_DNS_NAME}:8445" \
  '.Web[$host].Handlers["/"].Proxy == "http://127.0.0.1:3000"' \
  <<<"$serve_status" >/dev/null
jq -e --arg host "${TAILSCALE_DNS_NAME}:8446" \
  '.Web[$host].Handlers["/"].Proxy == "http://127.0.0.1:5556"' \
  <<<"$serve_status" >/dev/null

echo "Wardrowbe native OIDC checks passed"
