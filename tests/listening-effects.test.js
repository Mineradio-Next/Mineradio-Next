'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const modulePath = path.join(__dirname, '..', 'public', 'js', 'modules', '05-playback', '08a-listening-effects.js');
const graphPath = path.join(__dirname, '..', 'public', 'js', 'modules', '05-playback', '08-audio-graph-controls.js');
const cuefieldPath = path.join(__dirname, '..', 'public', 'js', 'modules', '05-playback', '18-cuefield-automix-integration.js');

function makeParam(value = 0) {
  return {
    value,
    setTargetAtTime(next) { this.value = next; },
    cancelScheduledValues() {},
    setValueAtTime(next) { this.value = next; },
  };
}

function makeNode(kind) {
  return {
    kind,
    connections: [],
    connect(target) { this.connections.push(target); },
    disconnect() {},
  };
}

function makeAudioContext() {
  return {
    currentTime: 0,
    sampleRate: 12000,
    createGain() {
      const node = makeNode('gain');
      node.gain = makeParam(1);
      return node;
    },
    createBiquadFilter() {
      const node = makeNode('filter');
      node.gain = makeParam(0);
      node.frequency = makeParam(0);
      node.Q = makeParam(0);
      return node;
    },
    createDynamicsCompressor() {
      const node = makeNode('compressor');
      node.threshold = makeParam(0);
      node.knee = makeParam(0);
      node.ratio = makeParam(1);
      node.attack = makeParam(0);
      node.release = makeParam(0);
      return node;
    },
    createConvolver() {
      const node = makeNode('convolver');
      node.buffer = null;
      return node;
    },
    createChannelSplitter() {
      return makeNode('splitter');
    },
    createChannelMerger() {
      return makeNode('merger');
    },
    createBuffer(channels, length, sampleRate) {
      const data = Array.from({ length: channels }, () => new Float32Array(length));
      return {
        numberOfChannels: channels,
        length,
        sampleRate,
        getChannelData(channel) { return data[channel]; },
      };
    },
  };
}

function makeContext(storage = {}) {
  const store = new Map(Object.entries(storage));
  const context = vm.createContext({
    localStorage: {
      getItem(key) { return store.has(key) ? store.get(key) : null; },
      setItem(key, value) { store.set(key, String(value)); },
    },
    document: { getElementById() { return null; }, querySelectorAll() { return []; } },
    audioReady: false,
    source: null,
    console: { warn() {}, log() {} },
    isFinite,
    Math,
    Number,
    JSON,
  });
  vm.runInContext(fs.readFileSync(modulePath, 'utf8'), context, { filename: modulePath });
  return { context, store };
}

test('normalizes corrupt state and keeps five EQ bands', () => {
  const { context } = makeContext({
    'mineradio-listening-effects-v1': JSON.stringify({ enabled: true, preset: 'missing', gains: [99, -99, 'bad', 1.24] }),
  });
  const state = context.normalizeListeningEffectsState({ enabled: true, preset: 'missing', gains: [99, -99, 'bad', 1.24] });
  assert.deepEqual(Array.from(state.gains), [0, 0, 0, 0, 0]);
  assert.equal(state.preset, 'flat');
  assert.equal(state.enabled, false);
  assert.equal(state.ambience, 'off');
  assert.equal(state.ambienceAmount, 0);
  assert.equal(state.width, 1);
  assert.equal(state.protection, true);
  assert.equal(context.listeningEffectsState.gains.length, 5);

  const invalidWidth = context.normalizeListeningEffectsState({ enabled: true, preset: 'flat', width: 'broken' });
  assert.equal(invalidWidth.width, 1);
  assert.equal(invalidWidth.enabled, false);
});

test('builds and applies EQ, ambience, width, and peak protection in one graph', () => {
  const { context } = makeContext();
  const audioContext = makeAudioContext();
  context.listeningEffectsState = context.normalizeListeningEffectsState({
    enabled: true,
    preset: 'bass',
    ambience: 'room',
    ambienceAmount: 0.14,
    width: 1.3,
    protection: true,
  });
  const graph = context.createListeningEffectsGraph(audioContext);
  assert.ok(graph);
  assert.equal(graph.filters.length, 5);
  assert.equal(graph.filters[0].kind, 'filter');
  assert.equal(graph.convolver.kind, 'convolver');
  assert.ok(graph.convolver.buffer);
  assert.equal(graph.convolver.buffer.numberOfChannels, 2);
  assert.equal(graph.widthInput.kind, 'gain');
  assert.equal(graph.widthInput.channelCount, 2);
  assert.equal(graph.widthInput.channelCountMode, 'explicit');
  assert.equal(graph.widthInput.channelInterpretation, 'speakers');
  assert.strictEqual(graph.ambienceMix.connections[0], graph.widthInput);
  assert.strictEqual(graph.widthInput.connections[0], graph.splitter);
  assert.equal(graph.widthGains.length, 4);
  assert.equal(graph.compressor.kind, 'compressor');
  assert.strictEqual(graph.input.connections[0], graph.filters[0]);
  assert.strictEqual(graph.filters[4].connections[0], graph.dry);
  assert.strictEqual(graph.dry.connections[0], graph.ambienceMix);
  assert.strictEqual(graph.merger.connections[0], graph.compressor);
  assert.equal(graph.filters[0].gain.value, 5);
  assert.equal(graph.filters[2].gain.value, 0);
  assert.equal(graph.wet.gain.value, 0.14);
  assert.deepEqual(Array.from(graph.widthGains, (node) => Number(node.gain.value.toFixed(2))), [1.15, -0.15, -0.15, 1.15]);
  assert.equal(graph.compressor.ratio.value, 12);
  context.listeningEffectsState.enabled = false;
  context.applyListeningEffectsToGraph(graph, true);
  assert.equal(graph.filters[0].gain.value, 0);
  assert.equal(graph.wet.gain.value, 0);
  assert.deepEqual(Array.from(graph.widthGains, (node) => node.gain.value), [1, 0, 0, 1]);
  assert.equal(graph.compressor.ratio.value, 1);
});

