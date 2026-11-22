#!/usr/bin/env python3
"""
Build script for Facenox Face Detection Backend using PyInstaller
Handles cross-platform builds and optimization
"""

import argparse
import os
import platform
import shutil
import subprocess
import sys
import time
import venv
from pathlib import Path
from tempfile import TemporaryDirectory


BACKEND_DIR = Path(__file__).resolve().parent


def get_platform_info():
    """Get current platform information"""
    system = platform.system().lower()
    machine = platform.machine().lower()

    if system == "windows":
        return "win", "x64" if machine in ["amd64", "x86_64"] else "x86"
    elif system == "darwin":
        return "mac", "arm64" if machine == "arm64" else "x64"
    elif system == "linux":
        return "linux", "x64" if machine in ["amd64", "x86_64"] else machine
    else:
        return system, machine


def clean_build_dirs():
    """Clean previous build directories"""
    dirs_to_clean = ["build", "dist"]

    for dir_name in dirs_to_clean:
        dir_path = BACKEND_DIR / dir_name
        if dir_path.exists():
            print(f"Cleaning {dir_path}")
            shutil.rmtree(dir_path)


def build_backend(debug=False, onefile=True, clean=True):
    """Build the backend using PyInstaller"""

    print("Starting Facenox Backend Build Process")
    print("=" * 50)

    platform_name, arch = get_platform_info()
    print(f"Platform: {platform_name}-{arch}")

    pyinstaller_args = ["--clean", "--noconfirm"]
    if debug:
        pyinstaller_args.extend(["--debug", "all"])
    pyinstaller_args.append("facenox_backend.spec")
    start_time = time.time()

    try:
        with TemporaryDirectory(prefix="facenox-backend-build-") as build_dir:
            print("Preparing isolated build environment...", flush=True)
            venv.EnvBuilder(with_pip=True).create(build_dir)
            executable = (
                "Scripts/python.exe" if sys.platform == "win32" else "bin/python"
            )
            python = Path(build_dir) / executable
            subprocess.run(
                [python, "-I", "-m", "pip", "install", "-r", "requirements-build.txt"],
                cwd=BACKEND_DIR,
                check=True,
            )

            if clean:
                clean_build_dirs()

            print("Building backend... This may take several minutes", flush=True)
            subprocess.run(
                [python, "-I", "-m", "PyInstaller", *pyinstaller_args],
                cwd=BACKEND_DIR,
                check=True,
            )
    except Exception as e:
        print(f"[ERROR] Build error: {e}")
        return False

    build_time = time.time() - start_time
    print(f"[SUCCESS] Build completed successfully in {build_time:.1f} seconds")

    dist_dir = BACKEND_DIR / "dist"
    print(f"Output directory: {dist_dir}")
    for item in dist_dir.iterdir():
        if item.is_file():
            size_mb = item.stat().st_size / (1024 * 1024)
            print(f"   [FILE] {item.name} ({size_mb:.1f} MB)")
        elif item.is_dir():
            print(f"   [DIR] {item.name}/")

    return True


def test_executable():
    """Test the built executable"""
    platform_name, _ = get_platform_info()

    if platform_name == "win":
        exe_path = BACKEND_DIR / "dist" / "server.exe"
    else:
        exe_path = BACKEND_DIR / "dist" / "server"

    if not exe_path.exists():
        print("[ERROR] Executable not found")
        return False

    print("Testing executable...")

    try:
        with TemporaryDirectory(prefix="facenox-backend-smoke-") as smoke_dir:
            env = dict(
                os.environ, FACENOX_DATA_DIR=smoke_dir, FACENOX_LOG_DIR=smoke_dir
            )
            env.pop("FACENOX_ACTIVE_DB_PATH", None)
            env.pop("FACENOX_LEGACY_DATA_DIR", None)
            result = subprocess.run(
                [str(exe_path), "--help"],
                capture_output=True,
                text=True,
                timeout=60,
                env=env,
            )

        if result.returncode == 0:
            print("[SUCCESS] Executable test passed")
            return True
        else:
            print("[ERROR] Executable test failed")
            print("STDERR:", result.stderr)
            return False

    except subprocess.TimeoutExpired:
        print("[ERROR] Executable test timed out")
        return False
    except Exception as e:
        print(f"[ERROR] Executable test error: {e}")
        return False


def main():
    """Main entry point"""
    parser = argparse.ArgumentParser(
        description="Build Facenox Backend with PyInstaller"
    )
    parser.add_argument("--debug", action="store_true", help="Build in debug mode")
    parser.add_argument(
        "--onedir",
        action="store_true",
        help="Build as directory instead of single file",
    )
    parser.add_argument(
        "--no-clean", action="store_true", help="Don't clean build directories"
    )
    parser.add_argument(
        "--test", action="store_true", help="Test the executable after building"
    )

    args = parser.parse_args()

    success = build_backend(
        debug=args.debug, onefile=not args.onedir, clean=not args.no_clean
    )

    if success and args.test:
        success = test_executable()

    if success:
        print("\nBuild completed successfully!")
    else:
        print("\nBuild failed!")
        sys.exit(1)


if __name__ == "__main__":
    main()
