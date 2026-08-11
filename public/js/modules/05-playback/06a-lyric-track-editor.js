var lyricTrackEditorState = { songKey: '', lines: [], dirty: false, sliderOffset: 0 };

function normalizeLyricEditorLine(line) {
  line = line || {};
  var time = Number(line.t);
  if (!isFinite(time)) return null;
  return {
    t: Math.max(0, Math.round(time * 1000) / 1000),
    original: String(line.original != null ? line.original : (line.text || '')),
    translation: String(line.translation || ''),
    romanization: String(line.romanization || line.romaji || '')
  };
}

function normalizeLyricEditorLines(lines, omitEmpty) {
  return (Array.isArray(lines) ? lines : []).map(normalizeLyricEditorLine).filter(function (line) {
    if (!line) return false;
    return !omitEmpty || !!(line.original.trim() || line.translation.trim() || line.romanization.trim());
  }).sort(function (a, b) { return a.t - b.t; });
}

function shiftLyricEditorLines(lines, offset) {
  offset = Number(offset);
  if (!isFinite(offset)) offset = 0;
  return (Array.isArray(lines) ? lines : []).map(function (line) {
    var normalized = normalizeLyricEditorLine(line);
    if (!normalized) return null;
    normalized.t = Math.max(0, Math.round((normalized.t + offset) * 1000) / 1000);
    return normalized;
  }).filter(Boolean);
}

function lyricEditorLinesFromLyricState(lines) {
  return (Array.isArray(lines) ? lines : []).filter(function (line) {
    return line && !line.fallback;
  }).map(function (line) {
    return normalizeLyricEditorLine({
      t: line.t,
      original: line.text,
      translation: line.translation || '',
      romanization: line.romanization || line.romaji || ''
    });
  }).filter(Boolean);
}

function formatLyricEditorTimestamp(seconds, millisecondPrecision) {
  seconds = Math.max(0, Number(seconds) || 0);
  var digits = millisecondPrecision ? 3 : 2;
  var scale = Math.pow(10, digits);
  var totalUnits = Math.round((seconds + Number.EPSILON) * scale);
  var minuteUnits = 60 * scale;
  var minutes = Math.floor(totalUnits / minuteUnits);
  var rest = (totalUnits % minuteUnits) / scale;
  return String(minutes).padStart(2, '0') + ':' + rest.toFixed(digits).padStart(digits + 3, '0');
}

function lyricEditorMetadata(song) {
  song = song || {};
  return [
    '[ti:' + String(song.name || song.title || '') + ']',
    '[ar:' + String(song.artist || '') + ']',
    '[by:Mineradio 歌词工作台]'
  ];
}

function lyricEditorStandardLrc(lines, song) {
  var output = lyricEditorMetadata(song);
  normalizeLyricEditorLines(lines, true).forEach(function (line) {
    if (!line.original.trim()) return;
    output.push('[' + formatLyricEditorTimestamp(line.t, false) + '] ' + line.original.trim());
  });
  return output.length > 3 ? output.join('\n') : '';
}

function lyricEditorEnhancedLrc(lines, song) {
  var output = lyricEditorMetadata(song);
  normalizeLyricEditorLines(lines, true).forEach(function (line) {
    var stamp = '[' + formatLyricEditorTimestamp(line.t, true) + ']';
    if (line.original.trim()) output.push(stamp + ' ' + line.original.trim());
    if (line.translation.trim()) output.push(stamp + ' [tr]' + line.translation.trim());
    if (line.romanization.trim()) output.push(stamp + ' [roma]' + line.romanization.trim());
  });
  return output.length > 3 ? output.join('\n') : '';
}

function lyricEditorCompatibilityLrc(lines) {
  return normalizeLyricEditorLines(lines, true).map(function (line) {
    var text = line.original.trim() || line.translation.trim() || line.romanization.trim();
    return '[' + formatLyricEditorTimestamp(line.t, false) + '] ' + text;
  }).join('\n');
}

function parseEnhancedLyricEditorText(text) {
  var grouped = {};
  String(text || '').split(/\r?\n/).forEach(function (raw) {
    var match = raw.match(/^\[(\d+):(\d+(?:\.\d+)?)\]\s*(.*)$/);
    if (!match) return;
    var time = Number(match[1]) * 60 + Number(match[2]);
    var key = String(Math.round(time * 1000));
    var row = grouped[key] || (grouped[key] = { t: time, original: '', translation: '', romanization: '' });
    var value = match[3] || '';
    if (/^\[tr\]/i.test(value)) row.translation = value.replace(/^\[tr\]\s*/i, '');
    else if (/^\[(?:roma|romaji)\]/i.test(value)) row.romanization = value.replace(/^\[(?:roma|romaji)\]\s*/i, '');
    else row.original = value;
  });
  return normalizeLyricEditorLines(Object.keys(grouped).map(function (key) { return grouped[key]; }), true);
}

