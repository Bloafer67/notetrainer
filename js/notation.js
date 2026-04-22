// ── notation.js ─────────────────────────────────────────────────────────────
// Shared OSMD-backed notation renderer. Builds a minimal MusicXML document
// from a list of notes and renders it via OpenSheetMusicDisplay so every game
// gets the same professional typography as Play Along.
//
// Usage:
//   renderNotes(container, [{name:'C4'}, {name:'E4', state:'current'}], {
//     clef: 'treble', keySigIndex: 0, showLabels: false,
//   });
//
// `notes[i].state` may be 'idle' (default), 'current', or 'done' — the adapter
// maps each to a color via getNotePalette() / darkMode, so boomwhacker mode
// and burst progress rendering both work without extra plumbing.

// KEY_SIGS order (staff.js):
//   0: C  1: G  2: D  3: A  4: E  5: F  6: Bb  7: Eb  8: Ab
const NOTATION_KEY_FIFTHS = [0, 1, 2, 3, 4, -1, -2, -3, -4];

function notationParseNoteName(name) {
  const m = /^([A-G])(#{1,2}|b{1,2})?(-?\d+)$/.exec(String(name || ''));
  if (!m) return null;
  const alterMap = { '': 0, '#': 1, '##': 2, 'b': -1, 'bb': -2 };
  return {
    step: m[1],
    alter: alterMap[m[2] || ''] ?? 0,
    octave: parseInt(m[3], 10),
  };
}

function notationClefXml(clefName) {
  if (clefName === 'bass') {
    return '<clef><sign>F</sign><line>4</line></clef>';
  }
  if (clefName === 'guitar') {
    return '<clef><sign>G</sign><line>2</line><clef-octave-change>-1</clef-octave-change></clef>';
  }
  return '<clef><sign>G</sign><line>2</line></clef>';
}

function notationNoteColor(note) {
  const palette = getNotePalette(note);
  const state = note.state || 'idle';
  if (state === 'current') return palette.pitch;
  if (state === 'done') return darkMode ? '#3B6D11' : '#639922';
  if (window.boomwhackerMode) {
    return darkMode ? palette.noteFill : palette.noteStroke;
  }
  return darkMode ? '#e0dfd8' : '#1a1a18';
}

const NOTATION_PAD_REST = [
  '<note print-object="no">',
  '<rest/>',
  '<duration>1</duration>',
  '<voice>1</voice>',
  '<type>quarter</type>',
  '</note>',
].join('');

function notationBuildMusicXml(notes, { clef = 'treble', keySigIndex = 0 } = {}) {
  const fifths = NOTATION_KEY_FIFTHS[keySigIndex] ?? 0;
  const clefXml = notationClefXml(clef);

  const noteXml = notes.map(note => {
    const pitchName = clef === 'guitar' && note.actualName
      ? note.actualName
      : note.name;
    const parsed = notationParseNoteName(pitchName);
    if (!parsed) return '';
    const alterXml = parsed.alter ? `<alter>${parsed.alter}</alter>` : '';
    return [
      '<note>',
      '<pitch>',
      `<step>${parsed.step}</step>`,
      alterXml,
      `<octave>${parsed.octave}</octave>`,
      '</pitch>',
      '<duration>1</duration>',
      '<voice>1</voice>',
      '<type>quarter</type>',
      '</note>',
    ].join('');
  }).join('');

  // Pad with hidden quarter rests so real notes land centered in a wider
  // measure instead of jammed against the clef. `print-object="no"` keeps the
  // rests from rendering glyphs but still reserves horizontal space.
  const PAD = 2;
  const padXml = NOTATION_PAD_REST.repeat(PAD);
  const totalBeats = notes.length + PAD * 2;
  const body = padXml + noteXml + padXml;

  return [
    '<?xml version="1.0" encoding="UTF-8" standalone="no"?>',
    '<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 3.1 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">',
    '<score-partwise version="3.1">',
    '<part-list><score-part id="P1"><part-name></part-name></score-part></part-list>',
    '<part id="P1">',
    '<measure number="1">',
    '<attributes>',
    '<divisions>1</divisions>',
    `<key><fifths>${fifths}</fifths></key>`,
    `<time print-object="no"><beats>${totalBeats}</beats><beat-type>4</beat-type></time>`,
    clefXml,
    '</attributes>',
    body,
    '</measure>',
    '</part>',
    '</score-partwise>',
  ].join('');
}

function notationPitchedNoteEls(doc) {
  return [...doc.querySelectorAll('note')].filter(el => el.querySelector('pitch'));
}

function notationColorizeDoc(doc, notes) {
  notationPitchedNoteEls(doc).forEach((el, i) => {
    const note = notes[i];
    if (!note) return;
    const color = notationNoteColor(note);
    el.setAttribute('color', color);
    el.querySelector('notehead')?.setAttribute('color', color);
    el.querySelector('stem')?.setAttribute('color', color);
    el.querySelectorAll('beam').forEach(b => b.setAttribute('color', color));
  });
}

function notationAddLyrics(doc, notes) {
  notationPitchedNoteEls(doc).forEach((el, i) => {
    const note = notes[i];
    if (!note) return;
    const lyric = doc.createElement('lyric');
    const text = doc.createElement('text');
    text.textContent = note.name;
    lyric.appendChild(text);
    el.appendChild(lyric);
  });
}

const NOTATION_OSMD_INSTANCES = new WeakMap();
const NOTATION_RESERVED_HEIGHTS = new Map();
let notationMeasureHost = null;

function notationThemeOptions() {
  const accent = darkMode ? '#b4b2a9' : '#1a1a18';
  return {
    defaultColorMusic: accent,
    defaultColorNotehead: accent,
    defaultColorStem: accent,
    defaultColorRest: accent,
    defaultColorLabel: accent,
    defaultColorTitle: accent,
  };
}

function notationGetOsmd(container) {
  let osmd = NOTATION_OSMD_INSTANCES.get(container);
  if (!osmd) {
    osmd = new opensheetmusicdisplay.OpenSheetMusicDisplay(container, {
      autoResize: false,
      drawTitle: false,
      drawSubtitle: false,
      drawComposer: false,
      drawCredits: false,
      drawPartNames: false,
      drawMeasureNumbers: false,
      renderSingleHorizontalStaffline: true,
      ...notationThemeOptions(),
    });
    NOTATION_OSMD_INSTANCES.set(container, osmd);
  } else {
    osmd.setOptions(notationThemeOptions());
  }
  return osmd;
}

async function notationRenderIntoContainer(container, notes, opts = {}) {
  if (!container || !Array.isArray(notes) || notes.length === 0) return null;
  if (typeof opensheetmusicdisplay === 'undefined') {
    console.error('renderNotes: OpenSheetMusicDisplay not loaded');
    return null;
  }

  const osmd = notationGetOsmd(container);

  const xml = notationBuildMusicXml(notes, opts);
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.querySelector('parsererror')) {
    console.error('renderNotes: generated MusicXML failed to parse');
    return null;
  }
  notationColorizeDoc(doc, notes);
  if (opts.showLabels) notationAddLyrics(doc, notes);
  const serialized = new XMLSerializer().serializeToString(doc);

  try {
    await osmd.load(serialized);
    osmd.zoom = 1.5;
    osmd.render();
  } catch (err) {
    console.error('renderNotes: OSMD load/render failed', err);
    return null;
  }

  // Center the rendered SVG horizontally within the container. OSMD left-
  // aligns its output which can leave unbalanced whitespace on one side.
  const renderedSvg = container.querySelector('svg');
  if (renderedSvg) {
    renderedSvg.style.display = 'block';
    renderedSvg.style.margin = '0 auto';
    notationCenterStaffInContainer(container, renderedSvg);
  }

  return osmd;
}

