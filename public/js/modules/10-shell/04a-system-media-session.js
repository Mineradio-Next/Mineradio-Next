var systemMediaSessionPositionLastAt = 0;
var systemMediaSessionPositionCleared = false;
var systemMediaSessionInitialized = false;

function systemMediaSessionAvailable() {
  return !!(typeof navigator !== 'undefined' && navigator.mediaSession);
}

function systemMediaSessionText(value) {
  if (Array.isArray(value)) {
    return value.map(function (item) { return systemMediaSessionText(item); }).filter(Boolean).join(' / ');
  }
  if (value && typeof value === 'object') {
    return systemMediaSessionText(value.name || value.title || value.artist || '');
  }
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function currentSystemMediaSessionSong() {
  if (typeof playQueue !== 'undefined' && Array.isArray(playQueue) && currentIdx >= 0 && currentIdx < playQueue.length) {
    return playQueue[currentIdx] || null;
  }
  if (typeof currentLocalSong !== 'undefined' && currentLocalSong) return currentLocalSong;
  return null;
}

function systemMediaSessionHasCurrentMedia() {
  return !!(typeof audio !== 'undefined' && audio && audio.src && currentSystemMediaSessionSong());
}

function systemMediaSessionMetadataPayload() {
  var song = currentSystemMediaSessionSong();
  if (!song) return null;
  var desktopMeta = typeof currentDesktopSongMeta === 'function' ? currentDesktopSongMeta() : {};
  var title = systemMediaSessionText(desktopMeta.title || song.name || song.title) || 'Mineradio';
  var artist = systemMediaSessionText(desktopMeta.artist || song.artist || song.ar || song.singer || song.author) || 'Mineradio';
  var album = systemMediaSessionText(song.album || song.al || song.albumName || song.album_name) || 'Mineradio';
  var cover = systemMediaSessionText(desktopMeta.cover || song.customCover || song.cover || song.pic || song.albumPic || '');
  return { title: title, artist: artist, album: album, cover: cover };
}

function systemMediaSessionArtwork(meta) {
  var cover = systemMediaSessionText(meta && meta.cover);
  if (cover && typeof isProxyableCoverUrl === 'function' && isProxyableCoverUrl(cover) && typeof coverProxySrc === 'function') {
    cover = coverProxySrc(typeof coverUrlWithSize === 'function' ? coverUrlWithSize(cover, 512) : cover, false) || cover;
  }
  if (!cover) return [];
  try {
    var baseHref = typeof window !== 'undefined' && window.location ? window.location.href : (typeof location !== 'undefined' ? location.href : '');
    if (!/^data:|^blob:/i.test(cover) && baseHref) cover = new URL(cover, baseHref).href;
  } catch (_) {
    return [];
  }
  return cover ? [{ src: cover }] : [];
}

function updateSystemMediaSessionMetadata() {
  if (typeof syncWindowsTrayPlayback === 'function') syncWindowsTrayPlayback();
  if (!systemMediaSessionAvailable() || typeof MediaMetadata === 'undefined') return false;
  var meta = systemMediaSessionMetadataPayload();
  try {
    if (!meta) {
      navigator.mediaSession.metadata = null;
      return false;
    }
    navigator.mediaSession.metadata = new MediaMetadata({
      title: meta.title,
      artist: meta.artist,
      album: meta.album,
      artwork: systemMediaSessionArtwork(meta)
    });
    return true;
  } catch (_) {
    return false;
  }
}

function systemMediaSessionPositionPayload() {
  if (typeof audio === 'undefined' || !audio) return null;
  var duration = typeof getPlaybackDurationSeconds === 'function' ? getPlaybackDurationSeconds() : Number(audio.duration);
  if (!isFinite(duration) || duration <= 0) return null;
  var position = typeof getPlaybackCurrentSeconds === 'function' ? getPlaybackCurrentSeconds() : Number(audio.currentTime);
  position = Math.max(0, Math.min(duration, isFinite(position) ? position : 0));
  var playbackRate = Number(audio.playbackRate);
  if (!isFinite(playbackRate) || playbackRate <= 0) playbackRate = 1;
  return { duration: duration, position: position, playbackRate: playbackRate };
}

function clearSystemMediaSessionPosition() {
  if (!systemMediaSessionAvailable() || typeof navigator.mediaSession.setPositionState !== 'function') return false;
  if (systemMediaSessionPositionCleared) return true;
  try {
    navigator.mediaSession.setPositionState();
    systemMediaSessionPositionLastAt = 0;
    systemMediaSessionPositionCleared = true;
    return true;
  } catch (_) {
    return false;
  }
}

function updateSystemMediaSessionPosition(force) {
  if (!systemMediaSessionAvailable() || typeof navigator.mediaSession.setPositionState !== 'function') return false;
  if (!systemMediaSessionHasCurrentMedia()) return clearSystemMediaSessionPosition();
  var now = Date.now();
  if (!force && now - systemMediaSessionPositionLastAt < 750) return false;
  var payload = systemMediaSessionPositionPayload();
  if (!payload) return clearSystemMediaSessionPosition();
  try {
    navigator.mediaSession.setPositionState(payload);
    systemMediaSessionPositionLastAt = now;
    systemMediaSessionPositionCleared = false;
    return true;
  } catch (_) {
    return false;
  }
}

function updateSystemMediaSessionPlaybackState() {
  if (typeof syncWindowsTrayPlayback === 'function') syncWindowsTrayPlayback();
  if (!systemMediaSessionAvailable()) return false;
  var hasMedia = systemMediaSessionHasCurrentMedia();
  try {
    navigator.mediaSession.playbackState = hasMedia ? (audio.paused || audio.ended ? 'paused' : 'playing') : 'none';
  } catch (_) { }
  if (!hasMedia) {
    try { navigator.mediaSession.metadata = null; } catch (_) { }
    clearSystemMediaSessionPosition();
    return false;
  }
  updateSystemMediaSessionMetadata();
  updateSystemMediaSessionPosition(true);
  return true;
}

function seekFromSystemMediaSession(targetTime) {
  if (typeof audio === 'undefined' || !audio) return false;
  var duration = typeof getPlaybackDurationSeconds === 'function' ? getPlaybackDurationSeconds() : Number(audio.duration);
  if (!isFinite(duration) || duration <= 0) return false;
  var target = Math.max(0, Math.min(duration, Number(targetTime) || 0));
  if (typeof resetCuefieldAutoMix === 'function') resetCuefieldAutoMix('system-media-seek');
  if (
    typeof albumGaplessState !== 'undefined'
    && albumGaplessState
    && albumGaplessState.preload
    && typeof clearAlbumGaplessPreload === 'function'
  ) clearAlbumGaplessPreload('system-media-seek');
  try { audio.currentTime = target; } catch (_) { return false; }
  if (typeof syncBeatMapPlaybackCursor === 'function') syncBeatMapPlaybackCursor(target, true);
  if (typeof syncPodcastDjMapCursor === 'function') syncPodcastDjMapCursor(target, true);
  if (typeof updatePlaybackProgressUi === 'function') updatePlaybackProgressUi();
  if (typeof saveLastPlaybackSnapshot === 'function') saveLastPlaybackSnapshot(true, 'system-media-seek');
  updateSystemMediaSessionPosition(true);
  return true;
}

function configureSystemMediaSessionControls() {
  if (!systemMediaSessionAvailable() || typeof navigator.mediaSession.setActionHandler !== 'function') return false;
  var handlers = {
    play: function () {
      if (typeof audio !== 'undefined' && audio && (audio.paused || audio.ended) && typeof togglePlay === 'function') togglePlay();
    },
    pause: function () {
      if (typeof audio !== 'undefined' && audio && !audio.paused && !audio.ended && typeof togglePlay === 'function') togglePlay();
    },
    previoustrack: function () { if (typeof prevTrack === 'function') prevTrack(true); },
    nexttrack: function () { if (typeof nextTrack === 'function') nextTrack(true); },
    seekbackward: function (details) {
      var current = typeof getPlaybackCurrentSeconds === 'function' ? getPlaybackCurrentSeconds() : Number(audio && audio.currentTime);
      seekFromSystemMediaSession(current - (Number(details && details.seekOffset) || 10));
    },
    seekforward: function (details) {
      var current = typeof getPlaybackCurrentSeconds === 'function' ? getPlaybackCurrentSeconds() : Number(audio && audio.currentTime);
      seekFromSystemMediaSession(current + (Number(details && details.seekOffset) || 10));
    },
    seekto: function (details) {
      if (details && isFinite(Number(details.seekTime))) seekFromSystemMediaSession(Number(details.seekTime));
    },
    stop: function () {
      if (typeof audio !== 'undefined' && audio && !audio.paused && !audio.ended && typeof togglePlay === 'function') togglePlay();
    }
  };
  Object.keys(handlers).forEach(function (action) {
    try { navigator.mediaSession.setActionHandler(action, handlers[action]); } catch (_) { }
  });
  return true;
}

function initSystemMediaSession() {
  if (!systemMediaSessionAvailable()) return false;
  if (!systemMediaSessionInitialized) {
    systemMediaSessionInitialized = true;
    configureSystemMediaSessionControls();
  }
  updateSystemMediaSessionPlaybackState('startup');
  return true;
}
