'use strict';

const crypto = require('crypto');

const ALLOWED_PROVIDERS = new Set(['kw', 'mg']);
const CACHE_TTL_MS = 2 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 12000;
const searchCache = new Map();

function clampInteger(value, fallback, min, max) {
  const parsed = Number.parseInt(value, 10);
  return Math.min(max, Math.max(min, Number.isFinite(parsed) ? parsed : fallback));
}

function durationSeconds(value) {
  if (typeof value === 'string' && /^\d{1,3}:\d{1,2}$/.test(value.trim())) {
    const parts = value.trim().split(':').map(Number);
    return Math.max(0, parts[0] * 60 + parts[1]);
  }
  const parsed = Number(value) || 0;
  return Math.max(0, Math.round(parsed > 100000 ? parsed / 1000 : parsed));
}

function durationText(value) {
  const seconds = durationSeconds(value);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function artistNames(value) {
  if (!Array.isArray(value)) return String(value || '').trim();
  return value.map(item => item && (item.name || item.singerName)).filter(Boolean).join(' / ');
}

function kuwoCoverUrl(item) {
  let value = String(item.picUrl || item.pic || item.PIC || item.web_albumpic_short ||
    item.web_album_pic || item.albumpic || item.hts_MVPIC || item.MVPIC || '').trim();
  if (!value) return '';
  value = value.replace(/^https?:\/\/[^/]+\/star\/albumcover\/\d+\//i, '');
  value = value.replace(/^\d+\//, '');
  if (/^https?:\/\//i.test(value)) return value;
  return `https://img1.kuwo.cn/star/albumcover/500/${value.replace(/^\/+/, '')}`;
}

function normalizeKuwoSong(item) {
  item = item || {};
  const id = String(item.MUSICRID || item.musicrid || item.id || '').replace(/^MUSIC_/, '');
  const duration = durationSeconds(item.DURATION || item.duration);
  const cover = kuwoCoverUrl(item);
  return {
    id,
    mid: id,
    songmid: id,
    name: String(item.SONGNAME || item.songName || item.name || ''),
    artist: String(item.ARTIST || item.artist || ''),
    singer: String(item.ARTIST || item.artist || ''),
    album: String(item.ALBUM || item.album || ''),
    albumName: String(item.ALBUM || item.album || ''),
    albumId: String(item.ALBUMID || item.albumId || ''),
    cover,
    picUrl: cover,
    duration,
    interval: durationText(duration),
    additionalSourceCode: 'kw',
    provider: 'backup-source',
    source: 'backup-source',
    type: 'backup-source'
  };
}

function normalizeMiguSong(item) {
  item = item || {};
  const id = String(item.songId || item.id || '');
  const duration = durationSeconds(item.duration || item.length);
  const cover = String(item.img3 || item.img2 || item.img1 || item.picUrl || '');
  const artist = artistNames(item.singerList || item.singers || item.singer);
  return {
    id,
    mid: id,
    songmid: id,
    copyrightId: String(item.copyrightId || ''),
    name: String(item.name || item.songName || ''),
    artist,
    singer: artist,
    album: String(item.album || item.albumName || ''),
    albumName: String(item.album || item.albumName || ''),
    albumId: String(item.albumId || ''),
    cover,
    picUrl: cover,
    lrcUrl: String(item.lrcUrl || ''),
    mrcUrl: String(item.mrcurl || item.mrcUrl || ''),
    trcUrl: String(item.trcUrl || ''),
    duration,
    interval: durationText(duration),
    additionalSourceCode: 'mg',
    provider: 'backup-source',
    source: 'backup-source',
    type: 'backup-source'
  };
}

function retryableRequestError(error) {
  return /HTTP_(?:429|5\d\d)|abort|timeout|fetch|network|socket|ECONN|ENOTFOUND/i
    .test(String(error && (error.message || error)));
}

async function fetchJson(url, options) {
  options = options || {};
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== 'function') throw new Error('BACKUP_CATALOG_FETCH_UNAVAILABLE');
  const sleep = typeof options.sleep === 'function'
    ? options.sleep
    : delay => new Promise(resolve => setTimeout(resolve, delay));
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetchImpl(url, {
        signal: controller.signal,
        headers: Object.assign({
          'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          referer: new URL(url).origin + '/'
        }, options.headers || {})
      });
      if (!response.ok) throw new Error(`HTTP_${response.status}`);
      return await response.json();
    } catch (error) {
      lastError = error;
      if (!retryableRequestError(error) || attempt >= 2) throw error;
      await sleep(250 * (2 ** attempt));
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError || new Error('BACKUP_CATALOG_SEARCH_FAILED');
}

async function searchKuwo(query, limit, offset, options) {
  const page = Math.floor(offset / limit);
  const url = 'https://search.kuwo.cn/r.s?client=kt' +
    '&all=' + encodeURIComponent(query) +
    '&pn=' + page + '&rn=' + limit +
    '&uid=794762570&ver=kwplayer_ar_9.2.2.1&vipver=1&show_copyright_off=1' +
    '&newver=1&ft=music&cluster=0&strategy=2012&encoding=utf8&rformat=json&vermerge=1&mobi=1&issubtitle=1';
  const data = await fetchJson(url, options);
  const rows = Array.isArray(data.abslist) ? data.abslist : [];
  return {
    songs: rows.map(normalizeKuwoSong).filter(song => song.id && song.name),
    total: Number(data.TOTAL || data.total || 0) || 0
  };
}

async function searchMigu(query, limit, offset, options) {
  const page = Math.floor(offset / limit) + 1;
  const timestamp = String(Date.now());
  const deviceId = '963B7AA0D21511ED807EE5846EC87D20';
  const sign = crypto.createHash('md5')
    .update(`${query}6cdc72a439cef99a3418d2a78aa28c73yyapp2d16148780a1dcc7408e06336b98cfd50${deviceId}${timestamp}`)
    .digest('hex');
  const searchSwitch = encodeURIComponent(JSON.stringify({
    song: 1, album: 0, singer: 0, tagSong: 1, mvSong: 0,
    bestShow: 1, songlist: 0, lyricSong: 0
  }));
  const url = 'https://jadeite.migu.cn/music_search/v3/search/searchAll' +
    '?isCorrect=0&isCopyright=1&searchSwitch=' + searchSwitch +
    '&pageSize=' + limit + '&text=' + encodeURIComponent(query) +
    '&pageNo=' + page + '&sort=0&sid=USS';
  const data = await fetchJson(url, Object.assign({}, options, {
    headers: Object.assign({}, options && options.headers, {
      uiVersion: 'A_music_3.6.1', deviceId, timestamp, sign, channel: '0146921'
    })
  }));
  const resultData = data && data.songResultData || {};
  const groups = Array.isArray(resultData.resultList) ? resultData.resultList : [];
  const rows = groups.reduce((all, group) => all.concat(Array.isArray(group) ? group : []), []);
  return {
    songs: rows.filter(item => item && item.songId && item.copyrightId).map(normalizeMiguSong),
    total: Number(resultData.totalCount || resultData.total || 0) || 0
  };
}

async function searchBackupCatalog(provider, query, options) {
  provider = String(provider || '').trim().toLowerCase();
  if (!ALLOWED_PROVIDERS.has(provider)) throw new Error('BACKUP_CATALOG_PROVIDER_UNSUPPORTED');
  query = String(query || '').trim();
  const limit = clampInteger(options && options.limit, 12, 1, 30);
  const offset = clampInteger(options && options.offset, 0, 0, 100000);
  if (!query) return { ok: true, provider, songs: [], total: 0, offset, limit, nextOffset: offset, hasMore: false };

  const cacheKey = `${provider}|${limit}|${offset}|${query.toLowerCase()}`;
  const now = Date.now();
  const cached = searchCache.get(cacheKey);
  if (cached && now - cached.time < CACHE_TTL_MS) return cached.value;

  const result = provider === 'kw'
    ? await searchKuwo(query, limit, offset, options)
    : await searchMigu(query, limit, offset, options);
  const songs = result.songs.slice(0, limit);
  const nextOffset = songs.length ? offset + limit : offset;
  const value = {
    ok: true,
    provider,
    songs,
    total: result.total,
    offset,
    limit,
    nextOffset,
    hasMore: songs.length > 0 && (result.total ? nextOffset < result.total : songs.length >= limit)
  };
  searchCache.set(cacheKey, { time: now, value });
  if (searchCache.size > 80) searchCache.delete(searchCache.keys().next().value);
  return value;
}

function clearSearchCache() {
  searchCache.clear();
}

module.exports = {
  searchBackupCatalog,
  clearSearchCache,
  normalizeKuwoSong,
  normalizeMiguSong
};
