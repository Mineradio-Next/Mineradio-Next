var miniPlayerState = { active: false, alwaysOnTop: false, syncTimer: 0 };

function miniPlayerApi() {
  return window.desktopWindow && window.desktopWindow.isDesktop ? window.desktopWindow : null;
}

function miniPlayerSong() {
  if (playQueue && currentIdx >= 0 && currentIdx < playQueue.length) return playQueue[currentIdx];
  return typeof currentCoverSong === 'function' ? currentCoverSong() : null;
}

function miniPlayerFormatTime(value) {
  if (typeof formatProgramTime === 'function') return formatProgramTime(Math.max(0, Number(value) || 0));
  var seconds = Math.max(0, Math.floor(Number(value) || 0));
  return Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0');
}

function miniPlayerLyricText() {
  var seconds = audio && isFinite(audio.currentTime) ? audio.currentTime : 0;
  var index = typeof stageLyricIndexForSeconds === 'function' ? stageLyricIndexForSeconds(seconds) : -1;
  if (index >= 0 && typeof lyricLineDisplayTextAt === 'function') {
    var text = lyricLineDisplayTextAt(index);
    if (text) return text;
  }
  return typeof currentLyricFallbackText === 'function' ? currentLyricFallbackText() : '让音乐留在桌面一角';
}

function syncMiniPlayerUi() {
  if (!miniPlayerState.active) return;
  var song = miniPlayerSong();
  var cover = document.getElementById('mini-player-cover');
  var title = document.getElementById('mini-player-title');
  var artist = document.getElementById('mini-player-artist');
  var source = document.getElementById('mini-player-source');
  var lyric = document.getElementById('mini-player-lyric');
  var playIcon = document.getElementById('mini-player-play-icon');
  var current = audio && isFinite(audio.currentTime) ? Math.max(0, audio.currentTime) : 0;
  var duration = typeof getPlaybackDurationSeconds === 'function' ? getPlaybackDurationSeconds() : 0;
  if (title) title.textContent = song && (song.name || song.title) || 'Mineradio';
  if (artist) artist.textContent = song && song.artist || '等待播放';
  if (source) source.textContent = song && typeof songSourceLabel === 'function' ? songSourceLabel(song) : '本机';
  if (lyric) lyric.textContent = song ? miniPlayerLyricText() : '让音乐留在桌面一角';
  if (cover) {
    var src = song && typeof songCoverSrc === 'function' ? songCoverSrc(song, 160) : (song && song.cover || '');
    if (src && cover.getAttribute('src') !== src) cover.setAttribute('src', src);
    cover.classList.toggle('empty', !src);
    if (!src) cover.removeAttribute('src');
  }
  var pct = duration > 0 ? Math.max(0, Math.min(100, current / duration * 100)) : 0;
  var fill = document.getElementById('mini-player-progress-fill');
  var progress = document.getElementById('mini-player-progress');
  if (fill) fill.style.width = pct + '%';
  if (progress) progress.setAttribute('aria-valuenow', String(Math.round(pct)));
  var currentEl = document.getElementById('mini-player-current');
  var durationEl = document.getElementById('mini-player-duration');
  if (currentEl) currentEl.textContent = miniPlayerFormatTime(current);
  if (durationEl) durationEl.textContent = miniPlayerFormatTime(duration);
  var playingNow = !!(audio && !audio.paused && !audio.ended);
  if (playIcon) playIcon.innerHTML = playingNow
    ? '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>'
    : '<path d="M8 5v14l11-7z"/>';
  var volume = document.getElementById('mini-player-volume');
  if (volume && Math.abs(Number(volume.value) - Number(targetVolume || 0)) > 0.001) volume.value = targetVolume;
}

