'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const modulePath = path.join(root, 'public/js/modules/10-shell/04a-system-media-session.js');

function makeContext(options = {}) {
  const calls = [];
  const handlers = {};
  const mediaSession = {
    metadata: null,
    playbackState: 'none',
    setActionHandler(action, handler) {
      if (options.unsupportedAction === action) throw new Error('unsupported');
      handlers[action] = handler;
    },
    setPositionState(payload) { calls.push(['position', payload]); },
  };
  class MediaMetadata {
    constructor(payload) { Object.assign(this, payload); }
  }
  const audio = options.audio || {
    src: 'https://audio.test/song.mp3',
    paused: false,
    ended: false,
    duration: 240,
    currentTime: 30,
    playbackRate: 1,
  };
  const song = options.song || {
    name: '测试歌曲',
    artist: '测试歌手',
    album: { name: '测试专辑' },
    cover: '/covers/song.jpg',
  };
  const context = vm.createContext({
    console,
    Date,
    URL,
    isFinite,
    navigator: { mediaSession },
    MediaMetadata,
    window: { location: { href: 'http://127.0.0.1:3000/index.html' } },
    location: { href: 'http://127.0.0.1:3000/index.html' },
    audio,
    playQueue: options.playQueue || [song],
    currentIdx: options.currentIdx == null ? 0 : options.currentIdx,
    currentLocalSong: null,
    currentDesktopSongMeta() {
      return { title: song.name, artist: song.artist, cover: song.cover };
    },
    getPlaybackDurationSeconds() { return Number(context.audio && context.audio.duration) || 0; },
    getPlaybackCurrentSeconds() { return Number(context.audio && context.audio.currentTime) || 0; },
    togglePlay() { calls.push(['toggle']); },
    prevTrack(userInitiated) { calls.push(['previous', userInitiated]); },
    nextTrack(userInitiated) { calls.push(['next', userInitiated]); },
    resetCuefieldAutoMix(reason) { calls.push(['automix', reason]); },
    albumGaplessState: { preload: { media: {} } },
    clearAlbumGaplessPreload(reason) { calls.push(['gapless', reason]); },
    syncBeatMapPlaybackCursor(seconds, force) { calls.push(['beat', seconds, force]); },
    syncPodcastDjMapCursor(seconds, force) { calls.push(['podcast', seconds, force]); },
    updatePlaybackProgressUi() { calls.push(['progress']); },
    saveLastPlaybackSnapshot(force, reason) { calls.push(['snapshot', force, reason]); },
  });
  vm.runInContext(fs.readFileSync(modulePath, 'utf8'), context, { filename: modulePath });
  return { context, mediaSession, handlers, calls, audio };
}

test('publishes normalized song metadata and absolute artwork', () => {
  const { context, mediaSession } = makeContext({
    song: {
      name: '  测试   歌曲 ',
      artist: [{ name: '歌手甲' }, { name: '歌手乙' }],
      album: { name: '测试专辑' },
      cover: '/covers/song.webp',
    },
  });
  assert.equal(context.updateSystemMediaSessionMetadata(), true);
  assert.equal(mediaSession.metadata.title, '测试 歌曲');
  assert.equal(mediaSession.metadata.artist, '歌手甲 / 歌手乙');
  assert.equal(mediaSession.metadata.album, '测试专辑');
  assert.equal(mediaSession.metadata.artwork[0].src, 'http://127.0.0.1:3000/covers/song.webp');
});

test('omits artwork instead of publishing a missing fallback asset', () => {
  const { context } = makeContext({ song: { name: '无封面歌曲', artist: '歌手', album: '专辑', cover: '' } });
  assert.deepEqual(Array.from(context.systemMediaSessionArtwork({ cover: '' })), []);
});

test('publishes truthful playback state and bounded position', () => {
  const { context, mediaSession, calls, audio } = makeContext();
  assert.equal(context.updateSystemMediaSessionPlaybackState('play'), true);
  assert.equal(mediaSession.playbackState, 'playing');
  assert.deepEqual([calls.at(-1)[0], { ...calls.at(-1)[1] }], ['position', { duration: 240, position: 30, playbackRate: 1 }]);
  audio.paused = true;
  context.updateSystemMediaSessionPlaybackState('pause');
  assert.equal(mediaSession.playbackState, 'paused');
  audio.currentTime = 999;
  assert.deepEqual({ ...context.systemMediaSessionPositionPayload() }, { duration: 240, position: 240, playbackRate: 1 });
});

