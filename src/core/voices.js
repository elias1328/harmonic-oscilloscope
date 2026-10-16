// One voice model for everything that sounds or is drawn: presets, piano, matrix cards, custom
// ratios, MIDI and detected pitch all become a Chord of Voices.
//
// Voice { id, label, pitchClass?, midi?, ji: Fraction (to the root), semitones (to the root), color }
// Chord { rootHz, voices[], meta: {category, title, consonance, description} }

import { Fraction, fractionsToInts, gcd } from './fraction.js';
import {
  NOTE_NAMES, NOTE_COLORS, PIANO_KEY_NAMES, CHORD_PRESETS, identifyChord, intervalNotes, noteNameToSemitone
} from '../math/harmonics.js';

export const C4_HZ = 261.6256;
export const MAX_VOICES = 8;
// 8 distinct colors; custom chords cycle through them.
export const VOICE_PALETTE = ['#ff5376', '#ff9f43', '#2ecc71', '#d980fa', '#48dbfb', '#feca57', '#a8e063', '#f368e0'];

export const midiToHz = (midi) => 440 * Math.pow(2, (midi - 69) / 12);

let nextId = 1;

export class Chord {
  constructor({ rootHz = C4_HZ, voices = [], meta = {}, source = 'manual', tuning = null, presetId = null, view = null }) {
    this.id = nextId++;
    this.rootHz = rootHz;
    this.voices = voices.map((v, i) => ({ id: i, color: VOICE_PALETTE[i % VOICE_PALETTE.length], ...v, ji: Fraction.from(v.ji) }));
    this.meta = { category: '', title: '', consonance: '', description: '', ...meta };
    this.source = source; // 'manual' | 'midi' | 'pitch' | 'xy'
    this.tuning = tuning; // fixed tuning (MIDI plays 12-TET), or null = the user's choice
    this.presetId = presetId;
    this.view = view; // preferred dimension ('2D' | '3D') or null
    this._ratioInts = null;
  }

  get size() {
    return this.voices.length;
  }

  labels() {
    return this.voices.map(v => v.label);
  }

  colors() {
    return this.voices.map(v => v.color);
  }

  /** Real frequencies: rootHz·num/den in just intonation, rootHz·2^(semitones/12) in 12-TET. */
  freqs(tuning = 'just') {
    const t = this.tuning || tuning;
    return this.voices.map(v => (t === 'equal' ? this.rootHz * Math.pow(2, v.semitones / 12) : this.rootHz * v.ji.value));
  }

  /** Smallest integers proportional to the JI ratios (display and closing period). */
  ratioInts() {
    if (!this._ratioInts) this._ratioInts = this.size ? fractionsToInts(this.voices.map(v => v.ji)) : [];
    return this._ratioInts;
  }

  /** Piano keys of the voices (custom-ratio voices have none). */
  pianoKeys() {
    return [...new Set(this.voices.map(v => v.key).filter(Boolean))];
  }
}

const meta = (m) => ({ category: m.category, title: m.title, consonance: m.consonance, description: m.description });

// 2 voices are titled high : low (3 : 2), chords low : high (4 : 5 : 6).
function titleFor(ints) {
  return ints.length === 2 ? `${ints[1]} : ${ints[0]}` : ints.join(' : ');
}

export function chordFromPreset(preset) {
  const voices = preset.labels.map((label, i) => ({
    label, key: PIANO_KEY_NAMES.includes(label) ? label : undefined, pitchClass: label.replace("'", ''),
    ji: preset.ji[i], semitones: preset.semitones[i], color: preset.colors[i]
  }));
  const chord = new Chord({ voices, presetId: preset.id, view: preset.type });
  chord.meta = { category: preset.category, title: titleFor(chord.ratioInts()), consonance: preset.consonance, description: preset.description };
  return chord;
}

export const PRESETS = CHORD_PRESETS;
export const presetChord = (id) => chordFromPreset(CHORD_PRESETS.find(p => p.id === id));

export function chordFromInterval(interval) {
  const [lo, hi] = intervalNotes(interval);
  return new Chord({
    view: '2D',
    voices: [
      { label: lo, key: lo, pitchClass: 'C', ji: [1, 1], semitones: 0, color: '#ff5376' },
      { label: hi, key: hi, pitchClass: interval.note, ji: interval.ji, semitones: interval.semitones, color: interval.color }
    ],
    meta: { category: 'A RATIO OF', title: `${interval.ratio[0]} : ${interval.ratio[1]}`, consonance: interval.consonance, description: interval.description }
  });
}

/** Chord from piano keys (C4..C5). The root is the real pitch of the lowest key. */
export function chordFromPianoKeys(keys) {
  const sorted = [...new Set(keys)].sort((a, b) => noteNameToSemitone(a) - noteNameToSemitone(b));
  if (sorted.length === 0) return emptyChord();
  const semis = sorted.map(noteNameToSemitone);
  const id = identifyChord(semis);
  const base = semis[0];
  const voices = sorted.map((key, i) => ({
    label: key, key, pitchClass: key.replace("'", ''), ji: id.voiceJi[i], semitones: semis[i] - base,
    color: NOTE_COLORS[key.replace("'", '')] || VOICE_PALETTE[i % VOICE_PALETTE.length]
  }));
  const chord = new Chord({ rootHz: C4_HZ * Math.pow(2, base / 12), voices, view: sorted.length >= 3 ? '3D' : null });
  if (id.kind === 'solo') {
    chord.meta = { category: 'ROOT NOTE', title: sorted[0], consonance: 'Fundamental Pitch', description: `Selected root note ${sorted[0]}. A single voice is a 1D oscillation along the X axis. Click another piano key to form an interval or chord!` };
  } else {
    chord.meta = meta(id);
  }
  return chord;
}

