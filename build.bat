@echo off
chcp 65001 >nul
title MindNet AI Build

echo.
echo  [MindNet AI] Building desktop app...
echo.

:: Check .env
if not exist "backend\.env" (
    echo  [!] backend\.env not found - creating from template...
    copy "backend\.env.example" "backend\.env" >nul
    echo.
    echo  Open backend\.env and fill in your API keys, then run build.bat again.
    echo.
    start notepad "backend\.env"
    pause
    exit /b 1
)

:: Install frontend deps
echo  [1/4] Installing frontend dependencies...
cd frontend
call npm install --silent
if errorlevel 1 ( echo ERROR: npm install failed & pause & exit /b 1 )

:: Build React
echo  [2/4] Building React (Vite)...
call npm run build
if errorlevel 1 ( echo ERROR: vite build failed & pause & exit /b 1 )
cd ..

:: Install electron deps
echo  [3/4] Installing Electron dependencies...
cd frontend\electron-app
call npm install --silent
if errorlevel 1 ( echo ERROR: electron npm install failed & pause & exit /b 1 )
cd ..\..

:: Package app via PowerShell
echo  [4/4] Packaging app...
powershell -ExecutionPolicy Bypass -Command ^
  "$Root='%CD%'; $OutDir=\"$Root\frontend\electron-app\release\MindNet AI\"; ^
   $ElectronSrc=\"$Root\frontend\electron-app\node_modules\electron\dist\"; ^
   $FrontendDist=\"$Root\frontend\dist\"; ^
   $BackendSrc=\"$Root\backend\"; ^
   if (Test-Path $OutDir) { Remove-Item $OutDir -Recurse -Force }; ^
   New-Item -ItemType Directory -Path $OutDir | Out-Null; ^
   Copy-Item \"$ElectronSrc\*\" $OutDir -Recurse -Force; ^
   $Res=\"$OutDir\resources\"; ^
   New-Item -ItemType Directory -Path \"$Res\app\" -Force | Out-Null; ^
   Copy-Item \"$Root\frontend\electron-app\main.js\" \"$Res\app\main.js\" -Force; ^
   '{\"name\":\"mindnet-ai\",\"version\":\"1.0.0\",\"main\":\"main.js\"}' | Set-Content \"$Res\app\package.json\" -Encoding UTF8; ^
   Copy-Item $FrontendDist \"$Res\frontend\" -Recurse -Force; ^
   New-Item -ItemType Directory -Path \"$Res\backend\" -Force | Out-Null; ^
   Get-ChildItem $BackendSrc -File -Filter '*.py' | Copy-Item -Destination \"$Res\backend\" -Force; ^
   Copy-Item \"$BackendSrc\.env\" \"$Res\backend\\" -Force; ^
   if (Test-Path \"$BackendSrc\requirements.txt\") { Copy-Item \"$BackendSrc\requirements.txt\" \"$Res\backend\\\" -Force }; ^
   Rename-Item \"$OutDir\electron.exe\" 'MindNet AI.exe' -Force; ^
   Write-Host 'Done!'"

if errorlevel 1 ( echo ERROR: packaging failed & pause & exit /b 1 )

echo.
echo  Done!
echo.
echo  Run: frontend\electron-app\release\MindNet AI\MindNet AI.exe
echo.

start "" "frontend\electron-app\release\MindNet AI"
pause
