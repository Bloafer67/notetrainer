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

const BOOMWHACKER_PALETTE = {
  C: { noteFill:'#F15B5B', noteStroke:'#A52B2B', label:'#A52B2B', buttonBg:'#F15B5B', buttonText:'#FFFFFF', pitch:'#D94848' },
  D: { noteFill:'#F59D3D', noteStroke:'#B45C05', label:'#9A4F00', buttonBg:'#F59D3D', buttonText:'#FFFFFF', pitch:'#D47F1F' },
  E: { noteFill:'#F8D64E', noteStroke:'#9B7700', label:'#856600', buttonBg:'#F8D64E', buttonText:'#4F3C00', pitch:'#D1AF21' },
  F: { noteFill:'#62BA63', noteStroke:'#1F7A30', label:'#1F7A30', buttonBg:'#62BA63', buttonText:'#FFFFFF', pitch:'#44A146' },
  G: { noteFill:'#2FC2E8', noteStroke:'#0C78A6', label:'#0C78A6', buttonBg:'#2FC2E8', buttonText:'#FFFFFF', pitch:'#1AA5CD' },
  A: { noteFill:'#4F7CFF', noteStroke:'#2149A6', label:'#2149A6', buttonBg:'#4F7CFF', buttonText:'#FFFFFF', pitch:'#3E68E1' },
  B: { noteFill:'#AE63D7', noteStroke:'#6D338D', label:'#6D338D', buttonBg:'#AE63D7', buttonText:'#FFFFFF', pitch:'#924DC0' },
};

function getNoteLetter(noteOrName) {
  const name = typeof noteOrName === 'string'
    ? noteOrName
    : noteOrName?.name || noteOrName?.actualName || '';
  return String(name).charAt(0).toUpperCase();
}

function getNotePalette(noteOrName) {
  const monoPitch = '#0171E3';
  const monoNote = darkMode ? '#e0dfd8' : '#1a1a18';
  const monoLabel = darkMode ? '#8AC6FF' : '#0171E3';
  const mono = {
    noteFill: monoNote,
    noteStroke: monoNote,
    label: monoLabel,
    buttonBg: monoPitch,
    buttonText: '#FFFFFF',
    pitch: monoPitch,
  };
  if (!window.boomwhackerMode) return mono;
  return BOOMWHACKER_PALETTE[getNoteLetter(noteOrName)] || mono;
}
