// Main Orchestrator: Links Audio, 2D/3D Oscilloscopes, UI, Piano, and Intervals Grid

import { CHORD_PRESETS, INTERVALS_BY_SEMITONE, identifyChordFromIntervals, NOTE_COLORS, noteNameToSemitone } from './math/harmonics.js';
import { AudioEngine } from './audio/audioEngine.js';
import { MediaImporter } from './audio/mediaImporter.js';
import { Oscilloscope2D } from './visualizer/oscilloscope2D.js';
import { Oscilloscope3D } from './visualizer/oscilloscope3D.js';
import { IntervalsGrid } from './visualizer/intervalsGrid.js';
import { MiniWaveform } from './visualizer/miniWaveform.js';

// Application State
const state = {
  currentTab: 'lab', // 'lab' | 'matrix'
  dimension: '2D', // '2D' | '3D'
  activePresetId: 'fifth',
  category: 'A RATIO OF',
  title: '3 : 2',
  notes: ['C', 'G'],
  ratios: [1, 1.5],
  ratioInts: [2, 3],
  colors: ['#ff5376', '#ff9f43'],
  consonance: 'Perfect Consonance',
  description: 'G completes 3 cycles for every 2 cycles of C. Waves synchronize into a stable 2-lobed Lissajous loop.',
  rootHz: 261.6256, // Middle C4
  speedSliderVal: 100, // 0..100
  phase: 0.0,
  time: 0.0,
  tuning: 'just', // 'just' | 'equal'
  is12TET: false,
  isMuted: false,
  drawMode: 'live', // 'live' | 'full'
  isMediaActive: false,
  mediaType: null, // 'midi' | 'audio'
  audioMode: 'xy', // 'xy' | 'pitch'
  xyPoints: null,
  mediaInfo: null
};

// Initialize Audio Engine
const audio = new AudioEngine();

// UI Elements
const canvas2D = document.getElementById('canvas-2d');
const viewport3D = document.getElementById('viewport-3d');
const intervalsGridEl = document.getElementById('intervals-grid-view');
const headerCategory = document.getElementById('header-category');
const headerTitle = document.getElementById('header-title');
const headerNotesBadge = document.getElementById('header-notes-badge');
const sliderSpeed = document.getElementById('slider-speed');
const valSpeed = document.getElementById('val-speed');
const sliderPhase = document.getElementById('slider-phase');
const valPhase = document.getElementById('val-phase');
const btnMute = document.getElementById('btn-mute');
const sliderVolume = document.getElementById('slider-volume');
const valVolume = document.getElementById('val-volume');
const btnTuning = document.getElementById('btn-tuning');
const btnToggleDimension = document.getElementById('btn-toggle-dimension');
const btnClearRedraw = document.getElementById('btn-clear-redraw');
const btnDrawMode = document.getElementById('btn-draw-mode');
const btnTabLab = document.getElementById('btn-tab-lab');
const btnTabMatrix = document.getElementById('btn-tab-matrix');
const btnSnapshot = document.getElementById('btn-snapshot');
const controlsPanel = document.getElementById('controls-panel');
const panelToggle = document.getElementById('panel-toggle');
const btnCollapsePanel = document.getElementById('btn-collapse-panel');
const presetsContainer = document.getElementById('presets-container');
const inputCustomRatio = document.getElementById('input-custom-ratio');
const btnApplyRatio = document.getElementById('btn-apply-ratio');
const pianoContainer = document.getElementById('piano-keyboard');
const btnClearPiano = document.getElementById('btn-clear-piano');
const waveformCanvas = document.getElementById('waveform-canvas');

// Media Player & Importer Elements
const mediaImporter = new MediaImporter(audio);
const btnImportMedia = document.getElementById('btn-import-media');
const fileMediaInput = document.getElementById('file-media-input');
const btnSideImport = document.getElementById('btn-side-import');
const btnDemoMidi = document.getElementById('btn-demo-midi');
const btnDemoAudio = document.getElementById('btn-demo-audio');

const mediaPlayerBar = document.getElementById('media-player-bar');
const playerTrackIcon = document.getElementById('player-track-icon');
const playerTrackTitle = document.getElementById('player-track-title');
const playerTrackMeta = document.getElementById('player-track-meta');
const btnPlayerStop = document.getElementById('btn-player-stop');
const btnPlayerPlay = document.getElementById('btn-player-play');
const btnPlayerLoop = document.getElementById('btn-player-loop');
const playerScrubber = document.getElementById('player-scrubber');
const playerTimeCurrent = document.getElementById('player-time-current');
const playerTimeTotal = document.getElementById('player-time-total');
const playerAudioModeSelector = document.getElementById('player-audio-mode-selector');
const btnAudioModeXy = document.getElementById('btn-audio-mode-xy');
const btnAudioModePitch = document.getElementById('btn-audio-mode-pitch');
const btnPlayerEject = document.getElementById('btn-player-eject');
const dropOverlay = document.getElementById('drop-overlay');

