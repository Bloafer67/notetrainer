// ── js/games/play-along.js ────────────────────────────────────────────────
// "Play Along" — renders a song from MusicXML via OpenSheetMusicDisplay,
// detects mic pitch, and advances the cursor note by note.

// ── Constants ─────────────────────────────────────────────────────────────
const PA_HIT_CENTS   = 40;
const PA_HIT_HOLD_MS = 240;

// ── State ─────────────────────────────────────────────────────────────────
let pa_active        = false;
let pa_songKey       = 'dinks-song';
let pa_song          = null;
let pa_osmd          = null;
let pa_hitTimer      = null;
let pa_wrongTimer    = null;
let pa_wrongArmed    = true;
let pa_hitArmed      = true;
let pa_smoothHz      = null;
let pa_correctNotes  = 0;
let pa_wrongAttempts = 0;
let pa_elapsedMs     = 0;
let pa_startedAt     = 0;
let pa_timerInterval = null;
let pa_staffTopY     = null;
let pa_staffBotY     = null;
let pa_rawXmlCache   = { key: null, data: null };

const PA_HZ_STEP_TABLE = (() => {
  const noteSteps = {
    'E3':-7, 'F3':-6, 'F#3':-5.5, 'G3':-5, 'G#3':-4.5,
    'A3':-4, 'Bb3':-3.5, 'B3':-3,
    'C4':-2, 'C#4':-1.5, 'D4':-1, 'Eb4':-0.5,
    'E4':0,  'F4':1,  'F#4':1.5, 'G4':2,  'G#4':2.5,
    'A4':3,  'Bb4':3.5, 'B4':4,
    'C5':5,  'C#5':5.5, 'D5':6,  'Eb5':6.5,
    'E5':7,  'F5':8,  'F#5':8.5, 'G5':9,
  };
  return Object.entries(noteSteps)
    .map(([name, step]) => ({ step, hz: NOTE_FREQS[name] }))
    .filter(x => x.hz)
    .sort((a, b) => a.hz - b.hz);
})();

// ── Init ──────────────────────────────────────────────────────────────────
function initPlayAlong() {
  populateSongSelect();
}

function populateSongSelect() {
  const sel = document.getElementById('pa-song-select');
  if (!sel) return;
  sel.innerHTML = '';
  Object.entries(SONGS).forEach(([key, song]) => {
    const opt = document.createElement('option');
    opt.value = key;
    opt.textContent = song.meta.title;
    sel.appendChild(opt);
  });
}

function paGetMicElements() {
  const root = document.getElementById('pa-active');
  return {
    micEl: root?.querySelector('#mic-status') || null,
    micTxt: root?.querySelector('#mic-status-text') || null,
  };
}

function paClearHitTimer() {
  if (pa_hitTimer) {
    clearTimeout(pa_hitTimer);
    pa_hitTimer = null;
  }
}

function paClearWrongTimer(resetArmed = false) {
  if (pa_wrongTimer) {
    clearTimeout(pa_wrongTimer);
    pa_wrongTimer = null;
  }
  if (resetArmed) pa_wrongArmed = true;
}

function paResetRoundState() {
  pa_smoothHz = null;
  pa_correctNotes = 0;
  pa_wrongAttempts = 0;
  pa_elapsedMs = 0;
  pa_startedAt = performance.now();
  pa_wrongArmed = true;
  pa_hitArmed = true;
  paClearHitTimer();
  paClearWrongTimer();
  clearInterval(pa_timerInterval);
  pa_timerInterval = setInterval(paUpdateElapsedTime, 250);
}

function paAccuracy() {
  const attempts = pa_correctNotes + pa_wrongAttempts;
  return attempts > 0 ? pa_correctNotes / attempts : 1;
}

function paUpdateElapsedTime(finalize = false) {
  if (!pa_active && !finalize) return;
  pa_elapsedMs = Math.max(0, performance.now() - pa_startedAt);
  const timeEl = document.getElementById('pa-time-display');
  if (timeEl) timeEl.textContent = formatElapsedMs(pa_elapsedMs);
}

function paUpdateSummary() {
  paUpdateElapsedTime();

  const accuracyEl = document.getElementById('pa-accuracy-display');
  if (accuracyEl) accuracyEl.textContent = formatAccuracy(paAccuracy());

  const subline = document.getElementById('pa-subline');
  if (subline) {
    const notesLabel = pa_correctNotes === 1 ? 'note' : 'notes';
    const missLabel = pa_wrongAttempts === 1 ? 'miss' : 'misses';
    subline.textContent = `${pa_correctNotes} ${notesLabel} cleared · ${pa_wrongAttempts} ${missLabel}`;
  }
}

