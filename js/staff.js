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

const KS_POSITIONS = {
  treble: { sharps:[8,5,9,6,3,7,4], flats:[4,7,3,6,2,5,1] },
  bass:   { sharps:[6,3,7,4,1,5,2], flats:[2,5,1,4,0,3,6] },
};

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

const TREBLE_BASE = TREBLE_STAFF_BASE;

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

const BASS_BASE = BASS_STAFF_BASE;

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

const GUITAR_BASE = GUITAR_FULL_BASE;

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

const GUITAR_GAME_BASE = GUITAR_STAFF_BASE;

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

// Convert staff step → SVG y coordinate
const STAFF_VIEWBOX_WIDTH = 340;
const STAFF_VIEWBOX_HEIGHT = 170;
const STAFF_TOP_LINE = 50;
const STAFF_GAP = 12;

function noteYPos(step, topLine, gap) {
  return topLine + 4 * gap - step * (gap / 2);
}

// ── Draw staff ────────────────────────────────────────────────────────────
function drawStaff(note, opts = {}) {
  const svg = document.getElementById('staff-svg');
  svg.innerHTML = '';
  svg.setAttribute('viewBox', `0 0 ${STAFF_VIEWBOX_WIDTH} ${STAFF_VIEWBOX_HEIGHT}`);

  const topLine = STAFF_TOP_LINE;
  const gap = STAFF_GAP;
  const ns = 'http://www.w3.org/2000/svg';

  const lineCol   = darkMode ? '#666' : '#888';
  const clefCol   = darkMode ? '#aaa' : '#666';
  const ledgerCol = darkMode ? '#999' : '#444';
  const noteCol   = darkMode ? '#e0dfd8' : '#1a1a18';
  const accCol    = darkMode ? '#aaa' : '#444';

  function el(tag, attrs, text) {
    const e = document.createElementNS(ns, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    if (text !== undefined) e.textContent = text;
    return e;
  }

  // Five staff lines
  for (let i = 0; i < 5; i++) {
    const y = topLine + i * gap;
    svg.appendChild(el('line', {x1:40,x2:320,y1:y,y2:y,stroke:lineCol,'stroke-width':'1'}));
  }

  // Clef
  if (clef === 'bass') {
    svg.appendChild(el('text', {x:'8',y:topLine+gap*2,'font-size':'30',fill:clefCol}, '𝄢'));
  } else {
    svg.appendChild(el('text', {x:'8',y:topLine+gap*4+4,'font-size':'52',fill:clefCol}, '𝄞'));
    if (clef === 'guitar') {
      svg.appendChild(el('text', {x:'18',y:topLine+gap*4+18,'font-size':'10',fill:clefCol,'font-weight':'500'}, '8'));
    }
  }

  // Key signature
  const acc = KEY_SIGS[keyIndex].acc;
  const accLetters = Object.keys(acc);
  if (accLetters.length > 0) {
    const isSharp  = acc[accLetters[0]] === '#';
    const clefType = clef === 'bass' ? 'bass' : 'treble';
    const positions = isSharp ? KS_POSITIONS[clefType].sharps : KS_POSITIONS[clefType].flats;
    const symbol = isSharp ? '♯' : '♭';
    let ksx = 46;
    accLetters.forEach((_, i) => {
      const ky = noteYPos(positions[i], topLine, gap);
      svg.appendChild(el('text', {x:ksx,y:ky+5,'font-size':'12',fill:accCol,'font-weight':'500'}, symbol));
      ksx += 10;
    });
  }

  // Note position
  const noteCx = accLetters.length > 0 ? 195 : 180;
  const cy = noteYPos(note.step, topLine, gap);
  const r  = 7;

  // Ledger lines — below staff at steps -2, -4, -6...; above staff at steps 10, 12...
  // Step 0 = E4 (bottom line), step 8 = F5 (top line) — no ledger needed there.
  const ledgerSteps = [];
  for (let s = -2; s >= note.step; s -= 2) ledgerSteps.push(s);
  for (let s = 10; s <= note.step; s += 2) ledgerSteps.push(s);

  [...new Set(ledgerSteps)].forEach(s => {
    const ly = noteYPos(s, topLine, gap);
    svg.appendChild(el('line', {
      x1:noteCx-r-4, x2:noteCx+r+4, y1:ly, y2:ly,
      stroke:ledgerCol, 'stroke-width':'1.5',
    }));
  });

  // Note head
  svg.appendChild(el('ellipse', {
    cx:noteCx, cy,
    rx:r, ry:Math.round(r*0.72),
    fill:noteCol,
    transform:`rotate(-15,${noteCx},${cy})`,
  }));

  // Stem
  const stemUp = note.step < 4;
  svg.appendChild(el('line', {
    x1:stemUp?noteCx+r-1:noteCx-r+1,
    x2:stemUp?noteCx+r-1:noteCx-r+1,
    y1:cy, y2:stemUp?cy-32:cy+32,
    stroke:noteCol,'stroke-width':'1.5',
  }));

  // Note name label (shown in PTN mode or if opts.showLabel)
  if (opts.showLabel) {
    const preferredLabelY = stemUp ? cy + r + 14 : cy - r - 6;
    const labelY = Math.max(12, Math.min(STAFF_VIEWBOX_HEIGHT - 10, preferredLabelY));
    svg.appendChild(el('text', {
      x:noteCx, y:labelY,
      'font-size':'11', 'font-weight':'600',
      fill:'#185FA5', 'text-anchor':'middle',
      'font-family':'-apple-system,BlinkMacSystemFont,sans-serif',
    }, note.name));
  }
}
