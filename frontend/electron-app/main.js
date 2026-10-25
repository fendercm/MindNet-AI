const { app, BrowserWindow, shell } = require('electron')
const path   = require('path')
const { spawn, execSync } = require('child_process')
const http   = require('http')

// ── Режим ────────────────────────────────────────────────────
const isDev = !app.isPackaged

// ── Пути ─────────────────────────────────────────────────────
const BACKEND_DIR = isDev
  ? path.join(__dirname, '../../backend')
  : path.join(process.resourcesPath, 'backend')

const FRONTEND_DIST = isDev
  ? null   // dev: грузим http://localhost:5173
  : path.join(process.resourcesPath, 'frontend', 'index.html')

// База и настройки пользователя: %APPDATA%\MindNet AI
const DATA_DIR = path.join(app.getPath('appData'), 'MindNet AI')

// ── Localhost не идёт через VPN ───────────────────────────────
app.commandLine.appendSwitch('proxy-bypass-list', 'localhost,127.0.0.1,::1')
app.commandLine.appendSwitch('no-proxy-server')

let mainWindow
let splashWindow
let pythonProcess

// ─────────────────────────────────────────────────────────────
//  SPLASH (экран загрузки)
// ─────────────────────────────────────────────────────────────
function createSplash() {
  splashWindow = new BrowserWindow({
    width:           420,
    height:          260,
    frame:           false,
    transparent:     false,
    resizable:       false,
    alwaysOnTop:     true,
    center:          true,
    backgroundColor: '#0a0a1a',
    webPreferences:  { nodeIntegration: true, contextIsolation: false },
  })

  const splashPath = app.isPackaged
    ? path.join(process.resourcesPath, 'app', 'splash.html')
    : path.join(__dirname, 'splash.html')

  splashWindow.loadFile(splashPath)
}

function setSplashStatus(text, pct) {
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.webContents.send('status', { text, pct })
  }
  console.log(`[${pct}%] ${text}`)
}

// ─────────────────────────────────────────────────────────────
//  BACKEND
// ─────────────────────────────────────────────────────────────

// Собранная версия: встроенный mindnet-backend.exe, Python не нужен.
// Дев-режим: системный Python + uvicorn из папки backend.
function findPython() {
  const candidates = ['py', 'python', 'python3']
  for (const cmd of candidates) {
    try {
      const out = execSync(`${cmd} --version`, { stdio: 'pipe', timeout: 3000 })
      console.log(`[py] Found: ${cmd} → ${out.toString().trim()}`)
      return cmd
    } catch {
      // попробуем следующий
    }
  }
  return null
}

function backendCommand() {
  if (!isDev) {
    return { cmd: path.join(BACKEND_DIR, 'mindnet-backend.exe'), args: [] }
  }
  const py = findPython()
  return py && { cmd: py, args: ['-m', 'uvicorn', 'main:app', '--host', '127.0.0.1', '--port', '8000'] }
}

function startPythonBackend() {
  setSplashStatus('Запускаю backend...', 40)

  const command = backendCommand()
  if (!command) {
    console.error('[py] Python не найден! Установи Python и добавь в PATH.')
    setSplashStatus('Python не найден — установи Python 3', 40)
    return
  }

  console.log(`[py] Starting backend: ${command.cmd}`)

  pythonProcess = spawn(
    command.cmd,
    command.args,
    {
      cwd: BACKEND_DIR,
      env: {
        ...process.env,
        MINDNET_DATA_DIR:        DATA_DIR,
        NO_PROXY:                'localhost,127.0.0.1,::1',
        no_proxy:                'localhost,127.0.0.1,::1',
        PYTHONDONTWRITEBYTECODE: '1',
        PYTHONUNBUFFERED:        '1',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    }
  )

  pythonProcess.stdout.on('data', d => process.stdout.write(`[py] ${d}`))
  pythonProcess.stderr.on('data', d => process.stderr.write(`[py] ${d}`))

  pythonProcess.on('error', err => {
    console.error(`[py] Ошибка запуска: ${err.message}`)
  })

  pythonProcess.on('exit', (code) => {
    if (code !== 0 && code !== null) {
      console.error(`[py] Backend завершился с кодом ${code}`)
    }
  })
}

function waitForBackend(maxSec = 30) {
  return new Promise((resolve) => {
    let elapsed = 0
    const check = () => {
      http.get('http://127.0.0.1:8000/', (res) => {
        if (res.statusCode < 500) resolve(true)
        else retry()
      }).on('error', retry)

      function retry() {
        elapsed++
        if (elapsed >= maxSec) { resolve(false); return }
        setSplashStatus(`Жду backend... (${elapsed}/${maxSec})`, 70 + elapsed)
        setTimeout(check, 1000)
      }
    }
    check()
  })
}

// ─────────────────────────────────────────────────────────────
//  MAIN WINDOW
// ─────────────────────────────────────────────────────────────
function createMainWindow() {
  mainWindow = new BrowserWindow({
    width:          1400,
    height:         900,
    show:           false,   // показываем после загрузки
    backgroundColor:'#0f0f23',
    webPreferences: {
      nodeIntegration:  true,
      contextIsolation: false,
    },
    icon: path.join(__dirname, 'icon.png'),
  })

  // Bypass прокси для localhost запросов
  mainWindow.webContents.session.setProxy({
    proxyBypassRules: 'localhost,127.0.0.1,::1',
  }).catch(() => {})

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(FRONTEND_DIST)
  }

  // Внешние ссылки (например «где взять ключ») — в системный браузер
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('http://')) shell.openExternal(url)
    return { action: 'deny' }
  })

  mainWindow.on('closed', () => { mainWindow = null })

  return new Promise((resolve) => {
    mainWindow.webContents.once('did-finish-load', resolve)
  })
}

// ─────────────────────────────────────────────────────────────
//  ЗАПУСК
// ─────────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  createSplash()
  await new Promise(r => setTimeout(r, 300))   // дождёмся рендера splash

  setSplashStatus('Запуск...', 10)

  // 1. Backend
  startPythonBackend()
  const backendReady = await waitForBackend(30)
  if (backendReady) {
    setSplashStatus('Backend готов ✓', 90)
  } else {
    setSplashStatus(isDev ? '⚠ Backend не ответил — проверь Python' : '⚠ Backend не ответил', 90)
  }

  // 2. Главное окно
  setSplashStatus('Открываю приложение...', 95)
  await createMainWindow()

  setSplashStatus('Готово!', 100)
  await new Promise(r => setTimeout(r, 400))

  mainWindow.show()
  if (splashWindow && !splashWindow.isDestroyed()) splashWindow.close()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
  })
})

app.on('window-all-closed', () => {
  if (pythonProcess) pythonProcess.kill()
  if (process.platform !== 'darwin') app.quit()
})

app.on('quit', () => {
  if (pythonProcess) pythonProcess.kill()
})
