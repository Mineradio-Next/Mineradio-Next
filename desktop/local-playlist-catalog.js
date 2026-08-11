const fs = require('fs');
const path = require('path');

const LOCAL_PLAYLIST_CATALOG_VERSION = 1;
const LOCAL_PLAYLIST_CATALOG_FILE = 'local-playlists.json';
const MAX_CATALOG_BYTES = 64 * 1024 * 1024;
const MAX_PLAYLISTS = 2000;
const MAX_TRACKS = 50000;
const TRACK_STRING_FIELDS = [
  'id', 'songmid', 'mid', 'name', 'title', 'singer', 'artist', 'albumName', 'album', 'albumId',
  'interval', 'duration', 'source', 'provider', 'type', 'additionalSourceCode', 'picUrl', 'cover',
  'hash', 'FileHash', 'fileHash', 'strMediaMid', 'albumMid', 'copyrightId', 'lrcUrl', 'trcUrl',
  'mrcUrl', 'localFileId', 'localKey', 'localUrl', 'localPath', 'lyricSource',
];

function cleanText(value, maxLength) {
  return String(value == null ? '' : value).replace(/\0/g, '').trim().slice(0, maxLength);
}

function safeUnlink(filePath) {
  if (!filePath) return;
  try { fs.unlinkSync(filePath); } catch (_) {}
}

function normalizedMeta(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const result = {};
  for (const key of Object.keys(value).slice(0, 80)) {
    const safeKey = cleanText(key, 80);
    const item = value[key];
    if (!safeKey || item == null) continue;
    if (typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean') {
      result[safeKey] = typeof item === 'string' ? cleanText(item, 4000) : item;
    }
  }
  return result;
}

function normalizedTrack(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const track = {};
  for (const key of TRACK_STRING_FIELDS) {
    if (value[key] == null || value[key] === '') continue;
    track[key] = cleanText(value[key], key === 'localUrl' || key === 'picUrl' || key === 'cover' ? 8000 : 2000);
  }
  track.id = cleanText(track.id || track.songmid || track.localFileId, 2000);
  track.name = cleanText(track.name || track.title, 1000);
  if (!track.id || !track.name) return null;
  track.source = cleanText(track.source || track.provider || track.type, 80).toLowerCase();
  track.provider = cleanText(track.provider || track.source, 80).toLowerCase();
  if (!track.source) return null;
  if (Array.isArray(value.types)) track.types = value.types.slice(0, 16).map((item) => cleanText(item, 80)).filter(Boolean);
  if (value.hasLyric === true) track.hasLyric = true;
  if (value.localMissing === true) track.localMissing = true;
  const meta = normalizedMeta(value.importedMeta || value.meta);
  if (Object.keys(meta).length) track.importedMeta = meta;
  return track;
}

function trackIdentity(track) {
  return [track.source, track.id, track.name, track.singer || track.artist || ''].join('|').toLowerCase();
}

function normalizedPlaylist(value, remainingTracks) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const id = cleanText(value.id || value.sourceListId, 300);
  const name = cleanText(value.name || value.title, 300);
  if (!id || !name) return null;
  const songs = [];
  const seen = new Set();
  for (const item of (Array.isArray(value.songs) ? value.songs : []).slice(0, remainingTracks)) {
    const track = normalizedTrack(item);
    if (!track) continue;
    const key = trackIdentity(track);
    if (seen.has(key)) continue;
    seen.add(key);
    songs.push(track);
  }
  return {
    id,
    provider: 'local',
    source: 'local',
    name,
    creator: cleanText(value.creator, 300) || '本地歌单',
    cover: cleanText(value.cover || value.coverImgUrl, 8000) || cleanText(songs[0] && (songs[0].picUrl || songs[0].cover), 8000),
    songs,
    trackCount: songs.length,
    importedAt: Math.max(0, Number(value.importedAt) || Date.now()),
    updatedAt: Math.max(0, Number(value.updatedAt) || Number(value.importedAt) || Date.now()),
  };
}

function normalizeCatalog(input) {
  const playlists = [];
  const positions = new Map();
  let trackCount = 0;
  for (const value of (Array.isArray(input) ? input : []).slice(0, MAX_PLAYLISTS)) {
    const playlist = normalizedPlaylist(value, Math.max(0, MAX_TRACKS - trackCount));
    if (!playlist) continue;
    const key = `${playlist.id}|${playlist.name}`.toLowerCase();
    if (positions.has(key)) {
      const index = positions.get(key);
      trackCount -= playlists[index].songs.length;
      playlists[index] = playlist;
      trackCount += playlist.songs.length;
    } else {
      positions.set(key, playlists.length);
      playlists.push(playlist);
      trackCount += playlist.songs.length;
    }
    if (trackCount >= MAX_TRACKS) break;
  }
  return playlists;
}

class LocalPlaylistCatalog {
  constructor(options = {}) {
    this.userDataPath = path.resolve(String(options.userDataPath || process.cwd()));
    this.indexPath = path.join(this.userDataPath, LOCAL_PLAYLIST_CATALOG_FILE);
    this.playlists = [];
    this.mutation = Promise.resolve();
    this.load();
  }

  load() {
    try {
      const stat = fs.statSync(this.indexPath);
      if (!stat.isFile() || stat.size <= 0 || stat.size > MAX_CATALOG_BYTES) return;
      const payload = JSON.parse(fs.readFileSync(this.indexPath, 'utf8'));
      if (!payload || payload.version !== LOCAL_PLAYLIST_CATALOG_VERSION) return;
      this.playlists = normalizeCatalog(payload.playlists);
    } catch (_) {}
  }

  listSync() {
    return {
      ok: true,
      version: LOCAL_PLAYLIST_CATALOG_VERSION,
      count: this.playlists.length,
      playlists: JSON.parse(JSON.stringify(this.playlists)),
    };
  }

  save(input) {
    const nextPlaylists = normalizeCatalog(input);
    const operation = async () => {
      const payload = {
        version: LOCAL_PLAYLIST_CATALOG_VERSION,
        updatedAt: Date.now(),
        playlists: nextPlaylists,
      };
      const text = JSON.stringify(payload);
      if (Buffer.byteLength(text, 'utf8') > MAX_CATALOG_BYTES) {
        const error = new Error('LOCAL_PLAYLIST_CATALOG_TOO_LARGE');
        error.code = 'LOCAL_PLAYLIST_CATALOG_TOO_LARGE';
        throw error;
      }
      await fs.promises.mkdir(path.dirname(this.indexPath), { recursive: true });
      const temporary = `${this.indexPath}.${process.pid}.${Date.now()}.tmp`;
      try {
        await fs.promises.writeFile(temporary, text, 'utf8');
        await fs.promises.rename(temporary, this.indexPath);
      } catch (error) {
        safeUnlink(temporary);
        throw error;
      }
      this.playlists = nextPlaylists;
      return this.listSync();
    };
    const pending = this.mutation.then(operation, operation);
    this.mutation = pending.catch(() => {});
    return pending;
  }
}

module.exports = {
  LOCAL_PLAYLIST_CATALOG_FILE,
  LOCAL_PLAYLIST_CATALOG_VERSION,
  LocalPlaylistCatalog,
  normalizeCatalog,
  normalizedPlaylist,
  normalizedTrack,
};
