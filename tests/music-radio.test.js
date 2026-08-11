'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const appRoot = path.join(__dirname, '..');
const modulePath = path.join(appRoot, 'public', 'js', 'modules', '05-playback', '07b-music-radio.js');

function makeContext(storage = {}) {
  const store = new Map(Object.entries(storage));
  const context = vm.createContext({
    localStorage: {
      getItem(key) { return store.has(key) ? store.get(key) : null; },
      setItem(key, value) { store.set(key, String(value)); },
    },
    document: {
      activeElement: null,
      addEventListener() {},
      getElementById() { return null; },
      querySelectorAll() { return []; },
    },
    console: { warn() {}, log() {} },
    setTimeout() {},
    Promise,
    Math,
    JSON,
    Object,
    Array,
    String,
    Number,
    Date,
  });
  vm.runInContext(fs.readFileSync(modulePath, 'utf8'), context, { filename: modulePath });
  return { context, store };
}

function song(id, name, artist = '歌手', extra = {}) {
  return Object.assign({ id, name, artist, source: 'netease', album: '' }, extra);
}

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

test('defines 21 unique radio modes across every supported category', () => {
  const { context } = makeContext();
  const modes = Array.from(context.MUSIC_RADIO_MODES);
  assert.equal(modes.length, 21);
  assert.equal(new Set(modes.map((mode) => mode.id)).size, modes.length);
  assert.deepEqual(
    Array.from(new Set(modes.map((mode) => mode.category))).sort(),
    ['energy', 'personal', 'scene', 'style']
  );
  modes.forEach((mode) => {
    assert.ok(mode.title && mode.sub && mode.kicker);
    assert.ok(Array.isArray(mode.queries) && mode.queries.length >= 1 && mode.queries.length <= 2);
  });
});

test('rejects spoken content and only admits explicitly marked DJ tracks', () => {
  const { context } = makeContext();
  const dj = context.musicRadioModeById('dj');
  assert.equal(context.isMusicRadioSong(song('1', '第 12 期 睡眠故事')), false);
  assert.equal(context.isMusicRadioSong(song('2', '普通歌曲', '普通歌手')), true);
  assert.equal(context.isMusicRadioSong(song('2b', '普通歌曲', '播客主播')), false);
  assert.equal(context.musicRadioModeAcceptsSong(dj, song('3', 'Faded', 'Alan Walker')), false);
  assert.equal(context.musicRadioModeAcceptsSong(dj, song('4', 'Faded (DJ Remix)', 'Alan Walker')), true);
  assert.equal(context.musicRadioModeAcceptsSong(dj, song('5', '夜色', '歌手', { album: 'Club Mix' })), true);
});

test('deduplicates provider ids and equivalent cross-provider songs', () => {
  const { context } = makeContext();
  const songs = [
    song('1', '晴天', '周杰伦', { source: 'netease' }),
    song('1', '晴天', '周杰伦', { source: 'netease' }),
    song('9', '晴天', '周杰伦', { source: 'qq' }),
    song('2', '七里香', '周杰伦', { source: 'netease' }),
  ];
  const unique = context.musicRadioUniqueSongs(songs, 48);
  assert.deepEqual(Array.from(unique, (item) => item.name), ['晴天', '七里香']);
});

test('shuffle is deterministic for one refresh nonce and changes with another', () => {
  const { context } = makeContext();
  const input = Array.from({ length: 20 }, (_, index) => index + 1);
  const first = Array.from(context.musicRadioShuffle(input, 'rock|0'));
  const same = Array.from(context.musicRadioShuffle(input, 'rock|0'));
  const refreshed = Array.from(context.musicRadioShuffle(input, 'rock|1'));
  assert.deepEqual(first, same);
  assert.notDeepEqual(first, refreshed);
  assert.deepEqual(first.slice().sort((a, b) => a - b), input);
});

test('favorite state keeps valid unique mode ids only', () => {
  const { context } = makeContext({
    'mineradio-music-radio-favorites-v1': JSON.stringify(['rock', 'missing', 'rock', 'late']),
  });
  assert.deepEqual(Array.from(context.musicRadioFavoriteIds), ['rock', 'late']);
  assert.deepEqual(Array.from(context.normalizeMusicRadioFavorites(['dj', 'dj', 'bad'])), ['dj']);
});

test('queue builder uses successful catalogue batches, filters content, and caps at 48', async () => {
  const { context } = makeContext();
  context.homeDiscoverState = { songs: [] };
  context.playQueue = [];
  context.playlist = [];
  context.userPlaylists = [];
  context.localFilePlaylists = [];
  context.fetchMusicSearchResults = async (query) => ({
    songs: Array.from({ length: 35 }, (_, index) => song(query + '-' + index, query + ' 歌曲 ' + index, '歌手 ' + index)),
  });
  const built = await context.buildMusicRadioSongs(context.musicRadioModeById('rock'));
  assert.equal(built.length, 48);
  assert.ok(built.every((item) => context.isMusicRadioSong(item)));
});

test('persistent local library tracks participate even when the active queue is empty', () => {
  const { context } = makeContext();
  context.homeDiscoverState = { songs: [] };
  context.playQueue = [];
  context.playlist = [];
  context.userPlaylists = [];
  context.localFilePlaylists = [];
  context.persistentLocalLibraryTracks = [
    song('local-1', '本地收藏歌曲', '本地歌手', { source: 'local', localKey: 'library/local-1.flac' }),
  ];

  const pool = context.musicRadioLocalPool();

  assert.deepEqual(Array.from(pool, (item) => item.id), ['local-1']);
});

