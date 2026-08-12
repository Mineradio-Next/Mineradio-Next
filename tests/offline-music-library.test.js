'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  OfflineMusicLibrary,
  acceptedAudioContentType,
  offlineTrackKey,
  sanitizeSongMetadata,
} = require('../desktop/offline-music-library');

function makeWorkspace(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mineradio-offline-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return {
    root,
    profile: path.join(root, 'profile'),
    cache: path.join(root, 'cache'),
  };
}

function audioResponse(bytes, headers = {}) {
  return new Response(Buffer.from(bytes), {
    status: 200,
    headers: { 'Content-Type': 'audio/mpeg', 'Content-Length': String(bytes.length), ...headers },
  });
}

test('offline identity is stable and persisted metadata excludes credentials and source URLs', async (t) => {
  const workspace = makeWorkspace(t);
  const bytes = Buffer.from('ID3\x04\x00\x00mineradio-offline-test', 'binary');
  const library = new OfflineMusicLibrary({
    userDataPath: workspace.profile,
    getCacheRoot: () => workspace.cache,
    fetch: async () => audioResponse(bytes),
  });
  const rawKey = 'qq:song-mid-123';
  const result = await library.download({
    key: rawKey,
    url: 'https://audio.example/signed.mp3?token=secret',
    quality: 'lossless',
    song: {
      provider: 'qq',
      mid: 'song-mid-123',
      name: '测试歌曲',
      artist: '测试歌手',
      cookie: 'uin=secret',
      authorization: 'Bearer secret',
      url: 'https://audio.example/signed.mp3?token=secret',
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.key, offlineTrackKey(rawKey));
  assert.equal(result.item.available, true);
  assert.match(result.item.offlineUrl, /^mineradio-offline:\/\/track\/[a-f0-9]{24}$/);
  const manifest = fs.readFileSync(path.join(workspace.profile, 'offline-music.json'), 'utf8');
  assert.doesNotMatch(manifest, /secret|signed\.mp3|authorization|cookie/i);
  assert.match(manifest, /测试歌曲/);
});

test('committed offline music survives reload and supports byte ranges', async (t) => {
  const workspace = makeWorkspace(t);
  const bytes = Buffer.from('0123456789abcdef', 'ascii');
  const rawKey = 'song:42';
  const library = new OfflineMusicLibrary({
    userDataPath: workspace.profile,
    getCacheRoot: () => workspace.cache,
    fetch: async () => audioResponse(bytes),
  });
  assert.equal((await library.download({ key: rawKey, url: 'https://audio.example/song.mp3', song: { id: 42, name: 'Song' } })).ok, true);

  const restored = new OfflineMusicLibrary({ userDataPath: workspace.profile, getCacheRoot: () => workspace.cache });
  const resolved = restored.resolve(rawKey);
  assert.equal(resolved.hit, true);
  const response = await restored.mediaResponse(new Request(resolved.offlineUrl, {
    headers: { Range: 'bytes=4-9', Origin: 'http://127.0.0.1:31381' },
  }));
  assert.equal(response.status, 206);
  assert.equal(response.headers.get('content-range'), 'bytes 4-9/16');
  assert.equal(await response.text(), '456789');
  assert.equal(response.headers.get('access-control-allow-origin'), 'http://127.0.0.1:31381');
});

test('failed refresh preserves the previous committed copy', async (t) => {
  const workspace = makeWorkspace(t);
  let fail = false;
  const library = new OfflineMusicLibrary({
    userDataPath: workspace.profile,
    getCacheRoot: () => workspace.cache,
    fetch: async () => fail
      ? new Response('<html>not audio</html>', { status: 200, headers: { 'Content-Type': 'text/html' } })
      : audioResponse(Buffer.from('first-copy')),
  });
  const rawKey = 'netease:100';
  assert.equal((await library.download({ key: rawKey, url: 'https://audio.example/one.mp3', song: { id: 100 } })).ok, true);
  const first = library.resolve(rawKey);
  fail = true;
  const refresh = await library.download({ key: rawKey, url: 'https://audio.example/two.mp3', song: { id: 100 } });
  assert.equal(refresh.ok, false);
  assert.equal(refresh.error, 'OFFLINE_CONTENT_TYPE_REJECTED');
  assert.deepEqual(library.resolve(rawKey), first);
});

test('remove deletes only the managed payload and index entry', async (t) => {
  const workspace = makeWorkspace(t);
  const library = new OfflineMusicLibrary({
    userDataPath: workspace.profile,
    getCacheRoot: () => workspace.cache,
    fetch: async () => audioResponse(Buffer.from('audio-content')),
  });
  const rawKey = 'kugou:hash-1';
  await library.download({ key: rawKey, url: 'https://audio.example/song.mp3', song: { provider: 'kugou', hash: 'hash-1' } });
  const filesBefore = fs.readdirSync(path.join(workspace.cache, 'offline-music'));
  assert.equal(filesBefore.length, 1);
  const removed = await library.remove(rawKey);
  assert.equal(removed.count, 0);
  assert.equal(library.resolve(rawKey).hit, false);
  assert.deepEqual(fs.readdirSync(path.join(workspace.cache, 'offline-music')), []);
});

test('metadata and content validation stay narrow', () => {
  const song = sanitizeSongMetadata({
    provider: 'unknown',
    name: ' Name ',
    duration: 999999,
    spotifyId: 'spotify-track',
    spotifyUri: 'spotify:track:spotify-track',
    providerSongId: 'provider-track',
    additionalSourceCode: 'source-code',
    token: 'secret',
  });
  assert.equal(song.provider, 'netease');
  assert.equal(song.name, 'Name');
  assert.equal(song.duration, 86400);
  assert.equal(song.spotifyId, 'spotify-track');
  assert.equal(song.spotifyUri, 'spotify:track:spotify-track');
  assert.equal(song.providerSongId, 'provider-track');
  assert.equal(song.additionalSourceCode, 'source-code');
  assert.equal(Object.hasOwn(song, 'token'), false);
  assert.equal(acceptedAudioContentType('audio/flac; charset=binary'), true);
  assert.equal(acceptedAudioContentType('application/octet-stream'), true);
  assert.equal(acceptedAudioContentType('text/html'), false);
});

test('index ignores payloads outside its managed cache roots', (t) => {
  const workspace = makeWorkspace(t);
  const key = offlineTrackKey('netease:escaped');
  const foreignDirectory = path.join(workspace.root, 'foreign', 'offline-music');
  fs.mkdirSync(foreignDirectory, { recursive: true });
  const foreignFile = path.join(foreignDirectory, `${key}-foreign.mp3`);
  fs.writeFileSync(foreignFile, 'foreign-audio');
  fs.mkdirSync(workspace.profile, { recursive: true });
  fs.writeFileSync(path.join(workspace.profile, 'offline-music.json'), JSON.stringify({
    version: 1,
    records: [{
      key,
      audioPath: foreignFile,
      contentType: 'audio/mpeg',
      bytes: 13,
      song: { provider: 'netease', id: 'escaped' },
    }],
  }));

  const library = new OfflineMusicLibrary({ userDataPath: workspace.profile, getCacheRoot: () => workspace.cache });
  assert.equal(library.listSync().count, 0);
  assert.equal(library.resolve('netease:escaped').hit, false);
});

test('persisted managed roots keep old copies readable after the cache root changes', async (t) => {
  const workspace = makeWorkspace(t);
  const oldCache = path.join(workspace.root, 'old-cache');
  const nextCache = path.join(workspace.root, 'next-cache');
  const rawKey = 'spotify:track-1';
  const library = new OfflineMusicLibrary({
    userDataPath: workspace.profile,
    getCacheRoot: () => oldCache,
    fetch: async () => audioResponse(Buffer.from('spotify-audio')),
  });
  const result = await library.download({
    key: rawKey,
    url: 'https://audio.example/spotify.mp3',
    song: { provider: 'spotify', spotifyId: 'track-1', spotifyUri: 'spotify:track:track-1' },
  });
  assert.equal(result.ok, true);

  const restored = new OfflineMusicLibrary({ userDataPath: workspace.profile, getCacheRoot: () => nextCache });
  assert.equal(restored.resolve(rawKey).hit, true);
  assert.equal(restored.listSync().bytes, Buffer.byteLength('spotify-audio'));
});

test('progress events are throttled while terminal state is always emitted', async (t) => {
  const workspace = makeWorkspace(t);
  const events = [];
  const chunks = Array.from({ length: 40 }, () => new Uint8Array(1024));
  const body = new ReadableStream({
    start(controller) {
      chunks.forEach((chunk) => controller.enqueue(chunk));
      controller.close();
    },
  });
  const library = new OfflineMusicLibrary({
    userDataPath: workspace.profile,
    getCacheRoot: () => workspace.cache,
    fetch: async () => new Response(body, { status: 200, headers: { 'Content-Type': 'audio/mpeg', 'Content-Length': String(chunks.length * 1024) } }),
    onProgress: (payload) => events.push(payload.status),
  });
  const result = await library.download({ key: 'netease:progress', url: 'https://audio.example/progress.mp3' });
  assert.equal(result.ok, true);
  assert.equal(events[0], 'starting');
  assert.equal(events.at(-1), 'complete');
  assert.ok(events.filter((status) => status === 'downloading').length < chunks.length);
});
