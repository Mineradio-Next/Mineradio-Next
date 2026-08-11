'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const appRoot = path.join(__dirname, '..');
const modulePath = path.join(appRoot, 'public', 'js', 'modules', '05-playback', '07d-music-planet.js');

function makeContext(overrides) {
  const listeners = {};
  const context = vm.createContext(Object.assign({
    document: {
      hidden: false,
      activeElement: null,
      getElementById() { return null; },
      querySelector() { return null; },
      addEventListener(type, listener) { listeners[type] = listener; },
    },
    window: {
      innerWidth: 1280,
      devicePixelRatio: 1,
      matchMedia() { return { matches: false }; },
      addEventListener() {},
    },
    console: { warn() {}, log() {} },
    requestAnimationFrame() { return 1; },
    cancelAnimationFrame() {},
    setTimeout(callback) { callback(); return 1; },
    clearTimeout() {},
    Promise,
    Array,
    Object,
    String,
    Number,
    Math,
    isFinite,
  }, overrides || {}));
  vm.runInContext(fs.readFileSync(modulePath, 'utf8'), context, { filename: modulePath });
  return context;
}

function song(id, name, artist, provider) {
  return { id, name, artist, provider: provider || 'netease' };
}

test('deduplicates equivalent songs across providers and skips podcast entries', () => {
  const context = makeContext();
  const result = context.musicPlanetUniqueSongs([
    song('1', '晴天', '周杰伦', 'netease'),
    song('other', ' 晴 天 ', '周杰伦', 'qq'),
    song('2', '夜曲', '周杰伦', 'netease'),
    { id: 'podcast', name: '节目', artist: '主播', type: 'podcast' },
  ], 20);

  assert.deepEqual(Array.from(result, item => item.name), ['晴天', '夜曲']);
});

test('groups by primary artist and keeps the current artist first', () => {
  const context = makeContext();
  const current = song('3', '后来', '刘若英');
  const grouped = context.musicPlanetGroupSongs([
    song('1', '晴天', '周杰伦'),
    song('2', '夜曲', '周杰伦'),
    current,
  ], current, { artists: 12, tracksPerArtist: 4, tracks: 48 });

  assert.equal(grouped.artists[0].name, '刘若英');
  assert.equal(grouped.currentArtistKey, context.musicPlanetNormalizeText('刘若英'));
  assert.equal(grouped.songs.length, 3);
});

test('desktop and compact layouts enforce their documented caps', () => {
  const context = makeContext();
  assert.deepEqual(Object.assign({}, context.musicPlanetLayoutCaps(1280, false)), {
    artists: 12, tracksPerArtist: 4, tracks: 48,
  });
  assert.deepEqual(Object.assign({}, context.musicPlanetLayoutCaps(390, false)), {
    artists: 8, tracksPerArtist: 3, tracks: 24,
  });
  assert.deepEqual(Object.assign({}, context.musicPlanetLayoutCaps(1280, true)), {
    artists: 8, tracksPerArtist: 3, tracks: 24,
  });

  const songs = [];
  for (let artist = 0; artist < 20; artist += 1) {
    for (let track = 0; track < 6; track += 1) songs.push(song(`${artist}-${track}`, `歌曲${artist}-${track}`, `歌手${artist}`));
  }
  const compact = context.musicPlanetGroupSongs(songs, null, context.musicPlanetLayoutCaps(390, false));
  assert.ok(compact.artists.length <= 8);
  assert.ok(compact.songs.length <= 24);
  assert.ok(compact.artists.every(item => item.songs.length <= 3));
});

test('artist fallback colors are deterministic and artist parsing selects the primary name', () => {
  const context = makeContext();
  assert.equal(context.musicPlanetColor('同一歌手', 58), context.musicPlanetColor('同一歌手', 58));
  assert.notEqual(context.musicPlanetColor('歌手甲', 58), context.musicPlanetColor('歌手乙', 58));
  assert.match(context.musicPlanetColor('歌手甲', 58), /, 30%, 58%\)$/);
  assert.equal(context.musicPlanetArtistName({ artists: [{ name: '主唱' }, { name: '合作歌手' }] }), '主唱');
  assert.equal(context.musicPlanetArtistName({ artist: '主唱 / 合作歌手' }), '主唱');
});

test('hidden song branches are excluded from pointer targeting', () => {
  const context = makeContext();
  assert.equal(context.musicPlanetObjectIsVisible({ visible: true, parent: { visible: false, parent: null } }), false);
  assert.equal(context.musicPlanetObjectIsVisible({ visible: true, parent: { visible: true, parent: null } }), true);
});

test('play, next and collection actions reuse Mineradio playback flows', async () => {
  const calls = [];
  const target = song('target', '目标歌曲', '目标歌手');
  const context = makeContext({
    playQueue: [target],
    currentIdx: 0,
    playQueueAt(index, options) { calls.push(['play', index, options]); return Promise.resolve(true); },
    queueSongNext(item) { calls.push(['next', item]); return 0; },
    openCollectModal(item) { calls.push(['collect', item]); },
  });

  assert.equal(context.playMusicPlanetSong(target), true);
  await Promise.resolve();
  assert.equal(calls[0][0], 'play');
  assert.equal(calls[0][2].context.type, 'music-planet');
  assert.equal(context.queueMusicPlanetSongNext(target), true);
  assert.equal(context.collectMusicPlanetSong(target), true);
  assert.deepEqual(calls.map(call => call[0]), ['play', 'next', 'collect']);
});

test('project wiring exposes the native music planet without LX naming or routes', () => {
  const html = fs.readFileSync(path.join(appRoot, 'public', 'index.html'), 'utf8');
  const css = fs.readFileSync(path.join(appRoot, 'public', 'css', 'index.css'), 'utf8');
  const loader = fs.readFileSync(path.join(appRoot, 'public', 'js', 'index-loader.js'), 'utf8');
  const frontend = fs.readFileSync(modulePath, 'utf8');

  assert.match(html, /id="home-music-planet-entry"/);
  assert.match(html, /id="music-planet-mask"/);
  assert.match(html, /id="music-planet-canvas"/);
  assert.match(loader, /07d-music-planet\.js/);
  assert.match(css, /\.music-planet-drawer/);
  assert.match(frontend, /playQueueAt\(/);
  assert.match(frontend, /queueSongNext\(/);
  assert.match(frontend, /openCollectModal\(/);
  assert.match(frontend, /new THREE\.CanvasTexture\(canvas\)/);
  assert.match(frontend, /function musicPlanetArtistMarkerTexture/);
  assert.match(frontend, /satelliteGroup\.visible = false/);
  assert.match(frontend, /entry\.satelliteGroup\.visible = selected/);
  assert.match(frontend, /\.9 - match\.group\.position\.y/);
  assert.match(frontend, /gsap\.to\(musicPlanetState\.root\.position/);
  assert.doesNotMatch(frontend, /SphereGeometry|TorusGeometry|musicPlanetAddOrbit/);
  assert.doesNotMatch(frontend, /\/api\/lx-|\bLX\b|lx-music|lx_music/i);
});
