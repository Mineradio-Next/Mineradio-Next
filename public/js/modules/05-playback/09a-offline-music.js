var offlineMusicState = {
  ready: false,
  loading: false,
  snapshot: { ok: true, count: 0, bytes: 0, tracks: [], jobs: [] },
  progress: Object.create(null),
  query: '',
  confirmKey: '',
  confirmUntil: 0
};

function offlineMusicBridge() {
  return window.desktopWindow && typeof window.desktopWindow.resolveOfflineMusic === 'function'
    ? window.desktopWindow
    : null;
}

function offlineMusicRawKey(song) {
  if (!song || song.type === 'local' || song.source === 'local' || song.localUrl) return '';
  return typeof queueItemKey === 'function' ? queueItemKey(song) : '';
}

function offlineMusicIsEligible(song) {
  return !!(offlineMusicBridge() && offlineMusicRawKey(song) && song.type !== 'podcast' && song.type !== 'podcast-radio');
}

function offlineMusicBytesLabel(value) {
  var bytes = Math.max(0, Number(value) || 0);
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(bytes < 10240 ? 1 : 0) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}

function offlineMusicDateLabel(value) {
  var date = new Date(Number(value) || 0);
  if (!isFinite(date.getTime()) || !Number(value)) return '未知时间';
  return date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit', year: 'numeric' });
}

function offlineMusicProviderLabel(song) {
  var provider = String(song && (song.provider || song.source || song.type) || '').toLowerCase();
  if (provider === 'qq') return 'QQ 音乐';
  if (provider === 'kugou') return '酷狗';
  if (provider === 'qishui') return '汽水';
  if (provider === 'spotify') return 'Spotify';
  if (provider === 'kuwo') return '酷我';
  if (provider === 'migu') return '咪咕';
  return '网易云';
}

function clearOfflineMusicProgressAliases(song, keepKey) {
  var identity = offlineMusicRawKey(song);
  Object.keys(offlineMusicState.progress).forEach(function (key) {
    var item = offlineMusicState.progress[key];
    if (key !== keepKey && item && offlineMusicRawKey(item.song) === identity) delete offlineMusicState.progress[key];
  });
}

function refreshOfflineMusicSnapshot(forceRender) {
  var bridge = offlineMusicBridge();
  if (!bridge || typeof bridge.listOfflineMusic !== 'function') {
    offlineMusicState.ready = true;
    offlineMusicState.snapshot = { ok: false, count: 0, bytes: 0, tracks: [], jobs: [], error: '仅桌面版支持离线音乐' };
    if (forceRender && typeof renderMusicLibraryWorkspace === 'function' && musicLibraryWorkspaceState.tab === 'offline') renderMusicLibraryWorkspace('offline-unavailable');
    return Promise.resolve(offlineMusicState.snapshot);
  }
  if (offlineMusicState.loading) return Promise.resolve(offlineMusicState.snapshot);
  offlineMusicState.loading = true;
  return bridge.listOfflineMusic().then(function (snapshot) {
    offlineMusicState.ready = true;
    offlineMusicState.snapshot = snapshot && typeof snapshot === 'object'
      ? snapshot
      : { ok: false, count: 0, bytes: 0, tracks: [], jobs: [], error: '离线音乐读取失败' };
    (offlineMusicState.snapshot.jobs || []).forEach(function (job) {
      offlineMusicState.progress[job.key] = Object.assign({ status: 'downloading' }, job);
    });
    return offlineMusicState.snapshot;
  }).catch(function (error) {
    offlineMusicState.ready = true;
    offlineMusicState.snapshot = { ok: false, count: 0, bytes: 0, tracks: [], jobs: [], error: error && error.message || '离线音乐读取失败' };
    return offlineMusicState.snapshot;
  }).finally(function () {
    offlineMusicState.loading = false;
    if (forceRender && typeof renderMusicLibraryWorkspace === 'function' && musicLibraryWorkspaceState.tab === 'offline') renderMusicLibraryWorkspace('offline-refresh');
  });
}

