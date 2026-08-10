# Mineradio-Next 初始化基线

记录日期：2026-08-10

## 来源版本

- 原版 `XxHuberrr/Mineradio`: `89c0d230c3f1f792e5d9639781ebbf724c4efbfe`
- LX 版 `ww085213/Mineradio-LX-Music`: `82751d5907fb580bc31da42afde5a4e806636400`

精确来源以仓库根目录的 `upstream-lock.json` 为准。

## 验证环境

- Windows
- Node.js `24.15.0`
- npm `11.12.1`
- Electron `42.4.1`

依赖通过 `npm ci --ignore-scripts` 安装。Electron 运行文件随后通过镜像安装，未改动 `package-lock.json`。

## 验证结果

### 通过

- `node scripts/quick-check.js`
- 125 个 JavaScript 文件语法检查
- 项目快速检查包含的静态检查和模块回归
- Wallpaper Engine 导入、路径隔离、Range 流和清理测试
- Git 对象连通性检查
- 双上游同步脚本 `-DryRun`

### 待处理

`node scripts/quick-check.js --electron` 能启动 Electron 并执行运行时 QA，但在原版歌词运行时断言中报告：

- `dual/dual translation rows invalid`
- `dual/multi translation rows invalid`

该问题属于后续播放器基线修复，不影响当前 Git 目录和双上游工作流。

`npm ci` 完成后报告 6 个既有依赖漏洞：1 个 moderate、5 个 high。升级依赖需要单独建分支并运行完整回归，不在初始化提交中执行自动修复。

## 本地兼容修复

`scripts/check-wallpaper-engine-library.js` 的路径断言使用真实路径进行比较，避免同一 Windows 路径分别以完整用户名和 8.3 短路径表示时产生假失败。
