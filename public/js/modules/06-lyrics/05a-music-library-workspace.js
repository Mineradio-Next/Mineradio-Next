var MUSIC_LIBRARY_BATCH_SIZE = 80;
var musicLibraryWorkspaceState = {
  open: false,
  tab: 'local',
  query: '',
  folder: 'all',
  visible: MUSIC_LIBRARY_BATCH_SIZE,
  selected: Object.create(null),
  playlistId: '',
  playlistVisible: MUSIC_LIBRARY_BATCH_SIZE,
  historyVisible: MUSIC_LIBRARY_BATCH_SIZE,
  historyRange: 'all',
  historyProvider: 'all',
  loading: false,
  confirmAction: '',
  confirmUntil: 0
};

function musicLibraryTrackId(song) {
  return String(song && (song.localFileId || song.localKey || song.id) || '').replace(/^local:/, '');
}

function musicLibraryFolder(song) {
  var path = String(song && song.localPath || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  if (!path || path.indexOf('/') < 0) return '单曲文件';
  return path.split('/')[0] || '单曲文件';
}

function musicLibraryDuration(value) {
  var seconds = Number(value) || 0;
  if (typeof value === 'string' && /^\d+:\d+$/.test(value)) return value;
  if (seconds > 10000) seconds /= 1000;
  seconds = Math.max(0, Math.round(seconds));
  return Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0');
}

function musicLibraryFilteredTracks() {
  var query = String(musicLibraryWorkspaceState.query || '').trim().toLowerCase();
  var folder = musicLibraryWorkspaceState.folder;
  return (persistentLocalLibraryTracks || []).filter(function (song) {
    if (folder !== 'all' && musicLibraryFolder(song) !== folder) return false;
    if (!query) return true;
    return [song.name, song.title, song.artist, song.singer, song.album, song.localPath]
      .join(' ').toLowerCase().indexOf(query) >= 0;
  });
}

function musicLibrarySelectedTracks() {
  return (persistentLocalLibraryTracks || []).filter(function (song) {
    return !!musicLibraryWorkspaceState.selected[musicLibraryTrackId(song)];
  });
}

function musicLibraryActionArmed(action) {
  return musicLibraryWorkspaceState.confirmAction === action && musicLibraryWorkspaceState.confirmUntil > Date.now();
}

function armMusicLibraryAction(action) {
  if (musicLibraryActionArmed(action)) {
    musicLibraryWorkspaceState.confirmAction = '';
    musicLibraryWorkspaceState.confirmUntil = 0;
    return true;
  }
  musicLibraryWorkspaceState.confirmAction = action;
  musicLibraryWorkspaceState.confirmUntil = Date.now() + 4200;
  refreshMusicLibraryWorkspace('confirm-arm');
  setTimeout(function () {
    if (!musicLibraryActionArmed(action)) return;
    musicLibraryWorkspaceState.confirmAction = '';
    musicLibraryWorkspaceState.confirmUntil = 0;
    refreshMusicLibraryWorkspace('confirm-expire');
  }, 4300);
  return false;
}

function ensureMusicLibraryWorkspace() {
  var mask = document.getElementById('music-library-mask');
  if (mask) return mask;
  mask = document.createElement('div');
  mask.id = 'music-library-mask';
  mask.className = 'music-library-mask';
  mask.setAttribute('role', 'dialog');
  mask.setAttribute('aria-modal', 'true');
  mask.setAttribute('aria-hidden', 'true');
  mask.setAttribute('aria-labelledby', 'music-library-title');
  mask.innerHTML =
    '<section class="music-library-workspace">' +
      '<header class="music-library-head">' +
        '<div class="music-library-heading"><span class="music-library-kicker">我的音乐</span><h2 id="music-library-title">音乐库</h2><p id="music-library-summary">整理本地音乐与歌单</p></div>' +
        '<button class="music-library-close" type="button" data-library-close title="关闭音乐库" aria-label="关闭音乐库">×</button>' +
      '</header>' +
      '<nav class="music-library-tabs" role="tablist" aria-label="音乐库视图">' +
        '<button type="button" data-library-tab="local" role="tab">本地音乐</button>' +
        '<button type="button" data-library-tab="playlists" role="tab">我的歌单</button>' +
        '<button type="button" data-library-tab="history" role="tab">最近播放</button>' +
        '<button type="button" data-library-tab="offline" role="tab">离线音乐</button>' +
        '<button type="button" data-library-tab="health" role="tab">曲库健康</button>' +
        '<button type="button" data-library-tab="import" role="tab">导入与交换</button>' +
      '</nav>' +
      '<main id="music-library-content" class="music-library-content"></main>' +
    '</section>';
  document.body.appendChild(mask);
  mask.addEventListener('click', handleMusicLibraryClick);
  mask.addEventListener('input', handleMusicLibraryInput);
  mask.addEventListener('change', handleMusicLibraryChange);
  mask.addEventListener('scroll', handleMusicLibraryScroll, true);
  return mask;
}

function musicLibraryCoverHtml(song) {
  var cover = typeof songCoverSrc === 'function' ? songCoverSrc(song, 96) : String(song && (song.cover || song.picUrl) || '');
  return cover
    ? '<span class="music-library-cover"><img src="' + escHtml(cover) + '" alt="" loading="lazy" decoding="async" onerror="this.remove()"></span>'
    : '<span class="music-library-cover" aria-hidden="true"></span>';
}

function musicLibraryFolderOptions(tracks) {
  var counts = Object.create(null);
  (tracks || []).forEach(function (song) {
    var folder = musicLibraryFolder(song);
    counts[folder] = (counts[folder] || 0) + 1;
  });
  return Object.keys(counts).sort(function (a, b) { return a.localeCompare(b, 'zh-CN', { numeric: true }); }).map(function (folder) {
    return '<option value="' + escHtml(folder) + '"' + (musicLibraryWorkspaceState.folder === folder ? ' selected' : '') + '>' + escHtml(folder) + ' · ' + counts[folder] + '</option>';
  }).join('');
}

function renderMusicLibraryLocal() {
  var content = document.getElementById('music-library-content');
  if (!content) return;
  var allTracks = persistentLocalLibraryTracks || [];
  var tracks = musicLibraryFilteredTracks();
  var selected = musicLibrarySelectedTracks();
  var visible = tracks.slice(0, musicLibraryWorkspaceState.visible);
  var armed = musicLibraryActionArmed('remove-local');
  content.innerHTML =
    '<div class="music-library-toolbar">' +
      '<label class="music-library-search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle><path d="m20 20-4-4"></path></svg><input id="music-library-search" type="search" value="' + escHtml(musicLibraryWorkspaceState.query) + '" placeholder="搜索标题、歌手、专辑或路径" autocomplete="off"></label>' +
      '<select id="music-library-folder" class="music-library-select" aria-label="按文件夹筛选"><option value="all">全部文件 · ' + allTracks.length + '</option>' + musicLibraryFolderOptions(allTracks) + '</select>' +
      '<button type="button" class="music-library-command primary" data-library-action="play-visible"' + (tracks.length ? '' : ' disabled') + '>播放当前结果</button>' +
    '</div>' +
    '<div class="music-library-batchbar">' +
      '<span>' + tracks.length + ' 首' + (selected.length ? ' · 已选 ' + selected.length + ' 首' : '') + '</span>' +
      '<div class="music-library-batch-actions">' +
        '<button type="button" data-library-action="select-visible"' + (tracks.length ? '' : ' disabled') + '>选择当前结果</button>' +
        '<button type="button" data-library-action="queue-selected"' + (selected.length ? '' : ' disabled') + '>加入队列</button>' +
        '<select id="music-library-target-playlist" class="music-library-select compact" aria-label="目标歌单">' + musicLibraryPlaylistOptions() + '</select>' +
        '<button type="button" data-library-action="add-selected"' + (selected.length && localFilePlaylists.length ? '' : ' disabled') + '>加入歌单</button>' +
        '<button type="button" class="danger' + (armed ? ' armed' : '') + '" data-library-action="remove-selected"' + (selected.length ? '' : ' disabled') + '>' + (armed ? '再次点击确认' : '从曲库移除') + '</button>' +
      '</div>' +
    '</div>' +
    '<div class="music-library-table" role="table" aria-label="本地音乐">' +
      '<div class="music-library-table-head" role="row"><span></span><span>歌曲</span><span>专辑 / 文件夹</span><span>时长</span><span>操作</span></div>' +
      '<div id="music-library-local-list" class="music-library-list">' +
        (visible.length ? visible.map(function (song, index) {
          var id = musicLibraryTrackId(song);
          var checked = !!musicLibraryWorkspaceState.selected[id];
          return '<div class="music-library-row" role="row" data-library-local-id="' + escHtml(id) + '" style="--row-index:' + index + '">' +
            '<input class="music-library-check" type="checkbox" data-library-select="' + escHtml(id) + '"' + (checked ? ' checked' : '') + ' aria-label="选择 ' + escHtml(song.name || song.title || '歌曲') + '">' +
            '<button class="music-library-track" type="button" data-library-play="' + escHtml(id) + '">' + musicLibraryCoverHtml(song) + '<span><strong>' + escHtml(song.name || song.title || '本地音乐') + '</strong><small>' + escHtml(song.artist || song.singer || '本地文件') + '</small></span></button>' +
            '<span class="music-library-meta"><strong>' + escHtml(song.album || '未标记专辑') + '</strong><small>' + escHtml(musicLibraryFolder(song)) + '</small></span>' +
            '<span class="music-library-time">' + musicLibraryDuration(song.duration) + '</span>' +
            '<span class="music-library-row-actions"><button type="button" data-library-next="' + escHtml(id) + '" title="下一首播放" aria-label="下一首播放">↳</button></span>' +
          '</div>';
        }).join('') : '<div class="music-library-empty"><strong>' + (musicLibraryWorkspaceState.loading ? '正在读取本地曲库…' : '这里还没有符合条件的音乐') + '</strong><span>可在“导入与交换”中选择歌曲或整个文件夹</span></div>') +
        (tracks.length > visible.length ? '<button class="music-library-more" type="button" data-library-action="more-local">继续显示 · ' + (tracks.length - visible.length) + ' 首</button>' : '') +
      '</div>' +
    '</div>';
}

function musicLibraryPlaylistOptions() {
  if (!localFilePlaylists.length) return '<option value="">先创建歌单</option>';
  return localFilePlaylists.map(function (playlist) {
    return '<option value="' + escHtml(String(playlist.id || '')) + '">' + escHtml(playlist.name || '未命名歌单') + '</option>';
  }).join('');
}

function musicLibrarySelectedPlaylist() {
  var id = musicLibraryWorkspaceState.playlistId;
  var playlist = localPlaylistById(id);
  if (!playlist && localFilePlaylists.length) {
    playlist = localFilePlaylists[0];
    musicLibraryWorkspaceState.playlistId = String(playlist.id || '');
  }
  return playlist || null;
}

function renderMusicLibraryPlaylists() {
  var content = document.getElementById('music-library-content');
  if (!content) return;
  var current = musicLibrarySelectedPlaylist();
  var songs = current && current.songs || [];
  var visible = songs.slice(0, musicLibraryWorkspaceState.playlistVisible);
  var deleteArmed = current && musicLibraryActionArmed('delete-playlist:' + current.id);
  content.innerHTML =
    '<div class="music-library-playlist-layout">' +
      '<aside class="music-library-playlist-index">' +
        '<form class="music-library-create" data-library-create-form><input id="music-library-create-name" type="text" maxlength="120" placeholder="新歌单名称" autocomplete="off"><button type="submit" title="创建歌单" aria-label="创建歌单">＋</button></form>' +
        '<div class="music-library-playlist-list">' + (localFilePlaylists.length ? localFilePlaylists.map(function (playlist, index) {
          var active = current && String(current.id) === String(playlist.id);
          var playlistCover = playlist.customCover || playlist.cover || '';
          return '<button class="music-library-playlist-item' + (active ? ' active' : '') + '" type="button" data-library-playlist="' + escHtml(String(playlist.id || '')) + '" style="--row-index:' + index + '">' +
            '<span class="music-library-playlist-cover">' + (playlistCover ? '<img src="' + escHtml(playlistCover) + '" alt="" loading="lazy" onerror="this.remove()">' : '') + '</span>' +
            '<span><strong>' + escHtml(playlist.name || '未命名歌单') + '</strong><small>' + Number(playlist.songs && playlist.songs.length || 0) + ' 首</small></span>' +
          '</button>';
        }).join('') : '<div class="music-library-empty compact"><strong>还没有本地歌单</strong><span>在上方输入名称即可创建</span></div>') + '</div>' +
      '</aside>' +
      '<section class="music-library-playlist-detail">' + (current ?
        (typeof musicLibraryPlaylistOrganizerHeadHtml === 'function' ? musicLibraryPlaylistOrganizerHeadHtml(current, songs, deleteArmed) : '<div class="music-library-playlist-detail-head">' +
          '<div class="music-library-playlist-title-edit"><input id="music-library-playlist-name" type="text" maxlength="120" value="' + escHtml(current.name || '') + '"><button type="button" data-library-action="rename-playlist">保存名称</button></div>' +
          '<div class="music-library-detail-actions">' +
            '<button type="button" class="primary" data-library-action="play-playlist"' + (songs.length ? '' : ' disabled') + '>播放</button>' +
            '<button type="button" data-library-action="queue-playlist"' + (songs.length ? '' : ' disabled') + '>加入队列</button>' +
            '<button type="button" data-library-action="export-playlist">导出</button>' +
            '<button type="button" class="danger' + (deleteArmed ? ' armed' : '') + '" data-library-action="delete-playlist">' + (deleteArmed ? '再次点击确认' : '删除歌单') + '</button>' +
          '</div>' +
          '<p>共 ' + songs.length + ' 首 · 歌曲文件不会随歌单删除</p>' +
        '</div>') +
        '<div class="music-library-playlist-tracks">' + (visible.length ? visible.map(function (song, index) {
          var armed = musicLibraryActionArmed('remove-playlist-song:' + current.id + ':' + index);
          if (typeof musicLibraryPlaylistOrganizerRowHtml === 'function') return musicLibraryPlaylistOrganizerRowHtml(current, song, index, armed);
          return '<div class="music-library-playlist-track" style="--row-index:' + index + '">' +
            '<span class="music-library-track-number">' + String(index + 1).padStart(2, '0') + '</span>' +
            '<button type="button" class="music-library-track-copy" data-library-playlist-song="' + index + '"><strong>' + escHtml(song.name || song.title || '未知歌曲') + '</strong><small>' + escHtml(song.artist || song.singer || '未知歌手') + '</small></button>' +
            '<span class="music-library-row-actions"><button type="button" data-library-playlist-next="' + index + '" title="下一首播放" aria-label="下一首播放">↳</button><button type="button" class="danger' + (armed ? ' armed' : '') + '" data-library-playlist-remove="' + index + '" title="' + (armed ? '再次点击确认' : '从歌单移除') + '" aria-label="从歌单移除">×</button></span>' +
          '</div>';
        }).join('') : '<div class="music-library-empty"><strong>这个歌单还是空的</strong><span>在“本地音乐”中选择歌曲后加入歌单</span></div>') +
          (songs.length > visible.length ? '<button class="music-library-more" type="button" data-library-action="more-playlist">继续显示 · ' + (songs.length - visible.length) + ' 首</button>' : '') +
        '</div>' : '<div class="music-library-empty"><strong>创建第一个歌单</strong><span>歌单用于整理本地音乐和各平台歌曲</span></div>') +
      '</section>' +
    '</div>';
  var form = content.querySelector('[data-library-create-form]');
  if (form) form.addEventListener('submit', function (event) { event.preventDefault(); createMusicLibraryPlaylist(); });
  if (typeof bindMusicLibraryPlaylistOrganizer === 'function') bindMusicLibraryPlaylistOrganizer(content, current, visible.length);
}

function renderMusicLibraryImport() {
  var content = document.getElementById('music-library-content');
  if (!content) return;
  content.innerHTML =
    '<div class="music-library-import-intro"><span class="music-library-kicker">导入与交换</span><h3>把音乐带进来，也能随时带走</h3><p>导入只建立索引，不移动或修改原文件。歌单默认使用 Mineradio 自己的格式导出，同时兼容读取旧格式。</p></div>' +
    '<div class="music-library-import-list">' +
      musicLibraryImportRow('song', '导入歌曲', '选择一首或多首 MP3、FLAC、WAV、OGG、M4A、AAC 或 OPUS', '选择歌曲') +
      musicLibraryImportRow('folder', '导入文件夹', '保留文件夹层级，用于本地音乐中的文件夹筛选', '选择文件夹') +
      musicLibraryImportRow('playlist-file', '导入歌单文件', '支持 Mineradio 歌单，并兼容读取旧的压缩歌单文件', '选择歌单') +
      musicLibraryImportRow('playlist-link', '导入分享链接', '读取网易云、QQ 音乐或酷狗歌单分享链接', '粘贴链接') +
    '</div>';
}

function musicLibraryImportRow(action, title, description, command) {
  return '<section class="music-library-import-row"><span class="music-library-import-mark" aria-hidden="true"></span><div><h4>' + title + '</h4><p>' + description + '</p></div><button type="button" data-library-import="' + action + '">' + command + '</button></section>';
}

function musicLibraryOfflineEntries() {
  var snapshot = offlineMusicState && offlineMusicState.snapshot || { tracks: [] };
  var entries = (snapshot.tracks || []).slice();
  var query = String(musicLibraryWorkspaceState.query || '').trim().toLowerCase();
  if (!query) return entries;
  return entries.filter(function (entry) {
    var song = entry && entry.song || {};
    return [song.name, song.title, song.artist, song.album, offlineMusicProviderLabel(song), entry.quality]
      .join(' ').toLowerCase().indexOf(query) >= 0;
  });
}

function musicLibraryOfflineProgressHtml(job) {
  var received = Math.max(0, Number(job && job.receivedBytes) || 0);
  var total = Math.max(0, Number(job && job.totalBytes) || 0);
  var ratio = total ? Math.max(0, Math.min(100, received / total * 100)) : 0;
  var text = job && job.status === 'resolving' ? '正在解析音源' : ('已保存 ' + offlineMusicBytesLabel(received) + (total ? (' / ' + offlineMusicBytesLabel(total)) : ''));
  return '<div class="music-library-offline-job" data-offline-job="' + escHtml(job.key) + '">' +
    '<div class="music-library-offline-job-copy"><strong>' + escHtml(job.song && (job.song.name || job.song.title) || '正在保存') + '</strong><small>' + escHtml(text) + '</small></div>' +
    '<div class="music-library-offline-progress"><i style="width:' + ratio.toFixed(1) + '%"></i></div>' +
    '<button type="button" data-offline-cancel="' + escHtml(job.key) + '">取消</button>' +
  '</div>';
}

function renderMusicLibraryOffline() {
  var content = document.getElementById('music-library-content');
  if (!content) return;
  var snapshot = offlineMusicState && offlineMusicState.snapshot || { ok: false, count: 0, bytes: 0, tracks: [], jobs: [] };
  var entries = musicLibraryOfflineEntries();
  var jobs = Object.keys(offlineMusicState.progress || {}).map(function (key) { return offlineMusicState.progress[key]; }).filter(Boolean);
  var broken = entries.filter(function (entry) { return !entry.available; }).length;
  content.innerHTML =
    '<div class="music-library-offline">' +
      '<section class="music-library-offline-summary">' +
        '<div><span class="music-library-kicker">离线音乐</span><h3>' + (snapshot.ok === false ? '离线库暂不可用' : '带着音乐离开网络') + '</h3><p>这里只管理你明确保存的网络歌曲。移除离线副本不会删除歌单，也不会影响本地音乐。</p></div>' +
        '<div class="music-library-offline-metrics"><span><strong>' + Number(snapshot.count || 0) + '</strong><small>已保存</small></span><span><strong>' + escHtml(offlineMusicBytesLabel(snapshot.bytes || 0)) + '</strong><small>磁盘占用</small></span><span><strong>' + jobs.length + '</strong><small>进行中</small></span></div>' +
      '</section>' +
      (jobs.length ? '<div class="music-library-offline-jobs">' + jobs.map(musicLibraryOfflineProgressHtml).join('') + '</div>' : '') +
      '<div class="music-library-toolbar offline">' +
        '<label class="music-library-search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle><path d="m20 20-4-4"></path></svg><input id="music-library-search" type="search" value="' + escHtml(musicLibraryWorkspaceState.query) + '" placeholder="搜索离线歌曲、歌手或来源" autocomplete="off"></label>' +
        '<span class="music-library-offline-filter">' + entries.length + ' 首' + (broken ? (' · ' + broken + ' 项需清理') : ' · 均可读取') + '</span>' +
        '<button type="button" class="music-library-command" data-offline-refresh>刷新状态</button>' +
      '</div>' +
      '<div class="music-library-offline-list">' + (entries.length ? entries.map(function (entry, index) {
        var song = entry.song || {};
        var armed = offlineMusicState.confirmKey === entry.key && offlineMusicState.confirmUntil > Date.now();
        return '<div class="music-library-offline-row' + (entry.available ? '' : ' broken') + '" style="--row-index:' + index + '">' +
          '<button type="button" class="music-library-track" data-offline-play="' + escHtml(entry.key) + '"' + (entry.available ? '' : ' disabled') + '>' + musicLibraryCoverHtml(song) + '<span><strong>' + escHtml(song.name || song.title || '未知歌曲') + '</strong><small>' + escHtml(song.artist || '未知歌手') + '</small></span></button>' +
          '<span class="music-library-meta"><strong>' + escHtml(song.album || offlineMusicProviderLabel(song)) + '</strong><small>' + escHtml(offlineMusicProviderLabel(song) + (entry.quality ? (' · ' + entry.quality) : '')) + '</small></span>' +
          '<span class="music-library-offline-file"><strong>' + escHtml(offlineMusicBytesLabel(entry.bytes)) + '</strong><small>' + escHtml(entry.available ? offlineMusicDateLabel(entry.savedAt) : '文件不可用') + '</small></span>' +
          '<span class="music-library-row-actions"><button type="button" data-offline-play="' + escHtml(entry.key) + '" title="播放" aria-label="播放"' + (entry.available ? '' : ' disabled') + '>▶</button><button type="button" class="danger' + (armed ? ' armed' : '') + '" data-offline-remove="' + escHtml(entry.key) + '" title="' + (armed ? '再次点击确认' : '移除离线副本') + '" aria-label="移除离线副本">×</button></span>' +
        '</div>';
      }).join('') : '<div class="music-library-empty"><strong>' + (offlineMusicState.loading ? '正在读取离线音乐…' : (musicLibraryWorkspaceState.query ? '没有匹配的离线歌曲' : '还没有离线音乐')) + '</strong><span>播放网络歌曲时，在歌曲详情中选择“保存离线”</span></div>') + '</div>' +
    '</div>';
}

function musicLibraryHistorySourceKey(record) {
  var provider = String(record && (record.sourceKey || record.provider) || '').toLowerCase();
  if (record && (record.localFileId || record.localKey) || provider === 'local') return 'local';
  if (/^(netease|qq|kugou|qishui|spotify|kuwo|migu)$/.test(provider)) return provider;
  return provider || 'other';
}

function musicLibraryHistorySourceLabel(record) {
  var key = musicLibraryHistorySourceKey(record);
  if (key === 'local') return '本地音乐';
  if (/^(netease|qq|kugou|qishui|spotify|kuwo|migu)$/.test(key)) return offlineMusicProviderLabel({ provider: key });
  if (record && record.additionalSourceCode) return '附加来源';
  return String(record && record.source || '').trim() || '其他来源';
}

function musicLibraryHistoryTimeLabel(value) {
  var timestamp = Number(value) || 0;
  if (!timestamp) return '未知时间';
  var diff = Date.now() - timestamp;
  if (diff >= 0 && diff < 60000) return '刚刚';
  if (diff >= 0 && diff < 60 * 60000) return Math.max(1, Math.floor(diff / 60000)) + ' 分钟前';
  if (diff >= 0 && diff < 24 * 60 * 60000) return Math.max(1, Math.floor(diff / (60 * 60000))) + ' 小时前';
  var date = new Date(timestamp);
  return date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit', year: date.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' });
}

