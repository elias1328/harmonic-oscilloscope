// Keeps the audio engine in step with the store. The drone voices are rebuilt once per chord /
// tuning change; the speed slider only retunes them.

import { rootHz } from './figure.js';

export function bindAudio(store, audio) {
  const notesOf = (chord) => chord.voices.map(v => ({ name: v.label, semitones: v.semitones, justRatio: v.ji.value }));

  // chord or tuning change (manual chords only: media drives its own sound)
  store.subscribe(s => [s.chord, s.tuning, s.media ? s.media.type : null], (_, s) => {
    if (s.media || s.chord.source !== 'manual') return;
    audio.configure({ notes: notesOf(s.chord), tuning: s.tuning, rootHz: rootHz(s) });
  });
  store.subscribe(s => s.speedVal, (_, s) => {
    if (!s.media && s.chord.source === 'manual') audio.setRootFrequency(rootHz(s));
  }, { immediate: false });
  store.subscribe(s => s.phi, (phi) => audio.setPhase(phi), { immediate: false });
  store.subscribe(s => s.timbre, (t) => audio.setTimbre(t), { immediate: false });
  store.subscribe(s => s.muted, (m) => audio.setMuted(m), { immediate: false });
  store.subscribe(s => s.volume, (v) => audio.setVolume(v), { immediate: false });
}
