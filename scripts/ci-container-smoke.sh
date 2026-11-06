#!/usr/bin/env bash
set -euo pipefail

image="${1:?Pass the built container image}"
name="gam-ci-${GITHUB_RUN_ID:-local}-${RANDOM}"
token="$(openssl rand -hex 24)"
cleanup() {
  result=$?
  if [ "$result" -ne 0 ]; then docker logs "$name" >&2 || true; fi
  docker rm -f "$name" >/dev/null 2>&1 || true
  exit "$result"
}
trap cleanup EXIT

docker run -d --name "$name" -p 127.0.0.1::8765 \
  -e MAIL_PICKUP_ADMIN_TOKEN="$token" "$image" >/dev/null
port="$(docker inspect "$name" --format '{{(index (index .NetworkSettings.Ports "8765/tcp") 0).HostPort}}')"
base="http://127.0.0.1:$port"
wait_for_health() {
  curl --fail --silent --show-error --retry 30 --retry-delay 1 --retry-connrefused \
    --max-time 10 -H "Authorization: Bearer $token" "$base/health" |
    python3 -c 'import json,sys; p=json.load(sys.stdin); assert p["ok"] and p["app"] == "gpt-account-manager" and p["admin_token_set"]'
}
wait_for_health
curl --fail --silent --show-error "$base/" >/dev/null
status="$(curl --silent --output /dev/null --write-out '%{http_code}' \
  -H 'Authorization: Bearer invalid-ci-token' "$base/admin-api/workspaces/recover")"
[[ "$status" == 401 || "$status" == 403 ]]
curl --fail --silent --show-error -H "Authorization: Bearer $token" \
  "$base/admin-api/workspaces/recover" >/dev/null
docker restart "$name" >/dev/null
wait_for_health
echo 'Container startup, authentication rejection and restart checks passed.'
