// ── js/games/play-along.js ────────────────────────────────────────────────
// "Play Along" — scrolling staff with pitch detection
// Notes scroll right→left past a fixed playhead in the centre.
// Play the correct pitch → note lights blue → staff eases to next note.

// ── Constants ─────────────────────────────────────────────────────────────
const PA_HIT_CENTS    = 80;   // cents tolerance for a hit
const PA_HIT_HOLD_MS  = 180;  // ms to hold pitch before registering (shorter = more responsive)
const PA_EASE_MS      = 320;  // scroll animation duration (ms)
const PA_EASE_FN      = t => t < 0.5 ? 2*t*t : -1+(4-2*t)*t; // ease-in-out

// Staff geometry — shared with other modes but PA uses its own canvas
const PA_SVG_H        = 140;  // viewBox height
const PA_TOP_LINE     = 40;   // y of top staff line
const PA_GAP          = 14;   // gap between staff lines
const PA_NOTE_R       = 8;    // note head radius
const PA_BEAT_W       = 72;   // pixels per beat
const PA_PLAYHEAD_X   = 180;  // x of playhead (fixed centre-ish)

// ── State ─────────────────────────────────────────────────────────────────
let pa_active       = false;
let pa_song         = null;   // loaded song object from SONGS
let pa_noteIndex    = 0;      // index into pa_song.notes of current target
let pa_scrollX      = 0;      // current scroll offset in pixels
let pa_targetX      = 0;      // scroll offset we're animating toward
let pa_animStart    = null;   // timestamp of current scroll animation
let pa_animFrom     = 0;      // scroll start value for animation
let pa_animRAF      = null;   // requestAnimationFrame handle for scroll
let pa_hitTimer     = null;   // setTimeout for pitch hold
let pa_smoothHz     = null;   // smoothed pitch
let pa_hadSilence   = true;   // true after silence detected; required for re-attack on same-pitch notes
let pa_lastHitPitch = null;   // pitch of the last registered note (for re-attack detection)
let pa_nashville    = false;  // show Nashville numbers instead of chord names
let pa_score        = 0;
let pa_svgNS        = 'http://www.w3.org/2000/svg';

// ── Init ──────────────────────────────────────────────────────────────────
function initPlayAlong() {
  populateSongSelect();
}

function populateSongSelect() {
  const sel = document.getElementById('pa-song-select');
  if (!sel) return;
  sel.innerHTML = '';
  Object.entries(SONGS).forEach(([key, song]) => {
    const opt = document.createElement('option');
    opt.value = key;
    opt.textContent = song.meta.title;
    sel.appendChild(opt);
  });
}

// ── Start ─────────────────────────────────────────────────────────────────
async function startPlayAlong() {
  const songKey  = document.getElementById('pa-song-select')?.value || 'dinks-song';
  pa_song        = SONGS[songKey];
  if (!pa_song) { alert('Song not found'); return; }

  // Request mic
  const micEl  = document.getElementById('mic-status');
  const micTxt = document.getElementById('mic-status-text');
  if (micEl)  { micEl.style.display = 'flex'; micEl.className = 'mic-status'; }
  if (micTxt)   micTxt.textContent = 'Requesting mic…';

  const granted = await startPitchDetection(pa_onPitchFrame);
  if (!granted) {
    if (micEl) micEl.style.display = 'none';
    alert('Microphone access is needed. Please allow mic and try again.');
    showPregame();
    return;
  }

  if (micEl)  { micEl.className = 'mic-status active'; }
  if (micTxt)   micTxt.textContent = 'Listening…';

  pa_active     = true;
  pa_noteIndex  = 0;
  pa_scrollX    = 0;
  pa_targetX    = 0;
  pa_smoothHz     = null;
  pa_hadSilence   = true;
  pa_lastHitPitch = null;
  pa_score        = 0;

  // Show play-along UI, hide other game elements
  document.getElementById('pregame-screen').classList.remove('show');
  document.getElementById('active-game').style.display     = 'none';
  document.getElementById('pa-active').style.display       = 'flex';
  document.getElementById('recap-view').classList.remove('show');
  document.getElementById('game-ui').style.display         = '';
  document.getElementById('pa-score-display').textContent  = '0';
  const titleEl = document.getElementById('pa-title');
  if (titleEl) titleEl.textContent = pa_song.meta.title;

  // Reset completion overlay
  const complete = document.getElementById('pa-complete');
  const controls = document.getElementById('pa-controls-row');
  if (complete) complete.style.display = 'none';
  if (controls) controls.style.display = '';

  pa_render();
  pa_startScrollAnim();
  pa_updateProgressBar();
  pa_updateNoteNameDisplay();
}

