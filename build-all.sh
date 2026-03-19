#!/bin/bash

set -e  # Exit on any error

echo "========================================"
echo "    Atracana - Complete Build Script"
echo "========================================"
echo

# Check if we're in the correct directory
if [ ! -d "server" ]; then
    echo "Error: server directory not found. Please run this script from the project root."
    exit 1
fi

if [ ! -d "app" ]; then
    echo "Error: app directory not found. Please run this script from the project root."
    exit 1
fi

# Detect platform
PLATFORM=$(uname -s)
case $PLATFORM in
    Darwin)
        DIST_COMMAND="dist:mac"
        PLATFORM_NAME="macOS"
        ;;
    Linux)
        DIST_COMMAND="dist:linux"
        PLATFORM_NAME="Linux"
        ;;
    *)
        echo "Error: Unsupported platform: $PLATFORM"
        exit 1
        ;;
esac

echo "Building for platform: $PLATFORM_NAME"
echo

# Build Backend
echo "[1/3] Building Python Backend..."
echo "====================================="
cd server
chmod +x build_unix.sh
./build_unix.sh
cd ..
echo

# Build Frontend
echo "[2/3] Building Electron Frontend..."
echo "==================================="
cd app
echo "Installing dependencies..."
pnpm install

echo "Building frontend..."
pnpm build
cd ..
echo

# Package Application
echo "[3/3] Packaging Application..."
echo "=============================="
cd app
pnpm $DIST_COMMAND
cd ..

echo
echo "========================================"
echo "    Build Complete!"
echo "========================================"
echo
echo "The packaged application can be found in:"
echo "  app/dist/"
echo
echo "Backend executable location:"
echo "  server/dist/server"
echo