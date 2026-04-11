// ── games/play-the-notes.js ───────────────────────────────────────────────
// Handles: Play the Notes game mode — sing or play your instrument,
//          microphone detects pitch, moving line shows real-time feedback
// Depends on: staff.js, audio/pitch.js, main.js helpers
//
// STATUS: Scaffold — pregame wired up, gameplay coming next session

// ── Constants ─────────────────────────────────────────────────────────────
// How close (in cents) the player needs to be to register a hit
const HIT_THRESHOLD_CENTS = 50;

// How long (ms) the player must hold the correct pitch to advance
const HIT_HOLD_MS = 300;

// ── State ─────────────────────────────────────────────────────────────────
let ptn_active     = false;  // is this game mode currently running?
let ptn_hitTimer   = null;   // setTimeout handle for hold detection
let ptn_currentHz  = null;   // latest detected frequency

// ── Init (called once on page load) ──────────────────────────────────────
function initPlayTheNotes() {
  // Nothing to set up yet — mic is requested on first Play tap
}

// ── Start game ────────────────────────────────────────────────────────────
async function startPlayTheNotes() {
  // Hide note buttons — pitch is the input
  document.getElementById('choices').style.display = 'none';

  // Show mic status indicator
  const micEl = document.getElementById('mic-status');
  if (micEl) { micEl.style.display = 'flex'; micEl.className = 'mic-status'; }
  document.getElementById('mic-status-text').textContent = 'Requesting mic…';

  const granted = await startPitchDetection(onPitchFrame);
  if (!granted) {
    if (micEl) micEl.style.display = 'none';
    alert('Microphone access is needed to play. Please allow mic access and try again.');
    showPregame();
    return;
  }

  if (micEl) {
    micEl.className = 'mic-status active';
    document.getElementById('mic-status-text').textContent = 'Listening…';
  }

  ptn_active = true;

  // Reuse the shared game start infrastructure
  score = 0; streak = 0; timeLeft = gameDuration;
  answered = false; gameActive = true; paused = false;

  document.getElementById('score').textContent = '0';
  document.getElementById('streak').textContent = '0';
  setTimerDisplay(gameDuration);

  const circ = 2 * Math.PI * 27;
  document.getElementById('timer-prog').style.strokeDasharray = circ;
  document.getElementById('timer-prog').style.strokeDashoffset = '0';
  document.getElementById('timer-prog').className = 'timer-prog';

  document.getElementById('pregame-screen').classList.remove('show');
  document.getElementById('active-game').style.display = 'flex';
  document.getElementById('overlay-pause').classList.remove('show');
  document.getElementById('recap-view').classList.remove('show');
  document.getElementById('game-ui').style.display = '';
  document.getElementById('feedback').textContent = '';

  setTimerIcon('pause');
  loadBest();
  nextQuestion(); // shows first note on staff
  clearInterval(timerInterval);
  timerInterval = setInterval(tick, 1000);
}

// ── Stop game ─────────────────────────────────────────────────────────────
function stopPlayTheNotes() {
  ptn_active = false;
  stopPitchDetection();
  if (ptn_hitTimer) { clearTimeout(ptn_hitTimer); ptn_hitTimer = null; }
  removePitchLine();
  const micEl = document.getElementById('mic-status');
  if (micEl) micEl.style.display = 'none';
}

// ── Pitch frame callback ──────────────────────────────────────────────────
// Called ~60fps by pitch.js with the detected frequency in Hz (or null)
function onPitchFrame(hz) {
  if (!ptn_active) return;
  ptn_currentHz = hz;

  if (!hz) {
    // No pitch detected — move line off screen or hide it
    updatePitchLine(null);
    return;
  }

  // Convert Hz to a staff y-position and move the line
  const y = hzToStaffY(hz);
  updatePitchLine(y);

  // Check if close enough to the target note
  if (current) {
    const targetHz = NOTE_FREQS[current.actualName];
    if (targetHz) {
      const cents = 1200 * Math.log2(hz / targetHz); // cents from target
      if (Math.abs(cents) <= HIT_THRESHOLD_CENTS) {
        onPitchMatch();
      } else {
        clearTimeout(ptn_hitTimer);
        ptn_hitTimer = null;
      }
    }
  }
}

