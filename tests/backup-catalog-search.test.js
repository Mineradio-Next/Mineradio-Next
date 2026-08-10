'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  searchBackupCatalog,
  clearSearchCache,
  normalizeKuwoSong,
  normalizeMiguSong
} = require('../backup-catalog-search');

function jsonResponse(body, status) {
  return {
    ok: !status || status < 400,
    status: status || 200,
    async json() { return body; }
  };
}

test.beforeEach(clearSearchCache);

test('normalizes Kuwo and Migu records into Mineradio songs', () => {
  const kuwo = normalizeKuwoSong({
    MUSICRID: 'MUSIC_123', SONGNAME: '晴天', ARTIST: '周杰伦', ALBUM: '叶惠美',
    ALBUMID: '45', DURATION: '269', web_albumpic_short: 'cover.jpg'
  });
  assert.deepEqual({
    id: kuwo.id, name: kuwo.name, artist: kuwo.artist, album: kuwo.album,
    duration: kuwo.duration, interval: kuwo.interval, code: kuwo.additionalSourceCode,
    source: kuwo.source
  }, {
    id: '123', name: '晴天', artist: '周杰伦', album: '叶惠美',
    duration: 269, interval: '4:29', code: 'kw', source: 'backup-source'
  });
  assert.match(kuwo.cover, /^https:\/\/img1\.kuwo\.cn\//);

  const migu = normalizeMiguSong({
    songId: 'mg-1', copyrightId: 'cp-1', name: '夜曲',
    singerList: [{ name: '周杰伦' }], album: '十一月的萧邦', duration: '3:46', img3: 'https://img.test/a.jpg'
  });
  assert.equal(migu.artist, '周杰伦');
  assert.equal(migu.duration, 226);
  assert.equal(migu.additionalSourceCode, 'mg');
  assert.equal(migu.picUrl, 'https://img.test/a.jpg');
});

test('rejects providers outside the explicit backup catalogue allowlist', async () => {
  await assert.rejects(
    searchBackupCatalog('kg', '晴天', { fetchImpl: async () => jsonResponse({}) }),
    /BACKUP_CATALOG_PROVIDER_UNSUPPORTED/
  );
});

test('maps offsets to provider pages and returns pagination metadata', async () => {
  const urls = [];
  const fetchImpl = async url => {
    urls.push(String(url));
    return jsonResponse({ abslist: [{ MUSICRID: 'MUSIC_2', SONGNAME: '歌', DURATION: 60 }], TOTAL: 30 });
  };
  const result = await searchBackupCatalog('kw', '歌', { limit: 10, offset: 20, fetchImpl, sleep: async () => {} });
  assert.match(urls[0], /[?&]pn=2(?:&|$)/);
  assert.match(urls[0], /[?&]rn=10(?:&|$)/);
  assert.equal(result.nextOffset, 30);
  assert.equal(result.hasMore, false);

  clearSearchCache();
  urls.length = 0;
  await searchBackupCatalog('mg', '歌', {
    limit: 12,
    offset: 24,
    fetchImpl: async url => {
      urls.push(String(url));
      return jsonResponse({ songResultData: { resultList: [], totalCount: 0 } });
    },
    sleep: async () => {}
  });
  assert.match(urls[0], /[?&]pageNo=3(?:&|$)/);
});

test('caches successful searches for the same provider page', async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return jsonResponse({ abslist: [{ MUSICRID: 'MUSIC_1', SONGNAME: '歌' }], TOTAL: 1 });
  };
  await searchBackupCatalog('kw', '歌', { limit: 10, offset: 0, fetchImpl, sleep: async () => {} });
  await searchBackupCatalog('kw', '歌', { limit: 10, offset: 0, fetchImpl, sleep: async () => {} });
  assert.equal(calls, 1);
});

test('retries transient network failures twice and then surfaces the error', async () => {
  let calls = 0;
  await assert.rejects(searchBackupCatalog('kw', '歌', {
    fetchImpl: async () => {
      calls += 1;
      throw new Error('network unavailable');
    },
    sleep: async () => {}
  }), /network unavailable/);
  assert.equal(calls, 3);
});