function musicLibraryHistoryDurationLabel(milliseconds) {
  var minutes = Math.floor(Math.max(0, Number(milliseconds) || 0) / 60000);
  if (minutes < 60) return minutes + ' 分钟';
  var hours = Math.floor(minutes / 60);
  return hours + ' 小时' + (minutes % 60 ? ' ' + minutes % 60 + ' 分' : '');
}

function musicLibraryHistoryEntries() {
  var query = String(musicLibraryWorkspaceState.query || '').trim().toLowerCase();
  var provider = musicLibraryWorkspaceState.historyProvider || 'all';
  var range = musicLibraryWorkspaceState.historyRange || 'all';
  var now = Date.now();
  var cutoff = range === 'week' ? now - 7 * 24 * 60 * 60 * 1000 : (range === 'month' ? now - 30 * 24 * 60 * 60 * 1000 : 0);
  if (range === 'today') {
    var today = new Date(now);
    today.setHours(0, 0, 0, 0);
    cutoff = today.getTime();
  }
  return normalizeListenHistory(listenStatsState && listenStatsState.history).filter(function (record) {
    if (provider !== 'all' && musicLibraryHistorySourceKey(record) !== provider) return false;
    if (cutoff && Number(record.playedAt || 0) < cutoff) return false;
    if (!query) return true;
    return [record.name, record.artist, record.album, musicLibraryHistorySourceLabel(record)].join(' ').toLowerCase().indexOf(query) >= 0;
  });
}