function normalizeStoredCustomLyricMap(raw) {
  raw = raw && typeof raw === 'object' ? raw : {};
  var out = {};
  Object.keys(raw).forEach(function (key) {
    var item = raw[key];
    if (typeof item === 'string') {
      out[key] = { text: item, updatedAt: 0 };
      return;
    }
    if (!item || typeof item.text !== 'string') return;
    out[key] = { text: item.text, updatedAt: item.updatedAt || 0 };
    if (item.editor && Array.isArray(item.editor.lines)) {
      out[key].editor = {
        schema: 1,
        lines: normalizeLyricEditorLines(item.editor.lines, true)
      };
    }
  });
  return out;
}

function readCustomLyricMap() {
  try {
    return normalizeStoredCustomLyricMap(JSON.parse(localStorage.getItem(CUSTOM_LYRIC_STORE_KEY) || '{}'));
  } catch (_error) {
    return {};
  }
}

function lyricEditorLinesFromCurrent(song) {
  var entry = getCustomLyricEntry(song);
  if (entry && entry.editor && Array.isArray(entry.editor.lines) && entry.editor.lines.length) {
    return normalizeLyricEditorLines(entry.editor.lines, false);
  }
  if (entry && entry.text) {
    var enhanced = parseEnhancedLyricEditorText(entry.text);
    if (enhanced.length) return enhanced;
    return lyricEditorLinesFromLyricState(parseCustomLyricText(entry.text));
  }
  var source = originalLyricsState && originalLyricsState.lines && originalLyricsState.lines.length
    ? originalLyricsState.lines
    : lyricsLines;
  return lyricEditorLinesFromLyricState(source);
}

function resolvedLyricsForEditor() {
  var source = originalLyricsState && originalLyricsState.lines && originalLyricsState.lines.length
    ? originalLyricsState.lines
    : lyricsLines;
  return lyricEditorLinesFromLyricState(source);
}

function buildAppliedEditorState(lines) {
  var sorted = normalizeLyricEditorLines(lines, true);
  var primary = finalizeLyricLineDurations(sorted.map(function (line) {
    var primaryText = line.original || line.translation || line.romanization || ' ';
    return {
      t: line.t,
      text: primaryText,
      translation: line.translation || '',
      romanization: line.romanization || '',
      source: 'custom-editor',
      charCount: Math.max(1, String(primaryText).length)
    };
  }));
  var translations = sorted.filter(function (line) {
    return !!line.translation.trim();
  }).map(function (line) {
    return { t: line.t, text: line.translation, source: 'custom-editor-translation' };
  });
  return { lines: primary, translations: translations };
}

function applyCustomLyricState(song, silent, renderOptions) {
  song = song || currentLyricSong();
  var entry = getCustomLyricEntry(song);
  if (!entry || !String(entry.text || '').trim()) {
    if (!silent) openCustomLyricModal();
    updateCustomLyricControls();
    return false;
  }
  if (entry.editor && Array.isArray(entry.editor.lines) && entry.editor.lines.length) {
    var state = buildAppliedEditorState(entry.editor.lines);
    if (!state.lines.length) return false;
    lyricSourceMode = 'custom';
    applyLyricsState(
      state.lines,
      false,
      'custom-editor',
      state.translations,
      state.translations.length ? 'custom-editor' : 'none',
      renderOptions
    );
    return true;
  }
  var lines = parseCustomLyricText(entry.text);
  if (!lines.length) return false;
  lyricSourceMode = 'custom';
  applyLyricsState(lines, false, lines[0] && lines[0].source === 'custom-lrc' ? 'custom-lrc' : 'custom-text', [], 'none', renderOptions);
  return true;
}

