#!/usr/bin/env bash
#
# build-signed.sh — Build, sign, and package the Kentik datasource plugin.
#
# Usage:
#   GRAFANA_API_KEY=<key> ./scripts/build-signed.sh [OPTIONS]
#
# Options:
#   --version <ver>   Version label for the archive (default: "dev")
#   --root-urls <url> Restrict signing to specific Grafana root URLs
#
# Environment:
#   GRAFANA_API_KEY   (required) Grafana Cloud API key for signing
#
# Output:
#   kentik-datasource-<version>.zip
#
set -euo pipefail

PLUGIN_ID="kentik-datasource"
VERSION="dev"
SIGN_ARGS=""

# ── Parse arguments ──────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --version)
      VERSION="$2"
      shift 2
      ;;
    --root-urls)
      SIGN_ARGS="--rootUrls $2"
      shift 2
      ;;
    *)
      echo "Unknown option: $1" >&2
      exit 1
      ;;
  esac
done

# ── Validate ─────────────────────────────────────────────────────
if [[ -z "${GRAFANA_API_KEY:-}" ]]; then
  echo "Error: GRAFANA_API_KEY is not set." >&2
  echo "Usage: GRAFANA_API_KEY=<key> $0 [--version <ver>] [--root-urls <url>]" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_DIR"

echo "── Building plugin ────────────────────────────────────────"
npm run build

echo "── Signing plugin ─────────────────────────────────────────"
export GRAFANA_API_KEY
npx @grafana/sign-plugin@latest --signatureType=commercial $SIGN_ARGS

echo "── Packaging ──────────────────────────────────────────────"
ARCHIVE="${PLUGIN_ID}-${VERSION}.zip"
rm -rf "$PLUGIN_ID"
cp -r dist "$PLUGIN_ID"
zip -r "$ARCHIVE" "$PLUGIN_ID"
rm -rf "$PLUGIN_ID"

echo ""
echo "✅ Build complete: $ARCHIVE"
