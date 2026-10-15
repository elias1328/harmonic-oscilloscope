// 2D oscilloscope: rails with gliding orbs (voice 0 on the top rail, voice 1 on the left rail),
// and the Lissajous figure sampled from the shared figure model (src/app/figure.js, built on
// src/render/lissajous.js). Live Trace accumulates analytically sub-stepped points; Full Loop
// draws one closed period. No extrema detection here: clicks come from the ClickScheduler.

import { makeProjector, project } from '../render/lissajous.js';

function hexToRgba(hex, alpha) {
  let c = (hex || '#ff9f43').replace('#', '');
  if (c.length === 3) c = c.split('').map(x => x + x).join('');
  const num = parseInt(c, 16);
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export class Oscilloscope2D {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.livePoints = [];
    this.maxLivePoints = 25000;
    this.traceKey = null;
    this.width = canvas.width;
    this.height = canvas.height;
  }

  clearPath() {
    this.livePoints = [];
    this.lastT = null;
  }

  resize(w, h) {
    const dpr = window.devicePixelRatio || 1;
    this.width = w;
    this.height = h;
    this.canvas.width = w * dpr;
    this.canvas.height = h * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // Free area of the window (CSS px) not covered by the panel, header or player bar.
  setSafeArea(area) {
    this.safeArea = area;
  }

  // Scope centre and half-size: fitted into the safe area when it is usable, else the whole
  // window. Live-trace points are in pixels, so a geometry change restarts the trace.
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
    }
    this.lastLayout = g;
    return g;
  }

  /**
   * frame: { figure, t (clock s), drawMode, labels, colors, xyPoints? }
   */
  render(frame) {
    if (frame.xyPoints) {
      this.renderXYVectorscope(frame.xyPoints);
      return;
    }
    const ctx = this.ctx;
    ctx.fillStyle = '#08090c';
    ctx.fillRect(0, 0, this.width, this.height);

    const { figure, t, drawMode, labels, colors } = frame;
    const n = figure.size;
    if (!n) return;
    const { centerX, centerY, halfScope } = this.layout(0.65);
    const R = halfScope * 0.85;
    const toPx = (p) => ({ x: centerX + p[0] * R, y: centerY + p[1] * R });

    const head = toPx(figure.pointAt(t, 2));
    const sines = figure.sinesAt(t);

    // 1. Rails and gliding orbs: each orb sits at its own voice's sin(θ + δ)
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
    const orbX = centerX + sines[0] * R;
    const orbY = n > 1 ? centerY + sines[1] * R : centerY;
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
    this.drawGlowingOrb(ctx, orbX, railTop, colors[0] || '#ff5376', 6, labels[0] || '', 'top');
    if (n > 1) this.drawGlowingOrb(ctx, railLeft, orbY, colors[1] || '#ff9f43', 6, labels[1] || '', 'left');
    ctx.restore();

    // 2. The figure
    const traceColor = n > 1 ? (colors[1] || '#ff9f43') : (colors[0] || '#ff5376');
    if (drawMode === 'live') {
      const key = figure.resetVersion;
      if (key !== this.traceKey || this.lastT === null || this.lastT === undefined || t < this.lastT) {
        this.traceKey = key;
        this.livePoints = [head];
      } else {
        for (const ts of figure.substeps(this.lastT, t)) {
          const p = toPx(figure.pointAt(ts, 2));
          const last = this.livePoints[this.livePoints.length - 1];
          if (!last || Math.hypot(last.x - p.x, last.y - p.y) > 0.4) this.livePoints.push(p);
        }
        if (this.livePoints.length > this.maxLivePoints) this.livePoints.splice(0, this.livePoints.length - this.maxLivePoints);
      }
      this.lastT = t;
      if (this.livePoints.length > 1) {
        ctx.save();
        // Additive blending: overlapping laps reinforce luminance like CRT phosphor
        ctx.globalCompositeOperation = 'lighter';
        ctx.shadowBlur = 12;
        ctx.shadowColor = traceColor;
        ctx.strokeStyle = hexToRgba(traceColor, 0.16);
        ctx.lineWidth = 3.2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        this.strokePath(ctx, this.livePoints);
        ctx.shadowBlur = 4;
        ctx.shadowColor = '#ffffff';
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
        ctx.lineWidth = 1.4;
        ctx.stroke();
        ctx.restore();
      }
    } else {
      this.lastT = null;
      // One closed period (exact in just intonation), sampled from the current phases
      const steps = Math.min(4000, Math.max(1600, figure.ratioInts.reduce((s, r) => s + r, 0) * 60));
      const proj = makeProjector(n, 2);
      const pts = [];
      const th0 = figure.phasesAt(t);
      const w = figure.model.freqs.map((_, i) => figure.model.omega(i));
      const T = figure.period;
      for (let i = 0; i <= steps; i++) {
        const dt = (T * i) / steps;
        pts.push(toPx(project(th0.map((p, j) => p + w[j] * dt), proj)));
      }
      ctx.save();
      ctx.shadowBlur = 18;
      ctx.shadowColor = traceColor;
      ctx.strokeStyle = hexToRgba(traceColor, 0.45);
      ctx.lineWidth = 4;
      this.strokePath(ctx, pts);
      ctx.shadowBlur = 8;
      ctx.shadowColor = '#ffffff';
      ctx.strokeStyle = 'rgba(255, 235, 210, 0.85)';
      ctx.lineWidth = 1.8;
      ctx.stroke();
      ctx.restore();
    }

    // 3. Tracer head
    ctx.save();
    ctx.shadowBlur = 24;
    ctx.shadowColor = '#ffffff';
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(head.x, head.y, 5.0, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 14;
    ctx.shadowColor = colors[0] || '#ff5376';
    ctx.fillStyle = colors[1] || '#ff9f43';
    ctx.beginPath();
    ctx.arc(head.x, head.y, 3.0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  strokePath(ctx, pts) {
    ctx.beginPath();
    pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.stroke();
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

  // Dedicated hardware X-Y CRT Oscilloscope vectorscope renderer (Oscilloscope Music & Stereo Audio)
  renderXYVectorscope(pts) {
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;

    // Deep CRT black
    ctx.fillStyle = '#08090c';
    ctx.fillRect(0, 0, w, h);

    const { centerX, centerY, halfScope } = this.layout(0.68);

    // Oscilloscope circular graticule & reticle
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.07)';
    ctx.lineWidth = 1;
    [0.25, 0.5, 0.75, 1.0].forEach(r => {
      ctx.beginPath();
      ctx.arc(centerX, centerY, halfScope * 0.88 * r, 0, Math.PI * 2);
      ctx.stroke();
    });

    // Crosshairs
    ctx.beginPath();
    ctx.moveTo(centerX - halfScope * 0.88, centerY);
    ctx.lineTo(centerX + halfScope * 0.88, centerY);
    ctx.moveTo(centerX, centerY - halfScope * 0.88);
    ctx.lineTo(centerX, centerY + halfScope * 0.88);
    ctx.stroke();

    // Labels
    ctx.font = '11px "Space Grotesk", sans-serif';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.textAlign = 'right';
    ctx.fillText('CH 1: LEFT [X]', centerX + halfScope * 0.88, centerY + 14);
    ctx.textAlign = 'center';
    ctx.fillText('CH 2: RIGHT [Y]', centerX, centerY - halfScope * 0.88 - 8);
    ctx.restore();

    if (!pts || pts.length === 0) return;

    // Glowing phosphor trace
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // 1. Broad phosphor glow aura
    ctx.beginPath();
    for (let i = 0; i < pts.length; i++) {
      const px = centerX + pts[i].x * halfScope * 0.85;
      const py = centerY - pts[i].y * halfScope * 0.85;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.shadowColor = '#2ecc71';
    ctx.shadowBlur = 14;
    ctx.strokeStyle = 'rgba(46, 204, 113, 0.28)';
    ctx.lineWidth = 3.6;
    ctx.stroke();

    // 2. Focused luminous core
    ctx.shadowBlur = 4;
    ctx.shadowColor = '#a8ff78';
    ctx.strokeStyle = 'rgba(220, 255, 235, 0.9)';
    ctx.lineWidth = 1.6;
    ctx.stroke();

    // 3. Electron beam dot
    const last = pts[pts.length - 1];
    const lx = centerX + last.x * halfScope * 0.85;
    const ly = centerY - last.y * halfScope * 0.85;
    ctx.beginPath();
    ctx.arc(lx, ly, 3.5, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = '#2ecc71';
    ctx.shadowBlur = 12;
    ctx.fill();
    ctx.restore();
  }
}
