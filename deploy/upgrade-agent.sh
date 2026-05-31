#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/gpt-account-manager}"
DATA_DIR="${DATA_DIR:-${APP_DIR}/data}"
REQUEST_FILE="${REQUEST_FILE:-${DATA_DIR}/upgrade_request.json}"
RESULT_FILE="${RESULT_FILE:-${DATA_DIR}/upgrade_result.json}"
LOCK_FILE="${LOCK_FILE:-${DATA_DIR}/upgrade.lock}"
BRANCH="${BRANCH:-main}"

write_json() {
  local status="$1"
  local message="$2"
  local extra="${3:-}"
  python3 - "$RESULT_FILE" "$status" "$message" "$extra" <<'PY'
import json
import sys
from datetime import datetime, timezone

path, status, message, extra = sys.argv[1:5]
payload = {
    "status": status,
    "message": message,
    "updated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
}
if extra:
    try:
        payload.update(json.loads(extra))
    except Exception:
        payload["detail"] = extra
with open(path, "w", encoding="utf-8") as fh:
    json.dump(payload, fh, ensure_ascii=False, indent=2)
PY
}

set_request_status() {
  local status="$1"
  python3 - "$REQUEST_FILE" "$status" <<'PY'
import json
import sys
from datetime import datetime, timezone

path, status = sys.argv[1:3]
try:
    with open(path, "r", encoding="utf-8-sig") as fh:
        payload = json.load(fh)
except Exception:
    payload = {}
payload["status"] = status
payload["updated_at"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
with open(path, "w", encoding="utf-8") as fh:
    json.dump(payload, fh, ensure_ascii=False, indent=2)
PY
}

if [[ ! -f "${REQUEST_FILE}" ]]; then
  exit 0
fi

REQUEST_STATUS="$(python3 - "$REQUEST_FILE" <<'PY'
import json
import sys
try:
    with open(sys.argv[1], "r", encoding="utf-8-sig") as fh:
        print(json.load(fh).get("status", ""))
except Exception:
    print("")
PY
)"

if [[ "${REQUEST_STATUS}" != "requested" ]]; then
  exit 0
fi

exec 9>"${LOCK_FILE}"
if ! flock -n 9; then
  exit 0
fi

set_request_status "running"

if [[ ! -d "${APP_DIR}/.git" ]]; then
  set_request_status "failed"
  write_json "failed" "${APP_DIR} is not a git repository"
  exit 1
fi

cd "${APP_DIR}"

BEFORE="$(git rev-parse --short HEAD 2>/dev/null || echo unknown)"

if ! git fetch origin "${BRANCH}"; then
  set_request_status "failed"
  write_json "failed" "git fetch failed" "{\"before\":\"${BEFORE}\"}"
  exit 1
fi

REMOTE="$(git rev-parse --short "origin/${BRANCH}" 2>/dev/null || echo unknown)"

if [[ "${BEFORE}" == "${REMOTE}" ]]; then
  set_request_status "done"
  write_json "no_update" "already up to date" "{\"before\":\"${BEFORE}\",\"remote\":\"${REMOTE}\"}"
  exit 0
fi

if ! git pull --ff-only origin "${BRANCH}"; then
  set_request_status "failed"
  write_json "failed" "git pull failed" "{\"before\":\"${BEFORE}\",\"remote\":\"${REMOTE}\"}"
  exit 1
fi

if ! docker compose up -d --build --force-recreate; then
  set_request_status "failed"
  write_json "failed" "docker compose rebuild failed" "{\"before\":\"${BEFORE}\",\"remote\":\"${REMOTE}\"}"
  exit 1
fi

docker image prune -f >/dev/null 2>&1 || true
docker builder prune -f >/dev/null 2>&1 || true

AFTER="$(git rev-parse --short HEAD 2>/dev/null || echo unknown)"
set_request_status "done"
write_json "success" "upgraded and restarted" "{\"before\":\"${BEFORE}\",\"remote\":\"${REMOTE}\",\"after\":\"${AFTER}\"}"
