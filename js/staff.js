// ── staff.js ──────────────────────────────────────────────────────────────
// Staff drawing, key signatures, note data
// Step system: step 0 = bottom line (E4 treble / G2 bass)
// Guitar 8vb: written in treble range (step 0 = E4 written) but sounds an octave lower.
// Written E4 → sounds E3, written A4 → sounds A3, etc.
// This matches standard guitar notation (treble clef with "8" underneath).

const KEY_SIGS = [
  { label:'C major', short:'C',  acc:{} },
  { label:'G major', short:'G',  acc:{F:'#'} },
  { label:'D major', short:'D',  acc:{F:'#',C:'#'} },
  { label:'A major', short:'A',  acc:{F:'#',C:'#',G:'#'} },
  { label:'E major', short:'E',  acc:{F:'#',C:'#',G:'#',D:'#'} },
  { label:'F major', short:'F',  acc:{B:'b'} },
  { label:'Bb major',short:'Bb', acc:{B:'b',E:'b'} },
  { label:'Eb major',short:'Eb', acc:{B:'b',E:'b',A:'b'} },
  { label:'Ab major',short:'Ab', acc:{B:'b',E:'b',A:'b',D:'b'} },
];

// ── Drill note sets ───────────────────────────────────────────────────────
// Step 0 = bottom line for the active clef. Staff-only keeps notes on the
// 5-line staff; full-range adds ledger lines above and below.
const TREBLE_STAFF_BASE = [
  {name:'E4',step:0},{name:'F4',step:1},{name:'G4',step:2},{name:'A4',step:3},
  {name:'B4',step:4},{name:'C5',step:5},{name:'D5',step:6},{name:'E5',step:7},{name:'F5',step:8},
];

const TREBLE_FULL_BASE = [
  {name:'F3',step:-6},{name:'G3',step:-5},{name:'A3',step:-4},{name:'B3',step:-3},
  {name:'C4',step:-2},{name:'D4',step:-1},{name:'E4',step:0},{name:'F4',step:1},
  {name:'G4',step:2},{name:'A4',step:3},{name:'B4',step:4},{name:'C5',step:5},
  {name:'D5',step:6},{name:'E5',step:7},{name:'F5',step:8},{name:'G5',step:9},
  {name:'A5',step:10},{name:'B5',step:11},{name:'C6',step:12},{name:'D6',step:13},
  {name:'E6',step:14},
];

const BASS_STAFF_BASE = [
  {name:'G2',step:0},{name:'A2',step:1},{name:'B2',step:2},{name:'C3',step:3},
  {name:'D3',step:4},{name:'E3',step:5},{name:'F3',step:6},{name:'G3',step:7},{name:'A3',step:8},
];

const BASS_FULL_BASE = [
  {name:'A1',step:-6},{name:'B1',step:-5},{name:'C2',step:-4},{name:'D2',step:-3},
  {name:'E2',step:-2},{name:'F2',step:-1},{name:'G2',step:0},{name:'A2',step:1},
  {name:'B2',step:2},{name:'C3',step:3},{name:'D3',step:4},{name:'E3',step:5},
  {name:'F3',step:6},{name:'G3',step:7},{name:'A3',step:8},{name:'B3',step:9},
  {name:'C4',step:10},{name:'D4',step:11},{name:'E4',step:12},{name:'F4',step:13},
  {name:'G4',step:14},
];

// Guitar 8vb: treble clef + "8" underneath.
// Notes are written at treble positions but sound one octave lower.
// name = written name (what appears on staff / answer buttons)
// step = treble staff position (0=E4 bottom line, 4=B4 middle line, 7=E5 top space)
// soundName = sounding pitch used for NOTE_FREQS detection (one octave lower)
//
// Open strings on treble staff:
//   Low E: written E3 (step -7), sounds E2 (82Hz)
//   A:     written A3 (step -4), sounds A2 (110Hz)
//   D:     written D4 (step -1), sounds D3 (147Hz)
//   G:     written G4 (step  2), sounds G3 (196Hz)
//   B:     written B4 (step  4), sounds B3 (247Hz)  ← middle line!
//   Hi E:  written E5 (step  7), sounds E4 (330Hz)
const GUITAR_FULL_BASE = [
  {name:'E3', step:-7, soundName:'E2'},
  {name:'F3', step:-6, soundName:'F2'},
  {name:'G3', step:-5, soundName:'G2'},
  {name:'A3', step:-4, soundName:'A2'},
  {name:'B3', step:-3, soundName:'B2'},
  {name:'C4', step:-2, soundName:'C3'},
  {name:'D4', step:-1, soundName:'D3'},
  {name:'E4', step:0,  soundName:'E3'},
  {name:'F4', step:1,  soundName:'F3'},
  {name:'G4', step:2,  soundName:'G3'},
  {name:'A4', step:3,  soundName:'A3'},
  {name:'B4', step:4,  soundName:'B3'},
  {name:'C5', step:5,  soundName:'C4'},
  {name:'D5', step:6,  soundName:'D4'},
  {name:'E5', step:7,  soundName:'E4'},
  {name:'F5', step:8,  soundName:'F4'},
  {name:'G5', step:9,  soundName:'G4'},
  {name:'A5', step:10, soundName:'A4'},
  {name:'B5', step:11, soundName:'B4'},
  {name:'C6', step:12, soundName:'C5'},
  {name:'D6', step:13, soundName:'D5'},
  {name:'E6', step:14, soundName:'E5'},
];

