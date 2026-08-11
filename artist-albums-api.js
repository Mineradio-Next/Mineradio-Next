'use strict';

function isoDate(value) {
  if (value === null || value === undefined || value === '') return '';
  if (typeof value === 'string') {
    const text = value.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
    if (/^\d{4}(?:-\d{1,2})?$/.test(text)) return text;
  }
  const numeric = Number(value);
  const date = Number.isFinite(numeric) && numeric > 0 ? new Date(numeric) : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : '';
}

function positiveLimit(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Math.max(1, Math.min(30, Number.isFinite(parsed) ? parsed : fallback));
}

function normalizeNeteaseArtistAlbums(payload, limit) {
  payload = payload && (payload.body || payload) || {};
  const rows = payload.hotAlbums || payload.albums || payload.data && (payload.data.hotAlbums || payload.data.albums) || [];
  return (Array.isArray(rows) ? rows : [])
    .map((album) => {
      album = album || {};
      const artist = album.artist || (album.artists && album.artists[0]) || {};
      return {
        provider: 'netease',
        id: album.id || '',
        name: album.name || album.albumName || '',
        artist: artist.name || album.artistName || '',
        cover: album.picUrl || album.coverUrl || album.blurPicUrl || '',
        releaseDate: isoDate(album.publishTime || album.releaseDate),
        trackCount: Number(album.size || album.trackCount || album.songCount || 0) || 0,
      };
    })
    .filter((album) => album.id && album.name)
    .slice(0, positiveLimit(limit, 12));
}

function normalizeQQArtistAlbums(payload, limit, fallbackArtist) {
  payload = payload && (payload.body || payload) || {};
  const block = payload.album || payload;
  const data = block && (block.data || block) || {};
  const rows = data.list || data.albumlist || data.albumList || [];
  return (Array.isArray(rows) ? rows : [])
    .map((album) => {
      album = album || {};
      const albumMid = album.album_mid || album.albumMid || album.albummid || album.mid || '';
      const latestSong = album.latest_song || album.latestSong || {};
      const artist = album.singer_name || album.singerName ||
        (album.singers && album.singers[0] && (album.singers[0].singer_name || album.singers[0].name)) ||
        fallbackArtist || data.singer_name || '';
      return {
        provider: 'qq',
        id: album.albumid || album.album_id || album.id || '',
        mid: albumMid,
        albumMid,
        name: album.album_name || album.albumName || album.name || album.title || '',
        artist,
        cover: albumMid ? `https://y.qq.com/music/photo_new/T002R300x300M000${albumMid}.jpg?max_age=2592000` : '',
        releaseDate: isoDate(album.pub_time || album.publishTime || album.releaseDate),
        trackCount: Number(latestSong.song_count || album.song_count || album.songCount || 0) || 0,
      };
    })
    .filter((album) => album.albumMid && album.name)
    .slice(0, positiveLimit(limit, 12));
}

module.exports = {
  isoDate,
  normalizeNeteaseArtistAlbums,
  normalizeQQArtistAlbums,
};
