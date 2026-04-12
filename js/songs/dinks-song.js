// ── js/songs/dinks-song.js ────────────────────────────────────────────────
// "Dink's Song" (Fare Thee Well) — Traditional, Public Domain
// Transcribed from sheet music provided by user
//
// Original key: C major
// Alternate key: A major (shown on score)
// Time: 4/4
//
// Structure:
//   Verse  (mm. 1–8):  "If I had wings like Noah's dove..."
//   Chorus (mm. 9–14): "Fare thee well, Oh honey..."
//
// Chord progression (C major):
//   I=C, IV=F, V=G, vi=Am
//
// Nashville numbers:
//   C=I, F=IV, G=V, Am=vi

const SONGS = {
  'dinks-song': {
    meta: {
      title:    "Dink's Song",
      subtitle: "Fare Thee Well",
      credit:   "Traditional — Public Domain",
      key:      'C',
      time:     '4/4',
      tempo:    72,
      clef:     'treble',
      guitarOctave: true,  // detect one octave lower than written (guitar 8vb)
      sections: [
        { label:'Verse',  startMeasure:1  },
        { label:'Chorus', startMeasure:9  },
      ],
      chords: {
        1:  { display:'C',  nashville:'I'  },
        2:  { display:'C',  nashville:'I'  },
        3:  { display:'F',  nashville:'IV' },
        4:  { display:'C',  nashville:'I'  },
        5:  { display:'Am', nashville:'vi' },
        6:  { display:'Am', nashville:'vi' },
        7:  { display:'F',  nashville:'IV' },
        8:  { display:'C',  nashville:'I'  },
        9:  { display:'G',  nashville:'V'  },
        10: { display:'Am', nashville:'vi' },
        11: { display:'F',  nashville:'IV' },
        12: { display:'C',  nashville:'I'  },
        13: { display:'G',  nashville:'V'  },
        14: { display:'C',  nashville:'I'  },
      },
    },

    // ── Notes ──────────────────────────────────────────────────────────────
    // pitch: scientific notation | dur: w/h/q/e | beats: float | measure, beat
    notes: [

      // ══ VERSE ══════════════════════════════════════════════════════════

      // Measure 1 — C  "If I had wings"
      { pitch:'C4', dur:'q', beats:1, measure:1, beat:1 },
      { pitch:'C4', dur:'q', beats:1, measure:1, beat:2 },
      { pitch:'E4', dur:'q', beats:1, measure:1, beat:3 },
      { pitch:'G4', dur:'q', beats:1, measure:1, beat:4 },

      // Measure 2 — C  "like Noah's dove"
      { pitch:'A4', dur:'h', beats:2, measure:2, beat:1 },
      { pitch:'B4', dur:'q', beats:1, measure:2, beat:3 },
      { pitch:'B4', dur:'q', beats:1, measure:2, beat:4 },

      // Measure 3 — F  (held note, tied — "wings___")
      { pitch:'A4', dur:'w', beats:4, measure:3, beat:1 },

      // Measure 4 — C  "Like No-ah's dove"
      { pitch:'B4', dur:'q', beats:1, measure:4, beat:1 },
      { pitch:'B4', dur:'q', beats:1, measure:4, beat:2 },
      { pitch:'A4', dur:'q', beats:1, measure:4, beat:3 },
      { pitch:'E4', dur:'q', beats:1, measure:4, beat:4 },

      // Measure 5 — Am  "I'd fly up the riv-"
      { pitch:'E4', dur:'e', beats:0.5, measure:5, beat:1   },
      { pitch:'E4', dur:'e', beats:0.5, measure:5, beat:1.5 },
      { pitch:'G4', dur:'e', beats:0.5, measure:5, beat:2   },
      { pitch:'C4', dur:'e', beats:0.5, measure:5, beat:2.5 },
      { pitch:'E4', dur:'q', beats:1,   measure:5, beat:3   },
      { pitch:'E4', dur:'q', beats:1,   measure:5, beat:4   },

      // Measure 6 — Am  "-er___" (tied)
      { pitch:'E4', dur:'h', beats:2, measure:6, beat:1 },
      { pitch:'E4', dur:'h', beats:2, measure:6, beat:3 },

      // Measure 7 — F  "To the one I love."
      { pitch:'E4', dur:'q', beats:1,   measure:7, beat:1 },
      { pitch:'E4', dur:'e', beats:0.5, measure:7, beat:2 },
      { pitch:'E4', dur:'e', beats:0.5, measure:7, beat:2.5 },
      { pitch:'A4', dur:'q', beats:1,   measure:7, beat:3 },
      { pitch:'E4', dur:'q', beats:1,   measure:7, beat:4 },

      // Measure 8 — C  (cadence — half notes)
      { pitch:'E4', dur:'h', beats:2, measure:8, beat:1 },
      { pitch:'A4', dur:'h', beats:2, measure:8, beat:3 },

      // ══ CHORUS ═════════════════════════════════════════════════════════

      // Measure 9 — G  "Fare thee well,"
      { pitch:null, dur:'q', beats:1, measure:9, beat:1 }, // rest
      { pitch:'E4', dur:'q', beats:1, measure:9, beat:2 },
      { pitch:'E4', dur:'q', beats:1, measure:9, beat:3 },
      { pitch:'C4', dur:'q', beats:1, measure:9, beat:4 },

      // Measure 10 — Am  (sustained then pickup)
      { pitch:'C4', dur:'h', beats:2, measure:10, beat:1 },
      { pitch:null, dur:'q', beats:1, measure:10, beat:3 }, // rest
      { pitch:'A4', dur:'q', beats:1, measure:10, beat:4 },

      // Measure 11 — F  "Oh, hon-ey___"
      { pitch:'G4', dur:'q', beats:1, measure:11, beat:1 },
      { pitch:'E4', dur:'q', beats:1, measure:11, beat:2 },
      { pitch:'E4', dur:'q', beats:1, measure:11, beat:3 },
      { pitch:'E4', dur:'q', beats:1, measure:11, beat:4 },

      // Measure 12 — C  (held A, "hon-ey___")
      { pitch:'A4', dur:'h', beats:2, measure:12, beat:1 },
      { pitch:'A4', dur:'h', beats:2, measure:12, beat:3 },

      // Measure 13 — G  "fare" (dotted half)
      { pitch:null, dur:'q', beats:1,   measure:13, beat:1 }, // rest
      { pitch:'E4', dur:'h.', beats:3,  measure:13, beat:2 },

      // Measure 14 — C  "thee well___" (whole, tied)
      { pitch:'E4', dur:'w', beats:4, measure:14, beat:1 },

      // Final bar — C  (held "well", ties to C)
      { pitch:'C4', dur:'w', beats:4, measure:15, beat:1 },
    ],
  },
};
