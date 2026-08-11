'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const appRoot = path.join(__dirname, '..');
const {
  RANKING_CACHE_TTL_MS,
  createPlatformRankingService,
  mixPlatformRankings,
  normalizeNeteaseRankingSong,
  normalizeQQRankingSong,
  normalizeKugouRankingSong,
  normalizeKuwoRankingSong,
  normalizeMiguRankingSong,
} = require('../platform-rankings');

function song(provider, id, name, artist) {
  return { provider, source: provider, id, name, artist, singer: artist };
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

test('provider normalizers preserve playback identities and public provider names', () => {
  const netease = normalizeNeteaseRankingSong({
    id: 1,
    name: '网易歌曲',
    ar: [{ id: 2, name: '网易歌手' }],
    al: { id: 3, name: '网易专辑', picUrl: 'ne.jpg' },
    dt: 201000,
  });
  assert.equal(netease.provider, 'netease');
  assert.equal(netease.duration, 201000);
  assert.equal(netease.artist, '网易歌手');

  const qq = normalizeQQRankingSong({
    data: {
      songid: 10,
      songmid: 'qq-mid',
      songname: 'QQ 歌曲',
      singer: [{ id: 11, mid: 'artist-mid', name: 'QQ 歌手' }],
      albummid: 'album-mid',
      interval: 180,
    },
  });
  assert.equal(qq.provider, 'qq');
  assert.equal(qq.mid, 'qq-mid');
  assert.equal(qq.duration, 180000);
  assert.match(qq.cover, /album-mid/);

  const kugou = normalizeKugouRankingSong({
    Hash: 'KG-HASH',
    FileName: '酷狗歌手 - 酷狗歌曲',
    author_name: '酷狗歌手',
    audio_id: 12,
    timeLen: 192,
  });
  assert.equal(kugou.provider, 'kugou');
  assert.equal(kugou.hash, 'KG-HASH');
  assert.equal(kugou.name, '酷狗歌曲');

  const kuwo = normalizeKuwoRankingSong({ id: 13, name: '酷我歌曲', artist: '酷我歌手', pic: 'a/b.jpg' });
  assert.equal(kuwo.provider, 'backup-source');
  assert.equal(kuwo.additionalSourceCode, 'kw');
  assert.match(kuwo.cover, /img1\.kuwo\.cn/);

  const migu = normalizeMiguRankingSong({
    resId: 'mg-id',
    copyrightId: 'copyright-id',
    txt: '咪咕歌曲',
    txt2: '咪咕歌手',
    txt3: '咪咕专辑',
    img: 'mg.jpg',
  });
  assert.equal(migu.provider, 'backup-source');
  assert.equal(migu.additionalSourceCode, 'mg');
  assert.equal(migu.copyrightId, 'copyright-id');
});

test('combined rankings round-robin providers and deduplicate equivalent recordings', () => {
  const mixed = mixPlatformRankings([
    { songs: [song('netease', 'ne-1', '晴天', '周杰伦'), song('netease', 'ne-2', '七里香', '周杰伦')] },
    { songs: [song('qq', 'qq-1', '晴天', '周杰伦'), song('qq', 'qq-2', '夜曲', '周杰伦')] },
    { songs: [song('kugou', 'kg-1', '后来', '刘若英')] },
  ], 6);

  assert.deepEqual(mixed.map(item => item.name), ['晴天', '后来', '七里香', '夜曲']);
  assert.deepEqual(mixed.map(item => item.rank), [1, 2, 3, 4]);
});

test('a partial provider failure keeps the combined chart available', async () => {
  const adapters = {
    netease: async () => [song('netease', 'ne-1', '网易歌曲', '歌手')],
    qq: async () => { throw new Error('QQ_DOWN'); },
    kugou: async () => [song('kugou', 'kg-1', '酷狗歌曲', '歌手')],
    kuwo: async () => [song('backup-source', 'kw-1', '酷我歌曲', '歌手')],
    migu: async () => [song('backup-source', 'mg-1', '咪咕歌曲', '歌手')],
  };
  const service = createPlatformRankingService({ adapters });
  const result = await service.getRankings('all', 20, false);

  assert.equal(result.ok, true);
  assert.equal(result.partial, true);
  assert.equal(result.songs.length, 4);
  assert.equal(result.providers.find(item => item.provider === 'qq').ok, false);
  assert.equal(result.providers.find(item => item.provider === 'netease').ok, true);
});

test('single-provider cache lasts six hours and refresh bypasses it', async () => {
  let currentTime = 1000;
  let calls = 0;
  const service = createPlatformRankingService({
    now: () => currentTime,
    adapters: {
      netease: async () => {
        calls += 1;
        return [song('netease', `ne-${calls}`, `歌曲 ${calls}`, '歌手')];
      },
    },
  });

  const first = await service.getRankings('netease', 10, false);
  const cached = await service.getRankings('netease', 10, false);
  assert.equal(calls, 1);
  assert.equal(first.cached, false);
  assert.equal(cached.cached, true);
  assert.equal(cached.songs[0].id, 'ne-1');

  const refreshed = await service.getRankings('netease', 10, true);
  assert.equal(calls, 2);
  assert.equal(refreshed.cached, false);
  assert.equal(refreshed.songs[0].id, 'ne-2');

  currentTime += RANKING_CACHE_TTL_MS + 1;
  await service.getRankings('netease', 10, false);
  assert.equal(calls, 3);
});

test('concurrent identical loads share one upstream request', async () => {
  const pending = deferred();
  let calls = 0;
  const service = createPlatformRankingService({
    adapters: {
      qq: async () => {
        calls += 1;
        return pending.promise;
      },
    },
  });

  const first = service.getRankings('qq', 10, false);
  const second = service.getRankings('qq', 20, false);
  await Promise.resolve();
  assert.equal(calls, 1);
  pending.resolve([song('qq', 'qq-1', 'QQ 歌曲', '歌手')]);

  const [firstResult, secondResult] = await Promise.all([first, second]);
  assert.equal(firstResult.songs[0].id, 'qq-1');
  assert.equal(secondResult.songs[0].id, 'qq-1');
  assert.equal(calls, 1);
});

test('server wiring exposes one Mineradio route with public provider names', () => {
  const server = fs.readFileSync(path.join(appRoot, 'server.js'), 'utf8');
  const backend = fs.readFileSync(path.join(appRoot, 'platform-rankings.js'), 'utf8');
  const packageJson = JSON.parse(fs.readFileSync(path.join(appRoot, 'package.json'), 'utf8'));
  assert.match(server, /require\('\.\/platform-rankings'\)/);
  assert.match(server, /pn === '\/api\/platform-rankings'/);
  assert.match(backend, /'netease', 'qq', 'kugou', 'kuwo', 'migu'/);
  assert.doesNotMatch(backend, /\/api\/lx-|\bLX\b|\btx\b|\bwy\b/);
  assert.ok(packageJson.build.files.includes('platform-rankings.js'));
});
