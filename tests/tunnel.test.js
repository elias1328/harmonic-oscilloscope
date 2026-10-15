// Phase 4: Waterfall Time Tunnel — pure core (ring buffer, depth/fade mapping, slices, clock).
import { describe, it, expect } from 'vitest';
import {
  SliceRing, sliceZ, sliceAlpha, TunnelClock, buildSlice, decimate, SLICE_POINTS, CAPTURE_HZ, chordHue, densityOf, rgbHue
} from '../src/visualizer/tunnelCore.js';
import { Figure } from '../src/app/figure.js';
import { presetChord, parseCustomRatio, chordFromMidiNotes } from '../src/core/voices.js';

const P = SLICE_POINTS;
const flat = (n, v) => Array.from({ length: n }, (_, i) => [v + i * 1e-3, -v]);

describe('G4.4: slice ring buffer', () => {
  it('G4.4: pushing N + k slices overwrites exactly the k oldest and keeps chronological order', () => {
    const N = 10;
    const k = 4;
    const ring = new SliceRing(N);
    for (let s = 0; s < N + k; s++) ring.push(flat(P, s), [1, 1, 1], s * 0.5);
    const births = ring.ordered().map(i => ring.birthOf(i));
    expect(births.length).toBe(N);
    expect(births).toEqual(Array.from({ length: N }, (_, i) => (i + k) * 0.5)); // oldest k (0..k-1) gone
    // slot content matches its birth (x of the first point encodes the slice number)
    ring.ordered().forEach((slot, j) => expect(ring.positions[slot * P * 3]).toBeCloseTo(j + k, 6));
  });

  it('G4.4: the newest slice is always the last in order; before wrapping, order is insertion order', () => {
    const ring = new SliceRing(6);
    for (let s = 0; s < 3; s++) ring.push(flat(P, s), [1, 0, 0], s);
    expect(ring.ordered().map(i => ring.birthOf(i))).toEqual([0, 1, 2]);
    expect(ring.count).toBe(3);
  });

  it('G4.4: z = (birthTime − now)·speed exactly', () => {
    for (const [b, now, speed] of [[1, 3, 1], [2.5, 2.5, 4], [0, 10, 0.25], [7.125, 7.5, 2]]) {
      expect(sliceZ(b, now, speed)).toBe((b - now) * speed);
    }
  });

  it('G4.4: alpha decreases strictly with age and is 0 at age ≥ the history length', () => {
    const H = 8;
    let prev = Infinity;
    for (let age = 0; age < H; age += H / 200) {
      const a = sliceAlpha(age, H);
      expect(a).toBeLessThan(prev);
      expect(a).toBeGreaterThan(0);
      prev = a;
    }
    expect(sliceAlpha(0, H)).toBe(1);
    expect(sliceAlpha(H, H)).toBe(0);
    expect(sliceAlpha(H + 3, H)).toBe(0);
    expect(sliceAlpha(-0.1, H)).toBe(0); // not born yet
  });

  it('G4.10: the effective history changes without reallocating the preallocated maximum', () => {
    const ring = new SliceRing(480);
    const buffers = [ring.positions, ring.births, ring.colors];
    ring.setHistory(60);
    expect(ring.history).toBe(60);
    ring.setHistory(480);
    ring.setHistory(240);
    expect([ring.positions, ring.births, ring.colors]).toEqual(buffers);
    expect(ring.positions).toBe(buffers[0]);
  });
});

describe('G4.6: tunnel clock', () => {
  it('G4.6: follows the media clock; pause freezes it', () => {
    const c = new TunnelClock();
    expect(c.update(1.0, 100).now).toBeCloseTo(1.0, 12);
    expect(c.update(1.5, 100.5).now).toBeCloseTo(1.5, 12);
    const frozen = c.update(1.5, 101).now;
    expect(c.update(1.5, 102).now).toBe(frozen); // paused media: wall time moves, tunnel does not
  });

  it('G4.6: a seek (jump) or eject clears: every older slice becomes older than any history', () => {
    const c = new TunnelClock();
    c.update(5, 0);
    c.update(5.02, 0.02);
    const r = c.update(1.0, 0.04); // seek back
    expect(r.cleared).toBe(true);
    expect(r.now - 5.02).toBeGreaterThan(1000); // older slices are aged out
    const r2 = c.update(30, 0.06); // seek forward
    expect(r2.cleared).toBe(true);
    const r3 = c.update(null, 0.08); // eject -> wall clock
    expect(r3.cleared).toBe(true);
    const a = c.update(null, 0.1).now;
    const b = c.update(null, 0.35).now;
    expect(b - a).toBeCloseTo(0.25, 9); // without media: wall clock
  });
});

