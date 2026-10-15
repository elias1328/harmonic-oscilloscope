// One clock for audio and visuals, and the per-voice phase accumulators.
//
// Clock time follows its source (AudioContext.currentTime once audio is unlocked, otherwise
// performance.now) minus an offset. Each animation frame calls tick(): a stall longer than
// MAX_FRAME_DT (backgrounded tab, debugger) is absorbed into the offset so the figure never
// jumps, and switching sources re-anchors so the clock is continuous. toSource() maps clock time
// back to the source, which is how the click scheduler lands clicks on the audio clock.

export const MAX_FRAME_DT = 0.1;
export const REAL_TIME_MAX_HZ = 30;

export class Clock {
  constructor(source) {
    this.source = source;
    this.offset = 0;
    this.lastReal = null;
  }

  setSource(source) {
    const t = this.now();
    this.source = source;
    this.offset = source() - t;
    this.lastReal = null;
  }

  tick() {
    const real = this.source();
    if (this.lastReal !== null) {
      const d = real - this.lastReal;
      if (d > MAX_FRAME_DT) this.offset += d - MAX_FRAME_DT;
      if (d < 0) this.offset += d; // never run backwards
    }
    this.lastReal = real;
    return this.now();
  }

  now() {
    return this.source() - this.offset;
  }

  toSource(t) {
    return t + this.offset;
  }
}

/**
 * Time scale k. Real time (k = 1) while the root is at most 30 Hz, so clicks and picture match.
 * Above, slow motion: one closed period of the chord (rootCycles / rootHz seconds) lasts tClose.
 */
export function timeScale(rootHz, rootCycles, tClose) {
  if (!(rootHz > 0)) return 1;
  if (rootHz <= REAL_TIME_MAX_HZ) return 1;
  return rootCycles / (rootHz * tClose);
}

/**
 * Phase accumulators θ_i, advancing at 2π·f_i·k. Piecewise linear in clock time: every change of
 * frequencies or k re-anchors at the current time, keeping the phases continuous.
 */
export class PhaseModel {
  constructor() {
    this.freqs = [];
    this.k = 1;
    this.anchorT = 0;
    this.anchorTheta = [];
    this.version = 0;
  }

  configure({ freqs, k }, t, { reset = false } = {}) {
    const thetas = reset ? freqs.map(() => 0) : freqs.map((_, i) => (i < this.freqs.length ? this.theta(i, t) : 0));
    this.freqs = [...freqs];
    this.k = k;
    this.anchorT = t;
    this.anchorTheta = thetas;
    this.version++;
  }

  omega(i) {
    return 2 * Math.PI * this.freqs[i] * this.k;
  }

  theta(i, t) {
    return this.anchorTheta[i] + this.omega(i) * (t - this.anchorT);
  }

  thetas(t) {
    return this.freqs.map((_, i) => this.theta(i, t));
  }

  /** Clock times in [t0, t1) where θ_i + δ = π/2 + nπ (voice i at an extreme of its rail). */
  extremaTimes(i, delta, t0, t1) {
    const w = this.omega(i);
    if (!(w > 0)) return [];
    const base = this.anchorTheta[i] + delta - Math.PI / 2;
    const nStart = Math.ceil((base + w * (t0 - this.anchorT)) / Math.PI);
    const out = [];
    for (let n = nStart; ; n++) {
      const t = this.anchorT + (n * Math.PI - base) / w;
      if (t >= t1) break;
      if (t >= t0) out.push(t);
    }
    return out;
  }
}