function lyricEditorInput(field, value, index) {
  var input = document.createElement('input');
  input.dataset.field = field;
  input.value = field === 't' ? Number(value || 0).toFixed(3) : String(value || '');
  input.type = field === 't' ? 'number' : 'text';
  if (field === 't') input.step = '0.001';
  input.placeholder = field === 'original' ? '原文' : (field === 'translation' ? '翻译' : (field === 'romanization' ? '罗马音' : '秒'));
  input.setAttribute('aria-label', (index + 1) + ' 行' + input.placeholder);
  input.oninput = function () {
    var row = lyricTrackEditorState.lines[index];
    if (!row) return;
    row[field] = field === 't' ? Math.max(0, Number(input.value) || 0) : input.value;
    lyricTrackEditorState.dirty = true;
  };
  return input;
}

function renderLyricTrackEditor() {
  var root = document.getElementById('lyric-editor-rows');
  if (!root) return;
  root.innerHTML = '';
  lyricTrackEditorState.lines.forEach(function (line, index) {
    var row = document.createElement('div');
    row.className = 'lyric-editor-row';
    row.dataset.index = String(index);
    var sync = document.createElement('button');
    sync.type = 'button';
    sync.className = 'lyric-sync-btn';
    sync.textContent = '校时';
    sync.title = '设为当前播放时间';
    sync.onclick = function () { syncLyricEditorLine(index); };
    row.appendChild(sync);
    row.appendChild(lyricEditorInput('t', line.t, index));
    row.appendChild(lyricEditorInput('original', line.original, index));
    row.appendChild(lyricEditorInput('translation', line.translation, index));
    row.appendChild(lyricEditorInput('romanization', line.romanization, index));
    var remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'lyric-delete-btn';
    remove.textContent = '\u00d7';
    remove.title = '删除这一行';
    remove.setAttribute('aria-label', '删除第 ' + (index + 1) + ' 行');
    remove.onclick = function () {
      lyricTrackEditorState.lines.splice(index, 1);
      if (!lyricTrackEditorState.lines.length) lyricTrackEditorState.lines.push({ t: 0, original: '', translation: '', romanization: '' });
      lyricTrackEditorState.dirty = true;
      renderLyricTrackEditor();
    };
    row.appendChild(remove);
    root.appendChild(row);
  });
}

function openCustomLyricModal() {
  var song = currentLyricSong();
  if (!song) {
    showToast('先播放或选择一首歌');
    return;
  }
  if (immersiveMode) setImmersiveMode(false);
  var entry = getCustomLyricEntry(song);
  var title = document.getElementById('custom-lyric-title');
  var sub = document.getElementById('custom-lyric-sub');
  if (title) title.textContent = song.name || song.title || '当前歌曲';
  if (sub) sub.textContent = (song.artist || (song.type === 'podcast' ? 'Podcast' : '未知歌手')) + (entry ? ' · 已保存三轨歌词' : ' · 可从当前歌词开始编辑');
  lyricTrackEditorState = {
    songKey: songCustomLyricKey(song),
    lines: lyricEditorLinesFromCurrent(song),
    dirty: false,
    sliderOffset: 0
  };
  if (!lyricTrackEditorState.lines.length) lyricTrackEditorState.lines.push({ t: 0, original: '', translation: '', romanization: '' });
  renderLyricTrackEditor();
  resetLyricEditorOffsetControls();
  setCustomLyricStatus(entry ? '已读取本地歌词校准' : '播放歌曲后，可逐行点击“校时”完成对齐', entry ? 'good' : '');
  openGsapModal(document.getElementById('custom-lyric-modal'));
  setTimeout(function () {
    var first = document.querySelector('#lyric-editor-rows input[data-field="original"]');
    if (first) first.focus();
  }, 120);
}

function openLyricTrackEditorFromTiming(event) {
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }
  if (typeof closeLyricTimingPopover === 'function') closeLyricTimingPopover(false);
  openCustomLyricModal();
}

function closeCustomLyricModal(force) {
  if (!force && lyricTrackEditorState.dirty && !window.confirm('当前歌词还有未保存的修改，确认关闭吗？')) return;
  lyricTrackEditorState.dirty = false;
  closeGsapModal(document.getElementById('custom-lyric-modal'));
}

function loadCurrentLyricsIntoEditor() {
  var next = resolvedLyricsForEditor();
  if (!next.length) {
    showToast('当前没有可载入的歌词');
    return;
  }
  if (lyricTrackEditorState.dirty && !window.confirm('载入会覆盖尚未保存的编辑内容，继续吗？')) return;
  lyricTrackEditorState.lines = next;
  lyricTrackEditorState.dirty = true;
  renderLyricTrackEditor();
  setCustomLyricStatus('已载入当前歌词，共 ' + next.length + ' 行', 'good');
}

