'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const modulePath = path.join(root, 'public/js/modules/05-playback/06a-lyric-track-editor.js');
const loaderPath = path.join(root, 'public/js/index-loader.js');
const htmlPath = path.join(root, 'public/index.html');
const preloadPath = path.join(root, 'desktop/preload.js');
const mainPath = path.join(root, 'desktop/main.js');
const source = fs.readFileSync(modulePath, 'utf8');
const loaderSource = fs.readFileSync(loaderPath, 'utf8');
const htmlSource = fs.readFileSync(htmlPath, 'utf8');
const preloadSource = fs.readFileSync(preloadPath, 'utf8');
const mainSource = fs.readFileSync(mainPath, 'utf8');
const editor = require(modulePath);

test('normalizes, filters, sorts, and rounds three-track lyric rows', () => {
  const lines = editor.normalizeLyricEditorLines([
    { t: 4.56789, text: 'second', translation: '二', romaji: 'ni' },
    { t: -2, original: 'first' },
    { t: 3, original: '   ', translation: '', romanization: '' },
    { t: 'bad', original: 'ignored' }
  ], true);
  assert.deepEqual(lines, [
    { t: 0, original: 'first', translation: '', romanization: '' },
    { t: 4.568, original: 'second', translation: '二', romanization: 'ni' }
  ]);
});

test('shifts the entire track without allowing negative timestamps', () => {
  const shifted = editor.shiftLyricEditorLines([
    { t: 0.2, original: 'a' },
    { t: 2.345, original: 'b' }
  ], -0.5);
  assert.deepEqual(shifted.map(line => line.t), [0, 1.845]);
});

test('converts resolved lyric state and keeps translation and romanization', () => {
  const lines = editor.lyricEditorLinesFromLyricState([
    { t: 1, text: 'Hello', translation: '你好', romanization: 'ni hao' },
    { t: 0, text: 'fallback', fallback: true }
  ]);
  assert.deepEqual(lines, [{ t: 1, original: 'Hello', translation: '你好', romanization: 'ni hao' }]);
});

test('migrates legacy strings and preserves versioned editor rows', () => {
  const stored = editor.normalizeStoredCustomLyricMap({
    legacy: '[00:01.00] old',
    current: {
      text: '[00:02.00] new',
      updatedAt: 42,
      editor: { schema: 9, lines: [{ t: 2.0004, text: 'new', romaji: 'nyuu' }] }
    },
    broken: { updatedAt: 3 }
  });
  assert.deepEqual(stored.legacy, { text: '[00:01.00] old', updatedAt: 0 });
  assert.deepEqual(stored.current.editor, {
    schema: 1,
    lines: [{ t: 2, original: 'new', translation: '', romanization: 'nyuu' }]
  });
  assert.equal(Object.hasOwn(stored, 'broken'), false);
});

test('serializes standard and enhanced LRC deterministically', () => {
  const song = { name: 'Song', artist: 'Artist' };
  const lines = [{ t: 62.345, original: 'Hello', translation: '你好', romanization: 'ni hao' }];
  const standard = editor.lyricEditorStandardLrc(lines, song);
  const enhanced = editor.lyricEditorEnhancedLrc(lines, song);
  assert.match(standard, /\[01:02\.35\] Hello/);
  assert.doesNotMatch(standard, /\[tr\]|\[roma\]/);
  assert.match(enhanced, /\[01:02\.345\] Hello/);
  assert.match(enhanced, /\[01:02\.345\] \[tr\]你好/);
  assert.match(enhanced, /\[01:02\.345\] \[roma\]ni hao/);
  assert.deepEqual(editor.parseEnhancedLyricEditorText(enhanced), lines);
  assert.equal(editor.formatLyricEditorTimestamp(59.999, false), '01:00.00');
});

test('integrates through the original modal and lyric pipeline without derivative branding', () => {
  assert.match(loaderSource, /06-track-detail-lyrics-actions\.js'[\s\S]*06a-lyric-track-editor\.js'/);
  assert.match(htmlSource, /id="custom-lyric-modal"/);
  assert.match(htmlSource, /id="lyric-editor-rows"/);
  assert.match(htmlSource, />歌词工作台</);
  assert.match(source, /applyLyricsState\(/);
  assert.match(source, /CUSTOM_LYRIC_STORE_KEY/);
  assert.match(source, /editor:\s*\{\s*schema:\s*1/);
  assert.match(preloadSource, /exportTextFile/);
  assert.match(mainSource, /mineradio-export-text-file/);
  assert.doesNotMatch(source + htmlSource, /\bLX\b|\/api\/lx-/i);
});
