@echo off
setlocal enabledelayedexpansion

echo ========================================
echo    Facenox - Development Mode
echo ========================================
echo.


if not exist "server" (
    echo Error: server directory not found. Please run this script from the project root.
    pause
    exit /b 1
)

if not exist "app" (
    echo Error: app directory not found. Please run this script from the project root.
    pause
    exit /b 1
)

echo Starting development servers...
echo.


echo Starting Python server...
start "Facenox Server" cmd /k "cd server && python run.py"


timeout /t 3 /nobreak > nul


echo Starting Electron frontend...
cd app
call pnpm dev

echo.
echo Development servers stopped.
pause