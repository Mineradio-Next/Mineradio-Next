var PLAYBACK_TUNING_STORE_KEY = 'mineradio-playback-tuning-v1';
var playbackTuning = readPlaybackTuningSettings();
var playbackPitchGraph = null;
var playbackPitchSupported = true;

function normalizePlaybackTuning(value) {
  value = value && typeof value === 'object' ? value : {};
  var speed = Number(value.speed);
  var pitch = Number(value.pitch);
  if (!isFinite(speed)) speed = 1;
  if (!isFinite(pitch)) pitch = 0;
  return {
    speed: Math.max(0.5, Math.min(2, Math.round(speed * 20) / 20)),
    pitch: Math.max(-12, Math.min(12, Math.round(pitch)))
  };
}

function readPlaybackTuningSettings() {
  try { return normalizePlaybackTuning(JSON.parse(localStorage.getItem(PLAYBACK_TUNING_STORE_KEY) || '{}')); }
  catch (_) { return normalizePlaybackTuning({}); }
}

function savePlaybackTuningSettings() {
  try { localStorage.setItem(PLAYBACK_TUNING_STORE_KEY, JSON.stringify(playbackTuning)); } catch (_) { }
}

function formatPlaybackSpeed(value) {
  return (Math.round((Number(value) || 1) * 100) / 100).toFixed(2) + 'x';
}

function formatPlaybackPitch(value) {
  value = Math.round(Number(value) || 0);
  return (value > 0 ? '+' : '') + value + ' 半音';
}

function playbackPitchRatio(value) {
  return Math.pow(2, (Number(value == null ? playbackTuning.pitch : value) || 0) / 12);
}

function configurePlaybackMediaElement(media) {
  if (!media) return false;
  try { media.preservesPitch = true; } catch (_) { }
  try { media.webkitPreservesPitch = true; } catch (_) { }
  try { media.mozPreservesPitch = true; } catch (_) { }
  try {
    media.defaultPlaybackRate = playbackTuning.speed;
    media.playbackRate = playbackTuning.speed;
  } catch (_) { return false; }
  return true;
}

function playbackPitchWorkletSource() {
  return `
class MineradioPitchProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.size = 65536; this.mask = this.size - 1; this.buffers = [];
    this.writeIndex = 0; this.phase = 0; this.ratio = 1; this.target = 1;
    this.port.onmessage = event => {
      const value = Number(event.data && event.data.ratio);
      if (Number.isFinite(value)) this.target = Math.max(.5, Math.min(2, value));
    };
  }
  read(buffer, position) {
    const base = Math.floor(position), fraction = position - base;
    const a = buffer[base & this.mask] || 0, b = buffer[(base + 1) & this.mask] || 0;
    return a + (b - a) * fraction;
  }
  process(inputs, outputs) {
    const input = inputs[0] || [], output = outputs[0] || [];
    if (!output.length) return true;
    while (this.buffers.length < output.length) this.buffers.push(new Float32Array(this.size));
    for (let i = 0; i < output[0].length; i++) {
      this.ratio += (this.target - this.ratio) * .0025;
      const shifted = Math.abs(this.ratio - 1) > .001;
      const phaseA = this.phase, phaseB = phaseA < .5 ? phaseA + .5 : phaseA - .5;
      const winA = .5 - .5 * Math.cos(2 * Math.PI * phaseA), winB = 1 - winA;
      const delayA = 256 + 3072 * (this.ratio > 1 ? 1 - phaseA : phaseA);
      const delayB = 256 + 3072 * (this.ratio > 1 ? 1 - phaseB : phaseB);
      for (let channel = 0; channel < output.length; channel++) {
        const source = input[channel] || input[0], sample = source ? (source[i] || 0) : 0;
        const buffer = this.buffers[channel]; buffer[this.writeIndex] = sample;
        output[channel][i] = shifted
          ? this.read(buffer, this.writeIndex - delayA) * winA + this.read(buffer, this.writeIndex - delayB) * winB
          : sample;
      }
      this.writeIndex = (this.writeIndex + 1) & this.mask;
      if (shifted) { this.phase += Math.abs(1 - this.ratio) / 3072; if (this.phase >= 1) this.phase -= 1; }
    }
    return true;
  }
}
registerProcessor('mineradio-playback-pitch', MineradioPitchProcessor);`;
}

