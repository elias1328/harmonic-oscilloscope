// Live MIDI keyboard: held notes -> sound (synchronously, in onmidimessage) and the chord model.
//
// Tuning follows the app's toggle. In 12-TET the keyboard is an ordinary piano. In just
// intonation every held chord is retuned live to pure ratios above its lowest note (which keeps
// its 12-TET pitch): adding, releasing or retuning glides the same oscillators (≤ 30 ms).

import { chordFromMidiNotes } from '../core/voices.js';
import { MidiSynth } from '../audio/midiSynth.js';

export const RETUNE_GLIDE = 0.02; // s

export const storage = {
  get(key) {
    try { return localStorage.getItem(key); } catch { return null; }
  },
  set(key, value) {
    try { localStorage.setItem(key, value); } catch { /* private mode / blocked storage */ }
  }
};

export class LiveKeyboard {
  constructor({ store, audio, actions }) {
    this.store = store;
    this.audio = audio;
    this.actions = actions;
    this.synth = new MidiSynth(audio);
    this.held = new Map(); // `${device}|${channel}|${midi}` -> note { midi, velocity, device, key, sustained }
    this.pedal = new Map(); // device -> sustain pedal down
    this.sound = storage.get('harmonic.liveSound') !== 'off';
    actions.onExitLive = () => this.exit();
    store.set({ liveSound: this.sound });
    store.subscribe(s => s.tuning, () => { if (store.get().live) this.retune(); }, { immediate: false });
    // loading a file leaves live mode (the file owns the output: the drone stays off)
    store.subscribe(s => !!s.media, (m) => { if (m && store.get().live) this.exit({ drone: false }); }, { immediate: false });
  }

  /** A parsed MIDI message from MidiInput (called inside onmidimessage). */
  event(ev, device) {
    if (ev.type === 'noteon') this.noteOn(device, ev.channel, ev.note, ev.velocity);
    else if (ev.type === 'noteoff') this.noteOff(device, ev.channel, ev.note);
    else if (ev.type === 'sustain') this.sustain(device, ev.on);
    else if (ev.type === 'allnotesoff') this.releaseDevice(device);
  }

  // The first live note pauses any file and silences the manual drone.
  enter() {
    if (this.store.get().live) return;
    this.actions.exitMedia();
    this.audio.setDroneEnabled(false);
    this.store.set({ live: true });
  }

  exit({ drone = true } = {}) {
    if (!this.store.get().live) return;
    this.synth.stopAll();
    this.held.clear();
    this.pedal.clear();
    this.store.set({ live: false });
    if (drone) this.audio.setDroneEnabled(true, { rebuild: false }); // the manual chord rebuilds it
  }

  chord() {
    return chordFromMidiNotes([...this.held.values()], { live: true });
  }

  freqOf(chord, midi) {
    const i = chord.voices.findIndex(v => v.midi === midi);
    return chord.freqs(this.store.get().tuning)[i];
  }

  noteOn(device, channel, midi, velocity) {
    this.enter();
    const key = `${device}|${channel}|${midi}`;
    const old = this.held.get(key);
    if (old) this.synth.noteOff(old); // the same key again: retrigger
    const note = { midi, velocity: velocity / 127, device, key, sustained: false };
    this.held.set(key, note);
    const chord = this.chord();
    if (this.sound) this.synth.noteOn(note, this.freqOf(chord, midi)); // sounds now, not next frame
    this.changed(chord);
  }

  noteOff(device, channel, midi) {
    const note = this.held.get(`${device}|${channel}|${midi}`);
    if (!note) return;
    if (this.pedal.get(device)) {
      note.sustained = true; // held by the sustain pedal
      return;
    }
    this.release([note]);
  }

  sustain(device, down) {
    this.pedal.set(device, down);
    if (!down) this.release([...this.held.values()].filter(n => n.device === device && n.sustained));
  }

  releaseDevice(device) {
    this.pedal.delete(device);
    this.release([...this.held.values()].filter(n => n.device === device));
  }

  release(notes) {
    if (!notes.length) return;
    notes.forEach(n => {
      this.held.delete(n.key);
      this.synth.noteOff(n);
    });
    this.changed(this.chord());
  }

  // New chord: glide the remaining voices to their pitches in it, and show it.
  changed(chord) {
    this.retune(chord);
    this.store.set({ chord });
  }

  retune(chord = this.chord()) {
    for (const [note, voice] of this.synth.voices) {
      const f = this.freqOf(chord, note.midi);
      if (f && Math.abs(f - voice.baseFreq) > 1e-9) this.audio.retuneVoice(voice, f, RETUNE_GLIDE);
    }
  }

  /** Keyboard sound on/off (off = visuals only, for digital pianos with their own speakers). */
  setSound(on) {
    this.sound = on;
    storage.set('harmonic.liveSound', on ? 'on' : 'off');
    this.store.set({ liveSound: on });
    if (!on) {
      this.synth.stopAll();
      return;
    }
    const chord = this.chord();
    for (const note of this.held.values()) this.synth.noteOn(note, this.freqOf(chord, note.midi));
  }
}