async function resolveOfflinePlaybackData(song) {
  var bridge = offlineMusicBridge();
  var key = offlineMusicRawKey(song);
  if (!bridge || !key) return null;
  try {
    var result = await bridge.resolveOfflineMusic(key);
    if (!result || result.ok !== true || result.hit !== true || !result.offlineUrl) return null;
    return {
      url: result.offlineUrl,
      proxyUrl: result.offlineUrl,
      source: 'offline',
      provider: songProviderKey(song),
      level: result.quality || '',
      offline: true,
    };
  } catch (_) {
    return null;
  }
}

function offlineMusicDownloadProxyUrl(data) {
  var proxy = String(data && data.proxyUrl || '');
  if (proxy) {
    try { return new URL(proxy, location.origin).href; } catch (_) {}
  }
  var source = String(data && data.url || '');
  return source ? location.origin + '/api/audio?url=' + encodeURIComponent(source) : '';
}

async function saveSongOffline(song) {
  var bridge = offlineMusicBridge();
  var key = offlineMusicRawKey(song);
  if (!bridge || !key) {
    showToast(song && (song.type === 'local' || song.localUrl) ? '本地歌曲无需重复保存' : '当前歌曲不支持离线保存');
    return false;
  }
  var active = offlineMusicState.progress[key];
  if (active && /^(starting|downloading)$/.test(active.status || '')) {
    showToast('这首歌正在保存');
    return false;
  }
  offlineMusicState.progress[key] = { key: key, status: 'resolving', receivedBytes: 0, totalBytes: 0, song: song };
  syncCurrentOfflineAction(song);
  if (musicLibraryWorkspaceState && musicLibraryWorkspaceState.tab === 'offline') renderMusicLibraryWorkspace('offline-resolving');
  showToast('正在准备离线副本');
  try {
    var provider = normalizePlaybackProvider(songProviderKey(song));
    var requestedQuality = normalizePlaybackQualityForProvider(getProviderPlaybackQuality(provider), provider);
    var data = await resolveNetworkPlaybackData(song, requestedQuality);
    if (!data || !data.url || data.trial) throw new Error(data && (data.reason || data.error || data.message) || '当前歌曲没有完整可播音源');
    var downloadUrl = offlineMusicDownloadProxyUrl(data);
    if (!downloadUrl) throw new Error('未能生成离线音源');
    var result = await bridge.downloadOfflineMusic({
      key: key,
      url: downloadUrl,
      quality: data.level || requestedQuality,
      song: song,
    });
    if (!result || result.ok !== true) throw new Error(result && result.error || '离线保存失败');
    clearOfflineMusicProgressAliases(song, '');
    await refreshOfflineMusicSnapshot(false);
    showToast('已保存到离线音乐');
    syncCurrentOfflineAction(song);
    if (musicLibraryWorkspaceState && musicLibraryWorkspaceState.tab === 'offline') renderMusicLibraryWorkspace('offline-complete');
    return true;
  } catch (error) {
    clearOfflineMusicProgressAliases(song, '');
    showToast('离线保存失败：' + (error && error.message || '未知错误'));
    syncCurrentOfflineAction(song);
    if (musicLibraryWorkspaceState && musicLibraryWorkspaceState.tab === 'offline') renderMusicLibraryWorkspace('offline-failed');
    return false;
  }
}

function saveCurrentSongOffline(event) {
  if (event) event.stopPropagation();
  var song = detailCommentSong || currentCoverSong();
  if (!song) return;
  saveSongOffline(song);
}

function offlineMusicEntryForSong(song) {
  var rawKey = offlineMusicRawKey(song);
  if (!rawKey) return null;
  var key = '';
  var tracks = offlineMusicState.snapshot && offlineMusicState.snapshot.tracks || [];
  for (var i = 0; i < tracks.length; i++) {
    var entry = tracks[i];
    var candidate = entry && entry.song;
    if (!candidate) continue;
    if (offlineMusicRawKey(candidate) === rawKey) return entry;
    if (!key && offlineMusicState.progress[entry.key]) key = entry.key;
  }
  return null;
}

