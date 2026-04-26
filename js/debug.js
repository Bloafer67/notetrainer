// ── js/debug.js ───────────────────────────────────────────────────────────
// Pitch calibrator. Reuses the production pitch pipeline (startPitchDetection
// + setPitchDiagnosticListener) so what we measure here is exactly what the
// game sees.
//
// Frame log shape (one entry per requestAnimationFrame tick while recording):
//   { t, hz, rms, clarity, refinedPos, reason, midi, note, cents, expected }
//
// Section markers (when a prompt is selected) get their own entry:
//   { t, kind: 'section', label, expected }

(() => {
  // ── Prompts ─────────────────────────────────────────────────────────────
  // Each prompt's `expected` is the *acoustic* pitch of the note (Hz),
  // matching what the mic actually hears — for guitar, that's an octave below
  // the written staff pitch. The detector returns the acoustic frequency, so
  // we compare against the same.
  const PROMPTS_STRINGS = [
    { id: 'E2', name: 'E2',  desc: 'Low E (6th string)' },
    { id: 'A2', name: 'A2',  desc: '5th string' },
    { id: 'D3', name: 'D3',  desc: '4th string' },
    { id: 'G3', name: 'G3',  desc: '3rd string' },
    { id: 'B3', name: 'B3',  desc: '2nd string' },
    { id: 'E4', name: 'E4',  desc: 'High E (1st string)' },
  ];
  const PROMPTS_SCALE = [
    { id: 'C3', name: 'C3', desc: 'A-string, 3rd fret' },
    { id: 'D3', name: 'D3', desc: 'D-string open' },
    { id: 'E3', name: 'E3', desc: 'D-string, 2nd fret' },
    { id: 'F3', name: 'F3', desc: 'D-string, 3rd fret' },
    { id: 'G3', name: 'G3', desc: 'G-string open' },
    { id: 'A3', name: 'A3', desc: 'G-string, 2nd fret' },
    { id: 'B3', name: 'B3', desc: 'B-string open' },
    { id: 'C4', name: 'C4', desc: 'B-string, 1st fret' },
  ];

  // ── State ───────────────────────────────────────────────────────────────
  let micRunning = false;
  let recording = false;
  let recordStartT = 0;
  let activePrompt = null; // { id, name, expectedHz }
  const log = [];
  const MAX_LOG_RENDER = 200;

  // ── DOM refs ────────────────────────────────────────────────────────────
  const els = {
    micBtn:    document.getElementById('dbg-mic-btn'),
    recordBtn: document.getElementById('dbg-record-btn'),
    recordSt:  document.getElementById('dbg-record-status'),
    meta:      document.getElementById('dbg-meta'),
    note:      document.getElementById('dbg-note'),
    cents:     document.getElementById('dbg-cents'),
    hz:        document.getElementById('dbg-hz'),
    reason:    document.getElementById('dbg-reason'),
    rmsVal:    document.getElementById('dbg-rms-val'),
    rmsBar:    document.getElementById('dbg-rms-bar'),
    rmsGate:   document.getElementById('dbg-rms-gate'),
    clarVal:   document.getElementById('dbg-clarity-val'),
    clarBar:   document.getElementById('dbg-clarity-bar'),
    clarGate:  document.getElementById('dbg-clarity-gate'),
    promptsS:  document.getElementById('dbg-prompts-strings'),
    promptsC:  document.getElementById('dbg-prompts-scale'),
    activePr:  document.getElementById('dbg-active-prompt'),
    clearPr:   document.getElementById('dbg-clear-prompt'),
    log:       document.getElementById('dbg-log'),
    logCount:  document.getElementById('dbg-log-count'),
    exportBtn: document.getElementById('dbg-export-btn'),
    copyBtn:   document.getElementById('dbg-copy-btn'),
    clearBtn:  document.getElementById('dbg-clear-btn'),
  };

  // ── Helpers ─────────────────────────────────────────────────────────────
  // Pure copy of hzToNote — kept self-contained so the debug page works even
  // if the synth note table is unloaded.
  function hzToNoteName(hz) {
    if (!hz) return null;
    const NOTES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
    const semitones = 12 * Math.log2(hz / 440);
    const rounded = Math.round(semitones);
    const cents = Math.round((semitones - rounded) * 100);
    const midi = rounded + 69;
    const octave = Math.floor(midi / 12) - 1;
    return { note: NOTES[((midi % 12) + 12) % 12] + octave, midi, cents };
  }

  function noteToHz(name) {
    const m = name.match(/^([A-G])(#|b)?(-?\d+)$/);
    if (!m) return null;
    const NAMES = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
    const semis = NAMES[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
    const midi = semis + (parseInt(m[3], 10) + 1) * 12;
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  function fmtHz(hz)    { return hz == null ? '—' : `${hz.toFixed(1)} Hz`; }
  function fmtCents(c)  { return c == null ? '' : `${c >= 0 ? '+' : ''}${c}¢`; }
  function fmtPct(v, max) { return Math.min(100, Math.max(0, (v / max) * 100)); }

  // ── Live readout ────────────────────────────────────────────────────────
  function updateLive(d) {
    if (!d) return;
    const RMS_DISPLAY_MAX = 0.05;     // arbitrary visual ceiling
    const CLARITY_MAX = 1.0;
    els.rmsVal.textContent  = d.rms.toFixed(4);
    els.rmsBar.style.width  = fmtPct(d.rms, RMS_DISPLAY_MAX) + '%';
    els.rmsGate.style.left  = fmtPct(0.0035, RMS_DISPLAY_MAX) + '%';
    els.clarVal.textContent = d.clarity.toFixed(2);
    els.clarBar.style.width = fmtPct(d.clarity, CLARITY_MAX) + '%';
    els.clarGate.style.left = fmtPct(0.6, CLARITY_MAX) + '%';
    els.reason.textContent  = d.reason;

    if (d.hz != null) {
      const n = hzToNoteName(d.hz);
      els.note.textContent = n.note;
      els.cents.textContent = fmtCents(n.cents);
      els.hz.textContent = fmtHz(d.hz);
    } else {
      els.note.textContent = '—';
      els.cents.textContent = '';
      els.hz.textContent = '—';
    }
  }

  // ── Logging ─────────────────────────────────────────────────────────────
  function captureFrame(d) {
    if (!recording) return;
    const t = Math.round(performance.now() - recordStartT);
    if (d.hz != null) {
      const n = hzToNoteName(d.hz);
      log.push({
        t,
        hz: +d.hz.toFixed(2),
        rms: +d.rms.toFixed(5),
        clarity: +d.clarity.toFixed(3),
        refinedPos: +d.refinedPos.toFixed(2),
        reason: d.reason,
        octaveCorrected: !!d.octaveCorrected,
        midi: n.midi,
        note: n.note,
        cents: n.cents,
        expected: activePrompt?.id ?? null,
      });
    } else {
      log.push({
        t,
        hz: null,
        rms: +d.rms.toFixed(5),
        clarity: +d.clarity.toFixed(3),
        reason: d.reason,
        expected: activePrompt?.id ?? null,
      });
    }
    if (log.length % 5 === 0) renderLog();
  }

  function pushSectionMarker(prompt) {
    if (!recording) return;
    log.push({
      t: Math.round(performance.now() - recordStartT),
      kind: 'section',
      label: prompt ? prompt.id : 'cleared',
      expected: prompt?.id ?? null,
      expectedHz: prompt?.expectedHz ?? null,
    });
    renderLog();
  }

  function renderLog() {
    els.logCount.textContent = `${log.length} frame${log.length === 1 ? '' : 's'}`;
    if (log.length === 0) {
      els.log.innerHTML = '<div class="dbg-log-empty">No frames captured yet.</div>';
      return;
    }
    const slice = log.slice(-MAX_LOG_RENDER);
    const lines = slice.map(e => {
      if (e.kind === 'section') {
        return `<div class="dbg-log-row section">── ${e.t}ms · section: ${e.label} ──</div>`;
      }
      const reasonClass = e.reason || 'ok';
      const exp = e.expected ? `  exp=${e.expected}` : '';
      if (e.hz == null) {
        return `<div class="dbg-log-row ${reasonClass}">${String(e.t).padStart(6)}ms  hz=—       rms=${e.rms.toFixed(4)}  cl=${e.clarity.toFixed(2)}  ${e.reason}${exp}</div>`;
      }
      const cents = e.cents >= 0 ? `+${e.cents}` : `${e.cents}`;
      const oc = e.octaveCorrected ? ' ★oct' : '';
      return `<div class="dbg-log-row ${reasonClass}">${String(e.t).padStart(6)}ms  hz=${e.hz.toFixed(1).padStart(7)}  ${e.note.padEnd(4)} ${cents.padStart(4)}¢  rms=${e.rms.toFixed(4)}  cl=${e.clarity.toFixed(2)}${oc}${exp}</div>`;
    });
    els.log.innerHTML = lines.join('');
    els.log.scrollTop = els.log.scrollHeight;
  }

  // ── Prompts UI ──────────────────────────────────────────────────────────
  function renderPrompts() {
    const make = (p) => {
      const btn = document.createElement('button');
      btn.className = 'dbg-prompt';
      btn.dataset.id = p.id;
      btn.innerHTML = `<div class="dbg-prompt-name">${p.name}</div><div class="dbg-prompt-desc">${p.desc}</div>`;
      btn.addEventListener('click', () => selectPrompt(p));
      return btn;
    };
    PROMPTS_STRINGS.forEach(p => els.promptsS.appendChild(make(p)));
    PROMPTS_SCALE.forEach(p => els.promptsC.appendChild(make(p)));
  }

  function selectPrompt(p) {
    const expectedHz = noteToHz(p.id);
    activePrompt = { id: p.id, name: p.name, expectedHz };
    document.querySelectorAll('.dbg-prompt').forEach(el => {
      el.classList.toggle('active', el.dataset.id === p.id);
    });
    els.activePr.textContent = `${p.name} (${expectedHz.toFixed(1)} Hz)`;
    pushSectionMarker(activePrompt);
  }

  function clearPrompt() {
    activePrompt = null;
    document.querySelectorAll('.dbg-prompt').forEach(el => el.classList.remove('active'));
    els.activePr.textContent = 'none';
    pushSectionMarker(null);
  }

  // ── Mic / record control ────────────────────────────────────────────────
  async function toggleMic() {
    if (micRunning) {
      stopPitchDetection();
      setPitchDiagnosticListener(null);
      micRunning = false;
      els.micBtn.textContent = 'Start mic';
      els.micBtn.classList.add('primary');
      els.recordBtn.disabled = true;
      if (recording) toggleRecord();
      els.meta.textContent = '—';
      return;
    }
    els.micBtn.disabled = true;
    els.micBtn.textContent = 'Requesting…';
    const granted = await startPitchDetection(() => {});
    els.micBtn.disabled = false;
    if (!granted) {
      alert('Microphone access denied.');
      els.micBtn.textContent = 'Start mic';
      return;
    }
    setPitchDiagnosticListener(d => { updateLive(d); captureFrame(d); });
    micRunning = true;
    els.micBtn.textContent = 'Stop mic';
    els.micBtn.classList.remove('primary');
    els.recordBtn.disabled = false;
    els.meta.textContent = `mic on · ${navigator.userAgent.includes('Chrome') ? 'Chrome' : navigator.userAgent.includes('Firefox') ? 'Firefox' : 'Safari/other'}`;
  }

  function toggleRecord() {
    if (!recording) {
      recording = true;
      recordStartT = performance.now();
      log.length = 0;
      els.recordBtn.textContent = '■ Stop recording';
      els.recordSt.textContent = 'recording';
      els.recordSt.classList.add('recording');
      if (activePrompt) pushSectionMarker(activePrompt);
    } else {
      recording = false;
      els.recordBtn.textContent = '● Start recording';
      els.recordSt.textContent = `${log.length} frames captured`;
      els.recordSt.classList.remove('recording');
      renderLog();
    }
  }

  // ── Export ──────────────────────────────────────────────────────────────
  function buildExport() {
    return {
      meta: {
        capturedAt: new Date().toISOString(),
        userAgent: navigator.userAgent,
        sampleRate: window.AudioContext ? new AudioContext().sampleRate : null,
        thresholds: { rmsGate: 0.0035, clarityGate: 0.6, hzMin: 60, hzMax: 1500 },
        promptsStrings: PROMPTS_STRINGS,
        promptsScale: PROMPTS_SCALE,
        frameCount: log.filter(e => e.kind !== 'section').length,
      },
      log,
    };
  }

  function exportJSON() {
    const data = JSON.stringify(buildExport(), null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    a.href = url;
    a.download = `pitch-calibration-${stamp}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function copyJSON() {
    const data = JSON.stringify(buildExport(), null, 2);
    try {
      await navigator.clipboard.writeText(data);
      const original = els.copyBtn.textContent;
      els.copyBtn.textContent = 'Copied!';
      setTimeout(() => { els.copyBtn.textContent = original; }, 1200);
    } catch {
      alert('Copy failed — use Download instead.');
    }
  }

  function clearLog() {
    log.length = 0;
    renderLog();
    els.recordSt.textContent = recording ? 'recording' : 'idle';
  }

  // ── Wire up ─────────────────────────────────────────────────────────────
  renderPrompts();
  els.micBtn.addEventListener('click', toggleMic);
  els.recordBtn.addEventListener('click', toggleRecord);
  els.clearPr.addEventListener('click', clearPrompt);
  els.exportBtn.addEventListener('click', exportJSON);
  els.copyBtn.addEventListener('click', copyJSON);
  els.clearBtn.addEventListener('click', clearLog);
})();
