/**
 * Electron 主进程
 * 负责创建窗口、打开本地文件对话框、读取 xlsx 文件内容
 */
const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

/** @type {BrowserWindow | null} */
let mainWindow = null;

/**
 * 创建主窗口
 */
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 720,
    minWidth: 800,
    minHeight: 600,
    title: '题库自测',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile('index.html');

  // 开发时可取消下一行注释打开调试工具
  // mainWindow.webContents.openDevTools();
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

/**
 * 打开本地 .xlsx 文件选择对话框，并返回文件路径与二进制内容（ArrayBuffer）
 * 渲染进程用 sheetjs 解析，主进程只负责读文件
 */
ipcMain.handle('open-xlsx-file', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: '选择题库 Excel 文件',
    filters: [{ name: 'Excel 文件', extensions: ['xlsx', 'xls'] }],
    properties: ['openFile']
  });

  if (result.canceled || !result.filePaths.length) {
    return { canceled: true };
  }

  const filePath = result.filePaths[0];
  const buffer = fs.readFileSync(filePath);

  return {
    canceled: false,
    filePath,
    fileName: path.basename(filePath),
    // 转为普通数组，便于通过 IPC 传递
    data: Array.from(buffer)
  };
});
