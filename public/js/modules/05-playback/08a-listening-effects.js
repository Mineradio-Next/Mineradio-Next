'use strict';

var LISTENING_EFFECTS_KEY = 'mineradio-listening-effects-v1';
var LISTENING_EFFECTS_BANDS = [
  { id: '80', frequency: 80, label: '80 Hz' },
  { id: '250', frequency: 250, label: '250 Hz' },
  { id: '1k', frequency: 1000, label: '1 kHz' },
  { id: '4k', frequency: 4000, label: '4 kHz' },
  { id: '12k', frequency: 12000, label: '12 kHz' }
];
var LISTENING_EFFECTS_PRESETS = {
  flat: [0, 0, 0, 0, 0],
  bass: [5, 3, 0, -1, 1],
  vocal: [-3, -1, 2, 4, 2],
  live: [2, 1, -1, 2, 4],
  night: [-4, -2, 1, 2, -1]
};
var LISTENING_EFFECTS_PRESET_LABELS = {
  flat: '原声', bass: '低频', vocal: '人声', live: '现场', night: '夜间', custom: '自定义'
};
var LISTENING_AMBIENCE_PRESETS = {
  off: { label: '关闭', decay: 0.5, amount: 0 },
  studio: { label: '近场', decay: 0.65, amount: 0.06 },
  room: { label: '小房间', decay: 1.15, amount: 0.12 },
  hall: { label: '音乐厅', decay: 2.75, amount: 0.18 }
};
var listeningEffectsState = readListeningEffectsState();
var listeningEffectsGraph = null;
var listeningAmbienceImpulseCache = typeof WeakMap === 'function' ? new WeakMap() : null;

function listeningEffectsClamp(value, min, max) {
  value = Number(value);
  if (!isFinite(value)) value = 0;
  return Math.max(min, Math.min(max, value));
}

function listeningEffectsDefaultState() {
  return {
    enabled: false,
    preset: 'flat',
    gains: LISTENING_EFFECTS_PRESETS.flat.slice(),
    ambience: 'off',
    ambienceAmount: 0,
    width: 1,
    protection: true
  };
}

function listeningEffectsHasProcessing(state) {
  return state.preset !== 'flat' || state.ambience !== 'off' || Math.abs(state.width - 1) > 0.001;
}

function normalizeListeningEffectsState(raw) {
  var fallback = listeningEffectsDefaultState();
  raw = raw && typeof raw === 'object' ? raw : {};
  var preset = String(raw.preset || fallback.preset).toLowerCase();
  if (!Object.prototype.hasOwnProperty.call(LISTENING_EFFECTS_PRESETS, preset) && preset !== 'custom') return fallback;
  var rawGains = preset === 'custom' && Array.isArray(raw.gains) ? raw.gains : LISTENING_EFFECTS_PRESETS[preset] || fallback.gains;
  var gains = LISTENING_EFFECTS_BANDS.map(function (_, index) {
    return Math.round(listeningEffectsClamp(rawGains[index], -9, 9) * 10) / 10;
  });
  var ambience = Object.prototype.hasOwnProperty.call(LISTENING_AMBIENCE_PRESETS, raw.ambience) ? raw.ambience : 'off';
  var ambienceDefault = LISTENING_AMBIENCE_PRESETS[ambience].amount;
  var ambienceAmount = raw.ambienceAmount == null ? ambienceDefault : listeningEffectsClamp(raw.ambienceAmount, 0, 0.3);
  if (ambience === 'off') ambienceAmount = 0;
  var rawWidth = raw.width == null ? 1 : Number(raw.width);
  if (!isFinite(rawWidth)) rawWidth = 1;
  var width = Math.round(listeningEffectsClamp(rawWidth, 0.7, 1.4) * 100) / 100;
  var normalized = { preset: preset, ambience: ambience, width: width };
  return {
    enabled: raw.enabled === true && listeningEffectsHasProcessing(normalized),
    preset: preset,
    gains: gains,
    ambience: ambience,
    ambienceAmount: Math.round(ambienceAmount * 100) / 100,
    width: width,
    protection: raw.protection !== false
  };
}

function readListeningEffectsState() {
  try {
    return normalizeListeningEffectsState(JSON.parse(localStorage.getItem(LISTENING_EFFECTS_KEY) || '{}'));
  } catch (_) {
    return listeningEffectsDefaultState();
  }
}

function saveListeningEffectsState() {
  try {
    localStorage.setItem(LISTENING_EFFECTS_KEY, JSON.stringify(listeningEffectsState));
  } catch (_) { }
}