test('clears stale system state when no media is loaded', () => {
  const { context, mediaSession, calls, audio } = makeContext();
  mediaSession.metadata = { title: 'old' };
  audio.src = '';
  assert.equal(context.updateSystemMediaSessionPlaybackState('emptied'), false);
  assert.equal(mediaSession.playbackState, 'none');
  assert.equal(mediaSession.metadata, null);
  assert.deepEqual(calls.at(-1), ['position', undefined]);
});

test('clears stale system state when the queue is emptied but audio still has a source', () => {
  const { context, mediaSession, calls } = makeContext();
  mediaSession.metadata = { title: 'old' };
  context.playQueue = [];
  context.currentIdx = -1;
  context.currentLocalSong = null;
  assert.equal(context.updateSystemMediaSessionPlaybackState('clear-queue'), false);
  assert.equal(mediaSession.playbackState, 'none');
  assert.equal(mediaSession.metadata, null);
  assert.deepEqual(calls.at(-1), ['position', undefined]);
  const positionCallCount = calls.filter((entry) => entry[0] === 'position').length;
  assert.equal(context.updateSystemMediaSessionPosition(false), true);
  assert.equal(calls.filter((entry) => entry[0] === 'position').length, positionCallCount);
  assert.deepEqual(calls.at(-1), ['position', undefined]);
});

test('routes media actions through existing playback and seek paths', () => {
  const { context, handlers, calls, audio } = makeContext();
  assert.equal(context.configureSystemMediaSessionControls(), true);
  handlers.pause();
  audio.paused = true;
  handlers.play();
  handlers.previoustrack();
  handlers.nexttrack();
  handlers.seekbackward({ seekOffset: 7 });
  handlers.seekforward({ seekOffset: 20 });
  handlers.seekto({ seekTime: 999 });
  assert.equal(calls.filter((entry) => entry[0] === 'toggle').length, 2);
  assert.ok(calls.some((entry) => entry[0] === 'previous' && entry[1] === true));
  assert.ok(calls.some((entry) => entry[0] === 'next' && entry[1] === true));
  assert.equal(audio.currentTime, 240);
  assert.ok(calls.some((entry) => entry[0] === 'automix'));
  assert.ok(calls.some((entry) => entry[0] === 'gapless'));
  assert.ok(calls.some((entry) => entry[0] === 'snapshot' && entry[2] === 'system-media-seek'));
});

test('one unsupported action does not disable the remaining handlers', () => {
  const { context, handlers } = makeContext({ unsupportedAction: 'seekto' });
  assert.equal(context.configureSystemMediaSessionControls(), true);
  assert.equal(typeof handlers.play, 'function');
  assert.equal(typeof handlers.pause, 'function');
  assert.equal(handlers.seekto, undefined);
  assert.equal(typeof handlers.nexttrack, 'function');
});

test('system media integration is loaded after metadata helpers and wired to playback events', () => {
  const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
  const loader = read('public/js/index-loader.js');
  const startup = read('public/js/modules/10-shell/05-startup-bindings.js');
  const playback = read('public/js/modules/05-playback/12-playback-switch-core.js');
  const progress = read('public/js/modules/06-lyrics/04-progress-seek.js');
  const trackInfo = read('public/js/modules/02-visual/15-ripples-cover-depth.js');
  const controls = read('public/js/modules/05-playback/14-player-controls.js');
  assert.ok(loader.indexOf('04-desktop-overlay-fullscreen.js') < loader.indexOf('04a-system-media-session.js'));
  assert.ok(loader.indexOf('04a-system-media-session.js') < loader.indexOf('05-startup-bindings.js'));
  assert.match(startup, /initSystemMediaSession\(\)/);
  assert.match(playback, /updateSystemMediaSessionPlaybackState\(reason\)/);
  assert.match(progress, /updateSystemMediaSessionPosition\(false\)/);
  assert.match(progress, /updateSystemMediaSessionPosition\(true\)/);
  assert.match(trackInfo, /updateSystemMediaSessionMetadata\(\)/);
  assert.match(controls, /updateSystemMediaSessionPlaybackState\('clear-queue'\)/);
  assert.doesNotMatch(loader + startup + playback + progress + trackInfo + controls, /LX\s*Music|Mineradio-LX|落雪/);
});
