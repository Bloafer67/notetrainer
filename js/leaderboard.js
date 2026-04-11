// ── leaderboard.js ────────────────────────────────────────────────────────
// Handles: Supabase connection, saving scores, fetching + rendering leaderboard
// Features: per-game-mode tabs, key filters, pagination
// Depends on: clef, keyIndex, KEY_SIGS, lastScore, gameDuration, gameMode

const SB_URL = 'https://mgkgyzkfdnptfpnrhczu.supabase.co';
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1na2d5emtmZG5wdGZwbnJoY3p1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4NDkyODEsImV4cCI6MjA5MTQyNTI4MX0.qp95iZvyI33i6jiwxXXFf0cClyg0pSNT2-3YFEII18g';

const LB_PAGE_SIZE = 10;

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

let lbFilter   = 'all';
let lbGameMode = 'name-the-notes';
let lbPage     = 0;
let lbCache    = [];

async function saveToLeaderboard() {
  const nameEl = document.getElementById('player-name');
  const name   = nameEl.value.trim() || 'Anonymous';
  localStorage.setItem('mntr-playername', name);

  const clefLabel = clef === 'guitar'
    ? 'Guitar (8vb)'
    : clef.charAt(0).toUpperCase() + clef.slice(1);

  const saveBtn = document.getElementById('save-btn');
  saveBtn.textContent = 'Saving…';
  saveBtn.disabled = true;

  try {
    await sbFetch('/rest/v1/leaderboard', {
      method: 'POST',
      prefer: 'return=minimal',
      body: JSON.stringify({
        name,
        score: lastScore,
        clef:  clefLabel,
        key:   KEY_SIGS[keyIndex].label,
        game:  window.gameMode || 'name-the-notes',
      }),
    });
    showToast('Saved!');
    saveBtn.textContent = 'Saved ✓';
    saveBtn.disabled = true;
  } catch (e) {
    console.error('Save error:', e.message);
    saveBtn.textContent = 'Save';
    saveBtn.disabled = false;
    saveBtn.onclick = saveToLeaderboard;
    showToast('Could not save — try again');
    return;
  }
  fetchLeaderboard();
}

async function fetchLeaderboard() {
  lbGameMode = window.gameMode || 'name-the-notes';
  lbFilter   = 'all';
  lbPage     = 0;
  try {
    const data = await sbFetch(
      '/rest/v1/leaderboard?select=*&order=score.desc&limit=500',
      { method: 'GET', prefer: 'return=representation' }
    );
    const all = data || [];
    lbCache = all.filter(e => (e.game || 'name-the-notes') === lbGameMode);
    renderLeaderboard();
  } catch (e) {
    document.getElementById('lb-list').innerHTML =
      '<div class="lb-empty">Could not load scores.</div>';
  }
}

async function fetchLeaderboardForMode(mode) {
  lbGameMode = mode;
  lbFilter   = 'all';
  lbPage     = 0;
  try {
    const data = await sbFetch(
      '/rest/v1/leaderboard?select=*&order=score.desc&limit=500',
      { method: 'GET', prefer: 'return=representation' }
    );
    const all = data || [];
    lbCache = all.filter(e => (e.game || 'name-the-notes') === mode);
    renderLeaderboard();
  } catch (e) {
    document.getElementById('lb-list').innerHTML =
      '<div class="lb-empty">Could not load scores.</div>';
  }
}

function renderLeaderboard() {
  renderGameModeTabs();
  renderKeyFilters();
  renderPage();
}

function renderGameModeTabs() {
  const tabsEl = document.getElementById('lb-game-tabs');
  if (!tabsEl) return;
  tabsEl.innerHTML = '';
  [
    { value: 'name-the-notes', label: '🎼 Name the Notes' },
    { value: 'play-the-notes', label: '🎸 Play the Notes' },
  ].forEach(({ value, label }) => {
    const btn = document.createElement('button');
    btn.className = 'lb-filter' + (lbGameMode === value ? ' active' : '');
    btn.textContent = label;
    btn.onclick = () => fetchLeaderboardForMode(value);
    tabsEl.appendChild(btn);
  });
}

function renderKeyFilters() {
  const fEl = document.getElementById('lb-filters');
  if (!fEl) return;
  const keys = ['all', ...new Set(lbCache.map(e => e.key))];
  fEl.innerHTML = '';
  keys.forEach(k => {
    const btn = document.createElement('button');
    btn.className = 'lb-filter' + (lbFilter === k ? ' active' : '');
    btn.textContent = k === 'all' ? 'All keys' : k;
    btn.onclick = () => { lbFilter = k; lbPage = 0; renderPage(); };
    fEl.appendChild(btn);
  });
}

function renderPage() {
  const filtered = lbFilter === 'all'
    ? lbCache
    : lbCache.filter(e => e.key === lbFilter);

  const totalPages = Math.max(1, Math.ceil(filtered.length / LB_PAGE_SIZE));
  if (lbPage >= totalPages) lbPage = totalPages - 1;

  const pageRows = filtered.slice(lbPage * LB_PAGE_SIZE, (lbPage + 1) * LB_PAGE_SIZE);
  const list = document.getElementById('lb-list');
  list.innerHTML = '';

  if (!filtered.length) {
    list.innerHTML = '<div class="lb-empty">No scores yet — play a round and save your name!</div>';
    renderPagination(0, 1);
    return;
  }

  pageRows.forEach((e, i) => {
    const globalRank = lbPage * LB_PAGE_SIZE + i;
    const row = document.createElement('div');
    row.className = 'lb-row';
    const rankClass = globalRank===0?'gold':globalRank===1?'silver':globalRank===2?'bronze':'';
    const medal     = globalRank===0?'🥇':globalRank===1?'🥈':globalRank===2?'🥉':globalRank+1;
    const date      = new Date(e.created_at).toLocaleDateString();
    row.innerHTML = `
      <div class="lb-rank ${rankClass}">${medal}</div>
      <div>
        <div class="lb-name">${escHtml(e.name)}</div>
        <div class="lb-meta">${escHtml(e.clef)} · ${escHtml(e.key)} · ${date}</div>
      </div>
      <div class="lb-score">${e.score}</div>`;
    list.appendChild(row);
  });

  renderPagination(lbPage, totalPages);
}

function renderPagination(page, totalPages) {
  const el = document.getElementById('lb-pagination');
  if (!el) return;
  el.innerHTML = '';
  if (totalPages <= 1) return;

  const prev = document.createElement('button');
  prev.className = 'lb-page-btn';
  prev.textContent = '← Prev';
  prev.disabled = page === 0;
  prev.onclick = () => { lbPage--; renderPage(); };
  el.appendChild(prev);

  const info = document.createElement('span');
  info.className = 'lb-page-info';
  info.textContent = `${page + 1} / ${totalPages}`;
  el.appendChild(info);

  const next = document.createElement('button');
  next.className = 'lb-page-btn';
  next.textContent = 'Next →';
  next.disabled = page >= totalPages - 1;
  next.onclick = () => { lbPage++; renderPage(); };
  el.appendChild(next);
}

function escHtml(s) {
  return s.replace(/[&<>"']/g, c =>
    ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c])
  );
}
