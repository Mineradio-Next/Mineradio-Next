# Mineradio Next

![Mineradio Next](./docs/assets/readme/cinema-beat-smoke.png)

Mineradio Next 是面向 Windows 的沉浸式桌面音乐播放器。项目以
[XxHuberrr/Mineradio](https://github.com/XxHuberrr/Mineradio) 为基础，吸收
[ww085213/Mineradio-LX-Music](https://github.com/ww085213/Mineradio-LX-Music)
中适合长期维护的能力，并在统一的播放、资料库、桌面模式和视觉系统上继续独立开发。

> 当前开发版本：`2.2.0`。正式安装包将在本仓库的
> [Releases](https://github.com/Mineradio-Next/Mineradio-Next/releases) 页面发布。

## 主要能力

- 多来源搜索、播放回退、平台排行、每日推荐与音乐电台
- 本地曲库、离线收藏、统一收藏、歌单导入整理与播放历史
- 歌词舞台、三轨歌词编辑、桌面歌词、粒子视觉与 3D 歌单架
- 完整桌面模式、Wallpaper Engine 本地内容接入与场景留影
- 迷你播放器、系统媒体键、托盘控制、定时停播与局域网遥控
- EQ、前级增益、空间听感、声场宽度、峰值保护与播放调音
- 网易云音乐、QQ 音乐、酷狗音乐、Spotify、汽水音乐等账号或目录能力

部分服务的可用功能取决于平台接口、账号地区和会员权益。Mineradio Next 不是任何
音乐平台的官方客户端，也不提供音乐内容本身。

## 安装

1. 前往 [Releases](https://github.com/Mineradio-Next/Mineradio-Next/releases)。
2. 下载 `Mineradio-Next-<版本>-Setup.exe`。
3. 可用同一 Release 内的 `SHA256SUMS.txt` 校验文件完整性。
4. 运行安装器并按提示完成安装。

`.blockmap`、`latest.yml` 和 `win-unpacked` 不是面向普通用户的安装包。当前安装包尚未
进行商业代码签名，因此 Windows SmartScreen 可能显示未知发布者提示。

现有 Mineradio 用户的数据继续保存在 `%APPDATA%\Mineradio`，升级到 Next 时无需迁移
账号、设置和歌单。程序显示名、任务栏身份、快捷方式与安装包名称均为
`Mineradio Next`。

## 开发

要求：Windows 10/11、Node.js 20 或更高版本、npm。

```powershell
git clone https://github.com/Mineradio-Next/Mineradio-Next.git
cd Mineradio-Next
npm ci
npm start
```

常用检查与构建：

```powershell
npm test
npm run check
npm run security:audit
npm run build:win:dir
npm run build:win
```

构建产物位于 `dist/`。项目使用本地 `node_modules/electron/dist` 作为 Electron 打包源，
避免重复下载运行时；因此构建前必须完成 `npm ci`。

## 上游维护

仓库固定使用三个 remote：

```text
origin            Mineradio-Next/Mineradio-Next（可推送）
upstream-original XxHuberrr/Mineradio（只读）
upstream-lx       ww085213/Mineradio-LX-Music（只读）
```

检查上游变化：

```powershell
git fetch upstream-original main
git fetch upstream-lx main
npm run upstream:report
```

上游报告只列出提交、改动路径和冲突风险，不会自动合并或改写当前分支。基线信息见
[NEXT_BASELINE.md](./docs/NEXT_BASELINE.md)。

## 自动检查与发布

- 普通 push 和 Pull Request 会运行测试、完整检查与依赖安全审计。
- 推送形如 `v2.2.0` 的标签后，GitHub Actions 会在 Windows 上重新构建安装包、生成
  SHA256 校验文件并创建 Release。
- 客户端只检查本仓库的最新 Release，并在系统浏览器中打开下载页；客户端不会静默
  下载或安装补丁。

## 隐私

登录 Cookie、Token、播放历史、搜索历史、用户封面、歌词、缓存和本地音乐不会进入
Git 仓库。详细说明见 [PRIVACY.md](./PRIVACY.md)。

## 来源与致谢

- 原项目：[XxHuberrr/Mineradio](https://github.com/XxHuberrr/Mineradio)
- LX 衍生项目：[ww085213/Mineradio-LX-Music](https://github.com/ww085213/Mineradio-LX-Music)
- 其他移植来源、提交基线及第三方服务见 [NOTICE.md](./NOTICE.md) 和
  [THIRD_PARTY_PORTS.md](./docs/THIRD_PARTY_PORTS.md)

Mineradio Next 保留并尊重原作者和各贡献者的版权标识。Next 的新增代码、品牌资源和
维护工作由 Mineradio-Next 项目继续管理。

## 许可证

本项目基于 GNU General Public License v3.0 发布，详见 [LICENSE](./LICENSE)。分发修改版
或安装包时，必须同时满足 GPL-3.0 的源码与许可证义务，并保留 NOTICE 中的来源说明。
