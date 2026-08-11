'use strict';

const DEFAULT_X_RATIO = 0.5;
const DEFAULT_Y_RATIO = 0.76;

function finiteNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, min, max, fallback = min) {
  return Math.max(min, Math.min(max, finiteNumber(value, fallback)));
}

function normalizeDisplayBounds(bounds) {
  const source = bounds || {};
  return {
    x: Math.round(finiteNumber(source.x, 0)),
    y: Math.round(finiteNumber(source.y, 0)),
    width: Math.max(1, Math.round(finiteNumber(source.width, 1))),
    height: Math.max(1, Math.round(finiteNumber(source.height, 1))),
  };
}

function desktopLyricsDisplayAnchor(display) {
  if (!display || typeof display !== 'object') return '';
  const bounds = normalizeDisplayBounds(display.bounds);
  const id = String(display.id == null ? '' : display.id).replace(/[^\w-]/g, '').slice(0, 40);
  return [id, bounds.x, bounds.y, bounds.width, bounds.height].join('|');
}

function parseDesktopLyricsDisplayAnchor(value) {
  const parts = String(value || '').split('|');
  if (parts.length !== 5 || !parts[0]) return null;
  const numbers = parts.slice(1).map(Number);
  if (!numbers.every(Number.isFinite)) return null;
  return {
    id: parts[0],
    bounds: normalizeDisplayBounds({
      x: numbers[0],
      y: numbers[1],
      width: numbers[2],
      height: numbers[3],
    }),
  };
}

function reconcileDesktopLyricsPositionPayload(payload, currentRevision) {
  const next = { ...(payload || {}) };
  const revisionFloor = Math.max(0, Math.round(finiteNumber(currentRevision, 0)));
  const hasPosition = Object.prototype.hasOwnProperty.call(next, 'x')
    || Object.prototype.hasOwnProperty.call(next, 'y')
    || Object.prototype.hasOwnProperty.call(next, 'display');
  if (!hasPosition) return { payload: next, revision: revisionFloor, stale: false };
  const revision = Math.max(0, Math.round(finiteNumber(next.positionRevision, 0)));
  if (revision < revisionFloor) {
    delete next.x;
    delete next.y;
    delete next.display;
    delete next.positionRevision;
    return { payload: next, revision: revisionFloor, stale: true };
  }
  next.positionRevision = revision;
  return { payload: next, revision, stale: false };
}

function constrainDesktopLyricsBounds(bounds, displayBounds) {
  const area = normalizeDisplayBounds(displayBounds);
  const source = bounds || {};
  const width = Math.min(area.width, Math.max(1, Math.round(finiteNumber(source.width, area.width))));
  const height = Math.min(area.height, Math.max(1, Math.round(finiteNumber(source.height, area.height))));
  const maxX = area.x + area.width - width;
  const maxY = area.y + area.height - height;
  return {
    x: Math.round(clamp(source.x, area.x, maxX, area.x)),
    y: Math.round(clamp(source.y, area.y, maxY, area.y)),
    width,
    height,
  };
}

function desktopLyricsDefaultBounds(displayBounds, payload = {}) {
  const area = normalizeDisplayBounds(displayBounds);
  const xRatio = clamp(payload.x, 0.02, 0.98, DEFAULT_X_RATIO);
  const yRatio = clamp(payload.y, 0.08, 0.92, DEFAULT_Y_RATIO);
  const preferredWidth = Math.min(Math.max(880, area.width * 0.72), area.width - 96);
  const preferredHeight = Math.min(Math.max(340, area.height * 0.38), 560, area.height - 96);
  const width = Math.min(area.width, Math.max(1, Math.round(preferredWidth)));
  const height = Math.min(area.height, Math.max(1, Math.round(preferredHeight)));
  return constrainDesktopLyricsBounds({
    x: area.x + (area.width - width) * xRatio,
    y: area.y + area.height * yRatio - height / 2,
    width,
    height,
  }, area);
}

function desktopLyricsRatiosFromBounds(bounds, displayBounds) {
  const area = normalizeDisplayBounds(displayBounds);
  const constrained = constrainDesktopLyricsBounds(bounds, area);
  const horizontalTravel = area.width - constrained.width;
  return {
    x: horizontalTravel > 0
      ? clamp((constrained.x - area.x) / horizontalTravel, 0.02, 0.98, DEFAULT_X_RATIO)
      : DEFAULT_X_RATIO,
    y: clamp(
      (constrained.y + constrained.height / 2 - area.y) / area.height,
      0.08,
      0.92,
      DEFAULT_Y_RATIO
    ),
  };
}

module.exports = {
  constrainDesktopLyricsBounds,
  desktopLyricsDisplayAnchor,
  desktopLyricsDefaultBounds,
  desktopLyricsRatiosFromBounds,
  parseDesktopLyricsDisplayAnchor,
  reconcileDesktopLyricsPositionPayload,
};
