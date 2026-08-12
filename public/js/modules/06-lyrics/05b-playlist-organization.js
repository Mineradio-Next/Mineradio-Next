/* Playlist organization, platform refresh, and non-destructive library health. */
var musicLibraryOrganizerState = {
  syncId: '',
  coverId: '',
  mutationId: '',
  orderWrite: Promise.resolve(true),
  drag: null,
  health: null,
  healthLoading: false,
  healthCleaning: false,
  healthRequest: 0
};

function musicLibraryPlaylistSourceLabel(playlist) {
  var provider = String(playlist && playlist.importedProvider || '').toLowerCase();
  return ({ netease: '网易云导入', qq: 'QQ 音乐导入', kugou: '酷狗导入' })[provider] || 'Mineradio 本地歌单';
}

function musicLibraryPlaylistTimeLabel(value) {
  var time = Number(value) || 0;
  if (!time) return '尚未记录';
  try {
    return new Date(time).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  } catch (_) { return '已更新'; }
}

function beginMusicLibraryPlaylistMutation(playlist) {
  var id = String(playlist && playlist.id || '');
  if (!id || musicLibraryOrganizerState.mutationId) return '';
  var owner = typeof beginLocalPlaylistMutation === 'function' ? beginLocalPlaylistMutation('organizer:' + id) : id;
  if (!owner) return '';
  musicLibraryOrganizerState.mutationId = id;
  return owner;
}

function endMusicLibraryPlaylistMutation(id) {
  if (typeof endLocalPlaylistMutation === 'function') endLocalPlaylistMutation(id);
  musicLibraryOrganizerState.mutationId = '';
}

function musicLibraryPlaylistOrganizerHeadHtml(playlist, songs, deleteArmed) {
  var cover = String(playlist.customCover || playlist.cover || '');
  var syncing = musicLibraryOrganizerState.syncId === String(playlist.id || '');
  var busy = !!musicLibraryOrganizerState.mutationId;
  var canSync = typeof localPlaylistCanSync === 'function' && localPlaylistCanSync(playlist);
  return '<div class="music-library-playlist-detail-head organizer">' +
    '<div class="music-library-playlist-profile">' +
      '<button class="music-library-playlist-hero-cover" type="button" data-library-organizer="cover" title="更换歌单封面" aria-label="更换歌单封面"' + (busy ? ' disabled' : '') + '>' +
        (cover ? '<img src="' + escHtml(cover) + '" alt="" onerror="this.remove()">' : '<span aria-hidden="true">♪</span>') +
        '<i>更换</i>' +
      '</button>' +
      '<div class="music-library-playlist-profile-copy">' +
        '<div class="music-library-playlist-title-edit"><input id="music-library-playlist-name" type="text" maxlength="120" value="' + escHtml(playlist.name || '') + '"' + (busy ? ' disabled' : '') + '><button type="button" data-library-action="rename-playlist"' + (busy ? ' disabled' : '') + '>保存名称</button></div>' +
        '<div class="music-library-playlist-facts"><span>' + songs.length + ' 首</span><span>' + escHtml(musicLibraryPlaylistSourceLabel(playlist)) + '</span><span>更新于 ' + escHtml(musicLibraryPlaylistTimeLabel(playlist.syncedAt || playlist.updatedAt || playlist.importedAt)) + '</span></div>' +
      '</div>' +
    '</div>' +
    '<div class="music-library-detail-actions">' +
      '<button type="button" class="primary" data-library-action="play-playlist"' + (songs.length ? '' : ' disabled') + '>播放</button>' +
      '<button type="button" data-library-action="queue-playlist"' + (songs.length ? '' : ' disabled') + '>加入队列</button>' +
      (canSync ? '<button type="button" data-library-organizer="sync"' + (busy ? ' disabled' : '') + '>' + (syncing ? '同步中…' : '刷新同步') + '</button>' : '') +
      '<button type="button" data-library-action="export-playlist">导出</button>' +
      (playlist.customCover ? '<button type="button" data-library-organizer="cover-clear"' + (busy ? ' disabled' : '') + '>恢复封面</button>' : '') +
      '<button type="button" class="danger' + (deleteArmed ? ' armed' : '') + '" data-library-action="delete-playlist"' + (busy ? ' disabled' : '') + '>' + (deleteArmed ? '再次点击确认' : '删除歌单') + '</button>' +
    '</div>' +
    '<p>拖动曲目前的手柄调整顺序；清理歌单不会删除音乐文件。</p>' +
  '</div>';
}

