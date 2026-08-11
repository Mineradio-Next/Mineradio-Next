'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const modulePath = path.join(root, 'public/js/modules/05-playback/14a-sleep-timer.js');

function makeTimerContext(options = {}) {
  const storage = new Map();
  const calls = [];
  const defaultAudio = options.audio || null;
  const context = vm.createContext({
    console,
    Promise,
    Date,
    JSON,
    Math,
    String,
    Number,
    setInterval: () => 1,
    clearInterval: () => {},
    localStorage: {
      getItem(key) { return storage.has(key) ? storage.get(key) : null; },
      setItem(key, value) { storage.set(key, String(value)); },
      removeItem(key) { storage.delete(key); },
    },
    document: {
      activeElement: null,
      getElementById() { return null; },
      querySelectorAll() { return []; },
      querySelector() { return null; },
      addEventListener() {},
    },
    audio: defaultAudio,
    playing: options.playing === true,
    trackSwitchToken: 7,
    currentIdx: 2,
    cuefieldAutoMixEnabled: true,
    showToast(message) { calls.push(['toast', message]); },
    resetCuefieldAutoMix(reason) { calls.push(['cuefield', reason]); },
    clearAlbumGaplessPreload(reason) { calls.push(['gapless', reason]); },
    scheduleCuefieldAutoMixPrepare(token, index, delay) { calls.push(['cuefield-resume', token, index, delay]); },
    scheduleAlbumGaplessPreloadForCurrent(token, reason) { calls.push(['gapless-resume', token, reason]); },
    setPlayIcon(value) { calls.push(['icon', value]); },
    updateListenStatsTick(value) { calls.push(['stats', value]); },
    syncPlaybackStateFromAudioEvent(reason) { calls.push(['sync', reason]); },
    async fadeOutAndPauseAudio() {
      calls.push(['fade']);
      if (typeof options.fadeOutAndPauseAudio === 'function') {
        await options.fadeOutAndPauseAudio(context, calls);
      } else if (context.audio) {
        if (typeof context.audio.pause === 'function') context.audio.pause();
        else context.audio.paused = true;
      }
    },
  });
  vm.runInContext(fs.readFileSync(modulePath, 'utf8'), context, { filename: modulePath });
  return { context, storage, calls };
}

test('sleep timer normalizes persisted states and formats countdowns', () => {
  const { context } = makeTimerContext();
  assert.deepEqual(
    { ...context.normalizeSleepTimerState({ mode: 'deadline', deadline: 61000, minutes: 30 }, 1000) },
    { mode: 'deadline', deadline: 61000, minutes: 30 }
  );
  assert.deepEqual(
    { ...context.normalizeSleepTimerState({ mode: 'deadline', deadline: 999, minutes: 30 }, 1000) },
    { mode: 'off', deadline: 0, minutes: 0 }
  );
  assert.deepEqual(
    { ...context.normalizeSleepTimerState({ mode: 'track-end' }, 1000) },
    { mode: 'off', deadline: 0, minutes: 0 }
  );
  assert.equal(context.formatSleepTimerRemaining(90000), '1:30');
  assert.equal(context.formatSleepTimerRemaining(3661000), '1:01:01');
});

test('minute presets persist an absolute deadline and can be cancelled', () => {
  const { context, storage, calls } = makeTimerContext();
  const before = Date.now();
  assert.equal(context.setSleepTimerMinutes(30), true);
  assert.equal(context.sleepTimerState.mode, 'deadline');
  assert.equal(context.sleepTimerState.minutes, 30);
  assert.ok(context.sleepTimerState.deadline >= before + 30 * 60000);
  assert.match(storage.get('mineradio-sleep-timer-v1'), /"mode":"deadline"/);
  assert.deepEqual(calls.at(-1), ['toast', '将在 30 分钟后停止播放']);
  assert.equal(context.cancelSleepTimer({ silent: true }), true);
  assert.equal(context.sleepTimerState.mode, 'off');
  assert.equal(storage.has('mineradio-sleep-timer-v1'), false);
});

test('track-end mode blocks transitions and is consumed exactly once', () => {
  const audio = { src: 'track.mp3', ended: false, paused: false };
  const { context, calls } = makeTimerContext({ audio, playing: true });
  assert.equal(context.setSleepTimerTrackEnd(), true);
  assert.equal(context.sleepTimerBlocksUpcomingTransition(), true);
  assert.equal(context.consumeSleepTimerOnTrackEnd(7), true);
  assert.equal(context.consumeSleepTimerOnTrackEnd(7), false);
  assert.equal(context.sleepTimerBlocksUpcomingTransition(), false);
  assert.equal(context.playing, false);
  assert.ok(calls.some((entry) => entry[0] === 'cuefield'));
  assert.ok(calls.some((entry) => entry[0] === 'gapless'));
  assert.ok(calls.some((entry) => entry[0] === 'icon' && entry[1] === false));
});

test('leaving track-end mode restores automatic transition scheduling', () => {
  const audio = { src: 'track.mp3', ended: false, paused: false };
  const { context, calls } = makeTimerContext({ audio, playing: true });
  assert.equal(context.setSleepTimerTrackEnd(), true);
  assert.equal(context.cancelSleepTimer({ silent: true }), true);
  assert.ok(calls.some((entry) => entry[0] === 'cuefield-resume'));
  assert.ok(calls.some((entry) => entry[0] === 'gapless-resume'));

  calls.length = 0;
  assert.equal(context.setSleepTimerTrackEnd(), true);
  assert.equal(context.setSleepTimerMinutes(15), true);
  assert.ok(calls.some((entry) => entry[0] === 'cuefield-resume'));
  assert.ok(calls.some((entry) => entry[0] === 'gapless-resume'));
});

