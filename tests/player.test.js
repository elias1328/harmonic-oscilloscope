// Phase 1 tests for MediaImporter playback & lifecycle:
// R10 rate re-anchoring, R11 play-state notifications, R12 play-after-end rewind,
// D frame-delta clamp, H same-pitch retrigger, R23 legato demo, E throttled pitch detection,
// R26 file sample rate, R25 failed-import cleanup.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Midi } from '@tonejs/midi';
import { installFakeAudio, makeWav } from './helpers/fakeAudio.js';

vi.mock('../src/audio/pitchDetector.js', async (orig) => {
  const real = await orig();
  return { ...real, autoCorrelate: vi.fn(real.autoCorrelate) };
});

const audioLog = installFakeAudio();
const { AudioEngine } = await import('../src/audio/audioEngine.js');
const { MediaImporter } = await import('../src/audio/mediaImporter.js');
const { autoCorrelate } = await import('../src/audio/pitchDetector.js');

let now = 0;
beforeEach(() => {
  audioLog.reset();
  now = 1000;
  vi.spyOn(performance, 'now').mockImplementation(() => now);
});
afterEach(() => vi.restoreAllMocks());

function importer() {
  const a = new AudioEngine();
  a.init();
  a.setNotes([{ name: 'C', semitones: 0, justRatio: 1 }, { name: 'G', semitones: 7, justRatio: 1.5 }]);
  a.setDroneEnabled(false);
  const m = new MediaImporter(a);
  return { a, m };
}

async function loadWav(m, opts = {}) {
  await m.loadAudioBuffer(makeWav({ seconds: 4, ...opts }), 'test.wav');
}

describe('R10: playback rate change keeps the position', () => {
  it('R10: switching to 2x at t=3 s keeps t=3 s, then advances at 2x', async () => {
    const { a, m } = importer();
    await loadWav(m);
    a.ctx.currentTime = 10;
    m.play();
    a.ctx.currentTime = 13; m.update();
    expect(m.currentTime).toBeCloseTo(3, 6);
    m.setPlaybackRate(2);
    m.update();
    expect(m.currentTime).toBeCloseTo(3, 6);
    a.ctx.currentTime = 13.25; m.update();
    expect(m.currentTime).toBeCloseTo(3.5, 6);
    expect(m.audioSourceNode.playbackRate.value).toBe(2);
  });
});

describe('R11: play/pause state is always reported', () => {
  it('R11: pause() and stop() emit onPlaybackUpdate with isPlaying=false', () => {
    const { m } = importer();
    const calls = [];
    m.onPlaybackUpdate = (t, d, playing) => calls.push(playing);
    m.loadBuiltInMidiDemo();
    m.play();
    calls.length = 0;
    m.pause();
    expect(calls).toEqual([false]);
    m.play(); calls.length = 0;
    m.stop();
    expect(calls.at(-1)).toBe(false);
  });

  it('R11: reaching the end with loop off emits isPlaying=false and onEnded (MIDI)', () => {
    const { m } = importer();
    const calls = []; const ended = vi.fn();
    m.onPlaybackUpdate = (t, d, playing) => calls.push(playing);
    m.onEnded = ended;
    m.loadBuiltInMidiDemo();
    m.setLoop(false);
    m.seek(m.currentMedia.duration - 0.05);
    m.play();
    now += 100; m.update();
    expect(m.isPlaying).toBe(false);
    expect(calls.at(-1)).toBe(false);
    expect(ended).toHaveBeenCalledTimes(1);
  });

  it('R11: reaching the end with loop off emits isPlaying=false and onEnded (audio)', async () => {
    const { a, m } = importer();
    const calls = []; const ended = vi.fn();
    m.onPlaybackUpdate = (t, d, playing) => calls.push(playing);
    m.onEnded = ended;
    await loadWav(m);
    m.setLoop(false);
    m.play();
    a.ctx.currentTime += 5; m.update();
    expect(m.isPlaying).toBe(false);
    expect(calls.at(-1)).toBe(false);
    expect(ended).toHaveBeenCalledTimes(1);
  });
});

