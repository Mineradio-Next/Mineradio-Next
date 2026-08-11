#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

let activeSocket = null;

const appRoot = path.resolve(__dirname, '..');
const electronPath = path.join(appRoot, 'node_modules', 'electron', 'dist', 'electron.exe');
const CDP_CALL_TIMEOUT_MS = 9000;

async function checkVisualClip(port, options = {}) {
  const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then((response) => response.json());
  const target = targets.find((item) => item.type === 'page' && /127\.0\.0\.1/.test(item.url || ''));
  assert(target && target.webSocketDebuggerUrl, 'Mineradio CDP page target was not found');

  const socket = new WebSocket(target.webSocketDebuggerUrl);
  activeSocket = socket;
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => finish(new Error('CDP WebSocket open timed out')), CDP_CALL_TIMEOUT_MS);
    function finish(error) {
      clearTimeout(timer);
      socket.removeEventListener('open', onOpen);
      socket.removeEventListener('error', onError);
      if (error) reject(error);
      else resolve();
    }
    function onOpen() { finish(); }
    function onError() { finish(new Error('CDP WebSocket failed to open')); }
    socket.addEventListener('open', onOpen, { once: true });
    socket.addEventListener('error', onError, { once: true });
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
  function rejectPending(error) {
    for (const waiter of pending.values()) waiter.reject(error);
    pending.clear();
  }
  socket.addEventListener('close', () => rejectPending(new Error('CDP WebSocket closed')));
  socket.addEventListener('error', () => rejectPending(new Error('CDP WebSocket failed')));

  function call(method, params = {}, timeoutMs = CDP_CALL_TIMEOUT_MS) {
    const id = ++sequence;
    return new Promise((resolve, reject) => {
      if (socket.readyState !== 1) {
        reject(new Error(`CDP WebSocket is not open for ${method}`));
        return;
      }
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`CDP ${method} timed out`));
      }, timeoutMs);
      pending.set(id, {
        resolve(value) { clearTimeout(timer); resolve(value); },
        reject(error) { clearTimeout(timer); reject(error); },
      });
      try {
        socket.send(JSON.stringify({ id, method, params }));
      } catch (error) {
        pending.delete(id);
        clearTimeout(timer);
        reject(error);
      }
    });
  }

  async function evaluate(expression, timeoutMs = CDP_CALL_TIMEOUT_MS) {
    const response = await call('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true,
    }, timeoutMs);
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

  let rendererState = null;
  try {
  await call('Runtime.enable');
  const ready = await evaluate(`(async () => {
    const deadline = performance.now() + 20000;
    while (performance.now() < deadline) {
      if (document.readyState === 'complete' && document.getElementById('visual-clip-control') && typeof visualClipRecorderMimeType === 'function') return true;
      await new Promise((resolve) => setTimeout(resolve, 60));
    }
    return false;
  })()`, 25000);
  assert.strictEqual(ready, true, 'visual clip UI did not become ready');

  rendererState = await evaluate(`(() => {
    const panel = document.getElementById('fx-panel');
    const group = document.querySelector('[data-fx-console-group="visual-clip"]');
    const head = group && group.querySelector('.fx-console-group-head');
    const fab = document.getElementById('fx-fab');
    return {
      panelClass: panel ? panel.className : '',
      panelScrollTop: panel ? panel.scrollTop : 0,
      groupClass: group ? group.className : '',
      groupExpanded: head ? head.getAttribute('aria-expanded') : null,
      fabClass: fab ? fab.className : '',
      tab: typeof fxPanelTab === 'string' ? fxPanelTab : '',
      diyMode: typeof diyPlayerMode === 'boolean' ? diyPlayerMode : false,
      scrollX,
      scrollY
    };
  })()`);
  await evaluate(`(() => {
    if (typeof applyDiyMode === 'function') applyDiyMode(true, { save: false, toast: false, animate: false });
    return true;
  })()`);

  const desktopLayout = await layoutAt(1440, 900);
  const compactLayout = await layoutAt(1280, 720);
  await call('Emulation.clearDeviceMetricsOverride');

  await call('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
  });
  const reducedMotion = await evaluate(`(() => {
    const overlay = document.getElementById('visual-clip-countdown');
    const value = overlay.querySelector('span');
    overlay.classList.add('show', 'pulse');
    const style = getComputedStyle(value);
    const result = {
      matches: matchMedia('(prefers-reduced-motion: reduce)').matches,
      animationName: style.animationName,
      transform: style.transform,
    };
    overlay.classList.remove('show', 'pulse');
    return result;
  })()`);
  await call('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }],
  });

  const legacyCaptureBlocked = await evaluate(`(async () => {
    const withTimeout = (promise, timeoutMs, label) => Promise.race([
      promise,
      new Promise((_, reject) => setTimeout(() => reject(new Error(label + '_TIMEOUT')), timeoutMs))
    ]);
    if (typeof desktopWindow.getVisualClipSource !== 'undefined') return false;
    try {
      const legacyStream = await withTimeout(navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: 'window:1:1'
        } }
      }), 5000, 'VISUAL_CLIP_LEGACY_STREAM');
      legacyStream.getTracks().forEach((track) => track.stop());
      return false;
    } catch (_error) {
      return true;
    }
  })()`);

  const startControl = await evaluate(`(async () => {
    setFxPanelTab('home');
    const panel = document.getElementById('fx-panel');
    panel.classList.add('show');
    const group = document.querySelector('[data-fx-console-group="visual-clip"]');
    group.classList.add('open');
    group.querySelector('.fx-console-group-head')?.setAttribute('aria-expanded', 'true');
    visualClipSetPhase('idle', '15 秒 · 当前窗口 · WebM');
    await new Promise((resolve) => setTimeout(resolve, 700));
    const button = document.getElementById('visual-clip-start');
    button.scrollIntoView({ block: 'center', behavior: 'auto' });
    await new Promise((resolve) => setTimeout(resolve, 100));
    const rect = button.getBoundingClientRect();
    return { width: rect.width, height: rect.height, hidden: button.hidden, disabled: button.disabled };
  })()`);
  assert(startControl.width >= 40 && startControl.height >= 26, 'visual clip start button is not clickable');
  assert.strictEqual(startControl.hidden, false);
  assert.strictEqual(startControl.disabled, false);
  const clickActivation = await evaluate(`(() => {
    document.getElementById('visual-clip-start').click();
    return { active: navigator.userActivation.isActive, hasBeenActive: navigator.userActivation.hasBeenActive };
  })()`);
  assert.strictEqual(clickActivation.active, true);

  const recording = await evaluate(`(async () => {
    const withTimeout = (promise, timeoutMs, label) => Promise.race([
      promise,
      new Promise((_, reject) => setTimeout(() => reject(new Error(label + '_TIMEOUT')), timeoutMs))
    ]);
    const waitFor = async (predicate, timeoutMs) => {
      const deadline = performance.now() + timeoutMs;
      while (performance.now() < deadline) {
        if (predicate()) return true;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      return false;
    };
    const started = await waitFor(() => visualClipRuntime.phase === 'recording', 8000);
    if (!started || !visualClipRuntime.stream) {
      throw new Error('VISUAL_CLIP_UI_FLOW_FAILED: ' + document.getElementById('visual-clip-status').textContent);
    }
    const countdownHiddenBeforeRecording = document.getElementById('visual-clip-countdown').getAttribute('aria-hidden') === 'true';
    const stream = visualClipRuntime.stream;
    let capture;
    try {
      let legacyDuringGrantError = '';
      try {
        const legacyStream = await withTimeout(navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { mandatory: {
            chromeMediaSource: 'desktop',
            chromeMediaSourceId: 'window:1:1'
          } }
        }), 5000, 'VISUAL_CLIP_LEGACY_DURING_GRANT');
        legacyStream.getTracks().forEach((track) => track.stop());
      } catch (error) {
        legacyDuringGrantError = String(error && error.name || error && error.message || error || '');
      }
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
      capture = {
        trackLabel: String(stream.getVideoTracks()[0] && stream.getVideoTracks()[0].label || ''),
        legacyDuringGrantError,
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
      finishVisualClipRecording(true);
    }
    const returnedIdle = await waitFor(() => visualClipRuntime.phase === 'idle', 3000);
    return {
      capture,
      userFlow: {
        started,
        countdownHiddenBeforeRecording,
        returnedIdle,
        streamReleased: visualClipRuntime.stream === null,
        recorderReleased: visualClipRuntime.recorder === null,
        progressHidden: document.getElementById('visual-clip-progress').hidden,
        status: document.getElementById('visual-clip-status').textContent
      }
    };
  })()`, 30000);
  const capture = recording.capture;
  const userFlow = recording.userFlow;

  for (const layout of [desktopLayout, compactLayout]) {
    assert.strictEqual(layout.overlap, false, `${layout.viewport.width}x${layout.viewport.height} visual clip buttons overlap`);
    assert.strictEqual(layout.controlOverflow, false, `${layout.viewport.width}x${layout.viewport.height} visual clip control overflows`);
    assert(layout.control.left >= layout.group.left - 1 && layout.control.right <= layout.group.right + 1, 'visual clip control escapes its console group');
    assert(layout.control.left >= 0 && layout.control.right <= layout.viewport.width && layout.control.top >= 0 && layout.control.bottom <= layout.viewport.height, 'visual clip control is outside the visible viewport');
    assert(layout.buttons.every((button) => button.width >= 40 && button.height >= 26), 'visual clip action target is too small');
  }
  assert.match(capture.trackLabel, /Mineradio/i);
  assert.strictEqual(capture.mime, 'video/webm;codecs=vp8');
  assert(capture.size > 1024, `recorded WebM is empty (${capture.size} bytes)`);
  assert.deepStrictEqual(capture.header, [0x1a, 0x45, 0xdf, 0xa3]);
  assert(capture.width > 0 && capture.height > 0, 'recorded WebM has no video dimensions');
  assert(capture.nonBlack > 200 && capture.luminanceSpan > 8, 'recorded Mineradio window is blank');
  assert.strictEqual(capture.videoTracks, 1);
  assert.strictEqual(capture.audioTracks, 0);
  assert.strictEqual(capture.legacyDuringGrantError, 'NotAllowedError', 'legacy capture was not denied during an active visual grant');
  assert.strictEqual(legacyCaptureBlocked, true, 'legacy source-id capture was not blocked');
  assert.strictEqual(reducedMotion.matches, true);
  assert.strictEqual(reducedMotion.animationName, 'visual-clip-count-reduced');
  assert.strictEqual(reducedMotion.transform, 'none');
  assert.strictEqual(userFlow.started, true);
  assert.strictEqual(userFlow.countdownHiddenBeforeRecording, true);
  assert.strictEqual(userFlow.returnedIdle, true);
  assert.strictEqual(userFlow.streamReleased, true);
  assert.strictEqual(userFlow.recorderReleased, true);
  assert.strictEqual(userFlow.progressHidden, true);
  assert.match(userFlow.status, /已取消/);
  console.log(JSON.stringify({ ok: true, desktopLayout, compactLayout, reducedMotion, legacyCaptureBlocked, userFlow, capture }, null, 2));
  } finally {
    try { await call('Emulation.clearDeviceMetricsOverride'); } catch (_) {}
    try { await call('Emulation.setEmulatedMedia', { features: [] }); } catch (_) {}
    try {
      const snapshot = JSON.stringify(rendererState || {});
      await evaluate(`(async () => {
        const state = ${snapshot};
        if (typeof finishVisualClipRecording === 'function' && typeof visualClipRuntime !== 'undefined' && visualClipRuntime.phase !== 'idle') {
          try { finishVisualClipRecording(true); } catch (_error) {}
        }
        if (typeof visualClipHideCountdown === 'function') visualClipHideCountdown();
        if (typeof applyDiyMode === 'function') applyDiyMode(state.diyMode === true, { save: false, toast: false, animate: false });
        if (state.tab && typeof setFxPanelTab === 'function') setFxPanelTab(state.tab);
        const panel = document.getElementById('fx-panel');
        const group = document.querySelector('[data-fx-console-group="visual-clip"]');
        const head = group && group.querySelector('.fx-console-group-head');
        const fab = document.getElementById('fx-fab');
        if (panel) {
          panel.className = state.panelClass || '';
          panel.scrollTop = Number(state.panelScrollTop) || 0;
        }
        if (group) group.className = state.groupClass || 'fx-fold fx-console-group';
        if (head) {
          if (state.groupExpanded == null) head.removeAttribute('aria-expanded');
          else head.setAttribute('aria-expanded', state.groupExpanded);
        }
        if (fab) fab.className = state.fabClass || '';
        scrollTo(Number(state.scrollX) || 0, Number(state.scrollY) || 0);
        await new Promise((resolve) => setTimeout(resolve, 40));
        return true;
      })()`);
    } catch (_) {}
    if (options.closeAfter) {
      try { await evaluate(`desktopWindow.close('exit').catch(() => undefined)`); } catch (_) {}
    }
    try { socket.close(); } catch (_) {}
    activeSocket = null;
  }
}

