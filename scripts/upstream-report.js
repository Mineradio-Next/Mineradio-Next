'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');

const appRoot = path.resolve(__dirname, '..');
const lockPath = path.join(appRoot, 'upstream-lock.json');

function git(args, cwd = appRoot) {
  return cp.execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8' }).trim();
}

function normalizePath(value) {
  return String(value || '').replace(/\\/g, '/').replace(/^\.\//, '');
}

function classifyPath(file) {
  const value = normalizePath(file).toLowerCase();
  if (/^(public\/js\/modules\/05-playback|public\/js\/modules\/03-beat|public\/js\/modules\/06-lyrics|server\.js|.*-api\.js)/.test(value)) return 'playback/provider';
  if (/^(desktop\/|public\/js\/modules\/10-shell|public\/wallpaper|build\/)/.test(value)) return 'desktop/runtime';
  if (/^(public\/|cuefield\/)/.test(value)) return 'ui/assets';
  if (/(package\.json|package-lock\.json|pnpm-lock|yarn\.lock|electron-builder|\.npmrc)/.test(value)) return 'build/dependency';
  if (/^(docs\/|readme|notice|license)/.test(value)) return 'documentation';
  return 'other';
}

function classifyOverlap(file) {
  const category = classifyPath(file);
  if (category === 'playback/provider' || category === 'desktop/runtime' || category === 'build/dependency') return 'manual migration required';
  if (category === 'ui/assets') return 'inspect';
  return 'inspect';
}

function readLock(file = lockPath) {
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!raw || raw.schemaVersion !== 1 || !raw.original || !raw.lx) throw new Error('UPSTREAM_LOCK_INVALID');
  for (const key of ['original', 'lx']) {
    if (!/^[0-9a-f]{40}$/i.test(String(raw[key].commit || ''))) throw new Error(`UPSTREAM_LOCK_${key.toUpperCase()}_COMMIT_INVALID`);
    if (raw[key].branch !== 'main') throw new Error(`UPSTREAM_LOCK_${key.toUpperCase()}_BRANCH_INVALID`);
  }
  return raw;
}

function commitExists(commit) {
  try { git(['cat-file', '-e', `${commit}^{commit}`]); return true; } catch (_) { return false; }
}

function currentCommit(ref) {
  try { return git(['rev-parse', ref]); } catch (_) { return ''; }
}

function listChangedFiles(oldCommit, newCommit, repository = appRoot) {
  if (!oldCommit || !newCommit || oldCommit === newCommit) return [];
  const raw = git(['diff', '--name-status', '--find-renames', `${oldCommit}..${newCommit}`], repository);
  return raw ? raw.split(/\r?\n/).filter(Boolean).map(line => {
    const parts = line.split('\t');
    return { status: parts[0], path: normalizePath(parts[parts.length - 1]), previousPath: parts.length > 2 ? normalizePath(parts[1]) : '' };
  }) : [];
}

function listCommits(oldCommit, newCommit) {
  if (!oldCommit || !newCommit || oldCommit === newCommit) return [];
  const raw = git(['log', '--format=%H%x09%s', `${oldCommit}..${newCommit}`]);
  return raw ? raw.split(/\r?\n/).filter(Boolean).map(line => {
    const tab = line.indexOf('\t');
    return { commit: tab < 0 ? line : line.slice(0, tab), subject: tab < 0 ? '' : line.slice(tab + 1) };
  }) : [];
}

function makeSourceReport(name, config, projectFiles) {
  const ref = name === 'original' ? 'refs/remotes/upstream-original/main' : 'refs/remotes/upstream-lx/main';
  const oldCommit = String(config.commit || '');
  const newCommit = currentCommit(ref);
  const exists = !!newCommit && commitExists(newCommit) && commitExists(oldCommit);
  if (!exists) {
    return { name, repository: config.repository, oldCommit, newCommit, state: newCommit ? 'unavailable-history' : 'unavailable-ref', commits: [], changed: [], overlap: [], action: 'inspect' };
  }
  const changed = listChangedFiles(oldCommit, newCommit);
  const projectSet = new Set(projectFiles);
  const overlap = changed.filter(item => projectSet.has(item.path)).map(item => ({ ...item, category: classifyPath(item.path), action: classifyOverlap(item.path) }));
  let state = oldCommit === newCommit ? 'unchanged' : 'updated';
  try { if (state === 'updated' && git(['merge-base', '--is-ancestor', oldCommit, newCommit], appRoot) === '') state = 'fast-forward'; } catch (_) { state = 'rewritten'; }
  const action = overlap.some(item => item.action === 'manual migration required') ? 'manual migration required' : changed.length ? 'inspect' : 'no action';
  return { name, repository: config.repository, oldCommit, newCommit, state, commits: listCommits(oldCommit, newCommit), changed, overlap, action };
}

function buildReport(options = {}) {
  const lock = readLock(options.lockPath || lockPath);
  const projectFiles = git(['ls-files']).split(/\r?\n/).filter(Boolean).map(normalizePath);
  const sources = ['original', 'lx'].map(name => makeSourceReport(name, lock[name], projectFiles));
  return { generatedAt: new Date().toISOString(), project: 'Mineradio-Next', lockedAt: lock.updatedAt, sources };
}

function markdown(report) {
  const lines = [`# Upstream Maintenance Report`, '', `Generated: ${report.generatedAt}`, `Locked baseline: ${report.lockedAt}`, ''];
  for (const source of report.sources) {
    lines.push(`## ${source.name === 'original' ? 'Original' : 'LX'}`, '', `- Repository: ${source.repository}`, `- State: **${source.state}**`, `- Locked commit: \`${source.oldCommit}\``, `- Fetched commit: \`${source.newCommit || 'unavailable'}\``, `- Recommendation: **${source.action}**`, '');
    lines.push(`Commits: ${source.commits.length}`, '');
    source.commits.slice(0, 40).forEach(item => lines.push(`- \`${item.commit.slice(0, 10)}\` ${item.subject}`));
    if (source.commits.length > 40) lines.push(`- ... ${source.commits.length - 40} more`);
    lines.push('', `Changed paths: ${source.changed.length}`, '');
    source.overlap.forEach(item => lines.push(`- **${item.action}** \`${item.path}\` (${item.category}, ${item.status})`));
    if (!source.overlap.length) lines.push('- No changed path overlaps the current tracked project files.');
    lines.push('');
  }
  lines.push('> This report is advisory. It does not merge, cherry-pick, rebase, checkout, or advance `upstream-lock.json`.');
  return lines.join('\n') + '\n';
}

function writeReport(report, outputPath) {
  const target = path.resolve(appRoot, outputPath || path.join('reports', 'upstream', 'latest.md'));
  if (!target.startsWith(appRoot + path.sep)) throw new Error('UPSTREAM_REPORT_PATH_OUTSIDE_PROJECT');
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, markdown(report), 'utf8');
  return target;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const json = args.includes('--json');
  const outputIndex = args.indexOf('--output');
  const output = outputIndex >= 0 ? args[outputIndex + 1] : undefined;
  const report = buildReport();
  const target = writeReport(report, output);
  process.stdout.write(json ? JSON.stringify({ ...report, output: target }, null, 2) + os.EOL : `Wrote ${path.relative(appRoot, target)}${os.EOL}`);
}

module.exports = { normalizePath, classifyPath, classifyOverlap, readLock, listChangedFiles, buildReport, markdown, writeReport };
