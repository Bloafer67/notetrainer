// ── js/games/play-along.js ────────────────────────────────────────────────
// "Play Along" — scrolling staff with pitch detection
// Notes scroll right→left past a fixed playhead in the centre.
// Play the correct pitch → note lights blue → staff eases to next note.

// ── Constants ─────────────────────────────────────────────────────────────
const PA_HIT_CENTS    = 80;   // cents tolerance for a hit
const PA_HIT_HOLD_MS  = 250;  // ms to hold pitch before registering
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
  pa_smoothHz   = null;
  pa_score      = 0;

  // Show play-along UI, hide other game elements
  document.getElementById('pregame-screen').classList.remove('show');
  document.getElementById('active-game').style.display     = 'none';
  document.getElementById('pa-active').style.display       = 'flex';
  document.getElementById('recap-view').classList.remove('show');
  document.getElementById('game-ui').style.display         = '';
  document.getElementById('pa-score-display').textContent  = '0';

  pa_render();
  pa_startScrollAnim();
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

  pa_updatePitchLine(pa_smoothHz);

  if (!hz || pa_noteIndex >= pa_song.notes.length) {
    if (pa_hitTimer) { clearTimeout(pa_hitTimer); pa_hitTimer = null; }
    return;
  }

  const target    = pa_song.notes[pa_noteIndex];
  const targetHz  = NOTE_FREQS[target.pitch];
  if (!targetHz) { pa_advance(); return; } // rest or unknown — skip

  const cents = Math.abs(1200 * Math.log2(hz / targetHz));
  if (cents <= PA_HIT_CENTS) {
    if (!pa_hitTimer) {
      pa_hitTimer = setTimeout(() => {
        pa_hitTimer = null;
        pa_onNoteHit();
      }, PA_HIT_HOLD_MS);
    }
  } else {
    if (pa_hitTimer) { clearTimeout(pa_hitTimer); pa_hitTimer = null; }
  }

  // Update tuner
  const targetForTuner = NOTE_FREQS[target.pitch];
  if (targetForTuner) {
    const centsForTuner = 1200 * Math.log2(hz / targetForTuner);
    updateTuner(centsForTuner, true);
  }
}

// ── Note hit ──────────────────────────────────────────────────────────────
function pa_onNoteHit() {
  if (!pa_active) return;
  pa_score++;
  document.getElementById('pa-score-display').textContent = pa_score;

  // Flash the current note blue/green
  pa_flashNote(pa_noteIndex, '#3B6D11');

  // Ding
  playDing();

  // Brief pause then advance
  setTimeout(() => { if (pa_active) pa_advance(); }, 180);
}

function pa_advance() {
  pa_noteIndex++;
  if (pa_noteIndex >= pa_song.notes.length) {
    pa_onSongComplete();
    return;
  }
  // Scroll to bring next note to playhead
  pa_scrollToNote(pa_noteIndex);
  // Re-render to update highlight
  pa_render();
  updateTuner(0, false);
}

function pa_onSongComplete() {
  pa_active = false;
  stopPitchDetection();
  // Show a simple completion state
  const fb = document.getElementById('pa-feedback');
  if (fb) {
    fb.textContent = '🎵 Song complete! Score: ' + pa_score;
    fb.style.color = 'var(--primary)';
  }
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
    pa_render();
  }

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

  // Notes
  pa_song.notes.forEach((note, idx) => {
    const nx = pa_noteToX(note) - pa_scrollX;
    if (nx < visLeft || nx > visRight) return;
    if (!note.pitch) return; // rest — skip for now

    const step = pa_pitchToStep(note.pitch);
    const cy   = pa_stepToY(step);
    const r    = PA_NOTE_R;

    // Colour based on state
    let fill = noteCol;
    if (idx < pa_noteIndex)        fill = doneCol;   // played — dark green
    else if (idx === pa_noteIndex)  fill = hitCol;    // current — blue

    // Ledger lines
    pa_drawLedger(svg, el, nx, cy, r, lineCol, step);

    // Note head
    svg.appendChild(el('ellipse', {
      cx:nx, cy,
      rx:r, ry:Math.round(r * 0.72),
      fill,
      transform:`rotate(-15,${nx},${cy})`,
    }));

    // Stem
    const stemUp = step < 4;
    const stemX  = stemUp ? nx + r - 1 : nx - r + 1;
    svg.appendChild(el('line', {
      x1:stemX, x2:stemX,
      y1:cy, y2:stemUp ? cy - 30 : cy + 30,
      stroke:fill, 'stroke-width':'1.5',
    }));

    // Duration dot for dotted notes (none in this song but good to have)
    // Duration flag/beam for eighths — simplified: just show flags
    if (note.dur === 'e' || note.dur === 'q') {
      // beaming would go here in future
    }

    // Note name label below note for current target
    if (idx === pa_noteIndex) {
      svg.appendChild(el('text', {
        x:nx, y:PA_TOP_LINE + 4*PA_GAP + 24,
        'font-size':'10', 'font-weight':'600',
        fill:hitCol, 'text-anchor':'middle',
        'font-family':'-apple-system,BlinkMacSystemFont,sans-serif',
      }, note.pitch));
    }
  });

  // Pitch line
  pa_renderPitchLine(svg, el, W);
}

