'use strict';

const crypto = require('crypto');

const SOURCE_ALIASES = Object.freeze({ netease: 'netease', wy: 'netease', qq: 'qq', tx: 'qq', kugou: 'kugou', kg: 'kugou' });

function sourceKey(value) {
  return SOURCE_ALIASES[String(value || '').trim().toLowerCase()] || '';
}

function firstUrl(value) {
  const match = String(value || '').match(/https?:\/\/[^\s"'<>]+/i);
  return match ? match[0].replace(/[),.，。]+$/, '') : '';
}

function playlistIdFromInput(input, provider) {
  const raw = String(input || '').trim();
  const candidates = [firstUrl(raw), raw].filter(Boolean);
  for (const value of candidates) {
    let match;
    if (provider === 'netease') match = value.match(/[?&]id=(\d{3,})/i) || value.match(/playlist\/(\d{3,})/i);
    if (provider === 'qq') match = value.match(/[?&](?:id|disstid|dissid)=(\d{3,})/i) || value.match(/(?:playlist|taoge)\/(\d{3,})/i);
    if (provider === 'kugou') match = value.match(/[?&](?:specialid|id)=(\d{3,})/i) || value.match(/special\/(?:single\/)?(\d{3,})/i);
    if (match && match[1]) return match[1];
    if (/^\d{3,}$/.test(value)) return value;
  }
  throw new Error('PLAYLIST_LINK_NOT_RECOGNIZED');
}

async function fetchJson(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', ...(options.headers || {}) }, signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP_${response.status}`);
    const text = (await response.text()).replace(/^\uFEFF/, '').trim();
    try { return JSON.parse(text); } catch (_) {
      const jsonp = text.match(/^[^(]+\((\{[\s\S]*\})\)\s*;?$/);
      if (jsonp) return JSON.parse(jsonp[1]);
      throw new Error('PLAYLIST_RESPONSE_INVALID');
    }
  } finally { clearTimeout(timer); }
}

function singerText(value) {
  return Array.isArray(value) ? value.map(item => typeof item === 'string' ? item : item && item.name).filter(Boolean).join(', ') : String(value || '');
}

function durationText(seconds) {
  seconds = Math.max(0, Math.round(Number(seconds) || 0));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function uniqueSongs(songs) {
  const seen = new Set();
  return (songs || []).filter(song => {
    if (!song || !song.id || !song.name) return false;
    const key = `${song.source}|${song.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function playlistFingerprint(playlist) {
  const songs = Array.isArray(playlist && playlist.songs) ? playlist.songs : [];
  const identities = songs.map(song => [
    String(song && (song.source || song.provider) || ''),
    String(song && (song.id || song.songmid || song.hash || song.FileHash) || ''),
  ].join('|'));
  return crypto.createHash('sha1')
    .update([String(playlist && playlist.id || ''), ...identities].join('\n'))
    .digest('hex')
    .slice(0, 16);
}

async function importNetease(id) {
  const data = await fetchJson(`https://music.163.com/api/v6/playlist/detail?id=${encodeURIComponent(id)}&n=10000&s=0`, { headers: { referer: 'https://music.163.com/' } });
  const list = data.playlist || data.result;
  if (!list) throw new Error('NETEASE_PLAYLIST_UNAVAILABLE');
  const songs = uniqueSongs((list.tracks || []).map(item => {
    const artists = singerText(item.ar || item.artists) || '未知歌手';
    const album = item.al || item.album || {};
    return { id: String(item.id || ''), songmid: String(item.id || ''), name: item.name || '', singer: artists, artist: artists, albumName: album.name || '', albumId: String(album.id || ''), picUrl: album.picUrl || '', interval: durationText((item.dt || item.duration || 0) / 1000), source: 'netease', provider: 'netease', types: ['flac', '320k', '128k'] };
  }));
  if (!songs.length) throw new Error('NETEASE_PLAYLIST_EMPTY');
  return { id: `link_netease_${id}`, provider: 'netease', name: list.name || `网易云歌单 ${id}`, cover: list.coverImgUrl || '', creator: list.creator && list.creator.nickname || '网易云音乐', songs };
}

async function importQQ(id) {
  const data = await fetchJson('https://c.y.qq.com/qzone/fcg-bin/fcg_ucc_getcdinfo_byids_cp.fcg?type=1&json=1&utf8=1&onlysong=0&format=json&disstid=' + encodeURIComponent(id), { headers: { referer: 'https://y.qq.com/' } });
  const list = (data.cdlist || [])[0] || {};
  const songs = uniqueSongs((list.songlist || []).map(item => {
    const album = item.album || {};
    const mid = item.songmid || item.mid || item.songid || item.id || '';
    const artists = singerText(item.singer) || '未知歌手';
    return { id: String(item.songid || item.id || mid), songmid: String(mid), mid: String(mid), name: item.songname || item.name || '', singer: artists, artist: artists, albumName: album.name || item.albumname || '', albumId: String(album.id || item.albummid || ''), albumMid: album.mid || item.albummid || '', strMediaMid: item.strMediaMid || item.media_mid || '', picUrl: album.mid ? `https://y.gtimg.cn/music/photo_new/T002R500x500M000${album.mid}.jpg` : '', interval: durationText(item.interval), source: 'qq', provider: 'qq', types: ['flac', '320k', '128k'] };
  }));
  if (!songs.length) throw new Error('QQ_PLAYLIST_EMPTY');
  return { id: `link_qq_${id}`, provider: 'qq', name: list.dissname || list.name || `QQ 歌单 ${id}`, cover: list.logo || '', creator: list.nickname || list.username || 'QQ 音乐', songs };
}

async function importKugou(id) {
  const data = await fetchJson('https://mobilecdn.kugou.com/api/v3/special/song?specialid=' + encodeURIComponent(id) + '&pagesize=500&page=1', { headers: { referer: 'https://www.kugou.com/' } });
  const info = data.info || {};
  const songs = uniqueSongs((data.data && data.data.info || []).map(item => {
    const name = item.filename ? String(item.filename).replace(/^.*?-\s*/, '') : (item.songname || item.name || '');
    const artist = item.singername || item.singer || '未知歌手';
    const hash = item.hash || item.FileHash || '';
    return { id: String(hash), songmid: String(hash), name, singer: artist, artist, albumName: item.album_name || item.albumname || '', albumId: String(item.album_id || item.albumid || ''), hash, FileHash: hash, picUrl: item.imgurl || item.pic || '', interval: durationText(item.duration), source: 'kugou', provider: 'kugou', types: ['flac', '320k', '128k'] };
  }));
  if (!songs.length) throw new Error('KUGOU_PLAYLIST_EMPTY');
  return { id: `link_kugou_${id}`, provider: 'kugou', name: info.specialname || info.name || `酷狗歌单 ${id}`, cover: info.imgurl || info.pic || '', creator: info.nickname || '酷狗音乐', songs };
}

async function importPlaylistLink(input, preferredSource) {
  const provider = sourceKey(preferredSource);
  if (!provider) throw new Error('PLAYLIST_PROVIDER_REQUIRED');
  const id = playlistIdFromInput(input, provider);
  const result = provider === 'netease' ? await importNetease(id) : (provider === 'qq' ? await importQQ(id) : await importKugou(id));
  return { ok: true, playlist: { ...result, source: 'local', importedProvider: result.provider, sourceInput: String(input || '').trim(), trackCount: result.songs.length, importedAt: Date.now(), fingerprint: playlistFingerprint(result) } };
}

module.exports = { importPlaylistLink, playlistFingerprint, playlistIdFromInput, sourceKey };
