// ── games/play-the-notes.js ───────────────────────────────────────────────
// Handles: Play the Notes game mode
// Pitch detected via microphone → moving line on staff → hold to score
// Depends on: pitch.js, staff.js, name-the-notes.js (shared game state)

const HIT_THRESHOLD_CENTS = 50;  // cents tolerance for a hit
const HIT_HOLD_MS         = 350; // ms the player must hold the pitch

// ── State ─────────────────────────────────────────────────────────────────
let ptn_active   = false;
let ptn_hitTimer = null;
let ptn_smoothHz = null; // exponentially smoothed Hz for stable line movement

// ── Init ──────────────────────────────────────────────────────────────────
function initPlayTheNotes() {
  // Nothing to do on init — mic requested on Play tap
}

// ── Start ─────────────────────────────────────────────────────────────────
async function startPlayTheNotes() {
  const micEl    = document.getElementById('mic-status');
  const micTxt   = document.getElementById('mic-status-text');

  if (micEl) { micEl.style.display = 'flex'; micEl.className = 'mic-status'; }
  if (micTxt) micTxt.textContent = 'Requesting mic…';

  const granted = await startPitchDetection(onPitchFrame);
  if (!granted) {
    if (micEl) micEl.style.display = 'none';
    alert('Microphone access is needed. Please allow mic access and try again.');
    showPregame();
    return;
  }

  if (micEl) { micEl.className = 'mic-status active'; }
  if (micTxt) micTxt.textContent = 'Listening…';

  ptn_active   = true;
  ptn_smoothHz = null;

  // Shared game state reset (same vars as name-the-notes.js)
  score = 0; streak = 0; timeLeft = gameDuration;
  answered = false; gameActive = true; paused = false;

  document.getElementById('score').textContent    = '0';
  document.getElementById('streak').textContent   = '0';
  setTimerDisplay(gameDuration);

  const circ = 2 * Math.PI * 27;
  document.getElementById('timer-prog').style.strokeDasharray  = circ;
  document.getElementById('timer-prog').style.strokeDashoffset = '0';
  document.getElementById('timer-prog').className = 'timer-prog';

  document.getElementById('pregame-screen').classList.remove('show');
  document.getElementById('active-game').style.display = 'flex';
  document.getElementById('overlay-pause').classList.remove('show');
  document.getElementById('recap-view').classList.remove('show');
  document.getElementById('game-ui').style.display  = '';
  document.getElementById('choices').style.display  = 'none'; // no buttons in PTN
  document.getElementById('feedback').textContent   = '';

  setTimerIcon('pause');
  loadBest();
  ptnNextQuestion();
  clearInterval(timerInterval);
  timerInterval = setInterval(tick, 1000);
}

// ── Stop ──────────────────────────────────────────────────────────────────
function stopPlayTheNotes() {
  ptn_active = false;
  stopPitchDetection();
  if (ptn_hitTimer) { clearTimeout(ptn_hitTimer); ptn_hitTimer = null; }
  removePitchLine();
  const micEl = document.getElementById('mic-status');
  if (micEl) micEl.style.display = 'none';
}

// ── Show next note (PTN version — no answer buttons) ──────────────────────
function ptnNextQuestion() {
  answered = false;
  document.getElementById('feedback').textContent = '';
  const notes = noteSet();
  current = notes[Math.floor(Math.random() * notes.length)];
  drawStaff(current);
  // Don't call buildChoices — no buttons in PTN mode
  // Don't call playNote — player provides the pitch
}

