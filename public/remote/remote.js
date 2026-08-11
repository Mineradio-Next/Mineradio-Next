(function () {
  'use strict';

  var hash = new URLSearchParams(String(location.hash || '').replace(/^#/, ''));
  var token = String(hash.get('token') || '').toLowerCase();
  if (/^[a-f0-9]{64}$/.test(token)) history.replaceState(null, '', location.pathname);
  else token = '';

  var state = null;
  var pollTimer = 0;
  var feedbackTimer = 0;
  var artworkRevision = -1;
  var artworkObjectUrl = '';
  var volumeTimer = 0;
  var commandBusy = false;
  var elements = {
    connection: document.getElementById('connection-state'),
    title: document.getElementById('track-title'),
    artist: document.getElementById('track-artist'),
    album: document.getElementById('track-album'),
    queueCount: document.getElementById('queue-count'),
    currentTime: document.getElementById('current-time'),
    duration: document.getElementById('duration'),
    play: document.getElementById('play-button'),
    previous: document.getElementById('previous-button'),
    next: document.getElementById('next-button'),
    volume: document.getElementById('volume-slider'),
    volumeValue: document.getElementById('volume-value'),
    upcoming: document.getElementById('up-next-list'),
    artwork: document.getElementById('artwork'),
    lastUpdate: document.getElementById('last-update'),
    sessionNote: document.getElementById('session-note'),
    feedback: document.getElementById('feedback'),
  };

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (character) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character];
    });
  }

  function formatTime(seconds) {
    seconds = Math.max(0, Number(seconds) || 0);
    var minutes = Math.floor(seconds / 60);
    var remainder = Math.floor(seconds % 60);
    return minutes + ':' + String(remainder).padStart(2, '0');
  }

  function setConnection(kind, text) {
    elements.connection.className = 'connection-state ' + kind;
    elements.connection.querySelector('span').textContent = text;
    var disabled = kind === 'offline' || !token;
    [elements.play, elements.previous, elements.next, elements.volume].forEach(function (element) {
      element.disabled = disabled;
    });
  }

  function showFeedback(message) {
    elements.feedback.textContent = message;
    elements.feedback.classList.add('show');
    clearTimeout(feedbackTimer);
    feedbackTimer = setTimeout(function () { elements.feedback.classList.remove('show'); }, 1400);
  }

  async function api(path, options) {
    options = options || {};
    var headers = Object.assign({}, options.headers || {}, { Authorization: 'Bearer ' + token });
    var response = await fetch(path, Object.assign({}, options, { headers: headers, cache: 'no-store' }));
    if (response.status === 401) {
      setConnection('offline', '连接已结束');
      elements.sessionNote.textContent = '请在电脑端重新开启随身控制';
      throw new Error('SESSION_ENDED');
    }
    if (!response.ok) throw new Error('HTTP_' + response.status);
    return response;
  }

  async function refreshArtwork(revision) {
    if (revision === artworkRevision) return;
    artworkRevision = revision;
    try {
      var response = await api('/api/artwork');
      if (response.status === 204) throw new Error('NO_ARTWORK');
      var blob = await response.blob();
      if (!blob.size) throw new Error('NO_ARTWORK');
      var nextUrl = URL.createObjectURL(blob);
      var image = new Image();
      image.alt = '';
      image.onload = function () {
        if (artworkObjectUrl) URL.revokeObjectURL(artworkObjectUrl);
        artworkObjectUrl = nextUrl;
      };
      image.src = nextUrl;
      elements.artwork.replaceChildren(image);
    } catch (_) {
      elements.artwork.innerHTML = '<div class="artwork-fallback"><span>MR</span><i></i></div>';
    }
  }

  function render(next) {
    state = next || {};
    elements.title.textContent = state.title || '等待播放';
    elements.artist.textContent = state.artist || 'Mineradio';
    elements.album.textContent = state.album || '';
    elements.album.hidden = !state.album;
    elements.queueCount.textContent = (state.queueLength || 0) + ' TRACKS';
    elements.currentTime.textContent = formatTime(state.currentTime);
    elements.duration.textContent = formatTime(state.duration);
    var progress = Math.max(0, Math.min(1, Number(state.progress) || 0)) * 100;
    document.documentElement.style.setProperty('--fill', progress.toFixed(3) + '%');
    var volume = Math.round(Math.max(0, Math.min(1, Number(state.volume) || 0)) * 100);
    if (document.activeElement !== elements.volume) elements.volume.value = volume;
    elements.volumeValue.textContent = volume;
    elements.volume.style.setProperty('--volume', volume + '%');
    elements.play.classList.toggle('paused', !state.playing);
    elements.play.querySelector('span').textContent = state.playing ? 'Ⅱ' : '▶';
    elements.play.setAttribute('aria-label', state.playing ? '暂停' : '播放');
    elements.play.title = state.playing ? '暂停' : '播放';
    var upcoming = Array.isArray(state.upcoming) ? state.upcoming : [];
    elements.upcoming.innerHTML = upcoming.length ? upcoming.map(function (item) {
      return '<li><div><strong>' + escapeHtml(item.title) + '</strong><small>' + escapeHtml(item.artist) + '</small></div></li>';
    }).join('') : '<li class="empty">队列里还没有下一首</li>';
    elements.lastUpdate.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    refreshArtwork(Number(state.artworkRevision) || 0);
  }

  async function poll() {
    clearTimeout(pollTimer);
    if (!token) {
      setConnection('offline', '缺少连接凭证');
      elements.sessionNote.textContent = '请扫描电脑端显示的二维码';
      return;
    }
    try {
      var response = await api('/api/state');
      var result = await response.json();
      render(result.state);
      setConnection('online', '已连接');
    } catch (error) {
      if (error.message !== 'SESSION_ENDED') setConnection('offline', '连接中断');
    }
    pollTimer = setTimeout(poll, document.hidden ? 2600 : 800);
  }

  async function command(type, value) {
    if (!token || commandBusy && type !== 'volume') return;
    commandBusy = type !== 'volume';
    try {
      var body = { type: type };
      if (type === 'volume') body.value = value;
      await api('/api/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (type !== 'volume') showFeedback(type === 'next' ? '下一首' : type === 'previous' ? '上一首' : type === 'pause' ? '已暂停' : '继续播放');
      setTimeout(poll, 120);
    } catch (error) {
      if (error.message !== 'SESSION_ENDED') showFeedback('控制没有送达');
    } finally {
      commandBusy = false;
    }
  }

  elements.play.addEventListener('click', function () { command(state && state.playing ? 'pause' : 'play'); });
  elements.previous.addEventListener('click', function () { command('previous'); });
  elements.next.addEventListener('click', function () { command('next'); });
  elements.volume.addEventListener('input', function () {
    var value = Math.max(0, Math.min(100, Number(elements.volume.value) || 0));
    elements.volumeValue.textContent = Math.round(value);
    elements.volume.style.setProperty('--volume', value + '%');
    clearTimeout(volumeTimer);
    volumeTimer = setTimeout(function () { command('volume', value / 100); }, 70);
  });
  document.addEventListener('visibilitychange', function () { clearTimeout(pollTimer); pollTimer = setTimeout(poll, 80); });
  window.addEventListener('beforeunload', function () { if (artworkObjectUrl) URL.revokeObjectURL(artworkObjectUrl); });
  poll();
}());
