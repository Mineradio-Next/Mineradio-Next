/* Mineradio local playlists with read-only compatibility for legacy gzip exports. */
var LOCAL_PLAYLIST_FILES_KEY = 'mineradio-local-playlist-files-v1';
var localFilePlaylists = readLocalFilePlaylists();
var localPlaylistCatalogWritePromise = Promise.resolve();
var localPlaylistCatalogReady = Promise.resolve(false);

function localPlaylistSource(value) {
  var key = String(value || '').toLowerCase();
  return ({
    tx: 'qq', qq: 'qq', wy: 'netease', netease: 'netease', kg: 'kugou', kugou: 'kugou',
    kw: 'backup-source', kuwo: 'backup-source', mg: 'backup-source', migu: 'backup-source',
    local: 'local', qishui: 'qishui', spotify: 'spotify',
    'backup-source': 'backup-source'
  })[key] || '';
}

function localPlaylistSongKey(song) {
  song = song || {};
  return [song.additionalSourceCode || song.source || '', song.id || song.songmid || '', song.name || '', song.singer || ''].join('|').toLowerCase();
}

function normalizeLocalPlaylistSong(song) {
  song = song && typeof song === 'object' ? song : {};
  var source = localPlaylistSource(song.source || song.provider || song.type);
  if (!source) return null;
  var meta = song.meta && typeof song.meta === 'object' ? song.meta : {};
  var id = String(song.id || song.songmid || song.mid || meta.songId || '').trim();
  var name = String(song.name || song.title || '').trim();
  if (!name || !id) return null;
  var singer = String(song.singer || song.artist || song.author || '未知歌手').trim();
  var cover = String(song.picUrl || song.img || song.cover || meta.picUrl || '').trim();
  var normalized = {
    id: id,
    songmid: String(song.songmid || song.mid || id),
    name: name,
    singer: singer,
    artist: singer,
    albumName: String(song.albumName || song.album || meta.albumName || '').trim(),
    albumId: String(song.albumId || meta.albumId || '').trim(),
    interval: String(song.interval || song.duration || '').trim(),
    source: source,
    provider: source,
    picUrl: cover,
    types: Array.isArray(song.types) ? song.types.slice(0, 12) : (Array.isArray(meta.qualitys) ? meta.qualitys.slice(0, 12) : []),
    importedFrom: String(song.source || song.provider || '').trim(),
    importedMeta: meta
  };
  if (source === 'local') {
    normalized.type = 'local';
    normalized.localFileId = String(song.localFileId || id).replace(/^local:/, '');
    normalized.localKey = String(song.localKey || normalized.localFileId);
    normalized.localUrl = String(song.localUrl || '').trim();
    normalized.localPath = String(song.localPath || '').trim();
    normalized.cover = cover;
    normalized.hasLyric = song.hasLyric === true;
    normalized.lyricSource = String(song.lyricSource || '').trim();
    normalized.localMissing = song.localMissing === true || !normalized.localUrl;
  }
  if (source === 'backup-source') {
    var additionalSourceCode = String(song.additionalSourceCode || song.source || song.provider || '').toLowerCase();
    if (additionalSourceCode === 'kuwo') additionalSourceCode = 'kw';
    if (additionalSourceCode === 'migu') additionalSourceCode = 'mg';
    if (!/^(kw|mg)$/.test(additionalSourceCode)) return null;
    normalized.additionalSourceCode = additionalSourceCode;
    normalized.type = 'backup-source';
  }
  ['hash', 'FileHash', 'fileHash', 'strMediaMid', 'albumMid', 'copyrightId', 'lrcUrl', 'trcUrl', 'mrcUrl'].forEach(function (key) {
    if (song[key] != null && song[key] !== '') normalized[key] = song[key];
    else if (meta[key] != null && meta[key] !== '') normalized[key] = meta[key];
  });
  return normalized;
}

