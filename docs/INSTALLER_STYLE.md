# Mineradio Next installer contract

## 2026-08-13 卸载壳同步规则

- 交互式卸载复用安装器的 WPF 产品壳，不显示原生 NSIS 向导。
- 卸载流程固定为“确认卸载 → 正在卸载 → 卸载完成”，沿用声场背景、排版、色彩、按钮和过渡。
- 取消卸载不启动删除流程；删除期间禁止关闭窗口，完成后由产品壳统一展示结果。
- 默认只移除程序文件、快捷方式和卸载注册项；`%APPDATA%\Mineradio` 中的歌单、账号和设置继续保留。
- 静默卸载继续走目录标记校验后的 NSIS 安全删除逻辑。

## 2026-08-13 正式包目录收敛规则

- 正式版启用 Electron `asar`，应用源码、前端资源和生产依赖统一收进 `resources\app.asar`。
- 安装目录不再展开 `resources\app` 的数千个零碎文件，降低安装、卸载和杀毒扫描开销。
- 运行时产生的账号、歌单、缓存、离线音乐和日志仍写入用户数据目录，不写入 `app.asar`。
- Wallpaper Engine、WebGL、音频解码与本地曲库必须通过打包后 EXE 的启动烟雾检查才能发布。
- Electron/Chromium 主程序是播放器 3D、媒体和桌面能力的运行时，不能通过删除 DLL 或 license 资源伪造体积优化。

## 2026-08-13 方案 2 落地规则

- 安装器采用深色唱片与声轨品牌面板，操作区保持浅色和原生 Windows 控件。
- 文案说明真实功能，不使用商业广告口号。
- 全新安装默认使用 `$LOCALAPPDATA\Programs\Mineradio`。
- 检测到旧版 Mineradio 时沿用已注册且可安全接管的原安装目录。
- 欢迎页默认显示“安装”。勾选“安装选项”后显示目录与桌面快捷方式设置。
- 安装标记写入 `com.mineradio.next`，同时继续通过旧程序文件和注册表识别可升级目录。
- 用户数据继续保存在 `%APPDATA%\Mineradio`，不随安装目录变化。

以下历史说明用于理解旧安装包兼容边界。

# 2026-06-25 P0 Installer Safety Notes

- Full setup adoption rule: the installer may adopt an existing registered install only when the registered path itself is a dedicated `...\Mineradio` directory and contains Mineradio files or `.mineradio-install-root`; mixed parent folders and drive roots must stay blocked/quarantined.
- Quick patch rule: installer/uninstaller safety bugs cannot be fixed by a quick patch JSON alone, because the Windows uninstaller and install registry must be replaced by the full NSIS setup.

# 2026-06-26 Fixed Installer Packaging Baseline

- Future Windows releases must keep the repaired `v1.1.1` installer shape: custom NSIS pages and safety logic from `build/installer.nsh`, full setup `.exe`, `.blockmap`, `latest.yml`, and `SHA256SUMS`.
- Baseline release asset: `Mineradio-1.1.1-Setup.exe`, SHA256 `1d35750c5b9c5099bd608baa4cc8564d5a08a183dccb2aa7ab85ef613fd536f7`, size `115090051` bytes.
- Do not publish installer/uninstaller safety fixes as quick patch JSON only. They must be delivered by a full setup package so the Windows uninstaller and registry are replaced.
- Never remove `customRemoveFiles` or restore electron-builder's default recursive `$INSTDIR` deletion path. Keep deletion limited to known Mineradio/Electron top-level files and non-recursive empty-directory cleanup.
- Keep safe overwrite behavior: existing dedicated `...\Mineradio` folders containing Mineradio files can be overwritten; mixed folders, parent folders, drive roots, and user data folders must stay blocked or quarantined.

# Mineradio Installer Style

2026-06-22 用户确认保留当前安装包格式。以后发布安装包，默认沿用这套样式和流程，除非用户明确要求重做。

## 视觉方向

- 中文极简安装器。
- 主色：白底 `#FFFFFF`，主文字 `#111217`，弱文字 `#4B5263` / `#6B7280`，蓝色点缀 `#3257F7`。
- 不要再使用红色 MR、深色大卡片、复杂装饰、英文大段说明或黑底黑字。
- 顶部横幅和侧边图保持黑白蓝极简：`build/installerHeader.bmp`、`build/installerSidebar.bmp`。

## 页面结构

- 欢迎页只保留：
  - `MINERADIO`
  - `Mineradio 安装`
  - 简短中文说明
  - `默认位置：D:\Mineradio`
- 安装目录页只保留：
  - `选择安装位置`
  - 简短中文说明
  - `安装目录` 输入框
  - `浏览...` 按钮
  - `默认推荐：D:\Mineradio；选盘符会自动建文件夹。`

## 技术边界

- 使用 `build/installer.nsh` 的自定义欢迎页和自定义安装目录页。
- `package.json` 中 `build.nsis.allowToChangeInstallationDirectory` 保持 `false`，避免 electron-builder 原生目录页读取旧安装注册表后回填到 `AppData\Local\Programs\Mineradio`。
- 自定义目录页必须保留可编辑输入框和 `浏览...` 按钮。
- 默认路径通过 `MineradioUsePreferredInstallDir` 设置为 `D:\Mineradio`；命令行 `/D=` 参数仍可覆盖。
- 用户选择盘符根目录时，通过 `MineradioNormalizeInstallDir` 自动补成 `盘符:\Mineradio`。

## 发布前验证

发布前必须本地打开新生成的 `dist\Mineradio-版本-Setup.exe` 验证：

- 欢迎页显示中文极简样式，默认位置为 `D:\Mineradio`。
- 安装目录页输入框显示 `D:\Mineradio`。
- `浏览...` 按钮能弹出中文文件夹选择窗口。
- 验证时不要点 `安装`，确认后取消退出。

## 2026-06-25 安装安全补充

- 默认安装路径从 `D:\Mineradio` 开始按 D-Z 顺序选择第一个存在的盘；只有电脑不存在任何 D-Z 盘时，才允许默认落到 `C:\Mineradio`。
- 用户手动选择目录时，安装器必须强制落到独立 `Mineradio` 子文件夹；若 D-Z 盘存在，手动选择 C 盘也要阻止。
- 非空且无法识别为 Mineradio 的目录必须阻止安装，避免卸载阶段删除用户其它文件。
- 新安装器写入 `.mineradio-install-root` 标记；新卸载器必须先验证路径和标记/主程序/卸载器，再进入卸载。
- 新卸载器禁止使用 `RMDir /r $INSTDIR` 删除整个安装根目录，也禁止递归删除 `resources`、`locales` 等应用子目录；只能删除 Mineradio/Electron 顶层已知文件，最后用非递归 `RMDir "$INSTDIR"` 尝试移除空目录。
- 安装新版本时，若检测到旧版本没有 `.mineradio-install-root` 安全标记，必须跳过旧卸载器，只删除旧目录中的 `Uninstall Mineradio.exe` 单文件并清理卸载注册表，避免触发历史安装包的整目录递归删除逻辑。
