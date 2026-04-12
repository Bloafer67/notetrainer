// ── leaderboard.js ────────────────────────────────────────────────────────

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
let lbCache        = [];
let lbHighlightId  = null;
let lbSelectedKey  = null; // currently viewed board key

// ── Board key helpers ─────────────────────────────────────────────────────
function boardKey(e) {
  return [e.game||'name-the-notes', e.clef||'Treble', e.key||'C major', e.duration||60].join('|');
}

function currentBoardKey() {
  const clefLabel = clef === 'guitar' ? 'Guitar (8vb)' : clef.charAt(0).toUpperCase() + clef.slice(1);
  return [window.gameMode||'name-the-notes', clefLabel, KEY_SIGS[keyIndex].label, gameDuration].join('|');
}

function boardLabel(key) {
  const [, c, k, d] = key.split('|');
  return `${k} · ${c} · ${d}s`;
}

// ── Save ──────────────────────────────────────────────────────────────────
async function saveToLeaderboard() {
  const nameEl  = document.getElementById('player-name');
  const name    = nameEl.value.trim() || 'Anonymous';
  localStorage.setItem('mntr-playername', name);
  const clefLabel = clef === 'guitar' ? 'Guitar (8vb)' : clef.charAt(0).toUpperCase() + clef.slice(1);
  const saveBtn = document.getElementById('save-btn');
  saveBtn.textContent = 'Saving…'; saveBtn.disabled = true;
  try {
    const result = await sbFetch('/rest/v1/leaderboard', {
      method: 'POST', prefer: 'return=representation',
      body: JSON.stringify({
        name, score: lastScore,
        clef: clefLabel, key: KEY_SIGS[keyIndex].label,
        game: window.gameMode || 'name-the-notes',
        duration: gameDuration,
      }),
    });
    lbHighlightId = result?.[0]?.id || null;
    showToast('Saved!');
    // Change Save → View
    saveBtn.textContent = 'View →';
    saveBtn.disabled = false;
    saveBtn.onclick = () => { switchTab('leaderboard'); fetchLeaderboard(); };
  } catch (e) {
    console.error('Save error:', e.message);
    saveBtn.textContent = 'Save'; saveBtn.disabled = false;
    saveBtn.onclick = saveToLeaderboard;
    showToast('Could not save — try again');
  }
}

// ── Fetch ─────────────────────────────────────────────────────────────────
async function fetchLeaderboard() {
  // Default the selected board to match current game settings
  lbSelectedKey = currentBoardKey();
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
  renderBoardDropdown();
  renderBoard(lbSelectedKey);
}

// Populate the board dropdown with all boards for current game mode
function renderBoardDropdown() {
  const sel = document.getElementById('lb-board-select');
  if (!sel) return;
  const currentMode = window.gameMode || 'name-the-notes';
  // All unique board keys for this game mode that have entries
  const keys = [...new Set(
    lbCache
      .filter(e => (e.game || 'name-the-notes') === currentMode)
      .map(boardKey)
  )].sort();

  // Always include the current board key even if empty
  const myKey = currentBoardKey();
  if (!keys.includes(myKey)) keys.unshift(myKey);

  sel.innerHTML = '';
  keys.forEach(k => {
    const opt = document.createElement('option');
    opt.value = k;
    opt.textContent = boardLabel(k);
    opt.selected = k === lbSelectedKey;
    sel.appendChild(opt);
  });
}

function onLbBoardChange() {
  const sel = document.getElementById('lb-board-select');
  if (sel) lbSelectedKey = sel.value;
  renderBoard(lbSelectedKey);
}

// Render the top-10 for a given board key
function renderBoard(key) {
  const board = lbCache
    .filter(e => boardKey(e) === key)
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);

  const list = document.getElementById('lb-list');
  list.innerHTML = '';

  if (!board.length) {
    list.innerHTML = '<div class="lb-empty">No scores yet — be the first!</div>';
    return;
  }

  board.forEach((e, i) => {
    const isYou = e.id && e.id === lbHighlightId;
    const row   = document.createElement('div');
    row.className = 'lb-row' + (isYou ? ' lb-row-highlight' : '');
    const rankClass = i===0?'gold':i===1?'silver':i===2?'bronze':'';
    const medal     = i===0?'🥇':i===1?'🥈':i===2?'🥉':i+1;
    const date      = new Date(e.created_at).toLocaleDateString();
    row.innerHTML = `
      <div class="lb-rank ${rankClass}">${medal}</div>
      <div class="lb-name">${escHtml(e.name)}${isYou ? ' <span class="lb-you">you</span>' : ''}</div>
      <div class="lb-right">
        <div class="lb-score">${e.score}</div>
        <div class="lb-meta">${date}</div>
      </div>`;
    list.appendChild(row);
    if (isYou) setTimeout(() => row.scrollIntoView({ behavior:'smooth', block:'nearest' }), 100);
  });
}

function escHtml(s) {
  if (!s) return '';
  return s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
