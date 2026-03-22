const { app, BrowserWindow } = require('electron')
const path = require('path')
const { spawn } = require('child_process')

let mainWindow
let pythonProcess

function createWindow () {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    },
    icon: path.join(__dirname, 'icon.png')
  })

  // В разработке - localhost
  mainWindow.loadURL('http://localhost:5173')
  mainWindow.webContents.openDevTools()

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

function startPythonBackend() {
  // Запускаем Python backend
  const backendPath = path.join(__dirname, '../../backend')
  pythonProcess = spawn('python', ['-m', 'uvicorn', 'main:app', '--reload'], {
    cwd: backendPath
  })

  pythonProcess.stdout.on('data', (data) => {
    console.log(`Python: ${data}`)
  })

  pythonProcess.stderr.on('data', (data) => {
    console.error(`Python Error: ${data}`)
  })
}

app.whenReady().then(() => {
  startPythonBackend()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (pythonProcess) {
    pythonProcess.kill()
  }
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('quit', () => {
  if (pythonProcess) {
    pythonProcess.kill()
  }
})