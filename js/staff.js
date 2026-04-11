// ── staff.js ──────────────────────────────────────────────────────────────
// Staff drawing, key signatures, note data
// Step system: step 0 = bottom line (E4 treble / G2 bass / E2 guitar)
// Each step = half a gap. Steps go negative (below staff) and above 8 (above staff).
// Guitar 8vb uses the same visual positions as treble but sounds an octave lower.

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

// ── Note sets ─────────────────────────────────────────────────────────────
// Treble: E4 (step 0) through F5 (step 8)
const TREBLE_BASE = [
  {name:'E4',step:0},{name:'F4',step:1},{name:'G4',step:2},{name:'A4',step:3},
  {name:'B4',step:4},{name:'C5',step:5},{name:'D5',step:6},{name:'E5',step:7},{name:'F5',step:8},
];

// Bass: G2 (step 0) through A3 (step 8)
const BASS_BASE = [
  {name:'G2',step:0},{name:'A2',step:1},{name:'B2',step:2},{name:'C3',step:3},
  {name:'D3',step:4},{name:'E3',step:5},{name:'F3',step:6},{name:'G3',step:7},{name:'A3',step:8},
];

// Guitar 8vb: full 6-string standard tuning range
// Visual positions same as treble; sounds an octave lower (shown by the "8" under clef)
// Low E2 (step -2, ledger below) through High E4 (step 14, ledger above)
// We use a subset for Name the Notes, but PTN exposes the full range.
const GUITAR_BASE = [
  // Below staff (ledger lines needed)
  {name:'E2',step:-2},{name:'F2',step:-1},
  // On staff
  {name:'G2',step:0},{name:'A2',step:1},{name:'B2',step:2},{name:'C3',step:3},
  {name:'D3',step:4},{name:'E3',step:5},{name:'F3',step:6},{name:'G3',step:7},{name:'A3',step:8},
  // Above staff (ledger lines needed)
  {name:'B3',step:9},{name:'C4',step:10},{name:'D4',step:11},
  {name:'E4',step:12},{name:'F4',step:13},{name:'G4',step:14},
];

// Subset used by Name the Notes (keeps it on/near the staff — manageable for reading)
const GUITAR_GAME_BASE = [
  {name:'E2',step:-2},{name:'F2',step:-1},
  {name:'G2',step:0},{name:'A2',step:1},{name:'B2',step:2},{name:'C3',step:3},
  {name:'D3',step:4},{name:'E3',step:5},{name:'F3',step:6},{name:'G3',step:7},{name:'A3',step:8},
  {name:'B3',step:9},{name:'C4',step:10},
];

function applyKey(base, acc) {
  return base.map(n => ({
    name: n.name,
    step: n.step,
    actualName: acc[n.name[0]]
      ? n.name[0] + acc[n.name[0]] + n.name.slice(1)
      : n.name,
  }));
}

// Convert staff step → SVG y coordinate
function noteYPos(step, topLine, gap) {
  return topLine + 4 * gap - step * (gap / 2);
}

// ── Draw staff ────────────────────────────────────────────────────────────
function drawStaff(note, opts = {}) {
  const svg = document.getElementById('staff-svg');
  svg.innerHTML = '';

  const topLine = 35, gap = 12; // moved topLine down a bit to give room above staff
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

  // Ledger lines — draw one for each ledger position needed
  // Below staff: steps -2, -4 etc. (even = line, odd = space between lines)
  // Above staff: steps 10, 12 etc.
  // Step 0 = bottom line, step 8 = top line. Ledger lines at -2, -4, 10, 12...
  const ledgerSteps = [];
  for (let s = -2; s >= note.step; s -= 2) ledgerSteps.push(s);
  for (let s = 10; s <= note.step; s += 2) ledgerSteps.push(s);
  // Also add ledger for step 0 (below-staff note sits on ledger line)
  if (note.step === 0) ledgerSteps.push(0);

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
    const labelY = stemUp ? cy + r + 14 : cy - r - 6;
    svg.appendChild(el('text', {
      x:noteCx, y:labelY,
      'font-size':'11', 'font-weight':'600',
      fill:'#185FA5', 'text-anchor':'middle',
      'font-family':'-apple-system,BlinkMacSystemFont,sans-serif',
    }, note.name));
  }
}