test('normalizes spatial controls while the master switch remains authoritative', () => {
  const { context } = makeContext();
  const state = context.normalizeListeningEffectsState({
    enabled: true,
    preset: 'flat',
    ambience: 'missing',
    ambienceAmount: 4,
    width: 9,
    protection: true,
  });
  assert.equal(state.enabled, true);
  assert.equal(state.ambience, 'off');
  assert.equal(state.ambienceAmount, 0);
  assert.equal(state.width, 1.4);
  assert.equal(state.protection, true);

  const protectionOnly = context.normalizeListeningEffectsState({ enabled: true, preset: 'flat', protection: true });
  assert.equal(protectionOnly.enabled, false);

  const bypass = context.normalizeListeningEffectsState({ enabled: false, preset: 'flat', ambience: 'hall', width: 1.2 });
  assert.equal(bypass.enabled, false);
  assert.equal(bypass.ambience, 'hall');
  assert.equal(bypass.ambienceAmount, 0.18);
  assert.equal(bypass.width, 1.2);
});

test('returning width to 100 percent disables an otherwise flat effect and persists it', () => {
  const { context, store } = makeContext();
  context.listeningEffectsState = context.normalizeListeningEffectsState({ enabled: true, preset: 'flat', width: 1.2 });
  context.updateListeningWidth(1);
  assert.equal(context.listeningEffectsState.width, 1);
  assert.equal(context.listeningEffectsState.enabled, false);
  const saved = JSON.parse(store.get('mineradio-listening-effects-v1'));
  assert.equal(saved.width, 1);
  assert.equal(saved.enabled, false);
});

test('playback and cuefield graph modules reference the same effects contract', () => {
  const playback = fs.readFileSync(graphPath, 'utf8');
  const cuefield = fs.readFileSync(cuefieldPath, 'utf8');
  assert.match(playback, /createListeningEffectsGraph\(audioCtx\)/);
  assert.match(playback, /listeningEffectsGraph\.output\.connect\(gainNode\)/);
  assert.match(cuefield, /graph\.effects = createListeningEffectsGraph\(audioCtx\)/);
  assert.match(cuefield, /graph\.effects\.output\.connect\(graph\.gainNode\)/);
  assert.match(cuefield, /disconnectListeningEffectsGraph\(graph\.effects\)/);
});

test('updates an already prepared Cuefield graph with all listening controls', () => {
  const { context } = makeContext();
  const audioContext = makeAudioContext();
  let impulseBuilds = 0;
  const createBuffer = audioContext.createBuffer;
  audioContext.createBuffer = (...args) => {
    impulseBuilds += 1;
    return createBuffer(...args);
  };
  const active = context.createListeningEffectsGraph(audioContext);
  const prepared = context.createListeningEffectsGraph(audioContext);
  context.listeningEffectsGraph = active;
  context.cuefieldAutoMixPreparedAudio = { __mineradioPreparedAudioGraph: { effects: prepared } };
  context.setListeningEffectsPreset('vocal');
  context.setListeningAmbience('room');
  context.updateListeningAmbienceAmount(0.16);
  context.updateListeningWidth(1.2);
  assert.deepEqual(Array.from(active.filters, (filter) => filter.gain.value), [-3, -1, 2, 4, 2]);
  assert.deepEqual(Array.from(prepared.filters, (filter) => filter.gain.value), [-3, -1, 2, 4, 2]);
  assert.equal(active.wet.gain.value, 0.16);
  assert.equal(prepared.wet.gain.value, 0.16);
  assert.deepEqual(Array.from(active.widthGains, (node) => Number(node.gain.value.toFixed(2))), [1.1, -0.1, -0.1, 1.1]);
  assert.deepEqual(Array.from(prepared.widthGains, (node) => Number(node.gain.value.toFixed(2))), [1.1, -0.1, -0.1, 1.1]);
  assert.equal(active.compressor.ratio.value, 12);
  assert.equal(prepared.compressor.ratio.value, 12);
  assert.strictEqual(active.convolver.buffer, prepared.convolver.buffer);
  assert.equal(impulseBuilds, 1);
});

console.log('OK listening-effects');
