'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const dist = path.join(root, 'dist');
const packageInfo = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const version = String(packageInfo.version || '').trim();

if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
  throw new Error(`Invalid release version: ${version || '<empty>'}`);
}

const names = [
  `Mineradio-Next-${version}-Setup.exe`,
  `Mineradio-Next-${version}-Setup.exe.blockmap`,
  'latest.yml',
];

const lines = names.map(name => {
  const file = path.join(dist, name);
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
    throw new Error(`Missing release artifact: dist/${name}`);
  }
  const hash = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  return `${hash}  ${name}`;
});

const target = path.join(dist, 'SHA256SUMS.txt');
fs.writeFileSync(target, `${lines.join('\n')}\n`, 'ascii');
process.stdout.write(`Wrote ${path.relative(root, target)} for Mineradio Next ${version}\n`);
