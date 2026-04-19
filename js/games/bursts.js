// ── games/bursts.js ───────────────────────────────────────────────────────
// Bursts: 3 random notes appear at once. Play them in order via pitch
// detection. Complete as many bursts as possible before the timer runs out.

const BURSTS_PER_BURST = 3;
const BURSTS_HIT_CENTS = 80;
const BURSTS_HOLD_MS   = 280;

// ── State ─────────────────────────────────────────────────────────────────
let bursts_active   = false;
let bursts_smoothHz = null;
let bursts_hitTimer = null;
let bursts_notes    = [];
let bursts_index    = 0;

function burstsGuideColor(hz = bursts_smoothHz) {
  const target = bursts_notes[bursts_index];
  if (!target) return getNotePalette(null).pitch;
  if (!hz) return getNotePalette(target.name).pitch;
  const targetHz = NOTE_FREQS[target.actualName] || NOTE_FREQS[target.name];
  const cents = targetHz ? Math.abs(1200 * Math.log2(hz / targetHz)) : 999;
  return cents <= BURSTS_HIT_CENTS ? '#1D9E75' : getNotePalette(target.name).pitch;
}

// Expose to window so main.js applyTheme can redraw on theme change
Object.defineProperties(window, {
  burstNotes: { get: () => bursts_notes },
  burstIndex: { get: () => bursts_index },
});

function initBursts() {}

// ── Start ─────────────────────────────────────────────────────────────────
async function startBursts() {
  const micEl  = document.getElementById('mic-status');
  const micTxt = document.getElementById('mic-status-text');
  if (micEl)  { micEl.style.display = 'flex'; micEl.className = 'mic-status'; }
  if (micTxt)   micTxt.textContent = 'Requesting mic…';

  const granted = await startPitchDetection(onBurstsPitchFrame);
  if (!granted) {
    if (micEl) micEl.style.display = 'none';
    alert('Microphone access is needed. Please allow mic access and try again.');
    showPregame();
    return;
  }

  if (micEl)  { micEl.className = 'mic-status active'; }
  if (micTxt)   micTxt.textContent = 'Listening…';

  bursts_active   = true;
  bursts_smoothHz = null;

  score = 0; streak = 0; timeLeft = gameDuration;
  answered = false; gameActive = true; paused = false;
  window.lastResult = null;

  document.getElementById('score').textContent  = '0';
  document.getElementById('streak').textContent = '0';
  setTimerDisplay(gameDuration);

  const circ = 2 * Math.PI * 27;
  const prog = document.getElementById('timer-prog');
  prog.style.strokeDasharray  = circ;
  prog.style.strokeDashoffset = '0';
  prog.style.stroke = '';
  prog.className = 'timer-prog';

  document.getElementById('pregame-screen').classList.remove('show');
  document.getElementById('active-game').style.display = 'flex';
  document.getElementById('overlay-pause').classList.remove('show');
  document.getElementById('recap-view').classList.remove('show');
  document.getElementById('game-ui').style.display = '';
  document.getElementById('choices').style.display = 'none';
  document.getElementById('feedback').textContent  = '';

  showTuner(false);
  setTimerIcon('pause');
  loadBest();
  burstsNextRound();

  clearInterval(timerInterval);
  timerInterval = setInterval(tick, 1000);
}

function stopBursts() {
  bursts_active = false;
  stopPitchDetection();
  if (bursts_hitTimer) { clearTimeout(bursts_hitTimer); bursts_hitTimer = null; }
  removePitchLine();
  showTuner(false);
  const micEl = document.getElementById('mic-status');
  if (micEl) micEl.style.display = 'none';
}

// ── Generate next burst ──────────────────────────────────────────────────
function burstsNextRound() {
  bursts_smoothHz = null;
  if (bursts_hitTimer) { clearTimeout(bursts_hitTimer); bursts_hitTimer = null; }

  const pool = getDrillNotes(clef, keyIndex, window.noteRangeMode);
  bursts_notes = [];
  for (let i = 0; i < BURSTS_PER_BURST; i++) {
    bursts_notes.push(pool[Math.floor(Math.random() * pool.length)]);
  }
  bursts_index = 0;
  current = bursts_notes[0];
  document.getElementById('feedback').textContent = '';
  drawBurst(bursts_notes, bursts_index);
  removePitchLine();
}

// ── Pitch frame ──────────────────────────────────────────────────────────
function onBurstsPitchFrame(hz) {
  if (!bursts_active || paused) return;

  if (hz && bursts_smoothHz) {
    bursts_smoothHz = 0.25 * hz + 0.75 * bursts_smoothHz;
  } else if (hz) {
    bursts_smoothHz = hz;
  } else {
    bursts_smoothHz = null;
  }

  const target = bursts_notes[bursts_index];
  updatePitchLineOrArrow(bursts_smoothHz, burstsGuideColor(bursts_smoothHz));

  if (!hz || !target) {
    if (bursts_hitTimer) { clearTimeout(bursts_hitTimer); bursts_hitTimer = null; }
    return;
  }

  const targetHz = NOTE_FREQS[target.actualName] || NOTE_FREQS[target.name];
  if (!targetHz) return;
  const cents = 1200 * Math.log2(hz / targetHz);

  if (Math.abs(cents) <= BURSTS_HIT_CENTS) {
    if (!bursts_hitTimer) {
      bursts_hitTimer = setTimeout(() => {
        bursts_hitTimer = null;
        onBurstsNoteHit();
      }, BURSTS_HOLD_MS);
    }
  } else {
    if (bursts_hitTimer) { clearTimeout(bursts_hitTimer); bursts_hitTimer = null; }
  }
}

function onBurstsNoteHit() {
  if (!bursts_active || !gameActive) return;
  flashPitchLineGreen();

  bursts_index++;
  if (bursts_index >= bursts_notes.length) {
    // Burst complete!
    score++;
    streak++;
    document.getElementById('score').textContent  = score;
    document.getElementById('streak').textContent = streak;

    const fb = document.getElementById('feedback');
    fb.textContent = '✓ Burst complete!';
    fb.style.color = 'var(--correct-text)';

    const prev = parseInt(localStorage.getItem(bestKey()) || '0');
    if (score > prev) {
      document.getElementById('best').textContent = score;
      showToast('🎯 New high score!');
    }

    playDing();
    drawBurst(bursts_notes, bursts_index); // shows all 3 as completed
    setTimeout(() => {
      if (bursts_active && gameActive && !paused) burstsNextRound();
    }, 500);
  } else {
    // Advance to the next note in the burst
    current = bursts_notes[bursts_index];
    drawBurst(bursts_notes, bursts_index);
  }
}

window.refreshBurstColors = () => {
  if (!bursts_active) return;
  updatePitchLineOrArrow(bursts_smoothHz, burstsGuideColor(bursts_smoothHz));
};