function normalizeLocalPlaylistPayload(payload) {
  payload = payload && typeof payload === 'object' ? payload : {};
  var data = payload.data && typeof payload.data === 'object' ? payload.data : payload;
  var rows = Array.isArray(data.list) ? data.list : (Array.isArray(data.songs) ? data.songs : []);
  var songs = [], seen = Object.create(null);
  rows.forEach(function (row) {
    var song = normalizeLocalPlaylistSong(row);
    if (!song) return;
    var key = localPlaylistSongKey(song);
    if (seen[key]) return;
    seen[key] = true;
    songs.push(song);
  });
  if (!songs.length) throw new Error('歌单文件中没有可用歌曲');
  var id = String(data.id || data.sourceListId || ('file-' + Date.now())).trim();
  return {
    id: id,
    provider: 'local',
    source: 'local',
    name: String(data.name || data.title || '导入歌单').trim() || '导入歌单',
    creator: '本地文件',
    cover: String(data.cover || data.coverImgUrl || '').trim() || String(songs[0].picUrl || ''),
    songs: songs,
    trackCount: songs.length,
    importedAt: Date.now()
  };
}

function readLocalFilePlaylists() {
  try {
    var value = JSON.parse(localStorage.getItem(LOCAL_PLAYLIST_FILES_KEY) || '[]');
    return Array.isArray(value) ? value.filter(function (item) { return item && Array.isArray(item.songs); }) : [];
  } catch (_) { return []; }
}

function saveLocalFilePlaylists() {
  var snapshot = JSON.parse(JSON.stringify(localFilePlaylists || []));
  var localSaved = false;
  try {
    localStorage.setItem(LOCAL_PLAYLIST_FILES_KEY, JSON.stringify(snapshot));
    localSaved = true;
  } catch (_) {
    try { localStorage.removeItem(LOCAL_PLAYLIST_FILES_KEY); } catch (_) { }
  }
  var bridge = typeof window !== 'undefined' && window.desktopWindow;
  if (bridge && typeof bridge.saveLocalPlaylists === 'function') {
    localPlaylistCatalogWritePromise = localPlaylistCatalogWritePromise.catch(function () { return null; }).then(function () {
      return bridge.saveLocalPlaylists(snapshot);
    }).then(function (result) {
      if (!result || result.ok !== true) throw new Error(result && result.error || 'LOCAL_PLAYLIST_CATALOG_SAVE_FAILED');
      return true;
    }).catch(function (error) {
      console.warn('[LocalPlaylistCatalog]', error);
      showToast('歌单保存失败，已保留上一次有效版本');
      return false;
    });
    return true;
  }
  if (!localSaved) showToast('歌单保存失败，可能超出本地存储空间');
  return localSaved;
}

function mergeLocalPlaylistCatalogs(primary, fallback) {
  var merged = [], positions = Object.create(null);
  (Array.isArray(primary) ? primary : []).concat(Array.isArray(fallback) ? fallback : []).forEach(function (item) {
    if (!item || !Array.isArray(item.songs)) return;
    var key = String(item.id || '') + '|' + String(item.name || '');
    if (!key || positions[key] != null) return;
    positions[key] = merged.length;
    merged.push(item);
  });
  return merged;
}

