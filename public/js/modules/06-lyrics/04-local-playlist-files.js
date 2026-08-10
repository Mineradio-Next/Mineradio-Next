/* Local playlist files: compatible with gzip playListPart_v2 exports. */
var LOCAL_PLAYLIST_FILES_KEY = 'mineradio-local-playlist-files-v1';
var localFilePlaylists = readLocalFilePlaylists();

function localPlaylistSource(value) {
  var key = String(value || '').toLowerCase();
  return ({ tx: 'qq', qq: 'qq', wy: 'netease', netease: 'netease', kg: 'kugou', kugou: 'kugou' })[key] || '';
}

function localPlaylistSongKey(song) {
  song = song || {};
  return [song.source || '', song.id || song.songmid || '', song.name || '', song.singer || ''].join('|').toLowerCase();
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
  try {
    localStorage.setItem(LOCAL_PLAYLIST_FILES_KEY, JSON.stringify(localFilePlaylists || []));
    return true;
  } catch (_) {
    showToast('歌单文件保存失败，可能超出本地存储空间');
    return false;
  }
}

async function decodeLocalPlaylistFile(file) {
  if (!file || typeof DecompressionStream !== 'function') throw new Error('当前环境不支持歌单文件');
  var stream = file.stream().pipeThrough(new DecompressionStream('gzip'));
  var text = await new Response(stream).text();
  var payload = JSON.parse(text.replace(/^\uFEFF/, ''));
  if (payload.type && payload.type !== 'playListPart_v2') throw new Error('歌单文件格式不受支持');
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
  showToast('已导入 ' + imported.length + ' 个歌单' + (failed ? '，失败 ' + failed + ' 个' : ''));
  return true;
}

function openLocalPlaylistImport() {
  var input = document.getElementById('local-playlist-file-input');
  if (!input) {
    input = document.createElement('input');
    input.id = 'local-playlist-file-input';
    input.type = 'file';
    input.accept = '.lxmc,application/gzip,application/octet-stream';
    input.multiple = true;
    input.hidden = true;
    input.addEventListener('change', function () {
      importLocalPlaylistFiles(input.files).finally(function () { input.value = ''; });
    });
    document.body.appendChild(input);
  }
  input.click();
}

function localPlaylistById(id) {
  return localFilePlaylists.find(function (item) { return String(item.id) === String(id); }) || null;
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
    type: 'playListPart_v2',
    data: {
      id: String(playlist.id || ''),
      name: String(playlist.name || 'Mineradio 歌单'),
      source: 'mineradio',
      sourceListId: String(playlist.id || ''),
      list: (playlist.songs || []).map(function (song) {
        return { id: song.id || song.songmid || '', name: song.name || '', singer: song.singer || song.artist || '', source: song.source === 'qq' ? 'tx' : (song.source === 'netease' ? 'wy' : (song.source === 'kugou' ? 'kg' : '')), interval: song.interval || '', meta: song.importedMeta || {} };
      }).filter(function (song) { return song.source && song.name && song.id; })
    }
  };
}

async function exportLocalPlaylistFile(id) {
  var playlist = localPlaylistById(id);
  if (!playlist) return;
  var name = String(playlist.name || 'Mineradio歌单').replace(/[\\/:*?"<>|]+/g, '-') + '.lxmc';
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
