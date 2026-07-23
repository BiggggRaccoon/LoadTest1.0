/**
 * 预加载脚本：向渲染进程安全暴露有限的 IPC 接口
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  /** 打开本地 xlsx 并返回文件数据 */
  openXlsxFile: () => ipcRenderer.invoke('open-xlsx-file')
});
