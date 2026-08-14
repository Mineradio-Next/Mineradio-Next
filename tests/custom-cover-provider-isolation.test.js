'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'modules', '05-playback', '01-cover-custom-map.js'), 'utf8');

test('custom cover keys isolate provider identities even when numeric ids collide', () => {
  const context = vm.createContext({ console });
  vm.runInContext(source, context);
  assert.equal(context.songCustomCoverKey({ provider: 'netease', source: 'netease', id: 42 }), 'netease:42');
  assert.equal(context.songCustomCoverKey({ provider: 'kugou', source: 'kugou', id: 42, hash: 'HASH-42' }), 'kugou:HASH-42');
  assert.equal(context.songCustomCoverKey({ provider: 'spotify', source: 'spotify', id: 42 }), 'spotify:42');
  assert.equal(context.songCustomCoverKey({ provider: 'backup-source', source: 'backup-source', additionalSourceCode: 'kw', id: 42 }), 'backup-source:kw:42');
});