function listeningEffectsSetParam(param, value, context, immediate) {
  if (!param) return;
  var now = context && isFinite(context.currentTime) ? context.currentTime : 0;
  if (!immediate && typeof param.setTargetAtTime === 'function') {
    try { param.setTargetAtTime(value, now, 0.045); return; } catch (_) { }
  }
  try {
    if (typeof param.cancelScheduledValues === 'function') param.cancelScheduledValues(now);
    if (typeof param.setValueAtTime === 'function') param.setValueAtTime(value, now);
    else param.value = value;
  } catch (_) {
    try { param.value = value; } catch (_) { }
  }
}

function buildListeningAmbienceImpulse(context, ambience) {
  if (!context || typeof context.createBuffer !== 'function') return null;
  var preset = LISTENING_AMBIENCE_PRESETS[ambience] || LISTENING_AMBIENCE_PRESETS.off;
  if (ambience === 'off') return null;
  var sampleRate = Math.max(8000, Math.min(96000, Number(context.sampleRate) || 44100));
  var length = Math.max(1, Math.floor(sampleRate * Math.min(3.4, preset.decay)));
  var buffer = context.createBuffer(2, length, sampleRate);
  for (var channel = 0; channel < 2; channel++) {
    var data = buffer.getChannelData(channel);
    var seed = 7919 + channel * 101 + Math.round(preset.decay * 100);
    for (var index = 0; index < length; index++) {
      seed = (seed * 16807) % 2147483647;
      var noise = seed / 1073741823.5 - 1;
      var progress = index / length;
      var envelope = Math.pow(1 - progress, ambience === 'hall' ? 2.1 : 2.7);
      var early = index < sampleRate * 0.045 ? (1 - index / (sampleRate * 0.045)) * 0.14 : 0;
      data[index] = noise * envelope * 0.58 + noise * early;
    }
  }
  return buffer;
}

function getListeningAmbienceImpulse(context, ambience) {
  if (!context || ambience === 'off') return null;
  if (!listeningAmbienceImpulseCache) return buildListeningAmbienceImpulse(context, ambience);
  var contextCache = listeningAmbienceImpulseCache.get(context);
  if (!contextCache) {
    contextCache = Object.create(null);
    listeningAmbienceImpulseCache.set(context, contextCache);
  }
  if (!Object.prototype.hasOwnProperty.call(contextCache, ambience)) {
    contextCache[ambience] = buildListeningAmbienceImpulse(context, ambience);
  }
  return contextCache[ambience];
}

function refreshListeningAmbienceImpulse(graph, force) {
  if (!graph || !graph.convolver) return false;
  var state = normalizeListeningEffectsState(listeningEffectsState);
  var signature = state.ambience;
  if (!force && graph.ambienceSignature === signature) return true;
  graph.ambienceSignature = signature;
  try {
    graph.convolver.buffer = getListeningAmbienceImpulse(graph.context, signature);
    return true;
  } catch (error) {
    graph.convolver.buffer = null;
    console.warn('[ListeningEffects] ambience unavailable:', error && error.message || error);
    return false;
  }
}

function connectListeningWidthMatrix(context, graph, input) {
  if (!context || !graph || !input || typeof context.createChannelSplitter !== 'function' || typeof context.createChannelMerger !== 'function') return input;
  try {
    graph.widthInput = context.createGain();
    graph.widthInput.channelCount = 2;
    graph.widthInput.channelCountMode = 'explicit';
    graph.widthInput.channelInterpretation = 'speakers';
    graph.splitter = context.createChannelSplitter(2);
    graph.merger = context.createChannelMerger(2);
    graph.widthGains = [];
    input.connect(graph.widthInput);
    graph.widthInput.connect(graph.splitter);
    function route(inputChannel, outputChannel) {
      var gain = context.createGain();
      graph.splitter.connect(gain, inputChannel);
      gain.connect(graph.merger, 0, outputChannel);
      graph.widthGains.push(gain);
    }
    route(0, 0);
    route(1, 0);
    route(0, 1);
    route(1, 1);
    return graph.merger;
  } catch (error) {
    console.warn('[ListeningEffects] width matrix unavailable:', error && error.message || error);
    graph.widthInput = null;
    graph.splitter = null;
    graph.merger = null;
    graph.widthGains = [];
    return input;
  }
}