function paSetStaffVisible(visible) {
  const root = document.getElementById('pa-active');
  if (!root) return;
  const header = root.querySelector('.pa-header');
  const staff = root.querySelector('.pa-staff-wrap');
  const feedback = document.getElementById('pa-feedback');
  if (header) header.style.display = visible ? '' : 'none';
  if (staff) staff.style.display = visible ? '' : 'none';
  if (feedback) feedback.style.display = visible ? '' : 'none';
}

function paResetSaveControls() {
  const form = document.getElementById('pa-complete-form');
  const nameInput = document.getElementById('pa-player-name');
  const saveBtn = document.getElementById('pa-save-btn');
  if (form) form.style.display = 'none';
  if (nameInput) nameInput.value = '';
  if (saveBtn) {
    saveBtn.textContent = 'Save';
    saveBtn.disabled = false;
    saveBtn.onclick = saveToLeaderboard;
  }
}

// ── Start ─────────────────────────────────────────────────────────────────
async function startPlayAlong() {
  pa_songKey = document.getElementById('pa-song-select')?.value || 'dinks-song';
  pa_song = SONGS[pa_songKey];
  window.lastPlayAlongSongKey = pa_songKey;
  window.lastResult = null;
  if (!pa_song) {
    alert('Song not found');
    return;
  }

  const { micEl, micTxt } = paGetMicElements();
  if (micEl) {
    micEl.style.display = 'flex';
    micEl.className = 'mic-status';
  }
  if (micTxt) micTxt.textContent = 'Requesting mic…';

  const granted = await startPitchDetection(pa_onPitchFrame);
  if (!granted) {
    if (micEl) micEl.style.display = 'none';
    alert('Microphone access is needed. Please allow mic and try again.');
    showPregame();
    return;
  }

  if (micEl) micEl.className = 'mic-status active';
  if (micTxt) micTxt.textContent = 'Listening…';

  pa_active = true;
  paResetRoundState();

  document.getElementById('pregame-screen').classList.remove('show');
  document.getElementById('active-game').style.display = 'none';
  document.getElementById('pa-active').style.display = 'flex';
  document.getElementById('recap-view').classList.remove('show');
  document.getElementById('game-ui').style.display = '';

  const titleEl = document.getElementById('pa-title');
  if (titleEl) titleEl.textContent = pa_song.meta.title;

  const complete = document.getElementById('pa-complete');
  const controls = document.getElementById('pa-controls-row');
  const feedback = document.getElementById('pa-feedback');
  if (complete) complete.style.display = 'none';
  if (controls) controls.style.display = '';
  if (feedback) feedback.textContent = '';
  paSetStaffVisible(true);

  paResetSaveControls();
  paUpdateSummary();

  await pa_loadAndRender();
}

// ── OSMD rendering ────────────────────────────────────────────────────────
async function pa_loadAndRender({ preserveCursor = false } = {}) {
  const container = document.getElementById('pa-osmd-container');
  if (!container) return;

  const accent = darkMode ? '#b4b2a9' : '#1a1a18';
  const themeOptions = {
    defaultColorMusic: accent,
    defaultColorNotehead: accent,
    defaultColorStem: accent,
    defaultColorRest: accent,
    defaultColorLabel: accent,
    defaultColorTitle: accent,
  };
  if (!pa_osmd) {
    pa_osmd = new opensheetmusicdisplay.OpenSheetMusicDisplay(container, {
      autoResize: false,
      drawTitle: false,
      drawSubtitle: false,
      drawComposer: false,
      drawCredits: false,
      drawPartNames: false,
      drawMeasureNumbers: false,
      renderSingleHorizontalStaffline: true,
      ...themeOptions,
    });
  } else {
    pa_osmd.setOptions(themeOptions);
  }

  const savedTimestamp = preserveCursor ? pa_cursorTimestamp() : null;

  try {
    if (pa_rawXmlCache.key !== pa_songKey) {
      const res = await fetch(pa_song.xmlPath);
      if (!res.ok) throw new Error(`Failed to load ${pa_song.xmlPath} (${res.status})`);
      const isCompressed = /\.mxl$/i.test(pa_song.xmlPath);
      const raw = isCompressed
        ? new Uint8Array(await res.arrayBuffer())
        : await res.text();
      pa_rawXmlCache = { key: pa_songKey, data: raw };
    }
    const raw = pa_rawXmlCache.data;
    const data = typeof raw === 'string' ? pa_colorizeMusicXml(raw) : raw;
    await pa_osmd.load(data);
    pa_osmd.render();
    pa_osmd.cursor.show();
    pa_osmd.cursor.reset();
    if (savedTimestamp != null) {
      pa_advanceCursorTo(savedTimestamp);
    } else {
      pa_skipRestsAndEmpty();
    }
    pa_measureStaffExtent();
    pa_scrollToCursor();
  } catch (err) {
    console.error('OSMD load/render failed:', err);
    stopPlayAlong();
    alert(`Could not load song: ${err.message}`);
    showPregame();
  }
}