// Harmonic Info Elements
const infoConsonanceBadge = document.getElementById('info-consonance-badge');
const infoFreqBreakdown = document.getElementById('info-freq-breakdown');
const infoDescription = document.getElementById('info-description');
const infoAcousticMode = document.getElementById('info-acoustic-mode');

// Frequency mapping function: converts 0..100 slider value into actual Hertz
export function sliderToHz(val) {
  if (val <= 60) {
    // 0 -> 0.2 Hz, 60 -> 30.0 Hz (Slow rhythmic & fusion zone)
    return 0.2 * Math.pow(30.0 / 0.2, val / 60.0);
  } else {
    // 60 -> 30.0 Hz, 100 -> 261.6256 Hz (Pitch zone)
    return 30.0 * Math.pow(261.6256 / 30.0, (val - 60.0) / 40.0);
  }
}

// Initialize Visualizers
const visualizer2D = new Oscilloscope2D(canvas2D, {
  onExtrema: (axisIdx) => audio.triggerPolyrhythmClick(axisIdx)
});
const visualizer3D = new Oscilloscope3D(viewport3D, {
  onExtrema: (axisIdx) => audio.triggerPolyrhythmClick(axisIdx)
});
const miniWaveform = new MiniWaveform(waveformCanvas);
const intervalsGrid = new IntervalsGrid(intervalsGridEl, (selectedInterval) => {
  loadIntervalIntoLab(selectedInterval);
});

// Setup Presets UI
function buildPresetsUI() {
  presetsContainer.innerHTML = '';
  CHORD_PRESETS.forEach(preset => {
    const chip = document.createElement('button');
    chip.className = `preset-chip ${preset.id === state.activePresetId ? 'active' : ''}`;
    chip.textContent = `${preset.title} (${preset.category})`;
    chip.addEventListener('click', () => {
      loadPreset(preset);
    });
    presetsContainer.appendChild(chip);
  });
}

function loadPreset(preset) {
  if (state.isMediaActive) {
    mediaImporter.pause();
    state.isMediaActive = false;
    state.xyPoints = null;
    if (mediaPlayerBar) mediaPlayerBar.classList.add('hidden');
  }

  state.activePresetId = preset.id;
  state.category = preset.category;
  state.title = preset.title;
  state.notes = [...preset.notes];
  state.ratios = [...preset.ratios];
  state.ratioInts = [...preset.ratioInts];
  state.colors = [...preset.colors];
  state.consonance = preset.consonance || 'Consonant';
  state.description = preset.description || '';

  // Adaptive 2D/3D switching: 3+ notes open in 3D by default (Image 4), 2 notes open in 2D (Image 1)
  if (preset.type === '3D') {
    setDimension('3D');
  } else {
    setDimension('2D');
  }

  state.time = 0;
  visualizer2D.clearPath();
  visualizer3D.clearPath();

  updateHeader();
  syncAudio();
  updatePresetsUI();
  updatePianoSelection();
  updateHarmonicInfo();
}

function loadIntervalIntoLab(interval) {
  state.activePresetId = null;
  state.category = 'A RATIO OF';
  state.title = `${interval.ratio[0]} : ${interval.ratio[1]}`;
  state.notes = ['C', interval.note];
  state.ratios = [1, interval.ratio[0] / interval.ratio[1]];
  state.ratioInts = [interval.ratio[1], interval.ratio[0]];
  state.colors = ['#ff5376', interval.color];
  state.consonance = interval.consonance;
  state.description = interval.description;

  setDimension('2D');
  setTab('lab');

  state.time = 0;
  visualizer2D.clearPath();
  visualizer3D.clearPath();

  updateHeader();
  syncAudio();
  updatePresetsUI();
  updatePianoSelection();
  updateHarmonicInfo();
}

function updateHeader() {
  headerCategory.textContent = state.category;
  headerTitle.textContent = state.title;

  if (!state.notes || state.notes.length === 0) {
    headerNotesBadge.innerHTML = '<span style="color: rgba(255,255,255,0.4); font-size: 14px;">Select piano keys below to set root note and build harmony</span>';
    return;
  }

  headerNotesBadge.innerHTML = state.notes.map((note, idx) => {
    const color = state.colors[idx] || NOTE_COLORS[note] || '#fff';
    const ratio = state.ratios[idx] || 1;
    const freq = (state.rootHz * ratio).toFixed(1);
    const plus = idx < state.notes.length - 1 ? '<span style="color: rgba(255,255,255,0.4)">+</span>' : '';
    return `<span style="color: ${color}">${note} <small style="font-size: 13px; opacity: 0.85;">(${freq} Hz)</small></span> ${plus}`;
  }).join(' ');
}