function notationCenterStaffInContainer(container, renderedSvg) {
  if (!container || !renderedSvg) return;

  renderedSvg.style.transform = 'translateY(0px)';

  const bounds = notationStaffBounds(container);
  if (!bounds) return;

  const containerHeight = container.clientHeight || Math.ceil(container.getBoundingClientRect().height);
  if (!containerHeight) return;

  const staffCenterY = (bounds.topY + bounds.botY) / 2;
  const targetCenterY = containerHeight / 2;
  const deltaY = Math.round((targetCenterY - staffCenterY) * 10) / 10;

  renderedSvg.style.transform = `translateY(${deltaY}px)`;
}

function notationMeasureHostEl() {
  if (notationMeasureHost) return notationMeasureHost;
  notationMeasureHost = document.createElement('div');
  notationMeasureHost.style.position = 'absolute';
  notationMeasureHost.style.left = '-99999px';
  notationMeasureHost.style.top = '0';
  notationMeasureHost.style.visibility = 'hidden';
  notationMeasureHost.style.pointerEvents = 'none';
  notationMeasureHost.style.contain = 'layout style';
  document.body.appendChild(notationMeasureHost);
  return notationMeasureHost;
}

function notationReserveKey(container, opts = {}) {
  const width = Math.max(320, Math.round(container.getBoundingClientRect().width || container.clientWidth || 0));
  const clefName = opts.clef || 'treble';
  const rangeMode = opts.rangeMode || 'staff-only';
  const showLabels = opts.showLabels ? 'labels' : 'nolabels';
  return `${clefName}|${rangeMode}|${showLabels}|${width}`;
}

function notationReserveSampleNotes(opts = {}) {
  const clefName = opts.clef || 'treble';
  const rangeMode = opts.rangeMode || 'staff-only';
  const keySigIndex = opts.keySigIndex || 0;
  const notes = getDrillNotes(clefName, keySigIndex, rangeMode);
  if (!notes.length) return [];

  let lowest = notes[0];
  let highest = notes[0];
  notes.forEach(note => {
    if (note.step < lowest.step) lowest = note;
    if (note.step > highest.step) highest = note;
  });

  if (lowest === highest) return [lowest];
  return [lowest, highest];
}

