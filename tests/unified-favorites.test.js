'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const favorites = require('../public/js/modules/05-playback/06b-unified-favorites');

test('favorite snapshots preserve playback identity and exclude secrets and media URLs', () => {
  const snapshot = favorites.favoriteSongSnapshot({
    provider: 'netease', id: 42, name: '晴天', artist: '周杰伦', album: '叶惠美',
    cover: 'https://image.example/cover.jpg', url: 'https://audio.example/private.mp3',
    proxyUrl: '/api/proxy?token=secret', cookie: 'MUSIC_U=secret', token: 'secret', headers: { Authorization: 'secret' }
  });
  assert.equal(snapshot.id, 42);
  assert.equal(snapshot.name, '晴天');
  assert.equal(snapshot.cover, 'https://image.example/cover.jpg');
  assert.equal(snapshot.url, undefined);
  assert.equal(snapshot.proxyUrl, undefined);
  assert.equal(snapshot.cookie, undefined);
  assert.equal(snapshot.token, undefined);
  assert.equal(snapshot.headers, undefined);
});

test('favorite catalogue deduplicates identities, sorts recent first, and stays bounded', () => {
  const duplicate = [
    { savedAt: 10, updatedAt: 10, song: { provider: 'qq', mid: 'same', name: 'A', artist: 'B' } },
    { savedAt: 20, updatedAt: 20, song: { provider: 'qq', mid: 'same', name: 'A newer', artist: 'B' } }
  ];
  const normalized = favorites.normalizeFavoriteCatalog(duplicate, 100);
  assert.equal(normalized.length, 1);
  assert.equal(normalized[0].song.name, 'A newer');

  const rows = Array.from({ length: favorites.FAVORITE_CATALOG_LIMIT + 25 }, (_, index) => ({
    savedAt: index + 1,
    updatedAt: index + 1,
    song: { provider: 'netease', id: index + 1, name: `Song ${index + 1}`, artist: 'Artist' }
  }));
  const bounded = favorites.normalizeFavoriteCatalog(rows, 5000);
  assert.equal(bounded.length, favorites.FAVORITE_CATALOG_LIMIT);
  assert.equal(bounded[0].song.id, favorites.FAVORITE_CATALOG_LIMIT + 25);
});

test('favorite merge retains original save time, updates classification, and removes cleanly', () => {
  const song = { additionalSourceCode: 'kw', provider: 'kuwo', id: 'kw-1', name: 'Local Heart', artist: 'Singer' };
  let rows = favorites.mergeFavoriteEntry([], song, true, { now: 100, synced: false });
  assert.equal(rows[0].savedAt, 100);
  assert.equal(rows[0].synced, false);
  rows = favorites.mergeFavoriteEntry(rows, song, true, { now: 200, synced: true });
  assert.equal(rows[0].savedAt, 100);
  assert.equal(rows[0].updatedAt, 200);
  assert.equal(rows[0].synced, true);
  assert.deepEqual(favorites.mergeFavoriteEntry(rows, song, false, { now: 300 }), []);
});

test('music library owns unified favorites and reuses existing playback paths', () => {
  const workspace = fs.readFileSync(path.join(root, 'public/js/modules/06-lyrics/05a-music-library-workspace.js'), 'utf8');
  const actions = fs.readFileSync(path.join(root, 'public/js/modules/05-playback/06-track-detail-lyrics-actions.js'), 'utf8');
  const renderer = fs.readFileSync(path.join(root, 'public/js/modules/05-playback/06b-unified-favorites.js'), 'utf8');
  const css = fs.readFileSync(path.join(root, 'public/css/music-library.css'), 'utf8');
  const loader = fs.readFileSync(path.join(root, 'public/js/index-loader.js'), 'utf8');
  assert.match(workspace, /data-library-tab="favorites"[^>]*>我的收藏/);
  assert.match(workspace, /playMusicLibraryTracks\(\[favoritePlayEntry\.song\]\)/);
  assert.match(workspace, /queueSongNext\(favoriteNextEntry\.song\)/);
  assert.match(workspace, /toggleLikeSong\(favoriteLikeEntry\.song\)/);
  assert.match(actions, /setFavoriteCatalogSong/);
  assert.match(renderer, /specialType/);
  assert.match(renderer, /favoriteCanToggle/);
  assert.match(css, /\.music-library-favorite-row/);
  assert.match(loader, /06b-unified-favorites\.js/);
  assert.doesNotMatch(`${workspace}\n${renderer}\n${css}`, /Mineradio-LX|\bLX\b/i);
});
