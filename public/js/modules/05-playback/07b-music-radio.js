'use strict';

var MUSIC_RADIO_FAVORITES_KEY = 'mineradio-music-radio-favorites-v1';
var MUSIC_RADIO_CATEGORIES = ['all', 'personal', 'scene', 'style', 'energy'];
var MUSIC_RADIO_MODES = [
  { id: 'personal', category: 'personal', kicker: 'FOR YOU', title: '私人漫游', sub: '常听歌手、本地收藏与新鲜旋律', terms: [], queries: ['华语流行热歌', '宝藏流行歌曲'], accent: '#7f91b3' },
  { id: 'heartbeat', category: 'personal', kicker: 'HEARTBEAT', title: '心动模式', sub: '喜欢过的旋律，混入相似惊喜', terms: ['喜欢', '收藏'], queries: ['治愈流行情歌', '宝藏情歌'], accent: '#c6798c' },
  { id: 'daily', category: 'personal', kicker: 'DAILY FLOW', title: '今日漫游', sub: '今天适合循环的流行歌曲', terms: [], queries: ['今日流行新歌', '热门华语歌曲'], accent: '#5f9e98' },
  { id: 'commute', category: 'scene', kicker: 'ON THE WAY', title: '通勤节拍', sub: '城市穿行时的稳定节奏', terms: ['流行', '节奏', '城市'], queries: ['通勤流行歌曲', '城市节奏音乐'], accent: '#bd8b58' },
  { id: 'late', category: 'scene', kicker: 'AFTER DARK', title: '深夜氛围', sub: '安静人声与有空间感的夜晚', terms: ['夜', '安静', '治愈'], queries: ['深夜安静歌曲', '夜晚治愈音乐'], accent: '#62718f' },
  { id: 'study', category: 'scene', kicker: 'FOCUS', title: '专注电台', sub: '少打扰的器乐、钢琴和轻节拍', terms: ['纯音乐', '钢琴', '轻音乐', 'instrumental'], queries: ['专注纯音乐', '钢琴轻音乐'], accent: '#759a85' },
  { id: 'morning', category: 'scene', kicker: 'GOOD MORNING', title: '清晨唤醒', sub: '明亮轻快的新一天开场', terms: ['清晨', '早晨', '阳光', '轻快'], queries: ['清晨轻快歌曲', '阳光流行音乐'], accent: '#bf9950' },
  { id: 'rain', category: 'scene', kicker: 'RAINY CAFE', title: '雨天咖啡馆', sub: '温暖松弛的旋律与爵士', terms: ['雨', '咖啡', '爵士', '慵懒'], queries: ['雨天咖啡馆音乐', '慵懒爵士歌曲'], accent: '#648ca1' },
  { id: 'roadtrip', category: 'scene', kicker: 'ROAD TRIP', title: '公路旅行', sub: '向远方行驶时适合一起唱', terms: ['旅行', '公路', '开车', '民谣'], queries: ['公路旅行歌曲', '开车民谣'], accent: '#a77b4d' },
  { id: 'sleep', category: 'scene', kicker: 'SLEEP TIGHT', title: '睡前轻音乐', sub: '舒缓器乐与安静旋律', terms: ['睡前', '舒缓', '钢琴', '纯音乐'], queries: ['睡前舒缓纯音乐', '安静钢琴曲'], accent: '#687594' },
  { id: 'chinese', category: 'style', kicker: 'MANDOPOP', title: '华语流行', sub: '熟悉表达与正在发生的新歌', terms: ['华语', '中文'], queries: ['华语流行热歌', '华语新歌'], accent: '#557f99' },
  { id: 'cantonese', category: 'style', kicker: 'CANTOPOP', title: '粤语金曲', sub: '港乐旋律、粤语新声与经典', terms: ['粤语', '港乐'], queries: ['粤语金曲', '港乐经典'], accent: '#a55f52' },
  { id: 'rock', category: 'style', kicker: 'ROCK', title: '摇滚现场', sub: '吉他、鼓点和直接的释放', terms: ['摇滚', 'rock', '乐队'], queries: ['华语摇滚歌曲', '摇滚乐队热歌'], accent: '#9e5548' },
  { id: 'folk', category: 'style', kicker: 'ACOUSTIC', title: '独立民谣', sub: '木吉他、故事感和不拥挤的人声', terms: ['民谣', '木吉他', '独立'], queries: ['独立民谣歌曲', '木吉他民谣'], accent: '#8f765f' },
  { id: 'anime', category: 'style', kicker: 'ANIME', title: '二次元', sub: '动画、虚拟歌姬与日系旋律', terms: ['动漫', '动画', '初音', 'anime', 'vocaloid'], queries: ['动漫歌曲 日系', '二次元音乐'], accent: '#a96f93' },
  { id: 'rnb', category: 'style', kicker: 'R&B', title: 'R&B 夜色', sub: '松弛律动与丝滑转音', terms: ['r&b', 'rnb', 'soul'], queries: ['R&B 华语歌曲', 'R&B Soul 热歌'], accent: '#7e8346' },
  { id: 'bgm', category: 'style', kicker: 'SOUNDTRACK', title: 'BGM 背景音乐', sub: '电影、动漫和游戏里的无歌词叙事', terms: ['bgm', '原声', 'ost', '纯音乐'], queries: ['电影原声 BGM', '动漫游戏原声'], accent: '#68717c' },
  { id: 'dj', category: 'energy', kicker: 'HOT DJ', title: '热门 DJ', sub: '只保留明确标注的 DJ 与混音版本', terms: ['dj', 'remix', 'mix', '串烧'], queries: ['热门 DJ 舞曲 Remix', '车载 DJ 串烧'], accent: '#4b8ba2' },
  { id: 'high', category: 'energy', kicker: 'HIGH ENERGY', title: '高燃模式', sub: '适合运动与快速回血的副歌', terms: ['高燃', '热血', '摇滚'], queries: ['高燃热血歌曲', '运动摇滚音乐'], accent: '#b24e52' },
  { id: 'game', category: 'energy', kicker: 'GAME ON', title: '游戏战歌', sub: '开局、团战和 Boss 时刻的推进感', terms: ['游戏', 'game', 'bgm', '电竞'], queries: ['游戏战歌 BGM', '电竞热血歌曲'], accent: '#4d8e91' },
  { id: 'nightrun', category: 'energy', kicker: 'NIGHT RUN', title: '城市夜跑', sub: '稳定拍点与电子律动', terms: ['夜跑', '运动', '跑步', '电子'], queries: ['夜跑电子音乐', '跑步节奏歌曲'], accent: '#47847a' }
];
var MUSIC_RADIO_NON_MUSIC_PATTERN = /(播客|电台节目|有声|朗读|朗诵|诵读|评书|相声|脱口秀|访谈|课程|语录|心理测试|睡眠故事|睡前故事|情感故事|助眠解压|掏耳|采耳|按摩|白噪音|冥想引导|asmr|audio\s*book|podcast)/i;
var MUSIC_RADIO_DJ_PATTERN = /(?:\bdj\b|dj\s*版|dj舞曲|remix|re-?mix|bootleg|mashup|dance\s*mix|club\s*mix|电子舞曲|混音|串烧|慢摇|车载\s*dj)/i;
var musicRadioState = { category: 'all', loadingId: '', requestToken: 0, buildingToken: 0, orderNonce: 0, open: false, previousFocus: null };
var musicRadioFavoriteIds = readMusicRadioFavorites();

