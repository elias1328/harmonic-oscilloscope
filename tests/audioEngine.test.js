// Phase 1 tests for the audio engine: drone lifecycle (R1), root-Hz aware rebuilds (R2),
// node cleanup / single rebuild / cached tube curve (R25), shared MIDI voice factory (R24).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { installFakeAudio } from './helpers/fakeAudio.js';

const audioLog = installFakeAudio();
const { AudioEngine, toneGainForHz } = await import('../src/audio/audioEngine.js');
const { MediaImporter } = await import('../src/audio/mediaImporter.js');

const FIFTH = [{ name: 'C', semitones: 0, justRatio: 1 }, { name: 'G', semitones: 7, justRatio: 1.5 }];

function engine(hz = 261.6256) {
  const a = new AudioEngine();
  a.init();
  a.setNotes(FIFTH);
  a.setRootFrequency(hz);
  return a;
}
const toneGains = (a) => a.voices.map(v => v.gain.gain.value);

beforeEach(() => audioLog.reset());
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('R1: no drone while media is active', () => {
  it('R1: MediaImporter.ctx has no side effects (does not rebuild the drone)', () => {
    const a = engine();
    a.stopVoices();
    const m = new MediaImporter(a);
    void m.ctx; void m.ctx;
    expect(a.voices.length).toBe(0);
  });

  it('R1: drone stays silent through MIDI playback frames after onLoaded stops it', () => {
    const a = engine();
    const m = new MediaImporter(a);
    m.onLoaded = () => { a.setDroneEnabled(false); m.play(); };
    m.loadBuiltInMidiDemo();
    for (let t = 0; t < 6; t += 0.1) { m.currentTime = t; m.processMidiFrame(); }
    expect(a.voices.length).toBe(0);
    // MIDI notes do sound
    expect(audioLog.live().length).toBeGreaterThan(0);
  });

  it('R1: with the drone disabled, timbre/tuning/mute/volume/resume/setNotes never rebuild it', () => {
    const a = engine();
    a.setDroneEnabled(false);
    expect(a.voices.length).toBe(0);
    audioLog.reset(); // the old voices are still in their release tail; count new ones only
    a.setTimbre('tube'); a.setTuning('equal'); a.setMuted(true); a.setMuted(false);
    a.resume(); a.setNotes(FIFTH); a.setVolume(0.3); a.setRootFrequency(200);
    expect(a.voices.length).toBe(0);
    expect(audioLog.created.osc).toBe(0);
  });

  it('R1: setDroneEnabled(true) rebuilds the drone at the current root', () => {
    const a = engine(100);
    a.setDroneEnabled(false);
    a.setDroneEnabled(true);
    expect(a.voices.length).toBe(2);
    expect(a.voices[0].oscs[0].frequency.value).toBeCloseTo(100, 6);
    expect(a.voices[1].oscs[0].frequency.value).toBeCloseTo(150, 6);
  });

  it('R1: a context created while media is active does not start the drone', () => {
    const a = new AudioEngine();
    a.setNotes(FIFTH);
    a.setDroneEnabled(false);
    a.resume();
    expect(a.ctx).toBeTruthy();
    expect(a.voices.length).toBe(0);
  });
});

describe('R2: rebuilds respect the current root frequency', () => {
  it('R2: toneGainForHz is the single gain rule (0 below 20 Hz, linear to 1 at 30 Hz)', () => {
    expect(toneGainForHz(0.2)).toBe(0);
    expect(toneGainForHz(5)).toBe(0);
    expect(toneGainForHz(20)).toBe(0);
    expect(toneGainForHz(25)).toBeCloseTo(0.5, 9);
    expect(toneGainForHz(30)).toBe(1);
    expect(toneGainForHz(261.6)).toBe(1);
  });

  it('R2: timbre change at 5 Hz keeps voices silent and at the clamped low frequency', () => {
    const a = engine(5);
    a.setTimbre('tube');
    expect(toneGains(a)).toEqual([0, 0]);
    // 5 Hz and 7.5 Hz are clamped to the 20 Hz oscillator floor, never 261.6/392.4
    expect(a.voices.map(v => v.oscs[0].frequency.value)).toEqual([20, 20]);
  });

  it('R2: unmute and resume at 5 Hz keep voices silent', () => {
    const a = engine(5);
    a.setMuted(true); a.stopVoices(); a.setMuted(false);
    expect(a.voices.length).toBe(2);
    expect(toneGains(a)).toEqual([0, 0]);
    a.stopVoices(); a.resume();
    expect(toneGains(a)).toEqual([0, 0]);
  });

  it('R2: rebuild in the 20–30 Hz fusion zone uses the crossfade gain', () => {
    const a = engine(25);
    a.setTimbre('epiano');
    const expected = (0.8 / Math.sqrt(2)) * 0.5;
    toneGains(a).forEach(g => expect(g).toBeCloseTo(expected, 9));
    expect(a.voices[1].oscs[0].frequency.value).toBeCloseTo(37.5, 9);
  });

  it('R2: tuning change uses the current root (12-TET fifth at 100 Hz)', () => {
    const a = engine(100);
    a.setTuning('equal');
    expect(a.voices[1].oscs[0].frequency.value).toBeCloseTo(100 * Math.pow(2, 7 / 12), 6);
  });
});

