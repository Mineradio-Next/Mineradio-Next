# Mineradio Next v2.2.0

<!-- mineradio-update-summary:start -->
Mineradio Next 的首个独立版本，带来更完整的音乐发现、曲库管理与 Windows 桌面体验
<!-- mineradio-update-summary:end -->

## 主要变化

<!-- mineradio-update-highlights:start -->
- 发现音乐：整合平台排行、音乐电台、歌手专辑、伴奏查找和多来源搜索
- 管理曲库：增加本地曲库、离线收藏、播放历史、歌单整理与导入
- 桌面播放：增加迷你播放器、系统媒体控制、定时停播和局域网遥控
<!-- mineradio-update-highlights:end -->

## 其他改进

- 完成名称、音符 Logo、任务栏、托盘、快捷方式和安装器品牌统一
- 完善实时频谱、空间听感、桌面歌词和 Wallpaper Engine 场景
- 保留原 Mineradio 用户数据目录，升级后账号、设置、歌单和缓存路径无需迁移
- 建立上游双源维护报告、依赖安全门禁、Windows 构建和 GitHub Release 流程

## 安装

下载 `Mineradio-Next-2.2.0-Setup.exe`，并使用同一 Release 中的
`SHA256SUMS.txt` 校验文件完整性。

当前安装包未进行商业代码签名，Windows 可能显示未知发布者提示。

## 已知边界

- 第三方音乐平台的搜索、推荐、登录和播放能力受平台接口、地区和账号权益影响。
- 软件内更新入口会打开浏览器下载页面，不会静默下载或执行安装包。
- 默认安装目录仍沿用专属 `Mineradio` 文件夹，以兼容旧版升级和安全卸载规则。

## 来源

本项目继续遵循 GPL-3.0。原项目、LX 衍生项目与其他移植来源见仓库中的
`NOTICE.md` 和 `docs/THIRD_PARTY_PORTS.md`。