function createListeningEffectsGraph(context) {
  if (!context || typeof context.createGain !== 'function' || typeof context.createBiquadFilter !== 'function') return null;
  try {
    var graph = {
      context: context,
      input: context.createGain(),
      filters: [],
      dry: null,
      convolver: null,
      wet: null,
      ambienceMix: null,
      widthInput: null,
      splitter: null,
      merger: null,
      widthGains: [],
      compressor: null,
      output: null,
      ambienceSignature: ''
    };
    var current = graph.input;
    LISTENING_EFFECTS_BANDS.forEach(function (band) {
      var filter = context.createBiquadFilter();
      filter.type = 'peaking';
      filter.frequency.value = band.frequency;
      filter.Q.value = band.frequency < 1000 ? 0.92 : 1.05;
      graph.filters.push(filter);
      current.connect(filter);
      current = filter;
    });
    graph.dry = context.createGain();
    graph.ambienceMix = context.createGain();
    current.connect(graph.dry);
    graph.dry.connect(graph.ambienceMix);
    if (typeof context.createConvolver === 'function' && typeof context.createBuffer === 'function') {
      graph.convolver = context.createConvolver();
      graph.wet = context.createGain();
      current.connect(graph.convolver);
      graph.convolver.connect(graph.wet);
      graph.wet.connect(graph.ambienceMix);
    }
    current = connectListeningWidthMatrix(context, graph, graph.ambienceMix);
    graph.compressor = typeof context.createDynamicsCompressor === 'function' ? context.createDynamicsCompressor() : null;
    if (graph.compressor) {
      current.connect(graph.compressor);
      graph.output = graph.compressor;
      graph.compressor.knee.value = 8;
      graph.compressor.attack.value = 0.003;
      graph.compressor.release.value = 0.16;
      graph.compressor.ratio.value = 2.2;
    } else {
      graph.output = current;
    }
    applyListeningEffectsToGraph(graph, true);
    return graph;
  } catch (error) {
    try { disconnectListeningEffectsGraph(graph); } catch (_) { }
    console.warn('[ListeningEffects] graph unavailable:', error && error.message || error);
    return null;
  }
}

function disconnectListeningEffectsGraph(graph) {
  if (!graph) return;
  [graph.input]
    .concat(graph.filters || [])
    .concat([graph.dry, graph.convolver, graph.wet, graph.ambienceMix, graph.widthInput, graph.splitter, graph.merger])
    .concat(graph.widthGains || [])
    .concat([graph.compressor, graph.output])
    .forEach(function (node) {
    if (!node || typeof node.disconnect !== 'function') return;
    try { node.disconnect(); } catch (_) { }
  });
}

function applyListeningEffectsToGraph(graph, immediate) {
  if (!graph || !graph.context) return false;
  var state = normalizeListeningEffectsState(listeningEffectsState);
  (graph.filters || []).forEach(function (filter, index) {
    var gain = state.enabled ? state.gains[index] : 0;
    if (filter.gain) listeningEffectsSetParam(filter.gain, state.enabled ? gain : 0, graph.context, immediate);
  });
  var ambienceAmount = state.enabled && state.ambience !== 'off' ? state.ambienceAmount : 0;
  if (graph.dry && graph.dry.gain) listeningEffectsSetParam(graph.dry.gain, 1 - ambienceAmount * 0.22, graph.context, immediate);
  if (graph.wet && graph.wet.gain) listeningEffectsSetParam(graph.wet.gain, ambienceAmount, graph.context, immediate);
  refreshListeningAmbienceImpulse(graph, false);
  if (graph.widthGains && graph.widthGains.length === 4) {
    var width = state.enabled ? state.width : 1;
    var same = (1 + width) / 2;
    var cross = (1 - width) / 2;
    [same, cross, cross, same].forEach(function (value, index) {
      listeningEffectsSetParam(graph.widthGains[index].gain, value, graph.context, immediate);
    });
  }
  if (graph.compressor) {
    var protectionEnabled = state.enabled && state.protection;
    listeningEffectsSetParam(graph.compressor.threshold, protectionEnabled ? -3 : 0, graph.context, immediate);
    listeningEffectsSetParam(graph.compressor.knee, protectionEnabled ? 6 : 0, graph.context, immediate);
    listeningEffectsSetParam(graph.compressor.ratio, protectionEnabled ? 12 : 1, graph.context, immediate);
    listeningEffectsSetParam(graph.compressor.attack, state.enabled ? 0.003 : 0.001, graph.context, immediate);
    listeningEffectsSetParam(graph.compressor.release, protectionEnabled ? 0.12 : 0.08, graph.context, immediate);
  }
  return true;
}

