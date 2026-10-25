# Packages the built frontend, Electron runtime and a self-contained backend.exe into a portable folder + zip.
# Called by build.bat; expects `npm run build` and electron-app `npm install` to be done.
# Needs Python 3.10+ on the build machine only - users get everything inside the exe.
param(
    [string]$Version = '1.0.0'
)
$ErrorActionPreference = 'Stop'

$Root         = $PSScriptRoot
$AppSrc       = Join-Path $Root 'frontend\electron-app'
$ElectronSrc  = Join-Path $AppSrc 'node_modules\electron\dist'
$FrontendDist = Join-Path $Root 'frontend\dist'
$BackendSrc   = Join-Path $Root 'backend'
$BuildVenv    = Join-Path $BackendSrc '.build-venv'
$PyiOut       = Join-Path $BackendSrc 'build'
$Release      = Join-Path $AppSrc 'release'
$OutDir       = Join-Path $Release 'MindNet AI'
$Res          = Join-Path $OutDir 'resources'
$Zip          = Join-Path $Release "MindNet-AI-$Version-win-x64.zip"

if (-not (Test-Path (Join-Path $ElectronSrc 'electron.exe'))) { throw "Electron runtime not found: $ElectronSrc" }
if (-not (Test-Path (Join-Path $FrontendDist 'index.html')))  { throw "Frontend build not found: $FrontendDist" }

function Invoke-Checked([string]$Exe, [string[]]$Arguments) {
    & $Exe @Arguments
    if ($LASTEXITCODE -ne 0) { throw "$Exe failed with exit code $LASTEXITCODE" }
}

# ── Backend -> mindnet-backend.exe (PyInstaller, onedir: быстрый старт) ──
$VenvPy = Join-Path $BuildVenv 'Scripts\python.exe'
if (-not (Test-Path $VenvPy)) {
    Write-Host '  Creating backend build venv...'
    if (Get-Command py -ErrorAction SilentlyContinue) { Invoke-Checked 'py' @('-3', '-m', 'venv', $BuildVenv) }
    elseif (Get-Command python -ErrorAction SilentlyContinue) { Invoke-Checked 'python' @('-m', 'venv', $BuildVenv) }
    else { throw 'Python 3.10+ is required to build the backend (only on the build machine)' }
}
Write-Host '  Installing backend build dependencies...'
Invoke-Checked $VenvPy @('-m', 'pip', 'install', '--quiet', '--disable-pip-version-check',
    '-r', (Join-Path $BackendSrc 'requirements.txt'), 'pyinstaller>=6.10')
Write-Host '  Building mindnet-backend.exe...'
Invoke-Checked $VenvPy @('-m', 'PyInstaller', '--noconfirm', '--clean', '--log-level', 'WARN',
    '--name', 'mindnet-backend', '--onedir', '--console', '--collect-submodules', 'uvicorn',
    '--distpath', (Join-Path $PyiOut 'dist'), '--workpath', (Join-Path $PyiOut 'work'), '--specpath', $PyiOut,
    (Join-Path $BackendSrc 'main.py'))
$BackendExeDir = Join-Path $PyiOut 'dist\mindnet-backend'

# ── Layout ──
if (Test-Path $OutDir) { Remove-Item $OutDir -Recurse -Force }
New-Item -ItemType Directory -Path $OutDir | Out-Null
Copy-Item "$ElectronSrc\*" $OutDir -Recurse -Force
Remove-Item (Join-Path $Res 'default_app.asar') -Force -ErrorAction SilentlyContinue

# Electron app shell
$App = Join-Path $Res 'app'
New-Item -ItemType Directory -Path $App -Force | Out-Null
foreach ($f in 'main.js', 'splash.html', 'icon.png') { Copy-Item (Join-Path $AppSrc $f) $App -Force }
[IO.File]::WriteAllText((Join-Path $App 'package.json'),
    "{`"name`":`"mindnet-ai`",`"productName`":`"MindNet AI`",`"version`":`"$Version`",`"main`":`"main.js`"}")

# Frontend
Copy-Item $FrontendDist (Join-Path $Res 'frontend') -Recurse -Force

# Backend: self-contained exe, no Python / sources / .env shipped
Copy-Item $BackendExeDir (Join-Path $Res 'backend') -Recurse -Force

Rename-Item (Join-Path $OutDir 'electron.exe') 'MindNet AI.exe' -Force

if (Test-Path $Zip) { Remove-Item $Zip -Force }
Compress-Archive -Path $OutDir -DestinationPath $Zip -CompressionLevel Optimal

Write-Host "  Folder: $OutDir"
Write-Host "  Zip:    $Zip"
