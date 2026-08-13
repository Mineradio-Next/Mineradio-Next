# Mineradio Next v2.2.1

<!-- mineradio-update-summary:start -->
安装、升级与遥控体验的稳定性修复
<!-- mineradio-update-summary:end -->

## 主要变化

<!-- mineradio-update-highlights:start -->
- 安装与卸载：补齐 Windows 首次安装、覆盖升级、卸载和用户数据保留回归
- 远程控制：避开浏览器禁用端口，手机扫码打开更稳定
- 运行体积：移除重复的 GSAP 依赖，减少应用包体积
<!-- mineradio-update-highlights:end -->

## 其他改进

- 发布流程增加隔离 QA 安装身份，不会覆盖正式版安装和用户数据
- 安装包、快捷方式、任务栏 AppID、图标和版本资源加入自动检查
- 发布验收清单和校验和流程整理到仓库文档

## 安装

下载 `Mineradio-Next-2.2.1-Setup.exe`，并使用同一 Release 中的 `SHA256SUMS.txt` 校验文件完整性。

当前安装包未进行商业代码签名，Windows 可能显示未知发布者提示。

## 已知边界

- 第三方音乐平台的搜索、推荐、登录和播放能力受平台接口、地区和账号权益影响
- 软件内更新入口会打开 GitHub Release 页面，不会静默下载或执行安装包
- 默认安装目录沿用专属 `Mineradio-Next` 文件夹，升级不会删除用户数据
