'use strict';

var PLAYER_SPECTRUM_KEY = 'mineradio-player-spectrum-v1';
var PLAYER_SPECTRUM_BAR_COUNT = 28;
var playerSpectrumEnabled = readPlayerSpectrumPreference();
var playerSpectrumFrame = 0;
var playerSpectrumTimer = 0;
var playerSpectrumBars = new Float32Array(PLAYER_SPECTRUM_BAR_COUNT);
var playerSpectrumReducedMotion = false;
var playerSpectrumSettled = true;

function normalizePlayerSpectrumPreference(raw) {
  if (raw === false || raw === 'false' || raw && raw.enabled === false) return false;
  return true;
}

function readPlayerSpectrumPreference() {
  try {
    var raw = localStorage.getItem(PLAYER_SPECTRUM_KEY);
    return raw == null ? true : normalizePlayerSpectrumPreference(JSON.parse(raw));
  } catch (_) {
    return true;
  }
}

function savePlayerSpectrumPreference() {
  try { localStorage.setItem(PLAYER_SPECTRUM_KEY, JSON.stringify({ enabled: playerSpectrumEnabled })); } catch (_) { }
}

function playerSpectrumCssColor(value, fallback) {
  value = String(value || '').trim();
  if (/^#[0-9a-f]{3,8}$/i.test(value) || /^(?:rgb|hsl)a?\(/i.test(value)) return value;
  return fallback;
}

function playerSpectrumPalette() {
  var palette = typeof stageLyrics !== 'undefined' && stageLyrics
    ? (stageLyrics.coverPalette || stageLyrics.palette || {})
    : {};
  return {
    primary: playerSpectrumCssColor(palette.rawAreaPrimary || palette.rawPrimary || palette.primary, 'rgb(132, 224, 211)'),
    accent: playerSpectrumCssColor(palette.rawAreaAccent || palette.rawAccent || palette.highlight, 'rgb(181, 239, 230)'),
    light: playerSpectrumCssColor(palette.rawAreaLight || palette.rawLight || palette.highlight, 'rgb(235, 250, 247)')
  };
}

function playerSpectrumUiVisible() {
  if (typeof document === 'undefined' || document.hidden) return false;
  var canvas = document.getElementById('player-spectrum-canvas');
  var bar = document.getElementById('bottom-bar');
  if (!canvas || !bar || !playerSpectrumEnabled) return false;
  return bar.classList.contains('visible')
    && !bar.classList.contains('soft-hidden')
    && !(document.body && document.body.classList.contains('home-controls-locked'));
}

function playerSpectrumFrameDelay() {
  if (typeof document !== 'undefined' && document.hidden) return 750;
  if (!playerSpectrumUiVisible()) return 750;
  if (playerSpectrumReducedMotion) return 240;
  var active = typeof playing !== 'undefined' && playing && typeof audio !== 'undefined' && audio && !audio.paused;
  if (!active && playerSpectrumSettled) return 750;
  return active ? 34 : 110;
}

function playerSpectrumSample(data, index, count) {
  if (!data || !data.length) return 0;
  var ratio = count <= 1 ? 0 : index / (count - 1);
  var start = Math.floor(Math.pow(ratio, 1.72) * Math.max(1, data.length * 0.72 - 1));
  var end = Math.min(data.length, start + Math.max(2, Math.floor(data.length / count * (0.45 + ratio))));
  var peak = 0;
  var total = 0;
  for (var cursor = start; cursor < end; cursor++) {
    var sample = Number(data[cursor]) || 0;
    total += sample;
    if (sample > peak) peak = sample;
  }
  var average = total / Math.max(1, end - start);
  return Math.min(1, (average * 0.72 + peak * 0.28) / 255);
}

function resizePlayerSpectrumCanvas(canvas) {
  var rect = canvas.getBoundingClientRect();
  var ratio = Math.min(1.75, Math.max(1, Number(window.devicePixelRatio) || 1));
  var width = Math.max(1, Math.round(rect.width * ratio));
  var height = Math.max(1, Math.round(rect.height * ratio));
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
  return { width: width, height: height, ratio: ratio };
}

function playerSpectrumRoundRect(context, x, y, width, height, radius) {
  radius = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + radius, y);
  context.arcTo(x + width, y, x + width, y + height, radius);
  context.arcTo(x + width, y + height, x, y + height, radius);
  context.arcTo(x, y + height, x, y, radius);
  context.arcTo(x, y, x + width, y, radius);
  context.closePath();
}

