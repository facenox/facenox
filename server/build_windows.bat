@echo off
REM Build script for Facenox Backend on Windows
REM This script builds the Python backend into a standalone executable

echo ========================================
echo Facenox Backend Build Script - Windows
echo ========================================

REM Check if Python is available
python --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Python is not installed or not in PATH
    echo Please install Python 3.8+ and try again
    pause
    exit /b 1
)

REM Check if we're in the right directory
if not exist "main.py" (
    echo ERROR: main.py not found
    echo Please run this script from the backend directory
    pause
    exit /b 1
)

REM Run the build script
echo Starting build process...
python build_backend.py --test

if errorlevel 1 (
    echo BUILD FAILED!
    pause
    exit /b 1
)

echo.
echo ========================================
echo Build completed successfully!
echo ========================================
echo.
echo The executable is located in: dist\server.exe
echo You can now integrate it with your Electron app.
echo.

pause
