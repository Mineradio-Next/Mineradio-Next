'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('approved Mineradio Next mark stays in the titlebar while startup remains wordmark-only', () => {
  const startup = read('desktop/startup.html');
  const html = read('public/index.html');
  const css = read('public/css/index.css');

  assert.match(html, /<title>Mineradio Next<\/title>/);
  assert.match(startup, /Mineradio<span>Next<\/span>/);
  assert.match(html, /desktop-app-title[^]*assets\/brand\/mineradio-next-icon\.svg[^]*Mineradio<\/strong><span>Next<\/span>/);
  assert.match(html, /class="splash-brand"[^]*class="splash-brand-copy"[^]*Mineradio<\/strong><span>Next<\/span>/);
  assert.match(html, /id="visual-guide-btn"[^]*aria-label="查看使用引导">\?<\/button>/);
  assert.match(css, /\.desktop-app-title span/);
  assert.match(css, /@keyframes splash-wordmark-scan/);
  assert.match(css, /\.player-tools-panel,[^]*rgba\(14, 18, 20, \.88\)/);
  const splashMarkup = /<div id="splash">([\s\S]*?)<div id="hint"/.exec(html);
  assert.ok(splashMarkup, 'startup splash markup must remain present');
  assert.doesNotMatch(splashMarkup[1], /mineradio-next-icon\.svg/);
  assert.doesNotMatch(startup, /class="mark"|mineradio-next-mark-initial/);
  assert.match(css, /\.desktop-app-title img/);
  assert.doesNotMatch(css, /\.splash-brand-mark/);
});

test('the original help entry remains while the guide follows current product surfaces', () => {
  const html = read('public/index.html');
  const guide = read('public/js/modules/09-idle-toast-libraries.js');
  const stores = read('public/js/modules/00-state/00-core-stores.js');

  assert.match(html, /id="visual-guide-btn"[^]*aria-label="查看使用引导">\?<\/button>/);
  assert.match(guide, /selectors: \['#music-library-btn', '\[data-home-tone="library"\]'\]/);
  assert.match(guide, /selector: '#player-tools-btn'/);
  assert.match(guide, /step\.selector === '#player-tools-btn'/);
  assert.match(guide, /visibleVisualGuideTarget/);
  assert.match(guide, /ring\.classList\.toggle\('no-target', !hasTarget\)/);
  assert.match(guide, /selectors: \['#music-library-btn', '\[data-home-tone="library"\]'\]/);
  assert.match(guide, /视觉控制仍由独立的视觉控制台负责/);
  assert.doesNotMatch(guide, /高级播放控制会补全/);
  assert.doesNotMatch(guide, /01 \/ Welcome|01 \/ DIY|target: 'overview'/);
  assert.match(guide, /kicker: '01 \/ Search'/);
  assert.match(stores, /mineradio-visual-guide-seen-v4/);
});
