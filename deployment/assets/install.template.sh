#!/bin/sh
set -e

# flakiness-junit-xml installer script
#
# This is a TEMPLATE. The release workflow renders it into install.sh by
# replacing {{RELEASE_BASE_URL}} with this release's download URL, so the
# uploaded installer always pins to the exact release it ships with.
# Running this template file directly will not work — use the published
# installer:
#   curl -fsSL https://github.com/flakiness/junit-xml/releases/latest/download/install.sh | sh

BASE_URL="{{RELEASE_BASE_URL}}"
INSTALL_DIR="${INSTALL_DIR:-/usr/local/bin}"
BINARY_NAME="flakiness-junit-xml"

# Color output (only if we are in a terminal)
if [ -t 1 ]; then
    RED='\033[0;31m'
    GREEN='\033[0;32m'
    YELLOW='\033[1;33m'
    NC='\033[0m' # No Color
else
    RED=''
    GREEN=''
    YELLOW=''
    NC=''
fi

log_info() {
    printf "${GREEN}==>${NC} %s\n" "$1"
}

log_warn() {
    printf "${YELLOW}Warning:${NC} %s\n" "$1"
}

log_error() {
    printf "${RED}Error:${NC} %s\n" "$1"
}

# --- 1. Permission Checker ---
# Run this BEFORE downloading anything
check_permissions() {
    # 1. Check if INSTALL_DIR exists
    if [ ! -d "$INSTALL_DIR" ]; then
        log_warn "$INSTALL_DIR does not exist."
        # Try to create it to see if we have permissions
        if ! mkdir -p "$INSTALL_DIR" 2>/dev/null; then
             log_error "Could not create $INSTALL_DIR. Permission denied."
             log_error "Please run with sudo or set INSTALL_DIR to a writable path."
             log_error "Example: curl ... | sudo sh"
             exit 1
        fi
        # If we created it, we can write to it.
        return 0
    fi

    # 2. Check if we can write to the directory
    if [ ! -w "$INSTALL_DIR" ]; then
        log_error "Permission denied: You do not have write access to $INSTALL_DIR."
        log_error "Please run this script with sudo:"
        log_error "  curl -fsSL ${BASE_URL}/install.sh | sudo sh"
        log_error "Or install to a local directory:"
        log_error "  curl ... | INSTALL_DIR=\$HOME/.local/bin sh"
        exit 1
    fi
}

# --- 2. Setup Cleanup Trap ---
setup_tmp() {
    TEMP_DIR=$(mktemp -d)
    cleanup() {
        rm -rf "$TEMP_DIR"
    }
    trap cleanup EXIT
}

detect_platform() {
    OS=$(uname -s | tr '[:upper:]' '[:lower:]')
    ARCH=$(uname -m)

    case "$OS" in
        linux*)
            OS="linux"
            ;;
        darwin*)
            OS="macos"
            ;;
        mingw* | msys* | cygwin*)
            OS="win"
            ;;
        *)
            log_error "Unsupported operating system: $OS"
            exit 1
            ;;
    esac

    case "$ARCH" in
        x86_64 | amd64)
            ARCH="x64"
            ;;
        aarch64 | arm64)
            ARCH="arm64"
            ;;
        *)
            log_error "Unsupported architecture: $ARCH"
            exit 1
            ;;
    esac

    if [ "$OS" = "linux" ]; then
        if [ -f /etc/alpine-release ] || grep -q "Alpine" /etc/os-release 2>/dev/null; then
            FILENAME="${BINARY_NAME}-linux-${ARCH}-alpine.gz"
        else
            FILENAME="${BINARY_NAME}-linux-${ARCH}.gz"
        fi
    elif [ "$OS" = "macos" ]; then
        FILENAME="${BINARY_NAME}-macos-${ARCH}.gz"
    elif [ "$OS" = "win" ]; then
        # Bun has no windows-arm64 compile target, so we only ship win-x64.
        # Windows 11 on ARM runs the x64 binary via built-in emulation, so
        # always select x64 here (mirrors install.ps1).
        FILENAME="${BINARY_NAME}-win-x64.exe.gz"
        BINARY_NAME="${BINARY_NAME}.exe"
    fi

    log_info "Detected platform: $OS-$ARCH"
}

install_binary() {
    setup_tmp
    DOWNLOAD_URL="${BASE_URL}/${FILENAME}"
    TEMP_FILE="${TEMP_DIR}/${FILENAME}"

    log_info "Downloading from $DOWNLOAD_URL..."

    if command -v curl >/dev/null 2>&1; then
        curl -fsSL "$DOWNLOAD_URL" -o "$TEMP_FILE"
    elif command -v wget >/dev/null 2>&1; then
        wget -q "$DOWNLOAD_URL" -O "$TEMP_FILE"
    else
        log_error "Neither curl nor wget found. Please install one of them."
        exit 1
    fi

    BIN_TEMP="${TEMP_DIR}/${BINARY_NAME}"

    if echo "$FILENAME" | grep -q '\.gz$'; then
        log_info "Extracting archive..."
        if command -v gzip >/dev/null 2>&1; then
            gzip -d -c "$TEMP_FILE" > "$BIN_TEMP"
        else
            log_error "gzip not found. Please install gzip."
            exit 1
        fi
    else
        mv "$TEMP_FILE" "$BIN_TEMP"
    fi

    INSTALL_PATH="${INSTALL_DIR}/${BINARY_NAME}"
    log_info "Installing to $INSTALL_PATH..."

    # We already checked permissions, so we can just move
    mv "$BIN_TEMP" "$INSTALL_PATH"
    chmod +x "$INSTALL_PATH"

    # bun-compiled macOS binaries are not codesigned/notarized. A curl download
    # carries no quarantine xattr, but strip it defensively in case the user
    # piped a previously-quarantined file or runs on a hardened setup.
    if [ "$OS" = "macos" ] && command -v xattr >/dev/null 2>&1; then
        xattr -d com.apple.quarantine "$INSTALL_PATH" 2>/dev/null || true
    fi

    log_info "Successfully installed $BINARY_NAME to $INSTALL_PATH"

    if command -v "$BINARY_NAME" >/dev/null 2>&1; then
        log_info "✓ $BINARY_NAME is available in your PATH"
    else
        log_warn "✓ Installed, but $INSTALL_DIR is not in your PATH."
        printf "    Add it to your PATH by running:\n"
        printf "    export PATH=\"\$PATH:%s\"\n" "$INSTALL_DIR"
    fi
}

main() {
    log_info "Installing flakiness-junit-xml..."

    # 1. Pre-flight checks
    detect_platform
    check_permissions  # Fail fast if we can't write!

    # 2. Heavy lifting
    install_binary

    echo ""
    log_info "Installation complete! Run '$BINARY_NAME --help' to get started."
}

main