function updateHarmonicInfo() {
  if (infoConsonanceBadge) {
    infoConsonanceBadge.textContent = state.consonance;
    if (state.consonance.includes('Dissonance')) {
      infoConsonanceBadge.style.color = '#ff5376';
    } else {
      infoConsonanceBadge.style.color = '#2ecc71';
    }
  }

  if (infoFreqBreakdown) {
    const breakdown = state.notes.map((note, idx) => {
      const ratio = state.ratios[idx] || 1;
      const freq = (state.rootHz * ratio).toFixed(1);
      return `${note}: ${freq} Hz`;
    }).join('  |  ');
    infoFreqBreakdown.textContent = breakdown;
  }

  if (infoDescription) {
    infoDescription.textContent = state.description;
  }

  if (infoAcousticMode) {
    const hz = state.rootHz;
    if (hz < 20) {
      infoAcousticMode.textContent = `🥁 Rhythmic Mode (${hz.toFixed(1)} Hz): Ears resolve separate mechanical pulses/clicks.`;
      infoAcousticMode.style.borderLeftColor = '#ff7f50';
    } else if (hz <= 30) {
      infoAcousticMode.textContent = `⚡ Fusion Threshold (${hz.toFixed(1)} Hz): Clicks blur and fuse into continuous pitch!`;
      infoAcousticMode.style.borderLeftColor = '#feca57';
    } else {
      infoAcousticMode.textContent = `🎵 Musical Pitch (${hz.toFixed(1)} Hz): Continuous audible tone. Polyrhythm stopped.`;
      infoAcousticMode.style.borderLeftColor = '#2ecc71';
    }
  }
}

function updatePresetsUI() {
  const chips = presetsContainer.querySelectorAll('.preset-chip');
  chips.forEach((chip, idx) => {
    const preset = CHORD_PRESETS[idx];
    if (preset && preset.id === state.activePresetId) {
      chip.classList.add('active');
    } else {
      chip.classList.remove('active');
    }
  });
}

// 2D / 3D Dimension Switcher
function setDimension(dim) {
  state.dimension = dim;
  if (dim === '3D') {
    canvas2D.style.display = 'none';
    viewport3D.style.display = 'block';
    btnToggleDimension.textContent = '2D Mode';
    btnToggleDimension.classList.add('active');
    if (visualizer3D) {
      visualizer3D.resize(window.innerWidth, window.innerHeight);
    }
  } else {
    canvas2D.style.display = 'block';
    viewport3D.style.display = 'none';
    btnToggleDimension.textContent = '3D Mode';
    btnToggleDimension.classList.remove('active');
    if (visualizer2D) {
      visualizer2D.resize(window.innerWidth, window.innerHeight);
    }
  }
}

// Tab Switcher (Lab vs 12-Interval Grid)
function setTab(tab) {
  state.currentTab = tab;
  if (tab === 'matrix') {
    intervalsGridEl.style.display = 'block';
    document.getElementById('render-viewport').style.display = 'none';
    btnTabMatrix.classList.add('active');
    btnTabLab.classList.remove('active');
    headerCategory.style.display = 'none';
    headerTitle.style.display = 'none';
    headerNotesBadge.style.display = 'none';
  } else {
    intervalsGridEl.style.display = 'none';
    document.getElementById('render-viewport').style.display = 'block';
    btnTabLab.classList.add('active');
    btnTabMatrix.classList.remove('active');
    headerCategory.style.display = 'block';
    headerTitle.style.display = 'block';
    headerNotesBadge.style.display = 'flex';
  }
}

// Setup Interactive Piano Keyboard (C4 to C5)
const PIANO_NOTES = [
  { name: 'C', isBlack: false, semitones: 0 },
  { name: 'Db', isBlack: true, semitones: 1 },
  { name: 'D', isBlack: false, semitones: 2 },
  { name: 'Eb', isBlack: true, semitones: 3 },
  { name: 'E', isBlack: false, semitones: 4 },
  { name: 'F', isBlack: false, semitones: 5 },
  { name: 'F#', isBlack: true, semitones: 6 },
  { name: 'G', isBlack: false, semitones: 7 },
  { name: 'Ab', isBlack: true, semitones: 8 },
  { name: 'A', isBlack: false, semitones: 9 },
  { name: 'Bb', isBlack: true, semitones: 10 },
  { name: 'B', isBlack: false, semitones: 11 },
  { name: "C'", isBlack: false, semitones: 12 }
];

let selectedPianoNotes = ['C', 'G'];

