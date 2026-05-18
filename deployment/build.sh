#!/usr/bin/env bash
set -e
set +x

trap "cd $(pwd -P)" EXIT
cd "$(dirname "$0")"
SCRIPT_PATH=$(pwd)

# 1. Configuration
SRC="${SCRIPT_PATH}/../lib/cli.js"
DIST="${SCRIPT_PATH}/dist"
NAME="flakiness-junit-xml"

# 2. Define Build Functions
# We define functions to avoid code repetition and allow easy composition for "all"

build_win() {
  echo "🏗️  Building for Windows (x64)..."
  bun build "$SRC" --compile --minify --target=bun-windows-x64 --outfile "$DIST/${NAME}-win-x64.exe"
}

build_linux() {
  echo "🏗️  Building for Linux (x64)..."
  bun build "$SRC" --compile --minify --target=bun-linux-x64 --outfile "$DIST/${NAME}-linux-x64"
}

build_alpine() {
  echo "🏗️  Building for Alpine (Linux x64 musl)..."
  bun build "$SRC" --compile --minify --target=bun-linux-x64-musl --outfile "$DIST/${NAME}-linux-x64-alpine"
}

build_mac() {
  echo "🏗️  Building for macOS (Arm64)..."
  bun build "$SRC" --compile --minify --target=bun-darwin-arm64 --outfile "$DIST/${NAME}-macos-arm64"
}

build_mac_intel() {
  echo "🏗️  Building for macOS (Intel x64)..."
  bun build "$SRC" --compile --minify --target=bun-darwin-x64 --outfile "$DIST/${NAME}-macos-x64"
}

build_linux_arm() {
  echo "🏗️  Building for Linux (Arm64)..."
  bun build "$SRC" --compile --minify --target=bun-linux-arm64 --outfile "$DIST/${NAME}-linux-arm64"
}

build_alpine_arm() {
  echo "🏗️  Building for Alpine ARM64 (Linux arm64 musl)..."
  bun build "$SRC" --compile --minify --target=bun-linux-arm64-musl --outfile "$DIST/${NAME}-linux-arm64-alpine"
}

build_all() {
  echo "🚀 Starting build for ALL targets..."
  build_win
  build_linux
  build_linux_arm
  build_alpine
  build_alpine_arm
  build_mac
  build_mac_intel
  echo "✅ All builds complete."
}

# 3. Handle Arguments
# $1 is the first argument passed to the script

if ! command -v bun >/dev/null; then
  echo "Please install bun first"
  exit 1
fi

# Ensure dist directory exists and clean
rm -rf "$DIST"
mkdir -p "$DIST"

case "$1" in
  "win")
    build_win
    ;;
  "linux")
    build_linux
    ;;
  "linux_arm")
    build_linux_arm
    ;;
  "alpine")
    build_alpine
    ;;
  "mac")
    build_mac
    ;;
  "mac_intel")
    build_mac_intel
    ;;
  "alpine_arm")
    build_alpine_arm
    ;;
  "all")
    build_all
    ;;
  *)
    echo "❌ Error: Invalid argument."
    echo "Usage: ./build.sh [target]"
    echo "Available targets: win, linux, linux_arm, alpine, alpine_arm, mac, mac_intel, all"
    exit 1
    ;;
esac