// ── Flash note colour ──────────────────────────────────────────────────────
function pa_flashNote(idx, color) {
  // Will be repainted on next render cycle naturally
  // Just trigger a render immediately to show green flash
  pa_render();
}

// ── Pitch line ────────────────────────────────────────────────────────────
let pa_pitchLineY = null;
function pa_updatePitchLine(hz) {
  if (!hz) { pa_pitchLineY = null; return; }
  const step     = pa_hzToStep(hz);
  pa_pitchLineY  = pa_stepToY(step);
}

function pa_renderPitchLine(svg, el, W) {
  if (pa_pitchLineY === null) return;
  const y = pa_pitchLineY;
  const svgH = PA_SVG_H;

  if (y < 2) {
    // Arrow up
    svg.appendChild(el('polygon', {
      points:`${PA_PLAYHEAD_X},4 ${PA_PLAYHEAD_X-8},14 ${PA_PLAYHEAD_X+8},14`,
      fill:'#185FA5', opacity:'0.8',
    }));
    return;
  }
  if (y > svgH - 6) {
    // Arrow down
    svg.appendChild(el('polygon', {
      points:`${PA_PLAYHEAD_X},${svgH-4} ${PA_PLAYHEAD_X-8},${svgH-14} ${PA_PLAYHEAD_X+8},${svgH-14}`,
      fill:'#185FA5', opacity:'0.8',
    }));
    return;
  }

  svg.appendChild(el('line', {
    x1: PA_PLAYHEAD_X - 40, x2: PA_PLAYHEAD_X + 40,
    y1: y, y2: y,
    stroke:'#185FA5', 'stroke-width':'2.5',
    'stroke-linecap':'round', opacity:'0.85',
  }));
}

// ── Geometry helpers ──────────────────────────────────────────────────────

// Convert note to absolute X pixel position (before scroll)
function pa_noteToX(note) {
  // Sum beat durations up to this note's position
  const totalBeats = (note.measure - 1) * 4 + (note.beat - 1);
  return PA_PLAYHEAD_X + 60 + totalBeats * PA_BEAT_W; // 60px offset for clef
}

// Start X of a measure
function pa_measureStartX(mNum) {
  return PA_PLAYHEAD_X + 60 + (mNum - 1) * 4 * PA_BEAT_W;
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

// Hz → step (for pitch line position)
function pa_hzToStep(hz) {
  if (!hz || hz < 60) return 0;
  // Convert to nearest semitone relative to E4 (329.63 Hz)
  const E4_HZ = 329.63;
  const semitones = 12 * Math.log2(hz / E4_HZ);
  // Map semitones to steps: each step = half a line gap = 1 diatonic step
  // Rough diatonic mapping: 2 semitones per step on average
  return semitones / 2;
}

// Draw ledger lines for notes outside the staff
function pa_drawLedger(svg, el, nx, cy, r, lineCol, step) {
  // Bottom ledger (step 0 = on first line, step -2 = on ledger below)
  if (step <= -2) {
    for (let s = -2; s >= step; s -= 2) {
      const ly = pa_stepToY(s);
      svg.appendChild(el('line', {
        x1:nx-r-4, x2:nx+r+4, y1:ly, y2:ly,
        stroke:lineCol, 'stroke-width':'1.5',
      }));
    }
  }
  // Middle C ledger (step -2 = C4)
  if (step === -2) {
    const ly = pa_stepToY(-2);
    svg.appendChild(el('line', {
      x1:nx-r-4, x2:nx+r+4, y1:ly, y2:ly,
      stroke:lineCol, 'stroke-width':'1.5',
    }));
  }
  // Top ledger
  if (step >= 10) {
    for (let s = 10; s <= step; s += 2) {
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
