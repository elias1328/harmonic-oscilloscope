// R8/R9 (G2.2–G2.4): the shared Lissajous geometry in src/render/lissajous.js.
// No inline copies of the curve formula: every point comes from the module under test.
import { describe, it, expect } from 'vitest';
import { closedCurve, voiceOffsets, midpointOffset, makeProjector, project } from '../src/render/lissajous.js';
import { INTERVALS_SIMPLEST_FIRST, CHORD_PRESETS } from '../src/math/harmonics.js';
import { chordFromPreset, parseCustomRatio } from '../src/core/voices.js';

const PHIS = Array.from({ length: 20 }, (_, i) => (2 * Math.PI * i) / 20);
const N = 2048;

// min over shifts s of max_t ‖p(s−t) − p(t)‖ over one closed period (0 = the curve retraces).
function retraceMetric(pts) {
  const n = pts.length - 1; // last point repeats the first
  let best = Infinity;
  for (let s = 0; s < n; s++) {
    let mx = 0;
    for (let t = 0; t < n; t++) {
      const q = pts[(((s - t) % n) + n) % n];
      const p = pts[t];
      let d = 0;
      for (let j = 0; j < p.length; j++) d += (q[j] - p[j]) ** 2;
      d = Math.sqrt(d);
      if (d > mx) { mx = d; if (mx >= best) break; }
    }
    if (mx < best) best = mx;
  }
  return best;
}

const intervalRatios = INTERVALS_SIMPLEST_FIRST.map(i => ({ name: `${i.name} ${i.ratio[0]}:${i.ratio[1]}`, ints: [i.ratio[1], i.ratio[0]] }));
const presetRatios = CHORD_PRESETS.map(p => ({ name: p.id, ints: chordFromPreset(p).ratioInts() }));

describe('R8: no retracing (G2.3)', () => {
  it('R8: δ₀ formula is midway between degenerate phases (metric 0 at a degenerate phase)', () => {
    // a:b = 1:2 (octave). Degenerate phases: (π/2)(1 − b/a) + jπ/a.
    const degenerate = closedCurve([1, 2], [0, (Math.PI / 2) * (1 - 2) + Math.PI], 2, 512);
    expect(retraceMetric(degenerate)).toBeLessThan(1e-9);
    expect(midpointOffset(1, 2)).toBeCloseTo(0, 12);
    expect(midpointOffset(2, 3)).toBeCloseTo((Math.PI / 2) * (1 - 1.5) + Math.PI / 4, 12);
    expect(midpointOffset(2, 4)).toBeCloseTo(midpointOffset(1, 2), 12); // reduced by gcd
  });

  for (const { name, ints } of [...intervalRatios, ...presetRatios]) {
    it(`R8: ${name} never retraces at 20 φ values (2D${ints.length > 2 ? ' and 3D' : ''})`, () => {
      for (const dims of ints.length > 2 ? [2, 3] : [2]) {
        for (const phi of PHIS) {
          const m = retraceMetric(closedCurve(ints, voiceOffsets(ints, phi), dims, N));
          expect(m, `${dims}D φ=${phi.toFixed(3)}`).toBeGreaterThan(0.05);
        }
      }
    });
  }

  it('R8: the 2:1 octave passes through the origin twice (a figure-8)', () => {
    const pts = closedCurve([1, 2], voiceOffsets([1, 2], 0), 2, N).slice(0, N);
    const nearOrigin = pts.map((p, i) => ({ i, r: Math.hypot(p[0], p[1]) })).filter(p => p.r < 1e-9);
    expect(nearOrigin.length).toBe(2);
    expect(Math.abs(nearOrigin[1].i - nearOrigin[0].i)).toBe(N / 2);
  });

  it('R8: coordinates stay normalized to [-1, 1]', () => {
    for (const { ints } of presetRatios) {
      for (const dims of [2, 3]) {
        const pts = closedCurve(ints, voiceOffsets(ints, 1), dims, 512);
        pts.forEach(p => p.forEach(c => expect(Math.abs(c)).toBeLessThanOrEqual(1 + 1e-12)));
      }
    }
  });
});

describe('R9: closure in just intonation (G2.4)', () => {
  const custom4567 = parseCustomRatio('4:5:6:7').chord.ratioInts();
  const eight = parseCustomRatio('8:9:10:11:12:13:14:15').chord.ratioInts();
  const cases = [...intervalRatios, ...presetRatios, { name: 'custom 4:5:6:7', ints: custom4567 }, { name: '8 voices', ints: eight }];

  it('R9: ‖p(T) − p(0)‖ < 1e-9 for every preset, interval, custom 4:5:6:7 and an 8-voice chord', () => {
    expect(eight.length).toBe(8);
    for (const { name, ints } of cases) {
      for (const dims of [2, 3]) {
        for (const phi of [0, 1.3]) {
          const pts = closedCurve(ints, voiceOffsets(ints, phi), dims, 64);
          const gap = Math.hypot(...pts[64].map((c, j) => c - pts[0][j]));
          expect(gap, `${name} ${dims}D`).toBeLessThan(1e-9);
        }
      }
    }
  });

  it('R9: no non-integer factors: every voice of a 3-note chord completes whole cycles per period', () => {
    const ints = [4, 5, 6];
    const proj = makeProjector(3, 2);
    const deltas = voiceOffsets(ints, 0);
    const p0 = project(ints.map((r, i) => deltas[i]), proj);
    const pT = project(ints.map((r, i) => r * 2 * Math.PI + deltas[i]), proj);
    expect(Math.hypot(pT[0] - p0[0], pT[1] - p0[1])).toBeLessThan(1e-9);
  });
});