function musicLibraryPlaylistOrganizerRowHtml(playlist, song, index, armed) {
  var busy = !!musicLibraryOrganizerState.mutationId;
  return '<div class="music-library-playlist-track organizer" data-library-order-index="' + index + '" style="--row-index:' + index + '">' +
    '<button class="music-library-order-handle" type="button" data-library-drag-handle="' + index + '" title="拖动调整顺序" aria-label="拖动调整顺序"' + (busy ? ' disabled' : '') + '>⋮⋮</button>' +
    '<span class="music-library-track-number">' + String(index + 1).padStart(2, '0') + '</span>' +
    '<button type="button" class="music-library-track-copy" data-library-playlist-song="' + index + '"><strong>' + escHtml(song.name || song.title || '未知歌曲') + '</strong><small>' + escHtml(song.artist || song.singer || '未知歌手') + '</small></button>' +
    '<span class="music-library-order-actions"><button type="button" data-library-organizer="move-up" data-library-order-index="' + index + '" title="上移" aria-label="上移"' + (busy || index === 0 ? ' disabled' : '') + '>↑</button><button type="button" data-library-organizer="move-down" data-library-order-index="' + index + '" title="下移" aria-label="下移"' + (busy || index >= playlist.songs.length - 1 ? ' disabled' : '') + '>↓</button></span>' +
    '<span class="music-library-row-actions"><button type="button" data-library-playlist-next="' + index + '" title="下一首播放" aria-label="下一首播放">↳</button><button type="button" class="danger' + (armed ? ' armed' : '') + '" data-library-playlist-remove="' + index + '" title="' + (armed ? '再次点击确认' : '从歌单移除') + '" aria-label="从歌单移除"' + (busy ? ' disabled' : '') + '>×</button></span>' +
  '</div>';
}

function persistMusicLibraryPlaylistOrder(playlist, previousSongs, message) {
  if (!playlist) return Promise.resolve(false);
  playlist.trackCount = playlist.songs.length;
  playlist.updatedAt = Date.now();
  var mutationId = localPlaylistMutationOwner || String(playlist.id || '');
  musicLibraryOrganizerState.orderWrite = musicLibraryOrganizerState.orderWrite.catch(function () { return false; }).then(async function () {
    var saved = await saveLocalFilePlaylistsAndWait();
    if (!saved) {
      playlist.songs = previousSongs;
      playlist.trackCount = previousSongs.length;
      refreshMusicLibraryWorkspace('playlist-order-rollback');
      showToast('顺序保存失败，已恢复原排列');
      return false;
    }
    rebuildUserPlaylistsFromCatalog({ animate: false, preserveScroll: true, reason: 'playlist-order' });
    if (message) showToast(message);
    return true;
  }).finally(function () {
    endMusicLibraryPlaylistMutation(mutationId);
    refreshMusicLibraryWorkspace('playlist-order-finished');
  });
  return musicLibraryOrganizerState.orderWrite;
}

function moveMusicLibraryPlaylistSong(index, direction) {
  var playlist = musicLibrarySelectedPlaylist();
  index = Number(index);
  direction = Number(direction) < 0 ? -1 : 1;
  var target = index + direction;
  if (!playlist || !Number.isInteger(index) || target < 0 || target >= playlist.songs.length) return false;
  if (!beginMusicLibraryPlaylistMutation(playlist)) return false;
  var previous = playlist.songs.slice();
  var moved = playlist.songs.splice(index, 1)[0];
  playlist.songs.splice(target, 0, moved);
  refreshMusicLibraryWorkspace('playlist-order-button');
  persistMusicLibraryPlaylistOrder(playlist, previous, '歌曲已移动到第 ' + (target + 1) + ' 首');
  return true;
}

