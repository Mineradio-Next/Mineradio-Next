# Mineradio 完整备份与恢复设计

## 目标

在视觉控制台的“用户存档”区域增加“完整备份”和“完整恢复”。备份用于迁移用户自行创建或调整的数据，不复制账号会话、来源脚本、缓存、本地媒体文件或运行时审计信息。

功能保持独立：现有视觉存档仍只管理视觉快照；完整备份通过单独模块收集和恢复可迁移的 `localStorage` 项，不改动播放、登录和来源加载链路。

## 文件协议

```json
{
  "type": "mineradio-full-backup",
  "schema": 1,
  "app": "Mineradio",
  "exportedAt": 0,
  "categories": {
    "library": {},
    "lyrics": {},
    "visual": {},
    "preferences": {}
  }
}
```

- `type` 必须精确匹配。
- `schema` 当前只接受 `1`；以后升级通过显式迁移器兼容旧版。
- 每个键的值保持 `localStorage` 原始字符串，避免二次序列化改变数据。
- 文件使用 UTF-8 JSON，最大 32 MiB。
- 导入时重新按本地白名单分类，不信任文件中的分类名称。

## 白名单

### 歌单与收藏 `library`

- `mineradio-local-playlist-files-v1`
- `mineradio-playlist-reorder-v1`
- `mineradio-backup-source-likes-v1`

这里只保存本地曲目引用和用户排序，不包含音频文件本身。目标机器找不到对应文件时保留记录，由现有本地曲库流程提示重新导入。

### 歌词 `lyrics`

- `mineradio-custom-lyrics-v1`
- `mineradio-custom-lyric-prefs-v1`
- `mineradio-custom-lyric-fonts-v1`
- `mineradio-lyric-timing-offsets-v1`

自定义字体包含用户已经存入本地的字体数据，因此可能占据备份文件的大部分空间。

### 视觉 `visual`

- `mineradio-current-fx-autosave-v1`
- `mineradio-user-fx-archives-v1`
- `mineradio-custom-covers`
- `mineradio-wallpaper-engine-selection-v1`
- `mineradio-wallpaper-engine-hidden-v1`
- `mineradio-wallpaper-engine-favorites-v1`
- `mineradio-free-camera-v1`

Wallpaper Engine 只保存选择、隐藏和收藏状态，不包含项目目录或源文件。

### 播放与界面偏好 `preferences`

- `apex-player-volume`
- `mineradio-playback-quality-v1`
- `mineradio-audio-fade-v1`
- `mineradio-hotkey-settings-v1`
- `mineradio-diy-player-mode-v1`
- `mineradio-playlist-panel-pinned-v1`
- `mineradio-playlist-panel-tab-v1`
- `mineradio-user-capsule-auto-hide-v1`
- `mineradio-fx-fab-auto-hide-v1`
- `mineradio-controls-auto-hide-v1`
- `mineradio-close-behavior-v1`
- `mineradio-startup-autoplay-v1`
- `mineradio-startup-fast-skip-v1`
- `mineradio-startup-resume-mode-v1`
- `mineradio-cuefield-automix-v1`

音频设备 ID 不迁移，因为目标机器的设备标识通常不同。最后播放位置、搜索历史、收听统计和节拍缓存属于临时或行为数据，也不进入备份。

## 明确排除

除白名单外的键全部忽略。以下敏感或机器相关数据额外列入拒绝规则，即使未来误加入白名单也不能导入导出：

- 名称包含 `cookie`、`token`、`secret`、`password`、`credential`、`session`、`oauth` 或 `login-workflow`
- `mineradio-login-cookie-export-v1`
- `mineradio-provider-vip-audit-v1`
- `mineradio-qq-playback-vip-evidence-v1`
- `mineradio-additional-source-enabled-v1` 及来源脚本
- 登录平台状态、缓存、IndexedDB 视频、持久化歌词缓存
- 本地音频、Wallpaper Engine 项目和其他文件系统内容

## 导出流程

1. 按白名单读取当前 `localStorage`。
2. 跳过不存在的键和命中拒绝规则的键。
3. 生成分类摘要和版本化载荷。
4. 验证序列化大小不超过 32 MiB。
5. 使用现有桌面 JSON 导出桥；浏览器预览环境使用 Blob 下载作为兼容路径。

空备份允许导出，便于验证协议，但界面会明确显示“0 项设置”。

## 恢复流程

1. 读取 JSON 并检查大小、语法、类型和版本。
2. 将所有候选项重新映射到本地白名单，统计有效项、未知项和被拒绝项。
3. 弹出恢复摘要，显示导出时间、四类数量、总项数和忽略数量。
4. 用户确认后执行合并恢复：只覆盖备份中存在的白名单键，不清空当前其他数据。
5. 写入前记录每个目标键原值；任一写入失败时按原值整批回滚。
6. 成功后刷新页面，让全部模块从恢复后的存储重新初始化。

恢复按钮在摘要确认前不会写入数据。取消导入、关闭弹窗或导入无效文件均保持当前状态不变。

## UI

- 在原有 `#user-archive-grid .user-archive-tools` 末尾加入“完整备份”和“完整恢复”。
- 工具栏在窄宽度下自动换行，不改变原用户存档卡片布局。
- 恢复摘要使用与现有热键设置一致的深色玻璃弹窗、细边框、紧凑字号和短过渡。
- 主操作使用当前视觉强调色；危险或错误状态只使用低饱和红色提示，不引入新的品牌视觉。
- 所有可关闭行为支持遮罩点击、关闭按钮和 `Escape`。

## 错误处理

- 无效类型、未知版本、JSON 损坏和超大文件分别给出明确提示。
- 未知键不写入，只在摘要中计数。
- 敏感键不写入，并计入“已排除”。
- 存储配额或其他写入异常触发自动回滚；回滚失败时保留错误日志并提示用户不要刷新，以便手工导出当前状态。
- 桌面文件对话框取消不显示失败提示。

## 测试

- 单元测试白名单分类、敏感键拒绝、载荷校验、摘要和合并回滚。
- 集成检查模块加载顺序、工具栏入口、桌面文件桥和无衍生命名。
- 运行全部 Node 测试、语法检查、`git diff --check` 和 Electron quick check。

