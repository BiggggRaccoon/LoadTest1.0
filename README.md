# 题库自测（Electron）

从本地 `.xlsx` 题库导入并生成自测做题程序，支持单选、多选、判断题型。

## 功能特性

- **多题库管理**：导入多个 Excel 题库，分别命名、重命名、删除
- **灵活答题设置**：每次答题可设置题目数量（默认 10 题）与答题顺序（顺序 / 乱序）
- **智能题型识别**：自动识别单选、多选、判断题，无需手动配置题型
- **错题独立保存**：按题库独立保存错题本，支持单条删除、一键清空、重做错题
- **成绩报告**：答题结束后显示成绩统计与本次错题列表

## Excel 题库格式（列名固定）

| 题号 | 题目 | A | B | C | D | 答案 | 解析 |
|------|------|---|---|---|---|------|------|

### 题型规则

- **单选题**：答案填 `A` / `B` / `C` / `D`
- **多选题**：答案填 `ABC`、`ABD` 等（多个字母，可无分隔或用逗号）
- **判断题**：答案填 `对` / `错`（也支持 正确/错误、T/F）；A/B 列可写「对」「错」

### 使用示例

```
题号 | 题目                                    | A    | B    | C    | D    | 答案 | 解析
1    | JavaScript 是强类型语言吗？               | 是   | 否   |      |      | 错   | JS 是弱类型动态语言
2    | 以下哪些是 ES6 特性？                     | let  | const| var  | 箭头函数 | A,B,D | var 是 ES5 语法
3    | HTTP 状态码 404 表示？                    | 服务器错误 | 未找到 | 重定向 | 成功 | B    | 404 Not Found
```

## 使用方法

### 1. 导入题库

启动应用后，点击「导入题库 (.xlsx)」按钮，选择本地 Excel 文件。导入成功后会弹出命名对话框，为题库设置名称。

### 2. 开始答题

在题库列表中点击「开始答题」，进入设置页面：
- 选择答题顺序：顺序答题或乱序答题
- 设置题目数量：可输入任意正整数，最多为该题库总题数
- 点击「开始答题」进入答题界面

### 3. 错题管理

- 在题库列表或答题设置页面点击「错题本」查看该题库的所有错题
- 错题本支持单条删除、清空全部、重做错题
- 每次答题产生的错题会自动追加到该题库的错题本（按题目去重）

### 4. 成绩报告

答题完成后进入成绩报告页面，显示：
- 总题数、答对、答错、正确率
- 本次错题列表（已自动写入该题库错题本）
- 可选择「重做错题」或「再测一次」

## 项目结构

```
LoadTest1.0/
├── main.js              # Electron 主进程（窗口创建、文件对话框、IPC 通信）
├── preload.js           # 预加载脚本（安全暴露 IPC 接口到渲染进程）
├── index.html           # 应用界面（5 个视图：首页、设置、错题本、答题、成绩）
├── styles.css           # 全局样式（主题变量、组件样式、响应式布局）
├── renderer.js          # 渲染进程逻辑（Excel 解析、答题流程、错题管理、localStorage）
├── package.json         # 项目配置（依赖、脚本、打包配置）
├── sample-questions.xlsx# 示例题库（可直接导入试用）
├── build/               # 构建资源
│   ├── afterPack.js     # 打包后处理脚本
│   ├── icon.ico         # Windows 应用图标
│   └── icon.png         # 备用图标
├── image/               # 应用图片资源
│   └── avatar.jpg       # 窗口图标
└── README.md            # 项目说明文档
```

## 技术栈

- **Electron**：桌面应用框架（主进程 + 渲染进程架构）
- **SheetJS (xlsx)**：Excel 文件解析库
- **localStorage**：本地数据持久化（题库、错题记录）
- **electron-builder**：应用打包工具

## 运行项目

### 环境要求

- Node.js >= 18
- npm 或 yarn

### 安装依赖

若 Electron 二进制下载较慢，可先设置镜像：

```powershell
$env:ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"
npm install --registry=https://registry.npmmirror.com
```

### 启动开发模式

```powershell
npm start
```

或：

```bash
npx electron .
```

启动后点击「导入题库」，选择 `sample-questions.xlsx` 即可试用。

## 打包成 exe

### 生成安装包（NSIS）

```powershell
$env:ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"
npm install
npm run dist
```

输出路径：`dist/题库自测 Setup x.x.x.exe`

### 生成免安装目录版

```powershell
npm run pack
```

输出路径：`dist/win-unpacked/题库自测.exe`

## 数据存储

应用数据保存在浏览器 localStorage 中，键名为 `quiz_app_state_v2`，包含：
- `banks`：题库列表（含题目、错题记录）
- `updatedAt`：最后更新时间

清除浏览器数据会导致题库和错题记录丢失，请谨慎操作。
