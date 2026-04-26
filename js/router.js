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

  function pushView(view) {
    const slug = SLUG_BY_VIEW[view] || '/';
    if (window.location.pathname === slug) return;
    try {
      history.pushState({ view }, '', slug);
    } catch (e) {
      // pushState throws on file:// URLs — safe to ignore for local testing
    }
  }

  function init({ onRoute }) {
    const initial = viewFromPath(window.location.pathname);
    // Replace state so popstate has something to read if user goes back to entry
    try {
      history.replaceState({ view: initial }, '', window.location.pathname);
    } catch (e) {}
    onRoute(initial, { source: 'initial' });

    window.addEventListener('popstate', e => {
      const view = e.state?.view || viewFromPath(window.location.pathname);
      onRoute(view, { source: 'popstate' });
    });
  }

  window.router = {
    init,
    pushView,
    viewFromPath,
    isGameMode,
    GAME_MODES,
    DEFAULT_VIEW,
  };
})();
