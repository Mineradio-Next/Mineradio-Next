'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const appRoot = path.join(__dirname, '..');
const modulePath = path.join(appRoot, 'public', 'js', 'modules', '05-playback', '07c-platform-rankings.js');

function classList() {
  return { toggle() {}, add() {}, remove() {} };
}

function makeContext(elements) {
  elements = elements || {};
  const context = vm.createContext({
    document: {
      getElementById(id) { return elements[id] || null; },
    },
    homePlatformRecommendationState: { view: 'recommendations', source: 'netease', open: false },
    console: { warn() {}, log() {} },
    Promise,
    Array,
    Object,
    String,
    Number,
    Math,
    isFinite,
    encodeURIComponent,
    escHtml(value) {
      return String(value == null ? '' : value).replace(/[&<>"']/g, character => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
      })[character]);
    },
  });
  vm.runInContext(fs.readFileSync(modulePath, 'utf8'), context, { filename: modulePath });
  return context;
}

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

function song(id, name, provider) {
  return { id, name, artist: '歌手', rankingProvider: provider || 'netease', provider: provider || 'netease' };
}

test('ranking row uses dense icon actions and preserves public provider labels', () => {
  const context = makeContext();
  const html = context.homePlatformRankingRow(song('1', '测试歌曲', 'qq'), 0);
  assert.match(html, /home-platform-ranking-number is-top">01/);
  assert.match(html, /data-home-ranking-action="play"/);
  assert.match(html, /data-home-ranking-action="next"/);
  assert.match(html, /data-home-ranking-action="collect"/);
  assert.match(html, />QQ</);
  assert.doesNotMatch(html, /LX|data-lx/);
});

test('playing one ranking song commits the complete visible chart to the existing queue', async () => {
  const context = makeContext();
  const calls = [];
  context.homePlatformRecommendationState.view = 'rankings';
  context.homePlatformRankingState.provider = 'qq';
  context.homePlatformRankingState.songs = [song('1', '第一首', 'qq'), song('2', '第二首', 'qq')];
  context.playQueue = [song('old', '旧队列')];
  context.currentIdx = 0;
  context.homeForcedOpen = true;
  context.homeSuppressed = true;
  context.cloneSong = item => Object.assign({}, item);
  context.safeRenderQueuePanel = reason => calls.push(['render', reason]);
  context.safeShelfRebuild = reason => calls.push(['shelf', reason]);
  context.closeHomePlatformRecommendations = () => calls.push(['close']);
  context.playQueueAt = async (index, options) => { calls.push(['play', index, options]); return true; };

  assert.equal(context.playHomePlatformRanking(1), true);
  await Promise.resolve();

  assert.deepEqual(Array.from(context.playQueue, item => item.id), ['1', '2']);
  assert.equal(context.currentIdx, 1);
  const play = calls.find(call => call[0] === 'play');
  assert.equal(play[1], 1);
  assert.equal(play[2].context.type, 'platform-ranking');
  assert.equal(play[2].context.playlistName, 'QQ 音乐榜单');
});

test('next and collection actions reuse the existing queue and collection flows', () => {
  const context = makeContext();
  const queued = [];
  const collected = [];
  context.homePlatformRankingState.songs = [song('1', '待操作歌曲', 'netease')];
  context.queueSongNext = item => queued.push(item);
  context.openCollectModal = item => collected.push(item);
  context.showToast = () => {};

  assert.equal(context.queueHomePlatformRankingNext(0), true);
  assert.equal(context.collectHomePlatformRanking(0), true);
  assert.equal(queued[0].id, '1');
  assert.equal(collected[0].id, '1');
});

test('a stale provider response cannot replace a newer ranking selection', async () => {
  const list = { innerHTML: '', classList: classList(), addEventListener() {} };
  const status = { textContent: '', classList: classList() };
  const playAll = { disabled: false, addEventListener() {} };
  const tabs = { querySelectorAll() { return []; }, addEventListener() {} };
  const context = makeContext({
    'home-platform-ranking-list': list,
    'home-platform-ranking-status': status,
    'home-platform-ranking-play-all': playAll,
    'home-platform-ranking-tabs': tabs,
  });
  const first = deferred();
  const second = deferred();
  context.homePlatformRecommendationState.view = 'rankings';
  context.apiJson = endpoint => endpoint.includes('provider=all') ? first.promise : second.promise;

  const older = context.loadHomePlatformRankings('all', false);
  const newer = context.loadHomePlatformRankings('qq', false);
  first.resolve({ ok: true, provider: 'all', chartTitle: '综合榜', songs: [song('old', '旧请求', 'netease')] });
  await older;
  assert.equal(context.homePlatformRankingState.songs.length, 0);

  second.resolve({ ok: true, provider: 'qq', chartTitle: 'QQ 榜', songs: [song('new', '新请求', 'qq')] });
  await newer;
  assert.equal(context.homePlatformRankingState.songs[0].id, 'new');
});

test('empty ranking state never replaces current playback', () => {
  const context = makeContext();
  const existing = [song('old', '旧队列')];
  context.homePlatformRankingState.songs = [];
  context.playQueue = existing;
  context.currentIdx = 4;
  assert.equal(context.playHomePlatformRanking(0), false);
  assert.equal(context.playQueue, existing);
  assert.equal(context.currentIdx, 4);
});

test('project wiring upgrades discovery without introducing LX routes or labels', () => {
  const html = fs.readFileSync(path.join(appRoot, 'public', 'index.html'), 'utf8');
  const css = fs.readFileSync(path.join(appRoot, 'public', 'css', 'index.css'), 'utf8');
  const loader = fs.readFileSync(path.join(appRoot, 'public', 'js', 'index-loader.js'), 'utf8');
  const frontend = fs.readFileSync(modulePath, 'utf8');
  assert.match(html, /id="home-platform-view-switch"/);
  assert.match(html, /data-home-ranking-provider="all"/);
  assert.match(html, /id="home-platform-ranking-list"/);
  assert.match(loader, /07c-platform-rankings\.js/);
  assert.match(frontend, /\/api\/platform-rankings/);
  assert.match(css, /\.home-platform-recommend-tabs\[hidden\][\s\S]{0,240}display:\s*none/);
  assert.match(css, /\.home-platform-recommend-tabs\s*\{[\s\S]{0,180}flex:\s*0 0 auto;[\s\S]{0,180}min-height:\s*32px/);
  assert.doesNotMatch(frontend, /\/api\/lx-|\bLX\b/);
});
