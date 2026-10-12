const { app, BrowserWindow, globalShortcut, ipcMain } = require('electron')
const path = require('path')
const fs = require('fs')

app.commandLine.appendSwitch('disable-gpu')

let win

const dataPath = path.join(app.getPath('userData'), 'scripts.json')

function initFile() {
  if (!fs.existsSync(dataPath)) {
    fs.writeFileSync(dataPath, JSON.stringify([]))
  }
}

function createWindow() {
  win = new BrowserWindow({
    width: 360,
    height: 140,
    x: 200,
    y: 200,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    resizable: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  })

  win.loadFile('index.html')
  win.show()
}

app.whenReady().then(() => {
  initFile()
  createWindow()

  globalShortcut.register('CommandOrControl+Shift+T', () => {
    win.isVisible() ? win.hide() : win.show()
  })
})

ipcMain.handle('read-scripts', () => {
  return JSON.parse(fs.readFileSync(dataPath))
})

ipcMain.handle('write-scripts', (event, scripts) => {
  fs.writeFileSync(dataPath, JSON.stringify(scripts, null, 2))
})

ipcMain.on('hide-window', () => {
  if (win) win.hide()
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
})