function buildPianoUI() {
  pianoContainer.innerHTML = '';
  const whiteKeysContainer = document.createElement('div');
  whiteKeysContainer.className = 'piano-white-keys';

  const blackKeysContainer = document.createElement('div');
  blackKeysContainer.className = 'piano-black-keys';

  const whiteNotes = PIANO_NOTES.filter(n => !n.isBlack);

  whiteNotes.forEach((note) => {
    const key = document.createElement('div');
    key.className = `piano-key-white ${selectedPianoNotes.includes(note.name) ? 'active' : ''}`;
    key.dataset.note = note.name;
    key.title = note.name;
    key.addEventListener('click', () => togglePianoNote(note.name));
    whiteKeysContainer.appendChild(key);

    const slot = document.createElement('div');
    slot.className = 'piano-black-slot';

    const nextBlack = PIANO_NOTES.find(n => n.isBlack && n.semitones === note.semitones + 1);
    if (nextBlack) {
      const blackKey = document.createElement('div');
      blackKey.className = `piano-key-black ${selectedPianoNotes.includes(nextBlack.name) ? 'active' : ''}`;
      blackKey.dataset.note = nextBlack.name;
      blackKey.title = nextBlack.name;
      blackKey.addEventListener('click', (e) => {
        e.stopPropagation();
        togglePianoNote(nextBlack.name);
      });
      slot.appendChild(blackKey);
    }
    blackKeysContainer.appendChild(slot);
  });

  pianoContainer.appendChild(whiteKeysContainer);
  pianoContainer.appendChild(blackKeysContainer);
}

function togglePianoNote(noteName) {
  audio.resume();
  if (state.isMediaActive) {
    mediaImporter.pause();
    state.isMediaActive = false;
    state.xyPoints = null;
    if (mediaPlayerBar) mediaPlayerBar.classList.add('hidden');
  }
  const idx = selectedPianoNotes.indexOf(noteName);
  if (idx > -1) {
    // Allow deselecting ANY note, including C!
    selectedPianoNotes.splice(idx, 1);
  } else {
    selectedPianoNotes.push(noteName);
  }

  if (selectedPianoNotes.length === 0) {
    clearAllNotes();
    return;
  }

  reconstructFromPiano();
}

function clearAllNotes() {
  selectedPianoNotes = [];
  state.activePresetId = null;
  state.notes = [];
  state.ratios = [1, 1];
  state.ratioInts = [1, 1];
  state.category = 'PIANO KEYBOARD';
  state.title = 'SELECT NOTES';
  state.consonance = 'Ready';
  state.description = 'Click any key on the piano keyboard to choose your root note and build any interval or chord.';

  updateHeader();
  updatePresetsUI();
  updatePianoSelection();
  updateHarmonicInfo();
  syncAudio();
}

function reconstructFromPiano() {
  // Sort selected notes by pitch order
  selectedPianoNotes.sort((a, b) => noteNameToSemitone(a) - noteNameToSemitone(b));

  state.activePresetId = null;
  state.notes = [...selectedPianoNotes];
  state.colors = state.notes.map(n => NOTE_COLORS[n] || '#ff9f43');

  const rootSemitone = noteNameToSemitone(state.notes[0]);
  const rootName = state.notes[0];

  if (state.notes.length === 1) {
    state.category = 'ROOT NOTE';
    state.title = rootName;
    state.ratios = [1];
    state.ratioInts = [1];
    state.consonance = 'Fundamental Pitch';
    state.description = `Selected root note ${rootName}. Oscilloscope displays a 1D pure linear oscillation along the X axis. Click another piano key to form an interval or chord!`;
    if (state.dimension !== '3D') setDimension('2D');
  } else if (state.notes.length === 2) {
    const deltaSemi = (noteNameToSemitone(state.notes[1]) - rootSemitone + 12) % 12 || 12;
    const intDef = INTERVALS_BY_SEMITONE[deltaSemi] || {
      name: 'Interval',
      ratio: [deltaSemi, 1],
      ratioInts: [deltaSemi, 1],
      consonance: 'Custom Interval',
      description: ''
    };

    state.category = `AN INTERVAL (${intDef.name.toUpperCase()})`;
    state.title = `${intDef.ratio[0]} : ${intDef.ratio[1]}`;
    state.ratioInts = [...intDef.ratioInts]; // [X-cycles, Y-cycles] e.g. [3, 2] for Fifth
    state.ratios = [1, intDef.ratio[0] / intDef.ratio[1]];
    state.consonance = intDef.consonance;
    state.description = `${state.notes[1]} completes ${intDef.ratio[0]} cycles for every ${intDef.ratio[1]} cycles of ${state.notes[0]}. ${intDef.description || ''}`;
    if (state.dimension !== '3D') setDimension('2D');
  } else {
    // 3 or more notes
    const intervalsFromRoot = state.notes.map(n => noteNameToSemitone(n) - rootSemitone);
    const chordInfo = identifyChordFromIntervals(intervalsFromRoot);
    state.category = chordInfo.category;
    state.title = chordInfo.title;
    state.ratioInts = [...chordInfo.ratioInts];
    state.ratios = chordInfo.ratioInts.map(r => r / chordInfo.ratioInts[0]);
    state.consonance = chordInfo.consonance;
    state.description = chordInfo.description;
    setDimension('3D');
  }

  state.time = 0;
  visualizer2D.clearPath();
  visualizer3D.clearPath();

  updateHeader();
  syncAudio();
  updatePresetsUI();
  updatePianoSelection();
  updateHarmonicInfo();
}