function musicLibraryHistoryProviderOptions(records) {
  var providers = Object.create(null);
  (records || []).forEach(function (record) { providers[musicLibraryHistorySourceKey(record)] = musicLibraryHistorySourceLabel(record); });
  return Object.keys(providers).sort().map(function (key) {
    return '<option value="' + escHtml(key) + '"' + (musicLibraryWorkspaceState.historyProvider === key ? ' selected' : '') + '>' + escHtml(providers[key]) + '</option>';
  }).join('');
}

function renderMusicLibraryHistory() {
  var content = document.getElementById('music-library-content');
  if (!content) return;
  var allRecords = normalizeListenHistory(listenStatsState && listenStatsState.history);
  var entries = musicLibraryHistoryEntries();
  var visible = entries.slice(0, musicLibraryWorkspaceState.historyVisible);
  var listenMs = allRecords.reduce(function (sum, record) { return sum + Math.max(0, Number(record.listenMs) || 0); }, 0);
  var unfinished = allRecords.filter(function (record) { return Number(record.resumeAt) > 0; }).length;
  var clearArmed = musicLibraryActionArmed('clear-history');
  content.innerHTML =
    '<div class="music-library-history">' +
      '<section class="music-library-history-summary">' +
        '<div><span class="music-library-kicker">最近播放</span><h3>顺着上次听到的地方继续</h3><p>只记录本机的有效收听。这里的整理不会影响歌单、离线副本或累计听歌画像。</p></div>' +
        '<div class="music-library-history-metrics"><span><strong>' + allRecords.length + '</strong><small>最近记录</small></span><span><strong>' + escHtml(musicLibraryHistoryDurationLabel(listenMs)) + '</strong><small>有效收听</small></span><span><strong>' + unfinished + '</strong><small>可继续</small></span></div>' +
      '</section>' +
      '<div class="music-library-toolbar history">' +
        '<label class="music-library-search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle><path d="m20 20-4-4"></path></svg><input id="music-library-search" type="search" value="' + escHtml(musicLibraryWorkspaceState.query) + '" placeholder="搜索歌曲、歌手、专辑或来源" autocomplete="off"></label>' +
        '<select id="music-library-history-range" class="music-library-select" aria-label="播放时间"><option value="all"' + (musicLibraryWorkspaceState.historyRange === 'all' ? ' selected' : '') + '>全部时间</option><option value="today"' + (musicLibraryWorkspaceState.historyRange === 'today' ? ' selected' : '') + '>今天</option><option value="week"' + (musicLibraryWorkspaceState.historyRange === 'week' ? ' selected' : '') + '>最近 7 天</option><option value="month"' + (musicLibraryWorkspaceState.historyRange === 'month' ? ' selected' : '') + '>最近 30 天</option></select>' +
        '<select id="music-library-history-provider" class="music-library-select" aria-label="音乐来源"><option value="all">全部来源</option>' + musicLibraryHistoryProviderOptions(allRecords) + '</select>' +
        '<button type="button" class="music-library-command danger' + (clearArmed ? ' armed' : '') + '" data-history-clear' + (allRecords.length ? '' : ' disabled') + '>' + (clearArmed ? '再次点击确认' : '清空记录') + '</button>' +
      '</div>' +
      '<div class="music-library-history-list">' + (visible.length ? visible.map(function (record, index) {
        var resumeAt = Math.max(0, Number(record.resumeAt) || 0);
        var progress = Math.max(0, Math.min(1, Number(record.progress) || 0));
        var armed = musicLibraryActionArmed('remove-history:' + record.key);
        return '<div class="music-library-history-row" style="--row-index:' + index + '">' +
          '<button type="button" class="music-library-track" data-history-play="' + escHtml(record.key) + '">' + musicLibraryCoverHtml(record) + '<span><strong>' + escHtml(record.name || '未知歌曲') + '</strong><small>' + escHtml(record.artist || '未知歌手') + '</small></span></button>' +
          '<span class="music-library-meta"><strong>' + escHtml(record.album || musicLibraryHistorySourceLabel(record)) + '</strong><small>' + escHtml(musicLibraryHistorySourceLabel(record)) + '</small></span>' +
          '<span class="music-library-history-progress"><i><b style="width:' + (progress * 100).toFixed(1) + '%"></b></i><small>' + escHtml(resumeAt ? ('继续 ' + musicLibraryDuration(resumeAt) + ' / ' + musicLibraryDuration(record.durationSec)) : (record.completed ? '已听完' : musicLibraryDuration(record.listenMs / 1000) + ' 有效收听')) + '</small></span>' +
          '<span class="music-library-history-time"><strong>' + escHtml(musicLibraryHistoryTimeLabel(record.playedAt)) + '</strong><small>' + (resumeAt ? '未听完' : '从头播放') + '</small></span>' +
          '<span class="music-library-row-actions"><button type="button" data-history-play="' + escHtml(record.key) + '" title="' + (resumeAt ? '继续播放' : '播放') + '" aria-label="' + (resumeAt ? '继续播放' : '播放') + '">▶</button><button type="button" data-history-next="' + escHtml(record.key) + '" title="下一首播放" aria-label="下一首播放">↳</button><button type="button" class="danger' + (armed ? ' armed' : '') + '" data-history-remove="' + escHtml(record.key) + '" title="' + (armed ? '再次点击确认' : '移除记录') + '" aria-label="移除记录">×</button></span>' +
        '</div>';
      }).join('') : '<div class="music-library-empty"><strong>' + (allRecords.length ? '没有符合条件的播放记录' : '还没有最近播放') + '</strong><span>完整听过或收听一段时间的歌曲会出现在这里</span></div>') +
        (entries.length > visible.length ? '<button class="music-library-more" type="button" data-library-action="more-history">继续显示 · ' + (entries.length - visible.length) + ' 首</button>' : '') +
      '</div>' +
    '</div>';
}