function hydrateLocalPlaylistCatalog() {
  var bridge = typeof window !== 'undefined' && window.desktopWindow;
  if (!bridge || typeof bridge.listLocalPlaylists !== 'function') return Promise.resolve(false);
  return bridge.listLocalPlaylists().then(function (result) {
    if (!result || result.ok !== true || !Array.isArray(result.playlists)) return false;
    // The Electron catalog is the durable source of truth. Browser storage is
    // only a migration fallback for the first run after upgrading an older
    // build, so a stale localStorage snapshot cannot overwrite newer disk data.
    var diskCatalog = result.playlists;
    var browserCatalog = localFilePlaylists;
    var usingBrowserFallback = !diskCatalog.length && browserCatalog.length > 0;
    var catalog = usingBrowserFallback ? browserCatalog : diskCatalog;
    localFilePlaylists = mergeLocalPlaylistCatalogs(catalog, []);
    try { localStorage.setItem(LOCAL_PLAYLIST_FILES_KEY, JSON.stringify(localFilePlaylists)); } catch (_) { }
    if (usingBrowserFallback) saveLocalFilePlaylists();
    if (typeof rebuildUserPlaylistsFromCatalog === 'function') {
      rebuildUserPlaylistsFromCatalog({ animate: false, preserveScroll: true, reason: 'local-playlist-catalog-hydrate' });
    }
    if (typeof refreshMusicLibraryWorkspace === 'function') refreshMusicLibraryWorkspace('catalog-hydrate');
    return true;
  }).catch(function (error) {
    console.warn('[LocalPlaylistCatalog]', error);
    return false;
  });
}

async function decodeLocalPlaylistFile(file) {
  if (!file || typeof DecompressionStream !== 'function') throw new Error('当前环境不支持歌单文件');
  var stream = file.stream().pipeThrough(new DecompressionStream('gzip'));
  var text = await new Response(stream).text();
  var payload = JSON.parse(text.replace(/^\uFEFF/, ''));
  if (payload.type && payload.type !== 'playListPart_v2' && payload.type !== 'mineradio_playlist_v1') throw new Error('歌单文件格式不受支持');
  return normalizeLocalPlaylistPayload(payload);
}

async function importLocalPlaylistFiles(files) {
  var imported = [], failed = 0;
  for (var i = 0; i < (files || []).length; i += 1) {
    try { imported.push(await decodeLocalPlaylistFile(files[i])); } catch (error) { failed += 1; console.warn('[LocalPlaylistImport]', error); }
  }
  if (!imported.length) { showToast('没有读取到可用的歌单文件'); return false; }
  var byKey = Object.create(null);
  localFilePlaylists.concat(imported).forEach(function (item) { byKey[item.id + '|' + item.name] = item; });
  localFilePlaylists = Object.keys(byKey).map(function (key) { return byKey[key]; });
  saveLocalFilePlaylists();
  rebuildUserPlaylistsFromCatalog({ animate: true, preserveScroll: true, reason: 'local-playlist-import' });
  if (typeof refreshMusicLibraryWorkspace === 'function') refreshMusicLibraryWorkspace('playlist-file-import');
  showToast('已导入 ' + imported.length + ' 个歌单' + (failed ? '，失败 ' + failed + ' 个' : ''));
  return true;
}

function openLocalPlaylistImport() {
  var input = document.getElementById('local-playlist-file-input');
  if (!input) {
    input = document.createElement('input');
    input.id = 'local-playlist-file-input';
    input.type = 'file';
    input.accept = '.mrpl,.lxmc,application/gzip,application/octet-stream';
    input.multiple = true;
    input.hidden = true;
    input.addEventListener('change', function () {
      importLocalPlaylistFiles(input.files).finally(function () { input.value = ''; });
    });
    document.body.appendChild(input);
  }
  input.click();
}

function closeLocalPlaylistLinkImport() {
  var mask = document.getElementById('local-playlist-link-import-mask');
  if (mask) mask.remove();
}

