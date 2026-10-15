// Ported from Agent/tests/media.test.mjs: MediaImporter MIDI logic + AudioEngine state logic
// against the fake Web Audio API in tests/helpers/fakeAudio.js.
import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { Midi } from '@tonejs/midi';
import { installFakeAudio } from './helpers/fakeAudio.js';

const audioLog = installFakeAudio();
const created = audioLog.created;

const { AudioEngine } = await import('../src/audio/audioEngine.js');
const { MediaImporter } = await import('../src/audio/mediaImporter.js');

function freshEngine() {
  const a = new AudioEngine();
  a.init();
  a.setNotes([{ name: 'C', semitones: 0, justRatio: 1 }, { name: 'G', semitones: 7, justRatio: 1.5 }]);
  a.setRootFrequency(261.6256);
  return a;
}

function importer() {
  const a = freshEngine();
  const m = new MediaImporter(a);
  return { a, m };
}

describe('AudioEngine (ported)', () => {
  it('AudioEngine: just vs 12-TET frequencies', () => {
    const a = freshEngine();
    assert.ok(Math.abs(a.voices[1].oscs[0].frequency.value - 392.4384) < 0.01);
    a.setTuning('equal'); a.setRootFrequency(261.6256);
    assert.ok(Math.abs(a.voices[1].oscs[0].frequency.value - 391.995) < 0.01);
  });

  // The Agent original fed the engine the semitones main.js used to build (all 0). The bug was
  // in that construction; the app now builds custom voices with the voice model, so the test
  // builds the notes the same way (parseCustomRatio -> voices) and keeps the assertion.
  it('R4 BUG: 12-TET with custom-ratio notes ("H4","H5","H6") collapses all voices to the root pitch', async () => {
    const { parseCustomRatio } = await import('../src/core/voices.js');
    const a = new AudioEngine(); a.init();
    const chord = parseCustomRatio('4:5:6').chord;
    a.setNotes(chord.voices.map(v => ({ name: v.label, semitones: v.semitones, justRatio: v.ji.value })));
    a.setTuning('equal'); a.setRootFrequency(200);
    const freqs = a.voices.map(v => v.oscs[0].frequency.value);
    assert.equal(new Set(freqs).size, 3);
  });

  it('R2 BUG: timbre change ignores current root Hz (slider at 5 Hz -> voices recreated at 261.6 Hz, audible)', () => {
    const a = freshEngine();
    a.setRootFrequency(5); // slider in polyrhythm zone: tones should be silent
    assert.equal(a.voices[0].gain.gain.value, 0);
    a.setTimbre('tube');
    const v = a.voices[0];
    assert.equal(v.gain.gain.value, 0, 'tone should stay silent below 20 Hz');
  });

  it('triggerPolyrhythmClick gating by Hz', () => {
    const a = freshEngine();
    a.setRootFrequency(10); created.osc = 0; a.triggerPolyrhythmClick(0); assert.equal(created.osc, 1);
    a.setRootFrequency(25); created.osc = 0; a.triggerPolyrhythmClick(0); assert.equal(created.osc, 1);
    a.setRootFrequency(30); created.osc = 0; a.triggerPolyrhythmClick(0); assert.equal(created.osc, 0);
    a.setMuted(true); a.setRootFrequency(5); created.osc = 0; a.triggerPolyrhythmClick(0); assert.equal(created.osc, 0);
  });

  it('setNotes + setTuning each rebuild all voices (syncAudio builds voices twice)', () => {
    const a = freshEngine(); created.osc = 0;
    a.setNotes(a.currentNotes); a.setTuning('just');
    assert.equal(created.osc, 4, 'documenting: 2 voices x 2 rebuilds');
  });
});

describe('MediaImporter (ported)', () => {
  it('R1 BUG: drone voices restart while media plays (ctx getter calls engine.resume -> refreshVoices)', () => {
    const { a, m } = importer();
    m.onLoaded = () => { a.stopVoices(); m.play(); }; // mirrors main.js onLoaded
    m.loadBuiltInMidiDemo();
    assert.equal(a.voices.length, 0, 'manual drone should be silent during media playback');
  });

  it('R6 BUG: MIDI demo octave segment (C4+C5) should be labeled OCTAVE 2 : 1', () => {
    const { m } = importer();
    const seen = [];
    m.onMidiStateChange = (_, info) => { if (seen.at(-1) !== info.title + '|' + info.category) seen.push(info.title + '|' + info.category); };
    m.loadBuiltInMidiDemo();
    for (let t = 0.1; t < m.currentMedia.duration; t += 0.25) { m.currentTime = t; m.processMidiFrame(); }
    const octave = seen.find(s => s.includes('OCTAVE'));
    assert.ok(octave, 'BUG: C4+C5 octave segment should be labeled OCTAVE 2 : 1');
  });

  // The Agent original combined a passing check (parse + 4:5:6) and the R6 octave bug in one
  // test; split in two so the passing part was not hidden behind an expected-failure marker.
  async function loadTestMidi() {
    const midi = new Midi();
    const tr = midi.addTrack();
    [60, 64, 67].forEach(n => tr.addNote({ midi: n, time: 0, duration: 1 }));
    tr.addNote({ midi: 60, time: 1, duration: 1 }); tr.addNote({ midi: 72, time: 1, duration: 1 });
    const buf = midi.toArray().buffer;
    const { m } = importer();
    let info; m.onLoaded = (i) => { info = i; };
    await m.loadMidiBuffer(buf, 'test.mid');
    return { m, info };
  }

  it('MIDI: real .mid parsed via @tonejs/midi', async () => {
    const { m, info } = await loadTestMidi();
    assert.equal(info.noteCount, 5);
    m.currentTime = 0.5; assert.equal(m.processMidiFrame().ratioInfo.title, '4 : 5 : 6');
  });

  it('R6 BUG: real .mid C4+C5 is labeled 2 : 1', async () => {
    const { m } = await loadTestMidi();
    m.currentTime = 1.5; const r = m.processMidiFrame().ratioInfo;
    assert.equal(r.title, '2 : 1', 'BUG: octave mislabeled');
  });

  it('MIDI: garbage buffer throws friendly error', async () => {
    const { m } = importer();
    await assert.rejects(m.loadMidiBuffer(new Uint8Array([1, 2, 3, 4]).buffer), /Could not parse MIDI/);
  });

  it('MIDI: seek clamps and play-after-end immediately re-pauses (no auto-rewind)', () => {
    const { m } = importer();
    m.loadBuiltInMidiDemo();
    m.seek(9999); assert.equal(m.currentTime, m.currentMedia.duration);
    m.seek(-5); assert.equal(m.currentTime, 0);
    m.setLoop(false); m.seek(m.currentMedia.duration);
    m.play(); m.lastClockTime = performance.now() - 16; m.update();
    // the Agent original only logged isPlaying here; R12 asserts the fixed behaviour.
  });

  it('setPlaybackRate clamps to [0.25, 3]', () => {
    const { m } = importer();
    m.setPlaybackRate(10); assert.equal(m.playbackRate, 3);
    m.setPlaybackRate(0); assert.equal(m.playbackRate, 0.25);
  });
});
