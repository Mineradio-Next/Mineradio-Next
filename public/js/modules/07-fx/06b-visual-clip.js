'use strict';

var VISUAL_CLIP_DURATION_MS = 15000;
var VISUAL_CLIP_COUNTDOWN_SECONDS = 3;
var visualClipRuntime = {
  phase: 'idle',
  session: 0,
  stream: null,
  recorder: null,
  chunks: [],
  intent: '',
  startedAt: 0,
  tickTimer: 0,
  delayTimer: 0,
  handledSession: 0,
  releasing: false,
  savedFileName: '',
  statusText: ''
};

function visualClipApi() {
  return typeof getDesktopWindowApi === 'function' ? getDesktopWindowApi() : (window.desktopWindow || null);
}

function visualClipRecorderMimeType(Recorder) {
  Recorder = Recorder || window.MediaRecorder;
  var candidates = ['video/webm;codecs=vp8', 'video/webm', 'video/webm;codecs=vp9'];
  if (!Recorder || typeof Recorder.isTypeSupported !== 'function') return 'video/webm';
  return candidates.find(function (type) { return Recorder.isTypeSupported(type); }) || 'video/webm';
}

function visualClipPad(value) {
  return String(value).padStart(2, '0');
}

function visualClipDefaultName(now) {
  var date = now instanceof Date ? now : new Date(now || Date.now());
  return 'Mineradio-场景留影-' + date.getFullYear() + visualClipPad(date.getMonth() + 1) + visualClipPad(date.getDate()) + '-' +
    visualClipPad(date.getHours()) + visualClipPad(date.getMinutes()) + visualClipPad(date.getSeconds()) + '.webm';
}

function visualClipSupported() {
  var api = visualClipApi();
  return !!(api && typeof api.getVisualClipSource === 'function' && typeof api.saveVisualClip === 'function' &&
    navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function' && window.MediaRecorder);
}

function visualClipErrorText(error) {
  var code = String(error && (error.message || error.error) || error || '');
  if (/VISUAL_CLIP_TOO_LARGE/.test(code)) return '视频超过 32 MB，请提前完成后再保存';
  if (/VISUAL_CLIP_MIME_REJECTED/.test(code)) return '当前视频格式无法保存';
  if (/VISUAL_CLIP_SOURCE|NotAllowedError|NotReadableError/.test(code)) return '暂时无法读取 Mineradio 窗口';
  if (/VISUAL_CLIP_EMPTY/.test(code)) return '没有录到有效画面，请重试';
  return '场景留影没有完成，请稍后重试';
}

function visualClipSetStatus(text) {
  visualClipRuntime.statusText = String(text || '');
  var status = document.getElementById('visual-clip-status');
  if (status) status.textContent = visualClipRuntime.statusText || '15 秒 · 当前窗口 · WebM';
}

function renderVisualClipControl() {
  var control = document.getElementById('visual-clip-control');
  if (!control) return;
  var phase = visualClipRuntime.phase;
  var start = document.getElementById('visual-clip-start');
  var finish = document.getElementById('visual-clip-finish');
  var cancel = document.getElementById('visual-clip-cancel');
  var open = document.getElementById('visual-clip-open-folder');
  var progress = document.getElementById('visual-clip-progress');
  control.setAttribute('data-phase', phase);
  start.hidden = phase !== 'idle';
  start.disabled = !visualClipSupported();
  finish.hidden = phase !== 'recording';
  cancel.hidden = phase !== 'recording' && phase !== 'countdown';
  open.hidden = phase !== 'idle' || !visualClipRuntime.savedFileName;
  progress.hidden = phase !== 'recording';
  if (!visualClipSupported() && phase === 'idle') visualClipSetStatus('当前环境不支持窗口留影');
  else if (!visualClipRuntime.statusText) visualClipSetStatus('15 秒 · 当前窗口 · WebM');
}

function visualClipSetPhase(phase, status) {
  visualClipRuntime.phase = phase;
  visualClipSetStatus(status || '');
  renderVisualClipControl();
}

function visualClipStopTracks(stream) {
  if (!stream || !stream.getTracks) return;
  visualClipRuntime.releasing = true;
  stream.getTracks().forEach(function (track) {
    track.onended = null;
    try { track.stop(); } catch (_e) {}
  });
  visualClipRuntime.releasing = false;
}

function visualClipReleaseRuntime() {
  clearInterval(visualClipRuntime.tickTimer);
  clearTimeout(visualClipRuntime.delayTimer);
  visualClipRuntime.tickTimer = 0;
  visualClipRuntime.delayTimer = 0;
  var recorder = visualClipRuntime.recorder;
  if (recorder) {
    recorder.ondataavailable = null;
    recorder.onerror = null;
    recorder.onstop = null;
    if (recorder.state && recorder.state !== 'inactive') {
      try { recorder.stop(); } catch (_e) {}
    }
  }
  visualClipStopTracks(visualClipRuntime.stream);
  visualClipRuntime.stream = null;
  visualClipRuntime.recorder = null;
  visualClipRuntime.chunks = [];
  visualClipRuntime.intent = '';
  visualClipRuntime.startedAt = 0;
}

function visualClipHideCountdown() {
  var overlay = document.getElementById('visual-clip-countdown');
  if (!overlay) return;
  overlay.classList.remove('show');
  overlay.setAttribute('aria-hidden', 'true');
}

function visualClipFail(error) {
  visualClipRuntime.session += 1;
  visualClipHideCountdown();
  visualClipReleaseRuntime();
  visualClipSetPhase('idle', visualClipErrorText(error));
  if (typeof showToast === 'function') showToast(visualClipErrorText(error));
}

function visualClipDelay(ms) {
  return new Promise(function (resolve) {
    clearTimeout(visualClipRuntime.delayTimer);
    visualClipRuntime.delayTimer = setTimeout(function () {
      visualClipRuntime.delayTimer = 0;
      resolve();
    }, ms);
  });
}

async function openVisualClipStream() {
  var api = visualClipApi();
  var source = await api.getVisualClipSource();
  if (!source || source.ok !== true || !source.sourceId) throw new Error(source && source.error || 'VISUAL_CLIP_SOURCE_UNAVAILABLE');
  var stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      mandatory: {
        chromeMediaSource: 'desktop',
        chromeMediaSourceId: String(source.sourceId),
        maxWidth: Math.min(1920, Number(source.maxWidth) || 1920),
        maxHeight: Math.min(1080, Number(source.maxHeight) || 1080),
        maxFrameRate: Math.min(30, Number(source.maxFrameRate) || 30)
      }
    }
  });
  if (!stream || !stream.getVideoTracks || !stream.getVideoTracks().length) throw new Error('VISUAL_CLIP_STREAM_EMPTY');
  return stream;
}