function musicLibraryHistoryRecord(key) {
  return (listenStatsState.history || []).filter(function (record) { return record && record.key === String(key || ''); })[0] || null;
}

function renderMusicLibraryWorkspace(reason) {
  var mask = ensureMusicLibraryWorkspace();
  var tab = musicLibraryWorkspaceState.tab;
  mask.querySelectorAll('[data-library-tab]').forEach(function (button) {
    var active = button.getAttribute('data-library-tab') === tab;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', active ? 'true' : 'false');
  });
  var summary = document.getElementById('music-library-summary');
  if (summary) summary.textContent = tab === 'local'
    ? ((persistentLocalLibraryTracks || []).length + ' 首本地音乐 · ' + Object.keys(musicLibraryWorkspaceState.selected).filter(function (id) { return musicLibraryWorkspaceState.selected[id]; }).length + ' 首已选')
    : (tab === 'playlists' ? (localFilePlaylists.length + ' 个本地歌单') : (tab === 'history' ? ((listenStatsState.history || []).length + ' 条本机收听记录') : (tab === 'offline' ? ((offlineMusicState.snapshot.count || 0) + ' 首离线音乐 · ' + offlineMusicBytesLabel(offlineMusicState.snapshot.bytes || 0)) : (tab === 'health' ? '检查重复音乐与失效索引' : '导入音乐、歌单文件或平台分享链接'))));
  if (tab === 'local') renderMusicLibraryLocal();
  else if (tab === 'playlists') renderMusicLibraryPlaylists();
  else if (tab === 'history') renderMusicLibraryHistory();
  else if (tab === 'offline') renderMusicLibraryOffline();
  else if (tab === 'health' && typeof renderMusicLibraryHealth === 'function') renderMusicLibraryHealth();
  else renderMusicLibraryImport();
}