function bindMusicLibraryPlaylistOrganizer(content, playlist, visibleCount) {
  var list = content && content.querySelector('.music-library-playlist-tracks');
  if (!list || !playlist || !visibleCount) return;
  list.addEventListener('pointerdown', function (event) {
    if (event.button != null && event.button !== 0) return;
    var handle = event.target.closest('[data-library-drag-handle]');
    var row = handle && handle.closest('[data-library-order-index]');
    if (!handle || !row) return;
    var mutationId = beginMusicLibraryPlaylistMutation(playlist);
    if (!mutationId) return;
    musicLibraryOrganizerState.drag = {
      list: list, row: row, playlist: playlist, visibleCount: visibleCount,
      pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, active: false,
      mutationId: mutationId
    };
    try { handle.setPointerCapture(event.pointerId); } catch (_) {}
    event.preventDefault();
  });
  list.addEventListener('pointermove', function (event) {
    var drag = musicLibraryOrganizerState.drag;
    if (!drag || drag.list !== list) return;
    if (!drag.active && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 6) return;
    drag.active = true;
    drag.row.classList.add('dragging');
    var hit = document.elementFromPoint(event.clientX, event.clientY);
    var target = hit && hit.closest('[data-library-order-index]');
    if (!target || target === drag.row || target.parentElement !== list) return;
    var rect = target.getBoundingClientRect();
    list.insertBefore(drag.row, event.clientY > rect.top + rect.height / 2 ? target.nextSibling : target);
    event.preventDefault();
  });
  function finish(event) {
    var drag = musicLibraryOrganizerState.drag;
    if (!drag || drag.list !== list) return;
    musicLibraryOrganizerState.drag = null;
    drag.row.classList.remove('dragging');
    if (!drag.active) {
      endMusicLibraryPlaylistMutation(drag.mutationId);
      return;
    }
    var previous = drag.playlist.songs.slice();
    var orderedIndexes = Array.from(list.querySelectorAll('.music-library-playlist-track[data-library-order-index]')).map(function (row) {
      return Number(row.getAttribute('data-library-order-index'));
    }).filter(Number.isInteger);
    var prefix = orderedIndexes.map(function (index) { return previous[index]; }).filter(Boolean);
    drag.playlist.songs = prefix.concat(previous.slice(drag.visibleCount));
    refreshMusicLibraryWorkspace('playlist-order-drag');
    persistMusicLibraryPlaylistOrder(drag.playlist, previous, '拖拽顺序已保存');
    if (event) event.preventDefault();
  }
  list.addEventListener('pointerup', finish);
  list.addEventListener('pointercancel', finish);
}

function commitMusicLibraryPlaylistCover(dataUrl, playlistId) {
  var playlist = localPlaylistById(playlistId);
  if (!playlist || !/^data:image\/(?:webp|png|jpe?g);base64,/i.test(String(dataUrl || ''))) return;
  if (String(dataUrl).length > 512000) { showToast('封面图片过大，请换一张尺寸更小的图片'); return; }
  var mutationId = beginMusicLibraryPlaylistMutation(playlist);
  if (!mutationId) { showToast('歌单正在保存，请稍后再试'); return; }
  var previous = playlist.customCover || '';
  playlist.customCover = String(dataUrl);
  playlist.updatedAt = Date.now();
  musicLibraryOrganizerState.coverId = String(playlist.id || '');
  refreshMusicLibraryWorkspace('playlist-cover-preview');
  saveLocalFilePlaylistsAndWait().then(function (saved) {
    musicLibraryOrganizerState.coverId = '';
    if (!saved) {
      playlist.customCover = previous;
      showToast('封面保存失败，已恢复原封面');
    } else {
      rebuildUserPlaylistsFromCatalog({ animate: false, preserveScroll: true, reason: 'playlist-cover' });
      showToast('歌单封面已保存');
    }
  }).finally(function () {
    musicLibraryOrganizerState.coverId = '';
    endMusicLibraryPlaylistMutation(mutationId);
    refreshMusicLibraryWorkspace('playlist-cover-complete');
  });
}