describe('R12: Play after the end rewinds', () => {
  it('R12: MIDI — play() at t=duration restarts from 0 and the clock advances', () => {
    const { m } = importer();
    m.loadBuiltInMidiDemo();
    m.setLoop(false);
    m.seek(m.currentMedia.duration);
    m.play();
    expect(m.currentTime).toBe(0);
    now += 100; m.update();
    expect(m.isPlaying).toBe(true);
    expect(m.currentTime).toBeGreaterThan(0);
    expect(m.currentTime).toBeLessThan(1);
  });

  it('R12: audio — play() after the end restarts the source at offset 0', async () => {
    const { a, m } = importer();
    await loadWav(m);
    m.setLoop(false);
    m.play();
    a.ctx.currentTime += 5; m.update();
    expect(m.isPlaying).toBe(false);
    m.play();
    expect(m.currentTime).toBe(0);
    expect(m.audioSourceNode.startOffset).toBe(0);
    a.ctx.currentTime += 0.5; m.update();
    expect(m.currentTime).toBeCloseTo(0.5, 6);
  });
});

describe('D: frame delta clamp', () => {
  it('D: a 5 s gap between frames advances the MIDI clock by at most 0.1 s × rate', () => {
    const { m } = importer();
    m.loadBuiltInMidiDemo();
    m.play();
    now += 5000; m.update();
    expect(m.currentTime).toBeLessThanOrEqual(0.1 + 1e-9);
    expect(m.currentTime).toBeGreaterThan(0);
  });
});

describe('H: same-pitch notes retrigger', () => {
  it('H: back-to-back MIDI notes of the same pitch each get their own voice', async () => {
    const midi = new Midi();
    const tr = midi.addTrack();
    tr.addNote({ midi: 64, time: 0, duration: 0.5 });
    tr.addNote({ midi: 64, time: 0.5, duration: 0.5 });
    const { m } = importer();
    await m.loadMidiBuffer(midi.toArray().buffer, 'legato.mid');
    m.play();
    const e4 = () => audioLog.oscillators.filter(o => Math.abs(o.frequency.value - 329.63) < 0.01);
    m.currentTime = 0.25; m.processMidiFrame();
    expect(e4().length).toBe(1);
    m.currentTime = 0.6; m.processMidiFrame();
    expect(e4().length).toBe(2);
    expect(m.activeMidiVoices.size).toBe(1);
  });
});

describe('R23: legato demo', () => {
  it('R23: the MIDI demo never reports SILENCE between steps', () => {
    const { m } = importer();
    m.loadBuiltInMidiDemo();
    const titles = new Set();
    for (let t = 0; t < m.currentMedia.duration - 1e-6; t += 0.01) {
      m.currentTime = t;
      titles.add(m.processMidiFrame().ratioInfo.title);
    }
    expect([...titles]).not.toContain('SILENCE');
  });

  it('R23/R27: the demo is called "Harmonic Intervals Journey"', () => {
    const { m } = importer();
    expect(m.loadBuiltInMidiDemo().name).toMatch(/Harmonic Intervals Journey/);
    expect(m.currentMedia.name).not.toMatch(/Bach/);
  });
});

describe('E: pitch detection only in pitch mode, at most 20 Hz', () => {
  it('E: X-Y mode never runs the autocorrelation', async () => {
    const { m } = importer();
    await loadWav(m, { fn: t => [Math.sin(2 * Math.PI * 220 * t), Math.sin(2 * Math.PI * 330 * t)] });
    autoCorrelate.mockClear();
    m.audioMode = 'xy';
    for (let i = 0; i < 60; i++) { now += 16.7; m.processAudioFrame(); }
    expect(autoCorrelate).not.toHaveBeenCalled();
  });

  it('E: pitch mode runs it at most 20 times per second and keeps reporting the last pitch', async () => {
    const { m } = importer();
    await loadWav(m, { fn: t => [0.5 * Math.sin(2 * Math.PI * 220 * t), 0] });
    autoCorrelate.mockClear();
    m.audioMode = 'pitch';
    const infos = [];
    for (let i = 0; i < 60; i++) { now += 1000 / 60; m.currentTime = i / 60; infos.push(m.processAudioFrame().pitchInfo); }
    expect(autoCorrelate.mock.calls.length).toBeGreaterThan(0);
    expect(autoCorrelate.mock.calls.length).toBeLessThanOrEqual(20);
    expect(infos.slice(5).every(p => p && Math.abs(p.frequency - 220) < 3)).toBe(true);
  });
});