function refreshMusicLibraryWorkspace(reason) {
  if (!musicLibraryWorkspaceState.open) return false;
  renderMusicLibraryWorkspace(reason || 'refresh');
  return true;
}

function loadMusicLibraryTracks() {
  var bridge = window.desktopWindow;
  if (!bridge || typeof bridge.listLocalMusicLibrary !== 'function') return Promise.resolve(false);
  musicLibraryWorkspaceState.loading = true;
  refreshMusicLibraryWorkspace('local-load-start');
  return bridge.listLocalMusicLibrary().then(function (result) {
    if (!result || result.ok !== true || !Array.isArray(result.tracks)) throw new Error(result && result.error || 'LOCAL_LIBRARY_READ_FAILED');
    persistentLocalLibraryTracks = result.tracks.map(function (song) {
      var copy = hydrateCustomCover(Object.assign({}, song));
      copy.localMissing = false;
      return copy;
    });
    return true;
  }).catch(function (error) {
    console.warn('[MusicLibrary]', error);
    showToast('本地曲库读取失败');
    return false;
  }).finally(function () {
    musicLibraryWorkspaceState.loading = false;
    refreshMusicLibraryWorkspace('local-load-complete');
  });
}

function openMusicLibraryWorkspace(tab) {
  var mask = ensureMusicLibraryWorkspace();
  musicLibraryWorkspaceState.open = true;
  musicLibraryWorkspaceState.tab = /^(local|playlists|history|offline|health|import)$/.test(String(tab || '')) ? String(tab) : musicLibraryWorkspaceState.tab;
  musicLibraryWorkspaceState.visible = MUSIC_LIBRARY_BATCH_SIZE;
  musicLibraryWorkspaceState.playlistVisible = MUSIC_LIBRARY_BATCH_SIZE;
  musicLibraryWorkspaceState.historyVisible = MUSIC_LIBRARY_BATCH_SIZE;
  mask.classList.add('show');
  mask.setAttribute('aria-hidden', 'false');
  document.body.classList.add('music-library-open');
  if (typeof closeUploadPanel === 'function') closeUploadPanel({ force: true });
  renderMusicLibraryWorkspace('open');
  Promise.resolve(localPlaylistCatalogReady).then(function () { refreshMusicLibraryWorkspace('catalog-ready'); });
  loadMusicLibraryTracks();
  if (musicLibraryWorkspaceState.tab === 'offline') refreshOfflineMusicSnapshot(true);
  if (musicLibraryWorkspaceState.tab === 'health' && typeof loadMusicLibraryHealth === 'function') loadMusicLibraryHealth(false);
  requestAnimationFrame(function () {
    var focus = mask.querySelector('[data-library-tab].active');
    if (focus) focus.focus({ preventScroll: true });
  });
}

