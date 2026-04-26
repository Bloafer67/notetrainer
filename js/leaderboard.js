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
  if (game === 'intervals') {
    const count = e.duration ?? e.Duration ?? 25;
    return ['intervals', 'set', e.key || 'All intervals', count].join('|');
  }
  const dur = e.duration ?? e.Duration ?? 60;
  return ['timed', game, e.clef || 'Treble', normalizeDrillBoardId(e.key), dur].join('|');
}

function currentBoardKey() {
  const mode = window.gameMode || 'name-the-notes';
  if (mode === 'play-along') return ['play-along', 'song', getPlayAlongSongKey()].join('|');
  if (mode === 'intervals') {
    const setLabel = (typeof window.ivIntervalSetLabel === 'function')
      ? window.ivIntervalSetLabel()
      : 'All intervals';
    const count = window.ivState?.questionCount || 25;
    return ['intervals', 'set', setLabel, count].join('|');
  }
  const clefLabel = clef === 'guitar' ? 'Guitar (8vb)' : clef.charAt(0).toUpperCase() + clef.slice(1);
  return ['timed', mode, boardClefLabel(mode, clefLabel), getCurrentDrillBoardId(), gameDuration].join('|');
}

function boardLabel(key) {
  const parts = key.split('|');
  if (parts[0] === 'play-along') return `${songLabel(parts[2])} · Play Along`;
  if (parts[0] === 'intervals') {
    const [, , setLabel, count] = parts;
    return `${setLabel} · ${count} questions`;
  }
  const [, , clefLabel, boardId, duration] = parts;
  return `${getDrillBoardSummary(boardId)} · ${clefLabel} · ${duration}s`;
}

// ── URL params ⇄ board key ────────────────────────────────────────────────
// Internal boardKey stays pipe-delimited; URL params are a separate
// URL-friendly encoding the router hands back via window.location.search.
function gameFromKey(key) {
  if (!key) return null;
  const parts = key.split('|');
  if (parts[0] === 'play-along') return 'play-along';
  if (parts[0] === 'intervals')  return 'intervals';
  if (parts[0] === 'timed')      return parts[1] || null;
  return null;
}

function clefSlugFromLabel(clefDisplay) {
  if (!clefDisplay) return 'treble';
  if (clefDisplay === 'Guitar (8vb)') return 'guitar';
  return clefDisplay.toLowerCase();
}

function clefLabelFromSlug(clefSlug) {
  const slug = (clefSlug || 'treble').toLowerCase();
  if (slug === 'guitar') return 'Guitar (8vb)';
  return slug.charAt(0).toUpperCase() + slug.slice(1);
}

function rangeSlugFromLabel(rangeLabel) {
  return rangeLabel === 'Full range' ? 'full-range' : 'staff-only';
}

function boardSelectionToParams(key) {
  if (!key) return {};
  const parts = key.split('|');
  if (parts[0] === 'play-along') {
    return { game: 'play-along', song: parts[2] || '' };
  }
  if (parts[0] === 'intervals') {
    return { game: 'intervals', set: parts[2] || '', count: parts[3] || '' };
  }
  if (parts[0] === 'timed') {
    const [, game, clefLabel, boardId, duration] = parts;
    const [clefDisplay, rangeLabel] = (clefLabel || '').split(' · ');
    return {
      game,
      clef: clefSlugFromLabel(clefDisplay),
      range: rangeSlugFromLabel(rangeLabel),
      board: boardId || '',
      duration: duration || '',
    };
  }
  return {};
}

function paramsToBoardSelection(params) {
  if (!params || !params.game) return null;
  const game = params.game;
  if (game === 'play-along') {
    if (!params.song) return null;
    return ['play-along', 'song', params.song].join('|');
  }
  if (game === 'intervals') {
    const setLabel = params.set || 'All intervals';
    const count = params.count || 25;
    return ['intervals', 'set', setLabel, count].join('|');
  }
  if (window.router?.isGameMode?.(game)) {
    const clefDisplay = clefLabelFromSlug(params.clef);
    const rangeSlug = params.range === 'full-range' ? 'full-range' : 'staff-only';
    const rangeLabel = (typeof getDrillRangeLabel === 'function')
      ? getDrillRangeLabel(rangeSlug)
      : (rangeSlug === 'full-range' ? 'Full range' : 'Staff only');
    const clefLabel = `${clefDisplay} · ${rangeLabel}`;
    const boardId = (typeof normalizeDrillBoardId === 'function')
      ? normalizeDrillBoardId(params.board)
      : (params.board || 'c-major');
    const duration = params.duration || 60;
    return ['timed', game, clefLabel, boardId, duration].join('|');
  }
  return null;
}