// ── Pitch line SVG overlay ────────────────────────────────────────────────
// A horizontal blue line that moves up/down the staff tracking live pitch
const PITCH_LINE_ID = 'pitch-line';

function updatePitchLine(y) {
  const svg = document.getElementById('staff-svg');
  if (!svg) return;
  let line = document.getElementById(PITCH_LINE_ID);
  if (y === null) {
    if (line) line.style.opacity = '0';
    return;
  }
  if (!line) {
    const ns = 'http://www.w3.org/2000/svg';
    line = document.createElementNS(ns, 'line');
    line.setAttribute('id', PITCH_LINE_ID);
    line.setAttribute('x1', '40');
    line.setAttribute('x2', '300');
    line.setAttribute('stroke', '#185FA5');
    line.setAttribute('stroke-width', '2');
    line.setAttribute('stroke-linecap', 'round');
    line.setAttribute('opacity', '0.85');
    svg.appendChild(line);
  }
  line.setAttribute('y1', y);
  line.setAttribute('y2', y);
  line.style.opacity = '1';
  // Smooth transition via CSS (add to styles.css: #pitch-line { transition: y 0.05s; })
}

function removePitchLine() {
  const line = document.getElementById(PITCH_LINE_ID);
  if (line) line.remove();
}

// ── Convert Hz to SVG y coordinate on the staff ───────────────────────────
// Maps the playable frequency range to staff y positions
function hzToStaffY(hz) {
  // Get the note set for the current clef
  const base = clef === 'bass'
    ? BASS_BASE
    : clef === 'guitar'
    ? GUITAR_BASE
    : TREBLE_BASE;
  const notes = applyKey(base, KEY_SIGS[keyIndex].acc);

  // Bottom note step=0 → topLine + 4*gap, top note step=8 → topLine - gap
  const topLine = 25, gap = 12;
  const lowestFreq  = NOTE_FREQS[notes[0].actualName] || NOTE_FREQS[notes[0].name];
  const highestFreq = NOTE_FREQS[notes[notes.length-1].actualName] || NOTE_FREQS[notes[notes.length-1].name];

  if (!lowestFreq || !highestFreq) return topLine + 4 * gap;

  // Log scale interpolation — musical pitch is logarithmic
  const logHz   = Math.log2(Math.max(hz, lowestFreq));
  const logLow  = Math.log2(lowestFreq);
  const logHigh = Math.log2(highestFreq);
  const t = (logHz - logLow) / (logHigh - logLow); // 0 = bottom, 1 = top

  const yBottom = noteYPos(0, topLine, gap);
  const yTop    = noteYPos(8, topLine, gap);
  return yBottom + (yTop - yBottom) * Math.min(Math.max(t, 0), 1);
}

// ── Hit detection ─────────────────────────────────────────────────────────
// Called when pitch is within threshold — start hold timer
function onPitchMatch() {
  if (ptn_hitTimer) return; // already counting
  ptn_hitTimer = setTimeout(() => {
    ptn_hitTimer = null;
    onNoteHit();
  }, HIT_HOLD_MS);
}

// ── Note successfully matched ─────────────────────────────────────────────
// Called after holding the correct pitch for HIT_HOLD_MS
function onNoteHit() {
  if (!ptn_active) return;
  // Flash pitch line and note green, then advance
  flashGreen();
  setTimeout(() => {
    if (ptn_active) nextQuestion(); // reuses name-the-notes nextQuestion
  }, 400);
}

// ── Flash pitch line and note green on success ────────────────────────────
function flashGreen() {
  const line = document.getElementById(PITCH_LINE_ID);
  if (line) {
    line.setAttribute('stroke', '#3B6D11');
    setTimeout(() => line && line.setAttribute('stroke', '#185FA5'), 400);
  }
  // TODO: also tint the note head green — needs a reference to the note ellipse
}
