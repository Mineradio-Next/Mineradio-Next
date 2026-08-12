'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const appRoot = path.join(__dirname, '..');
const spectrumPath = path.join(appRoot, 'public', 'js', 'modules', '05-playback', '08b-player-spectrum.js');
const listeningPath = path.join(appRoot, 'public', 'js', 'modules', '05-playback', '08a-listening-effects.js');

test('spectrum module normalizes preference and samples shared analyser data', () => {
  delete require.cache[require.resolve(spectrumPath)];
  const spectrum = require(spectrumPath);
  assert.equal(spectrum.normalizePreference(false), false);
  assert.equal(spectrum.normalizePreference({ enabled: false }), false);
  assert.equal(spectrum.normalizePreference({ enabled: true }), true);
  assert.equal(spectrum.sample(new Uint8Array([0, 64, 128, 255]), 0, 2) >= 0, true);
  assert.equal(spectrum.sample(new Uint8Array([0, 64, 128, 255]), 1, 2) <= 1, true);
});

test('spectrum refreshes the shared analyser data before every active draw', () => {
  const previousData = global.frequencyData;
  const previousAnalyser = global.analyser;
  const target = new Uint8Array(8);
  let refreshes = 0;
  global.frequencyData = target;
  global.analyser = {
    getByteFrequencyData(data) {
      refreshes += 1;
      data.fill(96);
    },
  };
  try {
    delete require.cache[require.resolve(spectrumPath)];
    const spectrum = require(spectrumPath);
    assert.strictEqual(spectrum.refreshData(true), target);
    assert.equal(refreshes, 1);
    assert.deepEqual(Array.from(target), Array(8).fill(96));
    spectrum.refreshData(false);
    assert.equal(refreshes, 1);
  } finally {
    if (previousData === undefined) delete global.frequencyData;
    else global.frequencyData = previousData;
    if (previousAnalyser === undefined) delete global.analyser;
    else global.analyser = previousAnalyser;
  }
});

test('player spectrum is wired as a low-load native player surface', () => {
  const source = fs.readFileSync(spectrumPath, 'utf8');
  const html = fs.readFileSync(path.join(appRoot, 'public', 'index.html'), 'utf8');
  const css = fs.readFileSync(path.join(appRoot, 'public', 'css', 'index.css'), 'utf8');
  const loader = fs.readFileSync(path.join(appRoot, 'public', 'js', 'index-loader.js'), 'utf8');
  const chrome = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '01-scene', '04-bottom-controls-cursor.js'), 'utf8');

  assert.match(html, /id="player-spectrum-canvas"/);
  assert.match(html, /id="player-spectrum-toggle"/);
  assert.match(css, /\.player-spectrum-canvas\s*\{[\s\S]*position:\s*absolute[\s\S]*pointer-events:\s*none/);
  assert.match(css, /\.player-spectrum-canvas\s*\{[\s\S]*top:\s*-7px/);
  assert.match(css, /\.player-spectrum-canvas\.enabled\s*\{[\s\S]*opacity:\s*\.96/);
  assert.match(loader, /08a-listening-effects\.js'[\s\S]*08b-player-spectrum\.js'/);
  assert.match(chrome, /\['player-spectrum-toggle', '播放频谱'\]/);
  assert.match(source, /typeof frequencyData !== 'undefined' \? frequencyData : null/);
  assert.match(source, /sourceAnalyser\.getByteFrequencyData\(data\)/);
  assert.doesNotMatch(source, /createAnalyser\s*\(/);
  assert.match(source, /document\.hidden[\s\S]*return 750/);
  assert.match(source, /!playerSpectrumUiVisible\(\)\) return 750/);
  assert.match(source, /!active && playerSpectrumSettled\) return 750/);
  assert.match(source, /classList\.contains\('visible'\)[\s\S]*classList\.contains\('soft-hidden'\)/);
  assert.match(source, /addEventListener\('play'[\s\S]*playerSpectrumSettled = false/);
  assert.match(source, /prefers-reduced-motion:\s*reduce/);
  assert.match(source, /active \? 34 : 110/);
  assert.match(source, /baselineY = size\.height \* 0\.62/);
  assert.match(source, /maxHeight = size\.height \* 0\.60/);
  assert.match(source, /globalAlpha = active \? 0\.66 : 0\.24/);
  assert.doesNotMatch(source, /context\.strokeStyle = palette\.light/);
  assert.doesNotMatch(html, />[^<]*LX[^<]*</i);
});

test('preamp is a migrated gain stage before EQ and appears in both control surfaces', () => {
  const source = fs.readFileSync(listeningPath, 'utf8');
  const html = fs.readFileSync(path.join(appRoot, 'public', 'index.html'), 'utf8');
  assert.match(source, /preampDb:\s*0/);
  assert.match(source, /listeningEffectsClamp\(raw\.preampDb == null \? 0 : raw\.preampDb, -12, 6\)/);
  assert.match(source, /graph\.input\.connect\(graph\.preamp\);[\s\S]*var current = graph\.preamp;/);
  assert.match(source, /Math\.pow\(10, state\.preampDb \/ 20\)/);
  assert.equal((html.match(/data-listening-preamp/g) || []).length, 2);
});
