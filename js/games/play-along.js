// ── js/games/play-along.js ────────────────────────────────────────────────
// "Play Along" — renders a song from MusicXML via OpenSheetMusicDisplay,
// detects mic pitch, and advances the cursor note by note.

// ── Constants ─────────────────────────────────────────────────────────────
const PA_HIT_CENTS   = 80;   // cents tolerance for a hit
const PA_HIT_HOLD_MS = 180;  // ms to hold pitch before registering

// ── State ─────────────────────────────────────────────────────────────────
let pa_active    = false;
let pa_song      = null;
let pa_osmd      = null;
let pa_hitTimer  = null;
let pa_smoothHz  = null;
let pa_nashville = false;
let pa_score     = 0;
let pa_staffTopY = null;  // y (in wrap coords) of top staff line — F5
let pa_staffBotY = null;  // y (in wrap coords) of bottom staff line — E4

// Chromatic map of scientific pitch → diatonic "step" on a treble staff,
// where 0 = E4 (bottom line) and 8 = F5 (top line). Fractional steps place
// accidentals between their neighbours for smooth pitch-line movement.
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

// ── Start ─────────────────────────────────────────────────────────────────
async function startPlayAlong() {
  const songKey = document.getElementById('pa-song-select')?.value || 'dinks-song';
  pa_song = SONGS[songKey];
  if (!pa_song) { alert('Song not found'); return; }

  const micEl  = document.getElementById('mic-status');
  const micTxt = document.getElementById('mic-status-text');
  if (micEl)  { micEl.style.display = 'flex'; micEl.className = 'mic-status'; }
  if (micTxt)   micTxt.textContent = 'Requesting mic…';

  const granted = await startPitchDetection(pa_onPitchFrame);
  if (!granted) {
    if (micEl) micEl.style.display = 'none';
    alert('Microphone access is needed. Please allow mic and try again.');
    showPregame();
    return;
  }

  if (micEl)  { micEl.className = 'mic-status active'; }
  if (micTxt)   micTxt.textContent = 'Listening…';

  pa_active   = true;
  pa_smoothHz = null;
  pa_score    = 0;

  document.getElementById('pregame-screen').classList.remove('show');
  document.getElementById('active-game').style.display = 'none';
  document.getElementById('pa-active').style.display   = 'flex';
  document.getElementById('recap-view').classList.remove('show');
  document.getElementById('game-ui').style.display     = '';
  document.getElementById('pa-score-display').textContent = '0';
  const titleEl = document.getElementById('pa-title');
  if (titleEl) titleEl.textContent = pa_song.meta.title;

  const complete = document.getElementById('pa-complete');
  const controls = document.getElementById('pa-controls-row');
  if (complete) complete.style.display = 'none';
  if (controls) controls.style.display = '';

  await pa_loadAndRender();
}

// ── OSMD rendering ────────────────────────────────────────────────────────
async function pa_loadAndRender() {
  const container = document.getElementById('pa-osmd-container');
  if (!container) return;

  if (!pa_osmd) {
    pa_osmd = new opensheetmusicdisplay.OpenSheetMusicDisplay(container, {
      autoResize:                      false,
      drawTitle:                       false,
      drawSubtitle:                    false,
      drawComposer:                    false,
      drawCredits:                     false,
      drawPartNames:                   false,
      drawMeasureNumbers:              false,
      renderSingleHorizontalStaffline: true,
    });
  }

  try {
    const res = await fetch(pa_song.xmlPath);
    if (!res.ok) throw new Error(`Failed to load ${pa_song.xmlPath} (${res.status})`);
    const isCompressed = /\.mxl$/i.test(pa_song.xmlPath);
    const data = isCompressed
      ? new Uint8Array(await res.arrayBuffer())
      : await res.text();
    await pa_osmd.load(data);
    pa_osmd.render();
    pa_osmd.cursor.show();
    pa_osmd.cursor.reset();
    pa_skipRestsAndEmpty();
    pa_measureStaffExtent();
    pa_scrollToCursor();
  } catch (err) {
    console.error('OSMD load/render failed:', err);
    alert(`Could not load song: ${err.message}`);
  }
}

