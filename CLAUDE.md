# NoteTrainer

Browser-based music note training game. No build system — plain HTML/CSS/JS served via Vercel.

## Architecture

Single `index.html` with all JS loaded via `<script>` tags **in order** (no bundler, no modules). Load order matters and is documented in `index.html` comments:

1. `Tone.js` (CDN) — audio synthesis
2. `js/staff.js` — note data, key signatures, SVG staff drawing
3. `js/audio/synth.js` — `playNote()`, uses `NOTE_FREQS` from staff.js
4. `js/audio/pitch.js` — `startPitchDetection()`, standalone mic/pitch detection
5. `js/leaderboard.js` — `saveToLeaderboard()`, `fetchLeaderboard()`
6. `js/games/name-the-notes.js` — tap-to-answer game
7. `js/games/play-the-notes.js` — sing/play pitch to advance
8. `js/songs/dinks-song.js` — `SONGS` object (song data)
9. `js/games/play-along.js` — scrolling staff with pitch detection
10. `js/main.js` — theme, mute, tabs, routing, shared UI helpers

All globals are shared via `window`. No imports/exports.

## Game Modes

- **Name the Notes** (`/name-the-notes`) — note appears on staff, tap the correct name from buttons
- **Play the Notes** (`/play-the-notes`) — note appears, sing or play it; pitch detection advances the game
- **Play Along** (`/play-along`) — notes scroll right-to-left past a fixed playhead; play each pitch to light it up and advance

## Key Concepts

### Staff / Note Data (`staff.js`)
- Step system: step 0 = bottom staff line, each step = one diatonic position
- Treble: E4 (step 0) – F5 (step 8)
- Bass: G2 (step 0) – A3 (step 8)
- Guitar 8vb: treble clef with "8" below — written in treble range but sounds an octave lower. Each note has `name` (written), `step` (treble position), `soundName` (sounding pitch for detection)
- `KEY_SIGS` array — 9 keys (C, G, D, A, E, F, Bb, Eb, Ab); `keyIndex` selects active key
- `applyKey(base, acc)` maps note array through the active key signature

### Pitch Detection (`pitch.js`)
- Uses Web Audio API + `AnalyserNode`
- Called via `startPitchDetection(callback)` — callback receives `{ hz, cents }` each frame
- Tolerance for hits defined per-game (e.g. `PA_HIT_CENTS = 80` in play-along)

### Play Along Song Format (`js/songs/`)
Songs live in the `SONGS` global object. Each song has:
```js
SONGS['song-key'] = {
  meta: { title: 'Song Title', key: 'C', clef: 'treble', bpm: 120 },
  notes: [ { name: 'E4', step: 0, beats: 1 }, ... ]
}
```

### Routing
Vercel rewrites `/name-the-notes`, `/play-the-notes`, `/play-along` → `index.html`. Client-side routing uses `history.pushState`.

### Persistence
- `localStorage` keys: `mntr-dark`, `mntr-muted`, `mntr-show-names`
- High scores and leaderboard via `leaderboard.js` (external backend)

## Adding a New Song
1. Create `js/songs/your-song.js` defining an entry in `SONGS`
2. Add a `<script src="js/songs/your-song.js">` tag in `index.html` **before** `play-along.js`

## Adding a New Game Mode
1. Create `js/games/your-mode.js` with an `initYourMode()` function
2. Add script tag in `index.html` after `pitch.js` and before `main.js`
3. Add an `<option>` to `#game-mode-select` in `index.html`
4. Wire into `GAME_MODE_CONFIG` in `main.js`
5. Call `initYourMode()` in the inline init block at the bottom of `index.html`

## Deployment
Vercel — push to `main` auto-deploys. Config in `vercel.json`.
