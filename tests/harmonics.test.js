// Ported from Agent/tests/unit.test.mjs (harmonics.js + Lissajous geometry sections).
// Tests named "BUG:" assert the CORRECT behaviour. Those whose fix belongs to a later
// phase are marked `it.fails` and tagged with their report ID.
import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import {
  gcd, simplifyRatio, semitoneToEqualTemperament, noteNameToSemitone,
  identifyChordFromIntervals, INTERVALS_BY_SEMITONE, INTERVALS_SIMPLEST_FIRST, CHORD_PRESETS
} from '../src/math/harmonics.js';

describe('harmonics.js', () => {
  it('gcd / simplifyRatio', () => {
    assert.equal(gcd(12, 8), 4);
    assert.deepEqual(simplifyRatio(4, 6), [2, 3]);
    assert.deepEqual(simplifyRatio(45, 32), [45, 32]);
  });

  it('simplifyRatio(0,0) yields NaN (division by gcd 0)', () => {
    const r = simplifyRatio(0, 0);
    assert.ok(Number.isNaN(r[0]), 'documenting edge case');
  });

  it('12-TET multiplier', () => {
    assert.equal(semitoneToEqualTemperament(12), 2);
    assert.ok(Math.abs(semitoneToEqualTemperament(7) - 1.4983) < 1e-4);
  });

  it('noteNameToSemitone known + enharmonic names', () => {
    assert.equal(noteNameToSemitone('C'), 0);
    assert.equal(noteNameToSemitone('F#'), 6);
    assert.equal(noteNameToSemitone('Gb'), 6);
    assert.equal(noteNameToSemitone("C'"), 12);
    assert.equal(noteNameToSemitone(' Bb '), 10);
  });

  it('noteNameToSemitone silently maps unknown names (e.g. custom-ratio "H5") to 0', () => {
    assert.equal(noteNameToSemitone('H5'), 0);
    assert.equal(noteNameToSemitone('X'), 0);
  });

  it('INTERVALS_BY_SEMITONE: ratio and ratioInts are consistent', () => {
    for (const [semi, d] of Object.entries(INTERVALS_BY_SEMITONE)) {
      assert.deepEqual(d.ratioInts, [d.ratio[1], d.ratio[0]], `semitone ${semi}`);
      // just ratio should be within 20 cents of 12-TET
      const cents = 1200 * Math.log2((d.ratio[0] / d.ratio[1]) / Math.pow(2, semi / 12));
      assert.ok(Math.abs(cents) < 20, `semitone ${semi} off by ${cents.toFixed(1)}c`);
    }
  });

  it('INTERVALS_SIMPLEST_FIRST: 12 entries, unique notes, semitones agree with BY_SEMITONE', () => {
    assert.equal(INTERVALS_SIMPLEST_FIRST.length, 12);
    assert.equal(new Set(INTERVALS_SIMPLEST_FIRST.map(i => i.note)).size, 12);
    for (const i of INTERVALS_SIMPLEST_FIRST) {
      assert.deepEqual(INTERVALS_BY_SEMITONE[i.semitones].ratio, i.ratio, i.name);
    }
  });

  it('CHORD_PRESETS: ratios equal ratioInts normalized to root', () => {
    for (const p of CHORD_PRESETS) {
      assert.equal(p.notes.length, p.ratios.length, p.id);
      assert.equal(p.notes.length, p.ratioInts.length, p.id);
      assert.equal(p.notes.length, p.colors.length, p.id);
      if (p.id === 'dissonance') continue; // checked separately
      p.ratioInts.forEach((r, i) => {
        assert.ok(Math.abs(r / p.ratioInts[0] - p.ratios[i]) < 1e-9, `${p.id}[${i}]`);
      });
    }
  });

  it.fails('R19 BUG: dissonance preset ratioInts 15:16:17 disagree with its ratios 1 : 16/15 : 9/8 (= 120:128:135)', () => {
    const p = CHORD_PRESETS.find(p => p.id === 'dissonance');
    p.ratioInts.forEach((r, i) => {
      assert.ok(Math.abs(r / p.ratioInts[0] - p.ratios[i]) < 1e-9, `index ${i}: ${r / p.ratioInts[0]} vs ${p.ratios[i]}`);
    });
  });

  it('identifyChordFromIntervals: known chords', () => {
    assert.equal(identifyChordFromIntervals([0, 4, 7]).title, '4 : 5 : 6');
    assert.equal(identifyChordFromIntervals([0, 3, 7]).title, '10 : 12 : 15');
    assert.equal(identifyChordFromIntervals([0, 4, 7, 10]).title, '4 : 5 : 6 : 7');
    assert.equal(identifyChordFromIntervals([0, 1, 2]).title, '15 : 16 : 17');
  });

  it.fails('R7 BUG: identifyChordFromIntervals is order/duplicate sensitive (C-G-E voicing, doubled root)', () => {
    // MIDI path passes (midi - root) % 12 unsorted & with duplicates, e.g. C4 G4 E5 -> [0,7,4]
    assert.equal(identifyChordFromIntervals([0, 7, 4]).category, 'A MAJOR CHORD');
  });

  it.fails('R7 BUG: C-E-G-C (doubled octave, demo final chord via %12) -> [0,4,7,0] not recognized', () => {
    assert.equal(identifyChordFromIntervals([0, 4, 7, 0]).category, 'A MAJOR CHORD');
  });

  it('identifyChordFromIntervals custom fallback values', () => {
    const r = identifyChordFromIntervals([0, 4, 7, 12]);
    assert.deepEqual(r.ratioInts, [12, 15, 18, 24]);
    assert.equal(r.category, 'CUSTOM CHORD');
  });
});