async function runVisualClipCountdown(session) {
  var overlay = document.getElementById('visual-clip-countdown');
  var value = overlay && overlay.querySelector('span');
  for (var second = VISUAL_CLIP_COUNTDOWN_SECONDS; second > 0; second -= 1) {
    if (session !== visualClipRuntime.session || visualClipRuntime.phase !== 'countdown') return false;
    if (value) value.textContent = String(second);
    if (overlay) {
      overlay.classList.remove('pulse');
      void overlay.offsetWidth;
      overlay.classList.add('show', 'pulse');
      overlay.setAttribute('aria-hidden', 'false');
    }
    visualClipSetStatus(second + ' 秒后开始 · 可收起控制台');
    await visualClipDelay(780);
  }
  visualClipHideCountdown();
  await visualClipDelay(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 40 : 240);
  return session === visualClipRuntime.session && visualClipRuntime.phase === 'countdown';
}

function updateVisualClipProgress() {
  if (visualClipRuntime.phase !== 'recording') return;
  var elapsed = Math.max(0, Date.now() - visualClipRuntime.startedAt);
  var ratio = Math.min(1, elapsed / VISUAL_CLIP_DURATION_MS);
  var remaining = Math.max(0, Math.ceil((VISUAL_CLIP_DURATION_MS - elapsed) / 1000));
  var time = document.getElementById('visual-clip-time');
  var fill = document.getElementById('visual-clip-progress-fill');
  if (time) time.textContent = remaining + 's';
  if (fill) fill.style.transform = 'scaleX(' + ratio.toFixed(4) + ')';
  visualClipSetStatus('正在录制 · 剩余 ' + remaining + ' 秒');
  if (ratio >= 1) finishVisualClipRecording(false);
}

async function saveVisualClipChunks(session, chunks, mime) {
  if (session !== visualClipRuntime.session || visualClipRuntime.intent === 'discard') return;
  var blob = new Blob(chunks, { type: 'video/webm' });
  visualClipRuntime.chunks = [];
  if (blob.size < 1024) throw new Error('VISUAL_CLIP_EMPTY');
  visualClipSetPhase('saving', '录制完成 · 正在准备保存');
  var bytes = new Uint8Array(await blob.arrayBuffer());
  var result = await visualClipApi().saveVisualClip({
    bytes: bytes,
    mime: String(mime || 'video/webm').toLowerCase().replace(/\s+/g, ''),
    defaultName: visualClipDefaultName()
  });
  if (session !== visualClipRuntime.session) return;
  if (result && result.canceled) {
    visualClipSetPhase('idle', '已取消保存 · 视频未写入磁盘');
    if (typeof showToast === 'function') showToast('已取消保存');
    return;
  }
  if (!result || result.ok !== true) throw new Error(result && result.error || 'VISUAL_CLIP_SAVE_FAILED');
  visualClipRuntime.savedFileName = String(result.fileName || '场景留影.webm');
  visualClipSetPhase('idle', '已保存 · ' + visualClipRuntime.savedFileName);
  if (typeof showToast === 'function') showToast('场景留影已保存');
}