function closeMusicLibraryWorkspace() {
  var mask = document.getElementById('music-library-mask');
  musicLibraryWorkspaceState.open = false;
  if (mask) {
    mask.classList.remove('show');
    mask.setAttribute('aria-hidden', 'true');
  }
  document.body.classList.remove('music-library-open');
  var entry = document.getElementById('music-library-btn');
  if (entry) entry.focus({ preventScroll: true });
}

function musicLibrarySongById(id) {
  return (persistentLocalLibraryTracks || []).find(function (song) { return musicLibraryTrackId(song) === String(id || ''); }) || null;
}

function playMusicLibraryTracks(tracks) {
  tracks = Array.isArray(tracks) ? tracks.filter(Boolean) : [];
  if (!tracks.length) { showToast('没有可播放的歌曲'); return; }
  cancelPlaylistQueueHydration('music-library');
  playQueue = tracks.map(cloneSong);
  currentIdx = 0;
  activeRadioContext = null;
  safeRenderQueuePanel('music-library-play', { animate: true, scrollCurrent: true });
  safeShelfRebuild('music-library-play', true);
  forcePlaybackControlsInteractive();
  closeMusicLibraryWorkspace();
  Promise.resolve(playQueueAt(0, { manual: true })).catch(function () { showToast('歌曲播放失败'); });
}

function playMusicLibraryTrack(id) {
  var song = musicLibrarySongById(id);
  if (!song) return;
  var index = queueSongNext(song);
  closeMusicLibraryWorkspace();
  Promise.resolve(playQueueAt(index, { manual: true })).catch(function () { showToast('歌曲播放失败'); });
}

function queueMusicLibraryTracks(tracks) {
  var added = typeof queueSongs === 'function' ? queueSongs(tracks, { dedupe: true }) : 0;
  showToast(added ? ('已将 ' + added + ' 首加入队列') : '所选歌曲已在队列中');
}

function createMusicLibraryPlaylist() {
  var input = document.getElementById('music-library-create-name');
  var playlist = createLocalFilePlaylist(input && input.value);
  if (!playlist) { showToast('请输入歌单名称'); return; }
  musicLibraryWorkspaceState.playlistId = String(playlist.id);
  musicLibraryWorkspaceState.playlistVisible = MUSIC_LIBRARY_BATCH_SIZE;
  refreshMusicLibraryWorkspace('playlist-create');
}

function removeMusicLibrarySelectedTracks() {
  var selected = musicLibrarySelectedTracks();
  if (!selected.length) return;
  if (!armMusicLibraryAction('remove-local')) return;
  var bridge = window.desktopWindow;
  if (!bridge || typeof bridge.removeLocalMusicTracks !== 'function') { showToast('当前环境无法整理本地曲库'); return; }
  bridge.removeLocalMusicTracks(selected.map(musicLibraryTrackId)).then(function (result) {
    if (!result || result.ok !== true || !Array.isArray(result.tracks)) throw new Error(result && result.error || 'LOCAL_LIBRARY_REMOVE_FAILED');
    persistentLocalLibraryTracks = result.tracks.map(function (song) {
      var copy = hydrateCustomCover(Object.assign({}, song));
      copy.localMissing = false;
      return copy;
    });
    musicLibraryWorkspaceState.selected = Object.create(null);
    showToast('已从曲库移除 ' + selected.length + ' 首，磁盘文件未删除');
    refreshMusicLibraryWorkspace('local-remove');
  }).catch(function (error) {
    console.warn('[MusicLibrary]', error);
    showToast('曲库整理失败，原有索引已保留');
  });
}

