// The figure being drawn, derived each frame from the store and the clock: the voices' real
// frequencies for the active tuning, the time scale k, the phase accumulators and the
// non-degenerate offsets. Renderers only sample it (pointAt, sinesAt), so 2D, 3D, the clicks and
// the audio all follow the same clock.

import { PhaseModel, timeScale } from '../core/clock.js';
import { C4_HZ } from '../core/voices.js';
import { voiceOffsets, makeProjector, project } from '../render/lissajous.js';

// 0..100 slider -> Hz of a C4 root: 0 -> 0.2 Hz, 60 -> 30 Hz (rhythm / fusion), 100 -> 261.6 Hz.
export function sliderToHz(val) {
  if (val <= 60) return 0.2 * Math.pow(30.0 / 0.2, val / 60.0);
  return 30.0 * Math.pow(C4_HZ / 30.0, (val - 60.0) / 40.0);
}

/** Real frequencies of the current chord (manual chords are transposed by the speed slider). */
export function voiceFreqs(state) {
  const { chord } = state;
  const factor = chord.source === 'manual' ? sliderToHz(state.speedVal) / C4_HZ : 1;
  return chord.freqs(state.tuning).map(f => f * factor);
}

export function rootHz(state) {
  const f = voiceFreqs(state);
  return f.length ? f[0] : (state.chord.rootHz * sliderToHz(state.speedVal)) / C4_HZ;
}

export class Figure {
  constructor() {
    this.model = new PhaseModel();
    this.key = '';
    this.chordId = null;
    this.resetCount = 0;
    this.deltas = [];
    this.ratioInts = [];
    this.k = 1;
    this.projectors = {};
  }

  /** Re-anchor the phase model when anything that sets the motion changes. Returns true if it did. */
  sync(state, t) {
    const { chord } = state;
    const freqs = voiceFreqs(state);
    this.ratioInts = chord.ratioInts();
    this.k = freqs.length ? timeScale(freqs[0], this.ratioInts[0], state.tClose) : 1;
    this.deltas = voiceOffsets(this.ratioInts, state.phi);
    const key = `${chord.id}|${freqs.join(',')}|${this.k}|${state.phi}|${state.traceReset}`;
    if (key === this.key) return false;
    const reset = chord.id !== this.chordId || state.traceReset !== this.resetCount;
    this.model.configure({ freqs, k: this.k }, t, { reset });
    this.key = key;
    this.chordId = chord.id;
    this.resetCount = state.traceReset;
    this.resetVersion = reset ? this.model.version : this.resetVersion;
    return true;
  }

  get size() {
    return this.model.freqs.length;
  }

  projector(dims) {
    const key = `${this.size}x${dims}`;
    if (!this.projectors[key]) this.projectors[key] = makeProjector(this.size, dims);
    return this.projectors[key];
  }

  phasesAt(t) {
    return this.model.thetas(t).map((th, i) => th + (this.deltas[i] || 0));
  }

  /** Per-voice rail positions sin(θ_i + δ_i) in [-1, 1]. */
  sinesAt(t) {
    return this.phasesAt(t).map(Math.sin);
  }

  pointAt(t, dims) {
    return project(this.phasesAt(t), this.projector(dims));
  }

  /** Clock seconds of one closed period (exact in just intonation). */
  get period() {
    if (!this.size) return 1;
    return (2 * Math.PI * this.ratioInts[0]) / this.model.omega(0);
  }

  /** Clock times between t0 and t1 so that no voice moves more than maxStep rad per step. */
  substeps(t0, t1, maxStep = 0.05, cap = 600) {
    const wMax = Math.max(0, ...this.model.freqs.map((_, i) => this.model.omega(i)));
    const n = Math.max(1, Math.min(cap, Math.ceil((wMax * Math.abs(t1 - t0)) / maxStep)));
    const out = [];
    for (let s = 1; s <= n; s++) out.push(t0 + ((t1 - t0) * s) / n);
    return out;
  }
}
