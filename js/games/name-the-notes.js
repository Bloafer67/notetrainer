// ── games/name-the-notes.js ───────────────────────────────────────────────
// Handles: all Name the Notes game state and logic
// Depends on: KEY_SIGS, TREBLE_BASE, BASS_BASE, GUITAR_BASE, applyKey (staff.js)
//             drawStaff (staff.js), playNote (audio/synth.js)
//             showToast, showAnswerToast, setTimerIcon, setTimerDisplay,
//             toMMSS, showPregame (main.js)
//             saveToLeaderboard, fetchLeaderboard (leaderboard.js)

// ── Game state ────────────────────────────────────────────────────────────
// These are on window so main.js and other modules can read them
// (e.g. goHome needs to know if gameActive)
let clef         = 'treble';
let keyIndex     = 0;
let gameDuration = 60;  // set from duration-select on init
let score        = 0;
let streak       = 0;
let current      = null;  // the current note object { name, step, actualName }
let answered     = false;
let timeLeft     = 60;
let timerInterval = null;
let gameActive   = false;
let paused       = false;
let lastScore    = 0;

// Expose to window so main.js can reference them
Object.defineProperties(window, {
  gameActive:    { get: () => gameActive,    set: v => { gameActive = v; } },
  paused:        { get: () => paused,        set: v => { paused = v; } },
  timerInterval: { get: () => timerInterval, set: v => { timerInterval = v; } },
  current:       { get: () => current },
});

// ── Setup controls ────────────────────────────────────────────────────────
function initNameTheNotes() {
  // Populate key selector
  const ks = document.getElementById('key-select');
  KEY_SIGS.forEach((k, i) => {
    const o = document.createElement('option');
    o.value = i; o.textContent = k.label;
    ks.appendChild(o);
  });
  gameDuration = parseInt(document.getElementById('duration-select').value);
}

function bestKey() {
  return 'mntr3-best-' + KEY_SIGS[keyIndex].short + '-' + clef;
}

function loadBest() {
  const b = parseInt(localStorage.getItem(bestKey()) || '0');
  const el = document.getElementById('best');
  if (el) el.textContent = b > 0 ? b : '—';
  return b;
}

function onKeyChange() {
  keyIndex = parseInt(document.getElementById('key-select').value);
  loadBest();
  if (gameActive && !paused) nextQuestion();
}

function onClefChange() {
  clef = document.getElementById('clef-select').value;
  loadBest();
  if (gameActive && !paused) nextQuestion();
}

function onDurationChange() {
  gameDuration = parseInt(document.getElementById('duration-select').value);
}

// ── Timer tap (pause / resume) ────────────────────────────────────────────
function timerTap() {
  if (gameActive) togglePause();
}

function togglePause() {
  if (!gameActive) return;
  paused = !paused;
  if (paused) {
    clearInterval(timerInterval);
    document.getElementById('overlay-pause').classList.add('show');
    document.getElementById('choices').style.display = 'none';
    setTimerIcon('play');
  } else {
    document.getElementById('overlay-pause').classList.remove('show');
    document.getElementById('choices').style.display = 'grid';
    setTimerIcon('pause');
    timerInterval = setInterval(tick, 1000);
  }
}

// ── Start game ────────────────────────────────────────────────────────────
function startGame() {
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
  document.getElementById('choices').style.display = 'grid';
  document.getElementById('feedback').textContent = '';

  setTimerIcon('pause');

  const saveBtn = document.getElementById('save-btn');
  saveBtn.textContent = 'Save';
  saveBtn.disabled = false;
  saveBtn.onclick = saveToLeaderboard;

  loadBest();
  nextQuestion();
  clearInterval(timerInterval);
  timerInterval = setInterval(tick, 1000);
}

// ── Timer tick ────────────────────────────────────────────────────────────
function tick() {
  timeLeft--;
  setTimerDisplay(timeLeft);
  const circ = 2 * Math.PI * 27;
  document.getElementById('timer-prog').style.strokeDasharray = circ;
  document.getElementById('timer-prog').style.strokeDashoffset =
    circ * (1 - timeLeft / gameDuration);
  if (timeLeft <= 10) {
    document.getElementById('timer-prog').className = 'timer-prog warning';
  }
  if (timeLeft <= 0) endGame();
}

