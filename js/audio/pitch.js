// ── audio/pitch.js ────────────────────────────────────────────────────────
// Real-time pitch detection using Web Audio API + improved autocorrelation
// Much more reliable than the original — lower RMS threshold, better algorithm

let audioCtx      = null;
let analyserNode  = null;
let micStream     = null;
let pitchRAF      = null;
let onPitchUpdate = null;

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

  const hz = detectPitch(buf, audioCtx.sampleRate);
  if (onPitchUpdate) onPitchUpdate(hz);
}

// ── Pitch detection — improved autocorrelation ────────────────────────────
// More forgiving RMS threshold and cleaner peak-finding
function detectPitch(buf, sampleRate) {
  const SIZE = buf.length;

  // RMS signal check — 0.003 is much more sensitive than the old 0.01
  let rms = 0;
  for (let i = 0; i < SIZE; i++) rms += buf[i] * buf[i];
  rms = Math.sqrt(rms / SIZE);
  if (rms < 0.003) return null;

  // Autocorrelation
  const corr = new Float32Array(SIZE);
  for (let lag = 0; lag < SIZE; lag++) {
    let sum = 0;
    for (let i = 0; i < SIZE - lag; i++) {
      sum += buf[i] * buf[i + lag];
    }
    corr[lag] = sum;
  }

  // Find the first dip (end of first lobe)
  let d = 1;
  while (d < SIZE / 2 && corr[d] > corr[d - 1]) d++;
  while (d < SIZE / 2 && corr[d] < corr[d - 1]) d++;

  // Find the highest peak after the dip
  let maxVal = -Infinity, maxPos = d;
  for (let i = d; i < SIZE / 2; i++) {
    if (corr[i] > maxVal) { maxVal = corr[i]; maxPos = i; }
  }

  // Reject weak correlations (noisy signal)
  if (maxVal < corr[0] * 0.4) return null;
  if (maxPos < 2) return null;

  // Parabolic interpolation for smoother frequency
  const y1 = corr[maxPos - 1] ?? 0;
  const y2 = corr[maxPos];
  const y3 = corr[maxPos + 1] ?? 0;
  const denom = 2 * (2 * y2 - y1 - y3);
  const refinedPos = denom === 0 ? maxPos : maxPos - (y3 - y1) / denom;

  const hz = sampleRate / refinedPos;

  // Clamp to human vocal + instrument range
  if (hz < 60 || hz > 1500) return null;
  return hz;
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
