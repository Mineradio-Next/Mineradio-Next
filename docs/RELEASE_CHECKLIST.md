# Mineradio Next 发布验收清单

这份清单用于每个公开版本。标签一旦发布，不移动、不覆盖；有修复就递增补丁版本。

## 1. 发布前检查

```powershell
npm ci
npm test
npm run check:ci
npm run security:audit
npm run release:verify
```

确认工作区只包含本次版本计划内的改动：

```powershell
git status --short
git diff --check
```

## 2. Windows 安装链路

```powershell
npm run qa:release
```

该命令使用独立的 `Mineradio Next Release QA` 身份自动验证：

- 首次静默安装
- EXE 名称、产品信息、版本和图标资源
- 开始菜单与桌面快捷方式目标和 AppUserModelID
- 安装后真实启动
- 原位置覆盖升级
- 升级后用户数据保留
- 静默卸载
- 卸载后安装目录、注册表和快捷方式清理
- 卸载后用户数据保留
- 正式版安装目录未被修改
- QA 安装和数据残留自动清理

结果写入 `reports/release-qa/latest.json`。报告是本机临时证据，不提交仓库。

## 3. 正式安装包

```powershell
npm run build:win
npm run release:checksums
npm run release:verify -- --artifacts
```

应生成：

- `dist/Mineradio-Next-X.Y.Z-Setup.exe`
- `dist/Mineradio-Next-X.Y.Z-Setup.exe.blockmap`
- `dist/latest.yml`
- `dist/SHA256SUMS.txt`

## 4. 最终人工验收

只对最终候选包执行一次：

1. 双击安装包，检查安装、进度和完成界面
2. 启动播放器，确认没有白屏闪烁，左上角图标、任务栏名称和图标正确
3. 打开设置并检查更新，确认当前版本状态正确
4. 从 Windows 应用列表卸载，检查卸载壳和完成状态
5. 重新安装，确认歌单、账号和播放器设置仍在

## 5. 发布

更新 `package.json`、`package-lock.json`、界面版本号和 `docs/RELEASE_NOTES_vX.Y.Z.md` 后提交。确认 `main` 已推送，再创建新标签：

```powershell
git tag -a vX.Y.Z -m "Mineradio Next X.Y.Z"
git push origin vX.Y.Z
```

等待 GitHub Actions 完成，确认 Release 包含安装包、blockmap、`latest.yml` 和校验和。最后用已安装客户端检查一次更新状态。