function ensurePlaybackPitchWorklet(context) {
  if (!context || !context.audioWorklet || typeof AudioWorkletNode === 'undefined') return Promise.resolve(false);
  if (context.__mineradioPitchWorkletPromise) return context.__mineradioPitchWorkletPromise;
  var objectUrl = '';
  try { objectUrl = URL.createObjectURL(new Blob([playbackPitchWorkletSource()], { type: 'application/javascript' })); }
  catch (_) { return Promise.resolve(false); }
  context.__mineradioPitchWorkletPromise = context.audioWorklet.addModule(objectUrl).then(function () { return true; }, function () { return false; }).finally(function () {
    try { URL.revokeObjectURL(objectUrl); } catch (_) { }
  });
  return context.__mineradioPitchWorkletPromise;
}

function createPlaybackPitchFallback(context) {
  if (!context || typeof context.createScriptProcessor !== 'function') return null;
  var node = context.createScriptProcessor(1024, 2, 2);
  var size = 65536, mask = size - 1, buffers = [new Float32Array(size), new Float32Array(size)];
  var writeIndex = 0, phase = 0, ratio = 1, target = 1;
  node.__mineradioSetPitchRatio = function (value) { target = Math.max(0.5, Math.min(2, Number(value) || 1)); };
  node.onaudioprocess = function (event) {
    var input = event.inputBuffer, output = event.outputBuffer;
    for (var channel = 0; channel < output.numberOfChannels; channel++) {
      if (!buffers[channel]) buffers[channel] = new Float32Array(size);
    }
    for (var i = 0; i < output.length; i++) {
      ratio += (target - ratio) * 0.0025;
      var shifted = Math.abs(ratio - 1) > 0.001;
      var phaseA = phase, phaseB = phaseA < 0.5 ? phaseA + 0.5 : phaseA - 0.5;
      var winA = 0.5 - 0.5 * Math.cos(2 * Math.PI * phaseA), winB = 1 - winA;
      var delayA = 256 + 3072 * (ratio > 1 ? 1 - phaseA : phaseA);
      var delayB = 256 + 3072 * (ratio > 1 ? 1 - phaseB : phaseB);
      for (var ch = 0; ch < output.numberOfChannels; ch++) {
        var inputData = input.getChannelData(Math.min(ch, Math.max(0, input.numberOfChannels - 1)));
        var outputData = output.getChannelData(ch), buffer = buffers[ch], sample = inputData[i] || 0;
        buffer[writeIndex] = sample;
        function read(position) {
          var base = Math.floor(position), fraction = position - base;
          var a = buffer[base & mask] || 0, b = buffer[(base + 1) & mask] || 0;
          return a + (b - a) * fraction;
        }
        outputData[i] = shifted ? read(writeIndex - delayA) * winA + read(writeIndex - delayB) * winB : sample;
      }
      writeIndex = (writeIndex + 1) & mask;
      if (shifted) { phase += Math.abs(1 - ratio) / 3072; if (phase >= 1) phase -= 1; }
    }
  };
  return node;
}

function createPlaybackPitchGraph(context) {
  if (!context || typeof context.createGain !== 'function') return null;
  var graph = { context: context, input: context.createGain(), output: context.createGain(), processor: null, generation: 0, direct: true };
  graph.input.connect(graph.output);
  return graph;
}

function playbackPitchGraphSetDirect(graph) {
  if (!graph || !graph.input || !graph.output) return;
  graph.generation++;
  try { graph.input.disconnect(); } catch (_) { }
  try { if (graph.processor) graph.processor.disconnect(); } catch (_) { }
  graph.processor = null;
  graph.direct = true;
  try { graph.input.connect(graph.output); } catch (_) { }
}

function applyPlaybackPitchRatioToProcessor(processor) {
  if (!processor) return;
  var ratio = playbackPitchRatio();
  try {
    if (processor.port) processor.port.postMessage({ ratio: ratio });
    else if (typeof processor.__mineradioSetPitchRatio === 'function') processor.__mineradioSetPitchRatio(ratio);
  } catch (_) { }
}

function activatePlaybackPitchProcessor(graph, processor, generation) {
  if (!graph || !processor || generation !== graph.generation || playbackTuning.pitch === 0) {
    try { if (processor) processor.disconnect(); } catch (_) { }
    return false;
  }
  try { graph.input.disconnect(); } catch (_) { }
  try { graph.input.connect(processor); processor.connect(graph.output); }
  catch (_) { playbackPitchGraphSetDirect(graph); return false; }
  graph.processor = processor;
  graph.direct = false;
  applyPlaybackPitchRatioToProcessor(processor);
  return true;
}

