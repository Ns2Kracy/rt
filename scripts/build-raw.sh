#!/usr/bin/env bash
set -euo pipefail

MODULE_NAME="rt"
SKELETON_DIR="${SKELETON_DIR:-raw}"
RAW_DIR="${RAW_DIR:-$(mktemp -d "${TMPDIR:-/tmp}/${MODULE_NAME}-raw-root.XXXXXX")}"
OUT="${OUT:-${MODULE_NAME}.raw}"
GOOS_VALUE="${GOOS:-linux}"
GOARCH_VALUE="${GOARCH:-amd64}"
GOCACHE="${GOCACHE:-$(pwd)/.cache/go-build}"
FRONTEND_OUT_DIR="${RAW_DIR}/usr/share/casaos/www/modules/${MODULE_NAME}"

if ! command -v bun >/dev/null 2>&1; then
  printf 'bun is required to build frontend assets. Install Bun and rerun this script.\n' >&2
  exit 127
fi

if [ -f web/bun.lock ]; then
  (cd web && bun install --frozen-lockfile)
else
  (cd web && bun install)
fi

rm -rf "${RAW_DIR}/usr/bin" "${RAW_DIR}/usr/share"
mkdir -p "${RAW_DIR}/usr/bin"
mkdir -p "${FRONTEND_OUT_DIR}"
mkdir -p "${GOCACHE}"

cp -R "${SKELETON_DIR}/usr/." "${RAW_DIR}/usr/"
(cd web && bun run build -- --outDir "${FRONTEND_OUT_DIR}")
printf 'window.DEMO_CONFIG = {localVersion: "%s"};\n' "v1.0.1" \
  > "${FRONTEND_OUT_DIR}/config.js"

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
