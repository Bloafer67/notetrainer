// ── games/play-the-notes.js ───────────────────────────────────────────────
// Pitch detected → moving line on staff → hold to score
// Features: full guitar range, arrows for out-of-range pitch,
//           tuner inset, ding on hit, note name label, exit/restart

const HIT_THRESHOLD_CENTS = 80;  // more forgiving — was 50
const HIT_HOLD_MS         = 280;

// ── State ─────────────────────────────────────────────────────────────────
let ptn_active    = false;
let ptn_hitTimer  = null;
let ptn_smoothHz  = null;
let ptn_centsHist = []; // rolling window of cents for tuner display
let ptn_bounds    = null; // cached staff bounds after each render

function ptnGuideColor(hz = ptn_smoothHz) {
  if (!current) return getNotePalette(null).pitch;
  if (!hz) return getNotePalette(current.name).pitch;
  const targetHz = NOTE_FREQS[current.actualName] || NOTE_FREQS[current.name];
  const cents = targetHz ? Math.abs(1200 * Math.log2(hz / targetHz)) : 999;
  return cents <= HIT_THRESHOLD_CENTS ? themeColor('pitch-hit') : getNotePalette(current.name).pitch;
}

// ── Init ──────────────────────────────────────────────────────────────────
function initPlayTheNotes() {}

// ── Start ─────────────────────────────────────────────────────────────────
async function startPlayTheNotes() {
  const micEl  = document.getElementById('mic-status');
  const micTxt = document.getElementById('mic-status-text');

  if (micEl)  { micEl.style.display = 'flex'; micEl.className = 'mic-status'; }
  if (micTxt)   micTxt.textContent = 'Requesting mic…';

  const granted = await startPitchDetection(onPitchFrame);
  if (!granted) {
    if (micEl) micEl.style.display = 'none';
    alert('Microphone access is needed. Please allow mic access and try again.');
    showPregame();
    return;
  }

  if (micEl)  { micEl.className = 'mic-status active'; }
  if (micTxt)   micTxt.textContent = 'Listening…';

  ptn_active    = true;
  ptn_smoothHz  = null;
  ptn_centsHist = [];

  score = 0; streak = 0; timeLeft = gameDuration;
  answered = false; gameActive = true; paused = false;

  document.getElementById('score').textContent  = '0';
  document.getElementById('streak').textContent = '0';
  resetTimerCountdown(gameDuration);

  document.getElementById('pregame-screen').classList.remove('show');
  document.getElementById('active-game').style.display = 'flex';
  document.getElementById('overlay-pause').classList.remove('show');
  document.getElementById('recap-view').classList.remove('show');
  document.getElementById('game-ui').style.display = '';
  document.getElementById('choices').style.display = 'none';
  document.getElementById('feedback').textContent  = '';

  // Tuner hidden — pitch feedback shown via line color instead
  showTuner(false);

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
  showTuner(false);
  const micEl = document.getElementById('mic-status');
  if (micEl) micEl.style.display = 'none';
}

// ── Next question ─────────────────────────────────────────────────────────
async function ptnNextQuestion() {
  answered = false;
  ptn_smoothHz  = null;
  ptn_centsHist = [];
  document.getElementById('feedback').textContent = '';
  const notes = getDrillNotes(clef, keyIndex, window.noteRangeMode);
  current = notes[Math.floor(Math.random() * notes.length)];
  await ptnRenderCurrent();
  removePitchLine();
}

async function ptnRenderCurrent() {
  if (!current) return;
  const container = document.getElementById('staff-osmd');
  await reserveStaffHeight(container, {
    clef,
    keySigIndex: keyIndex,
    rangeMode: window.noteRangeMode,
    showLabels: showNoteNames,
  });
  await renderNotes(container, [{
    name: current.name,
    actualName: current.actualName,
  }], {
    clef, keySigIndex: keyIndex, showLabels: showNoteNames,
  });
  const overlay = document.getElementById('staff-overlay');
  ptn_bounds = notationStaffBounds(container, overlay);
}

// ── Pitch frame ~60fps ────────────────────────────────────────────────────
function onPitchFrame(hz) {
  if (!ptn_active || paused) return;

  // Smooth Hz
  if (hz && ptn_smoothHz) {
    ptn_smoothHz = 0.25 * hz + 0.75 * ptn_smoothHz;
  } else if (hz) {
    ptn_smoothHz = hz;
  } else {
    ptn_smoothHz = null;
  }

  // Update pitch line (with arrow if out of range) — color by proximity
  updatePitchLineOrArrow(ptn_smoothHz, ptnGuideColor(ptn_smoothHz));

  if (!hz || !current) {
    if (ptn_hitTimer) { clearTimeout(ptn_hitTimer); ptn_hitTimer = null; }
    return;
  }

  const targetHz = NOTE_FREQS[current.actualName] || NOTE_FREQS[current.name];
  if (!targetHz) return;

  const cents = 1200 * Math.log2(hz / targetHz);

  if (Math.abs(cents) <= HIT_THRESHOLD_CENTS) {
    if (!ptn_hitTimer) {
      ptn_hitTimer = setTimeout(() => {
        ptn_hitTimer = null;
        onNoteHit();
      }, HIT_HOLD_MS);
    }
  } else {
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
  fb.textContent = '✓ ' + current.name;
  fb.style.color = 'var(--correct-text)';

  const prev = parseInt(localStorage.getItem(bestKey()) || '0');
  if (score > prev) {
    document.getElementById('best').textContent = score;
    showToast('🎯 New high score!');
  }

  playDing();
  flashPitchLineGreen();
  setTimeout(() => { if (ptn_active && gameActive && !paused) ptnNextQuestion(); }, 400);
}

// ── Ding sound on hit ─────────────────────────────────────────────────────
function playDing() {
  if (muted) return;
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1046, ctx.currentTime); // C6
    gain.gain.setValueAtTime(0.4, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.4);
    setTimeout(() => ctx.close(), 500);
  } catch(e) {}
}

