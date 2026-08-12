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
        '<div class="music-library-heading"><span class="music-library-kicker">YOUR MUSIC</span><h2 id="music-library-title">音乐库</h2><p id="music-library-summary">整理本地音乐与歌单</p></div>' +
        '<button class="music-library-close" type="button" data-library-close title="关闭音乐库" aria-label="关闭音乐库">×</button>' +
      '</header>' +
      '<nav class="music-library-tabs" role="tablist" aria-label="音乐库视图">' +
        '<button type="button" data-library-tab="local" role="tab">本地音乐</button>' +
        '<button type="button" data-library-tab="playlists" role="tab">我的歌单</button>' +
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
    '<div class="music-library-import-intro"><span class="music-library-kicker">BRING YOUR MUSIC</span><h3>把音乐带进来，也能随时带走</h3><p>导入只建立索引，不移动或修改原文件。歌单默认使用 Mineradio 自己的格式导出，同时兼容读取旧格式。</p></div>' +
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
    : (tab === 'playlists' ? (localFilePlaylists.length + ' 个本地歌单') : (tab === 'health' ? '检查重复音乐与失效索引' : '导入音乐、歌单文件或平台分享链接'));
  if (tab === 'local') renderMusicLibraryLocal();
  else if (tab === 'playlists') renderMusicLibraryPlaylists();
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
  musicLibraryWorkspaceState.tab = /^(local|playlists|health|import)$/.test(String(tab || '')) ? String(tab) : musicLibraryWorkspaceState.tab;
  musicLibraryWorkspaceState.visible = MUSIC_LIBRARY_BATCH_SIZE;
  musicLibraryWorkspaceState.playlistVisible = MUSIC_LIBRARY_BATCH_SIZE;
  mask.classList.add('show');
  mask.setAttribute('aria-hidden', 'false');
  document.body.classList.add('music-library-open');
  if (typeof closeUploadPanel === 'function') closeUploadPanel({ force: true });
  renderMusicLibraryWorkspace('open');
  Promise.resolve(localPlaylistCatalogReady).then(function () { refreshMusicLibraryWorkspace('catalog-ready'); });
  loadMusicLibraryTracks();
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
    musicLibraryWorkspaceState.visible = MUSIC_LIBRARY_BATCH_SIZE;
    musicLibraryWorkspaceState.playlistVisible = MUSIC_LIBRARY_BATCH_SIZE;
    renderMusicLibraryWorkspace('tab');
    if (musicLibraryWorkspaceState.tab === 'health' && typeof loadMusicLibraryHealth === 'function') loadMusicLibraryHealth(false);
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
  }
}

document.addEventListener('keydown', function (event) {
  if (event.key === 'Escape' && musicLibraryWorkspaceState.open && !document.getElementById('local-playlist-link-import-mask')) {
    event.preventDefault();
    closeMusicLibraryWorkspace();
  }
});
