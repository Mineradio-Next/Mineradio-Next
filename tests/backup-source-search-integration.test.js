'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const searchSource = fs.readFileSync(path.join(root, 'public/js/modules/05-playback/07-search.js'), 'utf8');
const sourceConfigSource = fs.readFileSync(path.join(root, 'public/js/modules/06-lyrics/04a-source-config.js'), 'utf8');
const playbackSource = fs.readFileSync(path.join(root, 'public/js/modules/05-playback/13-playback-start-audio.js'), 'utf8');
const lyricSource = fs.readFileSync(path.join(root, 'public/js/modules/06-lyrics/00-lyrics-fetch-parse.js'), 'utf8');
const actionSource = fs.readFileSync(path.join(root, 'public/js/modules/05-playback/06-track-detail-lyrics-actions.js'), 'utf8');
const localPlaylistSource = fs.readFileSync(path.join(root, 'public/js/modules/06-lyrics/04-local-playlist-files.js'), 'utf8');
const indexSource = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
const serverSource = fs.readFileSync(path.join(root, 'server.js'), 'utf8');

test('backup catalogue tabs are hidden by default and stay outside composite provider order', () => {
  assert.match(indexSource, /id="search-mode-kuwo"[^>]*[\s\S]{0,120}\bhidden\b/);
  assert.match(indexSource, /id="search-mode-migu"[^>]*[\s\S]{0,120}\bhidden\b/);
  const providerOrder = /MUSIC_SEARCH_PROVIDER_ORDER\s*=\s*\[([^\]]+)\]/.exec(searchSource);
  assert.ok(providerOrder);
  assert.doesNotMatch(providerOrder[1], /kuwo|migu/);
  assert.match(searchSource, /additionalSourceSearchModeAvailable\(provider\)/);
  assert.match(sourceConfigSource, /additionalSourceEnabled\(\)\s*&&\s*additionalSourceSearchCapabilities\[entry\.source\]/);
  assert.match(sourceConfigSource, /setSearchMode\('song'\)/);
});

test('backup catalogue routes preserve source identity and use the isolated API', () => {
  assert.match(searchSource, /provider === 'kuwo' \? 'kw' : 'mg'/);
  assert.match(searchSource, /\/api\/backup-catalog\/search\?provider=/);
  assert.match(searchSource, /song\.additionalSourceCode === 'kw'/);
  assert.match(searchSource, /song\.additionalSourceCode === 'mg'/);
  assert.match(serverSource, /pn === '\/api\/backup-catalog\/search'/);
  assert.match(serverSource, /sourceStatus\.sources\[provider\]/);
  assert.match(serverSource, /BACKUP_CATALOG_DISABLED/);
  assert.match(sourceConfigSource, /\/api\/source-config\/enabled/);
});

test('backup catalogue songs resolve playback and lyrics before built-in endpoints', () => {
  const directPlayback = playbackSource.indexOf("isAdditionalSourcePlayback && typeof resolveAdditionalSourcePlayback");
  const qqPlayback = playbackSource.indexOf('} else if (isQQPlayback)', directPlayback);
  assert.ok(directPlayback >= 0 && qqPlayback > directPlayback);
  assert.match(playbackSource, /song\.additionalSourceCode[\s\S]{0,180}resolveAdditionalSourcePlayback\(song, requestedQuality\)/);
  assert.match(lyricSource, /lyricResponseForSong\(candidate\.song\)/);
  assert.match(lyricSource, /refreshPersistentLyricCache\(song\)[\s\S]{0,120}lyricResponseForSong\(song\)/);
  assert.match(lyricSource, /song && song\.additionalSourceCode[\s\S]{0,160}resolveAdditionalSourceLyrics\(song\)/);
  assert.match(sourceConfigSource, /directSource[\s\S]{0,160}\^\(kw\|mg\|kg\|tx\|wy\)\$/);
});

test('backup catalogue heart and collection actions persist locally', () => {
  assert.match(actionSource, /BACKUP_SOURCE_LIKES_KEY/);
  assert.match(actionSource, /saveBackupSourceLikes\(\)/);
  assert.match(actionSource, /createLocalFilePlaylist\(localName\)/);
  assert.match(actionSource, /addSongToLocalFilePlaylist\(pid, targetSong\)/);
  assert.match(localPlaylistSource, /additionalSourceCode = additionalSourceCode/);
  assert.match(localPlaylistSource, /function addSongToLocalFilePlaylist/);
});

test('backup catalogue playlist export and import preserve resolver metadata', () => {
  const values = new Map();
  const sandbox = {
    localStorage: {
      getItem(key) { return values.has(key) ? values.get(key) : null; },
      setItem(key, value) { values.set(key, String(value)); }
    },
    showToast() {},
    rebuildUserPlaylistsFromCatalog() {}
  };
  vm.runInNewContext(localPlaylistSource, sandbox);
  const sourceSong = {
    id: 'mg-1', songmid: 'mg-1', name: '晴天', singer: '周杰伦',
    source: 'backup-source', provider: 'backup-source', additionalSourceCode: 'mg',
    albumName: '专辑', albumId: 'album-1', copyrightId: 'copyright-1',
    picUrl: 'https://img.test/cover.jpg', lrcUrl: 'https://img.test/lyric.lrc', interval: '4:29'
  };
  const exported = sandbox.localPlaylistExportPayload({ id: 'local-1', name: '收藏', songs: [sourceSong] });
  const imported = sandbox.normalizeLocalPlaylistPayload(exported);
  const song = imported.songs[0];
  assert.equal(song.additionalSourceCode, 'mg');
  assert.equal(song.source, 'backup-source');
  assert.equal(song.copyrightId, 'copyright-1');
  assert.equal(song.albumId, 'album-1');
  assert.equal(song.picUrl, 'https://img.test/cover.jpg');
  assert.equal(song.lrcUrl, 'https://img.test/lyric.lrc');
});

test('backup source enabled-state writes are serialized', () => {
  assert.match(sourceConfigSource, /additionalSourceEnabledSyncQueue\s*=\s*Promise\.resolve/);
  assert.match(sourceConfigSource, /additionalSourceEnabledSyncQueue\s*=\s*additionalSourceEnabledSyncQueue\.then/);
  assert.match(actionSource, /song\.additionalSourceCode === 'kw'\) return '酷我音乐'/);
  assert.match(actionSource, /song\.additionalSourceCode === 'mg'\) return '咪咕音乐'/);
});
