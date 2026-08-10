var NEXT_SHELL_ENABLED = true;
var nextShellQueueOpen = false;
var nextShellRenderKey = '';
var nextShellLastSongKey = '';
var nextShellTrackTransitionTimer = 0;
var nextShellView = 'album';

function shouldUseNextShellPlaybackSurface() {
  if (!NEXT_SHELL_ENABLED || !document.body || document.body.classList.contains('immersive-mode')) return false;
  return !!(Array.isArray(playQueue) && currentIdx >= 0 && currentIdx < playQueue.length && playQueue[currentIdx]);
}

function nextShellCurrentSong() {
  if (Array.isArray(playQueue) && currentIdx >= 0 && currentIdx < playQueue.length) return playQueue[currentIdx];
  return null;
}

function nextShellSubtitle(song) {
  if (!song) return '搜索、导入本地音乐，或从音乐库开始';
  return song.artist || song.singer || song.album || song.source || 'Mineradio';
}

function nextShellCover(song) {
  if (!song) return '';
  try { return songCoverSrc(song, 720) || song.cover || song.picUrl || ''; } catch (_error) { return song.cover || song.picUrl || ''; }
}

function nextShellSongKey(song, index) {
  if (!song) return 'empty-' + index;
  try { return queueItemKey(song) || String(index); } catch (_error) { return String(song.id || song.mid || song.name || index); }
}

function nextShellPlayQueueIndex(index) {
  if (!Array.isArray(playQueue) || !playQueue[index]) return;
  currentIdx = Math.max(0, Math.min(playQueue.length - 1, Number(index) || 0));
  homeForcedOpen = false;
  homeSuppressed = false;
  if (typeof forcePlaybackControlsInteractive === 'function') forcePlaybackControlsInteractive();
  Promise.resolve(playQueueAt(currentIdx, { manual: true, context: { type: 'next-shell', playlistName: 'Album Focus' } }))
    .catch(function (error) { console.warn('[NextShellPlay]', error); });
}

function nextShellOpenLibrary() {
  nextShellSetView('collection');
}

function nextShellShowAlbum() {
  if (typeof goHome === 'function') goHome();
  nextShellSetView('album');
}

function nextShellOpenFullLibrary() {
  if (typeof openHomeDashboardLibrary === 'function') openHomeDashboardLibrary();
  else if (typeof openHomeLibrary === 'function') openHomeLibrary();
}

function nextShellSetView(view) {
  nextShellView = view === 'collection' ? 'collection' : 'album';
  var stage = document.getElementById('next-album-stage');
  var desk = document.getElementById('next-collection-desk');
  if (stage) stage.hidden = nextShellView !== 'album';
  if (desk) desk.hidden = nextShellView !== 'collection';
  document.body.classList.toggle('next-shell-collection-active', nextShellView === 'collection');
  var rail = document.getElementById('next-shell-rail');
  if (rail) {
    var buttons = rail.querySelectorAll('button');
    buttons.forEach(function (button, index) { button.classList.toggle('is-active', (nextShellView === 'album' && index === 0) || (nextShellView === 'collection' && index === 1)); });
  }
  nextShellRenderKey = '';
  renderNextShell();
}

function nextShellToggleQueue(force) {
  nextShellQueueOpen = typeof force === 'boolean' ? force : !nextShellQueueOpen;
  var drawer = document.getElementById('next-shell-queue-drawer');
  var handle = document.getElementById('next-shell-queue-handle');
  if (drawer) {
    drawer.classList.toggle('is-open', nextShellQueueOpen);
    drawer.setAttribute('aria-hidden', nextShellQueueOpen ? 'false' : 'true');
  }
  if (handle) handle.setAttribute('aria-expanded', nextShellQueueOpen ? 'true' : 'false');
}

function nextShellRenderRows(target, songs, activeIndex, startIndex, className) {
  if (!target) return;
  if (!songs.length) {
    target.innerHTML = '<button class="next-shell-empty" type="button" onclick="runHomeSearch(\'\')">搜索或导入音乐</button>';
    return;
  }
  target.innerHTML = songs.map(function (song, offset) {
    var index = startIndex + offset;
    var active = index === activeIndex ? ' is-current' : '';
    var title = escHtml(song.name || song.title || '未知歌曲');
    var subtitle = escHtml(nextShellSubtitle(song));
    return '<button class="' + className + active + '" type="button" onclick="nextShellPlayQueueIndex(' + index + ')" aria-current="' + (active ? 'true' : 'false') + '">' +
      '<span>' + String(index + 1).padStart(2, '0') + '</span><strong>' + title + '</strong><small>' + subtitle + '</small></button>';
  }).join('');
}

