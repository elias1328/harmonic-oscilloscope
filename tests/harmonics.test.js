// Ported from Agent/tests/unit.test.mjs (harmonics.js + Lissajous geometry sections).
// Tests named "BUG:" assert the CORRECT behaviour (all fixed as of Phase 2).
import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { noteNameToSemitone, identifyChord, INTERVALS_BY_SEMITONE, INTERVALS_SIMPLEST_FIRST, CHORD_PRESETS } from '../src/math/harmonics.js';
import { gcd, reduce, Fraction } from '../src/core/fraction.js';
import { chordFromPreset } from '../src/core/voices.js';

describe('harmonics.js', () => {
  // simplifyRatio / semitoneToEqualTemperament were removed (R29); same checks on their replacements.
  it('gcd / reduce', () => {
    assert.equal(gcd(12, 8), 4);
    assert.deepEqual(reduce(4, 6), [2, 3]);
    assert.deepEqual(reduce(45, 32), [45, 32]);
  });

  it('reduce(0,0) is rejected (was NaN with simplifyRatio)', () => {
    assert.throws(() => reduce(0, 0), RangeError);
    assert.throws(() => new Fraction(1, 0), RangeError);
  });

  it('12-TET multiplier (chord frequencies in equal temperament)', () => {
    const octave = chordFromPreset(CHORD_PRESETS.find(p => p.id === 'octave')).freqs('equal');
    assert.equal(octave[1] / octave[0], 2);
    const fifth = chordFromPreset(CHORD_PRESETS[0]).freqs('equal');
    assert.ok(Math.abs(fifth[1] / fifth[0] - 1.4983) < 1e-4);
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

  // Presets are now Chords of Voices: the displayed ratioInts and the sounding JI ratios come
  // from the same fractions (the old parallel notes/ratios/ratioInts/colors arrays are gone).
  it('CHORD_PRESETS: ratios equal ratioInts normalized to root', () => {
    for (const p of CHORD_PRESETS) {
      const c = chordFromPreset(p);
      const ints = c.ratioInts();
      assert.equal(c.size, p.labels.length, p.id);
      assert.equal(ints.length, c.size, p.id);
      assert.equal(c.colors().length, c.size, p.id);
      ints.forEach((r, i) => {
        assert.ok(Math.abs(r / ints[0] - c.voices[i].ji.value) < 1e-9, `${p.id}[${i}]`);
      });
    }
  });

  it('R19: dissonance preset ratioInts agree with its ratios 1 : 16/15 : 9/8 (= 120:128:135)', () => {
    const c = chordFromPreset(CHORD_PRESETS.find(p => p.id === 'dissonance'));
    const ints = c.ratioInts();
    assert.deepEqual(ints, [120, 128, 135]);
    ints.forEach((r, i) => {
      assert.ok(Math.abs(r / ints[0] - c.voices[i].ji.value) < 1e-9, `index ${i}: ${r / ints[0]} vs ${c.voices[i].ji.value}`);
    });
    assert.equal(c.meta.title, '120 : 128 : 135');
  });

  // identifyChordFromIntervals was replaced by identifyChord (absolute semitones / MIDI numbers).
  it('identifyChord: known chords', () => {
    assert.equal(identifyChord([0, 4, 7]).title, '4 : 5 : 6');
    assert.equal(identifyChord([0, 3, 7]).title, '10 : 12 : 15');
    assert.equal(identifyChord([0, 4, 7, 10]).title, '4 : 5 : 6 : 7');
    // R19: the cluster label now matches its JI ratios 1 : 16/15 : 9/8 (was 15 : 16 : 17)
    assert.equal(identifyChord([0, 1, 2]).title, '120 : 128 : 135');
  });

  it('R7 BUG: identifyChord is order/duplicate insensitive (C-G-E voicing, doubled root)', () => {
    // MIDI path passes (midi - root) % 12 unsorted & with duplicates, e.g. C4 G4 E5 -> [0,7,4]
    assert.equal(identifyChord([0, 7, 4]).category, 'A MAJOR CHORD');
  });

  it('R7 BUG: C-E-G-C (doubled octave, demo final chord via %12) -> [0,4,7,0] recognized', () => {
    assert.equal(identifyChord([0, 4, 7, 0]).category, 'A MAJOR CHORD');
  });

  // The Agent original asserted the old buggy fallback ([0,4,7,12] -> CUSTOM 12:15:18:24).
  // G2.7 requires C-E-G-C' to be recognised as 4 : 5 : 6; the fallback is tested separately.
  it('R7: C-E-G-C\' (octave doubling) is the major chord 4 : 5 : 6', () => {
    const r = identifyChord([0, 4, 7, 12]);
    assert.deepEqual(r.ratioInts, [4, 5, 6]);
    assert.equal(r.category, 'A MAJOR CHORD');
  });
});

// ---------- Phase 1 ----------
describe('Phase 1: harmonics helpers', async () => {
  const { intervalNotes, PIANO_KEY_NAMES } = await import('../src/math/harmonics.js');
  const { chordFromPianoKeys, parseCustomRatio, presetChord } = await import('../src/core/voices.js');
  const pianoSelectionFromNotes = (keys) => chordFromPianoKeys(keys).pianoKeys();

  it("R13: the Octave interval loads C + C' (not C + C)", () => {
    const octave = INTERVALS_SIMPLEST_FIRST.find(i => i.name === 'Octave');
    assert.deepEqual(intervalNotes(octave), ['C', "C'"]);
    for (const i of INTERVALS_SIMPLEST_FIRST) {
      const notes = intervalNotes(i);
      assert.equal(new Set(notes).size, 2, i.name);
      assert.equal(noteNameToSemitone(notes[1]) - noteNameToSemitone(notes[0]), i.semitones, i.name);
    }
  });

  it('H: tritone text says 45/32 ≈ 1.406 is close to, but not equal to, √2', () => {
    const t = INTERVALS_SIMPLEST_FIRST.find(i => i.name === 'Tritone');
    assert.doesNotMatch(t.description, /exactly bisects/i);
    assert.match(t.description, /1\.406/);
    assert.match(t.description, /√2/);
    assert.match(t.description, /not/i);
  });

  it('R22: piano selection is derived from the current voices', () => {
    assert.deepEqual(pianoSelectionFromNotes(['C', 'E', 'G']), ['C', 'E', 'G']);
    assert.deepEqual(parseCustomRatio('4:5:6').chord.pianoKeys(), [], 'custom ratios select no keys');
    assert.deepEqual(presetChord('major_triad').pianoKeys(), ['C', 'E', 'G']);
    assert.deepEqual(pianoSelectionFromNotes(['C', 'E', 'G', 'C']), ['C', 'E', 'G'], 'duplicates collapse');
    assert.deepEqual(pianoSelectionFromNotes(['C', "C'"]), ['C', "C'"]);
    assert.deepEqual(pianoSelectionFromNotes([]), []);
    assert.ok(PIANO_KEY_NAMES.includes("C'") && PIANO_KEY_NAMES.length === 13);
  });
});