test('paused playback defers restored transitions until playback starts again', () => {
  const audio = { src: 'track.mp3', ended: false, paused: true };
  const { context, calls } = makeTimerContext({ audio, playing: false });
  context.sleepTimerState = { mode: 'track-end', deadline: 0, minutes: 0 };
  assert.equal(context.cancelSleepTimer({ silent: true }), true);
  assert.equal(context.sleepTimerResumeTransitionsPending, true);
  assert.equal(calls.some((entry) => entry[0] === 'cuefield-resume'), false);
  audio.paused = false;
  assert.equal(context.resumeSleepTimerTransitionsAfterPlaybackStart(), true);
  assert.equal(context.sleepTimerResumeTransitionsPending, false);
  assert.ok(calls.some((entry) => entry[0] === 'cuefield-resume'));
  assert.ok(calls.some((entry) => entry[0] === 'gapless-resume'));
});

test('expired deadline clears state and fades active playback to pause', async () => {
  const audio = {
    src: 'track.mp3',
    ended: false,
    paused: false,
    pause() { this.paused = true; },
  };
  const { context, storage, calls } = makeTimerContext({ audio, playing: true });
  context.sleepTimerState = { mode: 'deadline', deadline: 1000, minutes: 15 };
  storage.set('mineradio-sleep-timer-v1', JSON.stringify(context.sleepTimerState));
  assert.equal(await context.executeSleepTimerDeadline(1001), true);
  assert.equal(context.sleepTimerState.mode, 'off');
  assert.equal(audio.paused, true);
  assert.equal(storage.has('mineradio-sleep-timer-v1'), false);
  assert.ok(calls.some((entry) => entry[0] === 'fade'));
  assert.deepEqual(calls.at(-1), ['toast', '定时结束，播放已停止']);
});

test('expired deadline also pauses media that replaces the fading track', async () => {
  const outgoing = { src: 'old.mp3', ended: false, paused: false };
  const replacement = {
    src: 'new.mp3',
    ended: false,
    paused: false,
    pauseCalls: 0,
    pause() {
      this.pauseCalls += 1;
      this.paused = true;
    },
  };
  const { context } = makeTimerContext({
    audio: outgoing,
    playing: true,
    async fadeOutAndPauseAudio(runtime) {
      runtime.audio = replacement;
    },
  });
  context.sleepTimerState = { mode: 'deadline', deadline: 1000, minutes: 15 };
  assert.equal(await context.executeSleepTimerDeadline(1001), true);
  assert.equal(replacement.pauseCalls, 1);
  assert.equal(replacement.paused, true);
  assert.equal(context.sleepTimerState.mode, 'off');
});

test('stopping state rejects replacement timer settings', () => {
  const audio = { src: 'track.mp3', ended: false, paused: false };
  const { context } = makeTimerContext({ audio, playing: true });
  context.sleepTimerState = { mode: 'stopping', deadline: 1000, minutes: 15 };
  assert.equal(context.setSleepTimerMinutes(30), false);
  assert.equal(context.setSleepTimerTrackEnd(), false);
  assert.equal(context.sleepTimerState.mode, 'stopping');
});

test('sleep timer is wired into the player, natural endings, and transition engines', () => {
  const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
  const html = read('public/index.html');
  const css = read('public/css/index.css');
  const loader = read('public/js/index-loader.js');
  const startup = read('public/js/modules/10-shell/05-startup-bindings.js');
  const playback = read('public/js/modules/05-playback/13-playback-start-audio.js');
  const automix = read('public/js/modules/05-playback/18-cuefield-automix-integration.js');
  const timer = read('public/js/modules/05-playback/14a-sleep-timer.js');

  assert.match(html, /id="sleep-timer-control"/);
  assert.match(html, /data-sleep-timer-track-end/);
  assert.match(html, /id="sleep-timer-announcer"[^>]*aria-live="polite"/);
  assert.doesNotMatch(html, /id="sleep-timer-status"[^>]*aria-live=/);
  assert.match(css, /\.sleep-timer-popover/);
  assert.match(css, /\.sleep-timer-popover[\s\S]*?visibility:\s*hidden/);
  assert.match(css, /\.sleep-timer-control\.open \.sleep-timer-popover[\s\S]*?visibility:\s*visible/);
  assert.doesNotMatch(css, /\.sleep-timer-control:focus-within\s+\.sleep-timer-popover/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(loader, /14a-sleep-timer\.js/);
  assert.match(startup, /initSleepTimer\(\)/);
  assert.ok((playback.match(/consumeSleepTimerOnTrackEnd/g) || []).length >= 2);
  assert.match(playback, /sleepTimerBlocksUpcomingTransition/);
  assert.ok((automix.match(/sleepTimerBlocksUpcomingTransition/g) || []).length >= 3);
  assert.match(read('public/js/modules/05-playback/14-player-controls.js'), /resumeSleepTimerTransitionsAfterPlaybackStart/);
  assert.doesNotMatch(timer, /trackSwitchToken\s*\+=\s*1/);
  assert.doesNotMatch(html + timer, /LX\s*Music|Mineradio-LX|落雪/);
});
