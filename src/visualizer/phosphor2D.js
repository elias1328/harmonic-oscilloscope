// CRT phosphor for the 2D view.
//
// - Accumulation buffer: each frame only the new piece of the beam path is drawn, additively
//   ('lighter'), so overlapping laps build up brightness like real phosphor. The cost per frame
//   does not grow with the length of the trace.
// - Decay: the buffer is faded with 'destination-out' by 1 − exp(−dt/τ) (τ = persistence;
//   τ = ∞ keeps everything, as in Live Trace).
// - Ghost: the complete figure, drawn faintly on its own layer as soon as a chord appears.
// - Bloom: the buffer is drawn into a quarter-size canvas through a CSS blur filter and added
//   back on top (a cheap glow that does not depend on path length).

export const PERSISTENCE_INFINITE = 100;

/** Persistence slider (0–100) -> time constant τ in seconds (100 = ∞). */
export function persistenceTau(v) {
  return v >= PERSISTENCE_INFINITE ? Infinity : 0.05 * Math.pow(400, v / 100);
}

/** Fraction of the stored light removed over dt seconds. */
export function decayAlpha(dt, tau) {
  if (!(tau < Infinity) || dt <= 0) return 0;
  return 1 - Math.exp(-dt / tau);
}

const BLOOM_SCALE = 0.25;

export class Phosphor2D {
  constructor(createCanvas = () => document.createElement('canvas')) {
    this.buf = createCanvas();
    this.ghost = createCanvas();
    this.bloom = createCanvas();
    this.bctx = this.buf.getContext('2d');
    this.gctx = this.ghost.getContext('2d');
    this.blctx = this.bloom.getContext('2d');
    this.width = 0;
    this.height = 0;
    this.ghostKey = null;
    this.ghostLog = []; // { key, at } — when each ghost was drawn (e2e timing)
    this.lastDecay = 0;
  }

  resize(w, h, dpr = 1) {
    this.width = w;
    this.height = h;
    for (const [c, ctx] of [[this.buf, this.bctx], [this.ghost, this.gctx]]) {
      c.width = Math.max(1, Math.round(w * dpr));
      c.height = Math.max(1, Math.round(h * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    this.bloom.width = Math.max(1, Math.round(w * dpr * BLOOM_SCALE));
    this.bloom.height = Math.max(1, Math.round(h * dpr * BLOOM_SCALE));
    this.ghostKey = null;
  }

  clear() {
    this.bctx.clearRect(0, 0, this.width, this.height);
  }

  /** Fade the stored light for a time step dt (s) with persistence τ (s). Returns the alpha used. */
  decay(dt, tau) {
    const a = decayAlpha(dt, tau);
    this.lastDecay = a;
    if (a <= 0) return 0;
    const ctx = this.bctx;
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = `rgba(0, 0, 0, ${Math.min(1, a)})`;
    ctx.fillRect(0, 0, this.width, this.height);
    ctx.restore();
    return a;
  }

  /** Additive beam stroke along points [{x, y}] (CSS px): a coloured halo plus a hot core. */
  beam(points, color, { glow = 0.2, core = 0.32, width = 2.6 } = {}) {
    if (points.length < 2) return;
    const ctx = this.bctx;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineJoin = 'round';
    ctx.lineCap = 'butt';
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
    ctx.globalAlpha = glow;
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.stroke();
    ctx.globalAlpha = core;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = width * 0.45;
    ctx.stroke();
    ctx.restore();
  }

  /** Draw the faint ghost of the whole figure (only when its key changes). */
  setGhost(key, points, color, { alpha = 0.36, width = 3.2, core = 0.13 } = {}) {
    if (key === this.ghostKey) return false;
    this.ghostKey = key;
    const ctx = this.gctx;
    ctx.clearRect(0, 0, this.width, this.height);
    if (points && points.length > 1) {
      ctx.save();
      ctx.lineJoin = 'round';
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
      ctx.stroke();
      // a faint neutral core keeps the ghost equally visible whatever the voice colour
      ctx.globalAlpha = core;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = width * 0.4;
      ctx.stroke();
      ctx.restore();
    }
    this.ghostLog.push({ key, at: performance.now() });
    if (this.ghostLog.length > 400) this.ghostLog.splice(0, 200);
    return true;
  }

  clearGhost() {
    this.setGhost('none', null, '#000');
  }

  /** Composite ghost + buffer + bloom onto the display context (CSS px transform). */
  composite(ctx, { bloom = true, bloomStrength = 0.5 } = {}) {
    const w = this.width;
    const h = this.height;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(this.ghost, 0, 0, w, h);
    ctx.drawImage(this.buf, 0, 0, w, h);
    if (bloom) {
      const b = this.blctx;
      const bw = this.bloom.width;
      const bh = this.bloom.height;
      b.save();
      b.setTransform(1, 0, 0, 1, 0, 0);
      b.clearRect(0, 0, bw, bh);
      b.filter = 'blur(2px)';
      b.globalCompositeOperation = 'lighter';
      b.drawImage(this.buf, 0, 0, bw, bh);
      b.drawImage(this.ghost, 0, 0, bw, bh);
      b.restore();
      ctx.globalAlpha = bloomStrength;
      ctx.drawImage(this.bloom, 0, 0, w, h);
    }
    ctx.restore();
  }
}
