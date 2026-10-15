// Turns bloom off automatically when rendering cannot keep up: if the average frame time over
// the last `window` frames stays above `limitMs` (25 ms ≈ 40 fps), bloom is disabled.

export class BloomGovernor {
  constructor({ limitMs = 25, window = 45 } = {}) {
    this.limitMs = limitMs;
    this.window = window;
    this.reset();
  }

  reset() {
    this.samples = new Float64Array(this.window); // ring buffer
    this.count = 0;
    this.next = 0;
    this.sum = 0;
    this.autoDisabled = false;
  }

  /** Record one frame time (ms). Returns false once bloom should be off. */
  record(ms) {
    if (this.autoDisabled) return false;
    if (this.count === this.window) this.sum -= this.samples[this.next];
    else this.count++;
    this.samples[this.next] = ms;
    this.sum += ms;
    this.next = (this.next + 1) % this.window;
    if (this.count === this.window && this.average() > this.limitMs) this.autoDisabled = true;
    return !this.autoDisabled;
  }

  average() {
    return this.count ? this.sum / this.count : 0;
  }
}
