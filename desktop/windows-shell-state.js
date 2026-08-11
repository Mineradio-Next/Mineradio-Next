'use strict';

const path = require('path');

function normalizeTrayPlaybackText(value, maxLength) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function normalizeTrayPlaybackState(value) {
  value = value && typeof value === 'object' ? value : {};
  const hasMedia = value.hasMedia === true;
  return {
    hasMedia,
    title: normalizeTrayPlaybackText(value.title, 120),
    artist: normalizeTrayPlaybackText(value.artist, 120),
    playing: hasMedia && value.playing === true,
    volume: Math.max(0, Math.min(100, Math.round(Number(value.volume) || 0))),
  };
}

function normalizeWindowsPath(value) {
  value = String(value || '').trim().replace(/^"|"$/g, '');
  return value ? path.win32.normalize(value).toLowerCase() : '';
}

function normalizeWindowsArgument(value) {
  value = String(value || '').trim().replace(/^"|"$/g, '');
  return /^[a-z]:[\\/]|^\\\\/i.test(value) ? normalizeWindowsPath(value) : value;
}

function launchItemMatches(item, expected) {
  if (!item || !expected || normalizeWindowsPath(item.path) !== normalizeWindowsPath(expected.path)) return false;
  const actualArgs = Array.isArray(item.args) ? item.args.map(normalizeWindowsArgument) : [];
  const expectedArgs = Array.isArray(expected.args) ? expected.args.map(normalizeWindowsArgument) : [];
  return actualArgs.length === expectedArgs.length && actualArgs.every((value, index) => value === expectedArgs[index]);
}

function normalizeWindowsStartupStatus(settings, expected) {
  settings = settings && typeof settings === 'object' ? settings : {};
  const registered = settings.openAtLogin === true;
  const launchItems = Array.isArray(settings.launchItems) ? settings.launchItems : [];
  const matchingItem = launchItems.find((item) => launchItemMatches(item, expected));
  const enabled = registered && !!(matchingItem && matchingItem.enabled === true);
  return {
    ok: true,
    supported: true,
    enabled,
    registered,
    systemDisabled: registered && !enabled,
  };
}

module.exports = { launchItemMatches, normalizeTrayPlaybackState, normalizeWindowsStartupStatus };