function ensurePlaybackPitchGraph(graph) {
  if (!graph) return Promise.resolve(false);
  if (playbackTuning.pitch === 0) { playbackPitchGraphSetDirect(graph); return Promise.resolve(true); }
  if (graph.processor) { applyPlaybackPitchRatioToProcessor(graph.processor); return Promise.resolve(true); }
  var generation = ++graph.generation;
  return ensurePlaybackPitchWorklet(graph.context).then(function (ready) {
    var processor = null;
    if (ready) {
      try { processor = new AudioWorkletNode(graph.context, 'mineradio-playback-pitch', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2] }); } catch (_) { processor = null; }
    }
    if (!processor) processor = createPlaybackPitchFallback(graph.context);
    if (!processor) return false;
    if (processor.addEventListener) processor.addEventListener('processorerror', function () {
      if (graph.processor !== processor) return;
      playbackPitchGraphSetDirect(graph);
      var fallback = createPlaybackPitchFallback(graph.context);
      if (!fallback || !activatePlaybackPitchProcessor(graph, fallback, graph.generation)) disablePlaybackPitch('processor-error');
    });
    return activatePlaybackPitchProcessor(graph, processor, generation);
  }).then(function (ready) {
    if (!ready && generation === graph.generation && playbackTuning.pitch !== 0) disablePlaybackPitch('unsupported');
    return ready;
  });
}

function disconnectPlaybackPitchGraph(graph) {
  if (!graph) return;
  graph.generation++;
  [graph.input, graph.processor, graph.output].forEach(function (node) { try { if (node) node.disconnect(); } catch (_) { } });
  graph.processor = null;
}

function playbackTuningGraphs() {
  var graphs = [];
  if (playbackPitchGraph) graphs.push(playbackPitchGraph);
  var prepared = typeof cuefieldAutoMixPreparedAudio !== 'undefined' ? cuefieldAutoMixPreparedAudio : null;
  var preparedGraph = prepared && prepared.__mineradioPreparedAudioGraph;
  if (preparedGraph && preparedGraph.pitch && graphs.indexOf(preparedGraph.pitch) < 0) graphs.push(preparedGraph.pitch);
  return graphs;
}

function playbackTuningMediaElements() {
  var items = [];
  function add(media) { if (media && items.indexOf(media) < 0) items.push(media); }
  add(typeof audio !== 'undefined' ? audio : null);
  add(typeof cuefieldAutoMixPreparedAudio !== 'undefined' ? cuefieldAutoMixPreparedAudio : null);
  if (typeof albumGaplessState !== 'undefined' && albumGaplessState && albumGaplessState.preload) add(albumGaplessState.preload.media);
  return items;
}

function applyPlaybackTuning(options) {
  options = options || {};
  playbackTuning = normalizePlaybackTuning(playbackTuning);
  playbackTuningMediaElements().forEach(configurePlaybackMediaElement);
  playbackTuningGraphs().forEach(function (graph) { ensurePlaybackPitchGraph(graph); });
  if (options.save !== false) savePlaybackTuningSettings();
  updatePlaybackTuningUi();
  if (typeof updateSystemMediaSessionPosition === 'function') updateSystemMediaSessionPosition(true);
  return playbackTuning;
}

function disablePlaybackPitch(reason) {
  if (playbackTuning.pitch === 0 && !playbackPitchSupported) return;
  playbackPitchSupported = false;
  playbackTuning.pitch = 0;
  savePlaybackTuningSettings();
  playbackTuningGraphs().forEach(playbackPitchGraphSetDirect);
  updatePlaybackTuningUi();
  console.warn('[PlaybackTuning] pitch unavailable:', reason || 'unknown');
  if (typeof showToast === 'function') showToast('当前设备不支持独立音调，倍速仍可正常使用');
}

function setPlaybackSpeed(value, options) {
  options = options || {};
  playbackTuning.speed = normalizePlaybackTuning({ speed: value, pitch: playbackTuning.pitch }).speed;
  applyPlaybackTuning({ save: options.save !== false });
  if (options.toast && typeof showToast === 'function') showToast('播放速度 ' + formatPlaybackSpeed(playbackTuning.speed));
}

function setPlaybackPitch(value, options) {
  options = options || {};
  if (!playbackPitchSupported && Number(value) !== 0) {
    if (typeof showToast === 'function') showToast('当前设备不支持独立音调');
    return;
  }
  playbackTuning.pitch = normalizePlaybackTuning({ speed: playbackTuning.speed, pitch: value }).pitch;
  applyPlaybackTuning({ save: options.save !== false });
  if (options.toast && typeof showToast === 'function') showToast('音调 ' + formatPlaybackPitch(playbackTuning.pitch));
}

function resetPlaybackTuning() {
  playbackPitchSupported = true;
  playbackTuning = { speed: 1, pitch: 0 };
  applyPlaybackTuning({ save: true });
  if (typeof showToast === 'function') showToast('播放速度与音调已复位');
}

