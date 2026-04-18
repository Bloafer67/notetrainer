// ── leaderboard.js ────────────────────────────────────────────────────────

const SB_URL = 'https://mgkgyzkfdnptfpnrhczu.supabase.co';
// Supabase keys are signed tokens. Update this with the exact key from Supabase,
// not an edited JWT payload, or the signature becomes invalid.
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1na2d5emtmZG5wdGZwbnJoY3p1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4NDkyODEsImV4cCI6MjA5MTQyNTI4MX0.qp95iZvyI33i6jiwxXXFf0cClyg0pSNT2-3YFEII18g';

async function sbFetch(path, options = {}) {
  const res = await fetch(SB_URL + path, {
    ...options,
    headers: {
      'apikey': SB_KEY,
      'Authorization': 'Bearer ' + SB_KEY,
      'Content-Type': 'application/json',
      'Prefer': options.prefer || '',
      ...options.headers,
    },
  });
  if (!res.ok) throw new Error(await res.text());
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

// ── State ─────────────────────────────────────────────────────────────────
let lbCache       = [];
let lbHighlightId = null;
let lbSelectedKey = null;

function getPlayAlongSongKey() {
  const selected = document.getElementById('pa-song-select')?.value;
  return selected || window.lastResult?.song || window.lastPlayAlongSongKey || Object.keys(SONGS || {})[0] || 'play-along';
}

function songLabel(songKey) {
  return SONGS?.[songKey]?.meta?.title || songKey || 'Unknown song';
}

// ── Board key helpers ─────────────────────────────────────────────────────
function boardClefLabel(game, clefLabel, rangeMode = window.noteRangeMode) {
  return game === 'play-along'
    ? clefLabel
    : `${clefLabel} · ${getDrillRangeLabel(rangeMode)}`;
}

function boardKey(e) {
  const game = e.game || 'name-the-notes';
  if (game === 'play-along') return ['play-along', 'song', e.song || e.key || 'unknown-song'].join('|');
  const dur = e.duration ?? e.Duration ?? 60;
  return ['timed', game, e.clef || 'Treble', e.key || 'C major', dur].join('|');
}

function currentBoardKey() {
  const mode = window.gameMode || 'name-the-notes';
  if (mode === 'play-along') return ['play-along', 'song', getPlayAlongSongKey()].join('|');
  const clefLabel = clef === 'guitar' ? 'Guitar (8vb)' : clef.charAt(0).toUpperCase() + clef.slice(1);
  return ['timed', mode, boardClefLabel(mode, clefLabel), KEY_SIGS[keyIndex].label, gameDuration].join('|');
}

function boardLabel(key) {
  const parts = key.split('|');
  if (parts[0] === 'play-along') return `${songLabel(parts[2])} · Play Along`;
  const [, , clefLabel, keyLabel, duration] = parts;
  return `${keyLabel} · ${clefLabel} · ${duration}s`;
}

function normalizeAccuracy(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 1;
  return num > 1 ? num / 100 : num;
}

function formatAccuracy(value) {
  return `${Math.round(normalizeAccuracy(value) * 100)}%`;
}

function entryTimeMs(entry) {
  const ms = Number(entry.time_ms);
  return Number.isFinite(ms) && ms >= 0 ? ms : Number.POSITIVE_INFINITY;
}

function compareScoreEntries(a, b) {
  return (Number(b.score) || 0) - (Number(a.score) || 0);
}

function comparePlayAlongEntries(a, b) {
  const timeDiff = entryTimeMs(a) - entryTimeMs(b);
  if (timeDiff !== 0) return timeDiff;

  const accuracyDiff = normalizeAccuracy(b.accuracy) - normalizeAccuracy(a.accuracy);
  if (accuracyDiff !== 0) return accuracyDiff;

  const scoreDiff = (Number(b.score) || 0) - (Number(a.score) || 0);
  if (scoreDiff !== 0) return scoreDiff;

  return new Date(b.created_at || 0) - new Date(a.created_at || 0);
}

function sortBoardEntries(entries, key) {
  const compare = key.startsWith('play-along|') ? comparePlayAlongEntries : compareScoreEntries;
  return [...entries].sort(compare);
}

function doesResultQualify(result, key = currentBoardKey()) {
  if (!result) return false;

  const board = sortBoardEntries(
    lbCache.filter(e => boardKey(e) === key),
    key
  ).slice(0, 10);

  if (result.game === 'play-along') {
    if (!Number.isFinite(Number(result.time_ms)) || Number(result.time_ms) <= 0) return false;
    if (board.length < 10) return true;
    return comparePlayAlongEntries(result, board[board.length - 1]) <= 0;
  }

  if ((Number(result.score) || 0) <= 0) return false;
  if (board.length < 10) return true;
  return compareScoreEntries(result, board[board.length - 1]) <= 0;
}

function getLeaderboardSaveElements() {
  if (window.lastResult?.game === 'play-along') {
    return {
      nameEl: document.getElementById('pa-player-name'),
      saveBtn: document.getElementById('pa-save-btn'),
    };
  }
  return {
    nameEl: document.getElementById('player-name'),
    saveBtn: document.getElementById('save-btn'),
  };
}

function buildLeaderboardPayload(name) {
  const result = window.lastResult;
  if (!result) return null;

  if (result.game === 'play-along') {
    const songKey = result.song || getPlayAlongSongKey();
    return {
      name,
      score: result.score ?? 0,
      clef: 'Guitar (8vb)',
      key: songLabel(songKey),
      game: 'play-along',
      duration: 0,
      Duration: 0,
      song: songKey,
      time_ms: Math.round(Number(result.time_ms) || 0),
      accuracy: normalizeAccuracy(result.accuracy),
    };
  }

  return {
    name,
    score: result.score ?? lastScore,
    clef: boardClefLabel(result.game || 'name-the-notes', result.clef),
    key: result.key,
    game: result.game || 'name-the-notes',
    duration: result.duration ?? gameDuration,
    Duration: result.duration ?? gameDuration,
  };
}

// ── Save ──────────────────────────────────────────────────────────────────
async function saveToLeaderboard() {
  const { nameEl, saveBtn } = getLeaderboardSaveElements();
  const payload = buildLeaderboardPayload((nameEl?.value || '').trim() || 'Anonymous');
  if (!nameEl || !saveBtn || !payload) {
    showToast('Nothing to save yet');
    return;
  }

  const name = (nameEl.value || '').trim() || 'Anonymous';
  payload.name = name;
  localStorage.setItem('mntr-playername', name);

  saveBtn.textContent = 'Saving…';
  saveBtn.disabled = true;

  try {
    const result = await sbFetch('/rest/v1/leaderboard', {
      method: 'POST',
      prefer: 'return=representation',
      body: JSON.stringify(payload),
    });
    lbHighlightId = result?.[0]?.id || null;
    showToast('Saved!');
    saveBtn.textContent = 'View →';
    saveBtn.disabled = false;
    saveBtn.onclick = () => {
      switchTab('leaderboard');
      fetchLeaderboard();
    };
  } catch (e) {
    console.error('Save error:', e.message);
    saveBtn.textContent = 'Save';
    saveBtn.disabled = false;
    saveBtn.onclick = saveToLeaderboard;
    showToast('Could not save — try again');
  }
}

// ── Fetch ─────────────────────────────────────────────────────────────────
async function fetchLeaderboard() {
  lbSelectedKey = currentBoardKey();
  try {
    const data = await sbFetch(
      '/rest/v1/leaderboard?select=*&order=created_at.desc&limit=2000',
      { method: 'GET', prefer: 'return=representation' }
    );
    lbCache = data || [];
    renderLeaderboard();
  } catch (e) {
    document.getElementById('lb-list').innerHTML =
      '<div class="lb-empty">Could not load scores.</div>';
  }
}

// ── Render ────────────────────────────────────────────────────────────────
function renderLeaderboard() {
  renderBoardDropdown();
  renderBoard(lbSelectedKey);
}

function renderBoardDropdown() {
  const sel = document.getElementById('lb-board-select');
  if (!sel) return;

  const currentMode = window.gameMode || 'name-the-notes';
  const keys = [...new Set(
    lbCache
      .filter(e => (e.game || 'name-the-notes') === currentMode)
      .map(boardKey)
  )].sort((a, b) => boardLabel(a).localeCompare(boardLabel(b)));

  const myKey = currentBoardKey();
  if (!keys.includes(myKey)) keys.unshift(myKey);

  sel.innerHTML = '';
  keys.forEach(key => {
    const opt = document.createElement('option');
    opt.value = key;
    opt.textContent = boardLabel(key);
    opt.selected = key === lbSelectedKey;
    sel.appendChild(opt);
  });
}

function onLbBoardChange() {
  const sel = document.getElementById('lb-board-select');
  if (sel) lbSelectedKey = sel.value;
  renderBoard(lbSelectedKey);
}

function renderBoard(key) {
  const board = sortBoardEntries(
    lbCache.filter(e => boardKey(e) === key),
    key
  ).slice(0, 10);

  const list = document.getElementById('lb-list');
  list.innerHTML = '';

  if (!board.length) {
    list.innerHTML = '<div class="lb-empty">No scores yet — be the first!</div>';
    return;
  }

  const isPlayAlongBoard = key.startsWith('play-along|');

  board.forEach((entry, index) => {
    const isYou = entry.id && entry.id === lbHighlightId;
    const row = document.createElement('div');
    row.className = 'lb-row' + (isYou ? ' lb-row-highlight' : '');

    const rankClass = index === 0 ? 'gold' : index === 1 ? 'silver' : index === 2 ? 'bronze' : '';
    const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : index + 1;
    const date = new Date(entry.created_at).toLocaleDateString();
    const primaryValue = isPlayAlongBoard
      ? formatElapsedMs(entryTimeMs(entry), true)
      : entry.score;
    const metaValue = isPlayAlongBoard
      ? `${formatAccuracy(entry.accuracy)} accuracy · ${date}`
      : date;

    row.innerHTML = `
      <div class="lb-rank ${rankClass}">${medal}</div>
      <div class="lb-name">${escHtml(entry.name)}${isYou ? ' <span class="lb-you">you</span>' : ''}</div>
      <div class="lb-right">
        <div class="lb-score">${primaryValue}</div>
        <div class="lb-meta">${metaValue}</div>
      </div>`;

    list.appendChild(row);
    if (isYou) setTimeout(() => row.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 100);
  });
}

function escHtml(s) {
  if (!s) return '';
  return s.replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
}
