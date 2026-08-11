'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const modulePath = path.join(root, 'public', 'js', 'modules', '07-fx', '06b-visual-clip.js');

function classList() {
  const values = new Set();
  return {
    add(...names) { names.forEach((name) => values.add(name)); },
    remove(...names) { names.forEach((name) => values.delete(name)); },
    contains(name) { return values.has(name); },
  };
}

function makeElement() {
  const attrs = new Map();
  return {
    hidden: false,
    disabled: false,
    textContent: '',
    offsetWidth: 100,
    style: {},
    classList: classList(),
    setAttribute(name, value) { attrs.set(name, String(value)); },
    getAttribute(name) { return attrs.get(name); },
    addEventListener() {},
    querySelector() { return null; },
  };
}

function makeRuntime(saveResult = { ok: true, fileName: 'clip.webm' }) {
  const elements = {};
  [
    'visual-clip-control', 'visual-clip-status', 'visual-clip-start', 'visual-clip-finish',
    'visual-clip-cancel', 'visual-clip-open-folder', 'visual-clip-progress',
    'visual-clip-time', 'visual-clip-progress-fill', 'visual-clip-countdown',
  ].forEach((id) => { elements[id] = makeElement(); });
  const countdownValue = makeElement();
  elements['visual-clip-countdown'].querySelector = () => countdownValue;

  let savePayload = null;
  let stoppedTracks = 0;
  const track = {
    onended: null,
    stop() { stoppedTracks += 1; },
  };
  const stream = {
    getTracks() { return [track]; },
    getVideoTracks() { return [track]; },
  };

  class FakeMediaRecorder {
    static isTypeSupported(type) { return type === 'video/webm;codecs=vp8'; }
    constructor(_stream, options) {
      this.state = 'inactive';
      this.mimeType = options.mimeType;
    }
    start() { this.state = 'recording'; }
    requestData() {
      if (this.ondataavailable) this.ondataavailable({ data: new Blob([new Uint8Array(2048)], { type: 'video/webm' }) });
    }
    stop() {
      this.state = 'inactive';
      const handler = this.onstop;
      if (handler) setTimeout(handler, 0);
    }
  }

  const desktopWindow = {
    async getVisualClipSource() { return { ok: true, sourceId: 'window:1:0', maxWidth: 1920, maxHeight: 1080, maxFrameRate: 30 }; },
    async saveVisualClip(payload) { savePayload = payload; return saveResult; },
    async showLastVisualClip() { return { ok: true }; },
  };
  const window = {
    desktopWindow,
    MediaRecorder: FakeMediaRecorder,
    matchMedia() { return { matches: true }; },
    addEventListener() {},
  };
  const context = vm.createContext({
    window,
    MediaRecorder: FakeMediaRecorder,
    navigator: { mediaDevices: { async getUserMedia() { return stream; } } },
    document: { getElementById(id) { return elements[id] || null; } },
    Blob,
    Uint8Array,
    Date,
    Math,
    Number,
    String,
    Promise,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    showToast() {},
  });
  vm.runInContext(fs.readFileSync(modulePath, 'utf8'), context, { filename: modulePath });
  context.VISUAL_CLIP_COUNTDOWN_SECONDS = 0;
  context.VISUAL_CLIP_DURATION_MS = 5000;
  return {
    context,
    elements,
    getSavePayload: () => savePayload,
    getStoppedTracks: () => stoppedTracks,
  };
}

async function waitFor(check, timeout = 500) {
  const started = Date.now();
  while (!check()) {
    if (Date.now() - started > timeout) throw new Error('waitFor timeout');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

test('prefers stable VP8 and creates deterministic Windows-safe names', () => {
  const runtime = makeRuntime();
  assert.equal(runtime.context.visualClipRecorderMimeType(runtime.context.MediaRecorder), 'video/webm;codecs=vp8');
  assert.equal(
    runtime.context.visualClipDefaultName(new Date(2026, 7, 11, 9, 5, 7)),
    'Mineradio-场景留影-20260811-090507.webm'
  );
});

test('cancel stops the capture track and never invokes the save bridge', async () => {
  const runtime = makeRuntime();
  await runtime.context.startVisualClipRecording();
  assert.equal(runtime.context.visualClipRuntime.phase, 'recording');
  runtime.context.finishVisualClipRecording(true);
  await waitFor(() => runtime.context.visualClipRuntime.phase === 'idle');
  assert.equal(runtime.getSavePayload(), null);
  assert.equal(runtime.getStoppedTracks(), 1);
});

test('finish sends bounded binary WebM data through the dedicated bridge', async () => {
  const runtime = makeRuntime();
  await runtime.context.startVisualClipRecording();
  runtime.context.finishVisualClipRecording(false);
  await waitFor(() => runtime.context.visualClipRuntime.phase === 'idle');
  const payload = runtime.getSavePayload();
  assert.ok(payload);
  assert.equal(payload.mime, 'video/webm;codecs=vp8');
  assert.ok(payload.bytes instanceof Uint8Array);
  assert.ok(payload.bytes.byteLength >= 2048);
  assert.match(payload.defaultName, /^Mineradio-场景留影-\d{8}-\d{6}\.webm$/);
  assert.equal(runtime.context.visualClipRuntime.savedFileName, 'clip.webm');
});

test('Electron wiring exposes only the current window source and a narrow WebM save IPC', () => {
  const main = fs.readFileSync(path.join(root, 'desktop', 'main.js'), 'utf8');
  const preload = fs.readFileSync(path.join(root, 'desktop', 'preload.js'), 'utf8');
  const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
  const loader = fs.readFileSync(path.join(root, 'public', 'js', 'index-loader.js'), 'utf8');
  const workspace = fs.readFileSync(path.join(root, 'public', 'js', 'modules', '07-fx', '09-console-workspace.js'), 'utf8');
  const sourceHandler = main.slice(main.indexOf("ipcMain.handle('mineradio-visual-clip-source'"), main.indexOf("ipcMain.handle('mineradio-visual-clip-save'"));

  assert.match(sourceHandler, /isTrustedMainWindowIpc\(event\)/);
  assert.match(sourceHandler, /mainWindow\.getMediaSourceId\(\)/);
  assert.match(sourceHandler, /requestStarted:\s*false/);
  assert.match(main, /VISUAL_CLIP_CAPTURE_GRANT_MS\s*=\s*10000/);
  assert.match(main, /isTrustedVisualClipMediaPermission[\s\S]{0,900}mediaTypes\.some\(\(value\) => value\.includes\('audio'\)\)/);
  assert.match(main, /visualClipGrant\.requestStarted[\s\S]{0,160}callback\(false\)[\s\S]{0,160}callback\(true\)/);
  assert.doesNotMatch(sourceHandler, /desktopCapturer\.getSources/);
  assert.match(main, /VISUAL_CLIP_MAX_BYTES\s*=\s*32 \* 1024 \* 1024/);
  assert.match(main, /filters:\s*\[\{ name: 'WebM 视频', extensions: \['webm'\] \}\]/);
  assert.match(preload, /getVisualClipSource:[\s\S]{0,120}mineradio-visual-clip-source/);
  assert.match(preload, /saveVisualClip:[\s\S]{0,120}mineradio-visual-clip-save/);
  assert.match(html, /id="visual-clip-control"/);
  assert.match(loader, /06b-visual-clip\.js/);
  assert.match(workspace, /key: 'visual-clip'[\s\S]{0,180}fxConsoleItem\('visual-clip-control'/);
  assert.doesNotMatch(html + fs.readFileSync(modulePath, 'utf8'), /LX Music|LXMusic|lx-music/i);
});