function chooseMusicLibraryPlaylistCover() {
  var playlist = musicLibrarySelectedPlaylist();
  if (!playlist || musicLibraryOrganizerState.mutationId) return;
  var playlistId = String(playlist.id || '');
  var input = document.createElement('input');
  input.type = 'file';
  input.hidden = true;
  input.accept = '.jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp';
  input.addEventListener('change', function () {
    var file = input.files && input.files[0];
    if (file) loadCoverFromFile(file, { commit: function (dataUrl) { commitMusicLibraryPlaylistCover(dataUrl, playlistId); } });
    input.remove();
  }, { once: true });
  window.addEventListener('focus', function () {
    setTimeout(function () { if (input.isConnected && !(input.files && input.files.length)) input.remove(); }, 250);
  }, { once: true });
  document.body.appendChild(input);
  input.click();
}

function clearMusicLibraryPlaylistCover() {
  var playlist = musicLibrarySelectedPlaylist();
  if (!playlist || !playlist.customCover) return;
  var mutationId = beginMusicLibraryPlaylistMutation(playlist);
  if (!mutationId) return;
  var previous = playlist.customCover;
  playlist.customCover = '';
  playlist.updatedAt = Date.now();
  refreshMusicLibraryWorkspace('playlist-cover-clear-preview');
  saveLocalFilePlaylistsAndWait().then(function (saved) {
    if (!saved) playlist.customCover = previous;
    else rebuildUserPlaylistsFromCatalog({ animate: false, preserveScroll: true, reason: 'playlist-cover-clear' });
    showToast(saved ? '已恢复歌单原封面' : '封面恢复失败，原设置已保留');
  }).finally(function () {
    endMusicLibraryPlaylistMutation(mutationId);
    refreshMusicLibraryWorkspace('playlist-cover-clear');
  });
}

async function syncMusicLibraryPlaylist() {
  var playlist = musicLibrarySelectedPlaylist();
  if (!playlist || !localPlaylistCanSync(playlist) || musicLibraryOrganizerState.syncId) return;
  var selectedId = String(playlist.id || '');
  var mutationId = beginMusicLibraryPlaylistMutation(playlist);
  if (!mutationId) return;
  musicLibraryOrganizerState.syncId = selectedId;
  refreshMusicLibraryWorkspace('playlist-sync-start');
  try {
    var synced = await syncLocalFilePlaylist(selectedId);
    musicLibraryWorkspaceState.playlistId = String(synced.id || selectedId);
    showToast('歌单已同步：' + synced.songs.length + ' 首');
  } catch (error) {
    console.warn('[PlaylistSync]', error);
    showToast('歌单同步失败，原有内容已保留');
  } finally {
    musicLibraryOrganizerState.syncId = '';
    endMusicLibraryPlaylistMutation(mutationId);
    refreshMusicLibraryWorkspace('playlist-sync-complete');
  }
}

