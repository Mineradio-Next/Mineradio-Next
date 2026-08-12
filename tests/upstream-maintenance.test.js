'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');
const report = require('../scripts/upstream-report');

function git(cwd, args) {
  return cp.execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8' }).trim();
}

test('upstream report classifies project ownership boundaries', () => {
  assert.equal(report.classifyPath('public/js/modules/05-playback/14-player-controls.js'), 'playback/provider');
  assert.equal(report.classifyPath('desktop/main.js'), 'desktop/runtime');
  assert.equal(report.classifyPath('package-lock.json'), 'build/dependency');
  assert.equal(report.classifyPath('docs/README.md'), 'documentation');
  assert.equal(report.classifyOverlap('server.js'), 'manual migration required');
});

test('upstream lock validation rejects malformed baselines', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mineradio-lock-'));
  const file = path.join(dir, 'upstream-lock.json');
  fs.writeFileSync(file, JSON.stringify({ schemaVersion: 1, original: { commit: 'bad', branch: 'main' }, lx: { commit: '0'.repeat(40), branch: 'main' } }));
  assert.throws(() => report.readLock(file), /UPSTREAM_LOCK_ORIGINAL_COMMIT_INVALID/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('upstream markdown declares the advisory no-merge contract', () => {
  const text = report.markdown({ generatedAt: 'now', lockedAt: 'then', sources: [{ name: 'original', repository: 'x', state: 'unchanged', oldCommit: 'a', newCommit: 'a', action: 'no action', commits: [], changed: [], overlap: [] }] });
  assert.match(text, /does not merge, cherry-pick, rebase, checkout/);
  assert.match(text, /No changed path overlaps/);
});

test('changed-file reader follows a real git revision range', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mineradio-upstream-'));
  try {
    git(dir, ['init']);
    git(dir, ['config', 'user.name', 'Mineradio Test']);
    git(dir, ['config', 'user.email', 'test@mineradio.local']);
    git(dir, ['config', 'core.autocrlf', 'false']);
    fs.mkdirSync(path.join(dir, 'public', 'js', 'modules', '05-playback'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'server.js'), 'one\n');
    git(dir, ['add', '.']);
    git(dir, ['commit', '-m', 'base']);
    const oldCommit = git(dir, ['rev-parse', 'HEAD']);
    fs.writeFileSync(path.join(dir, 'server.js'), 'two\n');
    fs.writeFileSync(path.join(dir, 'public', 'js', 'modules', '05-playback', 'new.js'), 'new\n');
    git(dir, ['add', '.']);
    git(dir, ['commit', '-m', 'update']);
    const newCommit = git(dir, ['rev-parse', 'HEAD']);
    assert.deepEqual(report.listChangedFiles(oldCommit, newCommit, dir), [
      { status: 'A', path: 'public/js/modules/05-playback/new.js', previousPath: '' },
      { status: 'M', path: 'server.js', previousPath: '' },
    ]);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