function pa_cursorTimestamp() {
  const ts = pa_osmd?.cursor?.iterator?.currentTimeStamp;
  if (!ts) return null;
  if (typeof ts.RealValue === 'number') return ts.RealValue;
  if (ts.numerator != null && ts.denominator) return ts.numerator / ts.denominator;
  return null;
}

function pa_advanceCursorTo(timestamp) {
  while (!pa_cursorEnded()) {
    const ts = pa_cursorTimestamp();
    if (ts == null || ts >= timestamp) break;
    pa_osmd.cursor.next();
  }
}

// ── Stop / Exit ───────────────────────────────────────────────────────────
function stopPlayAlong() {
  pa_active = false;
  clearInterval(pa_timerInterval);
  pa_timerInterval = null;
  stopPitchDetection();
  paClearHitTimer();
  paClearWrongTimer(true);
  const overlay = document.getElementById('pa-pitch-overlay');
  if (overlay) overlay.innerHTML = '';
  const { micEl } = paGetMicElements();
  if (micEl) micEl.style.display = 'none';
}

function exitPlayAlong() {
  stopPlayAlong();
  document.getElementById('pa-active').style.display = 'none';
  showPregame();
}

// ── Cursor helpers ────────────────────────────────────────────────────────
function pa_cursorEnded() {
  const it = pa_osmd?.cursor?.Iterator || pa_osmd?.cursor?.iterator;
  return !it || it.EndReached || it.endReached;
}

function pa_currentNote() {
  const notes = pa_osmd?.cursor?.NotesUnderCursor?.();
  return notes && notes[0];
}

function pa_noteIsRest(note) {
  return !note || !note.Pitch || (typeof note.isRest === 'function' && note.isRest());
}

// True when the current note ties *into* the next note — the player is
// expected to sustain, not re-attack, so lingering ring should count.
function pa_currentNoteTiesForward() {
  const note = pa_currentNote();
  const tie = note && (note.NoteTie || note.noteTie);
  const tied = tie && (tie.Notes || tie.notes);
  if (!tied || tied.length < 2) return false;
  return tied[tied.length - 1] !== note;
}

function pa_skipRestsAndEmpty() {
  while (!pa_cursorEnded()) {
    const note = pa_currentNote();
    if (note && !pa_noteIsRest(note)) return;
    pa_osmd.cursor.next();
  }
}

function pa_currentTargetHz() {
  const note = pa_currentNote();
  if (!note) return null;
  const pitch = note.Pitch;
  if (!pitch) return null;

  let hz = typeof pitch.Frequency === 'number' ? pitch.Frequency : null;

  if (!hz) {
    const NAMES = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
    const accMap = { 1: '#', 2: '##', '-1': 'b', '-2': 'bb' };
    const base = NAMES[pitch.FundamentalNote];
    const acc = accMap[pitch.AccidentalHalfTones] || '';
    hz = NOTE_FREQS[`${base}${acc}${pitch.Octave}`];
  }

  return hz || null;
}

function pa_currentDisplayNoteName() {
  const note = pa_currentNote();
  return pa_noteNameFromPitch(note?.Pitch);
}

function pa_noteNameFromPitch(pitch) {
  if (!pitch) return '';
  const NAMES = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
  const accMap = { 1: '#', 2: '##', '-1': 'b', '-2': 'bb' };
  return `${NAMES[pitch.FundamentalNote]}${accMap[pitch.AccidentalHalfTones] || ''}${pitch.Octave}`;
}