function applyMiniPlayerWindowState(state) {
  state = state || {};
  miniPlayerState.active = state.isMiniPlayer === true;
  miniPlayerState.alwaysOnTop = miniPlayerState.active && state.isAlwaysOnTop === true;
  document.body.classList.toggle('mini-player-mode', miniPlayerState.active);
  var surface = document.getElementById('mini-player');
  if (surface) surface.setAttribute('aria-hidden', miniPlayerState.active ? 'false' : 'true');
  var pin = document.getElementById('mini-player-pin');
  if (pin) {
    pin.classList.toggle('active', miniPlayerState.alwaysOnTop);
    pin.setAttribute('aria-pressed', miniPlayerState.alwaysOnTop ? 'true' : 'false');
    pin.title = miniPlayerState.alwaysOnTop ? '取消置顶' : '置顶';
  }
  if (miniPlayerState.active) syncMiniPlayerUi();
}

async function enterMiniPlayerMode() {
  var api = miniPlayerApi();
  if (!api || typeof api.setMiniPlayerMode !== 'function') return;
  var result = await api.setMiniPlayerMode(true);
  applyMiniPlayerWindowState(result && result.state);
  if (!result || result.ok !== true) showToast('迷你播放器暂时无法打开');
}

async function exitMiniPlayerMode() {
  var api = miniPlayerApi();
  if (!api || typeof api.setMiniPlayerMode !== 'function') return;
  var result = await api.setMiniPlayerMode(false);
  applyMiniPlayerWindowState(result && result.state);
}

async function toggleMiniPlayerAlwaysOnTop() {
  var api = miniPlayerApi();
  if (!api || typeof api.setMiniPlayerAlwaysOnTop !== 'function') return;
  var result = await api.setMiniPlayerAlwaysOnTop(!miniPlayerState.alwaysOnTop);
  applyMiniPlayerWindowState(result && result.state);
}

function closeMiniPlayerWindow() {
  var api = miniPlayerApi();
  if (!api) return;
  saveLastPlaybackSnapshot(true, 'mini-player-close');
  api.close(closeBehaviorPreference);
}

function commitMiniPlayerSeek(targetTime) {
  if (!audio || typeof commitProgressSeek !== 'function') return;
  progressDragState.media = audio;
  progressDragState.mediaSrc = audio.currentSrc || audio.src || '';
  progressDragState.previewDuration = getPlaybackDurationSeconds();
  progressDragState.previewTime = targetTime;
  commitProgressSeek(targetTime, !!(!audio.paused && !audio.ended));
  progressDragState.media = null;
  progressDragState.mediaSrc = '';
}

function seekMiniPlayerFromPointer(event) {
  if (!audio || typeof getPlaybackDurationSeconds !== 'function') return;
  var rect = event.currentTarget.getBoundingClientRect();
  var duration = getPlaybackDurationSeconds();
  if (!duration || !rect.width) return;
  var ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
  commitMiniPlayerSeek(ratio * duration);
}

function initMiniPlayer() {
  var api = miniPlayerApi();
  var progress = document.getElementById('mini-player-progress');
  var volume = document.getElementById('mini-player-volume');
  if (progress) {
    progress.addEventListener('pointerdown', seekMiniPlayerFromPointer);
    progress.addEventListener('keydown', function (event) {
      if (!audio || (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')) return;
      event.preventDefault();
      var duration = getPlaybackDurationSeconds();
      commitMiniPlayerSeek(Math.max(0, Math.min(duration, (Number(audio.currentTime) || 0) + (event.key === 'ArrowRight' ? 5 : -5))));
    });
  }
  if (volume) volume.addEventListener('input', function () { setVolume(this.value, true); syncMiniPlayerUi(); });
  if (api && typeof api.onStateChange === 'function') api.onStateChange(applyMiniPlayerWindowState);
  if (api && typeof api.onViewportRefresh === 'function') api.onViewportRefresh(function () { scheduleMainRendererViewportRefresh('mini-player'); });
  if (api && typeof api.getState === 'function') api.getState().then(applyMiniPlayerWindowState).catch(function () {});
  miniPlayerState.syncTimer = setInterval(syncMiniPlayerUi, 200);
}

initMiniPlayer();
