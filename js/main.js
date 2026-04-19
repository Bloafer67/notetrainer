// ── main.js ──────────────────────────────────────────────────────────────
// Handles: theme, mute, tabs, navigation, shared UI helpers
// All other modules import from here via the global window object
// (no bundler needed — plain script tags in order)

// ── Theme ─────────────────────────────────────────────────────────────────
let darkMode = localStorage.getItem('mntr-dark') === '1';
let boomwhackerMode = localStorage.getItem('mntr-boomwhacker') === '1';

function refreshNotationColors() {
  if (window.gameMode === 'bursts' && window.burstNotes?.length) {
    drawBurst(window.burstNotes, window.burstIndex || 0);
  } else if (window.current) {
    drawStaff(window.current, {
      showLabel: showNoteNames && window.gameMode === 'play-the-notes',
    });
  }
  window.refreshChoiceButtonColors?.();
  window.refreshPitchGuideColors?.();
  window.refreshPlayAlongPitchColors?.();
  window.refreshBurstColors?.();
}

function applyTheme() {
  document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light');
  setThemeIcon();
  updateBoomwhackerBtn();
  refreshNotationColors();
}

function toggleDark() {
  darkMode = !darkMode;
  localStorage.setItem('mntr-dark', darkMode ? '1' : '0');
  applyTheme();
}

function toggleBoomwhackerMode() {
  boomwhackerMode = !boomwhackerMode;
  localStorage.setItem('mntr-boomwhacker', boomwhackerMode ? '1' : '0');
  updateBoomwhackerBtn();
  refreshNotationColors();
}

// ── Mute ──────────────────────────────────────────────────────────────────
let muted = localStorage.getItem('mntr-muted') === null
  ? true
  : localStorage.getItem('mntr-muted') === '1';

function toggleMute() {
  muted = !muted;
  localStorage.setItem('mntr-muted', muted ? '1' : '0');
  setMuteIcon();
}

// ── Note names toggle ─────────────────────────────────────────────────────
let showNoteNames = localStorage.getItem('mntr-show-names') !== '0'; // default ON
window.lastResult = null;
window.lastPlayAlongSongKey = 'dinks-song';

function toggleNoteNames() {
  showNoteNames = !showNoteNames;
  localStorage.setItem('mntr-show-names', showNoteNames ? '1' : '0');
  updateNoteNamesBtn();
  // Re-draw current note if in PTN to immediately apply change
  if (window.current && window.gameMode === 'play-the-notes') {
    drawStaff(window.current, { showLabel: showNoteNames });
  }
}

function updateNoteNamesBtn() {
  const btn = document.getElementById('note-names-toggle');
  if (!btn) return;
  btn.textContent = showNoteNames ? 'Names: on' : 'Names: off';
  btn.classList.toggle('hidden', !showNoteNames);
  // Toggle only affects Play the Notes — hide it in other modes
  btn.style.display = gameMode === 'play-the-notes' ? '' : 'none';
}

function updateBoomwhackerBtn() {
  const btn = document.getElementById('boomwhacker-toggle');
  if (!btn) return;
  btn.classList.toggle('active', boomwhackerMode);
  btn.setAttribute('aria-pressed', boomwhackerMode ? 'true' : 'false');
  btn.title = boomwhackerMode ? 'Boomwhacker colors: on' : 'Boomwhacker colors: off';
  setBoomwhackerIcon();
}

// ── Range toggle ───────────────────────────────────────────────────────────
let noteRangeMode = localStorage.getItem('mntr-note-range') === 'full-range'
  ? 'full-range'
  : 'staff-only';

function onRangeModeChange() {
  const select = document.getElementById('range-select');
  if (!select) return;
  noteRangeMode = select.value === 'full-range' ? 'full-range' : 'staff-only';
  localStorage.setItem('mntr-note-range', noteRangeMode);
}

function syncRangeModeSelect() {
  const select = document.getElementById('range-select');
  if (!select) return;
  select.value = noteRangeMode;
  window.refreshCustomSelect?.(select);
}

// ── Icon helpers ──────────────────────────────────────────────────────────
const ICON_SOUND_ON = `<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>`;
const ICON_MUTED    = `<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/>`;
const ICON_MOON     = `<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>`;
const ICON_SUN      = `<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>`;
const ICON_BOOMWHACKER_OFF = `<circle cx="12" cy="12" r="6.5"/><path d="M12 5.5a6.5 6.5 0 0 0 0 13"/>`;
const ICON_BOOMWHACKER_ON  = `<circle cx="9" cy="10" r="4.25"/><circle cx="15" cy="10" r="4.25"/><circle cx="12" cy="15" r="4.25"/>`;