const GUITAR_STAFF_BASE = [
  {name:'A3', step:-4, soundName:'A2'},
  {name:'B3', step:-3, soundName:'B2'},
  {name:'C4', step:-2, soundName:'C3'},
  {name:'D4', step:-1, soundName:'D3'},
  {name:'E4', step:0,  soundName:'E3'},
  {name:'F4', step:1,  soundName:'F3'},
  {name:'G4', step:2,  soundName:'G3'},
  {name:'A4', step:3,  soundName:'A3'},
  {name:'B4', step:4,  soundName:'B3'},
  {name:'C5', step:5,  soundName:'C4'},
  {name:'D5', step:6,  soundName:'D4'},
  {name:'E5', step:7,  soundName:'E4'},
];

const DRILL_RANGE_MODES = {
  'staff-only': { label:'Staff Only' },
  'full-range': { label:'Full Range' },
};

const DRILL_NOTE_BASES = {
  treble: {
    'staff-only': TREBLE_STAFF_BASE,
    'full-range': TREBLE_FULL_BASE,
  },
  bass: {
    'staff-only': BASS_STAFF_BASE,
    'full-range': BASS_FULL_BASE,
  },
  guitar: {
    'staff-only': GUITAR_STAFF_BASE,
    'full-range': GUITAR_FULL_BASE,
  },
};

function getDrillBaseNotes(clefName, rangeMode = 'staff-only') {
  const byClef = DRILL_NOTE_BASES[clefName] || DRILL_NOTE_BASES.treble;
  return byClef[rangeMode] || byClef['staff-only'];
}

function getDrillNotes(clefName, keySigIndex, rangeMode = 'staff-only') {
  const keySig = KEY_SIGS[keySigIndex] || KEY_SIGS[0];
  return applyKey(getDrillBaseNotes(clefName, rangeMode), keySig.acc);
}

function getDrillRangeLabel(rangeMode) {
  return DRILL_RANGE_MODES[rangeMode]?.label || DRILL_RANGE_MODES['staff-only'].label;
}

function applyKey(base, acc) {
  return base.map(n => {
    // For guitar 8vb: written name (n.name) is on treble staff,
    // soundName is one octave lower (actual pitch for detection).
    // actualName = the sounding note name with key sig applied.
    const baseSoundName = n.soundName || n.name; // fall back to name for treble/bass
    const letter = baseSoundName[0];
    const actualName = acc[letter]
      ? letter + acc[letter] + baseSoundName.slice(1)
      : baseSoundName;
    return {
      name: n.name,        // written name shown on buttons and staff label
      step: n.step,
      actualName,          // sounding name used for NOTE_FREQS lookup
    };
  });
}

function themeStyles() {
  return getComputedStyle(document.documentElement);
}

function resolveThemeValue(value, styles, seen = new Set()) {
  const trimmed = String(value || '').trim();
  const refMatch = /^var\((--[A-Za-z0-9_-]+)\)$/.exec(trimmed);
  if (!refMatch) return trimmed;
  const refName = refMatch[1].slice(2);
  if (seen.has(refName)) return '';
  seen.add(refName);
  return resolveThemeValue(styles.getPropertyValue(refMatch[1]), styles, seen);
}

function themeColor(token, styles = themeStyles()) {
  const name = String(token || '').replace(/^--/, '');
  return resolveThemeValue(styles.getPropertyValue(`--${name}`), styles, new Set([name]));
}

function notePaletteFromTokens(prefix, styles) {
  return {
    noteFill: themeColor(`${prefix}-note-fill`, styles),
    noteStroke: themeColor(`${prefix}-note-stroke`, styles),
    label: themeColor(`${prefix}-label`, styles),
    buttonBg: themeColor(`${prefix}-button-bg`, styles),
    buttonText: themeColor(`${prefix}-button-text`, styles),
    pitch: themeColor(`${prefix}-pitch`, styles),
  };
}

function getNoteLetter(noteOrName) {
  const name = typeof noteOrName === 'string'
    ? noteOrName
    : noteOrName?.name || noteOrName?.actualName || '';
  return String(name).charAt(0).toUpperCase();
}

function getNotePalette(noteOrName) {
  const styles = themeStyles();
  const mono = {
    noteFill: themeColor('note-mono-fill', styles),
    noteStroke: themeColor('note-mono-fill', styles),
    label: themeColor('note-mono-label', styles),
    buttonBg: themeColor('note-mono-pitch', styles),
    buttonText: themeColor('on-primary', styles),
    pitch: themeColor('note-mono-pitch', styles),
  };
  if (!window.boomwhackerMode) return mono;
  const letter = getNoteLetter(noteOrName).toLowerCase();
  if (!letter) return mono;
  const tokenPrefix = `boom-${letter}`;
  if (!themeColor(`${tokenPrefix}-note-fill`, styles)) return mono;
  return notePaletteFromTokens(tokenPrefix, styles);
}

window.themeColor = themeColor;