function addLyricEditorLine() {
  var currentTime = audio && isFinite(audio.currentTime) ? Number(audio.currentTime) : 0;
  var last = lyricTrackEditorState.lines[lyricTrackEditorState.lines.length - 1];
  var time = currentTime > 0 ? currentTime : (last ? Number(last.t || 0) + 4 : 0);
  lyricTrackEditorState.lines.push({ t: Math.round(time * 1000) / 1000, original: '', translation: '', romanization: '' });
  lyricTrackEditorState.dirty = true;
  renderLyricTrackEditor();
  var root = document.getElementById('lyric-editor-rows');
  if (root) root.scrollTop = root.scrollHeight;
  var rows = root ? root.querySelectorAll('.lyric-editor-row') : [];
  var input = rows.length ? rows[rows.length - 1].querySelector('input[data-field="original"]') : null;
  if (input) input.focus();
}

function syncLyricEditorLine(index) {
  var time = audio && isFinite(audio.currentTime) ? Number(audio.currentTime) : 0;
  var line = lyricTrackEditorState.lines[index];
  if (!line) return;
  line.t = Math.max(0, Math.round(time * 1000) / 1000);
  lyricTrackEditorState.dirty = true;
  var row = document.querySelector('.lyric-editor-row[data-index="' + index + '"]');
  var input = row && row.querySelector('input[data-field="t"]');
  if (input) input.value = line.t.toFixed(3);
  if (row) {
    row.classList.remove('is-synced');
    void row.offsetWidth;
    row.classList.add('is-synced');
  }
  setCustomLyricStatus('第 ' + (index + 1) + ' 行已对齐到 ' + formatLyricEditorTimestamp(time, true), 'good');
}

function syncLyricEditorTimeInputs() {
  document.querySelectorAll('#lyric-editor-rows .lyric-editor-row').forEach(function (row, index) {
    var input = row.querySelector('input[data-field="t"]');
    var line = lyricTrackEditorState.lines[index];
    if (input && line) input.value = Number(line.t || 0).toFixed(3);
  });
}

function applyLyricEditorOffset() {
  var input = document.getElementById('lyric-editor-offset');
  var offset = Number(input && input.value);
  if (!isFinite(offset) || offset === 0) {
    showToast('请输入非零偏移秒数');
    return;
  }
  lyricTrackEditorState.lines = shiftLyricEditorLines(lyricTrackEditorState.lines, offset);
  lyricTrackEditorState.dirty = true;
  syncLyricEditorTimeInputs();
  if (input) input.value = '0';
  setCustomLyricStatus('整轨已偏移 ' + (offset > 0 ? '+' : '') + offset.toFixed(3) + ' 秒', 'good');
}

function dragLyricEditorTimeline(value) {
  value = Number(value) || 0;
  var delta = value - (Number(lyricTrackEditorState.sliderOffset) || 0);
  if (!delta) return;
  lyricTrackEditorState.lines = shiftLyricEditorLines(lyricTrackEditorState.lines, delta);
  lyricTrackEditorState.sliderOffset = value;
  lyricTrackEditorState.dirty = true;
  syncLyricEditorTimeInputs();
  var output = document.getElementById('lyric-editor-drag-value');
  if (output) output.textContent = (value > 0 ? '+' : '') + value.toFixed(2) + 's';
}

function finishLyricEditorTimelineDrag(input) {
  var applied = Number(lyricTrackEditorState.sliderOffset) || 0;
  lyricTrackEditorState.sliderOffset = 0;
  if (input) input.value = '0';
  var output = document.getElementById('lyric-editor-drag-value');
  if (output) output.textContent = '0.00s';
  if (applied) setCustomLyricStatus('整轨微调完成 ' + (applied > 0 ? '+' : '') + applied.toFixed(2) + ' 秒', 'good');
}

function resetLyricEditorOffsetControls() {
  var exact = document.getElementById('lyric-editor-offset');
  var slider = document.getElementById('lyric-editor-drag');
  var output = document.getElementById('lyric-editor-drag-value');
  if (exact) exact.value = '0';
  if (slider) slider.value = '0';
  if (output) output.textContent = '0.00s';
}