test('reports unavailable catalogue sources only when no local candidate exists', async () => {
  const { context } = makeContext();
  context.homeDiscoverState = { songs: [] };
  context.playQueue = [];
  context.playlist = [];
  context.userPlaylists = [];
  context.localFilePlaylists = [];
  context.persistentLocalLibraryTracks = [];
  context.activeSearchProvidersForMode = () => [];

  await assert.rejects(
    context.buildMusicRadioSongs(context.musicRadioModeById('rock')),
    /当前没有可搜索的音乐来源/
  );
});

test('empty builds preserve the current queue and playback position', async () => {
  const { context } = makeContext();
  const existing = [song('old', '旧队列歌曲')];
  context.playQueue = existing;
  context.currentIdx = 3;
  context.buildMusicRadioSongs = async () => [];
  context.playQueueAt = async () => { throw new Error('playback must not start'); };

  await context.playMusicRadioMode('rock');

  assert.equal(context.playQueue, existing);
  assert.equal(context.currentIdx, 3);
});

test('a stale mode build cannot overwrite a newer selection', async () => {
  const { context } = makeContext();
  const first = deferred();
  const second = deferred();
  context.playQueue = [song('old', '旧队列歌曲')];
  context.currentIdx = 0;
  context.buildMusicRadioSongs = (mode) => mode.id === 'rock' ? first.promise : second.promise;
  context.playQueueAt = async () => true;

  const firstRun = context.playMusicRadioMode('rock');
  const secondRun = context.playMusicRadioMode('daily');
  first.resolve([song('stale', '旧请求歌曲')]);
  await firstRun;
  assert.equal(context.playQueue[0].id, 'old');

  second.resolve([song('fresh', '新请求歌曲')]);
  await secondRun;
  assert.equal(context.playQueue[0].id, 'fresh');
  assert.equal(context.playQueue[0].radioModeId, 'daily');
});

test('closing the modal cancels an in-flight build before it can replace playback', async () => {
  const { context } = makeContext();
  const build = deferred();
  const existing = [song('old', '旧队列歌曲')];
  let playbackStarts = 0;
  context.playQueue = existing;
  context.currentIdx = 2;
  context.musicRadioState.open = true;
  context.buildMusicRadioSongs = () => build.promise;
  context.playQueueAt = async () => { playbackStarts += 1; return true; };

  const run = context.playMusicRadioMode('rock');
  context.closeMusicRadio();
  build.resolve([song('late', '迟到的电台歌曲')]);
  await run;

  assert.equal(context.playQueue, existing);
  assert.equal(context.currentIdx, 2);
  assert.equal(playbackStarts, 0);
  assert.equal(context.musicRadioState.open, false);
});

test('playback start failure keeps the committed radio queue and never reports success', async () => {
  const { context } = makeContext();
  const existing = [song('old', '旧队列歌曲')];
  const toasts = [];
  context.playQueue = existing;
  context.currentIdx = 4;
  context.musicRadioState.open = true;
  context.buildMusicRadioSongs = async () => [song('fresh', '新电台歌曲')];
  context.playQueueAt = async () => false;
  context.showToast = (message) => toasts.push(message);

  await context.playMusicRadioMode('daily');

  assert.notEqual(context.playQueue, existing);
  assert.equal(context.playQueue[0].id, 'fresh');
  assert.equal(context.playQueue[0].radioModeId, 'daily');
  assert.equal(context.currentIdx, 0);
  assert.equal(context.musicRadioState.open, true);
  assert.deepEqual(toasts, ['电台队列已生成，但第一首暂时无法播放']);
});

test('closing after queue commit does not attempt a partial playback rollback', async () => {
  const { context } = makeContext();
  const playbackEntered = deferred();
  const playbackResult = deferred();
  context.playQueue = [song('old', '旧队列歌曲')];
  context.currentIdx = 1;
  context.musicRadioState.open = true;
  context.buildMusicRadioSongs = async () => [song('fresh', '新电台歌曲')];
  context.playQueueAt = async () => {
    playbackEntered.resolve();
    return playbackResult.promise;
  };

  const run = context.playMusicRadioMode('daily');
  await playbackEntered.promise;
  context.closeMusicRadio();
  playbackResult.resolve(true);
  await run;

  assert.equal(context.musicRadioState.open, false);
  assert.equal(context.playQueue[0].id, 'fresh');
  assert.equal(context.playQueue[0].radioModeId, 'daily');
});

test('project wiring keeps radio native and includes its preference in full backup', () => {
  const html = fs.readFileSync(path.join(appRoot, 'public', 'index.html'), 'utf8');
  const loader = fs.readFileSync(path.join(appRoot, 'public', 'js', 'index-loader.js'), 'utf8');
  const backup = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '07-fx', '00a-full-backup-restore.js'), 'utf8');
  assert.match(loader, /07b-music-radio\.js/);
  assert.match(html, /id="music-radio-mask"/);
  assert.match(html, /onclick="openMusicRadio\('all'\)"/);
  assert.match(backup, /mineradio-music-radio-favorites-v1/);
  assert.doesNotMatch(fs.readFileSync(modulePath, 'utf8'), /\/api\/lx-|\bLX\b/);
});
