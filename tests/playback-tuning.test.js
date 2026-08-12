'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const modulePath = path.join(root, 'public/js/modules/05-playback/07e-playback-tuning.js');
const source = fs.readFileSync(modulePath, 'utf8');

function contextFor(value) {
  const values = new Map();
  if (value !== undefined) values.set('mineradio-playback-tuning-v1', JSON.stringify(value));
  const context = vm.createContext({
    console,
    Promise,
    Math,
    Number,
    String,
    JSON,
    Object,
    Array,
    Date,
    RegExp,
    Map,
    Set,
    isFinite,
    localStorage: {
      getItem(key) { return values.has(key) ? values.get(key) : null; },
      setItem(key, next) { values.set(key, String(next)); },
    },
    document: {
      getElementById() { return null; },
      querySelectorAll() { return []; },
      addEventListener() {},
    },
    window: {},
    URL: { createObjectURL() { return 'blob:test'; }, revokeObjectURL() {} },
    Blob: function Blob() {},
    setTimeout,
    clearTimeout,
  });
  vm.runInContext(source, context, { filename: modulePath });
  context.__values = values;
  return context;
}

test('playback tuning normalizes persisted speed and pitch', () => {
  const context = contextFor({ speed: 9, pitch: -30 });
  assert.equal(context.playbackTuning.speed, 2);
  assert.equal(context.playbackTuning.pitch, -12);
  const normalized = context.normalizePlaybackTuning({ speed: 1.234, pitch: 4.7 });
  assert.equal(normalized.speed, 1.25);
  assert.equal(normalized.pitch, 5);
  assert.equal(context.formatPlaybackSpeed(1.25), '1.25x');
  assert.equal(context.formatPlaybackPitch(5), '+5 半音');
});

test('media configuration applies rate and native pitch preservation', () => {
  const context = contextFor({ speed: 1.5, pitch: 0 });
  const media = {};
  assert.equal(context.configurePlaybackMediaElement(media), true);
  assert.equal(media.playbackRate, 1.5);
  assert.equal(media.defaultPlaybackRate, 1.5);
  assert.equal(media.preservesPitch, true);
  assert.equal(media.webkitPreservesPitch, true);
  assert.equal(media.mozPreservesPitch, true);
});

test('pitch ratio follows semitone math and reset persists neutral values', () => {
  const context = contextFor({ speed: 0.75, pitch: 12 });
  assert.ok(Math.abs(context.playbackPitchRatio() - 2) < 0.000001);
  context.resetPlaybackTuning();
  assert.equal(context.playbackTuning.speed, 1);
  assert.equal(context.playbackTuning.pitch, 0);
  assert.deepEqual(JSON.parse(context.__values.get('mineradio-playback-tuning-v1')), { speed: 1, pitch: 0 });
});

test('unsupported pitch degrades to neutral without changing speed', () => {
  const context = contextFor({ speed: 1.5, pitch: 5 });
  context.disablePlaybackPitch('test');
  assert.equal(context.playbackPitchSupported, false);
  assert.equal(context.playbackTuning.speed, 1.5);
  assert.equal(context.playbackTuning.pitch, 0);
});

test('late worklet initialization is ignored after pitch graph disposal', async () => {
  const context = contextFor({ speed: 1, pitch: 5 });
  let resolveModule;
  let workletConstructed = 0;
  context.AudioWorkletNode = function AudioWorkletNode() {
    workletConstructed += 1;
    throw new Error('disposed graph must not construct a worklet');
  };
  const connections = [];
  function node() {
    return {
      connect(target) { connections.push(target); },
      disconnect() {},
    };
  }
  const audioContext = {
    state: 'running',
    audioWorklet: { addModule() { return new Promise(resolve => { resolveModule = resolve; }); } },
    createGain: node,
    createScriptProcessor() { throw new Error('disposed graph must not create a fallback'); },
  };
  const graph = context.createPlaybackPitchGraph(audioContext);
  const pending = context.ensurePlaybackPitchGraph(graph);
  context.disconnectPlaybackPitchGraph(graph);
  audioContext.state = 'closed';
  resolveModule();
  assert.equal(await pending, false);
  assert.equal(workletConstructed, 0);
  assert.equal(graph.disposed, true);
  assert.equal(context.playbackTuning.pitch, 5);
});