function openLocalPlaylistLinkImport() {
  closeLocalPlaylistLinkImport();
  var mask = document.createElement('div');
  mask.id = 'local-playlist-link-import-mask';
  mask.className = 'modal-mask show';
  mask.innerHTML =
    '<div class="modal" style="width:min(520px,calc(100vw - 32px))">' +
      '<h2>导入歌单链接</h2>' +
      '<div class="collect-create" style="margin:14px 0 10px">' +
        '<button class="fx-mini-btn active" type="button" data-link-provider="netease">网易云</button>' +
        '<button class="fx-mini-btn ghost" type="button" data-link-provider="qq">QQ 音乐</button>' +
        '<button class="fx-mini-btn ghost" type="button" data-link-provider="kugou">酷狗</button>' +
      '</div>' +
      '<textarea id="local-playlist-link-input" class="playlist-import-input" style="min-height:116px" placeholder="粘贴歌单分享链接，或输入数字歌单 ID" spellcheck="false"></textarea>' +
      '<div id="local-playlist-link-hint" class="playlist-import-hint">导入后会保存在本地歌单文件分组，可直接播放或导出。</div>' +
      '<div class="btn-row"><button class="modal-btn" type="button" data-link-close="1">取消</button><button class="modal-btn primary" type="button" data-link-submit="1">开始导入</button></div>' +
    '</div>';
  document.body.appendChild(mask);
  var provider = 'netease';
  var input = mask.querySelector('#local-playlist-link-input');
  var hint = mask.querySelector('#local-playlist-link-hint');
  var submit = mask.querySelector('[data-link-submit]');
  mask.addEventListener('click', function (event) {
    if (event.target === mask || event.target.closest('[data-link-close]')) { closeLocalPlaylistLinkImport(); return; }
    var button = event.target.closest('[data-link-provider]');
    if (button) {
      provider = button.getAttribute('data-link-provider') || 'netease';
      mask.querySelectorAll('[data-link-provider]').forEach(function (item) {
        var active = item === button;
        item.classList.toggle('active', active);
        item.classList.toggle('ghost', !active);
      });
      if (hint) hint.textContent = provider === 'netease' ? '支持歌单链接或数字 ID。' : (provider === 'qq' ? '粘贴 QQ 音乐歌单分享链接或数字 ID。' : '粘贴酷狗歌单分享链接或数字 ID。');
      return;
    }
    if (!event.target.closest('[data-link-submit]')) return;
    var value = String(input && input.value || '').trim();
    if (!value) { if (hint) hint.textContent = '请先粘贴歌单链接或输入数字 ID。'; input.focus(); return; }
    submit.disabled = true;
    if (hint) hint.textContent = '正在读取歌单，请稍候...';
    apiJson('/api/local-playlists/import-link', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: value, provider: provider }), timeoutMs: 30000
    }).then(function (result) {
      if (!result || !result.ok || !result.playlist) throw new Error(result && result.error || 'PLAYLIST_LINK_IMPORT_FAILED');
      var imported = result.playlist;
      var found = localFilePlaylists.findIndex(function (item) { return String(item.id) === String(imported.id); });
      if (found >= 0) localFilePlaylists.splice(found, 1, imported);
      else localFilePlaylists.unshift(imported);
      if (!saveLocalFilePlaylists()) return;
      rebuildUserPlaylistsFromCatalog({ animate: true, preserveScroll: true, reason: 'local-playlist-link-import' });
      if (typeof refreshMusicLibraryWorkspace === 'function') refreshMusicLibraryWorkspace('playlist-link-import');
      closeLocalPlaylistLinkImport();
      showToast('已导入歌单：' + imported.name + ' · ' + imported.songs.length + ' 首');
    }).catch(function (error) {
      if (hint) hint.textContent = '导入失败：' + String(error && error.message || '链接不可用');
    }).finally(function () { submit.disabled = false; });
  });
  input.focus();
}

function localPlaylistById(id) {
  return localFilePlaylists.find(function (item) { return String(item.id) === String(id); }) || null;
}

function createLocalFilePlaylist(name) {
  name = String(name || '').trim();
  if (!name) return null;
  var playlist = {
    id: 'local-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
    provider: 'local', source: 'local', name: name, creator: '本地歌单',
    cover: '', songs: [], trackCount: 0, importedAt: Date.now(), updatedAt: Date.now()
  };
  localFilePlaylists.unshift(playlist);
  if (!saveLocalFilePlaylists()) {
    localFilePlaylists.shift();
    return null;
  }
  rebuildUserPlaylistsFromCatalog({ animate: true, preserveScroll: true, reason: 'local-playlist-create' });
  return playlist;
}