describe('R26: sample rate of the file, not the context', () => {
  it('R26: a 44.1 kHz WAV decoded by a 48 kHz context reports 44.1 kHz from its header', async () => {
    const { a, m } = importer();
    a.ctx.sampleRate = 48000;
    await loadWav(m, { sampleRate: 44100 });
    expect(m.currentMedia.sampleRate).toBe(44100);
    expect(m.currentMedia.sampleRateSource).toBe('file');
  });

  it('R26: without a parseable header the context rate is reported and labelled as such', async () => {
    const { a, m } = importer();
    a.ctx.sampleRate = 48000;
    const wav = new Uint8Array(makeWav({ seconds: 1 }));
    wav.set([0x78, 0x78, 0x78, 0x20], 12); // rename the 'fmt ' chunk: header unparseable, fake decoder still decodes
    await m.loadAudioBuffer(wav.buffer, 'odd.wav');
    expect(m.currentMedia.sampleRate).toBe(48000);
    expect(m.currentMedia.sampleRateSource).toBe('context');
  });
});

describe('R25: failed imports leave no stale media behind', () => {
  it('R25: a failed MIDI import after a successful one clears the current media', async () => {
    const { m } = importer();
    m.loadBuiltInMidiDemo();
    await expect(m.loadMidiBuffer(new Uint8Array([1, 2, 3]).buffer, 'bad.mid')).rejects.toThrow(/Could not parse MIDI/);
    expect(m.currentMedia).toBe(null);
    expect(m.midiNotes.length).toBe(0);
    expect(m.update()).toBe(null);
  });

  it('R25: a failed audio import clears the current media', async () => {
    const { m } = importer();
    await loadWav(m);
    await expect(m.loadAudioBuffer(new Uint8Array([1, 2, 3]).buffer, 'bad.mp3')).rejects.toThrow(/Could not decode/);
    expect(m.currentMedia).toBe(null);
    expect(m.audioBuffer).toBe(null);
  });
});

describe('R15 (MIDI): processMidiFrame uses a moving index (G2.12)', () => {
  it('R15: a 10,000-note file inspects < 200 notes per frame mid-song', async () => {
    const midi = new Midi();
    const tr = midi.addTrack();
    for (let i = 0; i < 10000; i++) tr.addNote({ midi: 48 + (i % 24), time: i * 0.05, duration: 0.2 + (i % 3) * 0.1 });
    const { m } = importer();
    await m.loadMidiBuffer(midi.toArray().buffer, 'big.mid');
    expect(m.midiNotes.length).toBe(10000);
    let reads = 0;
    const real = m.midiNotes;
    m.midiNotes = new Proxy(real, { get(t, k) { if (typeof k === 'string' && /^\d+$/.test(k)) reads++; return t[k]; } });
    m.play();
    const counts = [];
    // a jump into the middle (seek), then normal playback frames
    m.seek(250);
    for (let i = 0; i < 120; i++) {
      reads = 0;
      now += 16; m.update();
      counts.push(reads);
    }
    expect(Math.max(...counts)).toBeLessThan(200);
    // and the result is still right: notes sounding at the current time
    const t = m.currentTime;
    const expected = real.filter(n => n.time <= t && t < n.time + n.duration).length;
    expect(m.processMidiFrame().activeNotes.length).toBe(expected);
  });

  it('R15: seeking backwards and looping still find the right notes', () => {
    const { m } = importer();
    m.loadBuiltInMidiDemo();
    for (const t of [20, 3, 0.5, 24.9, 1]) {
      m.currentTime = t;
      const got = m.processMidiFrame().activeNotes.map(n => n.midi).sort();
      const want = m.midiNotes.filter(n => n.time <= t && t < n.time + n.duration).map(n => n.midi).sort();
      expect(got).toEqual(want);
    }
  });
});
