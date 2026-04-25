// ── games/intervals.js ────────────────────────────────────────────────────
// Ear training: hear two notes (asc / desc / harmonic) and identify the
// interval between them.

const IV_INTERVALS = [
  { semis: 1,  short: 'm2',  label: 'Minor 2nd',     consonant: false },
  { semis: 2,  short: 'M2',  label: 'Major 2nd',     consonant: false },
  { semis: 3,  short: 'm3',  label: 'Minor 3rd',     consonant: true  },
  { semis: 4,  short: 'M3',  label: 'Major 3rd',     consonant: true  },
  { semis: 5,  short: 'P4',  label: 'Perfect 4th',   consonant: true  },
  { semis: 6,  short: 'TT',  label: 'Tritone',       consonant: false },
  { semis: 7,  short: 'P5',  label: 'Perfect 5th',   consonant: true  },
  { semis: 8,  short: 'm6',  label: 'Minor 6th',     consonant: true  },
  { semis: 9,  short: 'M6',  label: 'Major 6th',     consonant: true  },
  { semis: 10, short: 'm7',  label: 'Minor 7th',     consonant: false },
  { semis: 11, short: 'M7',  label: 'Major 7th',     consonant: false },
  { semis: 12, short: 'P8',  label: 'Octave',        consonant: true  },
];

const IV_PRESETS = {
  all:       IV_INTERVALS.map(i => i.semis),
  consonant: IV_INTERVALS.filter(i => i.consonant).map(i => i.semis),
  dissonant: IV_INTERVALS.filter(i => !i.consonant).map(i => i.semis),
};

const IV_CHROMATIC_SHARPS = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const IV_ROOT_POOL = (() => {
  const pool = [];
  for (let octave = 3; octave <= 4; octave++) {
    IV_CHROMATIC_SHARPS.forEach(pc => pool.push(pc + octave));
  }
  return pool;
})();

const IV_TONIC_POOL = (() => {
  const pool = [];
  for (let octave = 2; octave <= 5; octave++) {
    IV_CHROMATIC_SHARPS.forEach(pc => pool.push(pc + octave));
  }
  return pool;
})();

const IV_STORAGE_KEY = 'mntr-intervals-cfg-v1';

const ivState = {
  selected: new Set(IV_PRESETS.all),
  playback: 'random',
  keyMode:  'chromatic',
  fixedTonic: 'C4',
  visual: 'ear-only',
  questionCount: 25,

  active: false,
  currentRoot: null,
  currentSemis: null,
  currentPlayback: 'ascending',
  qIndex: 0,
  correct: 0,
  streak: 0,
  bestStreak: 0,
  answered: false,
};

window.ivState = ivState;

// ── Persistence ───────────────────────────────────────────────────────────
function ivLoadConfig() {
  try {
    const raw = localStorage.getItem(IV_STORAGE_KEY);
    if (!raw) return;
    const cfg = JSON.parse(raw);
    if (Array.isArray(cfg.selected)) {
      const valid = cfg.selected.filter(s => Number.isInteger(s) && s >= 1 && s <= 12);
      if (valid.length) ivState.selected = new Set(valid);
    }
    if (cfg.playback)      ivState.playback      = cfg.playback;
    if (cfg.keyMode)       ivState.keyMode       = cfg.keyMode;
    if (cfg.fixedTonic)    ivState.fixedTonic    = cfg.fixedTonic;
    if (cfg.visual)        ivState.visual        = cfg.visual;
    if (cfg.questionCount) ivState.questionCount = cfg.questionCount;
  } catch (e) {}
}

function ivSaveConfig() {
  try {
    localStorage.setItem(IV_STORAGE_KEY, JSON.stringify({
      selected: [...ivState.selected],
      playback: ivState.playback,
      keyMode:  ivState.keyMode,
      fixedTonic: ivState.fixedTonic,
      visual: ivState.visual,
      questionCount: ivState.questionCount,
    }));
  } catch (e) {}
}