function handleMusicLibraryClick(event) {
  var close = event.target.closest('[data-library-close]');
  if (close || event.target.id === 'music-library-mask') { closeMusicLibraryWorkspace(); return; }
  var tab = event.target.closest('[data-library-tab]');
  if (tab) {
    musicLibraryWorkspaceState.tab = tab.getAttribute('data-library-tab');
    musicLibraryWorkspaceState.query = '';
    musicLibraryWorkspaceState.visible = MUSIC_LIBRARY_BATCH_SIZE;
    musicLibraryWorkspaceState.playlistVisible = MUSIC_LIBRARY_BATCH_SIZE;
    musicLibraryWorkspaceState.historyVisible = MUSIC_LIBRARY_BATCH_SIZE;
    renderMusicLibraryWorkspace('tab');
    if (musicLibraryWorkspaceState.tab === 'health' && typeof loadMusicLibraryHealth === 'function') loadMusicLibraryHealth(false);
    if (musicLibraryWorkspaceState.tab === 'offline') refreshOfflineMusicSnapshot(true);
    return;
  }
  var historyPlay = event.target.closest('[data-history-play]');
  if (historyPlay) {
    var playRecord = musicLibraryHistoryRecord(historyPlay.getAttribute('data-history-play'));
    if (playRecord) {
      closeMusicLibraryWorkspace();
      Promise.resolve(playListenHistoryRecord(playRecord)).catch(function () { showToast('播放记录暂时无法打开'); });
    }
    return;
  }
  var historyNext = event.target.closest('[data-history-next]');
  if (historyNext) {
    var nextRecord = musicLibraryHistoryRecord(historyNext.getAttribute('data-history-next'));
    var nextSong = listenHistorySong(nextRecord);
    if (nextSong) { queueSongNext(nextSong); showToast('已设为下一首：' + (nextSong.name || '歌曲')); }
    else showToast('这条记录暂时无法加入队列');
    return;
  }
  var historyRemove = event.target.closest('[data-history-remove]');
  if (historyRemove) {
    var historyKey = historyRemove.getAttribute('data-history-remove');
    if (!armMusicLibraryAction('remove-history:' + historyKey)) return;
    removeListenHistoryRecord(historyKey);
    refreshMusicLibraryWorkspace('history-remove');
    showToast('已移除播放记录');
    return;
  }
  var historyClear = event.target.closest('[data-history-clear]');
  if (historyClear) {
    if (!armMusicLibraryAction('clear-history')) return;
    clearListenHistory();
    refreshMusicLibraryWorkspace('history-clear');
    showToast('最近播放已清空，累计听歌画像仍保留');
    return;
  }
  var offlinePlay = event.target.closest('[data-offline-play]');
  if (offlinePlay) { playOfflineMusicEntry(offlinePlay.getAttribute('data-offline-play')); return; }
  var offlineCancel = event.target.closest('[data-offline-cancel]');
  if (offlineCancel) { cancelOfflineMusicDownload(offlineCancel.getAttribute('data-offline-cancel')); return; }
  var offlineRefresh = event.target.closest('[data-offline-refresh]');
  if (offlineRefresh) { refreshOfflineMusicSnapshot(true); return; }
  var offlineRemove = event.target.closest('[data-offline-remove]');
  if (offlineRemove) {
    var removeKey = offlineRemove.getAttribute('data-offline-remove');
    if (offlineMusicState.confirmKey !== removeKey || offlineMusicState.confirmUntil <= Date.now()) {
      offlineMusicState.confirmKey = removeKey;
      offlineMusicState.confirmUntil = Date.now() + 4200;
      renderMusicLibraryWorkspace('offline-remove-arm');
      return;
    }
    offlineMusicState.confirmKey = '';
    offlineMusicState.confirmUntil = 0;
    removeOfflineMusicEntry(removeKey);
    return;
  }
  if (typeof handleMusicLibraryOrganizerClick === 'function' && handleMusicLibraryOrganizerClick(event)) return;
  var play = event.target.closest('[data-library-play]');
  if (play) { playMusicLibraryTrack(play.getAttribute('data-library-play')); return; }
  var next = event.target.closest('[data-library-next]');
  if (next) {
    var nextSong = musicLibrarySongById(next.getAttribute('data-library-next'));
    if (nextSong) { queueSongNext(nextSong); showToast('已设为下一首：' + (nextSong.name || nextSong.title || '本地音乐')); }
    return;
  }
  var playlistButton = event.target.closest('[data-library-playlist]');
  if (playlistButton) {
    musicLibraryWorkspaceState.playlistId = playlistButton.getAttribute('data-library-playlist');
    musicLibraryWorkspaceState.playlistVisible = MUSIC_LIBRARY_BATCH_SIZE;
    renderMusicLibraryWorkspace('playlist-select');
    return;
  }
  var playlistSong = event.target.closest('[data-library-playlist-song]');
  if (playlistSong) {
    var current = musicLibrarySelectedPlaylist();
    var song = current && current.songs[Number(playlistSong.getAttribute('data-library-playlist-song'))];
    if (song) {
      var queueIndex = queueSongNext(song);
      closeMusicLibraryWorkspace();
      Promise.resolve(playQueueAt(queueIndex, { manual: true })).catch(function () { showToast('歌曲播放失败'); });
    }
    return;
  }
  var playlistNext = event.target.closest('[data-library-playlist-next]');
  if (playlistNext) {
    var nextPlaylist = musicLibrarySelectedPlaylist();
    var nextPlaylistSong = nextPlaylist && nextPlaylist.songs[Number(playlistNext.getAttribute('data-library-playlist-next'))];
    if (nextPlaylistSong) { queueSongNext(nextPlaylistSong); showToast('已设为下一首：' + (nextPlaylistSong.name || '歌曲')); }
    return;
  }
  var playlistRemove = event.target.closest('[data-library-playlist-remove]');
  if (playlistRemove) {
    var removePlaylist = musicLibrarySelectedPlaylist();
    var removeIndex = Number(playlistRemove.getAttribute('data-library-playlist-remove'));
    var removeAction = 'remove-playlist-song:' + removePlaylist.id + ':' + removeIndex;
    if (!armMusicLibraryAction(removeAction)) return;
    removeSongFromLocalFilePlaylist(removePlaylist.id, removeIndex);
    refreshMusicLibraryWorkspace('playlist-song-remove');
    return;
  }
  var importButton = event.target.closest('[data-library-import]');
  if (importButton) {
    var kind = importButton.getAttribute('data-library-import');
    if (kind === 'song') triggerUploadInput('audio');
    else if (kind === 'folder') triggerUploadInput('folder');
    else if (kind === 'playlist-file') openLocalPlaylistImport();
    else if (kind === 'playlist-link') openLocalPlaylistLinkImport();
    return;
  }
  var actionButton = event.target.closest('[data-library-action]');
  if (!actionButton) return;
  var action = actionButton.getAttribute('data-library-action');
  if (action === 'play-visible') playMusicLibraryTracks(musicLibraryFilteredTracks());
  else if (action === 'select-visible') {
    var filtered = musicLibraryFilteredTracks();
    var allSelected = filtered.length && filtered.every(function (song) { return musicLibraryWorkspaceState.selected[musicLibraryTrackId(song)]; });
    filtered.forEach(function (song) {
      var id = musicLibraryTrackId(song);
      if (allSelected) delete musicLibraryWorkspaceState.selected[id];
      else musicLibraryWorkspaceState.selected[id] = true;
    });
    renderMusicLibraryWorkspace('select-visible');
  } else if (action === 'queue-selected') queueMusicLibraryTracks(musicLibrarySelectedTracks());
  else if (action === 'add-selected') {
    var target = document.getElementById('music-library-target-playlist');
    var result = addSongsToLocalFilePlaylist(target && target.value, musicLibrarySelectedTracks());
    if (result && result.ok) showToast(result.added ? ('已加入歌单 ' + result.added + ' 首') : '所选歌曲已在歌单中');
    refreshMusicLibraryWorkspace('playlist-add-selection');
  } else if (action === 'remove-selected') removeMusicLibrarySelectedTracks();
  else if (action === 'more-local') { musicLibraryWorkspaceState.visible += MUSIC_LIBRARY_BATCH_SIZE; renderMusicLibraryWorkspace('more-local'); }
  else if (action === 'more-history') { musicLibraryWorkspaceState.historyVisible += MUSIC_LIBRARY_BATCH_SIZE; renderMusicLibraryWorkspace('more-history'); }
  else if (action === 'more-playlist') { musicLibraryWorkspaceState.playlistVisible += MUSIC_LIBRARY_BATCH_SIZE; renderMusicLibraryWorkspace('more-playlist'); }
  else if (action === 'rename-playlist') {
    var selectedPlaylist = musicLibrarySelectedPlaylist();
    var nameInput = document.getElementById('music-library-playlist-name');
    if (selectedPlaylist && renameLocalFilePlaylist(selectedPlaylist.id, nameInput && nameInput.value)) showToast('歌单名称已保存');
    refreshMusicLibraryWorkspace('playlist-rename');
  } else if (action === 'play-playlist') {
    var playPlaylist = musicLibrarySelectedPlaylist();
    if (playPlaylist) playMusicLibraryTracks(playPlaylist.songs);
  } else if (action === 'queue-playlist') {
    var queuePlaylist = musicLibrarySelectedPlaylist();
    if (queuePlaylist) queueMusicLibraryTracks(queuePlaylist.songs);
  } else if (action === 'export-playlist') {
    var exportPlaylist = musicLibrarySelectedPlaylist();
    if (exportPlaylist) exportLocalPlaylistFile(exportPlaylist.id);
  } else if (action === 'delete-playlist') {
    var deletePlaylist = musicLibrarySelectedPlaylist();
    if (!deletePlaylist || !armMusicLibraryAction('delete-playlist:' + deletePlaylist.id)) return;
    deleteLocalFilePlaylist(deletePlaylist.id);
    musicLibraryWorkspaceState.playlistId = localFilePlaylists[0] && String(localFilePlaylists[0].id) || '';
    refreshMusicLibraryWorkspace('playlist-delete');
  }
}

