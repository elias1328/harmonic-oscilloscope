// Composition root: the store, the audio engine, the one clock, the renderers and the UI modules.
// State lives in the store (src/core/store.js); UI modules subscribe to it; the render loop only
// draws canvases.

import { createStore } from './core/store.js';
import { Clock } from './core/clock.js';
import { presetChord } from './core/voices.js';
import { AudioEngine } from './audio/audioEngine.js';
import { MediaImporter } from './audio/mediaImporter.js';
import { ClickScheduler } from './audio/clickScheduler.js';
import { Oscilloscope2D } from './visualizer/oscilloscope2D.js';
import { Oscilloscope3D } from './visualizer/oscilloscope3D.js';
import { IntervalsGrid } from './visualizer/intervalsGrid.js';
import { MiniWaveform } from './visualizer/miniWaveform.js';
import { Figure, rootHz } from './app/figure.js';
import { createActions } from './app/actions.js';
import { bindAudio } from './app/audioSync.js';
import { bindMedia } from './app/mediaBridge.js';
import { computeSafeArea } from './app/layout.js';
import { initHeader } from './ui/header.js';
import { initPanel } from './ui/panel.js';
import { initPiano } from './ui/piano.js';
import { initPresets } from './ui/presets.js';
import { initCustomRatio } from './ui/customRatio.js';
import { initPlayer } from './ui/player.js';
import { initNav } from './ui/nav.js';
import { initDropzone } from './ui/dropzone.js';

const $ = (id) => document.getElementById(id);
const isPhone = !!(window.matchMedia && window.matchMedia('(max-width: 768px)').matches);

const store = createStore({
  tab: 'lab',
  dimension: '2D',
  drawMode: 'live',
  chord: presetChord('fifth'),
  tuning: 'just',
  speedVal: 100,
  phi: 0,
  tClose: 4,
  muted: false,
  volume: 0.6,
  timbre: 'sine',
  // phones: the controls are a bottom sheet that starts closed so the oscilloscope is visible
  panelCollapsed: isPhone,
  panelAutoCollapsed: false,
  media: null,
  customError: '',
  traceReset: 0,
  playerReset: 0
});

const audio = new AudioEngine();
const importer = new MediaImporter(audio);
const clock = new Clock(() => performance.now() / 1000);
const figure = new Figure();
const visualizer2D = new Oscilloscope2D($('canvas-2d'));
const visualizer3D = new Oscilloscope3D($('viewport-3d'));
const miniWaveform = new MiniWaveform($('waveform-canvas'));
const actions = createActions({ store, audio, importer, visualizer3D });
const grid = new IntervalsGrid($('intervals-grid-view'), (interval) => actions.loadInterval(interval));
const clicks = new ClickScheduler({
  engine: audio, clock, model: figure.model,
  getDeltas: () => figure.deltas,
  getRootHz: () => rootHz(store.get())
});

bindAudio(store, audio);
const bridge = bindMedia({ store, audio, importer });

function snapshot() {
  const canvas = store.get().dimension === '2D' ? $('canvas-2d') : visualizer3D.renderer.domElement;
  const link = document.createElement('a');
  link.download = `harmonic-oscilloscope-${store.get().chord.meta.title.replace(/[^a-zA-Z0-9]/g, '_')}.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
}

initHeader(store);
initPanel(store, actions);
initPiano(store, actions);
initPresets(store, actions);
initCustomRatio(store, actions);
initPlayer(store, actions, importer, bridge);
initNav(store, actions, { grid, snapshot });
initDropzone(actions, audio, importer);

// First user gesture unlocks audio; from then on the clock follows the AudioContext, and the
// click scheduler can place clicks on it.
function unlockAudio() {
  audio.resume();
  audio.setMuted(store.get().muted);
  window.removeEventListener('pointerdown', unlockAudio);
  window.removeEventListener('keydown', unlockAudio);
}
window.addEventListener('pointerdown', unlockAudio);
window.addEventListener('keydown', unlockAudio);

function useAudioClock() {
  if (clicks.timer || !audio.ctx || audio.ctx.state !== 'running') return;
  clock.setSource(() => audio.ctx.currentTime);
  figure.key = ''; // re-anchor on the new time base
  clicks.start();
}

function handleResize() {
  visualizer2D.resize(window.innerWidth, window.innerHeight);
  visualizer3D.resize(window.innerWidth, window.innerHeight);
  miniWaveform.resize(240, 48);
  if (store.get().tab === 'matrix') grid.resize();
}
window.addEventListener('resize', handleResize);

// Backgrounded tab: pause the media (which releases the MIDI voices).
document.addEventListener('visibilitychange', () => {
  if (document.hidden && importer.isPlaying) importer.pause();
});

function animate() {
  requestAnimationFrame(animate);
  useAudioClock();
  const t = clock.tick();
  const s = store.get();
  if (s.media) importer.update();

  if (figure.sync(store.get(), t)) clicks.invalidate();
  const state = store.get();
  if (state.tab === 'lab') {
    const frame = {
      figure, t, drawMode: state.drawMode,
      labels: state.chord.labels(), colors: state.chord.colors(),
      xyPoints: state.media && state.media.type === 'audio' && state.media.audioMode === 'xy' ? bridge.frame.xyPoints : null
    };
    if (state.dimension === '2D') {
      visualizer2D.setSafeArea(computeSafeArea());
      visualizer2D.render(frame);
    } else {
      visualizer3D.render(frame);
    }
    const colors = state.chord.colors();
    miniWaveform.render(audio.getWaveformData(), colors[1] || colors[0] || '#ff9f43');
  }
  store.flush();
}

// Read-only debug handle used by the e2e suite (e2e/e2e.mjs) and the jsdom tests.
window.__harmonic = {
  store, audio, mediaImporter: importer, visualizer3D, clock, figure, clicks,
  get state() { return store.get(); }
};

handleResize();
store.flush();
requestAnimationFrame(animate);