function setMuteIcon() {
  document.getElementById('mute-icon').innerHTML = muted ? ICON_MUTED : ICON_SOUND_ON;
}
function setThemeIcon() {
  document.getElementById('theme-icon').innerHTML = darkMode ? ICON_SUN : ICON_MOON;
}
function setBoomwhackerIcon() {
  const icon = document.getElementById('boomwhacker-icon');
  if (!icon) return;
  icon.innerHTML = boomwhackerMode ? ICON_BOOMWHACKER_ON : ICON_BOOMWHACKER_OFF;
}

// ── Tabs ──────────────────────────────────────────────────────────────────
function switchTab(name) {
  // Pause the game if switching away mid-round
  if (name === 'leaderboard' && window.gameActive && !window.paused) togglePause();
  document.querySelectorAll('.tab-btn').forEach((b, i) => {
    b.classList.toggle('active', ['game', 'leaderboard'][i] === name);
  });
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  document.getElementById('tab-' + name).classList.add('active');
  if (name === 'leaderboard') fetchLeaderboard();
}

// ── Game mode ─────────────────────────────────────────────────────────────
// 'name-the-notes' | 'play-the-notes' | 'play-along'
let gameMode = 'name-the-notes';

const GAME_MODE_CONFIG = {
  'name-the-notes': { emoji: '🎼', pregameId: 'pregame-ntn'    },
  'play-the-notes': { emoji: '🎸', pregameId: 'pregame-ptn'    },
  'play-along':     { emoji: '🎵', pregameId: 'pregame-pa'     },
  'bursts':         { emoji: '💥', pregameId: 'pregame-bursts' },
};

function onGameModeChange() {
  const select = document.getElementById('game-mode-select');
  gameMode = select.value;
  const cfg = GAME_MODE_CONFIG[gameMode];

  // Swap emoji
  document.getElementById('game-mode-emoji').textContent = cfg.emoji;

  // Default to Guitar (8vb) for pitch-based modes
  if (gameMode === 'play-the-notes' || gameMode === 'play-along' || gameMode === 'bursts') {
    document.getElementById('clef-select').value = 'guitar';
    window.refreshCustomSelect?.(document.getElementById('clef-select'));
    clef = 'guitar';
  }

  // Show/hide the standard key/clef/duration selectors
  const stdSelectors = document.getElementById('pregame-selectors-wrap');
  const paSelectors  = document.getElementById('pa-pregame-selectors');
  if (stdSelectors) stdSelectors.style.display = gameMode === 'play-along' ? 'none' : '';
  if (paSelectors)  paSelectors.style.display  = gameMode === 'play-along' ? 'flex' : 'none';

  // Swap pregame description
  Object.values(GAME_MODE_CONFIG).forEach(c => {
    document.getElementById(c.pregameId).style.display = 'none';
  });
  document.getElementById(cfg.pregameId).style.display = '';

  // Update URL
  const slugMap = {
    'name-the-notes': '/name-the-notes',
    'play-the-notes': '/play-the-notes',
    'play-along':     '/play-along',
    'bursts':         '/bursts',
  };
  switchTab('game');
  showPregame();

  try {
    history.pushState({ gameMode }, '', slugMap[gameMode] || '/');
  } catch (e) {
    // pushState can throw on file:// URLs — safe to ignore for local testing
  }
}

// ── Navigation ────────────────────────────────────────────────────────────
function goHome() {
  if (window.gameActive) {
    clearInterval(window.timerInterval);
    window.gameActive = false;
    window.paused = false;
  }
  switchTab('game');
  showPregame();
}

