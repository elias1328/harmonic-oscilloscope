// Main Orchestrator: Links Audio, 2D/3D Oscilloscopes, UI, Piano, and Intervals Grid

import { CHORD_PRESETS, INTERVALS_BY_SEMITONE, identifyChordFromIntervals, NOTE_COLORS, noteNameToSemitone, intervalNotes, pianoSelectionFromNotes } from './math/harmonics.js';
import { AudioEngine } from './audio/audioEngine.js';
import { MediaImporter, MAX_FRAME_DT } from './audio/mediaImporter.js';
import { ACCEPT_ATTR, FORMATS_LABEL } from './audio/audioFormats.js';
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
  mediaInfo: null,
  freqOverride: null // real per-note Hz while media drives the header (MIDI notes, detected pitch)
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
const appContainer = document.getElementById('app-container');
const harmonicHeader = document.getElementById('harmonic-header');

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

// Leave media mode (any manual action, eject, failed import): stop the player, hide the bar and
// hand the output back to the manual drone. Callers rebuild the drone themselves via syncAudio().
function exitMediaMode() {
  if (!state.isMediaActive) return;
  mediaImporter.pause();
  state.isMediaActive = false;
  state.mediaType = null;
  state.xyPoints = null;
  state.freqOverride = null;
  if (mediaPlayerBar) mediaPlayerBar.classList.add('hidden');
  appContainer.classList.remove('media-active');
  visualizer3D.resetMaterials();
  audio.setDroneEnabled(true, { rebuild: false });
}