function renderNextCollection(song) {
  var desk = document.getElementById('next-collection-desk');
  if (!desk) return;
  var clock = document.getElementById('next-collection-clock');
  if (clock) clock.textContent = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  var queue = Array.isArray(playQueue) ? playQueue.slice(0, 5) : [];
  var ribbon = document.getElementById('next-collection-ribbon');
  if (ribbon) {
    ribbon.innerHTML = queue.length ? queue.map(function (item, index) {
      var cover = nextShellCover(item);
      var style = cover ? ' style="background-image:url(&quot;' + escHtml(cssImageUrl(cover)) + '&quot;)"' : '';
      return '<button class="next-collection-record' + (index === currentIdx ? ' is-current' : '') + '" type="button" onclick="nextShellPlayQueueIndex(' + index + ')"' + style + '><span>' + escHtml(item.name || item.title || '未知歌曲') + '</span></button>';
    }).join('') : '<button class="next-collection-empty" type="button" onclick="nextShellOpenFullLibrary()">导入或搜索音乐，建立你的收藏</button>';
  }
  nextShellRenderRows(document.getElementById('next-collection-recent'), queue, currentIdx, 0, 'next-collection-row');
  var sources = document.getElementById('next-collection-sources');
  if (sources) {
    var active = String(searchMode || 'song').toLowerCase();
    var sourceNames = [['song', '综合搜索'], ['netease', '网易云'], ['qq', 'QQ 音乐'], ['kugou', '酷狗'], ['qishui', '汽水'], ['spotify', 'Spotify'], ['local', '本地音乐']];
    sources.innerHTML = sourceNames.map(function (entry) {
      var selected = active === entry[0] || (active === 'song' && entry[0] === 'song');
      return '<div><span>' + entry[1] + '</span><strong class="' + (selected ? 'is-active' : '') + '">' + (selected ? '当前' : '可用') + '</strong></div>';
    }).join('');
  }
}

function renderNextShell() {
  if (!NEXT_SHELL_ENABLED) return;
  document.body.classList.add('next-shell-enabled');
  var song = nextShellCurrentSong();
  var cover = document.getElementById('next-stage-cover');
  var kicker = document.getElementById('next-stage-kicker');
  var title = document.getElementById('next-stage-title');
  var artist = document.getElementById('next-stage-artist');
  var actions = document.getElementById('next-stage-actions');
  var queueCount = Array.isArray(playQueue) ? playQueue.length : 0;
  var songKey = nextShellSongKey(song, currentIdx);
  var key = [songKey, currentIdx, queueCount, playing ? 1 : 0].join('|');
  if (key === nextShellRenderKey) return;
  nextShellRenderKey = key;

  var stage = document.getElementById('next-album-stage');
  if (stage && nextShellLastSongKey && nextShellLastSongKey !== songKey) {
    stage.classList.remove('is-track-changing');
    void stage.offsetWidth;
    stage.classList.add('is-track-changing');
    clearTimeout(nextShellTrackTransitionTimer);
    nextShellTrackTransitionTimer = setTimeout(function () {
      if (stage) stage.classList.remove('is-track-changing');
    }, 360);
  }
  nextShellLastSongKey = songKey;

  if (cover) {
    var src = nextShellCover(song);
    cover.style.backgroundImage = src ? 'url("' + cssImageUrl(src) + '")' : '';
    cover.classList.toggle('is-empty', !src);
  }
  if (kicker) kicker.textContent = song ? ('NOW PLAYING · ' + (song.album || song.source || 'MINERADIO')) : 'ALBUM FOCUS · READY';
  if (title) title.textContent = song ? (song.name || song.title || '未知歌曲') : '从一首歌开始';
  if (artist) artist.textContent = nextShellSubtitle(song);
  if (actions) actions.hidden = !!song;

  var start = song ? Math.max(0, currentIdx - 1) : 0;
  var stageSongs = Array.isArray(playQueue) ? playQueue.slice(start, start + 5) : [];
  nextShellRenderRows(document.getElementById('next-stage-track-list'), stageSongs, currentIdx, start, 'next-stage-track');
  var queueStart = song ? Math.max(0, currentIdx + 1) : 0;
  var queueSongs = Array.isArray(playQueue) ? playQueue.slice(queueStart, queueStart + 9) : [];
  nextShellRenderRows(document.getElementById('next-shell-queue-list'), queueSongs, currentIdx, queueStart, 'next-shell-queue-row');

  var countText = queueCount + ' 首';
  var count = document.getElementById('next-shell-queue-count');
  var handleCount = document.getElementById('next-shell-queue-handle-count');
  if (count) count.textContent = countText;
  if (handleCount) handleCount.textContent = queueCount;
  var lyricTitle = document.getElementById('next-lyric-title');
  var lyricArtist = document.getElementById('next-lyric-artist');
  if (lyricTitle) lyricTitle.textContent = song ? (song.name || song.title || '未知歌曲') : '未选择歌曲';
  if (lyricArtist) lyricArtist.textContent = nextShellSubtitle(song);
  renderNextCollection(song);
}

var nextShellBaseRenderHomeDashboard = typeof renderHomeDashboard === 'function' ? renderHomeDashboard : null;
if (nextShellBaseRenderHomeDashboard) {
  renderHomeDashboard = function () {
    var result = nextShellBaseRenderHomeDashboard.apply(this, arguments);
    renderNextShell();
    return result;
  };
}

var nextShellBaseUpdateControlTrackInfo = typeof updateControlTrackInfo === 'function' ? updateControlTrackInfo : null;
if (nextShellBaseUpdateControlTrackInfo) {
  updateControlTrackInfo = function () {
    var result = nextShellBaseUpdateControlTrackInfo.apply(this, arguments);
    nextShellRenderKey = '';
    renderNextShell();
    return result;
  };
}

renderNextShell();