test('all playback creation paths use the shared media configuration', () => {
  const loader = fs.readFileSync(path.join(root, 'public/js/index-loader.js'), 'utf8');
  const audioGraph = fs.readFileSync(path.join(root, 'public/js/modules/05-playback/08-audio-graph-controls.js'), 'utf8');
  const listening = fs.readFileSync(path.join(root, 'public/js/modules/05-playback/08a-listening-effects.js'), 'utf8');
  const playback = fs.readFileSync(path.join(root, 'public/js/modules/05-playback/13-playback-start-audio.js'), 'utf8');
  const sleep = fs.readFileSync(path.join(root, 'public/js/modules/05-playback/14a-sleep-timer.js'), 'utf8');
  const autoMix = fs.readFileSync(path.join(root, 'public/js/modules/05-playback/18-cuefield-automix-integration.js'), 'utf8');
  const output = fs.readFileSync(path.join(root, 'public/js/modules/05-playback/00-api-quality-output.js'), 'utf8');
  assert.match(loader, /07e-playback-tuning\.js[\s\S]*08-audio-graph-controls\.js/);
  assert.match(audioGraph, /configurePlaybackMediaElement\(audio\)/);
  assert.ok((playback.match(/configurePlaybackMediaElement\((?:audio|media)\)/g) || []).length >= 3);
  assert.ok((autoMix.match(/configurePlaybackMediaElement\(media\)/g) || []).length >= 2);
  assert.match(autoMix, /graph\.pitch = createPlaybackPitchGraph\(audioCtx\)/);
  assert.match(autoMix, /disconnectPlaybackPitchGraph\(graph\.pitch\)/);
  assert.match(playback, /cuefieldCreatePreparedAudioGraph\(media\)[\s\S]*writeAlbumGaplessIncomingGain\(media, 0\)/);
  assert.match(playback, /disposeCuefieldPreparedAudioGraph\(preload\.media\)/);
  assert.match(output, /ensureAudioOutputMirrorGraph\(mirror, sinkId\)/);
  assert.match(output, /graph\.pitch = createPlaybackPitchGraph\(context\)/);
  assert.match(output, /configurePlaybackMediaElement\(mirror\)/);
  assert.match(output, /disposeAudioOutputMirrorGraph\(mirror\)/);
  assert.match(source, /listening-effects-control\.open[\s\S]*sleep-timer-control\.open/);
  assert.match(listening, /setPlaybackTuningPanelOpen\(false\)/);
  assert.match(sleep, /playback-tuning-control\.open/);
  assert.match(audioGraph, /disablePlaybackPitch\('direct-output'\)/);
});

test('playback tuning UI stays in grouped player tools without changing transport', () => {
  const html = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
  const css = fs.readFileSync(path.join(root, 'public/css/index.css'), 'utf8');
  const chrome = fs.readFileSync(path.join(root, 'public/js/modules/01-scene/04-bottom-controls-cursor.js'), 'utf8');
  const backup = fs.readFileSync(path.join(root, 'public/js/modules/07-fx/00a-full-backup-restore.js'), 'utf8');
  assert.match(html, /id="playback-tuning-control"[\s\S]*id="playback-speed-slider"[\s\S]*id="playback-pitch-slider"/);
  assert.match(chrome, /\['播放', \[[\s\S]*playback-tuning-control[\s\S]*\['声音', \[/);
  assert.match(css, /\.playback-tuning-popover[\s\S]*width:\s*min\(326px, calc\(100vw - 24px\)\)/);
  assert.match(css, /\.player-tool-group \+ \.player-tool-group/);
  assert.match(backup, /mineradio-playback-tuning-v1/);
  assert.doesNotMatch(source + html, /\bLX\b|落雪|衍生项目/i);
});