// ── Stop ──────────────────────────────────────────────────────────────────
function stopPlayAlong() {
  pa_active = false;
  stopPitchDetection();
  if (pa_hitTimer) { clearTimeout(pa_hitTimer); pa_hitTimer = null; }
  if (pa_animRAF)  { cancelAnimationFrame(pa_animRAF); pa_animRAF = null; }
  const micEl = document.getElementById('mic-status');
  if (micEl) micEl.style.display = 'none';
}

function exitPlayAlong() {
  stopPlayAlong();
  document.getElementById('pa-active').style.display = 'none';
  showPregame();
}

// ── Pitch callback ────────────────────────────────────────────────────────
function pa_onPitchFrame(hz) {
  if (!pa_active) return;

  if (hz && pa_smoothHz) {
    pa_smoothHz = 0.25 * hz + 0.75 * pa_smoothHz;
  } else {
    pa_smoothHz = hz || null;
  }

  // Track silence — required for re-attack detection on consecutive same-pitch notes
  if (!hz) {
    pa_hadSilence = true;
    pa_updatePitchLine(null, '#185FA5');
    if (pa_hitTimer) { clearTimeout(pa_hitTimer); pa_hitTimer = null; }
    return;
  }

  if (pa_noteIndex >= pa_song.notes.length) {
    pa_updatePitchLine(pa_smoothHz, '#185FA5');
    return;
  }

  const target   = pa_song.notes[pa_noteIndex];
  let targetHz   = NOTE_FREQS[target.pitch];
  if (!targetHz) { pa_advance(); return; } // rest — skip

  if (pa_song.meta.guitarOctave) targetHz = targetHz / 2;

  const cents   = Math.abs(1200 * Math.log2(hz / targetHz));
  const inRange = cents <= PA_HIT_CENTS;
  pa_updatePitchLine(pa_smoothHz, inRange ? '#1D9E75' : '#185FA5');

  if (inRange) {
    if (!pa_hitTimer) {
      pa_hitTimer = setTimeout(() => {
        pa_hitTimer = null;
        // Re-attack check: if same pitch as last hit, require silence first
        const cur = pa_song.notes[pa_noteIndex];
        if (cur && cur.pitch === pa_lastHitPitch && !pa_hadSilence) return;
        pa_onNoteHit();
      }, PA_HIT_HOLD_MS);
    }
  } else {
    if (pa_hitTimer) { clearTimeout(pa_hitTimer); pa_hitTimer = null; }
  }
}

// ── Note hit ──────────────────────────────────────────────────────────────
function pa_onNoteHit() {
  if (!pa_active) return;
  pa_lastHitPitch = pa_song.notes[pa_noteIndex]?.pitch ?? null;
  pa_hadSilence   = false; // require silence before re-attack on same pitch
  pa_score++;
  document.getElementById('pa-score-display').textContent = pa_score;
  pa_flashNote(pa_noteIndex, '#3B6D11');
  playDing();
  setTimeout(() => { if (pa_active) pa_advance(); }, 180);
}

function pa_advance() {
  pa_noteIndex++;
  if (pa_noteIndex >= pa_song.notes.length) {
    pa_onSongComplete();
    return;
  }
  // Skip rests automatically
  while (pa_noteIndex < pa_song.notes.length && !pa_song.notes[pa_noteIndex].pitch) {
    pa_noteIndex++;
  }
  if (pa_noteIndex >= pa_song.notes.length) { pa_onSongComplete(); return; }

  pa_scrollToNote(pa_noteIndex);
  pa_updateProgressBar();
  pa_updateNoteNameDisplay();
  pa_render();
}