function handleMusicLibraryInput(event) {
  if (event.target.id !== 'music-library-search') return;
  musicLibraryWorkspaceState.query = event.target.value;
  musicLibraryWorkspaceState.visible = MUSIC_LIBRARY_BATCH_SIZE;
  musicLibraryWorkspaceState.historyVisible = MUSIC_LIBRARY_BATCH_SIZE;
  var selectionStart = event.target.selectionStart;
  renderMusicLibraryWorkspace('search');
  requestAnimationFrame(function () {
    var input = document.getElementById('music-library-search');
    if (!input) return;
    input.focus({ preventScroll: true });
    try { input.setSelectionRange(selectionStart, selectionStart); } catch (_) { }
  });
}

function handleMusicLibraryChange(event) {
  if (event.target.id === 'music-library-history-range') {
    musicLibraryWorkspaceState.historyRange = event.target.value || 'all';
    musicLibraryWorkspaceState.historyVisible = MUSIC_LIBRARY_BATCH_SIZE;
    renderMusicLibraryWorkspace('history-range');
    return;
  }
  if (event.target.id === 'music-library-history-provider') {
    musicLibraryWorkspaceState.historyProvider = event.target.value || 'all';
    musicLibraryWorkspaceState.historyVisible = MUSIC_LIBRARY_BATCH_SIZE;
    renderMusicLibraryWorkspace('history-provider');
    return;
  }
  if (event.target.id === 'music-library-folder') {
    musicLibraryWorkspaceState.folder = event.target.value || 'all';
    musicLibraryWorkspaceState.visible = MUSIC_LIBRARY_BATCH_SIZE;
    renderMusicLibraryWorkspace('folder');
    return;
  }
  if (!event.target.matches('[data-library-select]')) return;
  var id = event.target.getAttribute('data-library-select');
  if (event.target.checked) musicLibraryWorkspaceState.selected[id] = true;
  else delete musicLibraryWorkspaceState.selected[id];
  renderMusicLibraryWorkspace('selection');
}

function handleMusicLibraryScroll(event) {
  var target = event.target;
  if (!target || !target.classList || !target.classList.contains('music-library-content')) return;
  if (target.scrollTop + target.clientHeight < target.scrollHeight - 240) return;
  if (musicLibraryWorkspaceState.tab === 'local' && musicLibraryWorkspaceState.visible < musicLibraryFilteredTracks().length) {
    musicLibraryWorkspaceState.visible += MUSIC_LIBRARY_BATCH_SIZE;
    renderMusicLibraryWorkspace('scroll-more-local');
  } else if (musicLibraryWorkspaceState.tab === 'playlists') {
    var playlist = musicLibrarySelectedPlaylist();
    if (playlist && musicLibraryWorkspaceState.playlistVisible < playlist.songs.length) {
      musicLibraryWorkspaceState.playlistVisible += MUSIC_LIBRARY_BATCH_SIZE;
      renderMusicLibraryWorkspace('scroll-more-playlist');
    }
  } else if (musicLibraryWorkspaceState.tab === 'history' && musicLibraryWorkspaceState.historyVisible < musicLibraryHistoryEntries().length) {
    musicLibraryWorkspaceState.historyVisible += MUSIC_LIBRARY_BATCH_SIZE;
    renderMusicLibraryWorkspace('scroll-more-history');
  }
}

document.addEventListener('keydown', function (event) {
  if (event.key === 'Escape' && musicLibraryWorkspaceState.open && !document.getElementById('local-playlist-link-import-mask')) {
    event.preventDefault();
    closeMusicLibraryWorkspace();
  }
});