function addSongToLocalFilePlaylist(id, song) {
  var playlist = localPlaylistById(id);
  var normalized = normalizeLocalPlaylistSong(song);
  if (!playlist || !normalized) return { ok: false, error: 'LOCAL_PLAYLIST_SONG_INVALID' };
  var key = localPlaylistSongKey(normalized);
  if (playlist.songs.some(function (item) { return localPlaylistSongKey(item) === key; })) {
    return { ok: true, duplicate: true };
  }
  playlist.songs.push(normalized);
  playlist.trackCount = playlist.songs.length;
  playlist.updatedAt = Date.now();
  if (!playlist.cover) playlist.cover = normalized.picUrl || '';
  if (!saveLocalFilePlaylists()) {
    playlist.songs.pop();
    playlist.trackCount = playlist.songs.length;
    return { ok: false, error: 'LOCAL_PLAYLIST_SAVE_FAILED' };
  }
  rebuildUserPlaylistsFromCatalog({ animate: true, preserveScroll: true, reason: 'local-playlist-add-song' });
  return { ok: true, duplicate: false };
}

function addSongsToLocalFilePlaylist(id, songs) {
  var playlist = localPlaylistById(id);
  if (!playlist) return { ok: false, added: 0, duplicates: 0, error: 'LOCAL_PLAYLIST_NOT_FOUND' };
  var keys = Object.create(null), added = 0, duplicates = 0;
  playlist.songs.forEach(function (item) { keys[localPlaylistSongKey(item)] = true; });
  (Array.isArray(songs) ? songs : []).forEach(function (song) {
    var normalized = normalizeLocalPlaylistSong(song);
    if (!normalized) return;
    var key = localPlaylistSongKey(normalized);
    if (keys[key]) { duplicates += 1; return; }
    keys[key] = true;
    playlist.songs.push(normalized);
    added += 1;
  });
  if (!added) return { ok: true, added: 0, duplicates: duplicates };
  playlist.trackCount = playlist.songs.length;
  playlist.updatedAt = Date.now();
  if (!playlist.cover) playlist.cover = playlist.songs[0] && (playlist.songs[0].picUrl || playlist.songs[0].cover) || '';
  if (!saveLocalFilePlaylists()) return { ok: false, added: 0, duplicates: duplicates, error: 'LOCAL_PLAYLIST_SAVE_FAILED' };
  rebuildUserPlaylistsFromCatalog({ animate: false, preserveScroll: true, reason: 'local-playlist-add-songs' });
  return { ok: true, added: added, duplicates: duplicates };
}

function renameLocalFilePlaylist(id, name) {
  var playlist = localPlaylistById(id);
  name = String(name || '').trim().slice(0, 120);
  if (!playlist || !name) return false;
  playlist.name = name;
  playlist.updatedAt = Date.now();
  if (!saveLocalFilePlaylists()) return false;
  rebuildUserPlaylistsFromCatalog({ animate: false, preserveScroll: true, reason: 'local-playlist-rename' });
  return true;
}

function deleteLocalFilePlaylist(id) {
  var index = localFilePlaylists.findIndex(function (item) { return String(item.id) === String(id); });
  if (index < 0) return false;
  localFilePlaylists.splice(index, 1);
  if (!saveLocalFilePlaylists()) return false;
  rebuildUserPlaylistsFromCatalog({ animate: false, preserveScroll: true, reason: 'local-playlist-delete' });
  return true;
}

function removeSongFromLocalFilePlaylist(id, songIndex) {
  var playlist = localPlaylistById(id);
  songIndex = Number(songIndex);
  if (!playlist || !Number.isInteger(songIndex) || songIndex < 0 || songIndex >= playlist.songs.length) return false;
  playlist.songs.splice(songIndex, 1);
  playlist.trackCount = playlist.songs.length;
  playlist.cover = String(playlist.songs[0] && (playlist.songs[0].picUrl || playlist.songs[0].cover) || '');
  playlist.updatedAt = Date.now();
  if (!saveLocalFilePlaylists()) return false;
  rebuildUserPlaylistsFromCatalog({ animate: false, preserveScroll: true, reason: 'local-playlist-remove-song' });
  return true;
}

