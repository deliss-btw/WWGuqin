(() => {
  'use strict';

  const NOTES = [
    ['c4','d4','e4','f4','g4','a4','b4'],
    ['c3','d3','e3','f3','g3','a3','b3'],
    ['c2','d2','e2','f2','g2','a2','b2']
  ];

  const KEY_CODES = [
    ['KeyQ','KeyW','KeyE','KeyR','KeyT','KeyY','KeyU'],
    ['KeyA','KeyS','KeyD','KeyF','KeyG','KeyH','KeyJ'],
    ['KeyZ','KeyX','KeyC','KeyV','KeyB','KeyN','KeyM']
  ];
  const HOTKEY_LABELS = [
    ['Q','W','E','R','T','Y','U'],
    ['A','S','D','F','G','H','J'],
    ['Z','X','C','V','B','N','M']
  ];

  const QTE_CONFIG_PATH = 'data/MusicalInstrumentQteConfig.json';
  const CUSTOM_STORAGE_KEY = 'guqin.customQtes.v1';
  const SHARE_PREFIX = 'GQ1:';

  const $ = (sel) => document.querySelector(sel);
  const board = $('#board');
  const audioStatus = $('#audioStatus');
  const currentNote = $('#currentNote');
  const currentSub = $('#currentSub');
  const fundamentalBtn = $('#fundamentalBtn');
  const harmonicBtn = $('#harmonicBtn');
  const volume = $('#volume');
  const qtePanel = $('#qtePanel');
  const customPanel = $('#customPanel');
  const qteDots = $('#qteDots');
  const qteTitle = $('#qteTitle');
  const qteSelect = $('#qteSelect');
  const qteConfigStatus = $('#qteConfigStatus');
  const modeDescription = $('#modeDescription');

  const customName = $('#customName');
  const recordBtn = $('#recordBtn');
  const undoCustom = $('#undoCustom');
  const clearCustom = $('#clearCustom');
  const saveCustom = $('#saveCustom');
  const recordStatus = $('#recordStatus');
  const customSequence = $('#customSequence');
  const shareCode = $('#shareCode');
  const generateCode = $('#generateCode');
  const importCode = $('#importCode');
  const customJsonFile = $('#customJsonFile');
  const customMessage = $('#customMessage');

  let audioMode = 'note';
  let appMode = 'free';
  let qteIndex = 0;
  let gameQtes = [];
  let customQtes = loadCustomQtes();
  let activeQte = null;
  let activeSequence = [];
  let recording = false;
  let recordingSequence = [];

  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  const audioContext = AudioContextClass ? new AudioContextClass() : null;
  const gainNode = audioContext ? audioContext.createGain() : null;
  const buffers = new Map();
  const unavailable = new Set();

  if (gainNode) {
    gainNode.gain.value = Number(volume.value);
    gainNode.connect(audioContext.destination);
  }

  function label(note) {
    return note[0].toUpperCase() + note.slice(1);
  }

  function audioPath(mode, note) {
    return `audio/${mode}/${note}.ogg`;
  }

  function allAudioPaths() {
    const paths = [];
    for (const row of NOTES) {
      for (const note of row) {
        paths.push(audioPath('note', note));
        paths.push(audioPath('harmonic', note));
      }
    }
    return paths;
  }

  function buildBoard() {
    NOTES.forEach((rowNotes, row) => {
      const rowEl = document.createElement('div');
      rowEl.className = 'board-row';
      rowNotes.forEach((note, col) => {
        const el = document.createElement('button');
        el.className = 'note-key';
        el.dataset.row = String(row);
        el.dataset.col = String(col);
        el.dataset.note = note;
        el.innerHTML = `<div class="note-label"><div class="note-name">${label(note)}</div><div class="note-hotkey">${HOTKEY_LABELS[row][col]}</div></div>`;
        el.addEventListener('pointerdown', (ev) => {
          ev.preventDefault();
          trigger(row, col, el);
        });
        rowEl.appendChild(el);
      });
      board.appendChild(rowEl);
    });
  }

  async function ensureAudioRunning() {
    if (!audioContext) return false;
    if (audioContext.state === 'suspended') {
      try { await audioContext.resume(); } catch (_) { return false; }
    }
    return true;
  }

  async function fetchAndDecode(path) {
    if (!audioContext) return null;
    if (buffers.has(path)) return buffers.get(path);
    if (unavailable.has(path)) return null;
    try {
      const res = await fetch(path, { cache: 'force-cache' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.arrayBuffer();
      const buffer = await audioContext.decodeAudioData(data);
      buffers.set(path, buffer);
      return buffer;
    } catch (err) {
      unavailable.add(path);
      console.warn(`Failed to preload ${path}:`, err);
      return null;
    }
  }

  async function preloadAllAudio() {
    if (!audioContext) {
      audioStatus.textContent = 'Audio: Web Audio unsupported';
      audioStatus.className = 'audio-status warn';
      return;
    }
    const paths = allAudioPaths();
    let completed = 0;
    let loaded = 0;
    audioStatus.textContent = `Audio: loading 0/${paths.length}`;
    await Promise.all(paths.map(async (path) => {
      if (await fetchAndDecode(path)) loaded++;
      completed++;
      audioStatus.textContent = `Audio files: loading ${completed}/${paths.length}`;
    }));
    audioStatus.textContent = loaded === paths.length
      ? `Audio: ready (${loaded}/${paths.length})`
      : loaded > 0 ? `Audio: ${loaded}/${paths.length} loaded` : 'Audio: files missing';
    audioStatus.className = loaded === paths.length ? 'audio-status ok' : 'audio-status warn';
  }

  async function play(note) {
    if (!await ensureAudioRunning()) return;
    const path = audioPath(audioMode, note);
    const buffer = buffers.get(path) || await fetchAndDecode(path);
    if (!buffer) return;
    const src = audioContext.createBufferSource();
    src.buffer = buffer;
    src.connect(gainNode);
    src.start();
  }

  function pulse(el, cls = 'pressed', ms = 150) {
    if (!el) return;
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
    setTimeout(() => el.classList.remove(cls), ms);
  }

  function getKey(row, col) {
    return board.querySelector(`[data-row="${row}"][data-col="${col}"]`);
  }

  function trigger(row, col, el = getKey(row, col)) {
    const note = NOTES[row]?.[col];
    if (!note) return;
    pulse(el);
    currentNote.textContent = label(note);
    currentSub.textContent = `${audioMode === 'note' ? 'Note' : 'Harmonic'} · row ${row}, column ${col}`;
    void play(note);

    if (appMode === 'qte') checkQte(row, col, el);
    if (appMode === 'custom' && recording) {
      recordingSequence.push([row, col]);
      renderRecording();
    }
  }

  function setAudioMode(mode) {
    audioMode = mode;
    fundamentalBtn.classList.toggle('active', mode === 'note');
    harmonicBtn.classList.toggle('active', mode === 'harmonic');
    currentSub.textContent = mode === 'note' ? 'Note tone selected' : 'Harmonic / overtone selected';
  }

  function parseSequence(rawSequence) {
    let parsed = rawSequence;
    if (typeof parsed === 'string') parsed = JSON.parse(parsed);
    if (!Array.isArray(parsed)) throw new Error('QteSequence is not an array');
    return parsed.map((item, index) => {
      if (!Array.isArray(item) || item.length < 2) throw new Error(`Invalid Track item at index ${index}`);
      const row = Number(item[0]);
      const col = Number(item[1]);
      if (!Number.isInteger(row) || !Number.isInteger(col) || !NOTES[row]?.[col]) {
        throw new Error(`Track item [${item}] is outside the 3x7 board`);
      }
      return [row, col];
    });
  }

  function sequenceText(sequence) {
    return sequence.length ? sequence.map(([row, col]) => label(NOTES[row][col])).join(' → ') : 'Empty sequence';
  }

  function loadCustomQtes() {
    try {
      const raw = localStorage.getItem(CUSTOM_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.map(normalizeCustomQte).filter(Boolean) : [];
    } catch (_) {
      return [];
    }
  }

  function saveCustomQtesToStorage() {
    localStorage.setItem(CUSTOM_STORAGE_KEY, JSON.stringify(customQtes));
  }

  function normalizeCustomQte(item) {
    try {
      const sequence = parseSequence(item.sequence ?? item.QteSequence);
      const id = String(item.id ?? item.Id ?? `custom-${Date.now()}-${Math.random().toString(36).slice(2,7)}`);
      const name = String(item.name ?? item.Description ?? 'Custom QTE').slice(0, 80);
      return { id, name, sequence, source: 'custom' };
    } catch (_) {
      return null;
    }
  }

  async function loadQteConfig() {
    try {
      const res = await fetch(QTE_CONFIG_PATH, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (!Array.isArray(data)) throw new Error('Root JSON value must be an array');
      gameQtes = data.map(item => ({
        id: String(item.Id),
        name: item.Description ? `${item.Id} — ${item.Description}` : `Track ${item.Id}`,
        sequence: parseSequence(item.QteSequence),
        source: 'game',
        raw: item
      }));
      qteConfigStatus.textContent = `Game Tracks: ${gameQtes.length} · Custom: ${customQtes.length}`;
      refreshQteSelect();
    } catch (err) {
      console.error('Failed to load track config:', err);
      gameQtes = [];
      qteConfigStatus.textContent = `Failed to load ${QTE_CONFIG_PATH} · Custom: ${customQtes.length}`;
      refreshQteSelect();
    }
  }

  function allQtes() {
    return [...gameQtes, ...customQtes];
  }

  function refreshQteSelect(preferredId = null) {
    const items = allQtes();
    qteSelect.innerHTML = '';
    if (!items.length) {
      qteSelect.innerHTML = '<option>No tracks available</option>';
      qteSelect.disabled = true;
      activeQte = null;
      activeSequence = [];
      qteTitle.textContent = 'No Track';
      renderQte();
      return;
    }

    if (gameQtes.length) {
      const group = document.createElement('optgroup');
      group.label = 'Game';
      for (const item of gameQtes) group.appendChild(makeQteOption(item));
      qteSelect.appendChild(group);
    }
    if (customQtes.length) {
      const group = document.createElement('optgroup');
      group.label = 'Custom';
      for (const item of customQtes) group.appendChild(makeQteOption(item));
      qteSelect.appendChild(group);
    }

    qteSelect.disabled = false;
    const target = items.find(i => i.id === String(preferredId)) || items[0];
    setActiveQte(target.id);
  }

  function makeQteOption(item) {
    const option = document.createElement('option');
    option.value = item.id;
    option.textContent = item.name;
    return option;
  }

  function setActiveQte(id) {
    const qte = allQtes().find(item => item.id === String(id));
    if (!qte) return;
    activeQte = qte;
    activeSequence = qte.sequence;
    qteIndex = 0;
    qteSelect.value = qte.id;
    qteTitle.textContent = sequenceText(activeSequence);
    renderQte();
  }

  function renderQte() {
  qteDots.innerHTML = '';

  activeSequence.forEach((_, i) => {
    const dot = document.createElement('div');
    dot.className =
      'qte-dot' +
      (i < qteIndex ? ' done' : i === qteIndex ? ' current' : '');

    qteDots.appendChild(dot);
  });

  board.querySelectorAll('.note-key').forEach(k => {
    k.classList.remove('focus', 'done');
  });

  if (appMode !== 'qte') {
    return;
  }

  for (let i = 0; i < Math.min(qteIndex, activeSequence.length); i++) {
    const [row, col] = activeSequence[i];
    getKey(row, col)?.classList.add('done');
  }

  if (qteIndex < activeSequence.length) {
    const [row, col] = activeSequence[qteIndex];
    getKey(row, col)?.classList.add('focus');
  }
}

  function checkQte(row, col, el) {
    if (!activeQte || qteIndex >= activeSequence.length) return;
    const [expectedRow, expectedCol] = activeSequence[qteIndex];
    if (row !== expectedRow || col !== expectedCol) {
      pulse(el, 'wrong', 220);
      currentSub.textContent = `Wrong · expected ${label(NOTES[expectedRow][expectedCol])}`;
      return;
    }
    qteIndex++;
    if (qteIndex >= activeSequence.length) currentSub.textContent = `${activeQte.name} completed`;
    renderQte();
  }

  function setAppMode(mode) {
    appMode = mode;
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === mode));
    qtePanel.classList.toggle('hidden', mode !== 'qte');
    customPanel.classList.toggle('hidden', mode !== 'custom');
    modeDescription.textContent = mode === 'free'
      ? 'Free play. Switch between Fundamental and Harmonic.'
      : mode === 'qte'
        ? `Game QTEs from ${QTE_CONFIG_PATH} plus saved custom ones.`
        : 'Record your sequence, save it, or share a short GQ code.';

    board.querySelectorAll('.note-key').forEach(k => k.classList.remove('focus', 'done', 'wrong'));
    if (mode === 'qte') {
      recording = false;
      updateRecordButton();
      qteIndex = 0;
      renderQte();
    }
  }

  function renderRecording() {
    customSequence.textContent = sequenceText(recordingSequence);
    recordStatus.textContent = recording
      ? `Recording · notes: ${recordingSequence.length}`
      : `Notes: ${recordingSequence.length}`;
  }

  function updateRecordButton() {
    recordBtn.textContent = recording ? 'Stop recording' : 'Start recording';
    recordBtn.classList.toggle('recording', recording);
  }

  function makeCustomObject(name, sequence) {
    return {
      id: `custom-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,
      name: (name.trim() || 'Custom Track').slice(0, 80),
      sequence: parseSequence(sequence),
      source: 'custom'
    };
  }

  function bytesToBase64Url(bytes) {
    let binary = '';
    for (const b of bytes) binary += String.fromCharCode(b);
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  }

  function base64UrlToBytes(text) {
    const normalized = text.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - normalized.length % 4) % 4);
    const binary = atob(padded);
    return Uint8Array.from(binary, c => c.charCodeAt(0));
  }

  function encodeShareCode(name, sequence) {
    const payload = { v: 1, n: (name.trim() || 'Custom Track').slice(0, 80), s: parseSequence(sequence) };
    const json = JSON.stringify(payload);
    return SHARE_PREFIX + bytesToBase64Url(new TextEncoder().encode(json));
  }

  function decodeShareCode(code) {
    const clean = code.trim();
    if (!clean.startsWith(SHARE_PREFIX)) throw new Error('Code must start with GQ1:');
    const json = new TextDecoder().decode(base64UrlToBytes(clean.slice(SHARE_PREFIX.length)));
    const payload = JSON.parse(json);
    if (payload.v !== 1) throw new Error(`Unsupported version GQ${payload.v}`);
    return { name: String(payload.n || 'Imported QTE').slice(0, 80), sequence: parseSequence(payload.s) };
  }

  function addCustomQte(item) {
    const normalized = normalizeCustomQte(item);
    if (!normalized) throw new Error('Invalid custom Track');
    customQtes.push(normalized);
    saveCustomQtesToStorage();
    qteConfigStatus.textContent = `Game Tracks: ${gameQtes.length} · Custom: ${customQtes.length}`;
    refreshQteSelect(normalized.id);
    return normalized;
  }

  function importCustomJson(data) {
    const candidates = Array.isArray(data) ? data : [data];
    const imported = [];
    for (const item of candidates) {
      const normalized = normalizeCustomQte(item);
      if (normalized) imported.push(normalized);
    }
    if (!imported.length) throw new Error('No valid Track found in JSON');
    customQtes.push(...imported);
    saveCustomQtesToStorage();
    qteConfigStatus.textContent = `Game Tracks: ${gameQtes.length} · Custom: ${customQtes.length}`;
    refreshQteSelect(imported[imported.length - 1].id);
    return imported.length;
  }

  function findGridByCode(code) {
    for (let row = 0; row < KEY_CODES.length; row++) {
      const col = KEY_CODES[row].indexOf(code);
      if (col !== -1) return [row, col];
    }
    return null;
  }

  function isTypingTarget(target) {
    return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;
  }

  document.querySelectorAll('.tab').forEach(tab => tab.addEventListener('click', () => setAppMode(tab.dataset.tab)));
  fundamentalBtn.addEventListener('click', () => setAudioMode('note'));
  harmonicBtn.addEventListener('click', () => setAudioMode('harmonic'));
  $('#restartQte').addEventListener('click', () => { qteIndex = 0; renderQte(); });
  qteSelect.addEventListener('change', () => setActiveQte(qteSelect.value));
  volume.addEventListener('input', () => { if (gainNode) gainNode.gain.value = Number(volume.value); });

  recordBtn.addEventListener('click', () => {
    recording = !recording;
    updateRecordButton();
    renderRecording();
  });
  undoCustom.addEventListener('click', () => { recordingSequence.pop(); renderRecording(); });
  clearCustom.addEventListener('click', () => { recordingSequence = []; renderRecording(); });
  saveCustom.addEventListener('click', () => {
    try {
      if (!recordingSequence.length) throw new Error('First record at least one note');
      const item = addCustomQte(makeCustomObject(customName.value, recordingSequence));
      shareCode.value = encodeShareCode(item.name, item.sequence);
      customMessage.textContent = `Saved: ${item.name}. It will appear in the Tracks tab.`;
    } catch (err) { customMessage.textContent = err.message; }
  });
  generateCode.addEventListener('click', () => {
    try {
      if (!recordingSequence.length) throw new Error('No sequence to export. Record at least one note first.');
      shareCode.value = encodeShareCode(customName.value, recordingSequence);
      customMessage.textContent = 'Code generated. Let\'s share it with others!';
    } catch (err) { customMessage.textContent = err.message; }
  });
  importCode.addEventListener('click', () => {
    try {
      const decoded = decodeShareCode(shareCode.value);
      const item = addCustomQte(makeCustomObject(decoded.name, decoded.sequence));
      customName.value = item.name;
      recordingSequence = item.sequence.map(pair => [...pair]);
      renderRecording();
      customMessage.textContent = `Imported: ${item.name}`;
    } catch (err) { customMessage.textContent = `Import error: ${err.message}`; }
  });
  customJsonFile.addEventListener('change', async () => {
    const file = customJsonFile.files?.[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      const count = importCustomJson(data);
      customMessage.textContent = `Imported QTE from JSON: ${count}`;
    } catch (err) {
      customMessage.textContent = `JSON error: ${err.message}`;
    } finally {
      customJsonFile.value = '';
    }
  });

  const held = new Set();
  window.addEventListener('keydown', (ev) => {
    if (isTypingTarget(ev.target)) return;
    if (ev.repeat) return;
    if (ev.code === 'Space') {
      ev.preventDefault();
      setAudioMode(audioMode === 'note' ? 'harmonic' : 'note');
      return;
    }
    const grid = findGridByCode(ev.code);
    if (!grid) return;
    ev.preventDefault();
    if (held.has(ev.code)) return;
    held.add(ev.code);
    trigger(grid[0], grid[1]);
  });
  window.addEventListener('keyup', (ev) => held.delete(ev.code));
  window.addEventListener('blur', () => held.clear());

  buildBoard();
  renderRecording();
  updateRecordButton();
  void loadQteConfig();
  void preloadAllAudio();
})();