/**
 * Parse a custom integer ratio like "4:5:6" or "16 17 18". Integers only (decimals are rejected
 * with a message), reduced by their GCD, 2 to 8 voices. Voices get the nearest equal-tempered
 * pitch for 12-TET: semitones = round(12·log2(n/n0)).
 */
export function parseCustomRatio(text) {
  const raw = (text || '').trim();
  if (!raw) return { error: 'Enter a ratio such as 4:5:6.' };
  const parts = raw.split(/[:\s,]+/).filter(Boolean);
  if (parts.some(p => !/^\d+$/.test(p))) return { error: 'Use whole numbers only, e.g. 4:5:6 (no decimals or letters).' };
  const ints = parts.map(Number);
  if (ints.some(n => n <= 0)) return { error: 'Every number must be at least 1.' };
  if (ints.length < 2) return { error: 'Enter at least two numbers, e.g. 3:2.' };
  if (ints.length > MAX_VOICES) return { error: `At most ${MAX_VOICES} voices.` };
  if (ints.some(n => n > 9999)) return { error: 'Numbers must be below 10000.' };
  const g = ints.reduce((a, n) => gcd(a, n), 0);
  const r = ints.map(n => n / g);
  const voices = r.map((n, i) => ({
    label: `H${n}`, ji: new Fraction(n, r[0]), semitones: Math.round(12 * Math.log2(n / r[0])), color: VOICE_PALETTE[i % VOICE_PALETTE.length]
  }));
  const title = r.join(' : ');
  const reduced = g > 1 ? ` (reduced from ${ints.join(':')})` : '';
  return {
    chord: new Chord({
      voices, view: r.length >= 3 ? '3D' : '2D',
      meta: { category: 'A RATIO OF', title, consonance: 'Custom Harmonic Ratio', description: `Custom ratio ${r.join(':')}${reduced}. The figure closes after ${r[0]} cycles of the first voice.` }
    })
  };
}

/**
 * Chord of the sounding MIDI notes. A MIDI file plays in 12-TET, so that is the tuning drawn and
 * shown. A live keyboard ({ live: true }) follows the tuning toggle instead: in just intonation the
 * chord is retuned to pure ratios above its lowest note, which keeps its 12-TET pitch.
 */
export function chordFromMidiNotes(active, { live = false } = {}) {
  const source = live ? 'live' : 'midi';
  const tuning = live ? null : 'equal';
  const midis = [...new Set(active.map(n => n.midi))].sort((a, b) => a - b);
  if (midis.length === 0) {
    return new Chord({ source, tuning, meta: { category: 'REST', title: 'SILENCE', consonance: 'Rest', description: live ? 'Play the MIDI keyboard…' : 'Waiting for notes in MIDI score...' } });
  }
  const id = identifyChord(midis);
  const voices = midis.map((m, i) => {
    const pc = NOTE_NAMES[m % 12];
    return { label: pc, key: pc, pitchClass: pc, midi: m, ji: id.voiceJi[i], semitones: m - midis[0], color: NOTE_COLORS[pc] || VOICE_PALETTE[i % 8] };
  });
  const chord = new Chord({ rootHz: midiToHz(midis[0]), voices, source, tuning });
  const names = midis.map(m => `${NOTE_NAMES[m % 12]}${Math.floor(m / 12) - 1}`);
  if (id.kind === 'solo') {
    chord.meta = { category: `SOLO NOTE (${names[0]})`, title: '1 : 1', consonance: 'Pure Fundamental', description: `Single voice ${names[0]} (${midiToHz(midis[0]).toFixed(1)} Hz). Single-axis linear oscillation.` };
  } else {
    chord.meta = meta(id);
    if (id.kind === 'interval') chord.meta.description = `${names[1]} completes ${id.voiceJi[1].num} cycles for every ${id.voiceJi[1].den} cycles of ${names[0]}.`;
  }
  return chord;
}

/** Single voice at a detected pitch (audio files, pitch-tracking mode). */
export function chordFromPitch(p) {
  const hz = p.frequency.toFixed(1);
  return new Chord({
    rootHz: p.frequency, source: 'pitch', tuning: 'equal',
    voices: [{ label: p.note, key: p.note, pitchClass: p.note, ji: [1, 1], semitones: 0, color: NOTE_COLORS[p.note] || '#2ecc71' }],
    meta: {
      category: `DETECTED PITCH (${p.fullName})`, title: `${hz} Hz`, consonance: `${p.cents >= 0 ? '+' : ''}${p.cents} Cents`,
      description: `Real-time autocorrelation pitch extraction from audio stream. Frequency: ${p.frequency.toFixed(2)} Hz.`
    }
  });
}

/** Stereo vectorscope: no voices, the channels drive the beam. */
export function xyChord() {
  return new Chord({
    source: 'xy',
    meta: { category: 'STEREO VECTORSCOPE', title: 'CH 1 (L) : CH 2 (R)', consonance: 'Hardware Lissajous Trace', description: 'Direct X-Y channel electron beam trace. Left audio channel drives horizontal X-axis; right channel drives vertical Y-axis.' }
  });
}

export function emptyChord() {
  return new Chord({ meta: { category: 'PIANO KEYBOARD', title: 'SELECT NOTES', consonance: 'Ready', description: 'Click any key on the piano keyboard to choose your root note and build any interval or chord.' } });
}
