// Lissajous geometry shared by the 2D lab, the 3D view and the matrix (pure functions).
//
// Voice i is the coordinate x_i = sin(θ_i + δ_i), where θ_i is its phase accumulator
// (θ_i = 2π f_i k t). For N voices the point is the projection Σ dir_i · x_i onto 2D or 3D with
// fixed, evenly spread unit directions: voices 0/1/2 on the X/Y/Z axes, voices 3+ on diagonals.
//
// Non-degenerate offsets. For a pair x = sin(aθ), y = sin(bθ + δ) with a:b coprime, the curve
// retraces itself (an open arc drawn back and forth) exactly when δ = (π/2)(1 − b/a) + jπ/a.
// δ₀ = (π/2)(1 − b/a) + π/(2a) sits midway between two such phases, so the octave draws a
// figure-8 and 4:3, 6:5, 8:5 and 16:15 draw closed loops.
//
// The user phase φ is added on top: δ = δ₀ + φ over the full 0–2π range. At φ = 0 every figure
// is at its clearest; sweeping φ passes through the degenerate phases, where the curve really
// does collapse into a retraced arc for an instant (true physics, not hidden).

import { gcd } from '../core/fraction.js';

const DIRS_2D = [
  [1, 0], [0, 1],
  [Math.SQRT1_2, Math.SQRT1_2], [Math.SQRT1_2, -Math.SQRT1_2],
  [Math.cos(Math.PI / 8), Math.sin(Math.PI / 8)], [Math.cos(3 * Math.PI / 8), Math.sin(3 * Math.PI / 8)],
  [Math.cos(5 * Math.PI / 8), Math.sin(5 * Math.PI / 8)], [Math.cos(7 * Math.PI / 8), Math.sin(7 * Math.PI / 8)]
];
const S3 = 1 / Math.sqrt(3);
const DIRS_3D = [
  [1, 0, 0], [0, 1, 0], [0, 0, 1],
  [S3, S3, S3], [S3, -S3, S3], [-S3, S3, S3], [S3, S3, -S3], [S3, -S3, -S3]
];

/** Midway non-degenerate offset of a voice with b cycles against a root with a cycles. */
export function midpointOffset(a, b) {
  const g = gcd(a, b) || 1;
  const A = a / g;
  const B = b / g;
  return (Math.PI / 2) * (1 - B / A) + Math.PI / (2 * A);
}

/** δ_i for every voice (root δ_0 = 0), from the nominal integer ratio and the user phase φ. */
export function voiceOffsets(ratioInts, phi = 0) {
  const a = ratioInts[0];
  return ratioInts.map((b, i) => (i === 0 ? 0 : midpointOffset(a, b) + phi));
}

/** Projection for n voices into `dims` (2 or 3) dimensions, normalized to [-1, 1]. */
export function makeProjector(n, dims) {
  const table = dims === 3 ? DIRS_3D : DIRS_2D;
  const dirs = [];
  for (let i = 0; i < n; i++) {
    // a single voice is a 1D oscillation along X
    dirs.push(table[i % table.length]);
  }
  const scale = new Array(dims).fill(0);
  dirs.forEach(d => d.forEach((c, j) => { scale[j] += Math.abs(c); }));
  return { dirs, scale, dims };
}

/** Point for the given total phases (θ_i + δ_i). */
export function project(phases, proj, out = new Array(proj.dims)) {
  out.fill(0);
  for (let i = 0; i < phases.length; i++) {
    const s = Math.sin(phases[i]);
    const d = proj.dirs[i];
    for (let j = 0; j < proj.dims; j++) out[j] += d[j] * s;
  }
  for (let j = 0; j < proj.dims; j++) out[j] = proj.scale[j] ? out[j] / proj.scale[j] : 0;
  return out;
}

/** Point at accumulator phases θ_i with offsets δ_i. */
export function pointAt(thetas, deltas, proj) {
  return project(thetas.map((t, i) => t + deltas[i]), proj);
}

/**
 * One closed period of a just-intonation chord: θ_i = ratioInts[i]·τ for τ ∈ [0, 2π].
 * Returns N + 1 points (the last equals the first).
 */
export function closedCurve(ratioInts, deltas, dims, N = 2048) {
  const proj = makeProjector(ratioInts.length, dims);
  const pts = [];
  for (let s = 0; s <= N; s++) {
    const tau = (2 * Math.PI * s) / N;
    pts.push(project(ratioInts.map((r, i) => r * tau + deltas[i]), proj));
  }
  return pts;
}
