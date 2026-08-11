'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  constrainDesktopLyricsBounds,
  desktopLyricsDisplayAnchor,
  desktopLyricsDefaultBounds,
  desktopLyricsRatiosFromBounds,
  parseDesktopLyricsDisplayAnchor,
  reconcileDesktopLyricsPositionPayload,
} = require('../desktop/desktop-lyrics-layout');

const root = path.join(__dirname, '..');

test('desktop lyric bounds honor horizontal and vertical ratios', () => {
  const display = { x: 0, y: 0, width: 1920, height: 1080 };
  const left = desktopLyricsDefaultBounds(display, { x: 0.02, y: 0.5 });
  const center = desktopLyricsDefaultBounds(display, { x: 0.5, y: 0.5 });
  const right = desktopLyricsDefaultBounds(display, { x: 0.98, y: 0.5 });

  assert.ok(left.x < center.x);
  assert.ok(center.x < right.x);
  assert.equal(center.x, Math.round((display.width - center.width) / 2));
  assert.equal(center.y + center.height / 2, display.height / 2);
});

test('dragged bounds recover stable ratios on a negative-coordinate display', () => {
  const display = { x: -1600, y: -120, width: 1600, height: 900 };
  const bounds = desktopLyricsDefaultBounds(display, { x: 0.23, y: 0.68 });
  const ratios = desktopLyricsRatiosFromBounds(bounds, display);

  assert.ok(Math.abs(ratios.x - 0.23) < 0.002);
  assert.ok(Math.abs(ratios.y - 0.68) < 0.002);
});

test('desktop lyric bounds stay inside small displays', () => {
  const display = { x: -300, y: 40, width: 300, height: 160 };
  const bounds = desktopLyricsDefaultBounds(display, { x: 0.98, y: 0.92 });
  assert.ok(bounds.width <= display.width);
  assert.ok(bounds.height <= display.height);
  assert.ok(bounds.x >= display.x);
  assert.ok(bounds.y >= display.y);
  assert.ok(bounds.x + bounds.width <= display.x + display.width);
  assert.ok(bounds.y + bounds.height <= display.y + display.height);
});

test('constraining a dragged window preserves its size and display boundary', () => {
  const display = { x: 120, y: 80, width: 1280, height: 720 };
  assert.deepEqual(
    constrainDesktopLyricsBounds({ x: -500, y: 900, width: 920, height: 340 }, display),
    { x: 120, y: 460, width: 920, height: 340 }
  );
});

test('display anchors retain a secondary display across restart and reject corrupt input', () => {
  const display = { id: 2528732444, bounds: { x: -1600, y: -120, width: 1600, height: 900 } };
  const anchor = desktopLyricsDisplayAnchor(display);
  assert.deepEqual(parseDesktopLyricsDisplayAnchor(anchor), {
    id: '2528732444',
    bounds: display.bounds,
  });
  assert.equal(parseDesktopLyricsDisplayAnchor('bad-anchor'), null);
});

test('late renderer positions cannot overwrite a newer drag result', () => {
  const stale = reconcileDesktopLyricsPositionPayload({
    x: 0.12,
    y: 0.22,
    display: 'old|0|0|1920|1080',
    positionRevision: 4,
    text: 'still-current-lyric',
  }, 5);
  assert.equal(stale.stale, true);
  assert.equal(stale.revision, 5);
  assert.equal(stale.payload.x, undefined);
  assert.equal(stale.payload.display, undefined);
  assert.equal(stale.payload.text, 'still-current-lyric');

  const current = reconcileDesktopLyricsPositionPayload({ x: 0.82, positionRevision: 5 }, 5);
  assert.equal(current.stale, false);
  assert.equal(current.payload.x, 0.82);
});

test('desktop lyric positioning is wired through state, UI, IPC, and persistence', () => {
  const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
  assert.match(read('public/js/modules/00-state/04-fx-defaults.js'), /desktopLyricsX:\s*0\.5/);
  assert.match(read('public/js/modules/02-visual/04-visual-settings-persistence.js'), /desktop-lyrics-v4/);
  assert.match(read('public/js/modules/02-visual/04-visual-settings-persistence.js'), /desktopLyricsX:/);
  assert.match(read('public/js/modules/02-visual/04-visual-settings-persistence.js'), /desktopLyricsDisplay:/);
  assert.match(read('public/index.html'), /id="fx-desktoplyricsx"/);
  assert.match(read('public/index.html'), /data-desktop-lyrics-position="center"/);
  assert.match(read('desktop/preload.js'), /onDesktopLyricsPositionState/);
  assert.match(read('desktop/main.js'), /mineradio-desktop-lyrics-position-state/);
  assert.match(read('public/js/modules/10-shell/04-desktop-overlay-fullscreen.js'), /onDesktopLyricsPositionState/);
});
