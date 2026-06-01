#!/usr/bin/env bash
set -euo pipefail

HOST="${1:-10.0.0.85}"
MODULE_NAME="zimaos-login-demo"
RAW_FILE="${RAW_FILE:-${MODULE_NAME}.raw}"
REMOTE_RAW="/var/lib/extensions/${MODULE_NAME}.raw"
REMOTE_TMP="/var/lib/extensions/${MODULE_NAME}.raw.next"
REMOTE_CONFIG="/usr/share/casaos/www/modules/${MODULE_NAME}/config.js"

if [[ ! -f "${RAW_FILE}" ]]; then
  printf 'missing %s; run scripts/build-raw.sh first\n' "${RAW_FILE}" >&2
  exit 1
fi

printf 'Deploying %s to %s\n' "${RAW_FILE}" "${HOST}"
scp "${RAW_FILE}" "root@${HOST}:${REMOTE_TMP}"

ssh "root@${HOST}" \
  "MODULE_NAME='${MODULE_NAME}' REMOTE_RAW='${REMOTE_RAW}' REMOTE_TMP='${REMOTE_TMP}' REMOTE_CONFIG='${REMOTE_CONFIG}' bash -s" <<'REMOTE'
set -euo pipefail

printf 'Installing raw image atomically\n'
mv "${REMOTE_TMP}" "${REMOTE_RAW}"

printf 'Refreshing sysext overlay\n'
systemd-sysext refresh 2>&1

printf 'Reloading services\n'
systemctl daemon-reload
systemctl restart "${MODULE_NAME}.service"

printf 'Verifying mounted frontend config\n'
test -s "${REMOTE_CONFIG}"

printf 'Verifying HTTP frontend config\n'
curl -fsS "http://127.0.0.1/modules/${MODULE_NAME}/config.js" >/dev/null

printf 'Verifying backend target-version endpoint\n'
for i in {1..10}; do
  if curl -fsS "http://127.0.0.1/v2/api/rt/target-version" 2>/dev/null; then
    break
  fi

  if [[ "${i}" == "10" ]]; then
    curl -fsS "http://127.0.0.1/v2/api/rt/target-version" >/dev/null
    exit 1
  fi

  sleep 1
done
printf '\nDeploy verified\n'
REMOTE