function musicRadioNormalizeText(text) {
  if (typeof simpleSearchNorm === 'function') return simpleSearchNorm(text);
  return String(text || '').toLowerCase().replace(/[（(【\[].*?[）)】\]]/g, '').replace(/[\s·・,，。.!！?？'"“”‘’|\-_/]+/g, '');
}

function musicRadioModeById(id) {
  id = String(id || '');
  return MUSIC_RADIO_MODES.find(function (mode) { return mode.id === id; }) || null;
}

function normalizeMusicRadioFavorites(value) {
  var seen = Object.create(null);
  return (Array.isArray(value) ? value : []).map(String).filter(function (id) {
    if (!musicRadioModeById(id) || seen[id]) return false;
    seen[id] = true;
    return true;
  });
}

function readMusicRadioFavorites() {
  try { return normalizeMusicRadioFavorites(JSON.parse(localStorage.getItem(MUSIC_RADIO_FAVORITES_KEY) || '[]')); }
  catch (_) { return []; }
}

function saveMusicRadioFavorites() {
  try { localStorage.setItem(MUSIC_RADIO_FAVORITES_KEY, JSON.stringify(musicRadioFavoriteIds)); } catch (_) { }
}

function musicRadioSongIdentity(song) {
  if (!song) return '';
  var localId = song.localKey || song.localFileId || song.localPath || '';
  if (localId) return 'local|' + String(localId).toLowerCase();
  var provider = typeof songProviderKey === 'function' ? songProviderKey(song) : String(song.provider || song.source || song.type || '').toLowerCase();
  var remoteId = song.songmid || song.mid || song.id || song.hash || song.mediaMid || '';
  if (remoteId) return provider + '|' + String(remoteId);
  var title = musicRadioNormalizeText(song.name || song.title);
  var artist = musicRadioNormalizeText(song.artist || song.singer);
  return title && artist ? provider + '|' + title + '|' + artist : '';
}

function musicRadioCanonicalKey(song) {
  if (!song) return '';
  if (typeof searchCanonicalSongKey === 'function') return searchCanonicalSongKey(song);
  var title = musicRadioNormalizeText(song.name || song.title);
  var artist = musicRadioNormalizeText(song.artist || song.singer);
  return title && artist ? title + '|' + artist : '';
}

function isMusicRadioSong(song) {
  if (!song || song.type === 'podcast-radio' || song.radioId || song.programId) return false;
  var title = String(song.name || song.title || '').trim();
  var artist = String(song.artist || song.singer || '').trim();
  if (!title || !artist || !musicRadioSongIdentity(song)) return false;
  var combined = title + ' ' + artist + ' ' + String(song.album || song.albumName || '');
  if (MUSIC_RADIO_NON_MUSIC_PATTERN.test(combined)) return false;
  if (/^\s*\d{1,3}[.、]\s*/.test(title) || /第\s*\d+\s*(期|集|章)|\bEP\.?\s*\d+\b/i.test(title)) return false;
  if (title.length > 42 || (title.length > 12 && /[，,“”]/.test(title))) return false;
  return true;
}

function isMusicRadioDjSong(song) {
  if (!isMusicRadioSong(song)) return false;
  var title = String(song.name || song.title || '');
  var album = String(song.albumName || song.album || '');
  return MUSIC_RADIO_DJ_PATTERN.test(title) || MUSIC_RADIO_DJ_PATTERN.test(album);
}

function musicRadioModeAcceptsSong(mode, song) {
  return isMusicRadioSong(song) && (!mode || mode.id !== 'dj' || isMusicRadioDjSong(song));
}

function musicRadioUniqueSongs(songs, limit) {
  var providerSeen = Object.create(null);
  var canonicalSeen = Object.create(null);
  var out = [];
  (Array.isArray(songs) ? songs : []).forEach(function (song) {
    if (!isMusicRadioSong(song) || out.length >= limit) return;
    var providerKey = musicRadioSongIdentity(song);
    var canonicalKey = musicRadioCanonicalKey(song);
    if (!providerKey || providerSeen[providerKey] || (canonicalKey && canonicalSeen[canonicalKey])) return;
    providerSeen[providerKey] = true;
    if (canonicalKey) canonicalSeen[canonicalKey] = true;
    out.push(song);
  });
  return out;
}

function musicRadioSeedValue(text) {
  var value = 2166136261;
  String(text || '').split('').forEach(function (char) { value = Math.imul(value ^ char.charCodeAt(0), 16777619); });
  return value >>> 0;
}

function musicRadioShuffle(list, seedText) {
  var out = (Array.isArray(list) ? list : []).slice();
  var seed = musicRadioSeedValue(seedText) || 1;
  function next() { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; }
  for (var i = out.length - 1; i > 0; i--) {
    var j = Math.floor(next() * (i + 1));
    var swap = out[i]; out[i] = out[j]; out[j] = swap;
  }
  return out;
}

function musicRadioCandidateText(song) {
  return musicRadioNormalizeText([song && (song.name || song.title), song && (song.artist || song.singer), song && (song.albumName || song.album)].filter(Boolean).join(' '));
}

function musicRadioLocalPool() {
  var pool = [];
  function append(items) { if (Array.isArray(items)) pool = pool.concat(items); }
  append(typeof homeDiscoverState !== 'undefined' && homeDiscoverState && homeDiscoverState.songs);
  append(typeof playQueue !== 'undefined' && playQueue);
  append(typeof playlist !== 'undefined' && playlist);
  append(typeof persistentLocalLibraryTracks !== 'undefined' && persistentLocalLibraryTracks);
  if (typeof userPlaylists !== 'undefined' && Array.isArray(userPlaylists)) userPlaylists.forEach(function (item) { append(item && item.songs); });
  if (typeof localFilePlaylists !== 'undefined' && Array.isArray(localFilePlaylists)) localFilePlaylists.forEach(function (item) { append(item && item.songs); });
  append(typeof playlistPanelDetailState !== 'undefined' && playlistPanelDetailState && playlistPanelDetailState.tracks);
  return musicRadioUniqueSongs(pool, 120);
}

function musicRadioTopArtistName() {
  try {
    var summary = typeof homeListenSummary === 'function' ? homeListenSummary() : null;
    return String(summary && summary.topArtist && summary.topArtist.name || '').trim();
  } catch (_) { return ''; }
}

function musicRadioLocalSongs(mode) {
  var pool = musicRadioLocalPool().filter(function (song) { return musicRadioModeAcceptsSong(mode, song); });
  if (!mode) return pool;
  if (mode.id === 'heartbeat' && typeof isSongLiked === 'function') {
    var liked = pool.filter(function (song) { return isSongLiked(song); });
    if (liked.length) return liked.concat(pool.filter(function (song) { return !isSongLiked(song); }));
  }
  if (mode.category === 'personal') {
    var artist = musicRadioNormalizeText(musicRadioTopArtistName());
    if (artist) pool.sort(function (a, b) {
      return (musicRadioCandidateText(b).indexOf(artist) >= 0 ? 1 : 0) - (musicRadioCandidateText(a).indexOf(artist) >= 0 ? 1 : 0);
    });
    return pool;
  }
  var terms = (mode.terms || []).map(musicRadioNormalizeText).filter(Boolean);
  return terms.length ? pool.filter(function (song) {
    var text = musicRadioCandidateText(song);
    return terms.some(function (term) { return text.indexOf(term) >= 0; });
  }) : pool;
}

async function musicRadioSearchQuery(query) {
  if (typeof fetchMusicSearchResults !== 'function') return [];
  try {
    var result = await fetchMusicSearchResults(query, 'song', null);
    return result && Array.isArray(result.songs) ? result.songs : [];
  } catch (error) {
    console.warn('[MusicRadioSearch]', query, error && error.message || error);
    return [];
  }
}

function musicRadioQueries(mode) {
  var queries = (mode && mode.queries || []).slice();
  if (mode && mode.category === 'personal') {
    var artist = musicRadioTopArtistName();
    if (artist) queries.unshift(artist);
  }
  return queries.filter(function (query, index, all) { return query && all.indexOf(query) === index; }).slice(0, 2);
}

async function buildMusicRadioSongs(mode) {
  var local = musicRadioLocalSongs(mode);
  var queries = musicRadioQueries(mode);
  var searchReady = true;
  if (typeof activeSearchProvidersForMode === 'function') {
    try { searchReady = activeSearchProvidersForMode('song').length > 0; } catch (_) { searchReady = true; }
  }
  if (!local.length && queries.length && !searchReady) {
    throw new Error('当前没有可搜索的音乐来源，请先启用一个音乐目录');
  }
  var batches = searchReady ? await Promise.all(queries.map(musicRadioSearchQuery)) : [];
  var combined = local.slice();
  batches.forEach(function (songs) {
    combined = combined.concat(songs.filter(function (song) { return musicRadioModeAcceptsSong(mode, song); }));
  });
  var unique = musicRadioUniqueSongs(combined, 120).filter(function (song) { return musicRadioModeAcceptsSong(mode, song); });
  return musicRadioShuffle(unique, mode.id + '|queue|' + musicRadioState.orderNonce).slice(0, 48);
}

function musicRadioQueueSong(song, mode) {
  var queued = typeof cloneSong === 'function' ? cloneSong(song) : Object.assign({}, song);
  queued.radioModeId = mode.id;
  queued.radioModeName = mode.title;
  return queued;
}

function updateMusicRadioCategoryTabs() {
  document.querySelectorAll('[data-music-radio-category]').forEach(function (button) {
    var active = button.getAttribute('data-music-radio-category') === musicRadioState.category;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', active ? 'true' : 'false');
  });
}

function renderMusicRadioModes() {
  var root = document.getElementById('music-radio-grid');
  var status = document.getElementById('music-radio-status');
  if (!root) return;
  updateMusicRadioCategoryTabs();
  var modes = MUSIC_RADIO_MODES.filter(function (mode) { return musicRadioState.category === 'all' || mode.category === musicRadioState.category; });
  modes = musicRadioShuffle(modes, 'modes|' + musicRadioState.category + '|' + musicRadioState.orderNonce);
  modes.sort(function (a, b) {
    var ai = musicRadioFavoriteIds.indexOf(a.id);
    var bi = musicRadioFavoriteIds.indexOf(b.id);
    if (ai < 0 && bi < 0) return 0;
    if (ai < 0) return 1;
    if (bi < 0) return -1;
    return ai - bi;
  });
  root.innerHTML = modes.map(function (mode) {
    var loading = musicRadioState.loadingId === mode.id;
    var favorite = musicRadioFavoriteIds.indexOf(mode.id) >= 0;
    return '<article class="music-radio-mode' + (loading ? ' loading' : '') + (favorite ? ' favorite' : '') + '" style="--music-radio-accent:' + mode.accent + '">' +
      '<button class="music-radio-mode-main" type="button" onclick="playMusicRadioMode(\'' + mode.id + '\')" aria-label="播放' + escHtml(mode.title) + '电台">' +
      '<span class="music-radio-kicker">' + escHtml(mode.kicker) + '</span><span class="music-radio-play" aria-hidden="true">' + (loading ? '↻' : '▶') + '</span>' +
      '<strong>' + escHtml(mode.title) + '</strong><span class="music-radio-sub">' + escHtml(loading ? '正在整理可播放歌曲…' : mode.sub) + '</span></button>' +
      '<button class="music-radio-favorite' + (favorite ? ' active' : '') + '" type="button" onclick="toggleMusicRadioFavorite(\'' + mode.id + '\',event)" aria-pressed="' + (favorite ? 'true' : 'false') + '" aria-label="' + (favorite ? '取消收藏' : '收藏') + escHtml(mode.title) + '" title="' + (favorite ? '取消收藏' : '收藏并置顶') + '">' + (favorite ? '★' : '☆') + '</button></article>';
  }).join('');
  if (status) status.textContent = musicRadioState.loadingId
    ? '正在从可用音乐来源生成连续队列'
    : modes.length + ' 个模式 · 选择后生成最多 48 首连续播放队列';
}

function selectMusicRadioCategory(category) {
  category = String(category || '');
  if (MUSIC_RADIO_CATEGORIES.indexOf(category) < 0) return;
  musicRadioState.category = category;
  renderMusicRadioModes();
}

function refreshMusicRadioModes() {
  musicRadioState.orderNonce += 1;
  renderMusicRadioModes();
  if (typeof showToast === 'function') showToast('电台顺序已换一批');
}

function toggleMusicRadioFavorite(id, event) {
  if (event) { event.preventDefault(); event.stopPropagation(); }
  id = String(id || '');
  if (!musicRadioModeById(id)) return;
  var index = musicRadioFavoriteIds.indexOf(id);
  if (index >= 0) musicRadioFavoriteIds.splice(index, 1);
  else musicRadioFavoriteIds.unshift(id);
  musicRadioFavoriteIds = normalizeMusicRadioFavorites(musicRadioFavoriteIds);
  saveMusicRadioFavorites();
  renderMusicRadioModes();
  if (typeof showToast === 'function') showToast(index >= 0 ? '已取消收藏电台' : '已收藏电台并置顶');
}

function bindMusicRadioModal() {
  var mask = document.getElementById('music-radio-mask');
  if (!mask || mask.__musicRadioBound) return;
  mask.__musicRadioBound = true;
  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && musicRadioState.open) closeMusicRadio();
  });
}

