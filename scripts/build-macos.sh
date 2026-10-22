#!/usr/bin/env bash
# Build the native macOS menu bar helper and package it as an app bundle.
#
#   ./scripts/build-macos.sh          build only
#   ./scripts/build-macos.sh --open   build and launch
#
# The app talks to the ONCE backend on http://localhost:8000 by default. Set
# ONCE_API_URL and ONCE_WEB_URL to point at a deployed stack when launching from
# a terminal.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PKG="$ROOT/macos/OnceWindow"
APP="$ROOT/macos/ONCEWindow.app"

echo "Building ONCE Window Guide..."
swift build -c release --package-path "$PKG"

rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
cp "$PKG/.build/release/OnceWindow" "$APP/Contents/MacOS/OnceWindow"
cp "$PKG/Info.plist" "$APP/Contents/Info.plist"
printf 'APPL????' > "$APP/Contents/PkgInfo"

# Ad-hoc signing is enough for local use. It also gives Screen Recording
# privacy a stable app identity instead of an anonymous command-line binary.
codesign --force --deep --sign - "$APP" >/dev/null 2>&1 || true

echo "Built: $APP"
echo "Open it, click the eye in the menu bar, and grant Screen Recording,"
echo "Microphone and Speech Recognition when macOS asks."
echo "If macOS does not show a prompt, open System Settings, Privacy & Security,"
echo "and add ONCE Window Guide in that pane."

if [[ "${1:-}" == "--open" ]]; then
  open "$APP"
fi
