@echo off
title Green Touch Pro - Setup
color 0A
echo.
echo ========================================
echo   Green Touch Pro - First Time Setup
echo ========================================
echo.

:: Check Node.js
where node >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Node.js not found.
    echo Please install Node.js from https://nodejs.org/
    echo Choose the LTS version. Restart this file after install.
    pause
    exit /b 1
)
echo [OK] Node.js found:
node -v

:: Install dependencies if missing
if not exist "node_modules" (
    echo.
    echo Installing dependencies (this takes 1-2 minutes)...
    call npm install
    if %ERRORLEVEL% NEQ 0 (
        echo [ERROR] npm install failed. Check your internet connection.
        pause
        exit /b 1
    )
    echo [OK] Dependencies installed.
)

:: Get OpenRouter key
echo.
echo ========================================
echo   OpenRouter API Key
echo ========================================
echo.
echo Get a FREE key at: https://openrouter.ai/keys
echo (Sign in, click "Create Key", copy it)
echo.
echo PASTE YOUR KEY BELOW (it will be hidden):
set /p OPENROUTER_KEY="sk-or-v1-..."

:: Write to server\.env
if not exist "server" mkdir server
(
echo PORT=4000
echo JWT_SECRET=change-this-in-production
echo LLM_PROVIDER=openrouter
echo LLM_BASE_URL=https://openrouter.ai/api/v1
echo LLM_MODEL=google/gemma-4-31b-it:free
echo LLM_API_KEY=%OPENROUTER_KEY%
) > server\.env
echo [OK] Key saved to server\.env

:: Start the app
echo.
echo ========================================
echo   Starting Green Touch Pro
echo ========================================
echo.
echo Backend:  http://localhost:4000
echo Frontend: http://localhost:5173
echo.
echo LOGIN:
echo   Email:    assignedvisionary@gmail.com
echo   Password: demo123
echo.
echo Press Ctrl+C in each window to stop.
echo.

:: Start backend in new window
start "Green Touch Pro - Backend" cmd /k "cd server && node index.js"
timeout /t 3 >nul

:: Start frontend in new window
start "Green Touch Pro - Frontend" cmd /k "npm run dev"

echo.
echo Two windows opened. Give it 10 seconds then go to:
echo   http://localhost:5173
echo.
echo If browser doesn't open automatically:
echo   1. Wait 15 seconds
echo   2. Open http://localhost:5173 in Chrome/Edge
echo.
pause
