#!/usr/bin/env bash
set -euo pipefail

MODULE_NAME="zimaos-login-demo"
SKELETON_DIR="${SKELETON_DIR:-raw}"
RAW_DIR="${RAW_DIR:-$(mktemp -d "${TMPDIR:-/tmp}/${MODULE_NAME}-raw-root.XXXXXX")}"
OUT="${OUT:-${MODULE_NAME}.raw}"
GOOS_VALUE="${GOOS:-linux}"
GOARCH_VALUE="${GOARCH:-amd64}"
GOCACHE="${GOCACHE:-$(pwd)/.cache/go-build}"

rm -rf "${RAW_DIR}/usr/bin" "${RAW_DIR}/usr/share"
mkdir -p "${RAW_DIR}/usr/bin"
mkdir -p "${RAW_DIR}/usr/share/casaos/modules"
mkdir -p "${RAW_DIR}/usr/share/casaos/www/modules/${MODULE_NAME}"
mkdir -p "${GOCACHE}"

cp -R "${SKELETON_DIR}/usr/lib" "${RAW_DIR}/usr/"
cp -R web/static/. "${RAW_DIR}/usr/share/casaos/www/modules/${MODULE_NAME}/"
printf 'window.DEMO_CONFIG = {localVersion: "%s"};\n' "v1.0.0" \
  > "${RAW_DIR}/usr/share/casaos/www/modules/${MODULE_NAME}/config.js"

manifest="${RAW_DIR}/usr/share/casaos/modules/${MODULE_NAME}.json"
cat > "${manifest}" <<EOF
{
  "name": "${MODULE_NAME}",
  "version": "v1.0.0",
  "ui": {
    "name": "${MODULE_NAME}",
    "title": {
      "en_us": "ZimaOS Login Demo",
      "zh_cn": "ZimaOS \u767b\u5f55\u6f14\u793a"
    },
    "prefetch": false,
    "show": true,
    "entry": "/modules/${MODULE_NAME}/index.html",
    "icon": "/modules/${MODULE_NAME}/logo.svg",
    "description": "Demo module for CasaOS and ZimaOS raw package, API, token, and WebSocket testing",
    "formality": {
      "type": "newtab",
      "props": {
        "width": "100vh",
        "height": "100vh",
        "hasModalCard": true,
        "animation": "zoom-in"
      }
    }
  },
  "services": [
    {
      "name": "${MODULE_NAME}"
    }
  ]
}
EOF

CGO_ENABLED=0 GOCACHE="${GOCACHE}" GOOS="${GOOS_VALUE}" GOARCH="${GOARCH_VALUE}" \
  go build -trimpath -ldflags="-s -w" \
  -o "${RAW_DIR}/usr/bin/${MODULE_NAME}" .

if ! command -v mksquashfs >/dev/null 2>&1; then
  printf 'mksquashfs is required to create %s. Install squashfs-tools and rerun this script.\n' "${OUT}" >&2
  exit 127
fi

rm -f "${OUT}"
mksquashfs "${RAW_DIR}/" "${OUT}" -noappend -no-xattrs
printf 'Created %s\n' "${OUT}"