function drawPlayerSpectrum() {
  var canvas = typeof document !== 'undefined' && document.getElementById('player-spectrum-canvas');
  if (!canvas || !playerSpectrumEnabled || !playerSpectrumUiVisible()) return false;
  var context = canvas.getContext && canvas.getContext('2d');
  if (!context) return false;
  var size = resizePlayerSpectrumCanvas(canvas);
  var active = typeof playing !== 'undefined' && playing && typeof audio !== 'undefined' && audio && !audio.paused;
  var data = typeof frequencyData !== 'undefined' ? frequencyData : null;
  var motionScale = playerSpectrumReducedMotion ? 0.28 : 1;
  var settled = true;
  for (var index = 0; index < PLAYER_SPECTRUM_BAR_COUNT; index++) {
    var target = active ? playerSpectrumSample(data, index, PLAYER_SPECTRUM_BAR_COUNT) * motionScale : 0;
    var current = playerSpectrumBars[index] || 0;
    var easing = target > current ? 0.42 : (active ? 0.16 : 0.11);
    current += (target - current) * easing;
    if (current < 0.004) current = 0;
    if (current > 0.004) settled = false;
    playerSpectrumBars[index] = current;
  }

  context.clearRect(0, 0, size.width, size.height);
  var palette = playerSpectrumPalette();
  var baselineY = size.height * 0.69;
  var side = size.width * 0.075;
  var available = size.width - side * 2;
  var gap = Math.max(1.2 * size.ratio, available * 0.0036);
  var barWidth = Math.max(1.5 * size.ratio, (available - gap * (PLAYER_SPECTRUM_BAR_COUNT - 1)) / PLAYER_SPECTRUM_BAR_COUNT);
  var maxHeight = size.height * 0.54;

  context.save();
  context.globalAlpha = 0.16;
  context.strokeStyle = palette.light;
  context.lineWidth = Math.max(0.7, size.ratio * 0.65);
  context.beginPath();
  context.moveTo(side, baselineY + 0.5 * size.ratio);
  context.lineTo(size.width - side, baselineY + 0.5 * size.ratio);
  context.stroke();
  var gradient = context.createLinearGradient(side, 0, size.width - side, 0);
  gradient.addColorStop(0, palette.primary);
  gradient.addColorStop(0.58, palette.accent);
  gradient.addColorStop(1, palette.light);
  context.fillStyle = gradient;
  context.globalAlpha = active ? 0.47 : 0.28;
  context.shadowColor = palette.accent;
  context.shadowBlur = active ? 7 * size.ratio : 0;
  for (var bar = 0; bar < PLAYER_SPECTRUM_BAR_COUNT; bar++) {
    var value = playerSpectrumBars[bar];
    var height = Math.max(1.1 * size.ratio, Math.pow(value, 0.78) * maxHeight);
    var x = side + bar * (barWidth + gap);
    var y = baselineY - height;
    playerSpectrumRoundRect(context, x, y, barWidth, height, barWidth * 0.48);
    context.fill();
  }
  context.restore();
  canvas.classList.toggle('settled', !active && settled);
  playerSpectrumSettled = !active && settled;
  return true;
}

function schedulePlayerSpectrumFrame() {
  if (playerSpectrumTimer) clearTimeout(playerSpectrumTimer);
  playerSpectrumTimer = setTimeout(function () {
    playerSpectrumTimer = 0;
    if (!playerSpectrumEnabled) return;
    var request = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : function (callback) { return setTimeout(callback, 16); };
    playerSpectrumFrame = request(function () {
      playerSpectrumFrame = 0;
      drawPlayerSpectrum();
      schedulePlayerSpectrumFrame();
    });
  }, playerSpectrumFrameDelay());
}

function syncPlayerSpectrumUi() {
  var canvas = typeof document !== 'undefined' && document.getElementById('player-spectrum-canvas');
  var button = typeof document !== 'undefined' && document.getElementById('player-spectrum-toggle');
  if (canvas) canvas.classList.toggle('enabled', playerSpectrumEnabled);
  if (button) {
    button.classList.toggle('active', playerSpectrumEnabled);
    button.setAttribute('aria-pressed', playerSpectrumEnabled ? 'true' : 'false');
  }
}

function togglePlayerSpectrum(event) {
  if (event) event.stopPropagation();
  playerSpectrumEnabled = !playerSpectrumEnabled;
  savePlayerSpectrumPreference();
  syncPlayerSpectrumUi();
  if (playerSpectrumEnabled) {
    drawPlayerSpectrum();
    schedulePlayerSpectrumFrame();
  } else {
    if (playerSpectrumTimer) clearTimeout(playerSpectrumTimer);
    playerSpectrumTimer = 0;
  }
  if (typeof showToast === 'function') showToast(playerSpectrumEnabled ? '播放频谱已开启' : '播放频谱已关闭');
}

function initPlayerSpectrum() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  var motion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)');
  playerSpectrumReducedMotion = !!(motion && motion.matches);
  if (motion) {
    var onMotionChange = function (event) { playerSpectrumReducedMotion = !!event.matches; };
    if (typeof motion.addEventListener === 'function') motion.addEventListener('change', onMotionChange);
    else if (typeof motion.addListener === 'function') motion.addListener(onMotionChange);
  }
  document.addEventListener('visibilitychange', function () {
    if (playerSpectrumEnabled) schedulePlayerSpectrumFrame();
  });
  document.addEventListener('play', function (event) {
    if (!playerSpectrumEnabled || typeof audio === 'undefined' || event.target !== audio) return;
    playerSpectrumSettled = false;
    schedulePlayerSpectrumFrame();
  }, true);
  document.addEventListener('pause', function (event) {
    if (playerSpectrumEnabled && typeof audio !== 'undefined' && event.target === audio) schedulePlayerSpectrumFrame();
  }, true);
  var bar = document.getElementById('bottom-bar');
  if (bar && typeof MutationObserver === 'function') {
    new MutationObserver(function () {
      if (playerSpectrumEnabled && playerSpectrumUiVisible()) {
        drawPlayerSpectrum();
        schedulePlayerSpectrumFrame();
      }
    }).observe(bar, { attributes: true, attributeFilter: ['class'] });
  }
  window.addEventListener('resize', function () { if (playerSpectrumEnabled) drawPlayerSpectrum(); });
  syncPlayerSpectrumUi();
  if (playerSpectrumEnabled) schedulePlayerSpectrumFrame();
}

initPlayerSpectrum();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    normalizePreference: normalizePlayerSpectrumPreference,
    sample: playerSpectrumSample,
    frameDelay: playerSpectrumFrameDelay,
    palette: playerSpectrumPalette
  };
}