function applyListeningEffectsToPlaybackGraphs(immediate) {
  applyListeningEffectsToGraph(listeningEffectsGraph, immediate);
  var preparedMedia = typeof cuefieldAutoMixPreparedAudio !== 'undefined' ? cuefieldAutoMixPreparedAudio : null;
  var preparedGraph = preparedMedia && preparedMedia.__mineradioPreparedAudioGraph;
  if (preparedGraph && preparedGraph.effects && preparedGraph.effects !== listeningEffectsGraph) {
    applyListeningEffectsToGraph(preparedGraph.effects, immediate);
  }
}

function setListeningEffectsGraph(graph) {
  listeningEffectsGraph = graph || null;
  applyListeningEffectsToGraph(listeningEffectsGraph, false);
  updateListeningEffectsControls();
}

function listeningEffectsGraphSupported() {
  return !!(listeningEffectsGraph && typeof source !== 'undefined' && source && !source.__mineradioUsesCapture);
}

function listeningEffectsStatusText() {
  if (!audioReady) return '播放后可应用听感调节';
  if (!listeningEffectsGraphSupported()) return '当前音频回退为直出';
  if (!listeningEffectsState.enabled) return '原声直出';
  var parts = ['已应用'];
  if (listeningEffectsState.ambience !== 'off') parts.push(LISTENING_AMBIENCE_PRESETS[listeningEffectsState.ambience].label);
  if (Math.abs(listeningEffectsState.width - 1) > 0.001) parts.push(Math.round(listeningEffectsState.width * 100) + '% 宽度');
  return parts.join(' · ');
}

function updateListeningRangeVisual(input, neutralValue) {
  if (!input) return;
  var min = Number(input.min);
  var max = Number(input.max);
  var value = Number(input.value);
  if (!isFinite(min) || !isFinite(max) || max <= min || !isFinite(value)) return;
  neutralValue = isFinite(Number(neutralValue)) ? Number(neutralValue) : min;
  neutralValue = listeningEffectsClamp(neutralValue, min, max);
  value = listeningEffectsClamp(value, min, max);
  var valuePercent = (value - min) / (max - min) * 100;
  var neutralPercent = (neutralValue - min) / (max - min) * 100;
  input.style.setProperty('--listening-fill-start', Math.min(valuePercent, neutralPercent).toFixed(2) + '%');
  input.style.setProperty('--listening-fill-end', Math.max(valuePercent, neutralPercent).toFixed(2) + '%');
  input.style.setProperty('--listening-neutral', neutralPercent.toFixed(2) + '%');
  input.setAttribute('data-listening-direction', value > neutralValue ? 'positive' : (value < neutralValue ? 'negative' : 'neutral'));
}

