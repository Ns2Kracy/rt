#!/usr/bin/env bash
set -euo pipefail

HOST="${1:-10.0.0.85}"
MODULE_NAME="zimaos-login-demo"
RAW_FILE="${RAW_FILE:-${MODULE_NAME}.raw}"
REMOTE_RAW="/var/lib/extensions/${MODULE_NAME}.raw"
REMOTE_TMP="/var/lib/extensions/${MODULE_NAME}.raw.next"
REMOTE_CONFIG="/usr/share/casaos/www/modules/${MODULE_NAME}/config.js"
LOCAL_CONFIG="raw/usr/share/casaos/www/modules/${MODULE_NAME}/config.js"

if [[ ! -f "${RAW_FILE}" ]]; then
  printf 'missing %s; run scripts/build-raw.sh first\n' "${RAW_FILE}" >&2
  exit 1
fi

if [[ ! -f "${LOCAL_CONFIG}" ]]; then
  printf 'missing %s; run scripts/build-raw.sh first\n' "${LOCAL_CONFIG}" >&2
  exit 1
fi

BUILD_ID="$(sed -n 's/.*buildID: "\([^"]*\)".*/\1/p' "${LOCAL_CONFIG}")"
if [[ -z "${BUILD_ID}" ]]; then
  printf 'failed to read build id from %s\n' "${LOCAL_CONFIG}" >&2
  exit 1
fi

printf 'Deploying %s build %s to %s\n' "${RAW_FILE}" "${BUILD_ID}" "${HOST}"
scp "${RAW_FILE}" "root@${HOST}:${REMOTE_TMP}"

ssh "root@${HOST}" \
  "MODULE_NAME='${MODULE_NAME}' REMOTE_RAW='${REMOTE_RAW}' REMOTE_TMP='${REMOTE_TMP}' REMOTE_CONFIG='${REMOTE_CONFIG}' BUILD_ID='${BUILD_ID}' bash -s" <<'REMOTE'
set -euo pipefail

printf 'Stopping module service if running\n'
systemctl stop "${MODULE_NAME}.service" 2>/dev/null || true

printf 'Installing raw image atomically\n'
mv "${REMOTE_TMP}" "${REMOTE_RAW}"
sync "${REMOTE_RAW}" 2>/dev/null || sync

printf 'Refreshing sysext overlay\n'
systemd-sysext refresh

if ! grep -q "${BUILD_ID}" "${REMOTE_CONFIG}" 2>/dev/null; then
  printf 'Mounted /usr tree did not show build %s after refresh; forcing unmerge/merge\n' "${BUILD_ID}" >&2
  systemd-sysext unmerge
  systemd-sysext merge
fi

printf 'Reloading services\n'
systemctl daemon-reload
systemctl restart "${MODULE_NAME}.service"
systemctl restart zimaos-app-management.service 2>/dev/null || true

printf 'Verifying mounted frontend build\n'
grep -n "${BUILD_ID}" "${REMOTE_CONFIG}"

printf 'Verifying HTTP frontend build\n'
curl -fsS "http://127.0.0.1/modules/${MODULE_NAME}/config.js?deploy=${BUILD_ID}" | grep "${BUILD_ID}"

printf 'Verifying backend target-version endpoint\n'
curl -fsS "http://127.0.0.1/v2/api/rt/target-version"
printf '\nDeploy verified: %s\n' "${BUILD_ID}"
REMOTE

