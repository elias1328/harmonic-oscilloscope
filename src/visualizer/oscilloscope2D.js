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
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.options = options;
    this.onExtrema = options.onExtrema || null;

    this.livePoints = [];
    this.maxLivePoints = 25000;
    this.prevVelocityX = 0;
    this.prevVelocityY = 0;
    this.prevTheta = null;
    this.width = canvas.width;
    this.height = canvas.height;
  }

  clearPath() {
    this.livePoints = [];
    this.prevTheta = null;
  }

  resize(w, h) {
    const dpr = window.devicePixelRatio || 1;
    this.width = w;
    this.height = h;
    this.canvas.width = w * dpr;
    this.canvas.height = h * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  render(state) {
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;

    // If in audio X-Y vectorscope mode (MP3/Audio files)
    if (state.audioMode === 'xy' && state.xyPoints && state.xyPoints.length > 0) {
      this.renderXYVectorscope(state);
      return;
    }

    // Clear background
    ctx.fillStyle = '#08090c';
    ctx.fillRect(0, 0, w, h);

    const centerX = w * 0.52;
    const centerY = h * 0.54;
    const scopeSize = Math.min(w, h) * 0.65;
    const halfScope = scopeSize * 0.5;

    // Current notes, ratio integers, and phase
    const notes = state.notes || [];
    const colors = state.colors || ['#ff5376', '#ff9f43'];
    const phase = state.phase || 0;
    const time = state.time || 0;
    const showRails = state.showRails !== false;
    const drawMode = state.drawMode || 'live'; // 'live' | 'full'

    // Use ratio integers so curve is mathematically guaranteed to close perfectly
    const ratioInts = state.ratioInts || [2, 3];
    const n1 = ratioInts[0] || 1;
    const n2 = ratioInts[1] || 1;
    const n3 = ratioInts[2] || null;

    // Time phase for instantaneous movement
    const theta = (2 * Math.PI * time);

    let normX = 0;
    let normY = 0;

    if (notes.length <= 1) {
      // 1 Note: True oscilloscope single-channel behavior: straight horizontal line along X-axis
      normX = Math.sin(theta);
      normY = 0;
    } else if (notes.length === 2) {
      // 2 Notes: Upright symmetrical closed loop matching the reel exactly (top/bottom central arches, 2 vertical side lobes)
      normX = Math.sin(n1 * theta);
      normY = Math.cos(n2 * theta + phase);
    } else {
      // 3+ Notes in 2D mode
      normX = 0.65 * Math.sin(n1 * theta) + 0.35 * Math.sin(n3 * theta);
      normY = 0.65 * Math.cos(n2 * theta + phase) + 0.35 * Math.cos((n3 || 1) * theta * 0.8);
    }

    const curX = centerX + normX * halfScope * 0.85;
    const curY = centerY + normY * halfScope * 0.85;

    // Extrema detection for polyrhythm clicks
    const velX = Math.cos(n1 * theta);
    const velY = notes.length > 1 ? -Math.sin(n2 * theta + phase) : 0;
    if (this.prevVelocityX * velX < 0) {
      if (this.onExtrema) this.onExtrema(0);
    }
    if (notes.length > 1 && this.prevVelocityY * velY < 0) {
      if (this.onExtrema) this.onExtrema(1);
    }
    this.prevVelocityX = velX;
    this.prevVelocityY = velY;

    // 1. Draw Axis Rails and Gliding Orbs (Top and Left)
    const railXTop = centerY - halfScope;
    const railYLeft = centerX - halfScope;

    if (showRails && notes.length > 0) {
      // Top Horizontal Rail (Note 1, X-axis)
      ctx.save();
      ctx.strokeStyle = 'rgba(255, 120, 150, 0.22)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(centerX - halfScope * 0.85, railXTop);
      ctx.lineTo(centerX + halfScope * 0.85, railXTop);
      ctx.stroke();

      // Center tick mark
      ctx.beginPath();
      ctx.moveTo(centerX, railXTop - 5);
      ctx.lineTo(centerX, railXTop + 5);
      ctx.stroke();

      // Left Vertical Rail (Note 2, Y-axis) - only active if 2+ notes
      if (notes.length > 1) {
        ctx.strokeStyle = 'rgba(255, 160, 80, 0.22)';
        ctx.beginPath();
        ctx.moveTo(railYLeft, centerY - halfScope * 0.85);
        ctx.lineTo(railYLeft, centerY + halfScope * 0.85);
        ctx.stroke();

        // Center tick mark
        ctx.beginPath();
        ctx.moveTo(railYLeft - 5, centerY);
        ctx.lineTo(railYLeft + 5, centerY);
        ctx.stroke();
      }

      // Dashed tracking lines from orbs to tracer point
      ctx.setLineDash([4, 5]);
      ctx.lineWidth = 1.0;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';

      // Vertical line from top orb down to (curX, curY)
      ctx.beginPath();
      ctx.moveTo(curX, railXTop);
      ctx.lineTo(curX, curY);
      ctx.stroke();

      // Horizontal line from left orb across to (curX, curY) only if 2+ notes
      if (notes.length > 1) {
        ctx.beginPath();
        ctx.moveTo(railYLeft, curY);
        ctx.lineTo(curX, curY);
        ctx.stroke();
      }

      ctx.setLineDash([]); // Reset dash

      // Glowing Orb on Top Rail (X)
      this.drawGlowingOrb(ctx, curX, railXTop, colors[0] || '#ff5376', 6, notes[0] || 'C', 'top');

      // Glowing Orb on Left Rail (Y) only if 2+ notes
      if (notes.length > 1) {
        this.drawGlowingOrb(ctx, railYLeft, curY, colors[1] || '#ff9f43', 6, notes[1] || 'G', 'left');
      }

      ctx.restore();
    }

    // 2. Draw Lissajous Curve (Live Real-Time Trace vs Full Loop)
    const traceColor = notes.length > 1 ? (colors[1] || '#ff9f43') : (colors[0] || '#ff5376');

    if (drawMode === 'live') {
      // Sub-step interpolation: when harmonic numbers are high (e.g. 45:32 Tritone),
      // interpolate intermediate points between frames so the curve is always silky smooth and never jagged!
      if (this.prevTheta === null || Math.abs(theta - this.prevTheta) > 1.2) {
        this.prevTheta = theta;
        this.livePoints.push({ x: curX, y: curY });
      } else {
        const dTheta = theta - this.prevTheta;
        const maxHarmonic = Math.max(n1, n2, n3 || 1);
        const subSteps = Math.max(1, Math.min(36, Math.ceil(maxHarmonic * Math.abs(dTheta) * 6)));

        for (let s = 1; s <= subSteps; s++) {
          const subT = this.prevTheta + (dTheta * s / subSteps);
          let subNormX = 0;
          let subNormY = 0;

          if (notes.length <= 1) {
            subNormX = Math.sin(subT);
            subNormY = 0;
          } else if (notes.length === 2) {
            subNormX = Math.sin(n1 * subT);
            subNormY = Math.cos(n2 * subT + phase);
          } else {
            subNormX = 0.65 * Math.sin(n1 * subT) + 0.35 * Math.sin(n3 * subT);
            subNormY = 0.65 * Math.cos(n2 * subT + phase) + 0.35 * Math.cos((n3 || 1) * subT * 0.8);
          }

          const sx = centerX + subNormX * halfScope * 0.85;
          const sy = centerY + subNormY * halfScope * 0.85;

          const last = this.livePoints[this.livePoints.length - 1];
          if (!last || Math.hypot(last.x - sx, last.y - sy) > 0.4) {
            this.livePoints.push({ x: sx, y: sy });
            if (this.livePoints.length > this.maxLivePoints) {
              this.livePoints.shift();
            }
          }
        }
        this.prevTheta = theta;
      }

      if (this.livePoints.length > 1) {
        ctx.save();
        // Additive blending: each overlapping lap progressively reinforces luminance,
        // making the figure get lighter, brighter, and more radiant as more steps accumulate!
        ctx.globalCompositeOperation = 'lighter';

        // Outer glow layer with delicate initial opacity (0.16)
        ctx.shadowBlur = 12;
        ctx.shadowColor = traceColor;
        ctx.strokeStyle = hexToRgba(traceColor, 0.16);
        ctx.lineWidth = 3.2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        this.livePoints.forEach((p, idx) => {
          if (idx === 0) ctx.moveTo(p.x, p.y);
          else ctx.lineTo(p.x, p.y);
        });
        ctx.stroke();

        // Inner filament core with subtle opacity (0.22) - builds to brilliant white glow on multiple passes
        ctx.shadowBlur = 4;
        ctx.shadowColor = '#ffffff';
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
        ctx.lineWidth = 1.4;
        ctx.stroke();
        ctx.restore();
      }
    } else {
      // Full Static Pre-rendered Mode
      ctx.save();
      const steps = Math.min(3600, Math.max(1600, (n1 + n2) * 120));
      const curvePoints = [];
      const period = 2 * Math.PI;

      for (let i = 0; i <= steps; i++) {
        const tau = (i / steps) * period;
        let px = 0;
        let py = 0;
        if (notes.length <= 1) {
          px = Math.sin(tau);
          py = 0;
        } else if (notes.length === 2) {
          px = Math.sin(n1 * tau);
          py = Math.cos(n2 * tau + phase);
        } else {
          px = 0.65 * Math.sin(n1 * tau) + 0.35 * Math.sin(n3 * tau);
          py = 0.65 * Math.cos(n2 * tau + phase) + 0.35 * Math.cos((n3 || 1) * tau * 0.8);
        }
        curvePoints.push({
          x: centerX + px * halfScope * 0.85,
          y: centerY + py * halfScope * 0.85
        });
      }

      // Outer warm bloom
      ctx.shadowBlur = 18;
      ctx.shadowColor = traceColor;
      ctx.strokeStyle = hexToRgba(traceColor, 0.45);
      ctx.lineWidth = 4;
      ctx.beginPath();
      curvePoints.forEach((p, idx) => {
        if (idx === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      });
      ctx.stroke();

      // Inner bright core
      ctx.shadowBlur = 8;
      ctx.shadowColor = '#ffffff';
      ctx.strokeStyle = 'rgba(255, 235, 210, 0.85)';
      ctx.lineWidth = 1.8;
      ctx.stroke();
      ctx.restore();
    }

    // 3. Central Tracer Particle with Intense Luminous Head
    ctx.save();
    ctx.shadowBlur = 24;
    ctx.shadowColor = '#ffffff';
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(curX, curY, 5.0, 0, Math.PI * 2);
    ctx.fill();

    // Secondary colored corona
    ctx.shadowBlur = 14;
    ctx.shadowColor = colors[0] || '#ff5376';
    ctx.fillStyle = colors[1] || '#ff9f43';
    ctx.beginPath();
    ctx.arc(curX, curY, 3.0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.restore();
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
  renderXYVectorscope(state) {
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;

    // Deep CRT black
    ctx.fillStyle = '#08090c';
    ctx.fillRect(0, 0, w, h);

    const centerX = w * 0.52;
    const centerY = h * 0.54;
    const scopeSize = Math.min(w, h) * 0.68;
    const halfScope = scopeSize * 0.5;

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

    const pts = state.xyPoints;
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