// Walk the MusicXML and stamp a `color` attribute on every <note> (plus its
// <notehead>, <stem>, and <beam> children) based on the current boomwhacker
// palette. OSMD natively honors MusicXML color attributes at render time,
// which is far more reliable than post-render setColor() calls.
function pa_colorizeMusicXml(xmlText) {
  try {
    const doc = new DOMParser().parseFromString(xmlText, 'application/xml');
    if (doc.querySelector('parsererror')) return xmlText;
    const accMap = { '1': '#', '2': '##', '-1': 'b', '-2': 'bb' };
    doc.querySelectorAll('note').forEach(noteEl => {
      const pitchEl = noteEl.querySelector('pitch');
      if (!pitchEl) return;
      const step = pitchEl.querySelector('step')?.textContent;
      if (!step) return;
      const alter = pitchEl.querySelector('alter')?.textContent;
      const octave = pitchEl.querySelector('octave')?.textContent || '';
      const name = `${step}${accMap[alter] || ''}${octave}`;
      const palette = getNotePalette(name);
      const color = darkMode ? palette.noteFill : palette.noteStroke;
      noteEl.setAttribute('color', color);
      noteEl.querySelector('notehead')?.setAttribute('color', color);
      noteEl.querySelector('stem')?.setAttribute('color', color);
      noteEl.querySelectorAll('beam').forEach(b => b.setAttribute('color', color));
    });
    return new XMLSerializer().serializeToString(doc);
  } catch (err) {
    console.warn('Play Along: could not colorize MusicXML', err);
    return xmlText;
  }
}

function pa_scrollToCursor() {
  const container = document.getElementById('pa-osmd-container');
  const cEl = pa_osmd?.cursor?.cursorElement;
  if (!container || !cEl) return;
  const cRect = cEl.getBoundingClientRect();
  const contRect = container.getBoundingClientRect();
  const cursorX = cRect.left - contRect.left + container.scrollLeft;
  const target = cursorX - container.clientWidth / 2;
  container.scrollTo({ left: Math.max(0, target), behavior: 'smooth' });
}

function pa_measureStaffExtent() {
  const wrap = document.querySelector('.pa-staff-wrap');
  const cEl = pa_osmd?.cursor?.cursorElement;
  if (!wrap || !cEl) return;
  const cRect = cEl.getBoundingClientRect();
  const wRect = wrap.getBoundingClientRect();
  pa_staffTopY = cRect.top - wRect.top;
  pa_staffBotY = cRect.bottom - wRect.top;
}

function pa_hzToStep(hz) {
  if (!hz || hz < 60) return null;
  const visualHz = pa_song?.meta?.guitarOctave ? hz * 2 : hz;
  const table = PA_HZ_STEP_TABLE;
  if (visualHz <= table[0].hz) return table[0].step;
  if (visualHz >= table[table.length - 1].hz) return table[table.length - 1].step;
  for (let i = 0; i < table.length - 1; i++) {
    if (visualHz >= table[i].hz && visualHz <= table[i + 1].hz) {
      const frac = (visualHz - table[i].hz) / (table[i + 1].hz - table[i].hz);
      return table[i].step + (table[i + 1].step - table[i].step) * frac;
    }
  }
  return null;
}

function pa_updatePitchOverlay(hz, inRange) {
  const svg = document.getElementById('pa-pitch-overlay');
  const wrap = document.querySelector('.pa-staff-wrap');
  if (!svg || !wrap) return;
  svg.innerHTML = '';
  if (pa_staffTopY === null || pa_staffBotY === null) return;

  const step = pa_hzToStep(hz);
  if (step === null) return;

  const pxPerStep = (pa_staffBotY - pa_staffTopY) / 8;
  const y = pa_staffBotY - step * pxPerStep;

  const container = document.getElementById('pa-osmd-container');
  const cEl = pa_osmd?.cursor?.cursorElement;
  let centerX = wrap.clientWidth / 2;
  if (container && cEl) {
    const cRect = cEl.getBoundingClientRect();
    const wRect = wrap.getBoundingClientRect();
    centerX = cRect.left + cRect.width / 2 - wRect.left;
  }

  const color = inRange ? '#1D9E75' : getNotePalette(pa_currentDisplayNoteName()).pitch;
  const half = 40;
  const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  line.setAttribute('x1', centerX - half);
  line.setAttribute('x2', centerX + half);
  line.setAttribute('y1', y);
  line.setAttribute('y2', y);
  line.setAttribute('stroke', color);
  line.setAttribute('stroke-width', '2.5');
  line.setAttribute('stroke-linecap', 'round');
  line.setAttribute('opacity', '0.85');
  svg.appendChild(line);
}

function pa_countWrongAttempt() {
  pa_wrongAttempts++;
  pa_wrongArmed = false;
  paUpdateSummary();
}