// Called by main.js on view change. Sets lbSelectedKey from URL params if
// they decode to a valid board; otherwise nulls it out so fetchLeaderboard
// falls back to the user's currentBoardKey().
function setLbSelectionFromParams(params) {
  lbSelectedKey = paramsToBoardSelection(params || {});
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

function compareIntervalsEntries(a, b) {
  const scoreDiff = (Number(b.score) || 0) - (Number(a.score) || 0);
  if (scoreDiff !== 0) return scoreDiff;

  const accuracyDiff = normalizeAccuracy(b.accuracy) - normalizeAccuracy(a.accuracy);
  if (accuracyDiff !== 0) return accuracyDiff;

  return new Date(b.created_at || 0) - new Date(a.created_at || 0);
}

function sortBoardEntries(entries, key) {
  let compare = compareScoreEntries;
  if (key.startsWith('play-along|')) compare = comparePlayAlongEntries;
  else if (key.startsWith('intervals|')) compare = compareIntervalsEntries;
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

  if (result.game === 'intervals') {
    if ((Number(result.score) || 0) <= 0) return false;
    if (board.length < 10) return true;
    return compareIntervalsEntries(result, board[board.length - 1]) <= 0;
  }

  if ((Number(result.score) || 0) <= 0) return false;
  if (board.length < 10) return true;
  return compareScoreEntries(result, board[board.length - 1]) <= 0;
}

function getLeaderboardSaveElements() {
  const recapVisible = document.getElementById('recap-view')?.classList.contains('show');
  if (window.lastResult?.game === 'play-along' && !recapVisible) {
    return {
      nameEl: document.getElementById('pa-player-name'),
      saveBtn: document.getElementById('pa-save-btn'),
    };
  }
  if (window.lastResult?.game === 'intervals' && !recapVisible) {
    return {
      nameEl: document.getElementById('iv-player-name'),
      saveBtn: document.getElementById('iv-save-btn'),
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

  if (result.game === 'intervals') {
    const count = result.questionCount ?? result.duration ?? 25;
    return {
      name,
      score: result.score ?? 0,
      clef: '—',
      key: result.intervalSet || result.key || 'All intervals',
      game: 'intervals',
      duration: count,
      Duration: count,
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
      navigate('leaderboard');
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
  if (!lbSelectedKey) lbSelectedKey = currentBoardKey();
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

  // Filter by the selected board's game so deep-linked boards still appear in
  // the dropdown even when the active gameMode (Game tab) is something else.
  const filterGame = gameFromKey(lbSelectedKey) || window.gameMode || 'name-the-notes';
  const keys = [...new Set(
    lbCache
      .filter(e => (e.game || 'name-the-notes') === filterGame)
      .map(boardKey)
  )].sort((a, b) => boardLabel(a).localeCompare(boardLabel(b)));

  if (lbSelectedKey && !keys.includes(lbSelectedKey)) keys.unshift(lbSelectedKey);

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
  window.router?.pushView?.('leaderboard', boardSelectionToParams(lbSelectedKey));
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
  const isIntervalsBoard = key.startsWith('intervals|');

  board.forEach((entry, index) => {
    const isYou = entry.id && entry.id === lbHighlightId;
    const row = document.createElement('div');
    row.className = 'lb-row' + (isYou ? ' lb-row-highlight' : '');

    const rankClass = index === 0 ? 'gold' : index === 1 ? 'silver' : index === 2 ? 'bronze' : '';
    const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : index + 1;
    const date = new Date(entry.created_at).toLocaleDateString();
    let primaryValue;
    let metaValue;
    if (isPlayAlongBoard) {
      primaryValue = formatElapsedMs(entryTimeMs(entry), true);
      metaValue = `${formatAccuracy(entry.accuracy)} accuracy · ${date}`;
    } else if (isIntervalsBoard) {
      const total = Number(entry.duration) || Number(entry.Duration) || 0;
      primaryValue = total ? `${entry.score}/${total}` : entry.score;
      metaValue = `${formatAccuracy(entry.accuracy)} accuracy · ${date}`;
    } else {
      primaryValue = entry.score;
      metaValue = date;
    }

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
