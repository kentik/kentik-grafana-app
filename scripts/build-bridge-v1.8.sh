#!/usr/bin/env bash
# ------------------------------------------------------------------
#  build-bridge-v1.8.sh
#
#  Builds the kentik-connect-app v1.8.0 bridge plugin zip.
#  The bridge plugin declares a dependency on kentik-connect-datasource
#  so Grafana auto-installs the new datasource for existing users.
#
#  Usage:  ./scripts/build-bridge-v1.8.sh
#  Output: kentik-connect-app-1.8.0.zip
# ------------------------------------------------------------------
set -euo pipefail

PLUGIN_ID="kentik-connect-app"
VERSION="1.8.0"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
BRIDGE_DIR="$ROOT_DIR/bridge"
STAGE_DIR="$ROOT_DIR/bridge-dist/$PLUGIN_ID"
ZIP_FILE="$ROOT_DIR/$PLUGIN_ID-$VERSION.zip"

echo "==> Cleaning previous build …"
rm -rf "$ROOT_DIR/bridge-dist"
rm -f  "$ZIP_FILE"
mkdir -p "$STAGE_DIR/img"

# ---- module.js ---------------------------------------------------
echo "==> Generating module.js + source map …"
cp "$BRIDGE_DIR/src/module.js" "$STAGE_DIR/module.js"

# Generate a valid source map using node.  We read the source file,
# produce an identity mapping (each line/column maps to itself), and
# embed sourcesContent so the map is fully self-contained.
node -e "
const fs   = require('fs');
const repoSrc = fs.readFileSync('$BRIDGE_DIR/src/module.js', 'utf8');
const src  = fs.readFileSync('$STAGE_DIR/module.js', 'utf8');
const lines = src.split('\n');

// Build VLQ-encoded identity mappings.
// For an identity map every generated position equals its original position.
// We only need to map the first character of each line; tools will interpolate.

function toVLQ(value) {
  let result = '';
  let vlq = value < 0 ? ((-value) << 1) + 1 : (value << 1);
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  do {
    let digit = vlq & 0x1f;
    vlq >>>= 5;
    if (vlq > 0) digit |= 0x20;
    result += chars[digit];
  } while (vlq > 0);
  return result;
}

const segments = [];
let prevGenCol  = 0;
let prevSrcLine = 0;
let prevSrcCol  = 0;
// sourceIndex is always 0 (only one source file)

for (let i = 0; i < lines.length; i++) {
  if (lines[i].length === 0 && i === lines.length - 1) {
    // skip trailing empty line
    segments.push('');
    continue;
  }
  // Each line segment: [genCol, srcIdx, srcLine, srcCol]
  // All relative to previous values
  const genCol  = 0;
  const srcIdx  = 0;
  const srcLine = i;
  const srcCol  = 0;

  const dGenCol  = genCol  - prevGenCol;
  const dSrcIdx  = 0;  // always source 0
  const dSrcLine = srcLine - prevSrcLine;
  const dSrcCol  = srcCol  - prevSrcCol;

  segments.push(
    toVLQ(dGenCol) + toVLQ(dSrcIdx) + toVLQ(dSrcLine) + toVLQ(dSrcCol)
  );

  prevGenCol  = genCol;
  prevSrcLine = srcLine;
  prevSrcCol  = srcCol;

  // Reset genCol per line (mappings are relative within a line for genCol,
  // but reset across lines in the spec)
  prevGenCol = 0;
}

const map = {
  version       : 3,
  file          : 'module.js',
  sources       : ['bridge/src/module.js'],
  sourcesContent: [repoSrc],
  names         : [],
  mappings      : segments.join(';')
};

fs.writeFileSync('$STAGE_DIR/module.js.map', JSON.stringify(map));
"

# ---- Static assets ------------------------------------------------
echo "==> Copying static assets …"
cp "$BRIDGE_DIR/plugin.json"    "$STAGE_DIR/plugin.json"
cp "$BRIDGE_DIR/README.md"      "$STAGE_DIR/README.md"
cp "$ROOT_DIR/LICENSE"          "$STAGE_DIR/LICENSE"
cp "$ROOT_DIR/CHANGELOG.md"     "$STAGE_DIR/CHANGELOG.md"
cp "$ROOT_DIR/src/img/logo_small.png" "$STAGE_DIR/img/logo_small.png"
cp "$ROOT_DIR/src/img/logo_large.png" "$STAGE_DIR/img/logo_large.png"

# ---- package.json (minimal, version must match plugin.json) -------
cat > "$STAGE_DIR/package.json" <<PKGJSON
{
  "name": "$PLUGIN_ID",
  "version": "$VERSION",
  "private": true
}
PKGJSON

# ---- Zip ----------------------------------------------------------
echo "==> Creating $ZIP_FILE …"
cd "$ROOT_DIR/bridge-dist"
zip -r "$ZIP_FILE" "$PLUGIN_ID"

echo ""
echo "✅  Built $ZIP_FILE"
echo ""
echo "Contents:"
unzip -l "$ZIP_FILE"
