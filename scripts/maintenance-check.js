'use strict';

const cp = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const npmCli = [
  process.env.npm_execpath,
  path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js'),
].find((candidate) => candidate && fs.existsSync(candidate));

if (!npmCli) {
  console.error('MAINTENANCE_NPM_CLI_NOT_FOUND');
  process.exit(1);
}

function run(command, args) {
  const result = cp.spawnSync(command, args, { cwd: root, stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status || 1);
}

run(process.execPath, ['--test']);
run(process.execPath, [npmCli, 'audit', '--audit-level=high']);
run(process.execPath, ['scripts/upstream-report.js']);
run(process.execPath, ['scripts/quick-check.js', '--full']);
