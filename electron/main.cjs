// 桌面端入口（CommonJS，避开项目顶层的 "type": "module"）。
// 直接加载已部署的线上站点 —— 桌面端无需重新打包静态资源，
// 与网页版共用同一套代码、同一份云同步数据。
const { app, BrowserWindow } = require('electron')

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: '灵境 AI',
    backgroundColor: '#0c0d12',
    webPreferences: { contextIsolation: true, nodeIntegration: false }
  })
  win.loadURL('https://lwl555.github.io/ai-director-canvas/')
}

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
