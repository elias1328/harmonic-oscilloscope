// MIDI synthesis: one voice per note instance (back-to-back notes of the same pitch retrigger),
// built with the drone's voice factory so every timbre sounds the same in both.

import { midiToHz } from '../core/voices.js';

const MIDI_RELEASE = 0.08;

export class MidiSynth {
  constructor(engine) {
    this.engine = engine;
    this.voices = new Map(); // note instance -> voice
  }

  // Voices are created even while muted: the master gain mutes them, so a held note is heard
  // as soon as the user unmutes.
  noteOn(note) {
    this.engine.init();
    if (!this.engine.ctx || this.voices.has(note)) return;
    const level = 0.25 * (note.velocity || 0.8); // the master volume is applied once, by the engine
    const pan = Math.max(-0.8, Math.min(0.8, (note.midi - 60) / 36)); // pan by pitch
    this.voices.set(note, this.engine.createVoice(midiToHz(note.midi), level, { pan, attack: 0.015 }));
  }

  noteOff(note) {
    const voice = this.voices.get(note);
    if (!voice) return;
    this.engine.releaseVoice(voice, MIDI_RELEASE);
    this.voices.delete(note);
  }

  stopAll() {
    this.voices.forEach(voice => this.engine.releaseVoice(voice, 0.015));
    this.voices.clear();
  }
}
