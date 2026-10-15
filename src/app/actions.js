// User-level actions. Every manual action that loads a chord leaves media mode first, which hands
// the output back to the manual drone (rebuilt by the audio sync subscription).

import { PRESETS, chordFromPreset, chordFromInterval, chordFromPianoKeys, parseCustomRatio, emptyChord } from '../core/voices.js';

export function createActions({ store, audio, importer, visualizer3D }) {
  const get = store.get;

  const actions = {
    exitMedia() {
      if (!get().media) return;
      importer.pause();
      visualizer3D.resetMaterials();
      audio.setDroneEnabled(true, { rebuild: false });
      store.set({ media: null });
    },

    setChord(chord, extra = {}) {
      actions.exitMedia();
      const patch = { chord, customError: '', ...extra };
      if (chord.view) patch.dimension = chord.view;
      store.set(patch);
    },

    loadPreset(id) {
      actions.setChord(chordFromPreset(PRESETS.find(p => p.id === id)));
    },

    loadInterval(interval) {
      actions.setChord(chordFromInterval(interval));
      actions.setTab('lab');
    },

    togglePianoKey(key) {
      audio.resume();
      const keys = get().chord.pianoKeys();
      const next = keys.includes(key) ? keys.filter(k => k !== key) : [...keys, key];
      actions.setChord(next.length ? chordFromPianoKeys(next) : emptyChord());
    },

    clearPiano() {
      actions.setChord(emptyChord());
    },

    applyCustomRatio(text) {
      audio.resume();
      const { chord, error } = parseCustomRatio(text);
      if (error) {
        store.set({ customError: error });
        return false;
      }
      actions.setChord(chord);
      return true;
    },

    setTab(tab) {
      const s = get();
      if (tab === s.tab) return;
      const patch = { tab };
      // The panel would cover the first column of cards: tuck it away while the matrix is shown
      if (tab === 'matrix' && !s.panelCollapsed) Object.assign(patch, { panelCollapsed: true, panelAutoCollapsed: true });
      if (tab === 'lab' && s.panelAutoCollapsed) Object.assign(patch, { panelCollapsed: false, panelAutoCollapsed: false });
      store.set(patch);
    },

    setPanelCollapsed(collapsed) {
      store.set({ panelCollapsed: collapsed, panelAutoCollapsed: false });
    },

    clearRedraw() {
      store.set({ traceReset: get().traceReset + 1 });
    },

    eject() {
      importer.stop();
      actions.exitMedia();
      actions.loadPreset('fifth');
    },

    async loadFile(file) {
      audio.resume();
      try {
        await importer.loadFile(file);
      } catch (err) {
        // The importer has dropped the previous track: leave media mode, clear the stale title
        if (get().media) actions.eject();
        store.set({ playerReset: get().playerReset + 1 });
        alert(err.message || 'Error loading media file');
      }
    }
  };
  return actions;
}
