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

function notationBuildMusicXml(notes, { clef = 'treble', keySigIndex = 0 } = {}) {
  const fifths = NOTATION_KEY_FIFTHS[keySigIndex] ?? 0;
  const clefXml = notationClefXml(clef);

  const noteXml = notes.map(note => {
    const parsed = notationParseNoteName(note.name);
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
    `<time><beats>${notes.length || 1}</beats><beat-type>4</beat-type></time>`,
    clefXml,
    '</attributes>',
    noteXml,
    '</measure>',
    '</part>',
    '</score-partwise>',
  ].join('');
}

function notationColorizeDoc(doc, notes) {
  const noteEls = doc.querySelectorAll('note');
  noteEls.forEach((el, i) => {
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
  const noteEls = doc.querySelectorAll('note');
  noteEls.forEach((el, i) => {
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

async function renderNotes(container, notes, opts = {}) {
  if (!container || !Array.isArray(notes) || notes.length === 0) return null;
  if (typeof opensheetmusicdisplay === 'undefined') {
    console.error('renderNotes: OpenSheetMusicDisplay not loaded');
    return null;
  }

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
    osmd.render();
  } catch (err) {
    console.error('renderNotes: OSMD load/render failed', err);
    return null;
  }
  return osmd;
}

window.renderNotes = renderNotes;