describe('G4.7: slice content', () => {
  const state = (chord, tuning = 'just') => ({ chord, tuning, speedVal: 100, phi: 0, tClose: 4, traceReset: 0 });
  const fig = (s, t = 0) => { const f = new Figure(); f.sync(s, t); return f; };

  it(`G4.7: a JI manual chord slice is one closed period of ${P} points`, () => {
    for (const id of ['fifth', 'octave', 'major_triad', 'dominant7']) {
      const s = state(presetChord(id));
      const sl = buildSlice({ state: s, figure: fig(s), t: 0 });
      expect(sl.points.length).toBe(P);
      const [a, b] = [sl.points[0], sl.points[P - 1]];
      expect(Math.hypot(a[0] - b[0], a[1] - b[1])).toBeLessThan(1e-9);
    }
  });

  it('G4.7: a MIDI chord slice is one closed period too', () => {
    const s = state(chordFromMidiNotes([{ midi: 60 }, { midi: 64 }, { midi: 67 }]));
    const sl = buildSlice({ state: s, figure: fig(s), t: 1.3 });
    const [a, b] = [sl.points[0], sl.points[P - 1]];
    expect(Math.hypot(a[0] - b[0], a[1] - b[1])).toBeLessThan(1e-9);
  });

  it('G4.7: in JI successive manual slices are identical; in 12-TET they differ (precession)', () => {
    const sJ = state(presetChord('fifth'));
    const fJ = fig(sJ);
    const j1 = buildSlice({ state: sJ, figure: fJ, t: 0.1 }).points;
    const j2 = buildSlice({ state: sJ, figure: fJ, t: 3.7 }).points;
    expect(j2).toEqual(j1);
    const sT = state(presetChord('fifth'), 'equal');
    const fT = fig(sT);
    const t1 = buildSlice({ state: sT, figure: fT, t: 0.1 }).points;
    const t2 = buildSlice({ state: sT, figure: fT, t: 3.7 }).points;
    expect(t2).not.toEqual(t1);
  });

  it('G4.7: a 12-TET slice spans a 1/f_fund window (one nominal period of clock time)', () => {
    const sT = state(parseCustomRatio('4:5:6').chord, 'equal');
    const f = fig(sT);
    const sl = buildSlice({ state: sT, figure: f, t: 2 });
    expect(sl.window).toBeCloseTo(f.period, 12);
    expect(sl.points[0]).toEqual(f.pointAt(2, 2));
    // the window equals 1/f_fund of real time, scaled by k
    const fFund = f.model.freqs[0] / f.ratioInts[0];
    expect(sl.window * f.k).toBeCloseTo(1 / fFund, 9);
  });

  it(`G4.7: an audio slice is the X-Y window decimated to ${P} points`, () => {
    const win = Array.from({ length: 1024 }, (_, i) => ({ x: Math.sin(i / 50), y: Math.cos(i / 70) }));
    const d = decimate(win, P);
    expect(d.length).toBe(P);
    d.forEach((p, i) => {
      const src = win[Math.round((i * (win.length - 1)) / (P - 1))];
      expect(p).toEqual([src.x, src.y]);
    });
    const sl = buildSlice({ state: { chord: { source: 'xy', voices: [] } }, figure: null, t: 0, xyPoints: win });
    expect(sl.points).toEqual(d);
    expect(sl.color).toEqual([0.18, 0.8, 0.44]);
  });

  // Phase 5 (G5.3) replaced the Phase 4 "average of the voice colours" rule: averages washed out
  // toward white, so chord changes did not read as colour. Each chord now has its own saturated
  // hue (same chord, same hue), dimmed by ratio density like the 2D phosphor (G5.2).
  it('G5.3: the slice colour is the chord\'s own saturated hue, dimmed by ratio density', () => {
    const s = state(presetChord('fifth'));
    const sl = buildSlice({ state: s, figure: fig(s), t: 0 });
    const [r, g, b] = sl.color;
    expect(Math.max(r, g, b) - Math.min(r, g, b)).toBeGreaterThan(0.4); // saturated, not white
    const hueOf = (c) => rgbHue(c);
    expect(Math.abs(hueOf(sl.color) - chordHue(s.chord))).toBeLessThan(1);
    // dense ratios are dimmer (45:32 vs 3:2)
    const sT = state(parseCustomRatio('32:45').chord);
    const dense = buildSlice({ state: sT, figure: fig(sT), t: 0 }).color;
    expect(Math.max(...dense)).toBeLessThan(Math.max(...sl.color) * 0.6);
    expect(densityOf([32, 45])).toBeCloseTo(4 / Math.sqrt(77), 9);
    expect(densityOf([2, 3])).toBe(1);
  });

  it('G5.3: chords of the MIDI demo progression get hues ≥ 30° apart from their neighbours', () => {
    const steps = [[60, 67], [60, 64], [60, 65], [60, 69], [60, 66], [60, 64, 67], [60, 63, 67], [60, 71], [60, 72], [60], [60, 64, 67, 72]];
    const hues = steps.map(n => chordHue(chordFromMidiNotes(n.map(midi => ({ midi })))));
    for (let i = 1; i < hues.length; i++) {
      const d = Math.abs(hues[i] - hues[i - 1]) % 360;
      expect(Math.min(d, 360 - d), `${i}`).toBeGreaterThanOrEqual(30);
    }
    // same chord, same hue (C-E-G and its octave-doubled voicing)
    expect(hues[10]).toBe(hues[5]);
  });

  it(`captures at ${CAPTURE_HZ} Hz`, () => {
    expect(CAPTURE_HZ).toBe(30);
  });
});