// ── Pitch line / arrows ───────────────────────────────────────────────────
function updatePitchLineOrArrow(hz, color) {
  const lineColor = color || themeColor('pitch-default');
  const overlay = document.getElementById('staff-overlay');
  if (!overlay) return;
  notationClearOverlay(overlay);
  if (!hz || !ptn_bounds) return;

  const y = hzToStaffY(hz);
  if (y === null) return;

  const padding = 6;
  const staffHeight = ptn_bounds.botY - ptn_bounds.topY;
  const outerMargin = Math.max(staffHeight * 1.5, 40); // allow ledger-line range
  const centerX = (ptn_bounds.leftX + ptn_bounds.rightX) / 2;

  if (y < ptn_bounds.topY - outerMargin) {
    notationDrawPitchArrow(overlay, {
      direction: 'up', color: lineColor, centerX,
      topY: ptn_bounds.topY, botY: ptn_bounds.botY,
    });
  } else if (y > ptn_bounds.botY + outerMargin) {
    notationDrawPitchArrow(overlay, {
      direction: 'down', color: lineColor, centerX,
      topY: ptn_bounds.topY, botY: ptn_bounds.botY,
    });
  } else {
    const halfWidth = Math.max(40, (ptn_bounds.rightX - ptn_bounds.leftX) / 2 - padding);
    notationDrawPitchLine(overlay, {
      y, color: lineColor,
      x1: centerX - halfWidth,
      x2: centerX + halfWidth,
    });
  }
}

function removePitchLine() {
  const overlay = document.getElementById('staff-overlay');
  notationClearOverlay(overlay);
}

function flashPitchLineGreen() {
  const line = document.getElementById('pitch-line');
  if (!line) return;
  line.setAttribute('stroke', themeColor('pitch-close'));
  setTimeout(() => {
    if (line.parentNode) line.setAttribute('stroke', ptnGuideColor());
  }, 400);
}

// ── Tuner inset ───────────────────────────────────────────────────────────
// Shows a horizontal bar indicating how close you are to the target pitch
// Centre = perfect, left = flat, right = sharp
function showTuner(visible) {
  const el = document.getElementById('ptn-tuner');
  if (el) el.style.display = visible ? 'flex' : 'none';
}

function updateTuner(cents, active) {
  const needle = document.getElementById('ptn-tuner-needle');
  const label  = document.getElementById('ptn-tuner-label');
  if (!needle || !label) return;

  if (!active) {
    needle.style.left = '50%';
    needle.style.background = themeColor('border2');
    label.textContent = '—';
    return;
  }

  // Clamp cents to ±100 for display
  const clamped = Math.max(-100, Math.min(100, cents));
  const pct = 50 + (clamped / 100) * 45; // 5%–95% range
  needle.style.left = pct + '%';

  const absCents = Math.abs(cents);
  if (absCents <= 15) {
    needle.style.background = themeColor('pitch-close');
    label.textContent = '✓';
  } else if (absCents <= HIT_THRESHOLD_CENTS) {
    needle.style.background = themeColor('pitch-hit');
    label.textContent = (cents > 0 ? '+' : '') + Math.round(cents) + '¢';
  } else {
    needle.style.background = themeColor('pitch-default');
    label.textContent = (cents > 0 ? 'Sharp ' : 'Flat ') + Math.abs(Math.round(cents)) + '¢';
  }
}

// ── Hz → staff Y ──────────────────────────────────────────────────────────
// Returns a pixel Y in overlay coordinates (matches ptn_bounds). Uses
// log-frequency interpolation between the lowest and highest drill notes so
// the line tracks chromatic pitch evenly across the rendered staff.
function hzToStaffY(hz) {
  if (!hz || !ptn_bounds) return null;

  const notes = getDrillNotes(clef, keyIndex, window.noteRangeMode);
  const loNote = notes[0];
  const hiNote = notes[notes.length - 1];

  const loHz = NOTE_FREQS[loNote.actualName] || NOTE_FREQS[loNote.name];
  const hiHz = NOTE_FREQS[hiNote.actualName] || NOTE_FREQS[hiNote.name];
  if (!loHz || !hiHz) return notationYForStep(ptn_bounds, 4);

  const logHz = Math.log2(hz);
  const logLo = Math.log2(loHz);
  const logHi = Math.log2(hiHz);
  const t = (logHz - logLo) / (logHi - logLo);

  const yBottom = notationYForStep(ptn_bounds, loNote.step);
  const yTop    = notationYForStep(ptn_bounds, hiNote.step);
  return yBottom + (yTop - yBottom) * t;
}

window.refreshPitchGuideColors = () => {
  if (!ptn_active) return;
  updatePitchLineOrArrow(ptn_smoothHz, ptnGuideColor(ptn_smoothHz));
};

window.ptnRenderCurrent = ptnRenderCurrent;

// Shared with other pitch-based games (Bursts) so they can update the bounds
// used by updatePitchLineOrArrow / hzToStaffY after their own OSMD render.
window.setPitchBounds = (bounds) => { ptn_bounds = bounds; };
