// ── games/bursts.js ───────────────────────────────────────────────────────
// Bursts: 3 random notes appear at once. Play them in order via pitch
// detection. Complete as many bursts as possible before the timer runs out.

const BURSTS_PER_BURST = 3;
const BURSTS_HIT_CENTS = 80;
const BURSTS_REARM_CENTS      = 140;
const BURSTS_REARM_SILENCE_MS = 120;
const BURSTS_HIT_WINDOW_SIZE  = 5;
const BURSTS_HIT_REQUIRED_FRAMES = 2;
const BURSTS_HIT_WINDOW_MAX_MS = 240;

// ── State ─────────────────────────────────────────────────────────────────
let bursts_active   = false;
let bursts_smoothHz = null;
let bursts_hitTimer = null;
let bursts_notes    = [];
let bursts_index    = 0;
let bursts_hitArmed = true;
let bursts_rearmHz  = null;
let bursts_silentAt = 0;
let bursts_hitFrames = [];

function burstsGuideColor(hz = bursts_smoothHz) {
  const target = bursts_notes[bursts_index];
  if (!target) return getNotePalette(null).pitch;
  if (!hz) return getNotePalette(target.name).pitch;
  const targetHz = NOTE_FREQS[target.actualName] || NOTE_FREQS[target.name];
  const cents = targetHz ? Math.abs(1200 * Math.log2(hz / targetHz)) : 999;
  return cents <= BURSTS_HIT_CENTS ? themeColor('pitch-hit') : getNotePalette(target.name).pitch;
}

// Expose to window so main.js applyTheme can redraw on theme change
Object.defineProperties(window, {
  burstNotes: { get: () => bursts_notes },
  burstIndex: { get: () => bursts_index },
});

function initBursts() {}

function burstsClearHitTimer() {
  if (bursts_hitTimer) {
    clearTimeout(bursts_hitTimer);
    bursts_hitTimer = null;
  }
  bursts_hitFrames = [];
}

function burstsRecordHitFrame(inRange) {
  const now = performance.now();
  bursts_hitFrames.push({ inRange, at: now });
  bursts_hitFrames = bursts_hitFrames
    .filter(frame => now - frame.at <= BURSTS_HIT_WINDOW_MAX_MS)
    .slice(-BURSTS_HIT_WINDOW_SIZE);
  return bursts_hitFrames.filter(frame => frame.inRange).length >= BURSTS_HIT_REQUIRED_FRAMES;
}

function burstsMaybeRearm(frame, hz) {
  if (bursts_hitArmed) return true;

  if (frame?.onset) {
    bursts_hitArmed = true;
    bursts_rearmHz = null;
    return true;
  }

  if (!hz) {
    if (!bursts_silentAt) bursts_silentAt = performance.now();
    if (performance.now() - bursts_silentAt >= BURSTS_REARM_SILENCE_MS) {
      bursts_hitArmed = true;
      bursts_rearmHz = null;
    }
    return bursts_hitArmed;
  }

  bursts_silentAt = 0;
  if (!bursts_rearmHz) {
    bursts_hitArmed = true;
    return true;
  }

  const centsFromLastHit = Math.abs(1200 * Math.log2(hz / bursts_rearmHz));
  if (centsFromLastHit >= BURSTS_REARM_CENTS) {
    bursts_hitArmed = true;
    bursts_rearmHz = null;
  }

  return bursts_hitArmed;
}

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
  bursts_hitArmed = true;
  bursts_rearmHz  = null;
  bursts_silentAt = 0;
  bursts_hitFrames = [];

  score = 0; streak = 0; timeLeft = gameDuration;
  answered = false; gameActive = true; paused = false;
  window.lastResult = null;

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
  burstsClearHitTimer();
  removePitchLine();
  showTuner(false);
  const micEl = document.getElementById('mic-status');
  if (micEl) micEl.style.display = 'none';
}