function musicLibraryHealthTrackKey(song) {
  var title = String(song && (song.name || song.title) || '').toLowerCase().replace(/\.[a-z0-9]+$/i, '').replace(/[^\p{L}\p{N}]+/gu, '');
  var artist = String(song && (song.artist || song.singer) || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
  var duration = Math.max(0, Math.round(Number(song && song.duration) || 0));
  return title ? [title, artist, duration].join('|') : '';
}

function musicLibraryDuplicateGroups(tracks) {
  var map = Object.create(null), groups = [];
  (tracks || []).forEach(function (song) {
    var key = musicLibraryHealthTrackKey(song);
    if (!key) return;
    if (!map[key]) map[key] = [];
    map[key].push(song);
  });
  Object.keys(map).forEach(function (key) { if (map[key].length > 1) groups.push(map[key]); });
  groups.sort(function (a, b) { return b.length - a.length || String(a[0].name || '').localeCompare(String(b[0].name || ''), 'zh-CN'); });
  return groups;
}

function musicLibraryHealthSnapshot(listed, audit) {
  if (!listed || listed.ok !== true || !Array.isArray(listed.tracks)) throw new Error(listed && listed.error || 'LOCAL_LIBRARY_READ_FAILED');
  if (!audit || audit.ok !== true || !Array.isArray(audit.missing)) throw new Error(audit && audit.error || 'LOCAL_LIBRARY_AUDIT_FAILED');
  return {
    tracks: listed.tracks,
    checkedAt: Number(audit.checkedAt) || Date.now(),
    missing: audit.missing
  };
}

function musicLibraryHealthTargetKey(items, kind, index) {
  var item = items && items[index];
  var songs = kind === 'duplicate' ? item : [item];
  return (songs || []).map(function (song) {
    return String(song && (song.localFileId || song.id) || '').replace(/^local:/, '').toLowerCase();
  }).filter(Boolean).sort().join('|');
}

function loadMusicLibraryHealth(force) {
  if (musicLibraryOrganizerState.healthLoading) return;
  if (!force && musicLibraryOrganizerState.health && Date.now() - musicLibraryOrganizerState.health.checkedAt < 30000) {
    renderMusicLibraryHealth();
    return;
  }
  var bridge = window.desktopWindow;
  var request = ++musicLibraryOrganizerState.healthRequest;
  musicLibraryOrganizerState.healthLoading = true;
  renderMusicLibraryHealth();
  var listPromise = bridge && typeof bridge.listLocalMusicLibrary === 'function' ? bridge.listLocalMusicLibrary() : Promise.resolve({ ok: true, tracks: persistentLocalLibraryTracks || [] });
  var auditPromise = bridge && typeof bridge.auditLocalMusicLibrary === 'function' ? bridge.auditLocalMusicLibrary() : Promise.resolve({ ok: true, missing: [] });
  Promise.all([listPromise, auditPromise]).then(function (results) {
    if (request !== musicLibraryOrganizerState.healthRequest) return;
    var listed = results[0] || {}, audit = results[1] || {};
    var snapshot = musicLibraryHealthSnapshot(listed, audit);
    persistentLocalLibraryTracks = snapshot.tracks.map(function (song) { return hydrateCustomCover(Object.assign({}, song)); });
    musicLibraryOrganizerState.health = {
      checkedAt: snapshot.checkedAt,
      duplicates: musicLibraryDuplicateGroups(persistentLocalLibraryTracks || []),
      missing: snapshot.missing
    };
  }).catch(function (error) {
    console.warn('[LibraryHealth]', error);
    musicLibraryOrganizerState.health = { checkedAt: Date.now(), duplicates: [], missing: [], error: true, errorMessage: String(error && error.message || 'LOCAL_LIBRARY_AUDIT_FAILED') };
  }).finally(function () {
    if (request !== musicLibraryOrganizerState.healthRequest) return;
    musicLibraryOrganizerState.healthLoading = false;
    renderMusicLibraryHealth();
  });
}

function musicLibraryHealthIssueRows(items, kind) {
  if (!items.length) return '<div class="music-library-health-clear"><strong>没有发现问题</strong><span>当前索引状态正常</span></div>';
  return items.map(function (item, index) {
    var songs = kind === 'duplicate' ? item : [item];
    var first = songs[0] || {};
    var paths = songs.map(function (song) { return song.localPath || song.name || '本地音乐'; }).join(' · ');
    var targetKey = musicLibraryHealthTargetKey(items, kind, index);
    var armedKey = (kind === 'duplicate' ? 'health-duplicate:' : 'health-missing:') + targetKey;
    var armed = musicLibraryActionArmed(armedKey);
    return '<div class="music-library-health-row">' +
      '<span class="music-library-health-mark" aria-hidden="true"></span>' +
      '<div><strong>' + escHtml(first.name || '未知歌曲') + '</strong><small>' + escHtml(kind === 'duplicate' ? ((first.artist || '未知歌手') + ' · ' + songs.length + ' 个索引') : (first.localPath || '文件已失效')) + '</small><p>' + escHtml(paths) + '</p></div>' +
      '<button type="button" class="' + (armed ? 'armed' : '') + '" data-library-organizer="' + (kind === 'duplicate' ? 'health-clean-duplicate' : 'health-clean-missing') + '" data-health-index="' + index + '"' + (musicLibraryOrganizerState.healthLoading || musicLibraryOrganizerState.healthCleaning ? ' disabled' : '') + '>' + (armed ? '再次点击确认' : (kind === 'duplicate' ? '保留第一首' : '移除失效索引')) + '</button>' +
    '</div>';
  }).join('');
}

function renderMusicLibraryHealth() {
  if (musicLibraryWorkspaceState.tab !== 'health') return;
  var content = document.getElementById('music-library-content');
  if (!content) return;
  var health = musicLibraryOrganizerState.health;
  if (!health || health.error) {
    var failed = health && health.error;
    content.innerHTML = '<div class="music-library-health"><section class="music-library-health-summary"><div><span class="music-library-kicker">曲库检查</span><h3>' + (failed ? '检查未完成' : '正在检查曲库') + '</h3><p>' + (failed ? '未能读取完整的曲库状态，当前不会显示“正常”结论，也不会执行清理。' : '正在核对本地索引和源文件状态，请稍候。') + '</p></div><button type="button" data-library-organizer="health-refresh"' + (musicLibraryOrganizerState.healthLoading ? ' disabled' : '') + '>' + (musicLibraryOrganizerState.healthLoading ? '检查中…' : '重新检查') + '</button></section></div>';
    return;
  }
  var duplicateExtra = health.duplicates.reduce(function (sum, group) { return sum + Math.max(0, group.length - 1); }, 0);
  content.innerHTML = '<div class="music-library-health">' +
    '<section class="music-library-health-summary"><div><span class="music-library-kicker">曲库检查</span><h3>曲库状态</h3><p>检查只读取文件状态；清理操作只移除 Mineradio 索引，不会删除磁盘文件。</p></div>' +
      '<div class="music-library-health-metrics"><span><strong>' + (persistentLocalLibraryTracks || []).length + '</strong><small>索引歌曲</small></span><span><strong>' + duplicateExtra + '</strong><small>可能重复</small></span><span><strong>' + health.missing.length + '</strong><small>失效索引</small></span></div>' +
      '<button type="button" data-library-organizer="health-refresh"' + (musicLibraryOrganizerState.healthLoading ? ' disabled' : '') + '>' + (musicLibraryOrganizerState.healthLoading ? '检查中…' : '重新检查') + '</button>' +
    '</section>' +
    '<section class="music-library-health-section"><header><div><h4>可能重复</h4><p>按歌名、歌手和时长分组，保留第一条后只移除其余索引。</p></div><span>' + health.duplicates.length + ' 组</span></header>' + musicLibraryHealthIssueRows(health.duplicates, 'duplicate') + '</section>' +
    '<section class="music-library-health-section"><header><div><h4>失效文件</h4><p>原文件已移动或不存在，播放器无法再读取这些索引。</p></div><span>' + health.missing.length + ' 项</span></header>' + musicLibraryHealthIssueRows(health.missing, 'missing') + '</section>' +
  '</div>';
}

function remapMusicLibraryPlaylistTrackReferences(ids, replacement) {
  var removed = Object.create(null), changed = 0;
  (ids || []).forEach(function (id) { removed[String(id || '').replace(/^local:/, '').toLowerCase()] = true; });
  (localFilePlaylists || []).forEach(function (playlist) {
    var touched = false;
    playlist.songs = (playlist.songs || []).map(function (song) {
      var id = String(song && (song.localFileId || song.id) || '').replace(/^local:/, '').toLowerCase();
      if (!removed[id]) return song;
      touched = true;
      changed += 1;
      var next = Object.assign({}, replacement);
      if (song.userAdded === true) next.userAdded = true;
      return next;
    });
    if (touched) {
      playlist.trackCount = playlist.songs.length;
      playlist.updatedAt = Date.now();
    }
  });
  return changed;
}

async function removeMusicLibraryHealthIds(ids, message, replacement) {
  var bridge = window.desktopWindow;
  if (!bridge || typeof bridge.removeLocalMusicTracks !== 'function' || !ids.length || musicLibraryOrganizerState.healthCleaning) return;
  var previousPlaylists = null;
  var mutationOwner = typeof beginLocalPlaylistMutation === 'function' ? beginLocalPlaylistMutation('library-health') : 'library-health';
  if (!mutationOwner) { showToast('歌单正在保存，请稍后再试'); return; }
  musicLibraryOrganizerState.healthCleaning = true;
  renderMusicLibraryHealth();
  try {
    if (replacement) {
      previousPlaylists = JSON.parse(JSON.stringify(localFilePlaylists || []));
      if (remapMusicLibraryPlaylistTrackReferences(ids, replacement)) {
        var playlistsSaved = await saveLocalFilePlaylistsAndWait();
        if (!playlistsSaved) throw new Error('LOCAL_PLAYLIST_REFERENCE_SAVE_FAILED');
      } else {
        previousPlaylists = null;
      }
    }
    var result = await bridge.removeLocalMusicTracks(ids);
    if (!result || result.ok !== true || !Array.isArray(result.tracks)) throw new Error(result && result.error || 'LOCAL_LIBRARY_REMOVE_FAILED');
    persistentLocalLibraryTracks = result.tracks.map(function (song) { return hydrateCustomCover(Object.assign({}, song)); });
    if (previousPlaylists) rebuildUserPlaylistsFromCatalog({ animate: false, preserveScroll: true, reason: 'library-health-remap' });
    showToast(message + '，磁盘文件未删除');
    musicLibraryOrganizerState.health = null;
    musicLibraryOrganizerState.healthCleaning = false;
    endLocalPlaylistMutation(mutationOwner);
    loadMusicLibraryHealth(true);
  } catch (error) {
    if (previousPlaylists) {
      localFilePlaylists.splice.apply(localFilePlaylists, [0, localFilePlaylists.length].concat(previousPlaylists));
      await saveLocalFilePlaylistsAndWait();
      rebuildUserPlaylistsFromCatalog({ animate: false, preserveScroll: true, reason: 'library-health-remap-rollback' });
    }
    musicLibraryOrganizerState.healthCleaning = false;
    endLocalPlaylistMutation(mutationOwner);
    renderMusicLibraryHealth();
    console.warn('[LibraryHealthCleanup]', error);
    showToast('曲库清理失败，原有索引已保留');
  }
}

function handleMusicLibraryOrganizerClick(event) {
  var button = event.target.closest('[data-library-organizer]');
  if (!button) return false;
  var action = button.getAttribute('data-library-organizer');
  if (action === 'move-up' || action === 'move-down') moveMusicLibraryPlaylistSong(button.getAttribute('data-library-order-index'), action === 'move-up' ? -1 : 1);
  else if (action === 'cover') chooseMusicLibraryPlaylistCover();
  else if (action === 'cover-clear') clearMusicLibraryPlaylistCover();
  else if (action === 'sync') syncMusicLibraryPlaylist();
  else if (action === 'health-refresh') loadMusicLibraryHealth(true);
  else if (action === 'health-clean-duplicate') {
    if (musicLibraryOrganizerState.healthLoading || musicLibraryOrganizerState.healthCleaning) return true;
    var index = Number(button.getAttribute('data-health-index'));
    var group = musicLibraryOrganizerState.health && musicLibraryOrganizerState.health.duplicates[index] || [];
    var groupKey = musicLibraryHealthTargetKey(musicLibraryOrganizerState.health && musicLibraryOrganizerState.health.duplicates, 'duplicate', index);
    if (!groupKey || !armMusicLibraryAction('health-duplicate:' + groupKey)) { renderMusicLibraryHealth(); return true; }
    removeMusicLibraryHealthIds(group.slice(1).map(musicLibraryTrackId), '已移除 ' + Math.max(0, group.length - 1) + ' 条重复索引', group[0]);
  } else if (action === 'health-clean-missing') {
    if (musicLibraryOrganizerState.healthLoading || musicLibraryOrganizerState.healthCleaning) return true;
    var missing = musicLibraryOrganizerState.health && musicLibraryOrganizerState.health.missing || [];
    var missingIndex = Number(button.getAttribute('data-health-index'));
    var missingItem = missing[missingIndex];
    if (!missingItem) return true;
    var missingKey = musicLibraryHealthTargetKey(missing, 'missing', missingIndex);
    if (!missingKey || !armMusicLibraryAction('health-missing:' + missingKey)) { renderMusicLibraryHealth(); return true; }
    removeMusicLibraryHealthIds([missingItem.localFileId || missingItem.id].filter(Boolean), '已移除 1 条失效索引');
  }
  event.preventDefault();
  event.stopPropagation();
  return true;
}
