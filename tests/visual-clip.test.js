'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const modulePath = path.join(root, 'public', 'js', 'modules', '07-fx', '06b-visual-clip.js');
const { resolveVisualClipSaveSelection } = require('../desktop/visual-clip-save-path');

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

function makeRuntime(saveResult = { ok: true, fileName: 'clip.webm' }, options = {}) {
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
    getVideoTracks() { return options.emptyVideoTracks ? [] : [track]; },
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
    beginVisualClipCapture() {
      window.__testVisualClipCapture = Promise.resolve(stream);
      return { ok: true, captureKey: '__testVisualClipCapture' };
    },
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
    navigator: { mediaDevices: { async getDisplayMedia() { return stream; } } },
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

test('an invalid display stream releases every track before reporting the error', async () => {
  const runtime = makeRuntime(undefined, { emptyVideoTracks: true });
  await assert.rejects(runtime.context.openVisualClipStream(), /VISUAL_CLIP_STREAM_EMPTY/);
  assert.equal(runtime.getStoppedTracks(), 1);
});

test('save selection confirms the final WebM path instead of silently replacing an extension', () => {
  assert.deepEqual(resolveVisualClipSaveSelection('C:\\Clips\\scene.webm'), {
    accepted: true,
    filePath: 'C:\\Clips\\scene.webm',
    nextDefaultPath: 'C:\\Clips\\scene.webm',
  });
  assert.deepEqual(resolveVisualClipSaveSelection('C:\\Clips\\scene.mp4'), {
    accepted: false,
    nextDefaultPath: 'C:\\Clips\\scene.webm',
  });
  assert.deepEqual(resolveVisualClipSaveSelection('C:\\Clips\\scene'), {
    accepted: false,
    nextDefaultPath: 'C:\\Clips\\scene.webm',
  });
});

test('Electron wiring binds display capture to the current window and narrows WebM IPC', () => {
  const main = fs.readFileSync(path.join(root, 'desktop', 'main.js'), 'utf8');
  const preload = fs.readFileSync(path.join(root, 'desktop', 'preload.js'), 'utf8');
  const visualClipModule = fs.readFileSync(modulePath, 'utf8');
  const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
  const loader = fs.readFileSync(path.join(root, 'public', 'js', 'index-loader.js'), 'utf8');
  const workspace = fs.readFileSync(path.join(root, 'public', 'js', 'modules', '07-fx', '09-console-workspace.js'), 'utf8');
  const sourceHandler = main.slice(main.indexOf("ipcMain.on('mineradio-visual-clip-source'"), main.indexOf("ipcMain.handle('mineradio-visual-clip-save'"));
  const permissionHandlers = main.slice(main.indexOf('ses.setPermissionCheckHandler'), main.indexOf('ses.setDisplayMediaRequestHandler'));
  const displayHandler = main.slice(main.indexOf('ses.setDisplayMediaRequestHandler'), main.indexOf('function sendWindowState'));
  const saveHandler = main.slice(main.indexOf("ipcMain.handle('mineradio-visual-clip-save'"), main.indexOf("ipcMain.handle('mineradio-visual-clip-show-last'"));

  assert.match(sourceHandler, /isTrustedMainWindowIpc\(event\)/);
  assert.match(sourceHandler, /mainWindow\.getMediaSourceId\(\)/);
  assert.match(sourceHandler, /event\.returnValue/);
  assert.match(sourceHandler, /mediaPermissionStarted:\s*false/);
  assert.match(sourceHandler, /displayRequestStarted:\s*false/);
  assert.match(main, /VISUAL_CLIP_CAPTURE_GRANT_MS\s*=\s*10000/);
  assert.doesNotMatch(sourceHandler, /desktopCapturer\.getSources/);
  assert.match(visualClipModule, /navigator\.mediaDevices\.getDisplayMedia/);
  assert.doesNotMatch(visualClipModule, /chromeMediaSource|chromeMediaSourceId|getUserMedia/);
  assert.match(permissionHandlers, /permission === 'display-capture'[\s\S]{0,180}isTrustedVisualClipDisplayCapturePermission/);
  assert.match(permissionHandlers, /permission === 'media'[\s\S]{0,260}isTrustedVisualClipMediaPermission\(webContents, origin, details, true\)/);
  assert.match(permissionHandlers, /visualGrant\.mediaPermissionStarted !== true/);
  assert.match(displayHandler, /const visualGrant = getVisualClipCaptureGrant\(\)/);
  assert.match(displayHandler, /desktopCapturer\.getSources\(\{[\s\S]{0,180}types: \['window'\]/);
  assert.match(displayHandler, /candidate\.id \|\| ''\) === currentSourceId/);
  assert.match(displayHandler, /visualGrant\.sourceId !== currentSourceId/);
  assert.match(main, /VISUAL_CLIP_MAX_BYTES\s*=\s*32 \* 1024 \* 1024/);
  assert.match(main, /filters:\s*\[\{ name: 'WebM 视频', extensions: \['webm'\] \}\]/);
  assert.match(saveHandler, /while \(!filePath\)[\s\S]{0,600}resolveVisualClipSaveSelection\(result\.filePath\)/);
  assert.match(saveHandler, /if \(!selection\.accepted\)[\s\S]{0,160}continue/);
  assert.match(saveHandler, /filePath = selection\.filePath/);
  assert.match(preload, /function beginVisualClipCapture\(\)[\s\S]{0,180}sendSync\('mineradio-visual-clip-source'\)/);
  assert.match(preload, /contextBridge\.executeInMainWorld\([\s\S]{0,500}navigator\.mediaDevices\.getDisplayMedia/);
  assert.doesNotMatch(preload, /getVisualClipSource:/);
  assert.match(preload, /function saveVisualClip\(payload\)[\s\S]{0,500}bytes\.byteLength > VISUAL_CLIP_MAX_BYTES/);
  assert.match(preload, /ipcRenderer\.invoke\('mineradio-visual-clip-save'/);
  assert.match(html, /id="visual-clip-control"/);
  assert.match(loader, /06b-visual-clip\.js/);
  assert.match(workspace, /key: 'visual-clip'[\s\S]{0,180}fxConsoleItem\('visual-clip-control'/);
  assert.doesNotMatch(html + visualClipModule, /LX Music|LXMusic|lx-music/i);
  assert.match(visualClipModule, /visualClipDelay\(940\)[\s\S]{0,140}visualClipDelay\(180\)/);
});

test('live capture QA is isolated and restores every emulated UI state', () => {
  const main = fs.readFileSync(path.join(root, 'desktop', 'main.js'), 'utf8');
  const liveCheck = fs.readFileSync(path.join(root, 'scripts', 'check-visual-clip-live.js'), 'utf8');

  assert.match(main, /skipTaskbar:\s*process\.env\.MINERADIO_STARTUP_QA_HIDDEN === '1'/);
  assert.match(liveCheck, /fs\.mkdtempSync\(path\.join\(os\.tmpdir\(\), 'mineradio-visual-clip-qa-'\)\)/);
  assert.match(liveCheck, /MINERADIO_RUNTIME_NAME:\s*runtimeName/);
  assert.match(liveCheck, /MINERADIO_STARTUP_QA_USER_DATA:\s*userDataPath/);
  assert.match(liveCheck, /MINERADIO_STARTUP_QA_HIDDEN:\s*'1'/);
  assert.match(liveCheck, /MINERADIO_APP_USER_MODEL_ID:/);
  assert.match(liveCheck, /spawn\(electronPath, \[`--remote-debugging-port=\$\{port\}`, appRoot\]/);
  assert.doesNotMatch(liveCheck, /process\.argv\[2\]/);
  assert.match(liveCheck, /panelClass:[\s\S]{0,500}groupClass:[\s\S]{0,500}diyMode:/);
  assert.match(liveCheck, /finally \{[\s\S]{0,180}Emulation\.clearDeviceMetricsOverride/);
  assert.match(liveCheck, /Emulation\.setEmulatedMedia', \{ features: \[\] \}/);
  assert.match(liveCheck, /panel\.className = state\.panelClass/);
  assert.match(liveCheck, /group\.className = state\.groupClass/);
  assert.match(liveCheck, /desktopWindow\.close\('exit'\)/);
  assert.match(liveCheck, /process\.once\('exit', cleanupQaRootOnExit\)/);
  assert.match(liveCheck, /if \(!child \|\| childExited \|\| child\.exitCode != null\) \{[\s\S]{0,100}cleanupQaRoot\(\)/);
  assert.match(liveCheck, /CDP_CALL_TIMEOUT_MS\s*=\s*9000/);
  assert.match(liveCheck, /const recording = await evaluate\([\s\S]{0,8000}\}\)\(\)`, 30000\)/);
  assert.match(liveCheck, /MINERADIO_STARTUP_QA_EXIT_MS:\s*'45000'/);
  assert.match(liveCheck, /function rejectPending\(error\)[\s\S]{0,160}pending\.clear\(\)/);
  assert.match(liveCheck, /socket\.addEventListener\('close',[\s\S]{0,120}rejectPending/);
  assert.match(liveCheck, /CDP \$\{method\} timed out/);
  assert.match(liveCheck, /await requestNormalChildExit\(child\)/);
});