// ── Init ──────────────────────────────────────────────────────────────────
function initIntervals() {
  ivLoadConfig();
  ivBuildChecklist();

  const tonicSel = document.getElementById('iv-fixed-tonic-select');
  if (tonicSel) {
    tonicSel.innerHTML = '';
    IV_TONIC_POOL.forEach(name => {
      const opt = document.createElement('option');
      opt.value = name; opt.textContent = name;
      if (name === ivState.fixedTonic) opt.selected = true;
      tonicSel.appendChild(opt);
    });
  }

  const playbackSel = document.getElementById('iv-playback-select');
  if (playbackSel) playbackSel.value = ivState.playback;

  const keyModeSel = document.getElementById('iv-key-mode-select');
  if (keyModeSel) keyModeSel.value = ivState.keyMode;

  const visualSel = document.getElementById('iv-visual-select');
  if (visualSel) visualSel.value = ivState.visual;

  const countSel = document.getElementById('iv-count-select');
  if (countSel) countSel.value = String(ivState.questionCount);

  ivSyncFixedTonicRow();
  ivRefreshPresetButtons();
}

function ivBuildChecklist() {
  const host = document.getElementById('iv-checklist');
  if (!host) return;
  host.innerHTML = '';
  IV_INTERVALS.forEach(iv => {
    const wrap = document.createElement('label');
    wrap.className = 'iv-check';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.value = String(iv.semis);
    input.checked = ivState.selected.has(iv.semis);
    input.addEventListener('change', () => {
      if (input.checked) ivState.selected.add(iv.semis);
      else ivState.selected.delete(iv.semis);
      ivSaveConfig();
      ivRefreshPresetButtons();
    });
    const span = document.createElement('span');
    span.className = 'iv-check-label';
    span.textContent = iv.short;
    wrap.appendChild(input);
    wrap.appendChild(span);
    host.appendChild(wrap);
  });
}

function ivSyncChecklistFromState() {
  document.querySelectorAll('#iv-checklist input[type="checkbox"]').forEach(cb => {
    cb.checked = ivState.selected.has(parseInt(cb.value, 10));
  });
}

function ivRefreshPresetButtons() {
  const set = ivState.selected;
  const presetMatches = (semisList) => {
    if (set.size !== semisList.length) return false;
    return semisList.every(s => set.has(s));
  };
  document.querySelectorAll('.iv-preset-btn').forEach(btn => {
    const preset = btn.dataset.preset;
    const list = IV_PRESETS[preset];
    btn.classList.toggle('active', list ? presetMatches(list) : false);
  });
}

function ivApplyPreset(preset) {
  const list = IV_PRESETS[preset];
  if (!list) return;
  ivState.selected = new Set(list);
  ivSaveConfig();
  ivSyncChecklistFromState();
  ivRefreshPresetButtons();
}

function ivOnConfigChange() {
  const playbackSel = document.getElementById('iv-playback-select');
  const visualSel   = document.getElementById('iv-visual-select');
  const countSel    = document.getElementById('iv-count-select');
  const tonicSel    = document.getElementById('iv-fixed-tonic-select');
  if (playbackSel) ivState.playback = playbackSel.value;
  if (visualSel)   ivState.visual   = visualSel.value;
  if (countSel)    ivState.questionCount = parseInt(countSel.value, 10) || 25;
  if (tonicSel)    ivState.fixedTonic = tonicSel.value;
  ivSaveConfig();
}

function ivOnKeyModeChange() {
  const sel = document.getElementById('iv-key-mode-select');
  if (sel) ivState.keyMode = sel.value;
  ivSyncFixedTonicRow();
  ivSaveConfig();
}

function ivSyncFixedTonicRow() {
  const row = document.getElementById('iv-fixed-tonic-row');
  if (!row) return;
  row.style.display = ivState.keyMode === 'fixed' ? '' : 'none';
}