function syncCurrentOfflineAction(song) {
  var button = document.getElementById('detail-offline-action');
  if (!button) return;
  song = song || detailCommentSong || currentCoverSong();
  var rawKey = offlineMusicRawKey(song);
  var entry = offlineMusicEntryForSong(song);
  var active = Object.keys(offlineMusicState.progress).some(function (key) {
    var item = offlineMusicState.progress[key];
    return item && item.song && offlineMusicRawKey(item.song) === rawKey && /^(resolving|starting|downloading)$/.test(item.status || '');
  });
  button.disabled = !offlineMusicIsEligible(song) || active || !!entry;
  button.classList.toggle('busy', active);
  button.classList.toggle('saved', !!entry);
  button.textContent = entry ? '已离线' : (active ? '保存中' : '保存离线');
  button.title = entry ? '可在音乐库的离线音乐中管理' : '保存到离线音乐';
}

function cancelOfflineMusicDownload(key) {
  var bridge = offlineMusicBridge();
  if (!bridge) return;
  bridge.cancelOfflineMusic(String(key || '')).then(function () { showToast('正在取消离线保存'); });
}

function removeOfflineMusicEntry(key) {
  var bridge = offlineMusicBridge();
  if (!bridge || !key) return Promise.resolve(false);
  return bridge.removeOfflineMusic(key).then(function (snapshot) {
    if (!snapshot || snapshot.ok !== true) throw new Error(snapshot && snapshot.error || '移除失败');
    offlineMusicState.snapshot = snapshot;
    showToast('已移除离线副本');
    renderMusicLibraryWorkspace('offline-remove');
    syncCurrentOfflineAction();
    return true;
  }).catch(function (error) {
    showToast('移除失败：' + (error && error.message || '未知错误'));
    return false;
  });
}

function playOfflineMusicEntry(key) {
  var entry = (offlineMusicState.snapshot.tracks || []).filter(function (item) { return item.key === key; })[0];
  if (!entry || !entry.available || !entry.song) return showToast('离线副本不可用');
  var song = cloneSong(entry.song);
  var targetKey = queueItemKey(song);
  var index = -1;
  for (var i = 0; i < playQueue.length; i++) if (queueItemKey(playQueue[i]) === targetKey) { index = i; break; }
  if (index < 0) { playQueue.push(song); index = playQueue.length - 1; }
  closeMusicLibraryWorkspace();
  playQueueAt(index, { manual: true }).catch(function (error) { console.warn('[OfflineMusicPlay]', error); });
}

function bindOfflineMusicProgress() {
  var bridge = offlineMusicBridge();
  if (!bridge || typeof bridge.onOfflineMusicProgress !== 'function' || bindOfflineMusicProgress.bound) return;
  bindOfflineMusicProgress.bound = true;
  bridge.onOfflineMusicProgress(function (payload) {
    if (!payload || !payload.key) return;
    clearOfflineMusicProgressAliases(payload.song, payload.key);
    if (payload.status === 'complete' || payload.status === 'cancelled' || payload.status === 'failed') {
      delete offlineMusicState.progress[payload.key];
      refreshOfflineMusicSnapshot(false).then(function () {
        if (musicLibraryWorkspaceState && musicLibraryWorkspaceState.tab === 'offline') renderMusicLibraryWorkspace('offline-terminal');
        syncCurrentOfflineAction();
      });
    } else {
      offlineMusicState.progress[payload.key] = payload;
      if (musicLibraryWorkspaceState && musicLibraryWorkspaceState.tab === 'offline') renderMusicLibraryWorkspace('offline-progress');
      syncCurrentOfflineAction();
    }
  });
}

bindOfflineMusicProgress();
refreshOfflineMusicSnapshot(false);
