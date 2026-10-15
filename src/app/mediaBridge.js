// MediaImporter callbacks -> store. Called every frame during playback, so the store is only
// touched when the displayed value changes (chord identity, formatted time, play state).

import { chordFromPitch, xyChord } from '../core/voices.js';

export function bindMedia({ store, audio, importer }) {
  const frame = { xyPoints: null };
  let shownKey = null;

  importer.onLoaded = (info) => {
    shownKey = null;
    frame.xyPoints = null;
    importer.audioMode = 'xy';
    store.set({
      media: { type: info.type, info, audioMode: info.type === 'midi' ? 'midi' : 'xy', playing: false, time: 0, duration: info.duration },
      ...(info.type === 'audio' ? { chord: xyChord() } : {})
    });
    // The media owns the output: silence the manual drone until eject / a manual action
    audio.setDroneEnabled(false);
    importer.play();
  };

  importer.onPlaybackUpdate = (time, duration, playing) => {
    const m = store.get().media;
    if (!m) return;
    if (m.time === time && m.playing === playing && m.duration === duration) return;
    store.set({ media: { ...m, time, duration, playing } });
  };

  importer.onMidiStateChange = (_active, _info, chord) => {
    const s = store.get();
    if (!s.media || s.media.type !== 'midi') return;
    const key = `${chord.meta.category}|${chord.meta.title}|${chord.voices.map(v => v.midi).join(',')}`;
    if (key === shownKey) return;
    shownKey = key;
    store.set({ chord });
  };

  importer.onAudioStateChange = (res) => {
    const s = store.get();
    if (!s.media || s.media.type !== 'audio') return;
    if (s.media.audioMode === 'xy') {
      frame.xyPoints = res.xyPoints;
      if (shownKey !== 'xy') {
        shownKey = 'xy';
        store.set({ chord: xyChord() });
      }
    } else if (res.pitchInfo) {
      frame.xyPoints = null;
      const p = res.pitchInfo;
      const key = `pitch|${p.fullName}|${p.frequency.toFixed(1)}|${p.cents}`;
      if (key === shownKey) return;
      shownKey = key;
      store.set({ chord: chordFromPitch(p) });
    }
  };

  return {
    frame,
    setAudioMode(mode) {
      const m = store.get().media;
      if (!m) return;
      importer.audioMode = mode;
      shownKey = null;
      if (mode !== 'xy') frame.xyPoints = null;
      store.set({ media: { ...m, audioMode: mode } });
    }
  };
}
