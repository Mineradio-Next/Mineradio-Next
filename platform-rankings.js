'use strict';

const RANKING_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const RANKING_REQUEST_TIMEOUT_MS = 16000;
const RANKING_PROVIDER_KEYS = ['netease', 'qq', 'kugou', 'kuwo', 'migu'];
const RANKING_PROVIDER_META = Object.freeze({
  netease: { label: '网易云', chartTitle: '网易云热歌榜' },
  qq: { label: 'QQ', chartTitle: 'QQ 流行指数榜' },
  kugou: { label: '酷狗', chartTitle: '酷狗 TOP 榜' },
  kuwo: { label: '酷我', chartTitle: '酷我热歌榜' },
  migu: { label: '咪咕', chartTitle: '咪咕热歌榜' },
  all: { label: '综合', chartTitle: '平台热歌综合榜' },
});

function clampInteger(value, fallback, min, max) {
  const parsed = Number.parseInt(value, 10);
  return Math.min(max, Math.max(min, Number.isFinite(parsed) ? parsed : fallback));
}

function durationMs(value) {
  const number = Number(value) || 0;
  if (!number) return 0;
  return Math.max(0, Math.round(number < 10000 ? number * 1000 : number));
}

function durationText(value) {
  const seconds = Math.max(0, Math.round(durationMs(value) / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function artistText(value) {
  if (!Array.isArray(value)) return String(value || '').trim();
  return value.map(item => item && (item.name || item.singerName)).filter(Boolean).join(' / ');
}

function decodeHtmlText(value) {
  return String(value || '')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .trim();
}

function normalizeRankingText(value) {
  return String(value || '').normalize('NFKC').toLowerCase()
    .replace(/&amp;/g, '&')
    .replace(/[（(【\[].*?[）)】\]]/g, '')
    .replace(/[\s·・,，。.!！?？'"“”‘’|\-_/\\]+/g, '');
}

function rankingSongContentKey(song) {
  return `${normalizeRankingText(song && (song.name || song.title))}|${normalizeRankingText(song && (song.artist || song.singer))}`;
}

function normalizeNeteaseRankingSong(item) {
  item = item || {};
  const album = item.al || item.album || {};
  const rawArtists = item.ar || item.artists || [];
  const artists = rawArtists.map(artist => ({ id: artist && artist.id, name: artist && artist.name || '' })).filter(artist => artist.name);
  return {
    provider: 'netease',
    source: 'netease',
    type: 'song',
    id: item.id,
    name: item.name || '',
    artist: artists.map(artist => artist.name).join(' / '),
    singer: artists.map(artist => artist.name).join(' / '),
    artists,
    artistId: artists[0] && artists[0].id,
    album: album.name || '',
    albumName: album.name || '',
    albumId: album.id || '',
    cover: album.picUrl || '',
    picUrl: album.picUrl || '',
    duration: durationMs(item.dt == null ? item.duration : item.dt),
    popularity: Number(item.pop || item.popularity || 0) || 0,
    fee: item.fee,
  };
}

function normalizeQQRankingSong(raw) {
  const item = raw && raw.data || raw || {};
  const rawArtists = item.singer || item.singers || [];
  const artists = rawArtists.map(artist => ({
    id: artist && artist.id,
    mid: artist && artist.mid,
    name: artist && (artist.name || artist.title) || '',
  })).filter(artist => artist.name);
  const album = item.album || {};
  const mid = item.songmid || item.mid || '';
  const albumMid = item.albummid || album.mid || '';
  const mediaMid = item.strMediaMid || item.file && item.file.media_mid || item.media_mid || mid;
  return {
    provider: 'qq',
    source: 'qq',
    type: 'qq',
    id: mid || String(item.songid || item.id || ''),
    qqId: item.songid || item.id || '',
    mid,
    songmid: mid,
    mediaMid,
    name: item.songname || item.title || item.name || '',
    artist: artists.map(artist => artist.name).join(' / ') || item.singername || '',
    singer: artists.map(artist => artist.name).join(' / ') || item.singername || '',
    artists,
    artistId: artists[0] && (artists[0].id || artists[0].mid),
    artistMid: artists[0] && artists[0].mid,
    album: item.albumname || album.name || album.title || '',
    albumName: item.albumname || album.name || album.title || '',
    albumMid,
    cover: albumMid ? `https://y.gtimg.cn/music/photo_new/T002R500x500M000${albumMid}.jpg` : '',
    picUrl: albumMid ? `https://y.gtimg.cn/music/photo_new/T002R500x500M000${albumMid}.jpg` : '',
    duration: durationMs(item.interval),
    fee: item.pay && Number(item.pay.pay_play) ? 1 : 0,
    playable: false,
  };
}

function normalizeKugouRankingSong(item) {
  item = item || {};
  const hash = String(item.Hash || item.hash || item.FileHash || '').trim();
  const artist = decodeHtmlText(item.author_name || item.singername || item.SingerName || '');
  const fileName = decodeHtmlText(item.FileName || item.filename || item.songname || item.SongName || '');
  let name = fileName;
  const prefix = artist ? `${artist} - ` : '';
  if (prefix && fileName.startsWith(prefix)) name = fileName.slice(prefix.length);
  else if (fileName.includes(' - ')) name = fileName.split(' - ').slice(1).join(' - ');
  const rawCover = String(
    item.Image || item.AlbumImage || item.cover || item.pic || item.album_img || item.sizable_cover || item.imgUrl ||
    item.trans_param && item.trans_param.union_cover || ''
  ).replace(/\{size\}/g, '400');
  return {
    provider: 'kugou',
    source: 'kugou',
    type: 'kugou',
    id: String(item.audio_id || item.Audioid || item.album_audio_id || hash),
    mid: String(item.audio_id || item.Audioid || item.album_audio_id || hash),
    songmid: String(item.audio_id || item.Audioid || item.album_audio_id || hash),
    hash,
    FileHash: hash,
    fileHash: hash,
    name,
    artist,
    singer: artist,
    album: decodeHtmlText(item.album_name || item.AlbumName || ''),
    albumName: decodeHtmlText(item.album_name || item.AlbumName || ''),
    albumId: String(item.album_id || item.AlbumID || ''),
    cover: rawCover,
    picUrl: rawCover,
    duration: durationMs(item.timeLen || item.Duration || item.duration),
    interval: durationText(item.timeLen || item.Duration || item.duration),
    playable: false,
  };
}

async function fetchKugouRankingSongDetail(song, options) {
  if (!song || !song.hash) return song;
  const target = `https://m.kugou.com/app/i/getSongInfo.php?cmd=playInfo&hash=${encodeURIComponent(song.hash)}`;
  const requestOptions = Object.assign({}, options, { headers: { referer: 'https://www.kugou.com/' } });
  const detail = options && typeof options.requestJson === 'function'
    ? await options.requestJson(target, requestOptions)
    : await fetchJson(target, requestOptions);
  const enriched = normalizeKugouRankingSong(Object.assign({}, detail || {}, {
    Hash: song.hash,
    FileName: detail && (detail.fileName || detail.FileName) || `${song.artist} - ${song.name}`,
    author_name: detail && (detail.author_name || detail.singerName) || song.artist,
    album_name: detail && (detail.album_name || detail.albumName) || song.album,
    timeLen: detail && (detail.timeLength || detail.timeLen) || song.duration,
  }));
  return Object.assign({}, song, enriched, {
    name: song.name,
    artist: song.artist,
    singer: song.singer,
    cover: enriched.cover || song.cover || '',
    picUrl: enriched.picUrl || song.picUrl || '',
  });
}

async function enrichKugouRankingCovers(songs, options) {
  const output = Array.isArray(songs) ? songs.slice() : [];
  const concurrency = Math.max(1, Math.min(8, Number(options && options.kugouDetailConcurrency) || 6));
  let cursor = 0;
  async function worker() {
    while (cursor < output.length) {
      const index = cursor;
      cursor += 1;
      if (!output[index] || output[index].cover) continue;
      try {
        output[index] = await fetchKugouRankingSongDetail(output[index], options);
      } catch (_) {
        // Ranking text remains usable when an individual cover lookup fails.
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, output.length) }, worker));
  return output;
}

function kuwoCoverUrl(value) {
  value = String(value || '').trim();
  if (!value) return '';
  if (/^https?:\/\//i.test(value)) return value;
  value = value.replace(/^\/+/, '').replace(/^\d+\//, '');
  return `https://img1.kuwo.cn/star/albumcover/500/${value}`;
}

function normalizeKuwoRankingSong(item) {
  item = item || {};
  const id = String(item.id || item.musicrid || item.MUSICRID || '').replace(/^MUSIC_/, '');
  const artist = decodeHtmlText(item.artist || item.artist_name || item.ARTIST || '');
  const cover = kuwoCoverUrl(item.pic || item.picUrl || item.PIC || item.web_albumpic_short || '');
  return {
    id,
    mid: id,
    songmid: id,
    name: decodeHtmlText(item.name || item.songName || item.SONGNAME || ''),
    artist,
    singer: artist,
    album: decodeHtmlText(item.albumName || item.album_name || item.ALBUM || ''),
    albumName: decodeHtmlText(item.albumName || item.album_name || item.ALBUM || ''),
    albumId: String(item.albumId || item.ALBUMID || ''),
    cover,
    picUrl: cover,
    duration: durationMs(item.duration || item.DURATION),
    interval: durationText(item.duration || item.DURATION),
    additionalSourceCode: 'kw',
    provider: 'backup-source',
    source: 'backup-source',
    type: 'backup-source',
  };
}

function normalizeMiguRankingSong(item) {
  item = item || {};
  const id = String(item.resId || item.contentId || item.songId || item.id || '');
  const artist = artistText(item.singerList || item.singers || item.txt2 || item.singer || '');
  const cover = String(item.img || item.img3 || item.img2 || item.img1 || item.picUrl || '');
  return {
    id,
    mid: id,
    songmid: id,
    copyrightId: String(item.copyrightId || ''),
    name: String(item.txt || item.songName || item.name || ''),
    artist,
    singer: artist,
    album: String(item.txt3 || item.album || item.albumName || ''),
    albumName: String(item.txt3 || item.album || item.albumName || ''),
    albumId: String(item.albumId || ''),
    cover,
    picUrl: cover,
    duration: durationMs(item.duration || item.length),
    interval: durationText(item.duration || item.length),
    additionalSourceCode: 'mg',
    provider: 'backup-source',
    source: 'backup-source',
    type: 'backup-source',
  };
}

async function fetchResponse(targetUrl, options) {
  options = options || {};
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== 'function') throw new Error('PLATFORM_RANKING_FETCH_UNAVAILABLE');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Number(options.timeoutMs) || RANKING_REQUEST_TIMEOUT_MS);
  try {
    const response = await fetchImpl(targetUrl, {
      method: options.method || 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: Object.assign({
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        referer: new URL(targetUrl).origin + '/',
      }, options.headers || {}),
    });
    if (!response || !response.ok) throw new Error(`HTTP_${response && response.status || 0}`);
    return response;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchJson(targetUrl, options) {
  return (await fetchResponse(targetUrl, options)).json();
}

async function fetchText(targetUrl, options) {
  return (await fetchResponse(targetUrl, options)).text();
}

async function fetchNeteaseRanking(limit, options) {
  const endpoints = [
    'https://music.163.com/api/playlist/detail?id=3778678',
    'https://music.163.com/api/v6/playlist/detail?id=3778678',
  ];
  let lastError;
  for (const endpoint of endpoints) {
    try {
      const data = await fetchJson(endpoint, Object.assign({}, options, { headers: { referer: 'https://music.163.com/' } }));
      const rows = data && data.playlist && data.playlist.tracks || data && data.result && data.result.tracks || [];
      const songs = rows.map(normalizeNeteaseRankingSong).filter(song => song.id && song.name);
      if (songs.length) return songs.slice(0, limit);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error('NETEASE_RANKING_EMPTY');
}

async function fetchQQRanking(limit, options) {
  const target = 'https://c.y.qq.com/v8/fcg-bin/fcg_v8_toplist_cp.fcg' +
    `?topid=26&page=detail&type=top&song_begin=0&song_num=${limit}&g_tk=5381&format=json`;
  const data = await fetchJson(target, Object.assign({}, options, {
    headers: { referer: 'https://y.qq.com/n/ryqq/toplist/26' },
  }));
  return (data && data.songlist || []).map(normalizeQQRankingSong).filter(song => song.id && song.name).slice(0, limit);
}

async function fetchKugouRanking(limit, options) {
  const songs = [];
  const seen = new Set();
  const pages = Math.max(1, Math.ceil(limit / 22));
  for (let page = 1; page <= pages && songs.length < limit; page += 1) {
    const html = await fetchText(`https://www.kugou.com/yy/rank/home/${page}-8888.html`, Object.assign({}, options, {
      headers: { referer: 'https://www.kugou.com/yy/html/rank.html' },
    }));
    const match = html.match(/global\.features\s*=\s*(\[[\s\S]*?\]);/i);
    if (!match) continue;
    let rows = [];
    try { rows = JSON.parse(match[1]); } catch (_) { rows = []; }
    rows.forEach(item => {
      const song = normalizeKugouRankingSong(item);
      if (!song.hash || !song.name || seen.has(song.hash) || songs.length >= limit) return;
      seen.add(song.hash);
      songs.push(song);
    });
  }
  return enrichKugouRankingCovers(songs, options);
}

function splitTopLevelArguments(text) {
  const output = [];
  let start = 0;
  let depth = 0;
  let quote = '';
  let escaped = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = '';
      continue;
    }
    if (char === '"' || char === "'") quote = char;
    else if (char === '(' || char === '[' || char === '{') depth += 1;
    else if (char === ')' || char === ']' || char === '}') depth -= 1;
    else if (char === ',' && depth === 0) {
      output.push(text.slice(start, index).trim());
      start = index + 1;
    }
  }
  output.push(text.slice(start).trim());
  return output;
}

function decodeNuxtToken(token, argumentMap) {
  token = String(token || '').trim();
  if (Object.prototype.hasOwnProperty.call(argumentMap, token) && argumentMap[token] !== token) {
    return decodeNuxtToken(argumentMap[token], argumentMap);
  }
  if (/^"(?:\\.|[^"\\])*"$/.test(token)) {
    try { return JSON.parse(token); } catch (_) { return ''; }
  }
  return '';
}

function extractKuwoRankingRows(html, limit) {
  const match = String(html || '').match(/<script>\s*window\.__NUXT__=([\s\S]*?)<\/script>/i);
  if (!match) return [];
  const expression = match[1].trim().replace(/;$/, '');
  const functionMatch = expression.match(/^\(function\(([^)]*)\)\{([\s\S]*)\}\(([\s\S]*)\)\)$/);
  if (!functionMatch) return [];
  const parameters = functionMatch[1].split(',').map(value => value.trim());
  const argumentsList = splitTopLevelArguments(functionMatch[3]);
  const argumentMap = Object.create(null);
  parameters.forEach((parameter, index) => { argumentMap[parameter] = argumentsList[index]; });
  const rows = [];
  const rowPattern = /\w+\[\d+\]=\{id:(\d+),name:([^,]+),pic:("(?:\\.|[^"\\])*"|[^,]+),album_name:([^,]+),artist_name:("(?:\\.|[^"\\])*"|[^,]+)/g;
  let rowMatch;
  while ((rowMatch = rowPattern.exec(functionMatch[2])) && rows.length < limit) {
    rows.push({
      id: rowMatch[1],
      name: decodeNuxtToken(rowMatch[2], argumentMap),
      pic: decodeNuxtToken(rowMatch[3], argumentMap),
      albumName: decodeNuxtToken(rowMatch[4], argumentMap),
      artist: decodeNuxtToken(rowMatch[5], argumentMap),
    });
  }
  return rows;
}

async function fetchKuwoRanking(limit, options) {
  const html = await fetchText('https://m.kuwo.cn/newh5app/ranklist_detail/16', Object.assign({}, options, {
    headers: { referer: 'https://m.kuwo.cn/newh5app/ranklist' },
  }));
  return extractKuwoRankingRows(html, limit).map(normalizeKuwoRankingSong).filter(song => song.id && song.name);
}

async function fetchMiguRanking(limit, options) {
  const target = `https://app.c.nf.migu.cn/bmw/vip-exclusive/auditions-list/v1.0?pageSize=${limit}`;
  const data = await fetchJson(target, Object.assign({}, options, {
    headers: { referer: 'https://m.music.migu.cn/v5/' },
  }));
  const rows = Array.isArray(data && data.data) ? data.data : data && data.data && data.data.contents || [];
  return rows.map(normalizeMiguRankingSong).filter(song => song.id && song.name).slice(0, limit);
}

const DEFAULT_RANKING_ADAPTERS = Object.freeze({
  netease: fetchNeteaseRanking,
  qq: fetchQQRanking,
  kugou: fetchKugouRanking,
  kuwo: fetchKuwoRanking,
  migu: fetchMiguRanking,
});

function decorateRankingSongs(provider, songs, limit) {
  const seenIds = new Set();
  return (songs || []).filter(song => {
    if (!song || !song.name) return false;
    const idKey = `${provider}|${song.id || song.mid || song.hash || ''}|${rankingSongContentKey(song)}`;
    if (seenIds.has(idKey)) return false;
    seenIds.add(idKey);
    return true;
  }).slice(0, limit).map((song, index) => Object.assign({}, song, {
    rank: index + 1,
    rankChange: null,
    rankingProvider: provider,
  }));
}

function mixPlatformRankings(results, limit) {
  const output = [];
  const seen = new Set();
  let row = 0;
  while (output.length < limit) {
    let inspected = false;
    results.forEach(result => {
      const song = result && result.songs && result.songs[row];
      if (!song || output.length >= limit) return;
      inspected = true;
      const key = rankingSongContentKey(song);
      if (!key || seen.has(key)) return;
      seen.add(key);
      output.push(Object.assign({}, song, { rank: output.length + 1, rankChange: null }));
    });
    row += 1;
    if (!inspected) break;
  }
  return output;
}

function createPlatformRankingService(options) {
  options = options || {};
  const now = typeof options.now === 'function' ? options.now : Date.now;
  const adapters = Object.assign({}, DEFAULT_RANKING_ADAPTERS, options.adapters || {});
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const requestJson = typeof options.requestJson === 'function' ? options.requestJson : null;
  const cacheTtlMs = Number(options.cacheTtlMs) || RANKING_CACHE_TTL_MS;
  const cache = new Map();
  const inFlight = new Map();

  async function loadProvider(provider, forceRefresh) {
    const currentTime = now();
    const cached = cache.get(provider);
    if (!forceRefresh && cached && currentTime - cached.updatedAt < cacheTtlMs) {
      return Object.assign({}, cached, { cached: true });
    }
    if (inFlight.has(provider)) return inFlight.get(provider);
    const request = Promise.resolve().then(async () => {
      const adapter = adapters[provider];
      if (typeof adapter !== 'function') throw new Error('PLATFORM_RANKING_PROVIDER_UNSUPPORTED');
      const songs = decorateRankingSongs(provider, await adapter(50, { fetchImpl, requestJson }), 50);
      if (!songs.length) throw new Error(`${provider.toUpperCase()}_RANKING_EMPTY`);
      const value = {
        provider,
        providerLabel: RANKING_PROVIDER_META[provider].label,
        chartTitle: RANKING_PROVIDER_META[provider].chartTitle,
        songs,
        updatedAt: now(),
        cached: false,
      };
      cache.set(provider, value);
      return value;
    }).finally(() => {
      inFlight.delete(provider);
    });
    inFlight.set(provider, request);
    return request;
  }

  async function getRankings(requestedProvider, requestedLimit, forceRefresh) {
    const provider = RANKING_PROVIDER_KEYS.includes(String(requestedProvider || '').toLowerCase())
      ? String(requestedProvider).toLowerCase()
      : 'all';
    const limit = clampInteger(requestedLimit, 30, 1, 50);
    if (provider !== 'all') {
      const result = await loadProvider(provider, !!forceRefresh);
      return Object.assign({}, result, {
        ok: true,
        partial: false,
        songs: result.songs.slice(0, limit),
        providers: [{ provider, ok: true, count: result.songs.length }],
      });
    }

    const settled = await Promise.allSettled(RANKING_PROVIDER_KEYS.map(key => loadProvider(key, !!forceRefresh)));
    const available = [];
    const providers = settled.map((entry, index) => {
      const key = RANKING_PROVIDER_KEYS[index];
      if (entry.status === 'fulfilled') {
        available.push(entry.value);
        return { provider: key, label: RANKING_PROVIDER_META[key].label, ok: true, count: entry.value.songs.length };
      }
      return {
        provider: key,
        label: RANKING_PROVIDER_META[key].label,
        ok: false,
        count: 0,
        error: String(entry.reason && entry.reason.message || entry.reason || 'PLATFORM_RANKING_FAILED'),
      };
    });
    const songs = mixPlatformRankings(available, limit);
    if (!songs.length) {
      const error = new Error('PLATFORM_RANKINGS_UNAVAILABLE');
      error.providers = providers;
      throw error;
    }
    return {
      ok: true,
      provider: 'all',
      providerLabel: RANKING_PROVIDER_META.all.label,
      chartTitle: RANKING_PROVIDER_META.all.chartTitle,
      songs,
      providers,
      partial: available.length !== RANKING_PROVIDER_KEYS.length,
      cached: available.every(result => result.cached),
      updatedAt: Math.max.apply(Math, available.map(result => result.updatedAt)),
    };
  }

  return {
    getRankings,
    clearCache() { cache.clear(); },
    cache,
    inFlight,
  };
}

const defaultService = createPlatformRankingService();

module.exports = {
  RANKING_CACHE_TTL_MS,
  RANKING_PROVIDER_KEYS,
  RANKING_PROVIDER_META,
  createPlatformRankingService,
  getPlatformRankings: defaultService.getRankings,
  mixPlatformRankings,
  rankingSongContentKey,
  normalizeNeteaseRankingSong,
  normalizeQQRankingSong,
  normalizeKugouRankingSong,
  enrichKugouRankingCovers,
  normalizeKuwoRankingSong,
  normalizeMiguRankingSong,
  extractKuwoRankingRows,
  _defaultService: defaultService,
};
