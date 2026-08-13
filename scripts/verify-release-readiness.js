'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const dist = path.join(root, 'dist');
const packageInfo = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const version = String(packageInfo.version || '').trim();
const requireArtifacts = process.argv.includes('--artifacts');

function fail(message) {
  throw new Error(`Release readiness: ${message}`);
}

function read(relativePath) {
  const target = path.join(root, relativePath);
  if (!fs.existsSync(target)) fail(`missing ${relativePath}`);
  return fs.readFileSync(target, 'utf8');
}

function block(source, name) {
  const pattern = new RegExp(
    `<!--\\s*mineradio-update-${name}:start\\s*-->([\\s\\S]*?)<!--\\s*mineradio-update-${name}:end\\s*-->`,
    'i',
  );
  const match = source.match(pattern);
  if (!match) fail(`release notes are missing the ${name} block`);
  return match[1].trim();
}

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

if (!/^\d+\.\d+\.\d+$/.test(version)) fail(`invalid stable version ${version || '<empty>'}`);
if (packageInfo.productName !== 'Mineradio Next') fail('productName must be Mineradio Next');
if (packageInfo.build?.publish?.[0]?.owner !== 'Mineradio-Next'
  || packageInfo.build?.publish?.[0]?.repo !== 'Mineradio-Next') {
  fail('GitHub publish target must be Mineradio-Next/Mineradio-Next');
}
if (packageInfo.build?.win?.signExecutable !== false) fail('unsigned release must set win.signExecutable=false');
if (packageInfo.build?.win?.signAndEditExecutable === false) fail('resource editing must stay enabled for icon and version metadata');

const notesPath = `docs/RELEASE_NOTES_v${version}.md`;
const notes = read(notesPath);
if (!notes.startsWith(`# Mineradio Next v${version}`)) fail(`${notesPath} title does not match package version`);
const summary = block(notes, 'summary').replace(/\s+/g, ' ').trim();
if (!summary || summary.length > 72) fail('in-app release summary must contain 1-72 characters');
const highlights = block(notes, 'highlights')
  .split(/\r?\n/)
  .map(line => line.trim())
  .filter(line => /^-\s+/.test(line));
if (highlights.length < 1 || highlights.length > 3) fail('in-app release highlights must contain 1-3 bullet points');
if (notes.includes('X.Y.Z') || notes.includes('示例文字')) fail('release notes still contain template text');

if (requireArtifacts) {
  const installerName = `Mineradio-Next-${version}-Setup.exe`;
  const artifactNames = [installerName, `${installerName}.blockmap`, 'latest.yml'];
  for (const name of artifactNames) {
    const target = path.join(dist, name);
    if (!fs.existsSync(target) || !fs.statSync(target).isFile() || fs.statSync(target).size === 0) {
      fail(`missing or empty dist/${name}`);
    }
  }

  const latest = fs.readFileSync(path.join(dist, 'latest.yml'), 'utf8');
  if (!new RegExp(`^version:\\s*${version.replace(/\./g, '\\.')}$`, 'm').test(latest)) fail('latest.yml version mismatch');
  if (!latest.includes(`path: ${installerName}`)) fail('latest.yml installer path mismatch');
  const declaredSize = Number((latest.match(new RegExp(`url:\\s*${installerName}[\\s\\S]*?size:\\s*(\\d+)`)) || [])[1]);
  const actualSize = fs.statSync(path.join(dist, installerName)).size;
  if (declaredSize !== actualSize) fail(`latest.yml size mismatch (${declaredSize || 'missing'} != ${actualSize})`);

  const checksums = read('dist/SHA256SUMS.txt');
  for (const name of artifactNames) {
    const expected = sha256(path.join(dist, name));
    const line = `${expected}  ${name}`;
    if (!checksums.split(/\r?\n/).includes(line)) fail(`SHA256SUMS.txt mismatch for ${name}`);
  }
}

process.stdout.write(`Release readiness OK: Mineradio Next ${version}${requireArtifacts ? ' with artifacts' : ''}\n`);