// ── Note math ─────────────────────────────────────────────────────────────
function ivParseNote(name) {
  const m = /^([A-G])([#b]?)(-?\d+)$/.exec(name);
  if (!m) return null;
  const letterToPc = { C:0, D:2, E:4, F:5, G:7, A:9, B:11 };
  let pc = letterToPc[m[1]];
  if (m[2] === '#') pc += 1;
  if (m[2] === 'b') pc -= 1;
  const octave = parseInt(m[3], 10);
  return { pc: ((pc % 12) + 12) % 12, octave, midi: (octave + 1) * 12 + pc };
}

function ivNoteFromMidi(midi) {
  const pc = ((midi % 12) + 12) % 12;
  const octave = Math.floor(midi / 12) - 1;
  return IV_CHROMATIC_SHARPS[pc] + octave;
}

function ivFreqFor(noteName) {
  if (NOTE_FREQS[noteName] != null) return NOTE_FREQS[noteName];
  // Fall back to equal-temperament from A4=440 if name isn't in the table.
  const parsed = ivParseNote(noteName);
  if (!parsed) return null;
  return 440 * Math.pow(2, (parsed.midi - 69) / 12);
}

function ivPickRoot() {
  if (ivState.keyMode === 'fixed') return ivState.fixedTonic;
  // Avoid a root that pushes the upper note out of our practical range.
  // Cap the upper note at MIDI 84 (C6) so 12-semitone intervals fit.
  const maxRootMidi = 84 - 12;
  const candidates = IV_ROOT_POOL.filter(n => {
    const p = ivParseNote(n);
    return p && p.midi <= maxRootMidi;
  });
  return candidates[Math.floor(Math.random() * candidates.length)];
}

function ivResolvePlayback() {
  if (ivState.playback !== 'random') return ivState.playback;
  const opts = ['ascending', 'descending', 'harmonic'];
  return opts[Math.floor(Math.random() * opts.length)];
}

// ── Game flow ─────────────────────────────────────────────────────────────
function startIntervals() {
  if (ivState.selected.size < 2) {
    alert('Pick at least two intervals to drill.');
    return;
  }
  ivState.active = true;
  ivState.qIndex = 0;
  ivState.correct = 0;
  ivState.streak = 0;
  ivState.bestStreak = 0;

  document.getElementById('pregame-screen').classList.remove('show');
  document.getElementById('game-ui').style.display = 'none';
  document.getElementById('iv-complete').classList.remove('show');
  const ivActive = document.getElementById('iv-active');
  ivActive.classList.remove('complete');
  ivActive.style.display = 'flex';

  ivApplyVisualMode();
  ivUpdateMetrics();
  ivNextQuestion();
}

function ivApplyVisualMode() {
  const earOnly = document.getElementById('iv-ear-only');
  const staffWrap = document.getElementById('iv-staff-wrap');
  if (ivState.visual === 'staff') {
    earOnly.style.display = 'none';
    staffWrap.style.display = '';
  } else {
    earOnly.style.display = 'flex';
    staffWrap.style.display = 'none';
  }
}

function ivUpdateMetrics() {
  const total = ivState.questionCount;
  const i = Math.min(ivState.qIndex + 1, total);
  document.getElementById('iv-progress').textContent = `Q ${i} / ${total}`;
  document.getElementById('iv-score').textContent  = ivState.correct;
  document.getElementById('iv-streak').textContent = ivState.streak;
  const answered = ivState.qIndex + (ivState.answered ? 1 : 0);
  const acc = answered > 0 ? Math.round((ivState.correct / answered) * 100) : 100;
  document.getElementById('iv-acc').textContent = `${acc}%`;
}

function ivNextQuestion() {
  if (ivState.qIndex >= ivState.questionCount) {
    ivEndSession();
    return;
  }
  ivState.answered = false;
  ivState.currentRoot = ivPickRoot();
  const choices = [...ivState.selected];
  ivState.currentSemis = choices[Math.floor(Math.random() * choices.length)];
  ivState.currentPlayback = ivResolvePlayback();

  document.getElementById('iv-feedback').textContent = '';

  ivBuildChoiceButtons();
  ivRenderStaffIfNeeded();
  ivPlayCurrent();
  ivUpdateMetrics();
}

function ivPlayCurrent() {
  const root = ivState.currentRoot;
  const upper = ivUpperNoteName(root, ivState.currentSemis);
  const f1 = ivFreqFor(root);
  const f2 = ivFreqFor(upper);
  const earText = document.getElementById('iv-ear-text');
  if (earText) earText.textContent = ivPlaybackHint(ivState.currentPlayback);
  playIntervalFreqs(f1, f2, ivState.currentPlayback);
}

function ivPlaybackHint(mode) {
  if (mode === 'ascending')  return 'Listen — ascending';
  if (mode === 'descending') return 'Listen — descending';
  if (mode === 'harmonic')   return 'Listen — harmonic';
  return 'Listen…';
}

function ivUpperNoteName(rootName, semis) {
  const parsed = ivParseNote(rootName);
  if (!parsed) return rootName;
  return ivNoteFromMidi(parsed.midi + semis);
}

function ivReplay() {
  if (!ivState.active) return;
  ivPlayCurrent();
}

function ivBuildChoiceButtons() {
  const host = document.getElementById('iv-choices');
  host.innerHTML = '';
  const selectedList = IV_INTERVALS.filter(iv => ivState.selected.has(iv.semis));
  selectedList.forEach(iv => {
    const btn = document.createElement('button');
    btn.className = 'iv-choice-btn';
    btn.dataset.semis = String(iv.semis);
    btn.innerHTML = `<span class="iv-choice-short">${iv.short}</span><span class="iv-choice-label">${iv.label}</span>`;
    btn.onclick = () => ivCheckAnswer(iv.semis, btn);
    host.appendChild(btn);
  });
}

function ivCheckAnswer(chosenSemis, btn) {
  if (ivState.answered) return;
  ivState.answered = true;
  document.querySelectorAll('.iv-choice-btn').forEach(b => b.disabled = true);

  const correct = chosenSemis === ivState.currentSemis;
  const correctMeta = IV_INTERVALS.find(i => i.semis === ivState.currentSemis);
  const fb = document.getElementById('iv-feedback');

  if (correct) {
    btn.classList.add('correct');
    ivState.correct += 1;
    ivState.streak += 1;
    if (ivState.streak > ivState.bestStreak) ivState.bestStreak = ivState.streak;
    fb.textContent = `✓ ${correctMeta.label}`;
    fb.style.color = 'var(--correct-text)';
  } else {
    btn.classList.add('wrong');
    ivState.streak = 0;
    document.querySelectorAll('.iv-choice-btn').forEach(b => {
      if (parseInt(b.dataset.semis, 10) === ivState.currentSemis) b.classList.add('correct');
    });
    fb.textContent = `Not quite — it was ${correctMeta.label}.`;
    fb.style.color = 'var(--wrong-text)';
  }
  ivUpdateMetrics();

  setTimeout(() => {
    if (!ivState.active) return;
    ivState.qIndex += 1;
    ivNextQuestion();
  }, 900);
}

function ivRenderStaffIfNeeded() {
  if (ivState.visual !== 'staff') return;
  const container = document.getElementById('iv-staff-osmd');
  if (!container || typeof renderNotes !== 'function') return;
  const upper = ivUpperNoteName(ivState.currentRoot, ivState.currentSemis);
  const notes = [
    { name: ivState.currentRoot, actualName: ivState.currentRoot },
    { name: upper, actualName: upper },
  ];
  // Pick a clef that fits the lower note: bass for low, treble otherwise.
  const rootMidi = ivParseNote(ivState.currentRoot)?.midi || 60;
  const useBass = rootMidi < 57; // below A3 → bass
  reserveStaffHeight(container, {
    clef: useBass ? 'bass' : 'treble', keySigIndex: 0, rangeMode: 'full-range', showLabels: false,
  }).then(() => {
    renderNotes(container, notes, { clef: useBass ? 'bass' : 'treble', keySigIndex: 0 });
  });
}

function ivEndSession() {
  ivState.active = false;
  const total = ivState.questionCount;
  const acc = total > 0 ? Math.round((ivState.correct / total) * 100) : 0;
  document.getElementById('iv-complete-score').textContent  = `${ivState.correct}/${total}`;
  document.getElementById('iv-complete-acc').textContent    = `${acc}%`;
  document.getElementById('iv-complete-streak').textContent = ivState.bestStreak;
  document.getElementById('iv-complete-detail').textContent =
    `${ivState.correct} correct · ${total - ivState.correct} missed`;
  document.getElementById('iv-active').classList.add('complete');
  document.getElementById('iv-complete').classList.add('show');
}

function exitIntervals() {
  ivState.active = false;
  document.getElementById('iv-active').classList.remove('complete');
  document.getElementById('iv-complete').classList.remove('show');
  showPregame();
}

window.initIntervals    = initIntervals;
window.startIntervals   = startIntervals;
window.exitIntervals    = exitIntervals;
window.ivApplyPreset    = ivApplyPreset;
window.ivOnConfigChange = ivOnConfigChange;
window.ivOnKeyModeChange = ivOnKeyModeChange;
window.ivReplay         = ivReplay;
