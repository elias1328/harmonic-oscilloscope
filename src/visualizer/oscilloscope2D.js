// 2D oscilloscope. The beam path goes through the CRT phosphor (phosphor2D.js): a faint ghost of
// the complete figure appears at once, and the bright live trace draws over it at the true
// (slowed) speed. This file adds the cheap overlay: rails with gliding orbs (voice 0 on top,
// voice 1 on the left), dashed guides, the tracer head and the X-Y graticule.
// Points come from the shared figure model (src/app/figure.js on src/render/lissajous.js).

import { makeProjector, project } from '../render/lissajous.js';
import { Phosphor2D } from './phosphor2D.js';

export class Oscilloscope2D {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.phosphor = new Phosphor2D();
    this.width = canvas.width;
    this.height = canvas.height;
    this.lastT = null;
    this.traceKey = null;
    this.fullKey = null;
  }

  clearPath() {
    this.phosphor.clear();
    this.lastT = null;
    this.fullKey = null;
  }

  resize(w, h) {
    const dpr = window.devicePixelRatio || 1;
    this.width = w;
    this.height = h;
    this.canvas.width = w * dpr;
    this.canvas.height = h * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.phosphor.resize(w, h, dpr);
    this.clearPath();
  }

  // Free area of the window (CSS px) not covered by the panel, header, player bar or strip.
  setSafeArea(area) {
    this.safeArea = area;
  }

  // Scope centre and half-size, fitted into the safe area when it is usable. Phosphor content is
  // in pixels, so a geometry change restarts it.
  layout(windowFactor) {
    const a = this.safeArea;
    let g;
    if (a && a.right - a.left > 160 && a.bottom - a.top > 160) {
      const aw = a.right - a.left;
      const ah = a.bottom - a.top;
      g = { centerX: a.left + aw * 0.5, centerY: a.top + ah * 0.5, halfScope: Math.min(aw, ah) * 0.5 * 0.84 };
    } else {
      g = { centerX: this.width * 0.52, centerY: this.height * 0.54, halfScope: Math.min(this.width, this.height) * windowFactor * 0.5 };
    }
    const prev = this.lastLayout;
    if (prev && (Math.abs(prev.centerX - g.centerX) > 0.5 || Math.abs(prev.centerY - g.centerY) > 0.5 || Math.abs(prev.halfScope - g.halfScope) > 0.5)) {
      this.clearPath();
      this.phosphor.ghostKey = null;
    }
    this.lastLayout = g;
    g.key = `${g.centerX.toFixed(1)},${g.centerY.toFixed(1)},${g.halfScope.toFixed(1)}`;
    return g;
  }

  /**
   * frame: { figure, t (clock s), drawMode, labels, colors, persistence (τ s), bloom,
   *          xy: { segment, head } | null }
   */
  render(frame) {
    const ctx = this.ctx;
    ctx.fillStyle = '#08090c';
    ctx.fillRect(0, 0, this.width, this.height);
    const mode = frame.xy ? 'xy' : 'figure';
    if (mode !== this.mode) {
      this.mode = mode;
      this.clearPath();
      this.phosphor.ghostKey = null;
    }
    if (frame.xy) {
      this.renderXY(frame);
      return;
    }

    const { figure, t, drawMode, labels, colors } = frame;
    const n = figure.size;
    if (!n) {
      this.phosphor.clearGhost();
      this.clearPath();
      this.phosphor.composite(ctx, { bloom: false });
      return;
    }
    const L = this.layout(0.65);
    const R = L.halfScope * 0.85;
    const toPx = (p) => ({ x: L.centerX + p[0] * R, y: L.centerY + p[1] * R });
    const traceColor = n > 1 ? (colors[1] || '#ff9f43') : (colors[0] || '#ff5376');
    const ph = this.phosphor;

    // Ghost: the complete figure. Just intonation: the exact closed period (fixed). 12-TET: the
    // current, slowly precessing shape (one nominal period from the current phases).
    const ghostKey = figure.closed ? `${figure.key}|${L.key}` : `${figure.key}|${L.key}|${Math.floor(t * 10)}`;
    if (ghostKey !== ph.ghostKey) ph.setGhost(ghostKey, this.periodPoints(figure, t, toPx), traceColor);

    const reset = figure.resetVersion !== this.traceKey || this.lastT === null || t < this.lastT;
    if (reset) {
      this.traceKey = figure.resetVersion;
      ph.clear();
      this.fullKey = null;
    }
    if (drawMode === 'full' && figure.closed) {
      // Full Loop: the exact closed period, at full brightness
      if (this.fullKey !== ghostKey) {
        ph.clear();
        ph.beam(this.periodPoints(figure, t, toPx), traceColor, { glow: 0.55, core: 0.75, width: 3 });
        this.fullKey = ghostKey;
      }
    } else {
      this.fullKey = null;
      // Live Trace keeps everything (τ = ∞); Full Loop in 12-TET has no closed period, so it
      // shows the precessing figure with long persistence instead.
      const tau = drawMode === 'live' ? Infinity : frame.persistence;
      const t0 = reset ? t : this.lastT;
      ph.decay(t - t0, tau);
      // only the new piece of the path, sub-stepped analytically (≤ 0.03 rad per step, ≤ 1 period)
      const from = Math.max(t0, t - figure.period);
      const pts = [toPx(figure.pointAt(from, 2))];
      for (const ts of figure.substeps(from, t, 0.03, 6000)) pts.push(toPx(figure.pointAt(ts, 2)));
      // dense ratios lay down many more overlapping laps: dim the beam so they stay readable
      const density = Math.min(1, 4 / Math.sqrt(figure.ratioInts.reduce((s, r) => s + r, 0)));
      ph.beam(pts, traceColor, { glow: 0.2 * density, core: 0.32 * density });
    }
    this.lastT = t;
    ph.composite(ctx, { bloom: frame.bloom !== false });

    this.drawOverlay(ctx, figure, t, L, R, toPx, labels, colors);
  }

  /** One period of the figure from the current phases (closed in just intonation). */
  periodPoints(figure, t, toPx) {
    const n = figure.size;
    const steps = Math.min(4000, Math.max(1200, figure.ratioInts.reduce((s, r) => s + r, 0) * 50));
    const proj = makeProjector(n, 2);
    const th0 = figure.phasesAt(t);
    const w = figure.model.freqs.map((_, i) => figure.model.omega(i));
    const T = figure.period;
    const pts = [];
    for (let i = 0; i <= steps; i++) {
      const dt = (T * i) / steps;
      pts.push(toPx(project(th0.map((p, j) => p + w[j] * dt), proj)));
    }
    return pts;
  }

  drawOverlay(ctx, figure, t, L, R, toPx, labels, colors) {
    const n = figure.size;
    const { centerX, centerY, halfScope } = L;
    const head = toPx(figure.pointAt(t, 2));
    const sines = figure.sinesAt(t);
    const railTop = centerY - halfScope;
    const railLeft = centerX - halfScope;
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 120, 150, 0.22)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(centerX - R, railTop);
    ctx.lineTo(centerX + R, railTop);
    ctx.moveTo(centerX, railTop - 5);
    ctx.lineTo(centerX, railTop + 5);
    ctx.stroke();
    if (n > 1) {
      ctx.strokeStyle = 'rgba(255, 160, 80, 0.22)';
      ctx.beginPath();
      ctx.moveTo(railLeft, centerY - R);
      ctx.lineTo(railLeft, centerY + R);
      ctx.moveTo(railLeft - 5, centerY);
      ctx.lineTo(railLeft + 5, centerY);
      ctx.stroke();
    }
    if (n <= 2) {
      // with two voices the orbs project exactly onto the tracer: show the guides
      ctx.setLineDash([4, 5]);
      ctx.lineWidth = 1.0;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
      ctx.beginPath();
      ctx.moveTo(head.x, railTop);
      ctx.lineTo(head.x, head.y);
      if (n > 1) {
        ctx.moveTo(railLeft, head.y);
        ctx.lineTo(head.x, head.y);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }
    this.drawGlowingOrb(ctx, centerX + sines[0] * R, railTop, colors[0] || '#ff5376', 6, labels[0] || '', 'top');
    if (n > 1) this.drawGlowingOrb(ctx, railLeft, centerY + sines[1] * R, colors[1] || '#ff9f43', 6, labels[1] || '', 'left');

    // Tracer head: a small hot spot (radial gradient, no blur)
    const g = ctx.createRadialGradient(head.x, head.y, 0, head.x, head.y, 14);
    g.addColorStop(0, 'rgba(255, 255, 255, 1)');
    g.addColorStop(0.25, 'rgba(255, 245, 230, 0.9)');
    g.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(head.x, head.y, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // X-Y vectorscope through the same phosphor: each frame adds only the samples played since the
  // previous frame; persistence sets how long the trace glows.
  renderXY(frame) {
    const ctx = this.ctx;
    const ph = this.phosphor;
    const { centerX, centerY, halfScope } = this.layout(0.68);
    const R = halfScope * 0.85;
    if (ph.ghostKey !== 'none') {
      ph.clearGhost();
      ph.clear();
    }
    const t = frame.t;
    ph.decay(this.lastT === null ? 0 : Math.max(0, t - this.lastT), frame.persistence);
    this.lastT = t;
    const seg = frame.xy.segment || [];
    if (seg.length > 1) {
      ph.beam(seg.map(p => ({ x: centerX + p.x * R, y: centerY - p.y * R })), '#2ecc71', { glow: 0.16, core: 0.2, width: 2.4 });
    }
    // Graticule under the glow
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.07)';
    ctx.lineWidth = 1;
    [0.25, 0.5, 0.75, 1.0].forEach(r => {
      ctx.beginPath();
      ctx.arc(centerX, centerY, halfScope * 0.88 * r, 0, Math.PI * 2);
      ctx.stroke();
    });
    ctx.beginPath();
    ctx.moveTo(centerX - halfScope * 0.88, centerY);
    ctx.lineTo(centerX + halfScope * 0.88, centerY);
    ctx.moveTo(centerX, centerY - halfScope * 0.88);
    ctx.lineTo(centerX, centerY + halfScope * 0.88);
    ctx.stroke();
    ctx.font = '11px "Space Grotesk", sans-serif';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.textAlign = 'right';
    ctx.fillText('CH 1: LEFT [X]', centerX + halfScope * 0.88, centerY + 14);
    ctx.textAlign = 'center';
    ctx.fillText('CH 2: RIGHT [Y]', centerX, centerY - halfScope * 0.88 - 8);
    ctx.restore();
    ph.composite(ctx, { bloom: frame.bloom !== false });

    const head = frame.xy.head;
    if (head) {
      const x = centerX + head.x * R;
      const y = centerY - head.y * R;
      const g = ctx.createRadialGradient(x, y, 0, x, y, 9);
      g.addColorStop(0, 'rgba(255, 255, 255, 1)');
      g.addColorStop(0.35, 'rgba(168, 255, 120, 0.7)');
      g.addColorStop(1, 'rgba(46, 204, 113, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, 9, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  drawGlowingOrb(ctx, x, y, color, radius, label, position) {
    // Ambient bloom
    ctx.save();
    ctx.shadowBlur = 16;
    ctx.shadowColor = color;

    // White core
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();

    // Colored halo
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, radius * 0.7, 0, Math.PI * 2);
    ctx.fill();

    // Label
    ctx.shadowBlur = 6;
    ctx.shadowColor = color;
    ctx.fillStyle = color;
    ctx.font = 'bold 15px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    if (position === 'top') {
      ctx.fillText(label, x + 18, y - 14);
    } else {
      ctx.fillText(label, x - 18, y + 18);
    }
    ctx.restore();
  }
}