// ── Pitch callback ────────────────────────────────────────────────────────
function pa_onPitchFrame(hz) {
  if (!pa_active) return;

  if (hz && pa_smoothHz) {
    pa_smoothHz = 0.25 * hz + 0.75 * pa_smoothHz;
  } else {
    pa_smoothHz = hz || null;
  }

  if (!hz || pa_cursorEnded()) {
    pa_updatePitchOverlay(null, false);
    paClearHitTimer();
    paClearWrongTimer(true);
    pa_hitArmed = true;
    return;
  }

  const targetHz = pa_currentTargetHz();
  if (!targetHz) {
    pa_advance();
    return;
  }

  const cents = Math.abs(1200 * Math.log2(hz / targetHz));
  const inRange = cents <= PA_HIT_CENTS;

  pa_updatePitchOverlay(pa_smoothHz, inRange);

  if (inRange) {
    paClearWrongTimer(true);
    if (pa_hitArmed && !pa_hitTimer) {
      pa_hitTimer = setTimeout(() => {
        pa_hitTimer = null;
        pa_onNoteHit();
      }, PA_HIT_HOLD_MS);
    }
    return;
  }

  pa_hitArmed = true;
  paClearHitTimer();
  if (pa_wrongArmed && !pa_wrongTimer) {
    pa_wrongTimer = setTimeout(() => {
      pa_wrongTimer = null;
      if (!pa_active) return;
      pa_countWrongAttempt();
    }, PA_HIT_HOLD_MS);
  }
}

// ── Hit / advance ─────────────────────────────────────────────────────────
function pa_onNoteHit() {
  if (!pa_active) return;
  pa_correctNotes++;
  paClearWrongTimer(true);
  paUpdateSummary();
  if (typeof playDing === 'function') playDing();
  setTimeout(() => {
    if (pa_active) pa_advance();
  }, 120);
}

function pa_advance() {
  const tiesForward = pa_currentNoteTiesForward();
  paClearHitTimer();
  paClearWrongTimer(true);
  pa_hitArmed = tiesForward;
  pa_osmd.cursor.next();
  pa_skipRestsAndEmpty();
  if (pa_cursorEnded()) {
    pa_onSongComplete();
    return;
  }
  pa_scrollToCursor();
}

function pa_onSongComplete() {
  paUpdateElapsedTime(true);
  clearInterval(pa_timerInterval);
  pa_timerInterval = null;
  pa_active = false;
  stopPitchDetection();
  paClearHitTimer();
  paClearWrongTimer(true);

  const { micEl } = paGetMicElements();
  if (micEl) micEl.style.display = 'none';

  window.lastResult = {
    game: 'play-along',
    song: pa_songKey,
    score: pa_correctNotes,
    time_ms: Math.round(pa_elapsedMs),
    accuracy: paAccuracy(),
  };

  const complete = document.getElementById('pa-complete');
  const controls = document.getElementById('pa-controls-row');
  const feedback = document.getElementById('pa-feedback');
  const timeNum = document.getElementById('pa-complete-time-num');
  const accuracyNum = document.getElementById('pa-complete-accuracy-num');
  const notesNum = document.getElementById('pa-complete-notes-num');
  const missesNum = document.getElementById('pa-complete-misses-num');
  const form = document.getElementById('pa-complete-form');
  const nameInput = document.getElementById('pa-player-name');
  const saveBtn = document.getElementById('pa-save-btn');

  if (timeNum) timeNum.textContent = formatElapsedMs(pa_elapsedMs, true);
  if (accuracyNum) accuracyNum.textContent = formatAccuracy(paAccuracy());
  if (notesNum) notesNum.textContent = pa_correctNotes;
  if (missesNum) missesNum.textContent = pa_wrongAttempts;
  if (complete) complete.style.display = 'flex';
  if (controls) controls.style.display = 'none';
  if (feedback) feedback.textContent = '';
  document.getElementById('recap-view').classList.remove('show');
  paSetStaffVisible(false);

  const qualifies = doesResultQualify(window.lastResult);
  if (form) form.style.display = qualifies ? 'flex' : 'none';
  if (qualifies) {
    const savedName = localStorage.getItem('mntr-playername') || '';
    if (nameInput) nameInput.value = savedName;
    if (saveBtn) {
      saveBtn.textContent = 'Save';
      saveBtn.disabled = false;
      saveBtn.onclick = saveToLeaderboard;
    }
  }

  if (typeof launchConfetti === 'function') setTimeout(launchConfetti, 100);
}

window.refreshPlayAlongPitchColors = () => {
  if (!pa_active) return;
  // Theme / boomwhacker toggles mid-song: reload the score with new colors,
  // restoring the cursor to its saved timestamp so progress isn't lost.
  pa_loadAndRender({ preserveCursor: true });
  const targetHz = pa_currentTargetHz();
  if (!targetHz || !pa_smoothHz) {
    pa_updatePitchOverlay(pa_smoothHz, false);
    return;
  }
  const cents = Math.abs(1200 * Math.log2(pa_smoothHz / targetHz));
  pa_updatePitchOverlay(pa_smoothHz, cents <= PA_HIT_CENTS);
};