function reserveLoopbackPort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = Number(address && address.port);
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

function waitForChildExit(child, timeoutMs) {
  if (!child || child.exitCode != null) return Promise.resolve(child && child.exitCode);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`isolated Mineradio QA process ${child.pid} did not exit normally`));
    }, timeoutMs);
    function cleanup() {
      clearTimeout(timer);
      child.removeListener('exit', onExit);
      child.removeListener('error', onError);
    }
    function onExit(code) { cleanup(); resolve(code); }
    function onError(error) { cleanup(); reject(error); }
    child.once('exit', onExit);
    child.once('error', onError);
  });
}

function requestNormalChildExit(child) {
  const pid = Number(child && child.pid);
  if (!Number.isInteger(pid) || pid <= 0 || child.exitCode != null) return Promise.resolve(false);
  return new Promise((resolve) => {
    const command = `$qaProcess = Get-Process -Id ${pid} -ErrorAction SilentlyContinue; if ($qaProcess) { [bool]$qaProcess.CloseMainWindow() } else { $true }`;
    const helper = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    let output = '';
    helper.stdout.on('data', (chunk) => { output += chunk.toString(); });
    helper.once('error', () => resolve(false));
    helper.once('exit', () => resolve(/true/i.test(output)));
  });
}

async function waitForCdp(port, child, timeoutMs = 25000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    if (child.exitCode != null) throw new Error(`isolated Mineradio QA exited before CDP was ready (${child.exitCode})`);
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      if (response.ok) {
        const targets = await response.json();
        if (targets.some((item) => item.type === 'page' && /127\.0\.0\.1/.test(item.url || ''))) return;
      }
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`isolated Mineradio QA CDP was not ready: ${lastError && lastError.message || 'timeout'}`);
}

