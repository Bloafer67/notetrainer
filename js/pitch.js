// ── audio/pitch.js ────────────────────────────────────────────────────────
// Handles: microphone input, real-time pitch detection via autocorrelation
// Used by: Play the Notes game mode
// No external libraries — pure Web Audio API

let audioCtx      = null;
let analyserNode  = null;
let micStream     = null;
let pitchRAF      = null; // requestAnimationFrame handle
let onPitchUpdate = null; // callback(hz) called every frame with detected pitch

// ── Request mic and start detecting ──────────────────────────────────────
// onUpdate(hz): called ~60fps with the detected frequency (or null if no pitch)
// Returns true on success, false if permission denied
async function startPitchDetection(onUpdate) {
  onPitchUpdate = onUpdate;
  try {
    micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    audioCtx  = new (window.AudioContext || window.webkitAudioContext)();

    // iOS Safari requires AudioContext to be resumed after a user gesture
    if (audioCtx.state === 'suspended') await audioCtx.resume();

    const source = audioCtx.createMediaStreamSource(micStream);
    analyserNode = audioCtx.createAnalyser();
    analyserNode.fftSize = 2048;
    source.connect(analyserNode);

    detectLoop();
    return true;
  } catch (e) {
    console.warn('Mic access denied or unavailable:', e.message);
    return false;
  }
}

// ── Stop detection and release mic ────────────────────────────────────────
function stopPitchDetection() {
  if (pitchRAF) cancelAnimationFrame(pitchRAF);
  pitchRAF = null;
  if (micStream) {
    micStream.getTracks().forEach(t => t.stop());
    micStream = null;
  }
  if (audioCtx) {
    audioCtx.close();
    audioCtx = null;
  }
  analyserNode = null;
}

// ── Main detection loop ───────────────────────────────────────────────────
function detectLoop() {
  pitchRAF = requestAnimationFrame(detectLoop);
  if (!analyserNode) return;

  const buf = new Float32Array(analyserNode.fftSize);
  analyserNode.getFloatTimeDomainData(buf);

  const hz = autocorrelate(buf, audioCtx.sampleRate);
  if (onPitchUpdate) onPitchUpdate(hz); // null means silence/noise
}

// ── Autocorrelation pitch detection ──────────────────────────────────────
// Returns frequency in Hz, or null if no clear pitch found
// Based on the McLeod Pitch Method simplified for browser use
function autocorrelate(buf, sampleRate) {
  const SIZE = buf.length;

  // Check signal strength — ignore silence
  let rms = 0;
  for (let i = 0; i < SIZE; i++) rms += buf[i] * buf[i];
  rms = Math.sqrt(rms / SIZE);
  if (rms < 0.01) return null; // too quiet

  // Find first zero crossing going downward (start of correlation)
  let r1 = 0, r2 = SIZE - 1;
  for (let i = 0; i < SIZE / 2; i++) {
    if (buf[i] < 0) { r1 = i; break; }
  }
  for (let i = 1; i < SIZE / 2; i++) {
    if (buf[SIZE - i] < 0) { r2 = SIZE - i; break; }
  }
  const trimBuf = buf.slice(r1, r2);
  const trimSize = trimBuf.length;

  // Build autocorrelation array
  const c = new Array(trimSize).fill(0);
  for (let i = 0; i < trimSize; i++) {
    for (let j = 0; j < trimSize - i; j++) {
      c[i] += trimBuf[j] * trimBuf[j + i];
    }
  }

  // Find first dip then first peak after it
  let d = 0;
  while (d < trimSize && c[d] > c[d + 1]) d++;

  let maxVal = -1, maxPos = -1;
  for (let i = d; i < trimSize; i++) {
    if (c[i] > maxVal) { maxVal = c[i]; maxPos = i; }
  }
  if (maxPos === -1) return null;

  // Parabolic interpolation for sub-sample accuracy
  const x1 = c[maxPos - 1], x2 = c[maxPos], x3 = c[maxPos + 1] ?? 0;
  const a  = (x1 + x3 - 2 * x2) / 2;
  const b  = (x3 - x1) / 2;
  const T0 = a ? -b / (2 * a) + maxPos : maxPos;

  return sampleRate / T0;
}

// ── Convert Hz to nearest note name and cents offset ─────────────────────
// Returns { note: 'A4', cents: +12 } or null
function hzToNote(hz) {
  if (!hz || hz < 50 || hz > 2000) return null;
  const noteNames = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
  const A4 = 440;
  const semitones = 12 * Math.log2(hz / A4); // semitones from A4
  const roundedSemitones = Math.round(semitones);
  const cents = Math.round((semitones - roundedSemitones) * 100);
  const midiNote = roundedSemitones + 69; // A4 = MIDI 69
  const octave   = Math.floor(midiNote / 12) - 1;
  const noteName = noteNames[((midiNote % 12) + 12) % 12];
  return { note: noteName + octave, cents };
}