function updatePianoSelection() {
  selectedPianoNotes = [...state.notes];
  const keys = pianoContainer.querySelectorAll('.piano-key-white, .piano-key-black');
  keys.forEach(k => {
    if (selectedPianoNotes.includes(k.dataset.note)) {
      k.classList.add('active');
    } else {
      k.classList.remove('active');
    }
  });
}

// Sync Audio with Current State
function syncAudio() {
  const notesData = state.notes.map((name, idx) => {
    const semitones = noteNameToSemitone(name);
    const justRatio = state.ratios[idx] || Math.pow(2, semitones / 12);
    return { name, semitones, justRatio };
  });

  audio.setNotes(notesData);
  audio.setTuning(state.tuning);
  audio.setRootFrequency(state.rootHz);
}

// Frequency / Speed Slider listener
sliderSpeed.addEventListener('input', (e) => {
  const val = parseFloat(e.target.value);
  state.speedSliderVal = val;
  const hz = sliderToHz(val);
  state.rootHz = hz;

  audio.setRootFrequency(hz);

  if (hz < 20) {
    valSpeed.textContent = `${hz.toFixed(1)} Hz (Polyrhythm Clicks)`;
    valSpeed.style.color = '#ff7f50';
  } else if (hz <= 30) {
    valSpeed.textContent = `${hz.toFixed(1)} Hz (⚡ Pitch Fusion Threshold)`;
    valSpeed.style.color = '#feca57';
  } else {
    valSpeed.textContent = `${hz.toFixed(1)} Hz (Musical Pitch)`;
    valSpeed.style.color = '#2ecc71';
  }

  updateHeader();
  updateHarmonicInfo();
});

sliderPhase.addEventListener('input', (e) => {
  const val = parseFloat(e.target.value);
  state.phase = val;
  valPhase.textContent = `${val.toFixed(2)} rad`;
  audio.setPhase(val);
});

function updateMuteButtonUI() {
  if (state.isMuted) {
    btnMute.textContent = '🔇 Sound: OFF (Click to Unmute)';
    btnMute.classList.remove('active');
  } else {
    btnMute.textContent = '🔊 Sound: ON';
    btnMute.classList.add('active');
  }
}

btnMute.addEventListener('click', () => {
  audio.resume();
  state.isMuted = !state.isMuted;
  audio.setMuted(state.isMuted);
  updateMuteButtonUI();
});

// Volume slider listener
if (sliderVolume) {
  sliderVolume.addEventListener('input', (e) => {
    audio.resume();
    const v = parseFloat(e.target.value);
    audio.setVolume(v);
    if (valVolume) valVolume.textContent = `${Math.round(v * 100)}%`;
  });
}

// Global user gesture unlock for browser autoplay policy
function unlockAudioOnFirstInteraction() {
  audio.resume();
  if (!state.isMuted) {
    audio.setMuted(false);
  }
  updateMuteButtonUI();
  window.removeEventListener('pointerdown', unlockAudioOnFirstInteraction);
  window.removeEventListener('keydown', unlockAudioOnFirstInteraction);
}
window.addEventListener('pointerdown', unlockAudioOnFirstInteraction);
window.addEventListener('keydown', unlockAudioOnFirstInteraction);

btnTuning.addEventListener('click', () => {
  audio.resume();
  if (state.tuning === 'just') {
    state.tuning = 'equal';
    state.is12TET = true;
    btnTuning.textContent = '12-TET (Piano Drift)';
    btnTuning.classList.remove('active');
  } else {
    state.tuning = 'just';
    state.is12TET = false;
    btnTuning.textContent = 'Just Intonation (Pure)';
    btnTuning.classList.add('active');
  }
  syncAudio();
});