function openMusicRadio(category) {
  bindMusicRadioModal();
  var mask = document.getElementById('music-radio-mask');
  if (!mask) return;
  musicRadioState.previousFocus = document.activeElement;
  musicRadioState.open = true;
  musicRadioState.category = MUSIC_RADIO_CATEGORIES.indexOf(String(category || '')) >= 0 ? String(category) : 'all';
  mask.classList.add('show');
  mask.setAttribute('aria-hidden', 'false');
  renderMusicRadioModes();
  setTimeout(function () {
    var active = mask.querySelector('[data-music-radio-category="' + musicRadioState.category + '"]');
    if (active) active.focus();
  }, 0);
}

function closeMusicRadio() {
  var mask = document.getElementById('music-radio-mask');
  if (musicRadioState.loadingId && musicRadioState.buildingToken === musicRadioState.requestToken) {
    musicRadioState.requestToken += 1;
    musicRadioState.buildingToken = 0;
    musicRadioState.loadingId = '';
  }
  musicRadioState.open = false;
  if (mask) {
    mask.classList.remove('show');
    mask.setAttribute('aria-hidden', 'true');
  }
  var previous = musicRadioState.previousFocus;
  musicRadioState.previousFocus = null;
  if (previous && previous.isConnected && typeof previous.focus === 'function') previous.focus();
}

