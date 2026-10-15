// Generates test media for the e2e suite: a multi-track MIDI, a stereo WAV, a mono WAV,
// and garbage files. Ported from Agent/e2e/make-fixtures.mjs. Output: e2e/fixtures/ (git-ignored).
import { writeFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { Midi } = require('@tonejs/midi');

const out = new URL('./fixtures/', import.meta.url);
mkdirSync(out, { recursive: true });

// MIDI: 2 tracks, tempo 90, octave + inverted major triad (C4 G4 E5) + legato repeated note
const midi = new Midi();
midi.name = 'Fixture Song';
midi.header.setTempo(90);
const a = midi.addTrack(), b = midi.addTrack();
a.addNote({ midi: 60, time: 0, duration: 1.5 }); b.addNote({ midi: 72, time: 0, duration: 1.5 }); // octave
a.addNote({ midi: 60, time: 1.5, duration: 1.5 }); a.addNote({ midi: 67, time: 1.5, duration: 1.5 }); b.addNote({ midi: 76, time: 1.5, duration: 1.5 }); // C G E'
a.addNote({ midi: 64, time: 3, duration: 0.5 }); a.addNote({ midi: 64, time: 3.5, duration: 0.5 }); // legato repeat
writeFileSync(new URL('song.mid', out), Buffer.from(midi.toArray()));

function wav(channels, seconds, fn, sr = 44100) {
  const n = Math.floor(sr * seconds);
  const buf = Buffer.alloc(44 + n * channels * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * channels * 2, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(channels, 22);
  buf.writeUInt32LE(sr, 24); buf.writeUInt32LE(sr * channels * 2, 28); buf.writeUInt16LE(channels * 2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(n * channels * 2, 40);
  for (let i = 0; i < n; i++) {
    const v = fn(i / sr);
    for (let c = 0; c < channels; c++) buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, v[c])) * 32767), 44 + (i * channels + c) * 2);
  }
  return buf;
}
writeFileSync(new URL('stereo-3-2.wav', out), wav(2, 3, t => [0.6 * Math.sin(2 * Math.PI * 200 * t), 0.6 * Math.cos(2 * Math.PI * 300 * t)]));
writeFileSync(new URL('mono-a440.wav', out), wav(1, 3, t => [0.6 * Math.sin(2 * Math.PI * 440 * t)]));
writeFileSync(new URL('garbage.mp3', out), Buffer.from('this is not audio at all'));
writeFileSync(new URL('garbage.mid', out), Buffer.from('MThd-not-really'));
console.log('fixtures written');