describe('R25: voice cleanup, single rebuild, cached tube curve', () => {
  it('R25: stopVoices disconnects every node of the old voices, panners included', () => {
    vi.useFakeTimers();
    const a = engine();
    a.setTimbre('tube');
    const old = a.voices;
    a.stopVoices();
    vi.runAllTimers();
    for (const v of old) {
      expect(v.panner.disconnected).toBeGreaterThan(0);
      expect(v.gain.disconnected).toBeGreaterThan(0);
      v.oscs.forEach(o => { expect(o.stopped).toBe(true); expect(o.disconnected).toBeGreaterThan(0); });
      v.nodes.forEach(n => expect(n.disconnected).toBeGreaterThan(0));
    }
  });

  it('R25: configure() (used by syncAudio) rebuilds the voices exactly once', () => {
    const a = engine();
    audioLog.reset();
    a.configure({ notes: FIFTH, tuning: 'equal', rootHz: 200 });
    expect(audioLog.created.osc).toBe(2);
    expect(a.voices[1].oscs[0].frequency.value).toBeCloseTo(200 * Math.pow(2, 7 / 12), 6);
  });

  it('R25: the tube distortion curve is built once and shared', () => {
    const spy = vi.spyOn(AudioEngine.prototype, 'createTubeDistortionCurve');
    const a = engine();
    a.setTimbre('tube'); a.setTuning('equal'); a.setTuning('just');
    const shapers = audioLog.nodes.filter(n => n.kind === 'shaper');
    expect(shapers.length).toBe(6);
    expect(new Set(shapers.map(s => s.curve)).size).toBe(1);
    expect(shapers[0].curve).toBeInstanceOf(Float32Array);
    expect(spy.mock.calls.length).toBeLessThanOrEqual(1);
  });
});

describe('R24: MIDI notes use the same voice factory as the drone', () => {
  function playNote(timbre, volume = 0.6) {
    const a = engine();
    a.setDroneEnabled(false);
    a.setTimbre(timbre);
    a.setVolume(volume);
    audioLog.reset();
    const m = new MediaImporter(a);
    m.triggerMidiNoteOn({ midi: 69, velocity: 0.8 });
    return { a, m, voice: [...m.activeMidiVoices.values()][0] };
  }

  it('R24: "Warm Tube" MIDI note = sine → waveshaper → lowpass, like the drone', () => {
    const { voice } = playNote('tube');
    expect(audioLog.created.shaper).toBe(1);
    expect(audioLog.created.filter).toBe(1);
    expect(voice.oscs.map(o => o.type)).toEqual(['sine']);
    expect(voice.oscs[0].frequency.value).toBeCloseTo(440, 6);
  });

  it('R24: "Soft E-Piano" MIDI note = sine fundamental + 3rd harmonic, not a sawtooth', () => {
    const { voice } = playNote('epiano');
    expect(voice.oscs.map(o => o.type)).toEqual(['sine', 'sine']);
    expect(voice.oscs.map(o => Math.round(o.frequency.value))).toEqual([440, 1320]);
  });

  it('R24: MIDI note gain does not include the master volume a second time', () => {
    const g1 = playNote('sine', 0.2).voice.gain.gain.value;
    const g2 = playNote('sine', 1.0).voice.gain.gain.value;
    expect(g1).toBeGreaterThan(0);
    expect(g1).toBeCloseTo(g2, 9);
  });
});
