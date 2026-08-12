'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const {
  clampMiniPlayerBounds,
  createMiniPlayerWindowState,
  enterMiniPlayerWindow,
  exitMiniPlayerWindow,
} = require('../desktop/mini-player-window');

function createWindow(options = {}) {
  const calls = [];
  let bounds = { x: 100, y: 80, width: 1200, height: 720 };
  let maximized = options.maximized === true;
  let alwaysOnTop = false;
  return {
    calls,
    isDestroyed: () => false,
    getBounds: () => ({ ...bounds }),
    getNormalBounds: () => ({ x: 100, y: 80, width: 1200, height: 720 }),
    isMaximized: () => maximized,
    unmaximize: () => { maximized = false; calls.push(['unmaximize']); },
    maximize: () => { maximized = true; calls.push(['maximize']); },
    setMinimumSize: (width, height) => calls.push(['minimum', width, height]),
    setBounds: (value, animate) => { bounds = { ...value }; calls.push(['bounds', { ...value }, animate]); },
    setAlwaysOnTop: (value) => { alwaysOnTop = value; calls.push(['top', value]); },
    state: () => ({ bounds, maximized, alwaysOnTop }),
  };
}

test('mini bounds stay inside the current display and align to the current right edge', () => {
  assert.deepEqual(
    clampMiniPlayerBounds({ x: 100, y: 80, width: 1200, height: 720 }, { x: 0, y: 0, width: 1920, height: 1040 }),
    { x: 860, y: 80, width: 440, height: 180 }
  );
  assert.deepEqual(
    clampMiniPlayerBounds({ x: -1800, y: -120, width: 1000, height: 700 }, { x: -1920, y: 0, width: 1920, height: 1040 }),
    { x: -1240, y: 0, width: 440, height: 180 }
  );
});

test('enter and exit restore normal bounds, maximized state, and clear topmost', () => {
  const win = createWindow({ maximized: true });
  const state = createMiniPlayerWindowState();
  assert.equal(enterMiniPlayerWindow(win, state, { x: 0, y: 0, width: 1920, height: 1040 }), true);
  assert.equal(state.active, true);
  assert.deepEqual(state.restoreBounds, { x: 100, y: 80, width: 1200, height: 720 });
  win.setAlwaysOnTop(true);
  state.alwaysOnTop = true;
  assert.equal(exitMiniPlayerWindow(win, state, { width: 960, height: 540 }, (value) => value), true);
  assert.deepEqual(win.state(), {
    bounds: { x: 100, y: 80, width: 1200, height: 720 },
    maximized: true,
    alwaysOnTop: false,
  });
  assert.equal(state.active, false);
  assert.equal(state.alwaysOnTop, false);
});

test('a failed compact resize rolls back active state and maximized presentation', () => {
  const win = createWindow({ maximized: true });
  const originalSetBounds = win.setBounds;
  let first = true;
  win.setBounds = (value, animate) => {
    if (first) {
      first = false;
      throw new Error('simulated Windows resize failure');
    }
    originalSetBounds(value, animate);
  };
  const state = createMiniPlayerWindowState();
  assert.equal(enterMiniPlayerWindow(win, state, { x: 0, y: 0, width: 1920, height: 1040 }), false);
  assert.equal(state.active, false);
  assert.equal(state.restoreBounds, null);
  assert.equal(win.state().maximized, true);
  assert.deepEqual(win.state().bounds, { x: 100, y: 80, width: 1200, height: 720 });
});

test('desktop bridge and renderer reuse the existing playback owner', () => {
  const main = fs.readFileSync(path.join(root, 'desktop/main.js'), 'utf8');
  const preload = fs.readFileSync(path.join(root, 'desktop/preload.js'), 'utf8');
  const html = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
  const renderer = fs.readFileSync(path.join(root, 'public/js/modules/10-shell/04c-mini-player.js'), 'utf8');
  const css = fs.readFileSync(path.join(root, 'public/css/mini-player.css'), 'utf8');
  const loader = fs.readFileSync(path.join(root, 'public/js/index-loader.js'), 'utf8');

  assert.match(main, /mineradio-mini-player-set-mode/);
  assert.match(main, /isTrustedMainWindowIpc\(event\)/);
  assert.match(main, /miniPlayerWindowState\.active/);
  assert.match(preload, /setMiniPlayerMode/);
  assert.match(preload, /setMiniPlayerAlwaysOnTop/);
  assert.match(html, /id="mini-player"/);
  assert.match(html, /id="mini-player-entry"/);
  assert.match(html, /onclick="togglePlay\(\)"/);
  assert.match(html, /onclick="prevTrack\(true\)"/);
  assert.match(html, /onclick="nextTrack\(true\)"/);
  assert.match(renderer, /setVolume\(this\.value, true\)/);
  assert.match(renderer, /commitProgressSeek/);
  assert.match(renderer, /stageLyricIndexForSeconds/);
  assert.doesNotMatch(renderer, /new Audio\(|document\.createElement\(['"]audio/);
  assert.match(css, /grid-template-columns: 112px minmax\(0, 1fr\)/);
  assert.match(loader, /04c-mini-player\.js/);
  assert.doesNotMatch(`${html}\n${renderer}\n${css}`, /\bLX\b|Mineradio-LX/i);
});