function saveCustomLyricForCurrent() {
  var song = currentLyricSong();
  var key = songCustomLyricKey(song);
  if (!song || !key) {
    setCustomLyricStatus('请先播放或选择一首歌', 'fail');
    return;
  }
  var lines = normalizeLyricEditorLines(lyricTrackEditorState.lines, true);
  if (!lines.length) {
    setCustomLyricStatus('至少需要一行歌词', 'fail');
    return;
  }
  customLyricMap[key] = {
    text: lyricEditorCompatibilityLrc(lines),
    updatedAt: Date.now(),
    editor: { schema: 1, lines: lines }
  };
  customLyricPrefs[key] = 'custom';
  var saved = saveCustomLyricMap();
  saveCustomLyricPrefs();
  lyricTrackEditorState.lines = lines;
  lyricTrackEditorState.dirty = false;
  applyCustomLyricState(song, true);
  updateCustomLyricControls();
  setCustomLyricStatus(saved ? ('已保存 ' + lines.length + ' 行三轨歌词') : '已应用，但本地存储空间不足', saved ? 'good' : 'fail');
  showToast(saved ? '歌词编辑与校准已保存' : '歌词已应用');
  setTimeout(function () { closeCustomLyricModal(true); }, 520);
}

function deleteCustomLyricForCurrent() {
  var song = currentLyricSong();
  var key = songCustomLyricKey(song);
  if (!song || !key) {
    setCustomLyricStatus('请先播放或选择一首歌', 'fail');
    return;
  }
  if (!customLyricMap[key]) {
    setCustomLyricStatus('当前歌曲没有自定义歌词', 'fail');
    return;
  }
  delete customLyricMap[key];
  delete customLyricPrefs[key];
  saveCustomLyricMap();
  saveCustomLyricPrefs();
  applyOriginalLyricsState();
  lyricTrackEditorState.lines = [{ t: 0, original: '', translation: '', romanization: '' }];
  lyricTrackEditorState.dirty = false;
  renderLyricTrackEditor();
  setCustomLyricStatus('已删除，恢复原歌词', 'good');
  showToast('已恢复原歌词');
}

function exportCurrentLyrics(enhanced) {
  var song = currentLyricSong();
  var lines = normalizeLyricEditorLines(lyricTrackEditorState.lines, true);
  if (!song || !lines.length) {
    showToast('没有可导出的歌词');
    return;
  }
  var text = enhanced ? lyricEditorEnhancedLrc(lines, song) : lyricEditorStandardLrc(lines, song);
  if (!text) {
    showToast(enhanced ? '没有可导出的歌词' : '标准 LRC 需要至少一行原文');
    return;
  }
  var api = window.desktopWindow;
  if (!api || typeof api.exportTextFile !== 'function') {
    showToast('当前环境不支持文件导出');
    return;
  }
  var extension = enhanced ? 'elrc' : 'lrc';
  var safeName = String(song.name || song.title || 'Mineradio 歌词').replace(/[\\/:*?"<>|]+/g, '-').slice(0, 70) + '.' + extension;
  api.exportTextFile({
    defaultName: safeName,
    extension: extension,
    filterName: enhanced ? '增强 LRC' : 'LRC 歌词',
    title: enhanced ? '导出增强 LRC' : '导出 LRC',
    text: text
  }).then(function (result) {
    if (result && result.ok) showToast(enhanced ? '增强 LRC 已导出' : 'LRC 已导出');
    else if (!(result && result.canceled)) showToast('歌词导出失败');
  }).catch(function () { showToast('歌词导出失败'); });
}

function installLyricTrackEditorBindings() {
  var modal = document.getElementById('custom-lyric-modal');
  if (!modal || modal.dataset.lyricEditorBound === '1') return;
  modal.dataset.lyricEditorBound = '1';
  modal.addEventListener('keydown', function (event) {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault();
      saveCustomLyricForCurrent();
    }
  });
}

if (typeof document !== 'undefined') setTimeout(installLyricTrackEditorBindings, 0);

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    normalizeLyricEditorLine: normalizeLyricEditorLine,
    normalizeLyricEditorLines: normalizeLyricEditorLines,
    shiftLyricEditorLines: shiftLyricEditorLines,
    lyricEditorLinesFromLyricState: lyricEditorLinesFromLyricState,
    formatLyricEditorTimestamp: formatLyricEditorTimestamp,
    lyricEditorStandardLrc: lyricEditorStandardLrc,
    lyricEditorEnhancedLrc: lyricEditorEnhancedLrc,
    lyricEditorCompatibilityLrc: lyricEditorCompatibilityLrc,
    parseEnhancedLyricEditorText: parseEnhancedLyricEditorText,
    normalizeStoredCustomLyricMap: normalizeStoredCustomLyricMap
  };
}