// ── Pitch frame callback (~60fps) ─────────────────────────────────────────
function onPitchFrame(hz) {
  if (!ptn_active || paused) return;

  // Exponential smoothing — reduces jitter without adding lag
  // α=0.3 means 30% new value, 70% previous — adjust for feel
  if (hz && ptn_smoothHz) {
    ptn_smoothHz = 0.3 * hz + 0.7 * ptn_smoothHz;
  } else {
    ptn_smoothHz = hz; // hard set on first valid reading or silence
  }

  updatePitchLine(ptn_smoothHz ? hzToStaffY(ptn_smoothHz) : null);

  if (!hz || !current) {
    // No pitch — cancel any pending hit timer
    if (ptn_hitTimer) { clearTimeout(ptn_hitTimer); ptn_hitTimer = null; }
    return;
  }

  // Check if within threshold of target note
  const targetHz = NOTE_FREQS[current.actualName] || NOTE_FREQS[current.name];
  if (!targetHz) return;

  const cents = Math.abs(1200 * Math.log2(hz / targetHz));
  if (cents <= HIT_THRESHOLD_CENTS) {
    if (!ptn_hitTimer) {
      ptn_hitTimer = setTimeout(() => {
        ptn_hitTimer = null;
        onNoteHit();
      }, HIT_HOLD_MS);
    }
  } else {
    // Drifted out of range — cancel timer
    if (ptn_hitTimer) { clearTimeout(ptn_hitTimer); ptn_hitTimer = null; }
  }
}

// ── Note hit ──────────────────────────────────────────────────────────────
function onNoteHit() {
  if (!ptn_active || !gameActive) return;
  score++;
  streak++;
  document.getElementById('score').textContent  = score;
  document.getElementById('streak').textContent = streak;

  const fb = document.getElementById('feedback');
  fb.textContent  = '✓ ' + current.name;
  fb.style.color  = 'var(--correct-text)';

  // Check personal best
  const prev = parseInt(localStorage.getItem(bestKey()) || '0');
  if (score > prev) {
    document.getElementById('best').textContent = score;
    showToast('New high score!');
  }

  flashPitchLineGreen();
  setTimeout(() => { if (ptn_active && gameActive && !paused) ptnNextQuestion(); }, 400);
}

// ── Pitch line SVG ────────────────────────────────────────────────────────
function updatePitchLine(y) {
  const svg = document.getElementById('staff-svg');
  if (!svg) return;
  let line = document.getElementById('pitch-line');

  if (y === null || y === undefined) {
    if (line) line.setAttribute('opacity', '0');
    return;
  }

  if (!line) {
    const ns = 'http://www.w3.org/2000/svg';
    line = document.createElementNS(ns, 'line');
    line.setAttribute('id', 'pitch-line');
    line.setAttribute('x1', '40');
    line.setAttribute('x2', '300');
    line.setAttribute('stroke-width', '2.5');
    line.setAttribute('stroke-linecap', 'round');
    svg.appendChild(line);
  }

  line.setAttribute('y1', y);
  line.setAttribute('y2', y);
  line.setAttribute('opacity', '0.9');
  line.setAttribute('stroke', '#185FA5');
}

function removePitchLine() {
  const line = document.getElementById('pitch-line');
  if (line) line.remove();
}

function flashPitchLineGreen() {
  const line = document.getElementById('pitch-line');
  if (!line) return;
  line.setAttribute('stroke', '#3B6D11');
  setTimeout(() => {
    if (line.parentNode) line.setAttribute('stroke', '#185FA5');
  }, 400);
}

// ── Convert Hz → SVG y position on staff ──────────────────────────────────
function hzToStaffY(hz) {
  if (!hz) return null;
  const topLine = 25, gap = 12;
  // Map the note range to staff y positions
  // Bottom note (step 0) → topLine + 4*gap = 73
  // Top note (step 8)    → topLine - gap   = 13
  const base   = clef === 'bass' ? BASS_BASE : clef === 'guitar' ? GUITAR_BASE : TREBLE_BASE;
  const notes  = applyKey(base, KEY_SIGS[keyIndex].acc);
  const loNote = notes[0];
  const hiNote = notes[notes.length - 1];

  const loHz = NOTE_FREQS[loNote.actualName] || NOTE_FREQS[loNote.name];
  const hiHz = NOTE_FREQS[hiNote.actualName] || NOTE_FREQS[hiNote.name];
  if (!loHz || !hiHz) return topLine + 2 * gap;

  // Log-scale interpolation (pitch is logarithmic)
  const logHz  = Math.log2(Math.max(hz, loHz));
  const logLo  = Math.log2(loHz);
  const logHi  = Math.log2(hiHz);
  const t      = Math.min(Math.max((logHz - logLo) / (logHi - logLo), 0), 1);

  const yBottom = noteYPos(0, topLine, gap);  // step 0
  const yTop    = noteYPos(8, topLine, gap);  // step 8
  return yBottom + (yTop - yBottom) * t;
}
