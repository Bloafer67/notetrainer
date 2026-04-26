// ── router.js ─────────────────────────────────────────────────────────────
// Single source of truth for URL ⇄ view mapping.
// Other modules go through window.router instead of touching history/location.
//
// A "view" is either a game-mode slug ('name-the-notes', 'play-the-notes',
// 'play-along', 'bursts', 'intervals') or 'leaderboard'.

(function () {
  const GAME_MODES = ['name-the-notes', 'play-the-notes', 'play-along', 'bursts', 'intervals'];
  const DEFAULT_VIEW = 'name-the-notes';

  const SLUG_BY_VIEW = {
    'name-the-notes': '/name-the-notes',
    'play-the-notes': '/play-the-notes',
    'play-along':     '/play-along',
    'bursts':         '/bursts',
    'intervals':      '/intervals',
    'leaderboard':    '/leaderboard',
  };

  const VIEW_BY_SLUG = Object.fromEntries(
    Object.entries(SLUG_BY_VIEW).map(([view, slug]) => [slug, view])
  );
  VIEW_BY_SLUG['/'] = DEFAULT_VIEW;

  function viewFromPath(pathname) {
    return VIEW_BY_SLUG[pathname] || DEFAULT_VIEW;
  }

  function isGameMode(view) {
    return GAME_MODES.includes(view);
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

  function pushView(view, params) {
    const slug = SLUG_BY_VIEW[view] || '/';
    const target = slug + buildQueryString(params);
    const current = window.location.pathname + window.location.search;
    if (current === target) return;
    try {
      history.pushState({ view, params: params || {} }, '', target);
    } catch (e) {
      // pushState throws on file:// URLs — safe to ignore for local testing
    }
  }

  function init({ onRoute }) {
    const initial = viewFromPath(window.location.pathname);
    const initialParams = paramsFromSearch(window.location.search);
    // Replace state so popstate has something to read if user goes back to entry
    try {
      history.replaceState(
        { view: initial, params: initialParams },
        '',
        window.location.pathname + window.location.search
      );
    } catch (e) {}
    onRoute(initial, { params: initialParams, source: 'initial' });

    window.addEventListener('popstate', e => {
      const view = e.state?.view || viewFromPath(window.location.pathname);
      const params = e.state?.params || paramsFromSearch(window.location.search);
      onRoute(view, { params, source: 'popstate' });
    });
  }

  window.router = {
    init,
    pushView,
    viewFromPath,
    paramsFromSearch,
    isGameMode,
    GAME_MODES,
    DEFAULT_VIEW,
  };
})();
