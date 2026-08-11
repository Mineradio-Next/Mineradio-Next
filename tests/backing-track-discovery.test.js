'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const appRoot = path.resolve(__dirname, '..');
const modulePath = path.join(appRoot, 'public', 'js', 'modules', '05-playback', '07a-backing-track-discovery.js');
const searchPath = path.join(appRoot, 'public', 'js', 'modules', '05-playback', '07-search.js');
const detailPath = path.join(appRoot, 'public', 'js', 'modules', '05-playback', '06-track-detail-lyrics-actions.js');
const loaderPath = path.join(appRoot, 'public', 'js', 'index-loader.js');
const source = fs.readFileSync(modulePath, 'utf8');
const searchSource = fs.readFileSync(searchPath, 'utf8');
const detailSource = fs.readFileSync(detailPath, 'utf8');
const loaderSource = fs.readFileSync(loaderPath, 'utf8');
const {
  BACKING_TRACK_QUEUE_THRESHOLD,
  backingTrackCleanTitle,
  backingTrackQuery,
  backingTrackScore,
  backingTrackAutoQueueEligible,
  backingTrackSongKey,
  backingTrackCurrentSongUnchanged,
  rankBackingTrackCandidates,
  queueBestBackingTrack
} = require(modulePath);

test('builds a focused backing query and removes trailing version noise', () => {
  const song = { name: '晴天 (Live)', artist: '周杰伦' };
  assert.equal(backingTrackCleanTitle(song), '晴天');
  assert.equal(backingTrackQuery(song), '晴天 周杰伦 伴奏');
});

test('scores exact marked backing tracks above unrelated and unmarked versions', () => {
  const current = { name: '晴天', artist: '周杰伦' };
  const exact = backingTrackScore({ name: '晴天（伴奏）', artist: '周杰伦' }, current);
  const instrumental = backingTrackScore({ name: '晴天 Instrumental', artist: '周杰伦' }, current);
  const original = backingTrackScore({ name: '晴天', artist: '周杰伦' }, current);
  const unrelated = backingTrackScore({ name: '夜曲 伴奏', artist: '周杰伦' }, current);
  assert.ok(exact >= BACKING_TRACK_QUEUE_THRESHOLD);
  assert.ok(instrumental >= BACKING_TRACK_QUEUE_THRESHOLD);
  assert.ok(exact > original);
  assert.ok(exact > unrelated);
  assert.ok(unrelated < BACKING_TRACK_QUEUE_THRESHOLD);
});

test('penalizes live medleys, remixes, and covers', () => {
  const current = { name: '晴天', artist: '周杰伦' };
  const clean = backingTrackScore({ name: '晴天 伴奏', artist: '周杰伦' }, current);
  assert.ok(clean > backingTrackScore({ name: '晴天 伴奏 Live 串烧', artist: '周杰伦' }, current));
  assert.ok(clean > backingTrackScore({ name: '晴天 Remix Cover', artist: '其他歌手' }, current));
});

test('auto-queue requires an exact cleaned title and rejects risky versions', () => {
  const current = { name: '晴天', artist: '周杰伦' };
  assert.equal(backingTrackAutoQueueEligible({ name: '晴天 伴奏', artist: '周杰伦' }, current), true);
  assert.equal(backingTrackAutoQueueEligible({ name: '晴天 伴奏', artist: '其他歌手' }, current), false);
  assert.equal(backingTrackAutoQueueEligible({ name: '晴天 伴奏' }, current), false);
  assert.equal(backingTrackAutoQueueEligible({ name: '晴天之后 伴奏', artist: '周杰伦' }, current), false);
  assert.equal(backingTrackAutoQueueEligible({ name: '晴天 伴奏 Live', artist: '周杰伦' }, current), false);
  assert.equal(backingTrackAutoQueueEligible({ name: '晴天 伴奏 Remix', artist: '周杰伦' }, current), false);
  assert.equal(backingTrackAutoQueueEligible({ name: '晴天 翻唱伴奏', artist: '周杰伦' }, current), false);
});

test('keeps provider order for equal scores and queues only a confident best match', () => {
  const current = { name: '晴天', artist: '周杰伦' };
  const candidates = [
    { id: 'low', name: '随机歌曲 伴奏', artist: '其他歌手' },
    { id: 'best', name: '晴天 伴奏', artist: '周杰伦' },
    { id: 'same', name: '晴天 伴奏', artist: '周杰伦' }
  ];
  const ranked = rankBackingTrackCandidates(candidates, current);
  assert.deepEqual(ranked.map(entry => entry.song.id), ['best', 'same', 'low']);
  const queued = [];
  assert.equal(queueBestBackingTrack(ranked, song => queued.push(song)), candidates[1]);
  assert.deepEqual(queued, [candidates[1]]);

  const weak = rankBackingTrackCandidates([{ id: 'weak', name: '晴天', artist: '周杰伦' }], current);
  assert.equal(queueBestBackingTrack(weak, song => queued.push(song)), null);
  const prefix = rankBackingTrackCandidates([{ id: 'prefix', name: '晴天之后 伴奏', artist: '周杰伦' }], current);
  assert.ok(prefix[0].score >= BACKING_TRACK_QUEUE_THRESHOLD);
  assert.equal(queueBestBackingTrack(prefix, song => queued.push(song)), null);
  assert.equal(queued.length, 1);
});

test('switch guard includes provider identity even when numeric song ids collide', () => {
  const provider = song => song.provider;
  const itemKey = song => `song:${song.id}`;
  const origin = { provider: 'netease', id: '123', name: '晴天', artist: '周杰伦' };
  const same = { provider: 'netease', id: '123', name: '晴天', artist: '周杰伦' };
  const otherProvider = { provider: 'qishui', id: '123', name: '晴天', artist: '周杰伦' };
  const originKey = backingTrackSongKey(origin, provider, itemKey);
  assert.equal(backingTrackCurrentSongUnchanged(originKey, same, provider, itemKey), true);
  assert.equal(backingTrackCurrentSongUnchanged(originKey, otherProvider, provider, itemKey), false);
  assert.notEqual(backingTrackSongKey(origin, provider, itemKey), backingTrackSongKey(otherProvider, provider, itemKey));
});

test('integrates through original search, detail, and queue surfaces without derivative routes', () => {
  assert.match(source, /fetchMusicSearchResults\(query, 'song'\)/);
  assert.match(source, /renderSongSearchResults\(songs\)/);
  assert.match(source, /queueBestBackingTrack\(ranked, queueSongNext/);
  assert.match(source, /backingTrackCurrentSongUnchanged\(originSongKey, activeSong\)/);
  assert.match(source, /hasMore: false/);
  assert.doesNotMatch(source, /\/api\/lx-/i);
  assert.match(searchSource, /backingTrackResultClass/);
  assert.match(searchSource, /backingTrackBestTagHtml/);
  assert.match(searchSource, /clearBackingTrackHighlight/);
  assert.match(detailSource, /id="detail-backing-track-action"/);
  assert.match(detailSource, />查找伴奏<\/button>/);
  assert.match(detailSource, /song\.type !== 'podcast-radio'/);
  assert.doesNotMatch(detailSource, /song\.type !== 'podcast'\s*&&/);
  assert.match(detailSource, /setBackingTrackActionBusy/);
  assert.match(loaderSource, /07a-backing-track-discovery\.js/);
});