function pa_onSongComplete() {
  pa_active = false;
  stopPitchDetection();
  if (pa_animRAF) { cancelAnimationFrame(pa_animRAF); pa_animRAF = null; }
  const micEl = document.getElementById('mic-status');
  if (micEl) micEl.style.display = 'none';

  // Show completion overlay, hide controls and feedback
  const complete = document.getElementById('pa-complete');
  const controls = document.getElementById('pa-controls-row');
  const feedback = document.getElementById('pa-feedback');
  const scoreNum = document.getElementById('pa-complete-score-num');
  if (scoreNum) scoreNum.textContent = pa_score;
  if (complete) complete.style.display = 'flex';
  if (controls) controls.style.display = 'none';
  if (feedback) feedback.textContent = '';

  // Confetti!
  setTimeout(launchConfetti, 100);
}

// ── Scroll animation ──────────────────────────────────────────────────────
function pa_scrollToNote(idx) {
  const note      = pa_song.notes[idx];
  const noteX     = pa_noteToX(note);
  pa_targetX      = noteX - PA_PLAYHEAD_X;
  pa_animFrom     = pa_scrollX;
  pa_animStart    = null;
  if (!pa_animRAF) pa_startScrollAnim();
}

function pa_startScrollAnim() {
  pa_animRAF = requestAnimationFrame(pa_animFrame);
}

function pa_animFrame(ts) {
  if (!pa_active) return;

  // Animate scroll
  if (pa_scrollX !== pa_targetX) {
    if (pa_animStart === null) pa_animStart = ts;
    const elapsed = ts - pa_animStart;
    const t       = Math.min(elapsed / PA_EASE_MS, 1);
    const eased   = PA_EASE_FN(t);
    pa_scrollX    = pa_animFrom + (pa_targetX - pa_animFrom) * eased;
    if (t >= 1) {
      pa_scrollX   = pa_targetX;
      pa_animStart = null;
    }
  }

  // Always re-render so the pitch line moves smoothly every frame
  pa_render();

  pa_animRAF = requestAnimationFrame(pa_animFrame);
}

