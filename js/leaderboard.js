// ── leaderboard.js ────────────────────────────────────────────────────────
// Handles: Supabase connection, saving scores, fetching + rendering leaderboard
// Depends on: clef, keyIndex, KEY_SIGS, lastScore, gameDuration (game state)

const SB_URL = 'https://mgkgyzkfdnptfpnrhczu.supabase.co';
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1na2d5emtmZG5wdGZwbnJoY3p1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4NDkyODEsImV4cCI6MjA5MTQyNTI4MX0.qp95iZvyI33i6jiwxXXFf0cClyg0pSNT2-3YFEII18g';

// ── Low-level fetch wrapper ───────────────────────────────────────────────
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

// ── Filter state ──────────────────────────────────────────────────────────
let lbFilter = 'all';
let lbCache  = [];

// ── Save score ────────────────────────────────────────────────────────────
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
        score:  lastScore,
        clef:   clefLabel,
        key:    KEY_SIGS[keyIndex].label,
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

// ── Fetch all scores ──────────────────────────────────────────────────────
async function fetchLeaderboard() {
  try {
    const data = await sbFetch(
      '/rest/v1/leaderboard?select=*&order=score.desc&limit=100',
      { method:'GET', prefer:'return=representation' }
    );
    lbCache = data || [];
    renderLeaderboard();
  } catch (e) {
    document.getElementById('lb-list').innerHTML =
      '<div class="lb-empty">Could not load scores.</div>';
  }
}

// ── Render leaderboard UI ─────────────────────────────────────────────────
function renderLeaderboard() {
  // Build filter pills from unique keys in the data
  const keys = ['all', ...new Set(lbCache.map(e => e.key))];
  const fEl  = document.getElementById('lb-filters');
  fEl.innerHTML = '';
  keys.forEach(k => {
    const btn = document.createElement('button');
    btn.className = 'lb-filter' + (lbFilter === k ? ' active' : '');
    btn.textContent = k === 'all' ? 'All keys' : k;
    btn.onclick = () => { lbFilter = k; renderLeaderboard(); };
    fEl.appendChild(btn);
  });

  const filtered = lbFilter === 'all'
    ? lbCache
    : lbCache.filter(e => e.key === lbFilter);

  const list = document.getElementById('lb-list');
  list.innerHTML = '';

  if (!filtered.length) {
    list.innerHTML = '<div class="lb-empty">No scores yet — play a round and save your name!</div>';
    return;
  }

  filtered.forEach((e, i) => {
    const row = document.createElement('div');
    row.className = 'lb-row';
    const rankClass = i===0 ? 'gold' : i===1 ? 'silver' : i===2 ? 'bronze' : '';
    const medal     = i===0 ? '🥇'   : i===1 ? '🥈'     : i===2 ? '🥉'     : i+1;
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
}

// ── HTML escape helper ────────────────────────────────────────────────────
function escHtml(s) {
  return s.replace(/[&<>"']/g, c =>
    ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c])
  );
}
