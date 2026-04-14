// ── games/play-the-notes.js ───────────────────────────────────────────────
// Pitch detected → moving line on staff → hold to score
// Features: full guitar range, arrows for out-of-range pitch,
//           tuner inset, ding on hit, note name label, exit/restart

const HIT_THRESHOLD_CENTS = 40;  // tightened from 80 — quarter-tone tolerance
const HIT_HOLD_MS         = 280;

// ── State ─────────────────────────────────────────────────────────────────
let ptn_active    = false;
let ptn_hitTimer  = null;
let ptn_smoothHz  = null;
let ptn_centsHist = []; // rolling window of cents for tuner display

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
  setTimerDisplay(gameDuration);

  const circ = 2 * Math.PI * 27;
  document.getElementById('timer-prog').style.strokeDasharray  = circ;
  document.getElementById('timer-prog').style.strokeDashoffset = '0';
  document.getElementById('timer-prog').className = 'timer-prog';

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
function ptnNextQuestion() {
  answered = false;
  ptn_smoothHz  = null;
  ptn_centsHist = [];
  document.getElementById('feedback').textContent = '';
  const notes = ptnNoteSet();
  current = notes[Math.floor(Math.random() * notes.length)];
  drawStaff(current, { showLabel: showNoteNames }); // respect names toggle
  removePitchLine();
}

// ── Note set for PTN ──────────────────────────────────────────────────────
// Guitar uses GUITAR_GAME_BASE (open-string range, manageable on staff)
function ptnNoteSet() {
  const base = clef === 'guitar'
    ? GUITAR_GAME_BASE   // open-string range: E2–C4
    : clef === 'bass'
    ? BASS_BASE
    : TREBLE_BASE;
  return applyKey(base, KEY_SIGS[keyIndex].acc);
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
  if (ptn_smoothHz && current) {
    const targetHz = NOTE_FREQS[current.actualName] || NOTE_FREQS[current.name];
    const cents = targetHz ? Math.abs(1200 * Math.log2(ptn_smoothHz / targetHz)) : 999;
    const inRange = cents <= HIT_THRESHOLD_CENTS;
    updatePitchLineOrArrow(ptn_smoothHz, inRange ? '#1D9E75' : '#185FA5');
  } else {
    updatePitchLineOrArrow(ptn_smoothHz, '#185FA5');
  }

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
  const lineColor = color || '#185FA5';
  const svg = document.getElementById('staff-overlay');
  if (!svg) return;

  // Remove existing pitch indicators
  ['pitch-line','pitch-arrow'].forEach(id => {
    const el = document.getElementById(id); if (el) el.remove();
  });

  if (!hz) return;

  const rawY = hzToStaffY(hz);
  if (rawY === null) return;

  const ns = 'http://www.w3.org/2000/svg';
  const svgHeight = 130; // matches viewBox "0 0 340 130"
  const margin = 8;

  if (rawY < margin) {
    // Too high — draw upward arrow at top
    drawArrow(svg, ns, 'up', lineColor);
  } else if (rawY > svgHeight - margin) {
    // Too low — draw downward arrow at bottom
    drawArrow(svg, ns, 'down', lineColor);
  } else {
    // In range — draw the line
    const line = document.createElementNS(ns, 'line');
    line.setAttribute('id', 'pitch-line');
    line.setAttribute('x1', '40'); line.setAttribute('x2', '320');
    line.setAttribute('y1', rawY); line.setAttribute('y2', rawY);
    line.setAttribute('stroke', lineColor);
    line.setAttribute('stroke-width', '2.5');
    line.setAttribute('stroke-linecap', 'round');
    line.setAttribute('opacity', '0.9');
    svg.appendChild(line);
  }
}

function drawArrow(svg, ns, direction, color) {
  const arrowColor = color || '#185FA5';
  const arrow = document.createElementNS(ns, 'polygon');
  arrow.setAttribute('id', 'pitch-arrow');
  arrow.setAttribute('fill', arrowColor);
  arrow.setAttribute('opacity', '0.85');
  const cx = 180, size = 10;
  if (direction === 'up') {
    // Triangle pointing up at top of SVG
    arrow.setAttribute('points', `${cx},6 ${cx-size},18 ${cx+size},18`);
  } else {
    // Triangle pointing down at bottom of SVG
    arrow.setAttribute('points', `${cx},124 ${cx-size},112 ${cx+size},112`);
  }
  svg.appendChild(arrow);
}

function removePitchLine() {
  ['pitch-line','pitch-arrow'].forEach(id => {
    const el = document.getElementById(id); if (el) el.remove();
  });
}

function flashPitchLineGreen() {
  const line = document.getElementById('pitch-line');
  if (!line) return;
  line.setAttribute('stroke', '#3B6D11');
  setTimeout(() => { if (line.parentNode) line.setAttribute('stroke', '#185FA5'); }, 400);
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
    needle.style.background = 'var(--border2)';
    label.textContent = '—';
    return;
  }

  // Clamp cents to ±100 for display
  const clamped = Math.max(-100, Math.min(100, cents));
  const pct = 50 + (clamped / 100) * 45; // 5%–95% range
  needle.style.left = pct + '%';

  const absCents = Math.abs(cents);
  if (absCents <= 15) {
    needle.style.background = '#3B6D11'; // green — very close
    label.textContent = '✓';
  } else if (absCents <= HIT_THRESHOLD_CENTS) {
    needle.style.background = '#1D9E75'; // teal — in range
    label.textContent = (cents > 0 ? '+' : '') + Math.round(cents) + '¢';
  } else {
    needle.style.background = '#185FA5'; // blue — out of range
    label.textContent = (cents > 0 ? 'Sharp ' : 'Flat ') + Math.abs(Math.round(cents)) + '¢';
  }
}

// ── Hz → staff Y ──────────────────────────────────────────────────────────
// Uses VexFlow's reported geometry (window.staffGeometry set in drawStaff)
function hzToStaffY(hz) {
  if (!hz) return null;

  const geo     = window.staffGeometry;
  const topLine = geo ? geo.topLineY : 18;
  const gap     = geo ? geo.lineGap  : 10;

  const base   = clef === 'guitar' ? GUITAR_BASE : clef === 'bass' ? BASS_BASE : TREBLE_BASE;
  const notes  = applyKey(base, KEY_SIGS[keyIndex].acc);
  const loNote = notes[0];
  const hiNote = notes[notes.length - 1];

  const loHz = NOTE_FREQS[loNote.actualName] || NOTE_FREQS[loNote.name];
  const hiHz = NOTE_FREQS[hiNote.actualName] || NOTE_FREQS[hiNote.name];
  if (!loHz || !hiHz) return topLine + 4 * gap;

  const logHz = Math.log2(hz);
  const logLo = Math.log2(loHz);
  const logHi = Math.log2(hiHz);

  const t = (logHz - logLo) / (logHi - logLo);

  const yBottom = topLine + 4 * gap - loNote.step * (gap / 2);
  const yTop    = topLine + 4 * gap - hiNote.step * (gap / 2);
  return yBottom + (yTop - yBottom) * t;
}