// ── End game ──────────────────────────────────────────────────────────────
function endGame() {
  clearInterval(timerInterval);
  gameActive = false; paused = false;
  lastScore = score;
  setTimerIcon('play');

  document.getElementById('active-game').style.display = 'none';
  document.getElementById('overlay-pause').classList.remove('show');

  const prev  = parseInt(localStorage.getItem(bestKey()) || '0');
  const isNew = lastScore > prev;
  if (isNew) localStorage.setItem(bestKey(), lastScore);

  document.getElementById('recap-score').textContent = lastScore;
  document.getElementById('recap-sub-line').textContent =
    (lastScore === 1 ? 'Note' : 'Notes') + ' in ' + gameDuration + ' seconds';
  document.getElementById('recap-streak-line').textContent =
    'Best streak: ' + streak;
  document.getElementById('recap-new-best').style.display =
    (isNew && lastScore > 0) ? 'block' : 'none';

  const savedName = localStorage.getItem('mntr-playername') || '';
  document.getElementById('player-name').value = savedName;
  const saveBtn = document.getElementById('save-btn');
  saveBtn.textContent = 'Save';
  saveBtn.disabled = false;
  saveBtn.onclick = saveToLeaderboard;

  document.getElementById('recap-view').classList.add('show');
  loadBest();
  setTimeout(launchConfetti, 150);
}

// ── Note question logic ───────────────────────────────────────────────────
function noteSet() {
  const base = clef === 'bass'
    ? BASS_BASE
    : clef === 'guitar'
    ? GUITAR_BASE
    : TREBLE_BASE;
  return applyKey(base, KEY_SIGS[keyIndex].acc);
}

function nextQuestion() {
  answered = false;
  document.getElementById('feedback').textContent = '';
  const notes = noteSet();
  current = notes[Math.floor(Math.random() * notes.length)];
  drawStaff(current);
  buildChoices(current, notes);
  playNote(current.actualName);
}

function buildChoices(correct, notes) {
  const pool = notes
    .filter(n => n.name !== correct.name)
    .sort(() => Math.random() - 0.5)
    .slice(0, 3);
  const opts = [...pool, correct].sort(() => Math.random() - 0.5);
  const c = document.getElementById('choices');
  c.innerHTML = '';
  opts.forEach(note => {
    const btn = document.createElement('button');
    btn.className = 'choice-btn';
    btn.textContent = note.name;
    btn.dataset.name = note.name;
    btn.onclick = () => checkAnswer(note.name, btn);
    c.appendChild(btn);
  });
}

function checkAnswer(chosen, btn) {
  if (answered) return;
  answered = true;
  document.querySelectorAll('.choice-btn').forEach(b => b.disabled = true);
  const fb = document.getElementById('feedback');

  if (chosen === current.name) {
    btn.classList.add('correct');
    score++;
    streak++;
    document.getElementById('score').textContent = score;
    document.getElementById('streak').textContent = streak;
    fb.textContent = '✓ Correct!';
    fb.style.color = 'var(--correct-text)';
    showAnswerToast('✓', true);
    // Flash new best
    const prev = parseInt(localStorage.getItem(bestKey()) || '0');
    if (score > prev) {
      document.getElementById('best').textContent = score;
      showToast('New high score!');
    }
  } else {
    btn.classList.add('wrong');
    streak = 0;
    document.getElementById('streak').textContent = '0';
    fb.textContent = 'Not quite — it was ' + current.name + '.';
    fb.style.color = 'var(--wrong-text)';
    showAnswerToast(current.name, false);
  }

  setTimeout(() => { if (gameActive && !paused) nextQuestion(); }, 600);
}

// ── Confetti ──────────────────────────────────────────────────────────────
function launchConfetti() {
  const canvas = document.getElementById('recap-confetti');
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;
  const ctx = canvas.getContext('2d');
  const colors = ['#1D9E75','#5DCAA5','#185FA5','#EF9F27','#E24B4A','#f1efe8','#FAC775'];
  const pieces = Array.from({ length: 100 }, () => ({
    x:    Math.random() * canvas.width,
    y:    Math.random() * -200 - 10,
    r:    Math.random() * 7 + 3,
    c:    colors[Math.floor(Math.random() * colors.length)],
    vx:   (Math.random() - 0.5) * 4,
    vy:   Math.random() * 4 + 2,
    rot:  Math.random() * 360,
    vrot: (Math.random() - 0.5) * 10,
  }));
  let frame, elapsed = 0;
  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    pieces.forEach(p => {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot * Math.PI / 180);
      ctx.fillStyle = p.c;
      ctx.fillRect(-p.r, -p.r / 2, p.r * 2, p.r);
      ctx.restore();
      p.x += p.vx; p.y += p.vy; p.rot += p.vrot;
    });
    elapsed++;
    if (elapsed < 120) frame = requestAnimationFrame(draw);
    else ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
  if (frame) cancelAnimationFrame(frame);
  draw();
}

// ── Share ─────────────────────────────────────────────────────────────────
function shareScore() {
  const clefLabel = clef === 'guitar'
    ? 'Guitar (8vb)'
    : clef.charAt(0).toUpperCase() + clef.slice(1);
  const text = `🎼 Name the Notes\n⭐ ${lastScore} notes in ${gameDuration}s\n${KEY_SIGS[keyIndex].label} · ${clefLabel}\nhttps://notetrainer-eight.vercel.app`;
  if (navigator.share) {
    navigator.share({ text }).catch(() => {});
  } else {
    navigator.clipboard.writeText(text).then(() => showToast('Copied!'));
  }
}
