// Ported from Agent/tests/unit.test.mjs (pitchDetector.js section).
import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { autoCorrelate, freqToMidi } from '../src/audio/pitchDetector.js';
import { NOTE_COLORS, NOTE_NAMES } from '../src/math/harmonics.js';

function sine(freq, sr = 44100, n = 1024, amp = 0.5) {
  const b = new Float32Array(n);
  for (let i = 0; i < n; i++) b[i] = amp * Math.sin(2 * Math.PI * freq * i / sr);
  return b;
}

describe('pitchDetector.js', () => {
  for (const f of [110, 220, 261.63, 440, 880, 1500]) {
    it(`autoCorrelate detects ${f} Hz within 1%`, () => {
      const d = autoCorrelate(sine(f), 44100);
      assert.ok(Math.abs(d - f) / f < 0.01, `got ${d}`);
    });
  }

  it('autoCorrelate silence -> -1', () => {
    assert.equal(autoCorrelate(new Float32Array(1024), 44100), -1);
  });

  it('autoCorrelate low frequency (50 Hz) in a 1024-sample window', () => {
    const d = autoCorrelate(sine(50), 44100);
    // 1024 samples = 23 ms ~ 1.16 periods; the Agent original only recorded the result.
    // Documenting the known coarse reading (~53 Hz) without demanding accuracy.
    assert.ok(d === -1 || (d > 40 && d < 70), `got ${d}`);
  });

  it('freqToMidi', () => {
    assert.deepEqual(freqToMidi(440), { midi: 69, name: 'A4', pitchClass: 'A', octave: 4, cents: 0 });
    assert.equal(freqToMidi(261.6256).name, 'C4');
    assert.equal(freqToMidi(0), null);
    assert.equal(freqToMidi(450).cents, 39);
  });

  // Agent original documented the mismatch (asserted 'C#' and an undefined color).
  // Inverted here to assert the correct behaviour required by R21.
  it('R21: freqToMidi uses the app-wide flat naming (Db, not C#) so NOTE_COLORS lookups hit', () => {
    const pc = freqToMidi(277.18).pitchClass;
    assert.equal(pc, 'Db');
    assert.ok(NOTE_NAMES.includes(pc));
    assert.ok(NOTE_COLORS[pc], 'color lookup must hit');
    assert.equal(freqToMidi(277.18).name, 'Db4');
  });
});