async function main() {
  assert(process.platform === 'win32', 'visual clip live check requires Windows');
  assert(fs.existsSync(electronPath), `Electron executable not found: ${electronPath}`);

  const qaRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mineradio-visual-clip-qa-'));
  const userDataPath = path.join(qaRoot, 'user-data');
  const cacheRoot = path.join(qaRoot, 'cache');
  const runtimeName = `MineradioVisualClipQA-${process.pid}-${Date.now()}`;
  fs.mkdirSync(userDataPath, { recursive: true });
  fs.writeFileSync(path.join(userDataPath, 'cache-settings.json'), JSON.stringify({ version: 1, rootPath: cacheRoot }, null, 2), 'utf8');
  function cleanupQaRoot(ignoreErrors = false) {
    try {
      fs.rmSync(qaRoot, { recursive: true, force: true });
    } catch (error) {
      if (!ignoreErrors) throw error;
    }
  }
  const cleanupQaRootOnExit = () => cleanupQaRoot(true);
  process.once('exit', cleanupQaRootOnExit);

  const port = await reserveLoopbackPort();
  let stdout = '';
  let stderr = '';
  let child = null;
  let childExited = false;
  try {
    child = spawn(electronPath, [`--remote-debugging-port=${port}`, appRoot], {
      cwd: appRoot,
      windowsHide: true,
      env: {
        ...process.env,
        MINERADIO_RUNTIME_NAME: runtimeName,
        MINERADIO_APP_USER_MODEL_ID: `com.mineradio.visual-clip.qa.${process.pid}`,
        MINERADIO_NO_DESKTOP_SHORTCUT: '1',
        MINERADIO_CREATE_DESKTOP_SHORTCUT: '0',
        MINERADIO_STARTUP_QA_USER_DATA: userDataPath,
        MINERADIO_STARTUP_QA_HIDDEN: '1',
        MINERADIO_STARTUP_QA_EXIT_MS: '45000',
        MINERADIO_KEEP_BACKGROUND_RENDERING: '1',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout.on('data', (chunk) => { stdout = (stdout + chunk.toString()).slice(-16000); });
    child.stderr.on('data', (chunk) => { stderr = (stderr + chunk.toString()).slice(-16000); });
    await waitForCdp(port, child);
    await checkVisualClip(port, { closeAfter: true });
    const exitCode = await waitForChildExit(child, 20000);
    childExited = true;
    assert.strictEqual(exitCode, 0, `isolated Mineradio QA exited with ${exitCode}\n${stderr || stdout}`);
  } catch (error) {
    if (child && child.exitCode == null) {
      await requestNormalChildExit(child);
      try {
        await waitForChildExit(child, 20000);
        childExited = true;
      } catch (_) {}
    } else if (child) {
      childExited = true;
    }
    if (stderr || stdout) error.message += `\n--- isolated Electron output ---\n${stderr || stdout}`;
    throw error;
  } finally {
    if (!child || childExited || child.exitCode != null) {
      cleanupQaRoot();
      process.removeListener('exit', cleanupQaRootOnExit);
    }
  }
}

main().catch((error) => {
  if (activeSocket) activeSocket.close();
  console.error(error && error.stack || error);
  process.exitCode = 1;
});