function playbackTuningRangeFill(input) {
  if (!input) return;
  var min = Number(input.min), max = Number(input.max), value = Number(input.value);
  var percent = max > min ? Math.max(0, Math.min(100, (value - min) / (max - min) * 100)) : 0;
  input.style.setProperty('--playback-tuning-fill', percent.toFixed(2) + '%');
}

function updatePlaybackTuningUi() {
  var speedValue = document.getElementById('playback-speed-value');
  var pitchValue = document.getElementById('playback-pitch-value');
  var speedSlider = document.getElementById('playback-speed-slider');
  var pitchSlider = document.getElementById('playback-pitch-slider');
  var buttonLabel = document.getElementById('playback-tuning-btn-label');
  var status = document.getElementById('playback-tuning-status');
  if (speedValue) speedValue.textContent = formatPlaybackSpeed(playbackTuning.speed);
  if (pitchValue) pitchValue.textContent = formatPlaybackPitch(playbackTuning.pitch);
  if (speedSlider) { speedSlider.value = playbackTuning.speed; playbackTuningRangeFill(speedSlider); }
  if (pitchSlider) { pitchSlider.value = playbackTuning.pitch; pitchSlider.disabled = !playbackPitchSupported; playbackTuningRangeFill(pitchSlider); }
  if (buttonLabel) buttonLabel.textContent = playbackTuning.speed === 1 && playbackTuning.pitch === 0 ? '1x' : formatPlaybackSpeed(playbackTuning.speed);
  if (status) status.textContent = playbackPitchSupported ? '倍速保持原音高，音调独立生效' : '当前设备仅支持倍速调节';
  document.querySelectorAll('[data-playback-speed]').forEach(function (button) { button.classList.toggle('active', Number(button.getAttribute('data-playback-speed')) === playbackTuning.speed); });
  document.querySelectorAll('[data-playback-pitch]').forEach(function (button) { button.classList.toggle('active', Number(button.getAttribute('data-playback-pitch')) === playbackTuning.pitch); });
}

function setPlaybackTuningPanelOpen(open) {
  var control = document.getElementById('playback-tuning-control');
  var button = document.getElementById('playback-tuning-btn');
  if (!control || !button) return false;
  control.classList.toggle('open', !!open);
  button.setAttribute('aria-expanded', open ? 'true' : 'false');
  if (open && typeof positionPlayerNestedToolPanel === 'function') positionPlayerNestedToolPanel(control, '.playback-tuning-popover');
  return !!open;
}

function togglePlaybackTuningPanel(event) {
  if (event) event.stopPropagation();
  var control = document.getElementById('playback-tuning-control');
  if (!control) return false;
  var nextOpen = !control.classList.contains('open');
  if (nextOpen) {
    document.querySelectorAll('.volume-control.open,.listening-effects-control.open,.quality-control.open,.sleep-timer-control.open').forEach(function (node) { node.classList.remove('open'); });
    if (typeof updateListeningEffectsPanelExpanded === 'function') updateListeningEffectsPanelExpanded();
    var sleepButton = document.getElementById('sleep-timer-btn');
    if (sleepButton) sleepButton.setAttribute('aria-expanded', 'false');
  }
  return setPlaybackTuningPanelOpen(nextOpen);
}

function bindPlaybackTuningControls() {
  var control = document.getElementById('playback-tuning-control');
  var speedSlider = document.getElementById('playback-speed-slider');
  var pitchSlider = document.getElementById('playback-pitch-slider');
  if (!control) return;
  control.addEventListener('click', function (event) {
    var speed = event.target.closest('[data-playback-speed]');
    var pitch = event.target.closest('[data-playback-pitch]');
    if (speed) setPlaybackSpeed(speed.getAttribute('data-playback-speed'), { toast: true });
    if (pitch) setPlaybackPitch(pitch.getAttribute('data-playback-pitch'), { toast: true });
  });
  if (speedSlider) {
    speedSlider.addEventListener('input', function () { setPlaybackSpeed(speedSlider.value); });
    speedSlider.addEventListener('change', function () { setPlaybackSpeed(speedSlider.value, { toast: true }); });
  }
  if (pitchSlider) {
    pitchSlider.addEventListener('input', function () { setPlaybackPitch(pitchSlider.value); });
    pitchSlider.addEventListener('change', function () { setPlaybackPitch(pitchSlider.value, { toast: true }); });
  }
  document.addEventListener('click', function (event) { if (!control.contains(event.target)) setPlaybackTuningPanelOpen(false); });
  playbackTuning = normalizePlaybackTuning(playbackTuning);
  applyPlaybackTuning({ save: false });
}