// Timbre selection buttons
document.querySelectorAll('[data-timbre]').forEach(btn => {
  btn.addEventListener('click', () => {
    audio.resume();
    document.querySelectorAll('[data-timbre]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    audio.setTimbre(btn.dataset.timbre);
  });
});

btnToggleDimension.addEventListener('click', () => {
  setDimension(state.dimension === '2D' ? '3D' : '2D');
});

btnClearRedraw.addEventListener('click', () => {
  state.time = 0;
  visualizer2D.clearPath();
  visualizer3D.clearPath();
});

btnDrawMode.addEventListener('click', () => {
  if (state.drawMode === 'live') {
    state.drawMode = 'full';
    btnDrawMode.textContent = '⭕ Mode: Full Loop';
    btnDrawMode.classList.remove('active');
  } else {
    state.drawMode = 'live';
    btnDrawMode.textContent = '✏️ Mode: Live Trace';
    btnDrawMode.classList.add('active');
    state.time = 0;
    visualizer2D.clearPath();
    visualizer3D.clearPath();
  }
});

btnTabLab.addEventListener('click', () => setTab('lab'));
btnTabMatrix.addEventListener('click', () => setTab('matrix'));

// Custom Ratio input handler
btnApplyRatio.addEventListener('click', applyCustomRatio);
inputCustomRatio.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') applyCustomRatio();
});

function applyCustomRatio() {
  audio.resume();
  if (state.isMediaActive) {
    mediaImporter.pause();
    state.isMediaActive = false;
    state.xyPoints = null;
    if (mediaPlayerBar) mediaPlayerBar.classList.add('hidden');
  }
  const raw = inputCustomRatio.value.trim();
  if (!raw) return;

  const parts = raw.split(/[:\s,]+/).map(p => parseFloat(p)).filter(p => !isNaN(p) && p > 0);
  if (parts.length < 2) return;

  const base = parts[0];
  state.ratioInts = parts;
  state.ratios = parts.map(p => p / base);
  state.category = 'A RATIO OF';
  state.title = parts.join(' : ');
  state.activePresetId = null;
  state.consonance = 'Custom Harmonic Ratio';
  state.description = `Custom ratio ${parts.join(':')}. Cycles synchronize cleanly at multiples of the greatest common divisor.`;

  // Generate synthetic note names
  state.notes = parts.map((p) => `H${p}`);
  state.colors = ['#ff5376', '#ff9f43', '#2ecc71', '#d980fa'].slice(0, parts.length);

  if (parts.length >= 3) {
    setDimension('3D');
  } else {
    setDimension('2D');
  }

  state.time = 0;
  visualizer2D.clearPath();
  visualizer3D.clearPath();

  updateHeader();
  syncAudio();
  updatePresetsUI();
  updateHarmonicInfo();
}

btnClearPiano.addEventListener('click', () => {
  clearAllNotes();
});

btnCollapsePanel.addEventListener('click', () => {
  controlsPanel.classList.add('collapsed');
});

panelToggle.addEventListener('click', () => {
  controlsPanel.classList.remove('collapsed');
});

// High-Resolution Snapshot export
btnSnapshot.addEventListener('click', () => {
  let dataUrl = '';
  if (state.dimension === '2D') {
    dataUrl = canvas2D.toDataURL('image/png');
  } else {
    dataUrl = visualizer3D.renderer.domElement.toDataURL('image/png');
  }

  const link = document.createElement('a');
  link.download = `harmonic-oscilloscope-${state.title.replace(/[^a-zA-Z0-9]/g, '_')}.png`;
  link.href = dataUrl;
  link.click();
});

// ----------------------------------------------------
// MEDIA IMPORTER & PLAYER BINDINGS (MIDI & MP3)
// ----------------------------------------------------
function formatTime(sec) {
  if (isNaN(sec) || sec < 0) return '00:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
}

async function loadMediaFile(file) {
  audio.resume();
  try {
    await mediaImporter.loadFile(file);
  } catch (err) {
    alert(err.message || 'Error loading media file');
  }
}

function ejectMedia() {
  mediaImporter.stop();
  state.isMediaActive = false;
  state.mediaType = null;
  state.xyPoints = null;
  if (mediaPlayerBar) mediaPlayerBar.classList.add('hidden');
  loadPreset(CHORD_PRESETS[0]);
}

