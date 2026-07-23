# 题库自测（Electron）

从本地 `.xlsx` 题库导入并生成自测做题程序。

## 功能说明

- **导入与答题分离**：导入后进入题库列表，再单独选择题库开始答题
- **题库命名 / 重命名 / 删除**
- 每次答题可设置 **题目数量** 与 **顺序 / 乱序**
- **错题按题库独立保存**，支持单条删除、清空、重做

## Excel 格式（列名固定）

| 题号 | 题目 | A | B | C | D | 答案 | 解析 |
|------|------|---|---|---|---|------|------|

- **单选题**：答案填 `A` / `B` / `C` / `D`
- **多选题**：答案填 `ABC`、`ABD` 等（多个字母，可无分隔或用逗号）
- **判断题**：答案填 `对` / `错`（也支持 正确/错误、T/F）；A/B 可写「对」「错」

## 项目结构

```
LoadTest1.0/
├── main.js              # Electron 主进程（窗口、打开文件）
├── preload.js           # 预加载桥接 IPC
├── index.html           # 界面
├── styles.css           # 样式
├── renderer.js          # 答题逻辑 / Excel 解析 / localStorage
├── package.json         # 依赖与打包配置
├── sample-questions.xlsx# 示例题库
└── README.md
```

## 运行

若 Electron 二进制下载较慢，可先设置镜像再安装：

```powershell
$env:ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"
npm install --registry=https://registry.npmmirror.com
npm start
```

或：

```bash
npx electron .
```

启动后点击「导入题库」，选择 `sample-questions.xlsx` 即可试用。

## 打包成 exe

```powershell
$env:ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"
npm install
npm run dist
```

- 安装包输出：`dist/题库自测 Setup x.x.x.exe`（NSIS）
- 免安装目录版：`npm run pack` → `dist/win-unpacked/题库自测.exe`
