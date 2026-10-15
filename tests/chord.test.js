// Phase 2: the one voice model (src/core/voices.js), exact fractions and chord identification.
import { describe, it, expect } from 'vitest';
import { Fraction, fractionsToInts, gcd, lcm } from '../src/core/fraction.js';
import { identifyChord, jiForSemitones, INTERVALS_BY_SEMITONE } from '../src/math/harmonics.js';
import { chordFromPianoKeys, parseCustomRatio, presetChord, chordFromMidiNotes, VOICE_PALETTE } from '../src/core/voices.js';

describe('fraction.js', () => {
  it('gcd, lcm, Fraction reduction and arithmetic', () => {
    expect(gcd(12, 18)).toBe(6);
    expect(lcm(4, 6)).toBe(12);
    const f = new Fraction(6, 4);
    expect([f.num, f.den]).toEqual([3, 2]);
    expect(f.mul(new Fraction(4, 3)).equals(new Fraction(2, 1))).toBe(true);
    expect(fractionsToInts([new Fraction(1), new Fraction(5, 4), new Fraction(3, 2)])).toEqual([4, 5, 6]);
  });

  it('tables store exact fractions, with unison and octave entries', () => {
    expect(INTERVALS_BY_SEMITONE[0].ji.equals(new Fraction(1))).toBe(true);
    expect(INTERVALS_BY_SEMITONE[12].ji.equals(new Fraction(2))).toBe(true);
    expect(INTERVALS_BY_SEMITONE[6].ji.equals(new Fraction(45, 32))).toBe(true);
    expect(jiForSemitones(19).equals(new Fraction(3))).toBe(true);
  });
});

describe('R6 / R7 / C: identifyChord (G2.7)', () => {
  const C4 = 60, E4 = 64, G4 = 67, C5 = 72, E5 = 76, G5 = 79;

  it('R7: E-G-C is C major, 1st inversion, 4 : 5 : 6', () => {
    const r = identifyChord([E4, G4, C5]);
    expect(r.quality).toBe('major');
    expect(r.inversion).toBe(1);
    expect(r.title).toBe('4 : 5 : 6');
    expect(r.category).toMatch(/MAJOR/);
    expect(r.category).toMatch(/1ST INVERSION/);
  });

  it('R7: C-G-E and C-E-G-C are 4 : 5 : 6 (order and doublings do not matter)', () => {
    expect(identifyChord([C4, G4, E5]).title).toBe('4 : 5 : 6');
    expect(identifyChord([C4, E4, G4, C5]).title).toBe('4 : 5 : 6');
    expect(identifyChord([G4, C4, E4, C4]).title).toBe('4 : 5 : 6');
    expect(identifyChord([G4, C5, E5]).inversion).toBe(2);
  });

  it('R6: C4+C5 is 2 : 1 and C4+G5 is the compound fifth 3 : 1', () => {
    expect(identifyChord([C4, C5]).title).toBe('2 : 1');
    expect(identifyChord([C4, C5]).category).toMatch(/OCTAVE/);
    expect(identifyChord([C4, G5]).title).toBe('3 : 1');
    expect(identifyChord([C4, G5]).category).toMatch(/COMPOUND FIFTH/);
    expect(identifyChord([C4, 84]).title).toBe('4 : 1');
  });

  it('C: unknown chords give integer ratioInts with gcd 1 equal to the exact JI product', () => {
    for (const notes of [[0, 1, 6], [0, 2, 3, 9], [60, 61, 73], [0, 6, 11, 13]]) {
      const r = identifyChord(notes);
      expect(r.category).toBe('CUSTOM CHORD');
      expect(r.ratioInts.every(Number.isInteger)).toBe(true);
      expect(r.ratioInts.reduce((a, n) => gcd(a, n), 0)).toBe(1);
      const sorted = [...new Set(notes)].sort((a, b) => a - b);
      sorted.forEach((n, i) => {
        const exact = jiForSemitones(n - sorted[0]);
        // ratioInts[i] / ratioInts[0] is exactly the JI product, compared as fractions
        expect(new Fraction(r.ratioInts[i], r.ratioInts[0]).equals(exact)).toBe(true);
      });
    }
    expect(identifyChord([0, 1, 6]).ratioInts).toEqual([480, 512, 675]);
  });

  it('R6: the MIDI chord builder labels C4+C5 as an octave 2 : 1', () => {
    const c = chordFromMidiNotes([{ midi: 60 }, { midi: 72 }]);
    expect(c.meta.title).toBe('2 : 1');
    expect(c.meta.category).toMatch(/OCTAVE/);
    expect(c.freqs()[1] / c.freqs()[0]).toBeCloseTo(2, 12);
  });
});

