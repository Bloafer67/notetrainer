// ── audio/pitch.js ────────────────────────────────────────────────────────
// Real-time pitch detection using Web Audio API + YIN-style normalized
// difference, confidence frames, and lightweight onset detection.

let audioCtx       = null;
let analyserNode   = null;
let micStream      = null;
let pitchRAF       = null;
let pitchBuffer    = null;
let onPitchUpdate  = null;
let lastPitchRms   = 0;
let smoothPitchRms = 0;

const PITCH_MIN_HZ = 50;
const PITCH_MAX_HZ = 1500;
const PITCH_MIN_RMS = 0.006;
const PITCH_MIN_CLARITY = 0.72;
const PITCH_YIN_THRESHOLD = 0.12;
const PITCH_OCTAVE_CORRECTION_MAX_TARGET_HZ = 131;

// ── Start mic + detection ─────────────────────────────────────────────────
async function startPitchDetection(onUpdate) {
  onPitchUpdate = onUpdate;
  try {
    micStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        channelCount: 1,
      },
      video: false,
    });
    audioCtx  = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') await audioCtx.resume();

    const source = audioCtx.createMediaStreamSource(micStream);
    analyserNode = audioCtx.createAnalyser();
    analyserNode.fftSize = 2048;
    analyserNode.smoothingTimeConstant = 0; // no smoothing — we want raw signal
    pitchBuffer = new Float32Array(analyserNode.fftSize);
    lastPitchRms = 0;
    smoothPitchRms = 0;
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
  pitchBuffer = null;
  onPitchUpdate = null;
}

// ── Detection loop ────────────────────────────────────────────────────────
function detectLoop() {
  pitchRAF = requestAnimationFrame(detectLoop);
  if (!analyserNode || !audioCtx) return;

  if (!pitchBuffer || pitchBuffer.length !== analyserNode.fftSize) {
    pitchBuffer = new Float32Array(analyserNode.fftSize);
  }
  analyserNode.getFloatTimeDomainData(pitchBuffer);

  const frame = detectPitch(pitchBuffer, audioCtx.sampleRate);
  frame.onset = detectPitchOnset(frame.rms);
  frame.at = performance.now();
  if (onPitchUpdate) onPitchUpdate(frame);
}

// ── Pitch detection — YIN-style normalized difference ─────────────────────
function detectPitch(buf, sampleRate) {
  const SIZE = buf.length;

  let mean = 0;
  for (let i = 0; i < SIZE; i++) mean += buf[i];
  mean /= SIZE;

  const centered = new Float32Array(SIZE);
  let rms = 0;
  for (let i = 0; i < SIZE; i++) {
    const sample = buf[i] - mean;
    centered[i] = sample;
    rms += sample * sample;
  }
  rms = Math.sqrt(rms / SIZE);
  if (rms < PITCH_MIN_RMS) return pitchFrame(null, 0, rms);

  const minTau = Math.max(2, Math.floor(sampleRate / PITCH_MAX_HZ));
  const maxTau = Math.min(SIZE - 2, Math.floor(sampleRate / PITCH_MIN_HZ));
  const diff = new Float32Array(maxTau + 1);
  const cmnd = new Float32Array(maxTau + 1);

  for (let tau = 1; tau <= maxTau; tau++) {
    let sum = 0;
    for (let i = 0; i < SIZE - tau; i++) {
      const delta = centered[i] - centered[i + tau];
      sum += delta * delta;
    }
    diff[tau] = sum;
  }

  cmnd[0] = 1;
  let runningSum = 0;
  for (let tau = 1; tau <= maxTau; tau++) {
    runningSum += diff[tau];
    cmnd[tau] = runningSum ? diff[tau] * tau / runningSum : 1;
  }

  let tauEstimate = -1;
  for (let tau = minTau; tau <= maxTau; tau++) {
    if (cmnd[tau] < PITCH_YIN_THRESHOLD) {
      while (tau + 1 <= maxTau && cmnd[tau + 1] < cmnd[tau]) tau++;
      tauEstimate = tau;
      break;
    }
  }

  if (tauEstimate < 0) {
    let bestValue = 1;
    for (let tau = minTau; tau <= maxTau; tau++) {
      if (cmnd[tau] < bestValue) {
        bestValue = cmnd[tau];
        tauEstimate = tau;
      }
    }
    if (tauEstimate < 0 || 1 - bestValue < PITCH_MIN_CLARITY) {
      return pitchFrame(null, Math.max(0, 1 - bestValue), rms);
    }
  }

  // Parabolic interpolation for smoother frequency
  const y1 = cmnd[tauEstimate - 1] ?? cmnd[tauEstimate];
  const y2 = cmnd[tauEstimate];
  const y3 = cmnd[tauEstimate + 1] ?? cmnd[tauEstimate];
  const denom = 2 * (2 * y2 - y1 - y3);
  const refinedTau = denom === 0 ? tauEstimate : tauEstimate + (y3 - y1) / denom;

  const hz = sampleRate / refinedTau;
  const clarity = Math.max(0, Math.min(1, 1 - y2));

  if (hz < PITCH_MIN_HZ || hz > PITCH_MAX_HZ) return pitchFrame(null, clarity, rms);
  if (clarity < PITCH_MIN_CLARITY) return pitchFrame(null, clarity, rms);
  return pitchFrame(hz, clarity, rms);
}

function pitchFrame(hz, clarity, rms) {
  return {
    hz,
    rawHz: hz,
    clarity,
    rms,
    onset: false,
    at: 0,
  };
}

function detectPitchOnset(rms) {
  const prevRms = lastPitchRms;
  smoothPitchRms = smoothPitchRms ? 0.85 * smoothPitchRms + 0.15 * rms : rms;
  lastPitchRms = rms;

  if (rms < PITCH_MIN_RMS * 1.5) return false;
  if (prevRms < PITCH_MIN_RMS && rms >= PITCH_MIN_RMS * 2) return true;
  return rms > smoothPitchRms * 1.65 && rms - prevRms > 0.01;
}

function normalizePitchFrame(frame) {
  if (typeof frame === 'number') return pitchFrame(frame, 1, PITCH_MIN_RMS);
  return frame || pitchFrame(null, 0, 0);
}

function pitchCents(hz, targetHz) {
  if (!hz || !targetHz) return Infinity;
  return 1200 * Math.log2(hz / targetHz);
}

function pitchHzForTarget(frame, targetHz, thresholdCents = 80) {
  const normalized = normalizePitchFrame(frame);
  const hz = normalized.hz;
  if (!hz || !targetHz) return null;

  const directCents = Math.abs(pitchCents(hz, targetHz));
  if (directCents <= thresholdCents) return hz;

  if (targetHz <= PITCH_OCTAVE_CORRECTION_MAX_TARGET_HZ) {
    const octaveDown = hz / 2;
    if (Math.abs(pitchCents(octaveDown, targetHz)) <= thresholdCents) {
      return octaveDown;
    }
  }

  return hz;
}

function pitchFrameIsUsable(frame) {
  const normalized = normalizePitchFrame(frame);
  return !!normalized.hz && normalized.clarity >= PITCH_MIN_CLARITY && normalized.rms >= PITCH_MIN_RMS;
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
