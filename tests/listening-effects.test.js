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
  assert.equal(context.listeningEffectsState.gains.length, 5);
});

test('builds and applies a five-band graph with compressor protection', () => {
  const { context } = makeContext();
  const audioContext = makeAudioContext();
  context.listeningEffectsState = context.normalizeListeningEffectsState({ enabled: true, preset: 'bass' });
  const graph = context.createListeningEffectsGraph(audioContext);
  assert.ok(graph);
  assert.equal(graph.filters.length, 5);
  assert.equal(graph.filters[0].kind, 'filter');
  assert.equal(graph.compressor.kind, 'compressor');
  assert.strictEqual(graph.input.connections[0], graph.filters[0]);
  assert.strictEqual(graph.filters[4].connections[0], graph.compressor);
  assert.equal(graph.filters[0].gain.value, 5);
  assert.equal(graph.filters[2].gain.value, 0);
  assert.equal(graph.compressor.ratio.value, 2.2);
  context.listeningEffectsState.enabled = false;
  context.applyListeningEffectsToGraph(graph, true);
  assert.equal(graph.filters[0].gain.value, 0);
  assert.equal(graph.compressor.ratio.value, 1);
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

test('updates an already prepared Cuefield graph with the latest preset', () => {
  const { context } = makeContext();
  const active = context.createListeningEffectsGraph(makeAudioContext());
  const prepared = context.createListeningEffectsGraph(makeAudioContext());
  context.listeningEffectsGraph = active;
  context.cuefieldAutoMixPreparedAudio = { __mineradioPreparedAudioGraph: { effects: prepared } };
  context.setListeningEffectsPreset('vocal');
  assert.deepEqual(Array.from(active.filters, (filter) => filter.gain.value), [-3, -1, 2, 4, 2]);
  assert.deepEqual(Array.from(prepared.filters, (filter) => filter.gain.value), [-3, -1, 2, 4, 2]);
});

console.log('OK listening-effects');