// ── Rendering ─────────────────────────────────────────────────────────────
function pa_render() {
  const svg = document.getElementById('pa-staff-svg');
  if (!svg || !pa_song) return;
  svg.innerHTML = '';

  const isDark    = darkMode;
  const lineCol   = isDark ? '#555' : '#999';
  const clefCol   = isDark ? '#aaa' : '#666';
  const noteCol   = isDark ? '#e0dfd8' : '#1a1a18';
  const dimCol    = isDark ? '#444' : '#ccc';
  const hitCol    = '#185FA5';
  const doneCol   = isDark ? '#27500A' : '#3B6D11';
  const chordCol  = isDark ? '#888' : '#666';
  const barCol    = isDark ? '#555' : '#aaa';

  function el(tag, attrs, text) {
    const e = document.createElementNS(pa_svgNS, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    if (text !== undefined) e.textContent = text;
    return e;
  }

  const W = svg.clientWidth || 600;
  svg.setAttribute('viewBox', `0 0 ${W} ${PA_SVG_H}`);

  // Five staff lines
  for (let i = 0; i < 5; i++) {
    const y = PA_TOP_LINE + i * PA_GAP;
    svg.appendChild(el('line', {
      x1:0, x2:W, y1:y, y2:y,
      stroke:lineCol, 'stroke-width':'1',
    }));
  }

  // Playhead — subtle vertical line
  svg.appendChild(el('line', {
    x1:PA_PLAYHEAD_X, x2:PA_PLAYHEAD_X,
    y1:PA_TOP_LINE - 10, y2:PA_TOP_LINE + 4*PA_GAP + 10,
    stroke: isDark ? '#444' : '#ddd',
    'stroke-width':'2', 'stroke-dasharray':'4 3',
  }));

  // Clef (fixed, doesn't scroll)
  svg.appendChild(el('text', {
    x:'6', y: PA_TOP_LINE + PA_GAP*4 + 4,
    'font-size':'52', fill:clefCol,
  }, '𝄞'));

  // Time signature 4/4 (fixed, after clef)
  const tsX = 52;
  svg.appendChild(el('text', {
    x:tsX, y: PA_TOP_LINE + PA_GAP*2 + 2,
    'font-size':'16', 'font-weight':'700', fill:clefCol,
    'text-anchor':'middle', 'font-family':'serif',
  }, '4'));
  svg.appendChild(el('text', {
    x:tsX, y: PA_TOP_LINE + PA_GAP*4 + 2,
    'font-size':'16', 'font-weight':'700', fill:clefCol,
    'text-anchor':'middle', 'font-family':'serif',
  }, '4'));

  // Render notes, bar lines, chords — all offset by pa_scrollX
  const visLeft  = -PA_BEAT_W * 2;  // render a bit off-screen left
  const visRight = W + PA_BEAT_W * 2;

  // Measure bar lines and chord symbols
  const measures = pa_song.meta.chords;
  for (const [mNum, chord] of Object.entries(measures)) {
    const mX = pa_measureStartX(parseInt(mNum)) - pa_scrollX;
    if (mX < visLeft || mX > visRight) continue;

    // Bar line
    if (parseInt(mNum) > 1) {
      svg.appendChild(el('line', {
        x1:mX, x2:mX,
        y1:PA_TOP_LINE, y2:PA_TOP_LINE + 4*PA_GAP,
        stroke:barCol, 'stroke-width':'1',
      }));
    }

    // Chord symbol above staff
    const chordText = pa_nashville ? chord.nashville : chord.display;
    svg.appendChild(el('text', {
      x:mX + 6, y:PA_TOP_LINE - 16,
      'font-size':'13', 'font-weight':'600',
      fill:chordCol,
      'font-family':'-apple-system,BlinkMacSystemFont,sans-serif',
    }, chordText));
  }

  // ── Notes & Rests ────────────────────────────────────────────────────────
  // Pre-compute beam groups: consecutive pitched eighths get beamed
  const beamGroups = [];
  let beamBuf = [];
  pa_song.notes.forEach((note, idx) => {
    if (note.dur === 'e' && note.pitch) {
      beamBuf.push(idx);
    } else {
      if (beamBuf.length > 1) beamGroups.push([...beamBuf]);
      beamBuf = [];
    }
  });
  if (beamBuf.length > 1) beamGroups.push([...beamBuf]);
  const beamedSet = new Set(beamGroups.flat());

  // Helper: state color for a note index
  const noteColor = (idx) => {
    if (idx < pa_noteIndex)   return doneCol;
    if (idx === pa_noteIndex) return hitCol;
    return noteCol;
  };

  // Draw beams first (behind noteheads)
  beamGroups.forEach(grp => {
    const first = pa_song.notes[grp[0]];
    const last  = pa_song.notes[grp[grp.length - 1]];
    const fx = pa_noteToX(first) - pa_scrollX;
    const lx = pa_noteToX(last)  - pa_scrollX;
    if (lx < visLeft || fx > visRight) return; // off screen

    // Beam direction: use average step of group
    const avgStep = grp.reduce((s, i) => s + pa_pitchToStep(pa_song.notes[i].pitch), 0) / grp.length;
    const stemUp = avgStep < 4;
    const stemLen = 30;

    // Beam color: first unplayed note's color
    const firstUnplayed = grp.find(i => i >= pa_noteIndex);
    const bCol = firstUnplayed !== undefined ? noteColor(firstUnplayed) : doneCol;

    const fStep = pa_pitchToStep(first.pitch);
    const lStep = pa_pitchToStep(last.pitch);
    const fStemX = fx + (stemUp ? PA_NOTE_R - 1 : -(PA_NOTE_R - 1));
    const lStemX = lx + (stemUp ? PA_NOTE_R - 1 : -(PA_NOTE_R - 1));
    const fBeamY = pa_stepToY(fStep) + (stemUp ? -stemLen : stemLen);
    const lBeamY = pa_stepToY(lStep) + (stemUp ? -stemLen : stemLen);

    svg.appendChild(el('line', {
      x1:fStemX, y1:fBeamY, x2:lStemX, y2:lBeamY,
      stroke:bCol, 'stroke-width':'4', 'stroke-linecap':'square',
    }));
  });

  // Draw each note and rest
  pa_song.notes.forEach((note, idx) => {
    const nx = pa_noteToX(note) - pa_scrollX;
    if (nx < visLeft || nx > visRight) return;

    const col = noteColor(idx);

    // ── REST ──────────────────────────────────────────────────────────────
    if (!note.pitch) {
      const line2Y = PA_TOP_LINE + PA_GAP;         // 2nd line from top
      const line3Y = PA_TOP_LINE + 2 * PA_GAP;     // middle line

      if (note.dur === 'w') {
        // Whole rest: filled rect hanging below 2nd line
        svg.appendChild(el('rect', { x:nx-9, y:line2Y, width:18, height:6, fill:col }));
      } else if (note.dur === 'h') {
        // Half rest: filled rect sitting on 3rd line
        svg.appendChild(el('rect', { x:nx-9, y:line3Y-6, width:18, height:6, fill:col }));
      } else if (note.dur === 'q') {
        // Quarter rest: zigzag
        const ry = line3Y - 9;
        svg.appendChild(el('path', {
          d:`M${nx+2},${ry} l4,5 l-7,5 l7,5 l-4,5`,
          stroke:col, 'stroke-width':'1.8', fill:'none', 'stroke-linecap':'round',
        }));
      } else if (note.dur === 'e') {
        // Eighth rest: simple curved stroke
        svg.appendChild(el('path', {
          d:`M${nx-2},${line3Y-8} C${nx+8},${line3Y-6} ${nx+8},${line3Y+2} ${nx+2},${line3Y+8}`,
          stroke:col, 'stroke-width':'2', fill:'none', 'stroke-linecap':'round',
        }));
        svg.appendChild(el('circle', { cx:nx+2, cy:line3Y+8, r:'2', fill:col }));
      }
      return;
    }

    // ── PITCHED NOTE ──────────────────────────────────────────────────────
    const step    = pa_pitchToStep(note.pitch);
    const cy      = pa_stepToY(step);
    const r       = PA_NOTE_R;
    const isWhole = note.dur === 'w';
    const isHalf  = note.dur === 'h' || note.dur === 'h.';
    const stemUp  = step < 4;

    // Ledger lines
    pa_drawLedger(svg, el, nx, cy, r, lineCol, step);

    // Notehead
    if (isWhole || isHalf) {
      // Open notehead: stroke only, no fill
      svg.appendChild(el('ellipse', {
        cx:nx, cy, rx:r, ry:Math.round(r * 0.68),
        fill:'none', stroke:col, 'stroke-width':'2',
        transform:`rotate(-15,${nx},${cy})`,
      }));
    } else {
      // Filled notehead
      svg.appendChild(el('ellipse', {
        cx:nx, cy, rx:r, ry:Math.round(r * 0.72),
        fill:col,
        transform:`rotate(-15,${nx},${cy})`,
      }));
    }

    // Stem (not for whole notes)
    if (!isWhole) {
      const stemLen = 28;
      const stemX   = stemUp ? nx + r - 1 : nx - r + 1;
      const stemY2  = stemUp ? cy - stemLen : cy + stemLen;
      svg.appendChild(el('line', {
        x1:stemX, y1:cy, x2:stemX, y2:stemY2,
        stroke:col, 'stroke-width':'1.6',
      }));

      // Flag for solo (unbeamed) eighth note
      if (note.dur === 'e' && !beamedSet.has(idx)) {
        const sx = stemX, sy = stemY2;
        svg.appendChild(el('path', {
          d: stemUp
            ? `M${sx},${sy} C${sx+13},${sy+3} ${sx+13},${sy+11} ${sx+2},${sy+17}`
            : `M${sx},${sy} C${sx+13},${sy-3} ${sx+13},${sy-11} ${sx+2},${sy-17}`,
          stroke:col, 'stroke-width':'1.8', fill:'none', 'stroke-linecap':'round',
        }));
      }
    }

    // Augmentation dot
    if (note.dur === 'h.' || note.dur === 'q.') {
      const dotY = (Math.round(step) % 2 === 0) ? cy - 3 : cy;
      svg.appendChild(el('circle', { cx:nx + r + 5, cy:dotY, r:'2.5', fill:col }));
    }
  });

  pa_renderPitchLine(svg, el, W);
}

function pa_updateProgressBar() {
  const bar = document.getElementById('pa-progress-fill');
  if (!bar || !pa_song) return;
  const total = pa_song.notes.filter(n => n.pitch).length;
  const pct = total > 0 ? Math.round((pa_score / total) * 100) : 0;
  bar.style.width = pct + '%';
}

function pa_updateNoteNameDisplay() {
  const el = document.getElementById('pa-note-name');
  if (!el || !pa_song) return;
  const note = pa_song.notes[pa_noteIndex];
  el.textContent = (note && note.pitch) ? note.pitch : '';
}

// ── Flash note colour ──────────────────────────────────────────────────────
function pa_flashNote(idx, color) {
  // Will be repainted on next render cycle naturally
  // Just trigger a render immediately to show green flash
  pa_render();
}

// ── Pitch line ────────────────────────────────────────────────────────────
let pa_pitchLineY = null;
let pa_pitchLineColor = '#185FA5';
function pa_updatePitchLine(hz, color) {
  pa_pitchLineColor = color || '#185FA5';
  if (!hz) { pa_pitchLineY = null; return; }
  const step     = pa_hzToStep(hz);
  pa_pitchLineY  = pa_stepToY(step);
}

function pa_renderPitchLine(svg, el, W) {
  if (pa_pitchLineY === null) return;
  const y = pa_pitchLineY;
  const svgH = PA_SVG_H;
  const c = pa_pitchLineColor;

  if (y < 2) {
    svg.appendChild(el('polygon', {
      points:`${PA_PLAYHEAD_X},4 ${PA_PLAYHEAD_X-8},14 ${PA_PLAYHEAD_X+8},14`,
      fill:c, opacity:'0.8',
    }));
    return;
  }
  if (y > svgH - 6) {
    svg.appendChild(el('polygon', {
      points:`${PA_PLAYHEAD_X},${svgH-4} ${PA_PLAYHEAD_X-8},${svgH-14} ${PA_PLAYHEAD_X+8},${svgH-14}`,
      fill:c, opacity:'0.8',
    }));
    return;
  }

  svg.appendChild(el('line', {
    x1: PA_PLAYHEAD_X - 40, x2: PA_PLAYHEAD_X + 40,
    y1: y, y2: y,
    stroke:c, 'stroke-width':'2.5',
    'stroke-linecap':'round', opacity:'0.85',
  }));
}

// ── Geometry helpers ──────────────────────────────────────────────────────

// Convert note to absolute X pixel position (before scroll)
function pa_noteToX(note) {
  const totalBeats = (note.measure - 1) * 4 + (note.beat - 1);
  return PA_PLAYHEAD_X + 70 + totalBeats * PA_BEAT_W; // 70px offset for clef + time sig
}

function pa_measureStartX(mNum) {
  return PA_PLAYHEAD_X + 70 + (mNum - 1) * 4 * PA_BEAT_W;
}

// Scientific pitch → staff step (0 = E4 treble bottom line)
// Steps: 0=E4, 1=F4, 2=G4, 3=A4, 4=B4, 5=C5, 6=D5, 7=E5, 8=F5
// Extended down: -1=D4, -2=C4, -3=B3, -4=A3, -5=G3, -6=F3, -7=E3
const PA_NOTE_TO_STEP = {
  'E3':-7,'F3':-6,'G3':-5,'A3':-4,'B3':-3,
  'C4':-2,'D4':-1,
  'E4':0,'F4':1,'G4':2,'A4':3,'Bb4':3.5,'B4':4,
  'C5':5,'D5':6,'E5':7,'F5':8,
};

function pa_pitchToStep(pitch) {
  // Handle accidentals: Bb4 → step 3.5 (between A4 and B4)
  if (PA_NOTE_TO_STEP[pitch] !== undefined) return PA_NOTE_TO_STEP[pitch];
  // Fallback: strip accidental and approximate
  const bare = pitch.replace(/[#b]/, '');
  return PA_NOTE_TO_STEP[bare] ?? 0;
}

// Step → SVG y position
function pa_stepToY(step) {
  // step 0 (E4) = bottom line = PA_TOP_LINE + 4*PA_GAP
  return PA_TOP_LINE + 4 * PA_GAP - step * (PA_GAP / 2);
}

// Hz → step (for pitch line position on treble staff)
// Uses linear interpolation between known note/step/Hz entries for accuracy.
// For guitar 8vb songs: detected Hz is one octave below written, so we double
// it first to get the written Hz, then map to the visual staff position.
const PA_HZ_STEP_TABLE = (() => {
  // Full chromatic table: note name → diatonic step on treble staff
  // Chromatic notes (sharps/flats) get fractional steps for smooth line movement
  const noteSteps = {
    'E3':-7, 'F3':-6, 'F#3':-5.5, 'G3':-5, 'G#3':-4.5,
    'A3':-4, 'Bb3':-3.5, 'B3':-3,
    'C4':-2, 'C#4':-1.5, 'D4':-1, 'Eb4':-0.5,
    'E4':0,  'F4':1,  'F#4':1.5, 'G4':2,  'G#4':2.5,
    'A4':3,  'Bb4':3.5, 'B4':4,
    'C5':5,  'C#5':5.5, 'D5':6,  'Eb5':6.5,
    'E5':7,  'F5':8,  'F#5':8.5, 'G5':9,
  };
  return Object.entries(noteSteps)
    .map(([name, step]) => ({ step, hz: NOTE_FREQS[name] }))
    .filter(x => x.hz)
    .sort((a, b) => a.hz - b.hz);
})();

function pa_hzToStep(hz) {
  if (!hz || hz < 60) return 0;
  // For guitar 8vb: double the detected Hz to get the written (visual) Hz
  const visualHz = (pa_song && pa_song.meta.guitarOctave) ? hz * 2 : hz;
  const t = PA_HZ_STEP_TABLE;
  if (visualHz <= t[0].hz) return t[0].step;
  if (visualHz >= t[t.length-1].hz) return t[t.length-1].step;
  for (let i = 0; i < t.length - 1; i++) {
    if (visualHz >= t[i].hz && visualHz <= t[i+1].hz) {
      const frac = (visualHz - t[i].hz) / (t[i+1].hz - t[i].hz);
      return t[i].step + (t[i+1].step - t[i].step) * frac;
    }
  }
  return 0;
}

// Draw ledger lines for notes outside the treble staff
// Staff lines at steps 0,2,4,6,8. Ledger lines needed at -2,-4,... and 10,12,...
function pa_drawLedger(svg, el, nx, cy, r, lineCol, step) {
  const intStep = Math.round(step);
  // Below staff: steps -2 and below (even steps only = actual lines)
  if (intStep <= -2) {
    for (let s = -2; s >= intStep; s -= 2) {
      const ly = pa_stepToY(s);
      svg.appendChild(el('line', {
        x1:nx-r-4, x2:nx+r+4, y1:ly, y2:ly,
        stroke:lineCol, 'stroke-width':'1.5',
      }));
    }
  }
  // Above staff: steps 10 and above
  if (intStep >= 10) {
    for (let s = 10; s <= intStep; s += 2) {
      const ly = pa_stepToY(s);
      svg.appendChild(el('line', {
        x1:nx-r-4, x2:nx+r+4, y1:ly, y2:ly,
        stroke:lineCol, 'stroke-width':'1.5',
      }));
    }
  }
}

// ── Nashville toggle ──────────────────────────────────────────────────────
function toggleNashville() {
  pa_nashville = !pa_nashville;
  const btn = document.getElementById('pa-nashville-btn');
  if (btn) btn.classList.toggle('active', pa_nashville);
  pa_render();
}
