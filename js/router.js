// ── router.js ─────────────────────────────────────────────────────────────
// URL is the source of truth. Path encodes which game and (optional) subview.
// Query string encodes per-board specifier on /<game>/leaderboard.
//
//   /                           → default game pregame
//   /<game>                     → game pregame
//   /<game>/leaderboard         → that game's leaderboard (default board)
//   /<game>/leaderboard?board=…&clef=…&duration=…   → specific board
//
// game ∈ GAME_MODES. subview ∈ {null, 'leaderboard'}.

(function () {
  const GAME_MODES = ['name-the-notes', 'play-the-notes', 'play-along', 'bursts', 'intervals'];
  const SUBVIEWS   = ['leaderboard'];
  const DEFAULT_GAME = 'name-the-notes';

  function parsePath(pathname) {
    const parts = (pathname || '/').split('/').filter(Boolean);
    const game = GAME_MODES.includes(parts[0]) ? parts[0] : DEFAULT_GAME;
    const subview = SUBVIEWS.includes(parts[1]) ? parts[1] : null;
    return { game, subview };
  }

  function buildPath(game, subview) {
    const g = GAME_MODES.includes(game) ? game : DEFAULT_GAME;
    const s = SUBVIEWS.includes(subview) ? subview : null;
    return s ? `/${g}/${s}` : `/${g}`;
  }

  function paramsFromSearch(search) {
    const out = {};
    const sp = new URLSearchParams(search || '');
    for (const [k, v] of sp.entries()) out[k] = v;
    return out;
  }

  function buildQueryString(params) {
    if (!params) return '';
    const sp = new URLSearchParams();
    Object.keys(params).forEach(key => {
      const value = params[key];
      if (value === undefined || value === null || value === '') return;
      sp.append(key, String(value));
    });
    const qs = sp.toString();
    return qs ? '?' + qs : '';
  }

  function pushRoute(game, subview, params) {
    const target = buildPath(game, subview) + buildQueryString(params);
    const current = window.location.pathname + window.location.search;
    if (current === target) return;
    try {
      history.pushState({ game, subview, params: params || {} }, '', target);
    } catch (e) {
      // pushState throws on file:// URLs — safe to ignore for local testing
    }
  }

  function isGameMode(view) {
    return GAME_MODES.includes(view);
  }

  function init({ onRoute }) {
    const { game, subview } = parsePath(window.location.pathname);
    const params = paramsFromSearch(window.location.search);
    // Canonicalize the URL on first load (e.g. "/" → "/name-the-notes")
    // so the address bar always matches the active view.
    const canonical = buildPath(game, subview) + buildQueryString(params);
    try {
      history.replaceState({ game, subview, params }, '', canonical);
    } catch (e) {}
    onRoute({ game, subview, params, source: 'initial' });

    window.addEventListener('popstate', e => {
      const path = parsePath(window.location.pathname);
      const game = e.state?.game || path.game;
      const subview = (e.state?.subview !== undefined) ? e.state.subview : path.subview;
      const params = e.state?.params || paramsFromSearch(window.location.search);
      onRoute({ game, subview, params, source: 'popstate' });
    });
  }

  window.router = {
    init,
    pushRoute,
    parsePath,
    paramsFromSearch,
    isGameMode,
    GAME_MODES,
    SUBVIEWS,
    DEFAULT_GAME,
  };
})();
