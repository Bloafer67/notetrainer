// ── staff.js ──────────────────────────────────────────────────────────────
// Handles: staff SVG drawing, key signature data, note position helpers
// Depends on: darkMode (main.js), clef + keyIndex (game state)

// ── Key signature data ────────────────────────────────────────────────────
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

// Staff step positions for key signature symbols
// Step 0 = bottom line, each step = half a gap up
const KS_POSITIONS = {
  treble: { sharps:[8,5,9,6,3,7,4], flats:[4,7,3,6,2,5,1] },
  bass:   { sharps:[6,3,7,4,1,5,2], flats:[2,5,1,4,0,3,6] },
};

// ── Note sets per clef ────────────────────────────────────────────────────
// Each note has a display name and a staff step (0 = bottom line, 8 = top ledger)
const TREBLE_BASE = [
  {name:'E4',step:0},{name:'F4',step:1},{name:'G4',step:2},{name:'A4',step:3},
  {name:'B4',step:4},{name:'C5',step:5},{name:'D5',step:6},{name:'E5',step:7},{name:'F5',step:8},
];
const BASS_BASE = [
  {name:'G2',step:0},{name:'A2',step:1},{name:'B2',step:2},{name:'C3',step:3},
  {name:'D3',step:4},{name:'E3',step:5},{name:'F3',step:6},{name:'G3',step:7},{name:'A3',step:8},
];
const GUITAR_BASE = [
  {name:'E2',step:0},{name:'F2',step:1},{name:'G2',step:2},{name:'A2',step:3},
  {name:'B2',step:4},{name:'C3',step:5},{name:'D3',step:6},{name:'E3',step:7},{name:'F3',step:8},
];

// ── Apply key signature accidentals to a note set ─────────────────────────
// Returns notes with .name (natural, shown on buttons) and
// .actualName (with accidental, used for audio playback)
function applyKey(base, acc) {
  return base.map(n => ({
    name: n.name,
    step: n.step,
    actualName: acc[n.name[0]]
      ? n.name[0] + acc[n.name[0]] + n.name.slice(1)
      : n.name,
  }));
}

// ── Helper: convert staff step → SVG y coordinate ─────────────────────────
function noteYPos(step, topLine, gap) {
  return topLine + 4 * gap - step * (gap / 2);
}

// ── Draw the staff SVG ────────────────────────────────────────────────────
// Called whenever a new note needs to be shown, or when theme changes
function drawStaff(note) {
  const svg = document.getElementById('staff-svg');
  svg.innerHTML = '';

  const topLine = 25, gap = 12;
  const ns = 'http://www.w3.org/2000/svg';

  // Colours change with dark mode
  const lineCol   = darkMode ? '#666' : '#888';
  const clefCol   = darkMode ? '#aaa' : '#666';
  const ledgerCol = darkMode ? '#999' : '#444';
  const noteCol   = darkMode ? '#e0dfd8' : '#1a1a18';
  const accCol    = darkMode ? '#aaa' : '#444';

  // Convenience: create an SVG element with attributes + optional text
  function el(tag, attrs, text) {
    const e = document.createElementNS(ns, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    if (text !== undefined) e.textContent = text;
    return e;
  }

  // Five staff lines
  for (let i = 0; i < 5; i++) {
    const y = topLine + i * gap;
    svg.appendChild(el('line', {
      x1:40, x2:300, y1:y, y2:y,
      stroke:lineCol, 'stroke-width':'1',
    }));
  }

  // Clef symbol
  if (clef === 'bass') {
    svg.appendChild(el('text', {x:'8', y:topLine+gap*2, 'font-size':'30', fill:clefCol}, '𝄢'));
  } else {
    svg.appendChild(el('text', {x:'8', y:topLine+gap*4+4, 'font-size':'52', fill:clefCol}, '𝄞'));
    if (clef === 'guitar') {
      svg.appendChild(el('text', {
        x:'18', y:topLine+gap*4+18,
        'font-size':'10', fill:clefCol, 'font-weight':'500',
      }, '8'));
    }
  }

  // Key signature accidentals
  const acc = KEY_SIGS[keyIndex].acc;
  const accLetters = Object.keys(acc);
  if (accLetters.length > 0) {
    const isSharp = acc[accLetters[0]] === '#';
    const clefType = clef === 'bass' ? 'bass' : 'treble';
    const positions = isSharp
      ? KS_POSITIONS[clefType].sharps
      : KS_POSITIONS[clefType].flats;
    const symbol = isSharp ? '♯' : '♭';
    let ksx = 46;
    accLetters.forEach((_, i) => {
      const ky = noteYPos(positions[i], topLine, gap);
      svg.appendChild(el('text', {
        x:ksx, y:ky+5,
        'font-size':'12', fill:accCol, 'font-weight':'500',
      }, symbol));
      ksx += 10;
    });
  }

  // Note head and stem
  const noteCx = accLetters.length > 0 ? 185 : 170;
  const cy = noteYPos(note.step, topLine, gap);
  const r  = 7;

  // Ledger lines (bottom and top)
  if (note.step === 0) {
    svg.appendChild(el('line', {
      x1:noteCx-r-4, x2:noteCx+r+4, y1:cy, y2:cy,
      stroke:ledgerCol, 'stroke-width':'1.5',
    }));
  }
  if (note.step === 8) {
    const ly = topLine - gap;
    svg.appendChild(el('line', {
      x1:noteCx-r-4, x2:noteCx+r+4, y1:ly, y2:ly,
      stroke:ledgerCol, 'stroke-width':'1.5',
    }));
  }

  // Ellipse note head (slightly rotated)
  svg.appendChild(el('ellipse', {
    cx:noteCx, cy,
    rx:r, ry:Math.round(r*0.72),
    fill:noteCol,
    transform:`rotate(-15,${noteCx},${cy})`,
  }));

  // Stem (up for lower notes, down for upper)
  const stemUp = note.step < 4;
  svg.appendChild(el('line', {
    x1: stemUp ? noteCx+r-1 : noteCx-r+1,
    x2: stemUp ? noteCx+r-1 : noteCx-r+1,
    y1: cy,
    y2: stemUp ? cy-32 : cy+32,
    stroke:noteCol, 'stroke-width':'1.5',
  }));
}
