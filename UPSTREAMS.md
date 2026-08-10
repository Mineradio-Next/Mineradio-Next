# Mineradio-Next 上游维护说明

`Mineradio-Next` 是我们的产品仓库。两个来源仓库只负责提供更新，不直接在里面开发。

## 目录职责

| 目录 | 用途 | 是否在里面改代码 |
| --- | --- | --- |
| `Mineradio-main` | 原作者最新版，只读参考 | 否 |
| `Mineradio-LX-Music-main` | LX 二创最新版，只读参考 | 否 |
| `Mineradio-Next` | 我们自己的产品 | 是 |

## 远程仓库

- `upstream-original`: <https://github.com/XxHuberrr/Mineradio.git>
- `upstream-lx`: <https://github.com/ww085213/Mineradio-LX-Music.git>
- `origin`: 暂未设置。创建我们自己的 GitHub/Gitee 仓库后，再把它配置为 `origin`。

两个上游 remote 的 push 地址被设为 `no_push`，用于避免误推送。我们的代码以后只推送到自己的 `origin`。

## 更新上游

在 `Mineradio-Next` 目录运行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\sync-upstreams.ps1
```

每个下载地址默认最多等待 30 秒。官方 GitHub 连接失败或超时后，脚本会自动尝试镜像。可用 `-FetchTimeoutSeconds 60` 调整单次等待时间。

脚本会完成三件事：

1. 更新旁边两个只读上游工作目录，且只允许 fast-forward。
2. 更新本仓库的 `upstream-original/main` 和 `upstream-lx/main` 引用。
3. 把本次上游提交号写入 `upstream-lock.json`。

它不会自动修改或合并我们的 `main`，所以拉取上游不会把项目目录弄乱。

## 把原版更新合进来

原版与本项目共享 Git 历史，可以在专用分支中正常合并：

```powershell
git switch -c sync/original-YYYYMMDD
git merge --no-ff upstream-original/main
```

解决冲突并完成测试后，再把这个分支合入我们的 `main`。不要直接在 `main` 上试合并。

## 从 LX 版移植功能

LX 仓库与原版没有可安全整树合并的共同历史，而且页面结构差异很大。不要执行 `git merge --allow-unrelated-histories upstream-lx/main`。

每个 LX 功能单独建立分支，例如：

```powershell
git switch -c port/lx-music-source
git diff --stat main upstream-lx/main
git show upstream-lx/main:path/to/file
```

按功能逐个移植，并为每个功能单独提交。这样未来 LX 更新时，只需要继续移植它新增或修正的部分，不会覆盖我们的原版更新和自研代码。

## 日常开发规则

1. `main` 只放已经验证可用的版本。
2. 自研功能使用 `feature/<name>` 分支。
3. 原版更新使用 `sync/original-<date>` 分支。
4. LX 移植使用 `port/lx-<feature>` 分支。
5. 每次只合一个明确功能，并在合入 `main` 前运行测试。
6. 不在 `Mineradio-main` 和 `Mineradio-LX-Music-main` 中写自研代码。

当前基线提交记录在 `upstream-lock.json`。两个 ZIP 备份在首次基线构建和启动验证完成前继续保留。