function playLocalPlaylistFile(id) {
  var playlist = localPlaylistById(id);
  if (!playlist || !playlist.songs.length) { showToast('这个歌单没有可播放歌曲'); return false; }
  cancelPlaylistQueueHydration('local-playlist');
  playQueue = playlist.songs.map(cloneSong);
  currentIdx = 0;
  safeRenderQueuePanel('local-playlist-load', { animate: true, scrollCurrent: true });
  safeSwitchPlaylistTab('queue', 'local-playlist-load');
  safeShelfRebuild('local-playlist-load', true);
  forcePlaybackControlsInteractive();
  playQueueAt(0).catch(function () { showToast('歌单已载入，首首歌曲播放失败'); });
  return true;
}

function localPlaylistExportPayload(playlist) {
  return {
    type: 'mineradio_playlist_v1',
    version: 1,
    data: {
      id: String(playlist.id || ''),
      name: String(playlist.name || 'Mineradio 歌单'),
      source: 'mineradio',
      sourceListId: String(playlist.id || ''),
      list: (playlist.songs || []).map(localPlaylistExportSong).filter(function (song) { return song.source && song.name && song.id; })
    }
  };
}

function localPlaylistExportSong(song) {
  song = song || {};
  var source = song.additionalSourceCode || song.source || song.provider || '';
  var meta = Object.assign({}, song.importedMeta || {});
  [
    ['picUrl', song.picUrl || song.cover], ['albumName', song.albumName || song.album],
    ['albumId', song.albumId], ['copyrightId', song.copyrightId],
    ['lrcUrl', song.lrcUrl], ['mrcUrl', song.mrcUrl], ['trcUrl', song.trcUrl],
    ['hash', song.hash], ['strMediaMid', song.strMediaMid]
  ].forEach(function (entry) {
    if (entry[1] != null && entry[1] !== '') meta[entry[0]] = entry[1];
  });
  return {
    id: song.id || song.songmid || '',
    songmid: song.songmid || song.mid || song.id || '',
    name: song.name || '',
    singer: song.singer || song.artist || '',
    source: source,
    provider: song.provider || song.source || source,
    interval: song.interval || song.duration || '',
    meta: meta,
    localFileId: song.localFileId || '',
    localKey: song.localKey || '',
    localUrl: song.localUrl || '',
    localPath: song.localPath || '',
    cover: song.cover || song.picUrl || '',
    hasLyric: song.hasLyric === true,
    lyricSource: song.lyricSource || '',
    localMissing: song.localMissing === true
  };
}

async function exportLocalPlaylistFile(id) {
  var playlist = localPlaylistById(id);
  if (!playlist) return;
  var name = String(playlist.name || 'Mineradio歌单').replace(/[\\/:*?"<>|]+/g, '-') + '.mrpl';
  var payload = localPlaylistExportPayload(playlist);
  var bridge = window.desktopWindow;
  if (bridge && typeof bridge.exportPlaylistFile === 'function') {
    var result = await bridge.exportPlaylistFile({ defaultName: name, data: payload });
    if (!result || result.canceled) return;
    if (!result.ok) { showToast('歌单文件导出失败'); return; }
    showToast('歌单文件已导出');
    return;
  }
  if (typeof CompressionStream !== 'function') { showToast('当前环境不支持歌单文件导出'); return; }
  var stream = new Blob([JSON.stringify(payload)], { type: 'application/json' }).stream().pipeThrough(new CompressionStream('gzip'));
  var blob = await new Response(stream).blob();
  var url = URL.createObjectURL(blob), anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  document.body.appendChild(anchor); anchor.click(); anchor.remove();
  setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
  showToast('歌单文件已导出');
}

localPlaylistCatalogReady = hydrateLocalPlaylistCatalog();