async function playMusicRadioMode(id) {
  var mode = musicRadioModeById(id);
  if (!mode) return;
  var token = ++musicRadioState.requestToken;
  musicRadioState.buildingToken = token;
  musicRadioState.loadingId = mode.id;
  renderMusicRadioModes();
  try {
    var songs = await buildMusicRadioSongs(mode);
    if (token !== musicRadioState.requestToken) return;
    if (!songs.length) throw new Error('没有找到符合主题的可播放歌曲');
    musicRadioState.buildingToken = 0;
    var nextQueue = songs.map(function (song) { return musicRadioQueueSong(song, mode); });
    playQueue = nextQueue;
    currentIdx = 0;
    if (typeof safeRenderQueuePanel === 'function') safeRenderQueuePanel('music-radio-play', { scrollCurrent: true });
    if (typeof safeShelfRebuild === 'function') safeShelfRebuild('music-radio-play', true);
    if (typeof forcePlaybackControlsInteractive === 'function') forcePlaybackControlsInteractive();
    if (typeof setHomeControlsLocked === 'function') setHomeControlsLocked(false);
    if (typeof updateEmptyHomeVisibility === 'function') updateEmptyHomeVisibility();
    var started = await playQueueAt(0, {
      manual: true,
      suppressPlayFailureNotice: true,
      context: { type: 'music-radio', playlistName: mode.title + '电台' }
    });
    if (token !== musicRadioState.requestToken) return;
    if (started !== true) throw new Error('电台队列已生成，但第一首暂时无法播放');
    musicRadioState.loadingId = '';
    closeMusicRadio();
    if (typeof showToast === 'function') showToast(mode.title + ' · 已生成 ' + playQueue.length + ' 首');
  } catch (error) {
    if (token !== musicRadioState.requestToken) return;
    console.warn('[MusicRadioPlay]', error);
    if (typeof showToast === 'function') showToast(error && error.message || '电台暂时无法播放');
  } finally {
    if (musicRadioState.buildingToken === token) musicRadioState.buildingToken = 0;
    if (token === musicRadioState.requestToken) {
      musicRadioState.loadingId = '';
      renderMusicRadioModes();
    }
  }
}