// ── Shared toast ──────────────────────────────────────────────────────────
function showToast(msg) {
  const t = document.getElementById('hs-toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2000);
}

// ── Answer toast ──────────────────────────────────────────────────────────
let answerToastTimer = null;
function showAnswerToast(text, isCorrect) {
  const t = document.getElementById('answer-toast');
  t.textContent = text;
  t.className = 'answer-toast' + (isCorrect ? '' : ' wrong');
  t.classList.add('show');
  clearTimeout(answerToastTimer);
  answerToastTimer = setTimeout(() => t.classList.remove('show'), 700);
}

// ── Timer UI helpers ──────────────────────────────────────────────────────
const SVG_PLAY  = `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="5 3 19 12 5 21 5 3"/></svg>`;
const SVG_PAUSE = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="8" y1="5" x2="8" y2="19"/><line x1="16" y1="5" x2="16" y2="19"/></svg>`;

function setTimerIcon(state) {
  document.getElementById('timer-icon').innerHTML = state === 'play' ? SVG_PLAY : SVG_PAUSE;
}

function setTimerDisplay(secs) {
  const label = document.getElementById('timer-label');
  if (secs === null) { label.textContent = '—'; return; }
  label.textContent = toMMSS(secs);
  label.className = secs <= 10 ? 'timer-time-label warning' : 'timer-time-label';
}

function toMMSS(secs) {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return m + ':' + String(s).padStart(2, '0');
}

function formatElapsedMs(ms, includeFractions = false) {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return '—';
  const safeMs = Math.max(0, Math.round(ms));
  const totalSeconds = Math.floor(safeMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (!includeFractions) return minutes + ':' + String(seconds).padStart(2, '0');
  const hundredths = Math.floor((safeMs % 1000) / 10);
  return `${minutes}:${String(seconds).padStart(2, '0')}.${String(hundredths).padStart(2, '0')}`;
}

// Expose gameMode on window so game files can read it
Object.defineProperty(window, 'gameMode', { get: () => gameMode });
Object.defineProperty(window, 'noteRangeMode', { get: () => noteRangeMode });
Object.defineProperty(window, 'boomwhackerMode', { get: () => boomwhackerMode });

// ── Pregame show/hide ─────────────────────────────────────────────────────
function showPregame() {
  document.getElementById('recap-view').classList.remove('show');
  document.getElementById('active-game').style.display = 'none';
  const paActive = document.getElementById('pa-active');
  if (paActive) paActive.style.display = 'none';
  document.getElementById('game-ui').style.display = '';
  document.getElementById('pregame-screen').classList.add('show');
  // Show correct pregame description
  const cfg = GAME_MODE_CONFIG[gameMode];
  Object.values(GAME_MODE_CONFIG).forEach(c => {
    document.getElementById(c.pregameId).style.display = 'none';
  });
  document.getElementById(cfg.pregameId).style.display = '';
  // Show/hide standard vs PA selectors
  const stdSelectors = document.getElementById('pregame-selectors-wrap');
  const paSelectors  = document.getElementById('pa-pregame-selectors');
  if (stdSelectors) stdSelectors.style.display = gameMode === 'play-along' ? 'none' : '';
  if (paSelectors)  paSelectors.style.display  = gameMode === 'play-along' ? 'flex' : 'none';
  updateNoteNamesBtn();
  syncRangeModeSelect();
  loadBest();
}

// ── Init ──────────────────────────────────────────────────────────────────
function initApp() {
  applyTheme();
  setMuteIcon();
  setThemeIcon();
  updateBoomwhackerBtn();
  updateNoteNamesBtn();
  syncRangeModeSelect();
  window.gameDuration = parseInt(document.getElementById('duration-select').value);

  // URL-based routing — /play-the-notes loads that game mode
  const path = window.location.pathname;
  if (path === '/play-the-notes') {
    gameMode = 'play-the-notes';
    document.getElementById('game-mode-select').value = 'play-the-notes';
    window.refreshCustomSelect?.(document.getElementById('game-mode-select'));
    document.getElementById('game-mode-emoji').textContent = '🎸';
    document.getElementById('clef-select').value = 'guitar';
    window.refreshCustomSelect?.(document.getElementById('clef-select'));
    clef = 'guitar';
  } else if (path === '/bursts') {
    gameMode = 'bursts';
    document.getElementById('game-mode-select').value = 'bursts';
    window.refreshCustomSelect?.(document.getElementById('game-mode-select'));
    document.getElementById('game-mode-emoji').textContent = '💥';
    document.getElementById('clef-select').value = 'guitar';
    window.refreshCustomSelect?.(document.getElementById('clef-select'));
    clef = 'guitar';
  }

  // Handle browser back/forward
  window.addEventListener('popstate', e => {
    const mode = e.state?.gameMode || 'name-the-notes';
    gameMode = mode;
    document.getElementById('game-mode-select').value = mode;
    window.refreshCustomSelect?.(document.getElementById('game-mode-select'));
    document.getElementById('game-mode-emoji').textContent = GAME_MODE_CONFIG[mode].emoji;
    if (mode === 'play-the-notes' || mode === 'bursts') {
      document.getElementById('clef-select').value = 'guitar';
      window.refreshCustomSelect?.(document.getElementById('clef-select'));
      clef = 'guitar';
    }
    showPregame();
  });

  loadBest();
  setTimerIcon('play');
  setTimerDisplay(null);
  showPregame();
  fetchLeaderboard();
}
