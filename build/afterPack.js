/**
 * 打包后处理：用 rcedit 写入 exe 图标（绕过 winCodeSign 解压时的符号链接权限问题）
 */
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'win32') return;

  const exeName = context.packager.appInfo.productFilename + '.exe';
  const exePath = path.join(context.appOutDir, exeName);
  const iconPath = path.join(context.packager.projectDir, 'build', 'icon.ico');

  const candidates = [
    path.join(process.env.LOCALAPPDATA || '', 'electron-builder', 'Cache', 'winCodeSign', 'fixed', 'rcedit-x64.exe'),
    path.join(process.env.LOCALAPPDATA || '', 'electron-builder', 'Cache', 'winCodeSign', 'extracted', 'rcedit-x64.exe')
  ];

  const rcedit = candidates.find((p) => p && fs.existsSync(p));
  if (!rcedit || !fs.existsSync(exePath) || !fs.existsSync(iconPath)) {
    console.warn('[afterPack] 跳过图标写入：缺少 rcedit 或 icon');
    return;
  }

  try {
    execFileSync(rcedit, [exePath, '--set-icon', iconPath], { stdio: 'inherit' });
    console.log('[afterPack] 已写入图标:', exePath);
  } catch (err) {
    console.warn('[afterPack] 写入图标失败:', err.message);
  }
};