// MediaImporter Callbacks
mediaImporter.onLoaded = (info) => {
  state.isMediaActive = true;
  state.mediaType = info.type;
  state.mediaInfo = info;
  if (mediaPlayerBar) mediaPlayerBar.classList.remove('hidden');

  if (playerTrackIcon) playerTrackIcon.textContent = info.type === 'midi' ? '🎹' : '🎵';
  if (playerTrackTitle) playerTrackTitle.textContent = info.name;
  if (playerTrackMeta) {
    if (info.type === 'midi') {
      playerTrackMeta.textContent = `MIDI • ${info.tracksCount || 1} Tracks • ${info.bpm || 120} BPM • ${info.noteCount || 0} Notes`;
      if (playerAudioModeSelector) playerAudioModeSelector.style.display = 'none';
      state.audioMode = 'midi';
    } else {
      playerTrackMeta.textContent = `Audio • ${info.channels} Channel(s) • ${(info.sampleRate / 1000).toFixed(1)} kHz`;
      if (playerAudioModeSelector) playerAudioModeSelector.style.display = 'flex';
      state.audioMode = 'xy';
      if (btnAudioModeXy) btnAudioModeXy.classList.add('active');
      if (btnAudioModePitch) btnAudioModePitch.classList.remove('active');
    }
  }

  if (playerTimeCurrent) playerTimeCurrent.textContent = '00:00';
  if (playerTimeTotal) playerTimeTotal.textContent = formatTime(info.duration);
  if (playerScrubber) playerScrubber.value = 0;
  if (btnPlayerPlay) btnPlayerPlay.textContent = '⏸';

  // Stop manual drone voices while media plays
  audio.stopVoices();
  mediaImporter.play();
};

mediaImporter.onPlaybackUpdate = (current, total, isPlaying) => {
  if (playerTimeCurrent) playerTimeCurrent.textContent = formatTime(current);
  if (playerTimeTotal) playerTimeTotal.textContent = formatTime(total);
  if (playerScrubber && total > 0) {
    playerScrubber.value = (current / total) * 100;
  }
  if (btnPlayerPlay) btnPlayerPlay.textContent = isPlaying ? '⏸' : '▶';
};

mediaImporter.onMidiStateChange = (activeNotes, ratioInfo) => {
  if (!state.isMediaActive || state.mediaType !== 'midi' || !ratioInfo) return;

  state.category = ratioInfo.category;
  state.title = ratioInfo.title;
  state.notes = [...ratioInfo.notes];
  state.ratioInts = [...ratioInfo.ratioInts];
  state.ratios = [...ratioInfo.ratios];
  state.colors = [...ratioInfo.colors];
  state.consonance = ratioInfo.consonance;
  state.description = ratioInfo.description;

  updateHeader();
  updateHarmonicInfo();

  // Highlight active notes on interactive piano keyboard
  const activeNames = activeNotes.map(n => n.pitchClass);
  const keys = pianoContainer.querySelectorAll('.piano-key-white, .piano-key-black');
  keys.forEach(k => {
    if (activeNames.includes(k.dataset.note)) {
      k.classList.add('active');
    } else {
      k.classList.remove('active');
    }
  });
};

mediaImporter.onAudioStateChange = (res) => {
  if (!state.isMediaActive || state.mediaType !== 'audio') return;
  state.xyPoints = res.xyPoints;

  if (state.audioMode === 'xy') {
    state.category = 'STEREO VECTORSCOPE';
    state.title = 'CH 1 (L) : CH 2 (R)';
    state.consonance = 'Hardware Lissajous Trace';
    state.description = 'Direct X-Y channel electron beam trace. Left audio channel drives horizontal X-axis; right channel drives vertical Y-axis.';
    updateHeader();
    updateHarmonicInfo();
  } else if (state.audioMode === 'pitch' && res.pitchInfo) {
    const p = res.pitchInfo;
    state.category = `DETECTED PITCH (${p.fullName})`;
    state.title = `${p.frequency.toFixed(1)} Hz`;
    state.consonance = `${p.cents >= 0 ? '+' : ''}${p.cents} Cents`;
    state.description = `Real-time autocorrelation pitch extraction from audio stream. Frequency: ${p.frequency.toFixed(2)} Hz.`;
    state.notes = [p.note];
    state.ratioInts = [1];
    state.colors = [NOTE_COLORS[p.note] || '#2ecc71'];
    updateHeader();
    updateHarmonicInfo();
  }
};

// Top nav and side import buttons
if (btnImportMedia) {
  btnImportMedia.addEventListener('click', () => {
    audio.resume();
    fileMediaInput.click();
  });
}
if (btnSideImport) {
  btnSideImport.addEventListener('click', () => {
    audio.resume();
    fileMediaInput.click();
  });
}
if (fileMediaInput) {
  fileMediaInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (file) {
      await loadMediaFile(file);
      fileMediaInput.value = '';
    }
  });
}

// Built-in Demo buttons
if (btnDemoMidi) {
  btnDemoMidi.addEventListener('click', () => {
    audio.resume();
    mediaImporter.loadBuiltInMidiDemo();
  });
}
if (btnDemoAudio) {
  btnDemoAudio.addEventListener('click', () => {
    audio.resume();
    mediaImporter.loadBuiltInOscilloscopeDemo();
  });
}

// Full-screen Drag and Drop support
window.addEventListener('dragover', (e) => {
  e.preventDefault();
  if (dropOverlay) dropOverlay.classList.add('drag-active');
});

