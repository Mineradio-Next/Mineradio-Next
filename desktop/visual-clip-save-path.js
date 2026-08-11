'use strict';

const path = require('path');

function resolveVisualClipSaveSelection(value) {
  const candidate = String(value || '').trim();
  if (!candidate) return { accepted: false, nextDefaultPath: '' };
  const extension = path.extname(candidate);
  if (extension.toLowerCase() === '.webm') {
    return { accepted: true, filePath: candidate, nextDefaultPath: candidate };
  }
  const base = extension ? candidate.slice(0, -extension.length) : candidate;
  return { accepted: false, nextDefaultPath: `${base}.webm` };
}

module.exports = { resolveVisualClipSaveSelection };
