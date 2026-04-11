// ── leaderboard.js ────────────────────────────────────────────────────────
// Features: per-game mode, top-10 per board, clef+key+duration breakdown,
//           highlight your saved row, Save → View button

const SB_URL = 'https://mgkgyzkfdnptfpnrhczu.supabase.co';
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1na2d5emtmZG5wdGZwbnJoY3p1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4NDkyODEsImV4cCI6MjA5MTQyNTI4MX0.qp95iZvyI33i6jiwxXXFf0cClyg0pSNT2-3YFEII18g';

async function sbFetch(path, options = {}) {
  const res = await fetch(SB_URL + path, {
    ...options,
    headers: {
      'apikey': SB_KEY, 'Authorization': 'Bearer ' + SB_KEY,
      'Content-Type': 'application/json', 'Prefer': options.prefer || '',
      ...options.headers,
    },
  });
  if (!res.ok) throw new Error(await res.text());
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

// ── State ─────────────────────────────────────────────────────────────────
let lbCache       = [];
let lbGameMode    = 'name-the-notes';
let lbHighlightId = null; // Supabase row id of the score we just saved

// ── Board key ─────────────────────────────────────────────────────────────
// A "board" is uniquely identified by: game + clef + key + duration
// This lets us show a focused top-10 that's actually meaningful to compare
function boardKey(entry) {
  return [
    entry.game     || 'name-the-notes',
    entry.clef     || 'Treble',
    entry.key      || 'C major',
    entry.duration || 60,
  ].join('|');
}

function currentBoardKey() {
  const clefLabel = clef === 'guitar'
    ? 'Guitar (8vb)'
    : clef.charAt(0).toUpperCase() + clef.slice(1);
  return [
    window.gameMode || 'name-the-notes',
    clefLabel,
    KEY_SIGS[keyIndex].label,
    gameDuration,
  ].join('|');
}

// ── Save score ────────────────────────────────────────────────────────────
async function saveToLeaderboard() {
  const nameEl = document.getElementById('player-name');
  const name   = nameEl.value.trim() || 'Anonymous';
  localStorage.setItem('mntr-playername', name);

  const clefLabel = clef === 'guitar'
    ? 'Guitar (8vb)'
    : clef.charAt(0).toUpperCase() + clef.slice(1);

  const saveBtn = document.getElementById('save-btn');
  saveBtn.textContent = 'Saving…'; saveBtn.disabled = true;

  try {
    const result = await sbFetch('/rest/v1/leaderboard', {
      method: 'POST', prefer: 'return=representation',
      body: JSON.stringify({
        name, score: lastScore,
        clef:     clefLabel,
        key:      KEY_SIGS[keyIndex].label,
        game:     window.gameMode || 'name-the-notes',
        duration: gameDuration,
      }),
    });
    // Store the ID of the row we just saved so we can highlight it
    lbHighlightId = result?.[0]?.id || null;
    showToast('Saved!');
    saveBtn.textContent = 'View leaderboard →';
    saveBtn.disabled = false;
    saveBtn.onclick = () => {
      switchTab('leaderboard');
      fetchLeaderboard();
    };
  } catch (e) {
    console.error('Save error:', e.message);
    saveBtn.textContent = 'Save'; saveBtn.disabled = false;
    saveBtn.onclick = saveToLeaderboard;
    showToast('Could not save — try again');
  }
}

// ── Fetch ─────────────────────────────────────────────────────────────────
async function fetchLeaderboard() {
  lbGameMode = window.gameMode || 'name-the-notes';
  try {
    const data = await sbFetch(
      '/rest/v1/leaderboard?select=*&order=score.desc&limit=2000',
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
  renderGameModeTabs();
  renderCurrentBoard();
}

function renderGameModeTabs() {
  const el = document.getElementById('lb-game-tabs');
  if (!el) return;
  el.innerHTML = '';
  [
    { value: 'name-the-notes', label: '🎼 Name the Notes' },
    { value: 'play-the-notes', label: '🎸 Play the Notes' },
  ].forEach(({ value, label }) => {
    const btn = document.createElement('button');
    btn.className = 'lb-filter' + (lbGameMode === value ? ' active' : '');
    btn.textContent = label;
    btn.onclick = () => { lbGameMode = value; renderCurrentBoard(); };
    el.appendChild(btn);
  });
}

// ── Render the board matching current game settings ────────────────────────
function renderCurrentBoard() {
  const key = currentBoardKey();
  // All entries for the current board, already sorted by score desc
  const board = lbCache.filter(e => boardKey(e) === key).slice(0, 10);

  // Board description header
  const clefLabel = clef === 'guitar'
    ? 'Guitar (8vb)'
    : clef.charAt(0).toUpperCase() + clef.slice(1);
  const desc = `${KEY_SIGS[keyIndex].label} · ${clefLabel} · ${gameDuration}s`;
  const headerEl = document.getElementById('lb-board-desc');
  if (headerEl) headerEl.textContent = desc;

  // Filter pills: show other clef/key/duration combos for this game mode
  renderBoardFilters();

  const list = document.getElementById('lb-list');
  list.innerHTML = '';

  if (!board.length) {
    list.innerHTML = '<div class="lb-empty">No scores yet for this combination — be the first!</div>';
    return;
  }

  board.forEach((e, i) => {
    const row = document.createElement('div');
    const isHighlighted = e.id && e.id === lbHighlightId;
    row.className = 'lb-row' + (isHighlighted ? ' lb-row-highlight' : '');
    const rankClass = i===0?'gold':i===1?'silver':i===2?'bronze':'';
    const medal     = i===0?'🥇':i===1?'🥈':i===2?'🥉':i+1;
    const date      = new Date(e.created_at).toLocaleDateString();
    row.innerHTML = `
      <div class="lb-rank ${rankClass}">${medal}</div>
      <div>
        <div class="lb-name">${escHtml(e.name)}${isHighlighted ? ' <span class="lb-you">you</span>' : ''}</div>
        <div class="lb-meta">${escHtml(e.clef||'')} · ${escHtml(e.key||'')} · ${e.duration||60}s · ${date}</div>
      </div>
      <div class="lb-score">${e.score}</div>`;
    list.appendChild(row);

    // Scroll highlighted row into view
    if (isHighlighted) setTimeout(() => row.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 100);
  });
}

// ── Board filter pills ─────────────────────────────────────────────────────
// Show distinct boards that exist for the current game mode
function renderBoardFilters() {
  const el = document.getElementById('lb-filters');
  if (!el) return;
  const myKey = currentBoardKey();

  // Get unique board keys for this game mode
  const boardsForMode = lbCache.filter(e =>
    (e.game || 'name-the-notes') === lbGameMode
  );
  const uniqueKeys = [...new Set(boardsForMode.map(boardKey))];

  el.innerHTML = '';
  uniqueKeys.forEach(k => {
    const parts = k.split('|');
    const label = `${parts[2]} · ${parts[1]} · ${parts[3]}s`;
    const btn = document.createElement('button');
    btn.className = 'lb-filter' + (k === myKey ? ' active' : '');
    btn.textContent = label;
    btn.onclick = () => {
      // Temporarily switch to viewing that board
      // Parse key back to set filter state
      renderBoardByKey(k);
    };
    el.appendChild(btn);
  });
}

function renderBoardByKey(key) {
  const parts  = key.split('|');
  const board  = lbCache.filter(e => boardKey(e) === key).slice(0, 10);
  const headerEl = document.getElementById('lb-board-desc');
  if (headerEl) headerEl.textContent = `${parts[2]} · ${parts[1]} · ${parts[3]}s`;

  // Update active filter
  document.querySelectorAll('#lb-filters .lb-filter').forEach(btn => {
    btn.classList.toggle('active', btn.textContent === `${parts[2]} · ${parts[1]} · ${parts[3]}s`);
  });

  const list = document.getElementById('lb-list');
  list.innerHTML = '';
  if (!board.length) {
    list.innerHTML = '<div class="lb-empty">No scores yet for this combination.</div>';
    return;
  }
  board.forEach((e, i) => {
    const row = document.createElement('div');
    const isHighlighted = e.id && e.id === lbHighlightId;
    row.className = 'lb-row' + (isHighlighted ? ' lb-row-highlight' : '');
    const rankClass = i===0?'gold':i===1?'silver':i===2?'bronze':'';
    const medal     = i===0?'🥇':i===1?'🥈':i===2?'🥉':i+1;
    const date      = new Date(e.created_at).toLocaleDateString();
    row.innerHTML = `
      <div class="lb-rank ${rankClass}">${medal}</div>
      <div>
        <div class="lb-name">${escHtml(e.name)}${isHighlighted ? ' <span class="lb-you">you</span>' : ''}</div>
        <div class="lb-meta">${escHtml(e.clef||'')} · ${escHtml(e.key||'')} · ${e.duration||60}s · ${date}</div>
      </div>
      <div class="lb-score">${e.score}</div>`;
    list.appendChild(row);
  });
}

function escHtml(s) {
  if (!s) return '';
  return s.replace(/[&<>"']/g, c =>
    ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c])
  );
}
