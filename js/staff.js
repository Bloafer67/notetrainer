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
const GUITAR_BASE = [
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
];

// Subset for Name the Notes — open strings + nearby notes, all on/near the staff
const GUITAR_GAME_BASE = [
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
function noteYPos(step, topLine, gap) {
  return topLine + 4 * gap - step * (gap / 2);
}

// ── Draw staff (VexFlow) ──────────────────────────────────────────────────
// Convert note name to VexFlow key string: 'C4' → 'c/4', 'Bb4' → 'bb/4'
function noteToVFKey(noteName) {
  const m = noteName.match(/^([A-G])([#b]?)(\d)$/);
  if (!m) return 'c/4';
  return m[1].toLowerCase() + m[2] + '/' + m[3];
}

function drawStaff(note, opts = {}) {
  const container = document.getElementById('staff-container');
  if (!container) return;

  // Remove previous VexFlow SVG but keep the overlay
  const prev = container.querySelector('svg:not(#staff-overlay)');
  if (prev) prev.remove();

  const VF = Vex.Flow;
  // Use a taller canvas so ledger lines below the staff aren't clipped
  const W = 400, H = 160;

  const renderer = new VF.Renderer(container, VF.Renderer.Backends.SVG);
  renderer.resize(W, H);
  const context = renderer.getContext();

  // Make VexFlow SVG responsive and sit behind the overlay
  const svgEl = container.querySelector('svg:not(#staff-overlay)');
  if (svgEl) {
    svgEl.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svgEl.style.width   = '100%';
    svgEl.style.height  = 'auto';
    svgEl.style.display = 'block';
    container.insertBefore(svgEl, container.querySelector('#staff-overlay'));
  }

  // Keep overlay viewBox in sync
  const overlay = document.getElementById('staff-overlay');
  if (overlay) overlay.setAttribute('viewBox', `0 0 ${W} ${H}`);

  const isDark  = darkMode;
  const noteCol = isDark ? '#e0dfd8' : '#1a1a18';
  const clefCol = isDark ? '#aaa'    : '#555';

  context.setStrokeStyle(isDark ? '#555' : '#888');
  context.setFillStyle(clefCol);

  // staveY=30 gives space above for labels; staveW fills width leaving margins
  const staveX = 10, staveY = 30, staveW = W - 20;
  const stave = new VF.Stave(staveX, staveY, staveW);
  stave.setConfigForLines([
    {visible:true},{visible:true},{visible:true},{visible:true},{visible:true}
  ]);

  if (clef === 'bass') {
    stave.addClef('bass');
  } else if (clef === 'guitar') {
    stave.addClef('treble', 'default', '8vb');
  } else {
    stave.addClef('treble');
  }

  const keyShort = KEY_SIGS[keyIndex].short;
  if (keyShort !== 'C') stave.addKeySignature(keyShort);

  stave.setContext(context).draw();

  // Expose geometry for the pitch line overlay
  window.staffGeometry = {
    topLineY: stave.getYForLine(0),
    lineGap:  stave.getSpacingBetweenLines(),
    W, H,
  };

  const vfKey    = noteToVFKey(note.name);
  const clefType = clef === 'bass' ? 'bass' : 'treble';

  const staveNote = new VF.StaveNote({
    clef: clefType, keys: [vfKey], duration: 'q', auto_stem: true,
  });
  staveNote.setStyle({ fillStyle: noteCol, strokeStyle: noteCol });

  const voice = new VF.Voice({ num_beats: 1, beat_value: 4 });
  voice.setMode(VF.Voice.Mode.SOFT);
  voice.addTickables([staveNote]);

  // Format tightly then shift note to horizontal centre of note area
  const noteStartX = stave.getNoteStartX();
  const noteEndX   = staveX + staveW - 20;
  const noteAreaW  = noteEndX - noteStartX;

  new VF.Formatter().joinVoices([voice]).format([voice], 60);
  // After format, note sits at noteStartX; shift to centre
  const xShift = (noteAreaW / 2) - 30;
  staveNote.setXShift(xShift);

  voice.draw(context, stave);

  // Draw note name label centered under the notehead.
  // We append directly to the VexFlow SVG (svgEl) so coordinates match.
  // getAbsoluteX() returns the formatter base position without x_shift,
  // so we add xShift to get the actual rendered note center.
  if (opts.showLabel && svgEl) {
    const noteX  = staveNote.getAbsoluteX() + xShift;
    const geo    = window.staffGeometry;
    const labelY = (geo ? geo.topLineY + geo.lineGap * 4 : 70) + 32;

    const ns  = 'http://www.w3.org/2000/svg';
    const txt = document.createElementNS(ns, 'text');
    txt.setAttribute('x', String(noteX));
    txt.setAttribute('y', String(labelY));
    txt.setAttribute('text-anchor', 'middle');
    txt.setAttribute('font-size', '12');
    txt.setAttribute('font-weight', '600');
    txt.setAttribute('fill', '#185FA5');
    txt.setAttribute('font-family', '-apple-system, BlinkMacSystemFont, sans-serif');
    txt.textContent = note.name;
    svgEl.appendChild(txt);
  }
}