async function reserveStaffHeight(container, opts = {}) {
  if (!container || typeof document === 'undefined' || typeof opensheetmusicdisplay === 'undefined') {
    return null;
  }

  const cacheKey = notationReserveKey(container, opts);
  const cachedHeight = NOTATION_RESERVED_HEIGHTS.get(cacheKey);
  if (cachedHeight) {
    container.style.minHeight = `${cachedHeight}px`;
    return cachedHeight;
  }

  const sampleNotes = notationReserveSampleNotes(opts);
  if (!sampleNotes.length) return null;

  const host = notationMeasureHostEl();
  host.style.width = `${Math.max(320, Math.round(container.getBoundingClientRect().width || container.clientWidth || 0))}px`;
  host.innerHTML = '';

  const measureContainer = document.createElement('div');
  measureContainer.style.width = '100%';
  host.appendChild(measureContainer);

  await notationRenderIntoContainer(measureContainer, sampleNotes, opts);

  const measuredHeight = Math.ceil(measureContainer.getBoundingClientRect().height);
  if (!measuredHeight) return null;

  NOTATION_RESERVED_HEIGHTS.set(cacheKey, measuredHeight);
  container.style.minHeight = `${measuredHeight}px`;
  return measuredHeight;
}

async function renderNotes(container, notes, opts = {}) {
  return notationRenderIntoContainer(container, notes, opts);
}

// ── Pitch-overlay helpers ───────────────────────────────────────────────────
// Shared between games that draw a live pitch indicator over the staff. The
// overlay is a bare <svg> positioned over the rendered OSMD container; caller
// supplies the overlay element so multiple games can use different overlays.

function notationStaffBounds(container, referenceEl) {
  if (!container) return null;
  const svg = container.querySelector('svg');
  if (!svg) return null;
  const ref = referenceEl || container;
  const refRect = ref.getBoundingClientRect();

  // OSMD/VexFlow renders the five staff lines as thin horizontal <path>
  // elements (h≈0, w=staff width). Pick the five widest such elements;
  // ledger lines are shorter and get dropped automatically.
  const candidates = [
    ...svg.querySelectorAll('path'),
    ...svg.querySelectorAll('line'),
  ]
    .map(el => ({ el, rect: el.getBoundingClientRect() }))
    .filter(c => c.rect.width > 40 && c.rect.height < 2);

  if (candidates.length < 5) return null;

  const widest = [...candidates]
    .sort((a, b) => b.rect.width - a.rect.width)
    .slice(0, 5)
    .sort((a, b) => a.rect.top - b.rect.top);

  const topRect = widest[0].rect;
  const botRect = widest[4].rect;
  return {
    topY: topRect.top - refRect.top,
    botY: botRect.top - refRect.top,
    leftX: topRect.left - refRect.left,
    rightX: topRect.right - refRect.left,
  };
}

function notationYForStep(bounds, step) {
  if (!bounds) return null;
  const pxPerStep = (bounds.botY - bounds.topY) / 8;
  return bounds.botY - step * pxPerStep;
}

function notationClearOverlay(overlay) {
  if (overlay) overlay.innerHTML = '';
}

function notationDrawPitchLine(overlay, { y, color, x1, x2, opacity = 0.9 }) {
  if (!overlay) return;
  overlay.innerHTML = '';
  const ns = 'http://www.w3.org/2000/svg';
  const line = document.createElementNS(ns, 'line');
  line.setAttribute('id', 'pitch-line');
  line.setAttribute('x1', x1);
  line.setAttribute('x2', x2);
  line.setAttribute('y1', y);
  line.setAttribute('y2', y);
  line.setAttribute('stroke', color);
  line.setAttribute('stroke-width', '2.5');
  line.setAttribute('stroke-linecap', 'round');
  line.setAttribute('opacity', opacity);
  overlay.appendChild(line);
}

function notationDrawPitchArrow(overlay, { direction, color, centerX, topY, botY }) {
  if (!overlay) return;
  overlay.innerHTML = '';
  const ns = 'http://www.w3.org/2000/svg';
  const arrow = document.createElementNS(ns, 'polygon');
  arrow.setAttribute('id', 'pitch-arrow');
  arrow.setAttribute('fill', color);
  arrow.setAttribute('opacity', '0.85');
  const size = 10;
  if (direction === 'up') {
    const tipY = Math.max(4, topY - 14);
    const baseY = tipY + 12;
    arrow.setAttribute('points',
      `${centerX},${tipY} ${centerX - size},${baseY} ${centerX + size},${baseY}`);
  } else {
    const tipY = botY + 14;
    const baseY = tipY - 12;
    arrow.setAttribute('points',
      `${centerX},${tipY} ${centerX - size},${baseY} ${centerX + size},${baseY}`);
  }
  overlay.appendChild(arrow);
}

window.renderNotes = renderNotes;
window.reserveStaffHeight = reserveStaffHeight;
window.notationStaffBounds = notationStaffBounds;
window.notationYForStep = notationYForStep;
window.notationClearOverlay = notationClearOverlay;
window.notationDrawPitchLine = notationDrawPitchLine;
window.notationDrawPitchArrow = notationDrawPitchArrow;
