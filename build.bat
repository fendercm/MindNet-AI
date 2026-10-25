@echo off
chcp 65001 >nul
title MindNet AI Build
cd /d "%~dp0"

:: Usage: build.bat [--no-pause]
::   --no-pause   do not wait for a key press / open Explorer (CI, scripts)
:: Needs Node.js 18+ and Python 3.10+ on the build machine; users need nothing.
set "NO_PAUSE=0"
if /i "%~1"=="--no-pause" set "NO_PAUSE=1"

echo.
echo  [MindNet AI] Building desktop app...
echo.

:: Install frontend deps
echo  [1/4] Installing frontend dependencies...
cd frontend
call npm install --silent
if errorlevel 1 ( echo ERROR: npm install failed & goto fail )

:: Build React
echo  [2/4] Building React (Vite)...
call npm run build
if errorlevel 1 ( echo ERROR: vite build failed & goto fail )
cd ..

:: Install electron deps
echo  [3/4] Installing Electron dependencies...
cd frontend\electron-app
call npm install --silent
if errorlevel 1 ( echo ERROR: electron npm install failed & goto fail )
cd ..\..

:: Package app + zip
echo  [4/4] Building backend.exe and packaging app...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0package.ps1"
if errorlevel 1 ( echo ERROR: packaging failed & goto fail )

echo.
echo  Done!
echo.
echo  Run: frontend\electron-app\release\MindNet AI\MindNet AI.exe
echo.

if "%NO_PAUSE%"=="0" (
    start "" "frontend\electron-app\release\MindNet AI"
    pause
)
exit /b 0

:fail
if "%NO_PAUSE%"=="0" pause
exit /b 1
