'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const statsSource = fs.readFileSync(path.join(root, 'public/js/modules/05-playback/02-listen-stats.js'), 'utf8');

function createStatsContext(initial = {}) {
  const values = new Map(Object.entries(initial));
  const context = vm.createContext({
    console,
    Date,
    Math,
    Number,
    String,
    Array,
    Object,
    JSON,
    Promise,
    Uint8Array,
    isFinite,
    setTimeout,
    clearTimeout,
    localStorage: {
      getItem: (key) => values.has(key) ? values.get(key) : null,
      setItem: (key, value) => values.set(key, String(value)),
    },
    emptyHomeActive: false,
    HOME_LISTEN_STATS_KEY: 'mineradio-listen-stats-v1',
    LISTEN_HISTORY_LIMIT: 180,
    LISTEN_HISTORY_RESUME_MIN_SECONDS: 10,
    LISTEN_HISTORY_END_GUARD_SECONDS: 15,
    listenStatsState: null,
  });
  vm.runInContext(statsSource, context);
  return { context, values };
}

test('legacy history is normalized, deduplicated, sorted, and bounded', () => {
  const now = Date.now();
  const { context } = createStatsContext({
    'mineradio-listen-stats-v1': JSON.stringify({
      history: [
        { key: 'song:1', name: 'Older', playedAt: now - 1000, duration: 240, progress: 0.5 },
        { key: 'song:1', name: 'Newest', playedAt: now, duration: 240, progress: 0.25 },
        { key: 'song:2', name: 'Done', playedAt: now - 500, duration: 180, completed: true },
      ],
      songs: {}, artists: {}, updatedAt: now,
    }),
  });
  const state = context.loadListenStatsState();
  assert.equal(state.history.length, 2);
  assert.equal(state.history[0].name, 'Newest');
  assert.equal(state.history[0].resumeAt, 60);
  assert.equal(state.history[1].resumeAt, 0);
  assert.equal(state.history[1].progress, 1);
});

test('resume points near the beginning, end, or completion restart from zero', () => {
  const { context } = createStatsContext();
  assert.equal(context.normalizeListenHistoryRecord({ key: 'a', durationSec: 200, resumeAt: 9 }).resumeAt, 0);
  assert.equal(context.normalizeListenHistoryRecord({ key: 'b', durationSec: 200, resumeAt: 186 }).resumeAt, 0);
  assert.equal(context.normalizeListenHistoryRecord({ key: 'c', durationSec: 200, resumeAt: 80 }).resumeAt, 80);
  assert.equal(context.normalizeListenHistoryRecord({ key: 'd', durationSec: 200, resumeAt: 80, completed: true }).resumeAt, 0);
});

test('history metadata drops credential-shaped context and source URLs', () => {
  const { context } = createStatsContext();
  const record = context.normalizeListenHistoryRecord({
    key: 'song:safe',
    name: 'Safe',
    context: { type: 'music-radio', playlistName: '夜间电台', token: 'secret', cookie: 'secret' },
    url: 'https://audio.example/signed?token=secret',
    authorization: 'Bearer secret',
  });
  const serialized = JSON.stringify(record);
  assert.deepEqual(JSON.parse(JSON.stringify(record.context)), { type: 'music-radio', playlistName: '夜间电台' });
  assert.doesNotMatch(serialized, /secret|audio\.example|authorization|cookie|token/i);
});

test('history playback preserves provider identities and does not search for missing local files', () => {
  const actions = fs.readFileSync(path.join(root, 'public/js/modules/05-playback/05-home-actions.js'), 'utf8');
  assert.match(actions, /hash: record\.hash/);
  assert.match(actions, /mixSongId: record\.mixSongId/);
  assert.match(actions, /spotifyId: record\.spotifyId/);
  assert.match(actions, /providerSongId: record\.providerSongId/);
  assert.match(actions, /additionalSourceCode: record\.additionalSourceCode/);
  assert.match(actions, /if \(!song && record && \(record\.localFileId \|\| record\.localKey \|\| record\.sourceKey === 'local'\)\)/);
  assert.match(actions, /本地文件已失效，请重新导入后继续/);
});

test('today history filter uses a local calendar-day cutoff', () => {
  const workspace = fs.readFileSync(path.join(root, 'public/js/modules/06-lyrics/05a-music-library-workspace.js'), 'utf8');
  assert.match(workspace, /today\.setHours\(0, 0, 0, 0\)/);
  assert.match(workspace, /cutoff = today\.getTime\(\)/);
  assert.match(workspace, /Number\(record\.playedAt \|\| 0\) < cutoff/);
  assert.doesNotMatch(workspace, /now - Number\(record\.playedAt/);
});

test('removing and clearing history preserve aggregate song and artist statistics', () => {
  const { context, values } = createStatsContext();
  context.listenStatsState = {
    history: [{ key: 'song:1' }, { key: 'song:2' }],
    songs: { 'song:1': { plays: 4 } },
    artists: { Artist: { plays: 4 } },
    updatedAt: 0,
  };
  assert.equal(context.removeListenHistoryRecord('song:1'), true);
  assert.equal(context.listenStatsState.history.length, 1);
  assert.equal(context.clearListenHistory(), true);
  assert.deepEqual(JSON.parse(values.get('mineradio-listen-stats-v1')).songs, { 'song:1': { plays: 4 } });
  assert.deepEqual(JSON.parse(values.get('mineradio-listen-stats-v1')).artists, { Artist: { plays: 4 } });
});

test('history workflow is owned by Music Library and reuses the normal playback path', () => {
  const workspace = fs.readFileSync(path.join(root, 'public/js/modules/06-lyrics/05a-music-library-workspace.js'), 'utf8');
  const actions = fs.readFileSync(path.join(root, 'public/js/modules/05-playback/05-home-actions.js'), 'utf8');
  const css = fs.readFileSync(path.join(root, 'public/css/music-library.css'), 'utf8');
  const backup = fs.readFileSync(path.join(root, 'public/js/modules/07-fx/00a-full-backup-restore.js'), 'utf8');
  const frontend = `${workspace}\n${actions}\n${css}`;

  assert.match(workspace, /data-library-tab="history"/);
  assert.match(workspace, /data-history-play/);
  assert.match(workspace, /data-history-next/);
  assert.match(workspace, /data-history-remove/);
  assert.match(workspace, /data-history-clear/);
  assert.match(actions, /function playListenHistoryRecord/);
  assert.match(actions, /playQueueAt\(index, \{ manual: true, resumeAt: resumeAt \}\)/);
  assert.match(actions, /function playHomeRecent[\s\S]{0,500}playListenHistoryRecord\(record\)/);
  assert.match(backup, /mineradio-listen-stats-v1/);
  assert.doesNotMatch(frontend, /\bLX\b|落雪|Mineradio-LX/i);
});
