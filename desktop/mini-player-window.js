'use strict';

const MINI_PLAYER_WIDTH = 440;
const MINI_PLAYER_HEIGHT = 180;
const MINI_PLAYER_MIN_WIDTH = 360;
const MINI_PLAYER_MIN_HEIGHT = 150;

function finiteNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizeArea(area) {
  const source = area && typeof area === 'object' ? area : {};
  return {
    x: Math.round(finiteNumber(source.x, 0)),
    y: Math.round(finiteNumber(source.y, 0)),
    width: Math.max(1, Math.round(finiteNumber(source.width, MINI_PLAYER_WIDTH))),
    height: Math.max(1, Math.round(finiteNumber(source.height, MINI_PLAYER_HEIGHT))),
  };
}

function clampMiniPlayerBounds(currentBounds, area) {
  const workArea = normalizeArea(area);
  const current = currentBounds && typeof currentBounds === 'object' ? currentBounds : {};
  const width = Math.min(MINI_PLAYER_WIDTH, workArea.width);
  const height = Math.min(MINI_PLAYER_HEIGHT, workArea.height);
  const currentX = finiteNumber(current.x, workArea.x);
  const currentY = finiteNumber(current.y, workArea.y);
  const currentWidth = Math.max(width, finiteNumber(current.width, width));
  const preferredX = Math.round(currentX + currentWidth - width);
  const maxX = workArea.x + workArea.width - width;
  const maxY = workArea.y + workArea.height - height;
  return {
    x: Math.max(workArea.x, Math.min(preferredX, maxX)),
    y: Math.max(workArea.y, Math.min(Math.round(currentY), maxY)),
    width,
    height,
  };
}

function createMiniPlayerWindowState() {
  return {
    active: false,
    alwaysOnTop: false,
    entering: false,
    restoreBounds: null,
    restoreMaximized: false,
  };
}

function enterMiniPlayerWindow(win, state, workArea) {
  if (!win || typeof win.isDestroyed !== 'function' || win.isDestroyed()) return false;
  if (!state || state.active) return !!(state && state.active);
  const currentBounds = win.getBounds();
  state.restoreBounds = typeof win.getNormalBounds === 'function' ? win.getNormalBounds() : currentBounds;
  state.restoreMaximized = typeof win.isMaximized === 'function' && win.isMaximized();
  try {
    if (state.restoreMaximized && typeof win.unmaximize === 'function') win.unmaximize();
    // Mark active before resize events run so the normal minimum does not win the race.
    state.active = true;
    win.setMinimumSize(Math.min(MINI_PLAYER_MIN_WIDTH, workArea.width), Math.min(MINI_PLAYER_MIN_HEIGHT, workArea.height));
    win.setBounds(clampMiniPlayerBounds(currentBounds, workArea), true);
    win.setAlwaysOnTop(false);
    state.alwaysOnTop = false;
    return true;
  } catch (_) {
    state.active = false;
    state.alwaysOnTop = false;
    try { win.setAlwaysOnTop(false); } catch (_) {}
    try { win.setBounds(state.restoreBounds || currentBounds, false); } catch (_) {}
    try { if (state.restoreMaximized && typeof win.maximize === 'function') win.maximize(); } catch (_) {}
    state.restoreBounds = null;
    state.restoreMaximized = false;
    return false;
  }
}

function exitMiniPlayerWindow(win, state, minimum, clampRestoreBounds) {
  if (!win || typeof win.isDestroyed !== 'function' || win.isDestroyed() || !state) return false;
  try { win.setAlwaysOnTop(false); } catch (_) {}
  state.alwaysOnTop = false;
  const restoreBounds = state.restoreBounds;
  const restoreMaximized = state.restoreMaximized;
  state.active = false;
  state.entering = false;
  state.restoreBounds = null;
  state.restoreMaximized = false;
  if (minimum) win.setMinimumSize(minimum.width, minimum.height);
  if (restoreBounds) {
    const next = typeof clampRestoreBounds === 'function' ? clampRestoreBounds(restoreBounds) : restoreBounds;
    win.setBounds(next, true);
  }
  if (restoreMaximized && typeof win.maximize === 'function') win.maximize();
  return true;
}

module.exports = {
  MINI_PLAYER_WIDTH,
  MINI_PLAYER_HEIGHT,
  MINI_PLAYER_MIN_WIDTH,
  MINI_PLAYER_MIN_HEIGHT,
  clampMiniPlayerBounds,
  createMiniPlayerWindowState,
  enterMiniPlayerWindow,
  exitMiniPlayerWindow,
};
