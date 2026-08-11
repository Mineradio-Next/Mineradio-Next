#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');

const port = Number(process.argv[2] || 9237);
let activeSocket = null;

async function main() {
  const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then((response) => response.json());
  const target = targets.find((item) => item.type === 'page' && /127\.0\.0\.1/.test(item.url || ''));
  assert(target && target.webSocketDebuggerUrl, 'Mineradio CDP page target was not found');

  const socket = new WebSocket(target.webSocketDebuggerUrl);
  activeSocket = socket;
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });

  let sequence = 0;
  const pending = new Map();
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (!message.id || !pending.has(message.id)) return;
    const waiter = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) waiter.reject(new Error(message.error.message));
    else waiter.resolve(message.result);
  });

  function call(method, params = {}) {
    const id = ++sequence;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      socket.send(JSON.stringify({ id, method, params }));
    });
  }

  async function evaluate(expression) {
    const response = await call('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true,
    });
    if (response.exceptionDetails) {
      throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text || 'Renderer evaluation failed');
    }
    return response.result?.value;
  }

  async function layoutAt(width, height) {
    await call('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    return evaluate(`(async () => {
      setFxPanelTab('home');
      const panel = document.getElementById('fx-panel');
      panel.classList.add('show');
      const group = document.querySelector('[data-fx-console-group="visual-clip"]');
      group.classList.add('open');
      group.querySelector('.fx-console-group-head')?.setAttribute('aria-expanded', 'true');
      await new Promise((resolve) => setTimeout(resolve, 650));
      group.scrollIntoView({ block: 'center', behavior: 'auto' });
      await new Promise((resolve) => setTimeout(resolve, 80));
      visualClipRuntime.savedFileName = '';
      visualClipSetPhase('recording', '正在录制 · 剩余 15 秒');
      const control = document.getElementById('visual-clip-control');
      const buttons = Array.from(control.querySelectorAll('button:not([hidden])'));
      const controlRect = control.getBoundingClientRect();
      const groupRect = group.getBoundingClientRect();
      const buttonRects = buttons.map((button) => {
        const rect = button.getBoundingClientRect();
        return { id: button.id, left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height };
      });
      const overlap = buttonRects.some((first, index) => buttonRects.slice(index + 1).some((second) =>
        first.left < second.right && first.right > second.left && first.top < second.bottom && first.bottom > second.top
      ));
      const result = {
        viewport: { width: innerWidth, height: innerHeight },
        control: { left: controlRect.left, right: controlRect.right, top: controlRect.top, bottom: controlRect.bottom, width: controlRect.width, height: controlRect.height },
        group: { left: groupRect.left, right: groupRect.right, top: groupRect.top, bottom: groupRect.bottom },
        buttons: buttonRects,
        overlap,
        controlOverflow: control.scrollWidth > control.clientWidth + 1,
        statusOverflow: document.getElementById('visual-clip-status').scrollWidth > document.getElementById('visual-clip-status').clientWidth + 1,
      };
      visualClipSetPhase('idle', '15 秒 · 当前窗口 · WebM');
      return result;
    })()`);
  }

  await call('Runtime.enable');
  const ready = await evaluate(`(async () => {
    const deadline = performance.now() + 20000;
    while (performance.now() < deadline) {
      if (document.readyState === 'complete' && document.getElementById('visual-clip-control') && typeof visualClipRecorderMimeType === 'function') return true;
      await new Promise((resolve) => setTimeout(resolve, 60));
    }
    return false;
  })()`);
  assert.strictEqual(ready, true, 'visual clip UI did not become ready');

  const desktopLayout = await layoutAt(1440, 900);
  const compactLayout = await layoutAt(1280, 720);
  await call('Emulation.clearDeviceMetricsOverride');

  const userFlow = await evaluate(`(async () => {
    const waitFor = async (predicate, timeoutMs) => {
      const deadline = performance.now() + timeoutMs;
      while (performance.now() < deadline) {
        if (predicate()) return true;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      return false;
    };
    await startVisualClipRecording();
    const started = await waitFor(() => visualClipRuntime.phase === 'recording', 8000);
    const countdownHiddenBeforeRecording = document.getElementById('visual-clip-countdown').getAttribute('aria-hidden') === 'true';
    finishVisualClipRecording(true);
    const returnedIdle = await waitFor(() => visualClipRuntime.phase === 'idle', 3000);
    return {
      started,
      countdownHiddenBeforeRecording,
      returnedIdle,
      streamReleased: visualClipRuntime.stream === null,
      recorderReleased: visualClipRuntime.recorder === null,
      progressHidden: document.getElementById('visual-clip-progress').hidden,
      status: document.getElementById('visual-clip-status').textContent
    };
  })()`);

  const capture = await evaluate(`(async () => {
    const withTimeout = (promise, timeoutMs, label) => Promise.race([
      promise,
      new Promise((_, reject) => setTimeout(() => reject(new Error(label + '_TIMEOUT')), timeoutMs))
    ]);
    const source = await desktopWindow.getVisualClipSource();
    if (!source || !source.ok || !source.sourceId) throw new Error(source && source.error || 'VISUAL_CLIP_SOURCE_UNAVAILABLE');
    const stream = await withTimeout(navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { mandatory: {
        chromeMediaSource: 'desktop',
        chromeMediaSourceId: String(source.sourceId),
        maxWidth: 1920,
        maxHeight: 1080,
        maxFrameRate: 30
      } }
    }), 10000, 'VISUAL_CLIP_STREAM');
    try {
      const preview = document.createElement('video');
      preview.muted = true;
      preview.autoplay = true;
      preview.srcObject = stream;
      await withTimeout(new Promise((resolve, reject) => {
        preview.onloadedmetadata = resolve;
        preview.onerror = () => reject(new Error('VISUAL_CLIP_PREVIEW_FAILED'));
      }), 8000, 'VISUAL_CLIP_PREVIEW');
      await withTimeout(preview.play(), 3000, 'VISUAL_CLIP_PREVIEW_PLAY');
      const mime = visualClipRecorderMimeType(MediaRecorder);
      const chunks = [];
      const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 5000000 });
      const stopped = new Promise((resolve, reject) => {
        recorder.ondataavailable = (event) => { if (event.data && event.data.size) chunks.push(event.data); };
        recorder.onerror = (event) => reject(event.error || new Error('VISUAL_CLIP_RECORD_FAILED'));
        recorder.onstop = resolve;
      });
      recorder.start(250);
      await new Promise((resolve) => setTimeout(resolve, 1200));
      const canvas = document.createElement('canvas');
      canvas.width = 96;
      canvas.height = 54;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      context.drawImage(preview, 0, 0, canvas.width, canvas.height);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      let minimum = 255;
      let maximum = 0;
      let nonBlack = 0;
      for (let index = 0; index < pixels.length; index += 4) {
        const luminance = Math.round(pixels[index] * .2126 + pixels[index + 1] * .7152 + pixels[index + 2] * .0722);
        minimum = Math.min(minimum, luminance);
        maximum = Math.max(maximum, luminance);
        if (luminance > 4 && pixels[index + 3] > 0) nonBlack += 1;
      }
      recorder.requestData();
      recorder.stop();
      await withTimeout(stopped, 5000, 'VISUAL_CLIP_RECORDER_STOP');
      const blob = new Blob(chunks, { type: 'video/webm' });
      const bytes = new Uint8Array(await blob.arrayBuffer());
      return {
        sourceId: source.sourceId,
        mime,
        size: blob.size,
        header: Array.from(bytes.slice(0, 4)),
        width: preview.videoWidth,
        height: preview.videoHeight,
        nonBlack,
        luminanceSpan: maximum - minimum,
        videoTracks: stream.getVideoTracks().length,
        audioTracks: stream.getAudioTracks().length
      };
    } finally {
      stream.getTracks().forEach((track) => track.stop());
    }
  })()`);

  socket.close();
  activeSocket = null;
  for (const layout of [desktopLayout, compactLayout]) {
    assert.strictEqual(layout.overlap, false, `${layout.viewport.width}x${layout.viewport.height} visual clip buttons overlap`);
    assert.strictEqual(layout.controlOverflow, false, `${layout.viewport.width}x${layout.viewport.height} visual clip control overflows`);
    assert(layout.control.left >= layout.group.left - 1 && layout.control.right <= layout.group.right + 1, 'visual clip control escapes its console group');
    assert(layout.control.left >= 0 && layout.control.right <= layout.viewport.width && layout.control.top >= 0 && layout.control.bottom <= layout.viewport.height, 'visual clip control is outside the visible viewport');
    assert(layout.buttons.every((button) => button.width >= 40 && button.height >= 26), 'visual clip action target is too small');
  }
  assert.match(capture.sourceId, /^window:/);
  assert.strictEqual(capture.mime, 'video/webm;codecs=vp8');
  assert(capture.size > 1024, `recorded WebM is empty (${capture.size} bytes)`);
  assert.deepStrictEqual(capture.header, [0x1a, 0x45, 0xdf, 0xa3]);
  assert(capture.width > 0 && capture.height > 0, 'recorded WebM has no video dimensions');
  assert(capture.nonBlack > 200 && capture.luminanceSpan > 8, 'recorded Mineradio window is blank');
  assert.strictEqual(capture.videoTracks, 1);
  assert.strictEqual(capture.audioTracks, 0);
  assert.strictEqual(userFlow.started, true);
  assert.strictEqual(userFlow.countdownHiddenBeforeRecording, true);
  assert.strictEqual(userFlow.returnedIdle, true);
  assert.strictEqual(userFlow.streamReleased, true);
  assert.strictEqual(userFlow.recorderReleased, true);
  assert.strictEqual(userFlow.progressHidden, true);
  assert.match(userFlow.status, /已取消/);
  console.log(JSON.stringify({ ok: true, desktopLayout, compactLayout, userFlow, capture }, null, 2));
}

main().catch((error) => {
  if (activeSocket) activeSocket.close();
  console.error(error && error.stack || error);
  process.exitCode = 1;
});
