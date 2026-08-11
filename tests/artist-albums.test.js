'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const {
  normalizeNeteaseArtistAlbums,
  normalizeQQArtistAlbums,
} = require('../artist-albums-api');

test('normalizes Netease artist albums into the shared album contract', () => {
  const albums = normalizeNeteaseArtistAlbums({
    body: {
      hotAlbums: [{
        id: 101,
        name: '作品一号',
        artist: { name: '歌手甲' },
        picUrl: 'https://img.example/netease.jpg',
        publishTime: 1704067200000,
        size: 12,
      }],
    },
  }, 12);

  assert.deepEqual(albums, [{
    provider: 'netease',
    id: 101,
    name: '作品一号',
    artist: '歌手甲',
    cover: 'https://img.example/netease.jpg',
    releaseDate: '2024-01-01',
    trackCount: 12,
  }]);
});

test('normalizes QQ artist albums and preserves albumMid for detail lookup', () => {
  const albums = normalizeQQArtistAlbums({
    album: {
      data: {
        singer_name: '歌手乙',
        list: [{
          albumid: 202,
          album_mid: 'album-mid-202',
          album_name: '作品二号',
          pub_time: '2025-06-06',
          latest_song: { song_count: 9 },
        }],
      },
    },
  }, 12);

  assert.equal(albums.length, 1);
  assert.equal(albums[0].provider, 'qq');
  assert.equal(albums[0].id, 202);
  assert.equal(albums[0].albumMid, 'album-mid-202');
  assert.equal(albums[0].artist, '歌手乙');
  assert.equal(albums[0].releaseDate, '2025-06-06');
  assert.equal(albums[0].trackCount, 9);
  assert.match(albums[0].cover, /album-mid-202/);
});

test('drops incomplete albums and obeys the requested response limit', () => {
  const rows = Array.from({ length: 15 }, (_, index) => ({
    id: index + 1,
    name: `专辑 ${index + 1}`,
  }));
  rows.unshift({ id: '', name: '缺少身份' });
  rows.unshift({ id: 99, name: '' });
  const albums = normalizeNeteaseArtistAlbums({ hotAlbums: rows }, 8);
  assert.equal(albums.length, 8);
  assert.equal(albums[0].name, '专辑 1');
});

test('server and renderer wire artist albums without LX naming', () => {
  const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
  const frontend = fs.readFileSync(path.join(root, 'public', 'js', 'modules', '05-playback', '06-track-detail-lyrics-actions.js'), 'utf8');
  const css = fs.readFileSync(path.join(root, 'public', 'css', 'index.css'), 'utf8');

  assert.match(server, /artist_album\(\{ id, limit: 12/);
  assert.match(server, /method: 'get_singer_album'/);
  assert.match(server, /albums: albumResult\.albums/);
  assert.match(frontend, /function openArtistAlbumDetail\(index\)/);
  assert.match(frontend, /openTrackDetailModal\('album', song\)/);
  assert.match(frontend, />专辑作品</);
  assert.match(css, /\.artist-album-strip\s*\{/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.doesNotMatch(frontend, /LX\s*(?:音乐|专辑)|落雪/);
});
