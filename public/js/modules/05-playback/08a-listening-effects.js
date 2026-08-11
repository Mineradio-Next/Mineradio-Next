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
var listeningEffectsState = readListeningEffectsState();
var listeningEffectsGraph = null;

function listeningEffectsClamp(value, min, max) {
  value = Number(value);
  if (!isFinite(value)) value = 0;
  return Math.max(min, Math.min(max, value));
}

function listeningEffectsDefaultState() {
  return { enabled: false, preset: 'flat', gains: LISTENING_EFFECTS_PRESETS.flat.slice() };
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
  return {
    enabled: preset !== 'flat' && raw.enabled === true,
    preset: preset,
    gains: gains
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

function createListeningEffectsGraph(context) {
  if (!context || typeof context.createGain !== 'function' || typeof context.createBiquadFilter !== 'function') return null;
  try {
    var graph = { context: context, input: context.createGain(), filters: [], compressor: null, output: null };
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
  [graph.input].concat(graph.filters || []).concat([graph.compressor, graph.output]).forEach(function (node) {
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
  if (graph.compressor) {
    listeningEffectsSetParam(graph.compressor.threshold, state.enabled ? -18 : 0, graph.context, immediate);
    listeningEffectsSetParam(graph.compressor.knee, state.enabled ? 8 : 0, graph.context, immediate);
    listeningEffectsSetParam(graph.compressor.ratio, state.enabled ? 2.2 : 1, graph.context, immediate);
    listeningEffectsSetParam(graph.compressor.attack, state.enabled ? 0.003 : 0.001, graph.context, immediate);
    listeningEffectsSetParam(graph.compressor.release, state.enabled ? 0.16 : 0.08, graph.context, immediate);
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
      var output = input.parentElement && input.parentElement.querySelector('output');
      if (output) {
        var value = Number(listeningEffectsState.gains[index]) || 0;
        output.textContent = (value > 0 ? '+' : '') + value.toFixed(1).replace('.0', '') + ' dB';
      }
    });
  });
  document.querySelectorAll('[data-listening-status]').forEach(function (status) {
    status.classList.toggle('ready', listeningEffectsGraphSupported());
    status.textContent = !audioReady ? '播放后可应用听感调节' : (listeningEffectsGraphSupported() ? (listeningEffectsState.enabled ? '已应用到当前播放' : '原声直出') : '当前音频回退为直出');
  });
  var button = document.getElementById('listening-effects-btn');
  if (button) button.classList.toggle('active', listeningEffectsState.enabled);
}

function toggleListeningEffects() {
  listeningEffectsState.enabled = !listeningEffectsState.enabled;
  listeningEffectsState.preset = listeningEffectsState.enabled && listeningEffectsState.preset === 'flat' ? 'custom' : listeningEffectsState.preset;
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
  listeningEffectsState.enabled = preset !== 'flat';
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
  var wrap = document.getElementById('listening-effects-control');
  if (wrap && !wrap.__listeningEffectsPanelBound) {
    wrap.__listeningEffectsPanelBound = true;
    wrap.addEventListener('mouseenter', function () { wrap.classList.add('open'); updateListeningEffectsPanelExpanded(); });
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
}
