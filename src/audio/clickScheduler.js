// Polyrhythm clicks with the "two clocks" lookahead pattern: a 25 ms timer schedules every click
// due in the next 100 ms with osc.start(exactTime) on the audio clock. Click times are the exact
// extrema of each voice (θ_i + δ_i = π/2 + nπ), computed analytically from the phase model, so
// a click lands exactly when the orb reaches the end of its rail.

import { REAL_TIME_MAX_HZ } from '../core/clock.js';

const CLICK_FADE_START_HZ = 20;

export class ClickScheduler {
  constructor({ engine, clock, model, getDeltas, getRootHz, lookahead = 0.1, interval = 0.025 }) {
    Object.assign(this, { engine, clock, model, getDeltas, getRootHz, lookahead, interval });
    this.scheduledUntil = null; // audio time up to which clicks are scheduled
    this.pending = []; // { osc, when }
    this.timer = null;
  }

  start() {
    if (!this.timer) this.timer = setInterval(() => this.tick(), this.interval * 1000);
  }

  stop() {
    clearInterval(this.timer);
    this.timer = null;
    this.invalidate();
  }

  /** Parameters changed: cancel clicks not yet played and plan again from now. */
  invalidate() {
    const ctx = this.engine.ctx;
    const now = ctx ? ctx.currentTime : 0;
    this.pending.forEach(p => {
      if (p.when > now) {
        try { p.osc.stop(); } catch { /* already stopped */ }
      }
    });
    this.pending = [];
    this.scheduledUntil = null;
  }

  tick() {
    const ctx = this.engine.ctx;
    if (!ctx || this.engine.isMuted) return;
    const hz = this.getRootHz();
    if (!(hz > 0) || hz >= REAL_TIME_MAX_HZ) return;
    const gainScale = hz > CLICK_FADE_START_HZ ? 1 - (hz - CLICK_FADE_START_HZ) / (REAL_TIME_MAX_HZ - CLICK_FADE_START_HZ) : 1;

    const now = ctx.currentTime;
    this.pending = this.pending.filter(p => p.when > now);
    const from = Math.max(this.scheduledUntil ?? now, now);
    const to = now + this.lookahead;
    if (to <= from) return;

    const deltas = this.getDeltas();
    const t0 = from - this.clock.offset; // audio time -> clock time
    const t1 = to - this.clock.offset;
    this.model.freqs.forEach((_, i) => {
      for (const t of this.model.extremaTimes(i, deltas[i] || 0, t0, t1)) {
        const when = this.clock.toSource(t);
        const osc = this.engine.scheduleClick(i, when, gainScale);
        if (osc) this.pending.push({ osc, when });
      }
    });
    this.scheduledUntil = to;
  }
}
