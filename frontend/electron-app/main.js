const { app, BrowserWindow, session, ipcMain } = require('electron')
const path   = require('path')
const { spawn, exec, execSync } = require('child_process')
const http   = require('http')
const fs     = require('fs')

// ── Режим ────────────────────────────────────────────────────
const isDev = !app.isPackaged

// ── Пути ─────────────────────────────────────────────────────
const BACKEND_DIR = isDev
  ? path.join(__dirname, '../../backend')
  : path.join(process.resourcesPath, 'backend')

const FRONTEND_DIST = isDev
  ? null   // dev: грузим http://localhost:5173
  : path.join(process.resourcesPath, 'frontend', 'index.html')

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
//  NEO4J AUTO-START
// ─────────────────────────────────────────────────────────────
function isPortOpen(port) {
  return new Promise((resolve) => {
    const req = http.request(
      { hostname: '127.0.0.1', port: 7474, path: '/', method: 'GET', timeout: 1500 },
      () => resolve(true)
    )
    req.on('error',   () => resolve(false))
    req.on('timeout', () => { req.destroy(); resolve(false) })
    req.end()
  })
}

function tryStartNeo4jService() {
  return new Promise((resolve) => {
    // Пробуем имена сервиса по очереди
    const attempts = [
      'net start neo4j',
      'net start "Neo4j Graph Database - neo4j"',
    ]
    let idx = 0
    const next = () => {
      if (idx >= attempts.length) { resolve(false); return }
      exec(attempts[idx++], (err) => {
        if (!err) { resolve(true) }
        else next()
      })
    }
    next()
  })
}

function findNeo4jBat() {
  const candidates = [
    process.env['NEO4J_HOME'] && path.join(process.env['NEO4J_HOME'], 'bin', 'neo4j.bat'),
    'C:\\neo4j\\bin\\neo4j.bat',
    'C:\\Program Files\\Neo4j\\bin\\neo4j.bat',
    path.join(process.env['LOCALAPPDATA'] || '', 'Programs', 'neo4j', 'bin', 'neo4j.bat'),
  ].filter(Boolean)

  return candidates.find(p => fs.existsSync(p)) || null
}

async function ensureNeo4j() {
  setSplashStatus('Проверяю Neo4j...', 20)

  // Уже запущен?
  if (await isPortOpen(7474)) {
    setSplashStatus('Neo4j уже работает ✓', 40)
    return true
  }

  setSplashStatus('Запускаю Neo4j...', 25)

  // Пробуем Windows Service
  const svcStarted = await tryStartNeo4jService()
  if (svcStarted) {
    setSplashStatus('Сервис Neo4j запускается...', 35)
  } else {
    // Пробуем neo4j.bat console
    const batPath = findNeo4jBat()
    if (batPath) {
      setSplashStatus('Запускаю Neo4j (bat)...', 35)
      spawn('cmd', ['/c', batPath, 'console'], { detached: true, stdio: 'ignore' }).unref()
    } else {
      setSplashStatus('⚠ Не нашёл Neo4j — жди или запусти вручную', 35)
    }
  }

  // Ждём до 30 секунд
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 1000))
    setSplashStatus(`Жду Neo4j... (${i + 1}/30)`, 35 + i)
    if (await isPortOpen(7474)) {
      setSplashStatus('Neo4j готов ✓', 65)
      return true
    }
  }

  setSplashStatus('⚠ Neo4j не ответил — продолжаю без него', 65)
  return false
}

// ─────────────────────────────────────────────────────────────
//  PYTHON BACKEND
// ─────────────────────────────────────────────────────────────

// Ищем рабочий Python-интерпретатор
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

function startPythonBackend() {
  setSplashStatus('Запускаю backend...', 68)

  const pyExe = findPython()
  if (!pyExe) {
    console.error('[py] Python не найден! Установи Python и добавь в PATH.')
    setSplashStatus('Python не найден — установи Python 3', 68)
    return
  }

  console.log(`[py] Starting backend with: ${pyExe}`)

  pythonProcess = spawn(
    pyExe,
    ['-m', 'uvicorn', 'main:app', '--host', '127.0.0.1', '--port', '8000'],
    {
      cwd: BACKEND_DIR,
      env: {
        ...process.env,
        NO_PROXY:                'localhost,127.0.0.1,::1',
        no_proxy:                'localhost,127.0.0.1,::1',
        PYTHONDONTWRITEBYTECODE: '1',
        PYTHONUNBUFFERED:        '1',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
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

  // 1. Neo4j
  await ensureNeo4j()

  // 2. Python backend
  startPythonBackend()
  const backendReady = await waitForBackend(30)
  if (backendReady) {
    setSplashStatus('Backend готов ✓', 90)
  } else {
    setSplashStatus('⚠ Backend не ответил — проверь Python', 90)
  }

  // 3. Главное окно
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
