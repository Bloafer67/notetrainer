// ── js/songs/dinks-song.js ────────────────────────────────────────────────
// Song registry entry. Actual notation lives in the .musicxml file, rendered
// by OpenSheetMusicDisplay. Metadata here is anything OSMD doesn't cover
// (e.g. guitarOctave: detect pitch one octave below what's written).

const SONGS = {
  'dinks-song': {
    meta: {
      title:        "Dink's Song",
      subtitle:     "Fare Thee Well",
      credit:       "Traditional — Public Domain",
      guitarOctave: true,
    },
    xmlPath: 'js/songs/dinks-song.musicxml',
  },
};