// Frequency shown for voice idx: real media frequencies when known, else root × ratio.
function noteFreq(idx) {
  if (state.freqOverride && state.freqOverride[idx] !== undefined) return state.freqOverride[idx];
  return state.rootHz * (state.ratios[idx] || 1);
}

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
  exitMediaMode();

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
  exitMediaMode();
  state.activePresetId = null;
  state.category = 'A RATIO OF';
  state.title = `${interval.ratio[0]} : ${interval.ratio[1]}`;
  state.notes = intervalNotes(interval);
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

  if (state.isMediaActive && state.mediaType === 'audio' && state.audioMode === 'xy') {
    headerNotesBadge.innerHTML = '<span style="color: #2ecc71">L → X</span> <span style="color: rgba(255,255,255,0.4)">+</span> <span style="color: #a8ff78">R → Y</span>';
    return;
  }

  if (!state.notes || state.notes.length === 0) {
    headerNotesBadge.innerHTML = '<span style="color: rgba(255,255,255,0.4); font-size: 14px;">Select piano keys below to set root note and build harmony</span>';
    return;
  }

  headerNotesBadge.innerHTML = state.notes.map((note, idx) => {
    const color = state.colors[idx] || NOTE_COLORS[note] || '#fff';
    const freq = noteFreq(idx).toFixed(1);
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
      const freq = noteFreq(idx).toFixed(1);
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

// Nav buttons hold an icon and a label (the label is hidden on phones; the title keeps it).
function setNavButton(btn, icon, label) {
  const ico = btn.querySelector('.nav-ico');
  const lab = btn.querySelector('.nav-label');
  if (ico && icon) ico.textContent = icon;
  if (lab) lab.textContent = label; else btn.textContent = label;
  btn.title = label;
}

function setPanelCollapsed(collapsed) {
  controlsPanel.classList.toggle('collapsed', collapsed);
  appContainer.classList.toggle('panel-collapsed', collapsed);
}

// 2D / 3D Dimension Switcher
function setDimension(dim) {
  state.dimension = dim;
  if (dim === '3D') {
    canvas2D.style.display = 'none';
    viewport3D.style.display = 'block';
    setNavButton(btnToggleDimension, '🟦', '2D Mode');
    btnToggleDimension.classList.add('active');
    if (visualizer3D) {
      visualizer3D.resize(window.innerWidth, window.innerHeight);
    }
  } else {
    canvas2D.style.display = 'block';
    viewport3D.style.display = 'none';
    setNavButton(btnToggleDimension, '🧊', '3D Mode');
    btnToggleDimension.classList.remove('active');
    if (visualizer2D) {
      visualizer2D.resize(window.innerWidth, window.innerHeight);
    }
  }
}

// Tab Switcher (Lab vs 12-Interval Grid)
let panelAutoCollapsed = false;
function setTab(tab) {
  state.currentTab = tab;
  appContainer.classList.toggle('tab-matrix', tab === 'matrix');
  if (tab === 'matrix') {
    // The panel would cover the first column of cards: tuck it away while the matrix is shown
    if (!controlsPanel.classList.contains('collapsed')) {
      setPanelCollapsed(true);
      panelAutoCollapsed = true;
    }
    intervalsGridEl.style.display = 'block';
    intervalsGrid.resize(); // real card sizes are only known once the grid is visible
    document.getElementById('render-viewport').style.display = 'none';
    btnTabMatrix.classList.add('active');
    btnTabLab.classList.remove('active');
    headerCategory.style.display = 'none';
    headerTitle.style.display = 'none';
    headerNotesBadge.style.display = 'none';
  } else {
    if (panelAutoCollapsed) {
      setPanelCollapsed(false);
      panelAutoCollapsed = false;
    }
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
  exitMediaMode();
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
  exitMediaMode();
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

// The piano selection is always derived from the current voices (presets, piano, custom
// ratios, matrix cards, MIDI), so the next key click builds on what is actually sounding.
function updatePianoSelection() {
  selectedPianoNotes = pianoSelectionFromNotes(state.notes);
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

  // One rebuild for notes + tuning + root
  audio.configure({ notes: notesData, tuning: state.tuning, rootHz: state.rootHz });
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
    setNavButton(btnDrawMode, '⭕', 'Mode: Full Loop');
    btnDrawMode.classList.remove('active');
  } else {
    state.drawMode = 'live';
    setNavButton(btnDrawMode, '✏️', 'Mode: Live Trace');
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
  const raw = inputCustomRatio.value.trim();
  if (!raw) return;

  const parts = raw.split(/[:\s,]+/).map(p => parseFloat(p)).filter(p => !isNaN(p) && p > 0);
  if (parts.length < 2) return;
  exitMediaMode();

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
  updatePianoSelection();
  updateHarmonicInfo();
}

btnClearPiano.addEventListener('click', () => {
  clearAllNotes();
});

btnCollapsePanel.addEventListener('click', () => {
  setPanelCollapsed(true);
  panelAutoCollapsed = false;
});

panelToggle.addEventListener('click', () => {
  setPanelCollapsed(false);
  panelAutoCollapsed = false;
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

function resetPlayerInfo() {
  if (playerTrackTitle) playerTrackTitle.textContent = 'No Track Loaded';
  if (playerTrackMeta) playerTrackMeta.textContent = 'MIDI / Audio';
}

async function loadMediaFile(file) {
  audio.resume();
  try {
    await mediaImporter.loadFile(file);
  } catch (err) {
    // The importer has dropped the previous track: leave media mode and clear the stale title
    if (state.isMediaActive) ejectMedia();
    resetPlayerInfo();
    alert(err.message || 'Error loading media file');
  }
}

function ejectMedia() {
  mediaImporter.stop();
  exitMediaMode();
  loadPreset(CHORD_PRESETS[0]);
}

// Last values written to the DOM by the media callbacks (they run every frame: only write on change)
const shown = { mediaKey: null, time: null, total: null, icon: null };
let scrubbing = false;

function setPlayIcon(isPlaying) {
  const icon = isPlaying ? '⏸' : '▶';
  if (btnPlayerPlay && shown.icon !== icon) {
    btnPlayerPlay.textContent = icon;
    shown.icon = icon;
  }
}

// Apply a media-driven header/voice state, touching the DOM only when the displayed value changes.
function applyMediaState(key, patch) {
  if (shown.mediaKey === key) return;
  shown.mediaKey = key;
  Object.assign(state, patch);
  updateHeader();
  updateHarmonicInfo();
  updatePianoSelection();
}

// MediaImporter Callbacks
mediaImporter.onLoaded = (info) => {
  state.isMediaActive = true;
  state.mediaType = info.type;
  state.mediaInfo = info;
  if (mediaPlayerBar) mediaPlayerBar.classList.remove('hidden');

  appContainer.classList.add('media-active');
  shown.mediaKey = null;
  shown.time = null;
  shown.total = null;
  if (playerTrackIcon) playerTrackIcon.textContent = info.type === 'midi' ? '🎹' : '🎵';
  if (playerTrackTitle) playerTrackTitle.textContent = info.name;
  if (playerTrackMeta) {
    if (info.type === 'midi') {
      playerTrackMeta.textContent = `MIDI • ${info.tracksCount || 1} Tracks • ${info.bpm || 120} BPM • ${info.noteCount || 0} Notes`;
      if (playerAudioModeSelector) playerAudioModeSelector.style.display = 'none';
      state.audioMode = 'midi';
    } else {
      const rateLabel = info.sampleRateSource === 'context' ? ' (context rate)' : '';
      playerTrackMeta.textContent = `Audio • ${info.channels} Channel(s) • ${(info.sampleRate / 1000).toFixed(1)} kHz${rateLabel}`;
      if (playerAudioModeSelector) playerAudioModeSelector.style.display = 'flex';
      state.audioMode = 'xy';
      mediaImporter.audioMode = 'xy';
      if (btnAudioModeXy) btnAudioModeXy.classList.add('active');
      if (btnAudioModePitch) btnAudioModePitch.classList.remove('active');
    }
  }

  if (playerScrubber) playerScrubber.value = 0;

  // The media owns the output: silence the manual drone until eject / a manual action
  audio.setDroneEnabled(false);
  mediaImporter.play();
};

mediaImporter.onPlaybackUpdate = (current, total, isPlaying) => {
  const timeText = formatTime(current);
  const totalText = formatTime(total);
  if (playerTimeCurrent && shown.time !== timeText && !scrubbing) {
    playerTimeCurrent.textContent = timeText;
    shown.time = timeText;
  }
  if (playerTimeTotal && shown.total !== totalText) {
    playerTimeTotal.textContent = totalText;
    shown.total = totalText;
  }
  if (playerScrubber && total > 0 && !scrubbing) {
    playerScrubber.value = (current / total) * 100;
  }
  setPlayIcon(isPlaying);
};

mediaImporter.onEnded = () => setPlayIcon(false);

mediaImporter.onMidiStateChange = (activeNotes, ratioInfo) => {
  if (!state.isMediaActive || state.mediaType !== 'midi' || !ratioInfo) return;

  const freqs = ratioInfo.freqs || [];
  const key = `midi|${ratioInfo.category}|${ratioInfo.title}|${ratioInfo.notes.join(',')}|${freqs.map(f => f.toFixed(1)).join(',')}`;
  applyMediaState(key, {
    category: ratioInfo.category,
    title: ratioInfo.title,
    notes: [...ratioInfo.notes],
    ratioInts: [...ratioInfo.ratioInts],
    ratios: [...ratioInfo.ratios],
    colors: [...ratioInfo.colors],
    consonance: ratioInfo.consonance,
    description: ratioInfo.description,
    freqOverride: freqs
  });
};

mediaImporter.onAudioStateChange = (res) => {
  if (!state.isMediaActive || state.mediaType !== 'audio') return;
  state.xyPoints = res.xyPoints;

  if (state.audioMode === 'xy') {
    applyMediaState('xy', {
      category: 'STEREO VECTORSCOPE',
      title: 'CH 1 (L) : CH 2 (R)',
      consonance: 'Hardware Lissajous Trace',
      description: 'Direct X-Y channel electron beam trace. Left audio channel drives horizontal X-axis; right channel drives vertical Y-axis.',
      notes: [],
      ratios: [1],
      ratioInts: [1],
      colors: ['#2ecc71', '#a8ff78'],
      freqOverride: null
    });
  } else if (state.audioMode === 'pitch' && res.pitchInfo) {
    const p = res.pitchInfo;
    const hz = p.frequency.toFixed(1);
    applyMediaState(`pitch|${p.fullName}|${hz}|${p.cents}`, {
      category: `DETECTED PITCH (${p.fullName})`,
      title: `${hz} Hz`,
      consonance: `${p.cents >= 0 ? '+' : ''}${p.cents} Cents`,
      description: `Real-time autocorrelation pitch extraction from audio stream. Frequency: ${p.frequency.toFixed(2)} Hz.`,
      notes: [p.note],
      ratios: [1],
      ratioInts: [1],
      colors: [NOTE_COLORS[p.note] || '#2ecc71'],
      freqOverride: [p.frequency]
    });
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
  const scrubTarget = () => (parseFloat(playerScrubber.value) / 100) * mediaImporter.currentMedia.duration;
  // While playing, dragging only previews the time; the seek happens on release ('change').
  // While paused, dragging seeks live so the picture follows the thumb.
  playerScrubber.addEventListener('input', () => {
    if (!mediaImporter.currentMedia) return;
    if (mediaImporter.isPlaying) {
      scrubbing = true;
      if (playerTimeCurrent) playerTimeCurrent.textContent = formatTime(scrubTarget());
      shown.time = null;
    } else {
      mediaImporter.seek(scrubTarget());
    }
  });
  playerScrubber.addEventListener('change', () => {
    scrubbing = false;
    if (mediaImporter.currentMedia) mediaImporter.seek(scrubTarget());
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
    shown.mediaKey = null;
    btnAudioModeXy.classList.add('active');
    if (btnAudioModePitch) btnAudioModePitch.classList.remove('active');
  });
}

if (btnAudioModePitch) {
  btnAudioModePitch.addEventListener('click', () => {
    state.audioMode = 'pitch';
    mediaImporter.audioMode = 'pitch';
    shown.mediaKey = null;
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
  if (state.currentTab === 'matrix') intervalsGrid.resize();
}
window.addEventListener('resize', handleResize);

// Backgrounded tab: pause the media (which releases the MIDI voices) instead of letting the
// clock jump or notes hang.
document.addEventListener('visibilitychange', () => {
  if (document.hidden && mediaImporter.isPlaying) {
    mediaImporter.pause();
  }
});

// Free area for the 2D scope: right of the side panel (or above the phone bottom sheet), below
// the header, above the player bar. Uses offset* (layout boxes, unaffected by the slide
// transitions) so the figure does not jitter while the panel or bar animates.
function computeSafeArea() {
  const W = window.innerWidth;
  const H = window.innerHeight;
  let left = 0;
  let top = 0;
  let bottom = H;
  const panelOpen = !controlsPanel.classList.contains('collapsed');
  const isSheet = controlsPanel.offsetWidth >= W - 1;
  if (panelOpen && !isSheet) left = controlsPanel.offsetLeft + controlsPanel.offsetWidth;
  if (panelOpen && isSheet) bottom = Math.min(bottom, controlsPanel.offsetTop);
  if (headerTitle.style.display !== 'none') top = harmonicHeader.offsetTop + harmonicHeader.offsetHeight + 8;
  if (!mediaPlayerBar.classList.contains('hidden')) bottom = Math.min(bottom, mediaPlayerBar.offsetTop);
  return { left, top, right: W, bottom };
}

// Master Animation Loop (60+ FPS)
let lastFrameTime = performance.now();
function animate(currentTime) {
  requestAnimationFrame(animate);

  // Clamp: a stalled or backgrounded tab must not make the figure jump
  const delta = Math.min(MAX_FRAME_DT, Math.max(0, (currentTime - lastFrameTime) * 0.001));
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
      visualizer2D.setSafeArea(computeSafeArea());
      visualizer2D.render(state);
    } else {
      visualizer3D.render(state);
    }

    // Update real-time mini oscilloscope waveform display
    const waveData = audio.getWaveformData();
    miniWaveform.render(waveData, state.colors[1] || '#ff9f43');
  }
  // The matrix is static: it is drawn on build / resize / tab switch, not per frame.
}

// Read-only debug handle used by the e2e suite (e2e/e2e.mjs) to inspect precise state.
window.__harmonic = { state, audio, mediaImporter, visualizer3D };

// Initial Boot
if (fileMediaInput) fileMediaInput.setAttribute('accept', ACCEPT_ATTR);
const dropFormatsText = dropOverlay && dropOverlay.querySelector('p');
if (dropFormatsText) dropFormatsText.textContent = `Supports ${FORMATS_LABEL}`;
// Phones: the controls are a bottom sheet that starts closed so the oscilloscope is visible
if (window.matchMedia && window.matchMedia('(max-width: 768px)').matches) setPanelCollapsed(true);
handleResize();
buildPresetsUI();
buildPianoUI();
updateMuteButtonUI();
loadPreset(CHORD_PRESETS[0]); // Default to 3:2 Perfect Fifth
requestAnimationFrame(animate);