describe('R4 / A: the piano root pitch is real (G2.6)', () => {
  it('R4: piano E+G♯ gives JI [329.63, 412.03] and 12-TET [329.63, 415.30]', () => {
    const c = chordFromPianoKeys(['E', 'Ab']);
    c.freqs('just').forEach((f, i) => expect(Math.abs(f - [329.63, 412.03][i])).toBeLessThan(0.05));
    c.freqs('equal').forEach((f, i) => expect(Math.abs(f - [329.63, 415.30][i])).toBeLessThan(0.05));
    expect(Math.abs(c.freqs('just')[0] - c.freqs('equal')[0])).toBeLessThan(0.01);
  });

  it('R4: switching tuning never transposes the lowest voice', () => {
    for (const keys of [['C', 'G'], ['D', 'F#', 'A'], ['Bb', "C'"], ['E', 'G', "C'"]]) {
      const c = chordFromPianoKeys(keys);
      expect(Math.abs(c.freqs('just')[0] - c.freqs('equal')[0])).toBeLessThan(0.01);
    }
  });

  it('R4: custom 4:5:6 in 12-TET gives the nearest equal-tempered pitches [261.63, 329.63, 392.00]', () => {
    const c = parseCustomRatio('4:5:6').chord;
    c.freqs('equal').forEach((f, i) => expect(Math.abs(f - [261.63, 329.63, 392.0][i])).toBeLessThan(0.05));
    expect(new Set(c.freqs('equal').map(f => f.toFixed(2))).size).toBe(3);
  });
});

describe('R16 / G: custom ratio input (G2.8)', () => {
  it('R16: "4:6" is reduced to 2 : 3', () => {
    expect(parseCustomRatio('4:6').chord.meta.title).toBe('2 : 3');
    expect(parseCustomRatio('16 17 18').chord.meta.title).toBe('16 : 17 : 18');
  });

  it('R16: decimals, letters, zero and single numbers are rejected with a message', () => {
    for (const bad of ['1.5:2', 'abc', '0:3', '5', '3:-2']) {
      const r = parseCustomRatio(bad);
      expect(r.chord).toBeUndefined();
      expect(r.error).toMatch(/\w/);
    }
    expect(parseCustomRatio('1.5:2').error).toMatch(/whole numbers/i);
  });

  it('R16: up to 8 voices with 8 distinct colors; 9 are rejected', () => {
    const c = parseCustomRatio('8:9:10:11:12:13:14:15').chord;
    expect(c.size).toBe(8);
    expect(new Set(c.colors()).size).toBe(8);
    expect(VOICE_PALETTE.length).toBe(8);
    expect(parseCustomRatio('1:2:3:4:5:6:7:8:9').error).toMatch(/8/);
  });

  it('presets keep their exact ratios (dominant 7th uses the harmonic 7/4)', () => {
    expect(presetChord('dominant7').ratioInts()).toEqual([4, 5, 6, 7]);
    expect(presetChord('fifth').meta.title).toBe('3 : 2');
    expect(presetChord('octave').meta.title).toBe('2 : 1');
  });
});
