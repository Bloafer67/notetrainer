// ── audio/pitch.js ────────────────────────────────────────────────────────
// Real-time pitch detection using Web Audio API + improved autocorrelation
// Much more reliable than the original — lower RMS threshold, better algorithm

let audioCtx      = null;
let analyserNode  = null;
let micStream     = null;
let pitchRAF      = null;
let onPitchUpdate = null;
let onDiagnostic  = null;

// Tunable thresholds — kept here so the debug page can display them.
const PITCH_RMS_GATE     = 0.0035;
const PITCH_CLARITY_GATE = 0.6;
const PITCH_HZ_MIN       = 60;
const PITCH_HZ_MAX       = 1500;

// ── Start mic + detection ─────────────────────────────────────────────────
async function startPitchDetection(onUpdate) {
  onPitchUpdate = onUpdate;
  try {
    micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    audioCtx  = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') await audioCtx.resume();

    const source = audioCtx.createMediaStreamSource(micStream);
    analyserNode = audioCtx.createAnalyser();
    analyserNode.fftSize = 2048;
    analyserNode.smoothingTimeConstant = 0; // no smoothing — we want raw signal
    source.connect(analyserNode);

    detectLoop();
    return true;
  } catch (e) {
    console.warn('Mic access denied:', e.message);
    return false;
  }
}

// ── Stop mic ──────────────────────────────────────────────────────────────
function stopPitchDetection() {
  if (pitchRAF) cancelAnimationFrame(pitchRAF);
  pitchRAF = null;
  if (micStream) { micStream.getTracks().forEach(t => t.stop()); micStream = null; }
  if (audioCtx)  { audioCtx.close(); audioCtx = null; }
  analyserNode = null;
}

// ── Detection loop ────────────────────────────────────────────────────────
function detectLoop() {
  pitchRAF = requestAnimationFrame(detectLoop);
  if (!analyserNode || !audioCtx) return;

  const buf = new Float32Array(analyserNode.fftSize);
  analyserNode.getFloatTimeDomainData(buf);

  const result = detectPitchVerbose(buf, audioCtx.sampleRate);
  const hz = result.hz;
  if (onPitchUpdate) onPitchUpdate(hz);
  if (onDiagnostic) onDiagnostic(result);
}

// ── Pitch detection — improved autocorrelation ────────────────────────────
// Returns just hz (or null) for normal callers.
function detectPitch(buf, sampleRate) {
  return detectPitchVerbose(buf, sampleRate).hz;
}

// Same algorithm but returns a full diagnostic object every frame:
//   { hz, rms, clarity, refinedPos, reason }
// hz is null when a gate fails; reason names the gate ('rms', 'clarity',
// 'no-peak', 'out-of-range') or 'ok' when hz is valid.
function detectPitchVerbose(buf, sampleRate) {
  const SIZE = buf.length;

  let rms = 0;
  for (let i = 0; i < SIZE; i++) rms += buf[i] * buf[i];
  rms = Math.sqrt(rms / SIZE);
  if (rms < PITCH_RMS_GATE) return { hz: null, rms, clarity: 0, refinedPos: 0, reason: 'rms' };

  const corr = new Float32Array(SIZE);
  for (let lag = 0; lag < SIZE; lag++) {
    let sum = 0;
    for (let i = 0; i < SIZE - lag; i++) {
      sum += buf[i] * buf[i + lag];
    }
    corr[lag] = sum;
  }

  let d = 1;
  while (d < SIZE / 2 && corr[d] > corr[d - 1]) d++;
  while (d < SIZE / 2 && corr[d] < corr[d - 1]) d++;

  let maxVal = -Infinity, maxPos = d;
  for (let i = d; i < SIZE / 2; i++) {
    if (corr[i] > maxVal) { maxVal = corr[i]; maxPos = i; }
  }

  const energy = corr[0] || 1;
  const clarity = maxVal / energy;

  if (clarity < PITCH_CLARITY_GATE) return { hz: null, rms, clarity, refinedPos: maxPos, reason: 'clarity' };
  if (maxPos < 2) return { hz: null, rms, clarity, refinedPos: maxPos, reason: 'no-peak' };

  const y1 = corr[maxPos - 1] ?? 0;
  const y2 = corr[maxPos];
  const y3 = corr[maxPos + 1] ?? 0;
  const denom = 2 * (2 * y2 - y1 - y3);
  const refinedPos = denom === 0 ? maxPos : maxPos - (y3 - y1) / denom;

  const hz = sampleRate / refinedPos;
  if (hz < PITCH_HZ_MIN || hz > PITCH_HZ_MAX) {
    return { hz: null, rms, clarity, refinedPos, reason: 'out-of-range' };
  }
  return { hz, rms, clarity, refinedPos, reason: 'ok' };
}

// Debug hook — receives the full diagnostic object on every frame. Pass null
// to clear. The main pitch callback is unaffected.
function setPitchDiagnosticListener(fn) {
  onDiagnostic = fn || null;
}

// ── Hz → nearest note + cents deviation ──────────────────────────────────
function hzToNote(hz) {
  if (!hz) return null;
  const NOTE_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
  const semitones  = 12 * Math.log2(hz / 440); // relative to A4
  const rounded    = Math.round(semitones);
  const cents      = Math.round((semitones - rounded) * 100);
  const midi       = rounded + 69; // A4 = MIDI 69
  const octave     = Math.floor(midi / 12) - 1;
  const noteName   = NOTE_NAMES[((midi % 12) + 12) % 12];
  return { note: noteName + octave, cents };
}
