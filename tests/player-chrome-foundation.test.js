'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const appRoot = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(appRoot, 'public', 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(appRoot, 'public', 'css', 'index.css'), 'utf8');
const chrome = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '01-scene', '04-bottom-controls-cursor.js'), 'utf8');
const listening = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '05-playback', '08a-listening-effects.js'), 'utf8');
const progress = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '06-lyrics', '04-progress-seek.js'), 'utf8');
const restore = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '05-playback', '09-queue-snapshot-autoplay.js'), 'utf8');

function namedFunctionSource(source, name) {
  const declaration = new RegExp(`function\\s+${name}\\s*\\(`).exec(source);
  if (!declaration) return '';
  const start = source.indexOf('{', declaration.index + declaration[0].length);
  let depth = 0;
  let quote = '';
  let escaped = false;
  for (let index = start; index < source.length; index += 1) {
    const character = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === quote) quote = '';
      continue;
    }
    if (character === '"' || character === "'" || character === '`') quote = character;
    else if (character === '{') depth += 1;
    else if (character === '}' && --depth === 0) return source.slice(declaration.index, index + 1);
  }
  return '';
}

test('progress clock has stable current and duration columns', () => {
  assert.match(html, /id="progress-row"[\s\S]*id="current-time-display"[\s\S]*id="progress-bar"[\s\S]*id="time-display"/);
  assert.equal((html.match(/id="time-display"/g) || []).length, 1);
  assert.match(css, /#progress-row[\s\S]*grid-template-columns:\s*46px minmax\(120px, 1fr\) 46px/);

  const current = { textContent: '' };
  const duration = { textContent: '' };
  const context = vm.createContext({
    document: { getElementById: id => id === 'current-time-display' ? current : duration },
    formatProgramTime: seconds => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`,
  });
  vm.runInContext(namedFunctionSource(progress, 'setPlaybackClockUi'), context);
  context.setPlaybackClockUi(65, 245);
  assert.equal(current.textContent, '1:05');
  assert.equal(duration.textContent, '4:05');
  assert.match(restore, /setPlaybackClockUi\(currentSec, durationSec\)/);
});

test('player chrome exposes explicit standard, original, and extension ownership', () => {
  for (const id of ['player-standard-tools', 'player-original-tools', 'player-tools-control', 'player-tools-btn', 'player-tools-panel', 'player-extension-slot']) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(chrome, /\['play-mode-btn', 'lyric-timing-control', 'mini-queue-btn', 'volume-control'\]/);
  assert.match(chrome, /\['controls-hide-btn', 'immersive-btn'\]/);
  assert.match(chrome, /querySelector\('\.fullscreen-toggle-btn'\)/);
  assert.match(chrome, /\['cuefield-automix-btn', '智能衔接'\]/);
  assert.match(chrome, /\['listening-effects-control', '听感调节'\]/);
  assert.match(chrome, /\['sleep-timer-control', '定时停播'\]/);
});

test('extension panel has complete close behavior and keeps original controls visible', () => {
  const setter = namedFunctionSource(chrome, 'setPlayerToolsPanelOpen');
  assert.match(setter, /aria-expanded/);
  assert.match(setter, /listening-effects-control/);
  assert.match(setter, /sleep-timer-control/);
  assert.match(chrome, /event\.key !== 'Escape'/);
  assert.match(chrome, /!control\.contains\(event\.target\)/);
  assert.match(css, /body\.diy-mode #player-original-tools #controls-hide-btn[\s\S]*display: inline-flex !important/);
  assert.match(css, /body\.diy-mode #player-original-tools \.fullscreen-toggle-btn/);
  assert.match(css, /body\.simple-mode #player-original-tools #controls-hide-btn/);
  assert.match(css, /body\.simple-mode #player-original-tools \.fullscreen-toggle-btn/);
  assert.match(css, /@media \(max-width: 800px\)[\s\S]*grid-template-rows:\s*58px 40px/);
});

test('nested player tools stay inside narrow and wide viewports', () => {
  const context = vm.createContext({ Math, Number });
  vm.runInContext(namedFunctionSource(chrome, 'playerToolPopoverNudge'), context);
  [
    { viewport: 960, controlLeft: 900, width: 316 },
    { viewport: 540, controlLeft: 490, width: 316 },
    { viewport: 360, controlLeft: 310, width: 316 },
  ].forEach(({ viewport, controlLeft, width }) => {
    const targetLeft = controlLeft - 14 - width;
    const left = targetLeft + context.playerToolPopoverNudge(controlLeft, width, viewport);
    assert.ok(left >= 12, `left edge escaped at ${viewport}px`);
    assert.ok(left + width <= viewport - 12, `right edge escaped at ${viewport}px`);
  });
  assert.match(css, /right:\s*calc\(100% \+ 14px - var\(--player-tool-popover-nudge, 0px\)\)/);
  assert.match(css, /\.player-tools-panel \.listening-effects-control::before[\s\S]*width:\s*18px/);
});

test('transport becomes a dedicated previous, play, next cluster at runtime', () => {
  assert.match(chrome, /standard\.appendChild\(node\)/);
  assert.match(chrome, /extensions\.appendChild\(row\)/);
  assert.match(chrome, /original\.appendChild\(fullscreen\)/);
  assert.doesNotMatch(chrome, /\['prev-btn'[^\]]*appendChild/);
  assert.match(css, /\.control-cluster\.transport[\s\S]*gap:\s*8px/);
});

test('listening console renders neutral-centered range feedback', () => {
  const properties = {};
  const attributes = {};
  const input = {
    min: '-9',
    max: '9',
    value: '2',
    style: { setProperty: (name, value) => { properties[name] = value; } },
    setAttribute: (name, value) => { attributes[name] = value; },
  };
  const context = vm.createContext({
    Number,
    isFinite,
    listeningEffectsClamp: (value, min, max) => Math.min(max, Math.max(min, value)),
  });
  vm.runInContext(namedFunctionSource(listening, 'updateListeningRangeVisual'), context);
  context.updateListeningRangeVisual(input, 0);
  assert.equal(properties['--listening-fill-start'], '50.00%');
  assert.equal(properties['--listening-fill-end'], '61.11%');
  assert.equal(properties['--listening-neutral'], '50.00%');
  assert.equal(attributes['data-listening-direction'], 'positive');
  assert.match(html, /class="listening-effects-head-copy"[\s\S]*均衡与空间/);
  assert.match(css, /input\[type="range"\]::\-webkit-slider-runnable-track/);
});