// ── Generate next burst ──────────────────────────────────────────────────
async function burstsNextRound() {
  bursts_smoothHz = null;
  burstsClearHitTimer();

  const pool = getDrillNotes(clef, getActiveDrillKeyIndex(), window.noteRangeMode);
  bursts_notes = [];
  for (let i = 0; i < BURSTS_PER_BURST; i++) {
    bursts_notes.push(pool[Math.floor(Math.random() * pool.length)]);
  }
  bursts_index = 0;
  current = bursts_notes[0];
  document.getElementById('feedback').textContent = '';
  await burstsRenderCurrent();
  removePitchLine();
}

async function burstsRenderCurrent() {
  const container = document.getElementById('staff-osmd');
  if (!container || !bursts_notes.length) return;
  await reserveStaffHeight(container, {
    clef,
    keySigIndex: getActiveDrillKeyIndex(),
    rangeMode: window.noteRangeMode,
    showLabels: false,
    padBeats: 1,
  });
  const notes = bursts_notes.map((n, idx) => ({
    name: n.name,
    actualName: n.actualName,
    state: idx < bursts_index ? 'done' : idx === bursts_index ? 'current' : 'idle',
  }));
  await renderNotes(container, notes, {
    clef,
    keySigIndex: getActiveDrillKeyIndex(),
    padBeats: 1,
  });
  const overlay = document.getElementById('staff-overlay');
  window.setPitchBounds?.(notationStaffBounds(container, overlay));
}

// ── Pitch frame ──────────────────────────────────────────────────────────
function onBurstsPitchFrame(frame) {
  if (!bursts_active || paused) return;
  const pitchFrame = normalizePitchFrame(frame);
  const target = bursts_notes[bursts_index];
  const targetHz = target ? NOTE_FREQS[target.actualName] || NOTE_FREQS[target.name] : null;
  const rawDisplayHz = pitchFrameIsUsable(pitchFrame) ? pitchFrame.hz : null;
  const displayHz = rawDisplayHz && targetHz
    ? pitchHzForTarget(pitchFrame, targetHz, BURSTS_HIT_CENTS)
    : rawDisplayHz;

  if (displayHz && bursts_smoothHz) {
    bursts_smoothHz = 0.25 * displayHz + 0.75 * bursts_smoothHz;
  } else if (displayHz) {
    bursts_smoothHz = displayHz;
  } else {
    bursts_smoothHz = null;
  }

  updatePitchLineOrArrow(bursts_smoothHz, burstsGuideColor(bursts_smoothHz));

  if (!displayHz) {
    burstsMaybeRearm(pitchFrame, null);
    return;
  }

  bursts_silentAt = 0;

  if (!target) {
    burstsClearHitTimer();
    return;
  }

  if (!burstsMaybeRearm(pitchFrame, displayHz)) {
    burstsClearHitTimer();
    return;
  }

  if (!targetHz) return;
  const scoreHz = bursts_smoothHz || pitchHzForTarget(pitchFrame, targetHz, BURSTS_HIT_CENTS);
  const cents = pitchCents(scoreHz, targetHz);

  if (burstsRecordHitFrame(Math.abs(cents) <= BURSTS_HIT_CENTS)) {
    onBurstsNoteHit();
  }
}

function onBurstsNoteHit() {
  if (!bursts_active || !gameActive) return;
  const hitNote = bursts_notes[bursts_index];
  burstsClearHitTimer();
  bursts_hitArmed = false;
  bursts_rearmHz = NOTE_FREQS[hitNote?.actualName] || NOTE_FREQS[hitNote?.name] || null;
  bursts_silentAt = 0;
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
    burstsRenderCurrent(); // shows all 3 as completed
    setTimeout(() => {
      if (bursts_active && gameActive && !paused) burstsNextRound();
    }, 500);
  } else {
    // Advance to the next note in the burst
    current = bursts_notes[bursts_index];
    bursts_smoothHz = null;
    burstsRenderCurrent();
  }
}

window.refreshBurstColors = () => {
  if (!bursts_active) return;
  updatePitchLineOrArrow(bursts_smoothHz, burstsGuideColor(bursts_smoothHz));
};

window.burstsRenderCurrent = burstsRenderCurrent;
