// Phase 2: one truthful clock (G2.5, G2.9).
import { describe, it, expect } from 'vitest';
import { Clock, PhaseModel, timeScale, MAX_FRAME_DT } from '../src/core/clock.js';
import { chordFromPianoKeys, presetChord } from '../src/core/voices.js';

describe('Clock', () => {
  it('D: a stall longer than 0.1 s is absorbed; the clock never jumps or runs backwards', () => {
    let real = 10;
    const c = new Clock(() => real);
    c.tick();
    const t0 = c.now();
    real += 5; c.tick();
    expect(c.now() - t0).toBeCloseTo(MAX_FRAME_DT, 9);
    real += 0.016; c.tick();
    expect(c.now() - t0).toBeCloseTo(MAX_FRAME_DT + 0.016, 9);
  });

  it('switching the source (performance.now -> AudioContext) keeps the clock continuous', () => {
    let perf = 100;
    let audio = 3;
    const c = new Clock(() => perf);
    c.tick();
    const before = c.now();
    c.setSource(() => audio);
    expect(c.now()).toBeCloseTo(before, 12);
    audio += 0.5;
    expect(c.now()).toBeCloseTo(before + 0.5, 12);
    expect(c.toSource(c.now())).toBeCloseTo(audio, 12);
  });
});

describe('N / R20: 12-TET precession (G2.5)', () => {
  it('N: ψ = 2·θ_G − 3·θ_C equals 2π·(2·f_G − 3·f_C)·k·t over a simulated 10 s', () => {
    const chord = presetChord('fifth');
    const [fC, fG] = chord.freqs('equal');
    const k = timeScale(fC, chord.ratioInts()[0], 4);
    expect(k).toBeLessThan(1);
    let t = 0;
    const clock = new Clock(() => t);
    const model = new PhaseModel();
    model.configure({ freqs: [fC, fG], k }, clock.now(), { reset: true });
    for (let i = 1; i <= 625; i++) {
      t = i * 0.016;
      clock.tick();
      const now = clock.now();
      const psi = 2 * model.theta(1, now) - 3 * model.theta(0, now);
      expect(Math.abs(psi - 2 * Math.PI * (2 * fG - 3 * fC) * k * now)).toBeLessThan(1e-6);
    }
    expect(t).toBeCloseTo(10, 9);
  });

  it('N: in just intonation the same ψ stays constant (the figure is closed, no precession)', () => {
    const [fC, fG] = presetChord('fifth').freqs('just');
    const model = new PhaseModel();
    model.configure({ freqs: [fC, fG], k: 0.01 }, 0, { reset: true });
    for (const t of [0, 1, 5, 10]) expect(Math.abs(2 * model.theta(1, t) - 3 * model.theta(0, t))).toBeLessThan(1e-6);
  });

  it('R20: re-anchoring (speed or k change) keeps the phases continuous', () => {
    const model = new PhaseModel();
    model.configure({ freqs: [2, 3], k: 1 }, 0, { reset: true });
    const before = model.thetas(1.234);
    model.configure({ freqs: [4, 6], k: 0.5 }, 1.234);
    model.thetas(1.234).forEach((th, i) => expect(th).toBeCloseTo(before[i], 12));
  });
});

describe('B: time scale (G2.9)', () => {
  it('B: k = 1 while the root is at most 30 Hz', () => {
    for (const hz of [0.2, 1, 5, 19.9, 25, 30]) expect(timeScale(hz, 2, 4)).toBe(1);
  });

  it('B: at 1 Hz with 3:2 the root advances exactly 2π/s and the G voice 3π/s', () => {
    const chord = presetChord('fifth');
    const factor = 1 / chord.rootHz; // slider at 1 Hz
    const freqs = chord.freqs('just').map(f => f * factor);
    const model = new PhaseModel();
    model.configure({ freqs, k: timeScale(freqs[0], 2, 4) }, 0, { reset: true });
    for (const t of [0, 0.37, 2.5]) {
      expect(Math.abs(model.theta(0, t + 1) - model.theta(0, t) - 2 * Math.PI)).toBeLessThan(1e-6);
      expect(Math.abs(model.theta(1, t + 1) - model.theta(1, t) - 3 * Math.PI)).toBeLessThan(1e-6);
    }
  });

  it('B: above 30 Hz one closed period of the chord lasts T_close (default 4 s, and 7 s) ±1%', () => {
    for (const [keys, tClose] of [[['C', 'G'], 4], [['C', 'E', 'G'], 4], [['E', 'Ab'], 7], [['C', 'F#'], 4]]) {
      const chord = chordFromPianoKeys(keys);
      const a = chord.ratioInts()[0];
      const freqs = chord.freqs('just');
      const model = new PhaseModel();
      model.configure({ freqs, k: timeScale(freqs[0], a, tClose) }, 0, { reset: true });
      // time for the root to complete its a cycles = one closed period
      const period = (2 * Math.PI * a) / model.omega(0);
      expect(Math.abs(period - tClose) / tClose).toBeLessThan(0.01);
      // and every voice is back in phase after that time (closure)
      model.thetas(period).forEach((th, i) => expect(Math.abs(Math.sin(th / 2)), `${keys} voice ${i}`).toBeLessThan(1e-6));
    }
  });
});