// ---------- Lissajous geometry used by renderers ----------
// NOTE: like the Agent original, these two tests re-implement the renderer formulas
// inline (the renderers are not pure functions yet). Phase 2 introduces
// src/render/lissajous.js; the tests must then be rewired to call it.
describe('Lissajous geometry (renderer formulas)', () => {
  // 2D lab & matrix draw x = sin(a t), y = cos(b t + phi). With phi = 0 the curve degenerates
  // into an open, double-traced arc when a is odd and b is even.
  function isDegenerate(a, b, phi = 0) {
    // retrace symmetry t -> c - t with c = pi/a*k
    const N = 400;
    for (let k = 1; k < 2 * a; k += 2) {
      const c = Math.PI * k / a;
      let ok = true;
      for (let i = 0; i < N && ok; i++) {
        const t = (i / N) * 2 * Math.PI;
        const dx = Math.sin(a * t) - Math.sin(a * (c - t));
        const dy = Math.cos(b * t + phi) - Math.cos(b * (c - t) + phi);
        if (Math.abs(dx) > 1e-9 || Math.abs(dy) > 1e-9) ok = false;
      }
      if (ok) return true;
    }
    return false;
  }

  it.fails('R8 BUG: at default phase 0, several interval figures are open (retraced) curves, not closed loops', () => {
    const degenerate = INTERVALS_SIMPLEST_FIRST
      .filter(i => isDegenerate(i.ratio[1], i.ratio[0]))
      .map(i => `${i.name} ${i.ratio[0]}:${i.ratio[1]}`);
    assert.deepEqual(degenerate, []);
  });

  // 2D renderer, 3+ notes: y uses cos(n3 * t * 0.8) -> non-integer frequency, never closes over 2pi
  it.fails('R9 BUG: 2D 3-note "full loop" curve does not close (0.8 factor)', () => {
    const [n1, n2, n3] = [4, 5, 6];
    const f = (t) => [0.65 * Math.sin(n1 * t) + 0.35 * Math.sin(n3 * t), 0.65 * Math.cos(n2 * t) + 0.35 * Math.cos(n3 * t * 0.8)];
    const [x0, y0] = f(0); const [x1, y1] = f(2 * Math.PI);
    const gap = Math.hypot(x1 - x0, y1 - y0);
    assert.ok(gap < 1e-6);
  });
});