// ── Stop / Exit ───────────────────────────────────────────────────────────
function stopPlayAlong() {
  pa_active = false;
  stopPitchDetection();
  if (pa_hitTimer) { clearTimeout(pa_hitTimer); pa_hitTimer = null; }
  const micEl = document.getElementById('mic-status');
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

function pa_skipRestsAndEmpty() {
  // Advance cursor past any rests or empty entries until a pitched note or end.
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

  // Prefer OSMD's computed frequency when available.
  let hz = typeof pitch.Frequency === 'number' ? pitch.Frequency : null;

  // Fallback: build scientific name → NOTE_FREQS lookup.
  if (!hz) {
    const NAMES = ['C','D','E','F','G','A','B'];
    const accMap = { 1: '#', 2: '##', '-1': 'b', '-2': 'bb' };
    const base   = NAMES[pitch.FundamentalNote];
    const acc    = accMap[pitch.AccidentalHalfTones] || '';
    hz = NOTE_FREQS[`${base}${acc}${pitch.Octave}`];
  }
  // OSMD gives us the *sounding* pitch — it already applies any clef-octave
  // transposition (e.g. treble-8 / guitar clef) from the MusicXML. No further
  // octave adjustment needed here.
  return hz || null;
}

function pa_scrollToCursor() {
  const container = document.getElementById('pa-osmd-container');
  const cEl       = pa_osmd?.cursor?.cursorElement;
  if (!container || !cEl) return;
  const cRect    = cEl.getBoundingClientRect();
  const contRect = container.getBoundingClientRect();
  const cursorX  = cRect.left - contRect.left + container.scrollLeft;
  const target   = cursorX - container.clientWidth / 2;
  container.scrollTo({ left: Math.max(0, target), behavior: 'smooth' });
}

// Measure the staff's top/bottom Y (in wrap coordinates) using the cursor,
// which is rendered as a vertical element spanning roughly the staff height.
function pa_measureStaffExtent() {
  const wrap = document.querySelector('.pa-staff-wrap');
  const cEl  = pa_osmd?.cursor?.cursorElement;
  if (!wrap || !cEl) return;
  const cRect = cEl.getBoundingClientRect();
  const wRect = wrap.getBoundingClientRect();
  pa_staffTopY = cRect.top    - wRect.top;
  pa_staffBotY = cRect.bottom - wRect.top;
}

function pa_hzToStep(hz) {
  if (!hz || hz < 60) return null;
  const visualHz = pa_song?.meta?.guitarOctave ? hz * 2 : hz;
  const t = PA_HZ_STEP_TABLE;
  if (visualHz <= t[0].hz)                 return t[0].step;
  if (visualHz >= t[t.length - 1].hz)      return t[t.length - 1].step;
  for (let i = 0; i < t.length - 1; i++) {
    if (visualHz >= t[i].hz && visualHz <= t[i + 1].hz) {
      const frac = (visualHz - t[i].hz) / (t[i + 1].hz - t[i].hz);
      return t[i].step + (t[i + 1].step - t[i].step) * frac;
    }
  }
  return null;
}

// Draw a horizontal tuner-style line at the detected pitch's Y position,
// centred over the cursor. Colour green when in range, blue otherwise.
function pa_updatePitchOverlay(hz, inRange) {
  const svg = document.getElementById('pa-pitch-overlay');
  const wrap = document.querySelector('.pa-staff-wrap');
  if (!svg || !wrap) return;
  svg.innerHTML = '';
  if (pa_staffTopY === null || pa_staffBotY === null) return;

  const step = pa_hzToStep(hz);
  if (step === null) return;

  // 5 staff lines, 4 gaps → 8 half-steps from bottom line (step 0) to top line (step 8)
  const pxPerStep = (pa_staffBotY - pa_staffTopY) / 8;
  const y = pa_staffBotY - step * pxPerStep;

  // X: center the line under the cursor (which we keep centred in the container)
  const container = document.getElementById('pa-osmd-container');
  const cEl = pa_osmd?.cursor?.cursorElement;
  let centerX = wrap.clientWidth / 2;
  if (container && cEl) {
    const cRect   = cEl.getBoundingClientRect();
    const wRect   = wrap.getBoundingClientRect();
    centerX = cRect.left + cRect.width / 2 - wRect.left;
  }

  const color = inRange ? '#1D9E75' : '#185FA5';
  const half  = 40;
  const line  = document.createElementNS('http://www.w3.org/2000/svg', 'line');
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
    if (pa_hitTimer) { clearTimeout(pa_hitTimer); pa_hitTimer = null; }
    return;
  }

  const targetHz = pa_currentTargetHz();
  if (!targetHz) { pa_advance(); return; }

  const cents   = Math.abs(1200 * Math.log2(hz / targetHz));
  const inRange = cents <= PA_HIT_CENTS;

  pa_updatePitchOverlay(pa_smoothHz, inRange);

  if (inRange) {
    if (!pa_hitTimer) {
      pa_hitTimer = setTimeout(() => {
        pa_hitTimer = null;
        pa_onNoteHit();
      }, PA_HIT_HOLD_MS);
    }
  } else if (pa_hitTimer) {
    clearTimeout(pa_hitTimer);
    pa_hitTimer = null;
  }
}

// ── Hit / advance ─────────────────────────────────────────────────────────
function pa_onNoteHit() {
  if (!pa_active) return;
  pa_score++;
  document.getElementById('pa-score-display').textContent = pa_score;
  if (typeof playDing === 'function') playDing();
  setTimeout(() => { if (pa_active) pa_advance(); }, 120);
}

function pa_advance() {
  pa_osmd.cursor.next();
  pa_skipRestsAndEmpty();
  if (pa_cursorEnded()) {
    pa_onSongComplete();
    return;
  }
  pa_scrollToCursor();
}

function pa_onSongComplete() {
  pa_active = false;
  stopPitchDetection();
  const micEl = document.getElementById('mic-status');
  if (micEl) micEl.style.display = 'none';

  const complete = document.getElementById('pa-complete');
  const controls = document.getElementById('pa-controls-row');
  const feedback = document.getElementById('pa-feedback');
  const scoreNum = document.getElementById('pa-complete-score-num');
  if (scoreNum) scoreNum.textContent = pa_score;
  if (complete) complete.style.display = 'flex';
  if (controls) controls.style.display = 'none';
  if (feedback) feedback.textContent = '';

  if (typeof launchConfetti === 'function') setTimeout(launchConfetti, 100);
}

// ── Nashville toggle ──────────────────────────────────────────────────────
// Chord symbols come from the MusicXML. Nashville post-processing (walking
// OSMD's rendered SVG text nodes) is deferred to Stage 3.
function toggleNashville() {
  pa_nashville = !pa_nashville;
  const btn = document.getElementById('pa-nashville-btn');
  if (btn) btn.classList.toggle('active', pa_nashville);
}
