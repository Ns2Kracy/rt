#!/usr/bin/env bash
set -euo pipefail

MODULE_NAME="zimaos-login-demo"
RAW_DIR="${RAW_DIR:-raw}"
OUT="${OUT:-${MODULE_NAME}.raw}"
GOOS_VALUE="${GOOS:-linux}"
GOARCH_VALUE="${GOARCH:-amd64}"
GOCACHE="${GOCACHE:-$(pwd)/.cache/go-build}"
BUILD_ID="${BUILD_ID:-$(date -u +%Y%m%dT%H%M%SZ)}"

mkdir -p "${RAW_DIR}/usr/bin"
rm -rf "${RAW_DIR}/usr/share/casaos/www/modules/${MODULE_NAME}"
mkdir -p "${RAW_DIR}/usr/share/casaos/www/modules/${MODULE_NAME}"
mkdir -p "${GOCACHE}"

cp -R web/static/. "${RAW_DIR}/usr/share/casaos/www/modules/${MODULE_NAME}/"
sed "s/__BUILD_ID__/${BUILD_ID}/g" web/static/index.html \
  > "${RAW_DIR}/usr/share/casaos/www/modules/${MODULE_NAME}/index.html"
printf 'window.DEMO_CONFIG = {buildID: "%s", localVersion: "%s"};\n' "${BUILD_ID}" "v1.0.0" \
  > "${RAW_DIR}/usr/share/casaos/www/modules/${MODULE_NAME}/config.js"

manifest="${RAW_DIR}/usr/share/casaos/modules/${MODULE_NAME}.json"
tmp_manifest="$(mktemp)"
sed -E "s#\"entry\": \"/modules/${MODULE_NAME}/index.html([^\"]*)\"#\"entry\": \"/modules/${MODULE_NAME}/index.html?build=${BUILD_ID}\"#" \
  "${manifest}" > "${tmp_manifest}"
mv "${tmp_manifest}" "${manifest}"

CGO_ENABLED=0 GOCACHE="${GOCACHE}" GOOS="${GOOS_VALUE}" GOARCH="${GOARCH_VALUE}" \
  go build -trimpath -ldflags="-s -w -X main.buildID=${BUILD_ID}" \
  -o "${RAW_DIR}/usr/bin/${MODULE_NAME}" .

if ! command -v mksquashfs >/dev/null 2>&1; then
  printf 'mksquashfs is required to create %s. Install squashfs-tools and rerun this script.\n' "${OUT}" >&2
  exit 127
fi

rm -f "${OUT}"
mksquashfs "${RAW_DIR}/" "${OUT}" -noappend -no-xattrs
printf 'Created %s\n' "${OUT}"
