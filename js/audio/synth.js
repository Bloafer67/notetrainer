// ── audio/synth.js ────────────────────────────────────────────────────────
// Handles: piano note playback via Tone.js
// Depends on: muted (main.js), Tone (CDN script tag in index.html)

// ── Note frequency table ──────────────────────────────────────────────────
// Covers all notes used across treble, bass, and guitar clefs
// plus accidentals for all supported key signatures
const NOTE_FREQS = {
  'A1':55.00,'B1':61.74,
  'C2':65.41,'D2':73.42,'E2':82.41,'F2':87.31,'G2':98.00,'A2':110.00,'B2':123.47,
  'C3':130.81,'D3':146.83,'E3':164.81,'F3':174.61,'G3':196.00,'A3':220.00,'B3':246.94,
  'C4':261.63,'D4':293.66,'E4':329.63,'F4':349.23,'G4':392.00,'A4':440.00,'B4':493.88,
  'C5':523.25,'D5':587.33,'E5':659.25,'F5':698.46,'G5':783.99,'A5':880.00,'B5':987.77,
  'C6':1046.50,'D6':1174.66,'E6':1318.51,
  // Sharps
  'A#1':58.27,'C#2':69.30,'D#2':77.78,'F#2':92.50,'G#2':103.83,'A#2':116.54,
  'C#3':138.59,'D#3':155.56,'F#3':185.00,'G#3':207.65,'A#3':233.08,
  'C#4':277.18,'D#4':311.13,'F#4':369.99,'G#4':415.30,'A#4':466.16,
  'C#5':554.37,'D#5':622.25,'F#5':739.99,'G#5':830.61,'A#5':932.33,
  'C#6':1108.73,'D#6':1244.51,
  // Flats (same frequencies as enharmonic sharps)
  'Bb1':58.27,'Bb2':116.54,'Eb2':77.78,'Ab2':103.83,'Db2':69.30,'Gb2':92.50,
  'Bb3':233.08,'Eb3':155.56,'Ab3':207.65,'Db3':138.59,'Gb3':185.00,
  'Bb4':466.16,'Eb4':311.13,'Ab4':415.30,'Db4':277.18,'Gb4':369.99,'Ab5':830.61,'Bb5':932.33,
  'Eb6':1244.51,
};

let activeSynth = null;

// ── Play a note ───────────────────────────────────────────────────────────
// noteName: e.g. 'F#4', 'Bb3', 'C5'
async function playNote(noteName) {
  if (muted || !window.Tone) return;
  const freq = NOTE_FREQS[noteName];
  if (!freq) return;
  try {
    await Tone.start(); // required by browsers — must follow a user gesture
    if (activeSynth) {
      try { activeSynth.dispose(); } catch (e) {}
    }
    activeSynth = new Tone.Synth({
      oscillator: { type: 'triangle' },
      envelope: { attack: 0.002, decay: 0.8, sustain: 0.3, release: 2.0 },
      volume: -6,
    }).toDestination();
    activeSynth.triggerAttackRelease(freq, '4n');
  } catch (e) {
    // Silently ignore audio errors (e.g. browser autoplay policy)
  }
}
