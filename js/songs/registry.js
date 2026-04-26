// ── js/songs/registry.js ──────────────────────────────────────────────────
// Song registry. Notation lives in each .musicxml file (rendered by OSMD);
// metadata here is anything OSMD doesn't cover (e.g. guitarOctave: detect
// pitch one octave below what's written).
//
// To add a song:
//   1. Drop the .musicxml file in this directory.
//   2. Add an entry below keyed by a url-safe slug.

const SONGS = {
  'dinks-song': {
    meta: {
      title:        "Dink's Song",
      subtitle:     "Fare Thee Well",
      credit:       "Traditional — Public Domain",
      guitarOctave: true,
    },
    xmlPath: '/js/songs/dinks-song.musicxml',
  },
  'going-to-the-west': {
    meta: {
      title:        "Going to the West",
      credit:       "Traditional — Public Domain",
      guitarOctave: true,
    },
    xmlPath: '/js/songs/going-to-the-west.musicxml',
  },
  'i-know-you-rider': {
    meta: {
      title:        "I Know You Rider",
      credit:       "Traditional — Public Domain",
      guitarOctave: true,
    },
    xmlPath: '/js/songs/i-know-you-rider.musicxml',
  },
};