function handleVisualClipRecorderStopped(session, recorder) {
  if (visualClipRuntime.handledSession === session) return;
  visualClipRuntime.handledSession = session;
  clearInterval(visualClipRuntime.tickTimer);
  visualClipRuntime.tickTimer = 0;
  var chunks = visualClipRuntime.chunks.slice();
  var intent = visualClipRuntime.intent;
  var mime = String(recorder && recorder.mimeType || 'video/webm').toLowerCase().replace(/\s+/g, '');
  visualClipStopTracks(visualClipRuntime.stream);
  visualClipRuntime.stream = null;
  visualClipRuntime.recorder = null;
  if (intent === 'discard' || session !== visualClipRuntime.session) {
    visualClipRuntime.chunks = [];
    visualClipRuntime.intent = '';
    visualClipSetPhase('idle', '本次留影已取消');
    return;
  }
  saveVisualClipChunks(session, chunks, mime).catch(visualClipFail);
}

async function startVisualClipRecording() {
  if (visualClipRuntime.phase !== 'idle' || !visualClipSupported()) return;
  var session = ++visualClipRuntime.session;
  visualClipRuntime.handledSession = 0;
  visualClipRuntime.savedFileName = '';
  visualClipSetPhase('countdown', '正在准备 Mineradio 窗口');
  try {
    var stream = await openVisualClipStream();
    if (session !== visualClipRuntime.session || visualClipRuntime.phase !== 'countdown') {
      visualClipStopTracks(stream);
      return;
    }
    visualClipRuntime.stream = stream;
    stream.getVideoTracks()[0].onended = function () {
      if (visualClipRuntime.releasing || session !== visualClipRuntime.session) return;
      if (visualClipRuntime.phase === 'recording') finishVisualClipRecording(false);
      else visualClipFail(new Error('VISUAL_CLIP_TRACK_ENDED'));
    };
    if (!await runVisualClipCountdown(session)) return;
    var mime = visualClipRecorderMimeType(window.MediaRecorder);
    var recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 5000000 });
    visualClipRuntime.recorder = recorder;
    visualClipRuntime.chunks = [];
    visualClipRuntime.intent = 'save';
    recorder.ondataavailable = function (event) {
      if (event.data && event.data.size) visualClipRuntime.chunks.push(event.data);
    };
    recorder.onerror = function (event) {
      visualClipFail(event && event.error || new Error('VISUAL_CLIP_RECORD_FAILED'));
    };
    recorder.onstop = function () { handleVisualClipRecorderStopped(session, recorder); };
    recorder.start(500);
    visualClipRuntime.startedAt = Date.now();
    visualClipSetPhase('recording', '正在录制 · 剩余 15 秒');
    updateVisualClipProgress();
    visualClipRuntime.tickTimer = setInterval(updateVisualClipProgress, 120);
    if (typeof showToast === 'function') showToast('场景留影已开始 · 15 秒');
  } catch (error) {
    if (session === visualClipRuntime.session) visualClipFail(error);
  }
}

function finishVisualClipRecording(discard) {
  if (visualClipRuntime.phase === 'countdown') {
    visualClipRuntime.session += 1;
    visualClipHideCountdown();
    visualClipReleaseRuntime();
    visualClipSetPhase('idle', '本次留影已取消');
    return;
  }
  if (visualClipRuntime.phase !== 'recording') return;
  visualClipRuntime.intent = discard ? 'discard' : 'save';
  clearInterval(visualClipRuntime.tickTimer);
  visualClipRuntime.tickTimer = 0;
  if (discard) visualClipSetPhase('saving', '正在取消本次留影');
  else visualClipSetPhase('saving', '正在结束录制');
  var recorder = visualClipRuntime.recorder;
  if (!recorder || recorder.state === 'inactive') {
    handleVisualClipRecorderStopped(visualClipRuntime.session, recorder);
    return;
  }
  try { recorder.requestData(); } catch (_e) {}
  recorder.stop();
}

function openLastVisualClipFolder() {
  var api = visualClipApi();
  if (!api || typeof api.showLastVisualClip !== 'function') return;
  Promise.resolve(api.showLastVisualClip()).then(function (result) {
    if (!result || result.ok !== true) throw new Error(result && result.error || 'VISUAL_CLIP_SHOW_FAILED');
  }).catch(function () {
    visualClipRuntime.savedFileName = '';
    visualClipSetPhase('idle', '上次保存的文件已移动或删除');
  });
}

function bindVisualClipControl() {
  var control = document.getElementById('visual-clip-control');
  if (!control || control._visualClipBound) return;
  control._visualClipBound = true;
  document.getElementById('visual-clip-start').addEventListener('click', startVisualClipRecording);
  document.getElementById('visual-clip-finish').addEventListener('click', function () { finishVisualClipRecording(false); });
  document.getElementById('visual-clip-cancel').addEventListener('click', function () { finishVisualClipRecording(true); });
  document.getElementById('visual-clip-open-folder').addEventListener('click', openLastVisualClipFolder);
  renderVisualClipControl();
}

window.addEventListener('beforeunload', function () {
  visualClipRuntime.session += 1;
  visualClipReleaseRuntime();
});