window.addEventListener('dragleave', (e) => {
  if (e.relatedTarget === null && dropOverlay) {
    dropOverlay.classList.remove('drag-active');
  }
});

window.addEventListener('drop', async (e) => {
  e.preventDefault();
  if (dropOverlay) dropOverlay.classList.remove('drag-active');
  if (e.dataTransfer && e.dataTransfer.files.length > 0) {
    const file = e.dataTransfer.files[0];
    await loadMediaFile(file);
  }
});

// Player Controls
if (btnPlayerPlay) {
  btnPlayerPlay.addEventListener('click', () => {
    if (mediaImporter.isPlaying) {
      mediaImporter.pause();
    } else {
      mediaImporter.play();
    }
  });
}

if (btnPlayerStop) {
  btnPlayerStop.addEventListener('click', () => {
    mediaImporter.stop();
  });
}

if (btnPlayerLoop) {
  btnPlayerLoop.addEventListener('click', () => {
    const nextLoop = !mediaImporter.isLooping;
    mediaImporter.setLoop(nextLoop);
    btnPlayerLoop.classList.toggle('active', nextLoop);
  });
}

if (playerScrubber) {
  playerScrubber.addEventListener('input', (e) => {
    const pct = parseFloat(e.target.value) / 100;
    if (mediaImporter.currentMedia) {
      mediaImporter.seek(pct * mediaImporter.currentMedia.duration);
    }
  });
}

document.querySelectorAll('.speed-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.speed-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    mediaImporter.setPlaybackRate(parseFloat(btn.dataset.speed));
  });
});

if (btnAudioModeXy) {
  btnAudioModeXy.addEventListener('click', () => {
    state.audioMode = 'xy';
    mediaImporter.audioMode = 'xy';
    btnAudioModeXy.classList.add('active');
    if (btnAudioModePitch) btnAudioModePitch.classList.remove('active');
  });
}

if (btnAudioModePitch) {
  btnAudioModePitch.addEventListener('click', () => {
    state.audioMode = 'pitch';
    mediaImporter.audioMode = 'pitch';
    btnAudioModePitch.classList.add('active');
    if (btnAudioModeXy) btnAudioModeXy.classList.remove('active');
  });
}

if (btnPlayerEject) {
  btnPlayerEject.addEventListener('click', () => {
    ejectMedia();
  });
}

// Window resize handling
function handleResize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  visualizer2D.resize(w, h);
  visualizer3D.resize(w, h);
  miniWaveform.resize(240, 48);
}
window.addEventListener('resize', handleResize);

// Master Animation Loop (60+ FPS)
let lastFrameTime = performance.now();
function animate(currentTime) {
  requestAnimationFrame(animate);

  const delta = (currentTime - lastFrameTime) * 0.001;
  lastFrameTime = currentTime;

  // Update media playback frame if active (MIDI notes & MP3 stereo samples)
  if (state.isMediaActive) {
    mediaImporter.update();
  }

  // Visual simulation speed based on current Hertz
  let visualSpeed = 1.0;
  if (state.rootHz < 30) {
    // 1 Hz = exactly 1 cycle/sec
    visualSpeed = state.rootHz;
  } else {
    // Pleasant inspection speed for audio pitch
    visualSpeed = 1.0 + Math.log10(state.rootHz / 30);
  }

  // Adaptive harmonic speed damping: when harmonic integers are high (e.g. 45:32 Tritone),
  // adapt speed so the tracer ball moves at an elegant, human-observable pace rather than vibrating at 9 Hz blur!
  const maxHarmonic = Math.max(...(state.ratioInts || [1]));
  let harmonicSpeedScale = 1.0;
  if (maxHarmonic > 8) {
    harmonicSpeedScale = Math.min(1.0, 6.0 / maxHarmonic);
  }

  const driftRate = state.is12TET ? 0.08 : 0.0;
  state.time += delta * visualSpeed * harmonicSpeedScale;
  state.phase += delta * driftRate;

  if (state.currentTab === 'lab') {
    if (state.dimension === '2D') {
      visualizer2D.render(state);
    } else {
      visualizer3D.render(state);
    }

    // Update real-time mini oscilloscope waveform display
    const waveData = audio.getWaveformData();
    miniWaveform.render(waveData, state.colors[1] || '#ff9f43');
  } else {
    intervalsGrid.render();
  }
}

// Read-only debug handle used by the e2e suite (e2e/e2e.mjs) to inspect precise state.
window.__harmonic = { state, audio, mediaImporter, visualizer3D };

// Initial Boot
handleResize();
buildPresetsUI();
buildPianoUI();
updateMuteButtonUI();
loadPreset(CHORD_PRESETS[0]); // Default to 3:2 Perfect Fifth
requestAnimationFrame(animate);
