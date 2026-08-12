function songFromListenRecord(record) {
  if (!record) return null;
  var provider = record.sourceKey || record.provider || '';
  if (!provider && record.type === 'qq') provider = 'qq';
  if (!provider) provider = record.mid ? 'qq' : 'netease';
  return {
    provider: provider,
    source: provider,
    type: record.type || (provider === 'qq' ? 'qq' : 'song'),
    id: record.id || record.mid || record.key || '',
    mid: record.mid || '',
    songmid: record.mid || '',
    mediaMid: record.mediaMid || '',
    hash: record.hash || '',
    mixSongId: record.mixSongId || '',
    albumId: record.albumId || '',
    providerSongId: record.providerSongId || '',
    spotifyId: record.spotifyId || '',
    spotifyUri: record.uri || '',
    additionalSourceCode: record.additionalSourceCode || '',
    localFileId: record.localFileId || '',
    localKey: record.localKey || '',
    name: record.name || '继续听',
    artist: record.artist || '',
    album: record.album || '',
    cover: record.cover || '',
    duration: record.durationSec || 0,
  };
}
function listenHistorySong(record) {
  if (!record) return null;
  if (record.localFileId || record.localKey || record.sourceKey === 'local') {
    var localId = String(record.localFileId || record.localKey || '').replace(/^local:/, '');
    var local = (persistentLocalLibraryTracks || []).filter(function (song) {
      return String(song.localFileId || song.localKey || '').replace(/^local:/, '') === localId;
    })[0];
    if (local) return cloneSong(local);
    return null;
  }
  return songFromListenRecord(record);
}
async function playListenHistoryRecord(record, options) {
  options = options || {};
  var song = listenHistorySong(record);
  if (!song && record && (record.localFileId || record.localKey || record.sourceKey === 'local')) {
    showToast('本地文件已失效，请重新导入后继续');
    return false;
  }
  if (!song || (!song.id && !song.mid && !song.hash && !song.spotifyId && !song.providerSongId && !song.localUrl)) {
    runHomeSearch(record && record.name || '');
    return false;
  }
  activeRadioContext = null;
  var targetKey = queueItemKey(song);
  var index = -1;
  for (var i = 0; i < playQueue.length; i++) if (queueItemKey(playQueue[i]) === targetKey) { index = i; break; }
  if (index < 0) { playQueue.push(cloneSong(song)); index = playQueue.length - 1; }
  safeRenderQueuePanel('listen-history-play');
  safeShelfRebuild('listen-history-play', true);
  forcePlaybackControlsInteractive();
  var resumeAt = options.restart ? 0 : Math.max(0, Number(record && record.resumeAt) || 0);
  return playQueueAt(index, { manual: true, resumeAt: resumeAt });
}
async function playHomeRecent(record) {
  record = record || homeListenSummary().recent;
  if (!record) {
    showToast('还没有听歌记录');
    return;
  }
  return playListenHistoryRecord(record);
}
function openHomeInsight() {
  var summary = homeListenSummary();
  if (summary.topArtist && summary.topArtist.name) {
    runHomeSearch(summary.topArtist.name);
    return;
  }
  if (summary.topSong && summary.topSong.name) {
    runHomeSearch(summary.topSong.name);
    return;
  }
  showToast('播放几首歌后会生成听歌画像');
}
function handleHomeTileClick(index) {
  var row = document.getElementById('home-tile-row');
  var item = row && row._homeTiles && row._homeTiles[index];
  if (!item) return;
  if (item.kind === 'recent') playHomeRecent(item.record);
  else if (item.kind === 'profile') openHomeInsight();
  else if (item.kind === 'song') playHomeSong(item.index);
  else if (item.kind === 'login') showLoginModal({ source: 'home-tile' });
  else if (item.kind === 'local') openHomeLocalImport();
  else if (item.kind === 'guide') openHomeProductGuide();
  else if (item.kind === 'playlist') openHomePlaylist(item.index);
  else if (item.kind === 'podcast') openHomePodcast(item.index);
  else if (item.kind === 'podcastSearch') { setSearchMode('podcast'); loadPodcastHot(); }
  else if (item.kind === 'library') openHomeLibrary();
  else runHomeSearch(item.query || item.title || '');
}