function updateListeningEffectsControls() {
  document.querySelectorAll('[data-listening-toggle]').forEach(function (toggle) {
    toggle.classList.toggle('on', listeningEffectsState.enabled);
    toggle.setAttribute('aria-checked', listeningEffectsState.enabled ? 'true' : 'false');
  });
  document.querySelectorAll('[data-listening-preset]').forEach(function (button) {
    var active = button.getAttribute('data-listening-preset') === listeningEffectsState.preset;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
  LISTENING_EFFECTS_BANDS.forEach(function (band, index) {
    document.querySelectorAll('[data-listening-band-index="' + index + '"]').forEach(function (input) {
      input.value = listeningEffectsState.gains[index];
      updateListeningRangeVisual(input, 0);
      var output = input.parentElement && input.parentElement.querySelector('output');
      if (output) {
        var value = Number(listeningEffectsState.gains[index]) || 0;
        output.textContent = (value > 0 ? '+' : '') + value.toFixed(1).replace('.0', '') + ' dB';
      }
    });
  });
  document.querySelectorAll('[data-listening-ambience]').forEach(function (button) {
    var active = button.getAttribute('data-listening-ambience') === listeningEffectsState.ambience;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
  document.querySelectorAll('[data-listening-ambience-amount]').forEach(function (input) {
    input.value = listeningEffectsState.ambienceAmount;
    updateListeningRangeVisual(input, 0);
    var output = input.parentElement && input.parentElement.querySelector('output');
    if (output) output.textContent = Math.round(listeningEffectsState.ambienceAmount * 100) + '%';
  });
  document.querySelectorAll('[data-listening-width]').forEach(function (input) {
    input.value = listeningEffectsState.width;
    updateListeningRangeVisual(input, 1);
    var output = input.parentElement && input.parentElement.querySelector('output');
    if (output) output.textContent = Math.round(listeningEffectsState.width * 100) + '%';
  });
  document.querySelectorAll('[data-listening-protection-toggle]').forEach(function (toggle) {
    toggle.classList.toggle('on', listeningEffectsState.protection);
    toggle.setAttribute('aria-checked', listeningEffectsState.protection ? 'true' : 'false');
  });
  document.querySelectorAll('[data-listening-status]').forEach(function (status) {
    status.classList.toggle('ready', listeningEffectsGraphSupported());
    status.textContent = listeningEffectsStatusText();
  });
  var button = document.getElementById('listening-effects-btn');
  if (button) button.classList.toggle('active', listeningEffectsState.enabled);
}

function toggleListeningEffects() {
  listeningEffectsState.enabled = !listeningEffectsState.enabled;
  if (listeningEffectsState.enabled && listeningEffectsState.preset === 'flat' && listeningEffectsState.ambience === 'off' && Math.abs(listeningEffectsState.width - 1) < 0.001) {
    listeningEffectsState.preset = 'custom';
  }
  saveListeningEffectsState();
  applyListeningEffectsToPlaybackGraphs(false);
  updateListeningEffectsControls();
  if (typeof showToast === 'function') showToast(listeningEffectsState.enabled ? '听感调节已开启' : '已恢复原声');
}

function setListeningEffectsPreset(preset) {
  preset = String(preset || '').toLowerCase();
  if (preset !== 'custom' && !Object.prototype.hasOwnProperty.call(LISTENING_EFFECTS_PRESETS, preset)) return;
  listeningEffectsState.preset = preset;
  if (preset !== 'custom') listeningEffectsState.gains = LISTENING_EFFECTS_PRESETS[preset].slice();
  listeningEffectsState.enabled = preset !== 'flat' || listeningEffectsState.ambience !== 'off' || Math.abs(listeningEffectsState.width - 1) > 0.001;
  saveListeningEffectsState();
  applyListeningEffectsToPlaybackGraphs(false);
  updateListeningEffectsControls();
  if (typeof showToast === 'function') showToast('已切换：' + LISTENING_EFFECTS_PRESET_LABELS[preset]);
}

function updateListeningEffectGain(index, value) {
  if (!LISTENING_EFFECTS_BANDS[index]) return;
  listeningEffectsState.gains[index] = Math.round(listeningEffectsClamp(value, -9, 9) * 10) / 10;
  listeningEffectsState.preset = 'custom';
  listeningEffectsState.enabled = true;
  saveListeningEffectsState();
  applyListeningEffectsToPlaybackGraphs(false);
  updateListeningEffectsControls();
}

function setListeningAmbience(ambience) {
  ambience = Object.prototype.hasOwnProperty.call(LISTENING_AMBIENCE_PRESETS, ambience) ? ambience : 'off';
  listeningEffectsState.ambience = ambience;
  listeningEffectsState.ambienceAmount = LISTENING_AMBIENCE_PRESETS[ambience].amount;
  listeningEffectsState.enabled = ambience !== 'off' || listeningEffectsState.preset !== 'flat' || Math.abs(listeningEffectsState.width - 1) > 0.001;
  saveListeningEffectsState();
  applyListeningEffectsToPlaybackGraphs(false);
  updateListeningEffectsControls();
  if (typeof showToast === 'function') showToast('空间听感：' + LISTENING_AMBIENCE_PRESETS[ambience].label);
}

function updateListeningAmbienceAmount(value) {
  listeningEffectsState.ambienceAmount = Math.round(listeningEffectsClamp(value, 0, 0.3) * 100) / 100;
  if (listeningEffectsState.ambienceAmount > 0 && listeningEffectsState.ambience === 'off') listeningEffectsState.ambience = 'studio';
  if (listeningEffectsState.ambienceAmount > 0) listeningEffectsState.enabled = true;
  saveListeningEffectsState();
  applyListeningEffectsToPlaybackGraphs(false);
  updateListeningEffectsControls();
}

function updateListeningWidth(value) {
  listeningEffectsState.width = Math.round(listeningEffectsClamp(value, 0.7, 1.4) * 100) / 100;
  listeningEffectsState.enabled = listeningEffectsHasProcessing(listeningEffectsState);
  saveListeningEffectsState();
  applyListeningEffectsToPlaybackGraphs(false);
  updateListeningEffectsControls();
}

function toggleListeningProtection() {
  listeningEffectsState.protection = !listeningEffectsState.protection;
  saveListeningEffectsState();
  applyListeningEffectsToPlaybackGraphs(false);
  updateListeningEffectsControls();
  if (typeof showToast === 'function') showToast(listeningEffectsState.protection ? '削峰保护已开启' : '削峰保护已关闭');
}

function bindListeningEffectsControls() {
  document.querySelectorAll('[data-listening-toggle]').forEach(function (toggle) {
    if (toggle.__listeningEffectsBound) return;
    toggle.__listeningEffectsBound = true;
    toggle.setAttribute('role', 'switch');
    if (toggle.tagName !== 'BUTTON') toggle.setAttribute('tabindex', '0');
    toggle.addEventListener('click', toggleListeningEffects);
    toggle.addEventListener('keydown', function (event) {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); toggleListeningEffects(); }
    });
  });
  document.querySelectorAll('[data-listening-preset]').forEach(function (button) {
    if (button.__listeningEffectsBound) return;
    button.__listeningEffectsBound = true;
    button.addEventListener('click', function () { setListeningEffectsPreset(button.getAttribute('data-listening-preset')); });
  });
  LISTENING_EFFECTS_BANDS.forEach(function (band, index) {
    document.querySelectorAll('[data-listening-band-index="' + index + '"]').forEach(function (input) {
      if (input.__listeningEffectsBound) return;
      input.__listeningEffectsBound = true;
      input.addEventListener('input', function () { updateListeningEffectGain(index, input.value); });
    });
  });
  document.querySelectorAll('[data-listening-ambience]').forEach(function (button) {
    if (button.__listeningEffectsBound) return;
    button.__listeningEffectsBound = true;
    button.addEventListener('click', function () { setListeningAmbience(button.getAttribute('data-listening-ambience')); });
  });
  document.querySelectorAll('[data-listening-ambience-amount]').forEach(function (input) {
    if (input.__listeningEffectsBound) return;
    input.__listeningEffectsBound = true;
    input.addEventListener('input', function () { updateListeningAmbienceAmount(input.value); });
  });
  document.querySelectorAll('[data-listening-width]').forEach(function (input) {
    if (input.__listeningEffectsBound) return;
    input.__listeningEffectsBound = true;
    input.addEventListener('input', function () { updateListeningWidth(input.value); });
  });
  document.querySelectorAll('[data-listening-protection-toggle]').forEach(function (toggle) {
    if (toggle.__listeningEffectsBound) return;
    toggle.__listeningEffectsBound = true;
    toggle.setAttribute('role', 'switch');
    if (toggle.tagName !== 'BUTTON') toggle.setAttribute('tabindex', '0');
    toggle.addEventListener('click', toggleListeningProtection);
    toggle.addEventListener('keydown', function (event) {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); toggleListeningProtection(); }
    });
  });
  var wrap = document.getElementById('listening-effects-control');
  if (wrap && !wrap.__listeningEffectsPanelBound) {
    wrap.__listeningEffectsPanelBound = true;
    wrap.addEventListener('mouseenter', function () {
      wrap.classList.add('open');
      updateListeningEffectsPanelExpanded();
      if (typeof positionPlayerNestedToolPanel === 'function') positionPlayerNestedToolPanel(wrap, '.listening-effects-popover');
    });
    wrap.addEventListener('mouseleave', function () { wrap.classList.remove('open'); updateListeningEffectsPanelExpanded(); });
    document.addEventListener('click', function (event) {
      if (!wrap.contains(event.target)) { wrap.classList.remove('open'); updateListeningEffectsPanelExpanded(); }
    });
  }
  updateListeningEffectsControls();
}

function updateListeningEffectsPanelExpanded() {
  var wrap = document.getElementById('listening-effects-control');
  var button = document.getElementById('listening-effects-btn');
  if (button) button.setAttribute('aria-expanded', wrap && wrap.classList.contains('open') ? 'true' : 'false');
}

function toggleListeningEffectsPanel(event) {
  if (event) event.stopPropagation();
  var wrap = document.getElementById('listening-effects-control');
  if (!wrap) return;
  var volume = document.getElementById('volume-control');
  if (volume) volume.classList.remove('open');
  wrap.classList.toggle('open');
  updateListeningEffectsPanelExpanded();
  if (wrap.classList.contains('open') && typeof positionPlayerNestedToolPanel === 'function') {
    positionPlayerNestedToolPanel(wrap, '.listening-effects-popover');
  }
}
