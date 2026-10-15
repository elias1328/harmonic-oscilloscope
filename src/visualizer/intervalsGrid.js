// 12-Interval "Simplest First" Matrix View (recreating Image 2)
import { INTERVALS_SIMPLEST_FIRST } from '../math/harmonics.js';

const CARD_CSS_SIZE = 180; // fallback when the grid is hidden (display: none) at build time

export class IntervalsGrid {
  constructor(container, onSelectInterval) {
    this.container = container;
    this.onSelectInterval = onSelectInterval;
    this.canvases = [];
    this.buildGrid();
  }

  buildGrid() {
    this.container.innerHTML = `
      <div class="grid-header">
        <div class="subtitle">EVERY INTERVAL FROM C</div>
        <div class="main-title">SIMPLEST FIRST</div>
      </div>
      <div class="intervals-grid-container" id="intervals-grid-items"></div>
    `;

    const gridItems = this.container.querySelector('#intervals-grid-items');

    INTERVALS_SIMPLEST_FIRST.forEach((item, idx) => {
      const card = document.createElement('div');
      card.className = 'interval-card';
      card.dataset.idx = idx;

      card.innerHTML = `
        <div class="card-header">
          <span class="note-badge" style="color: ${item.color}">${item.note}</span>
          <span class="ratio-text">${item.ratio[0]}:${item.ratio[1]}</span>
        </div>
        <canvas class="card-canvas"></canvas>
      `;

      card.addEventListener('click', () => {
        if (this.onSelectInterval) {
          this.onSelectInterval(item);
        }
      });

      gridItems.appendChild(card);
      const canvas = card.querySelector('canvas');
      this.canvases.push({ canvas, ctx: canvas.getContext('2d'), item });
    });
    this.draw();
  }

  // Draw every card once, at CSS size × devicePixelRatio. Called on build, on resize and
  // when the matrix tab is shown — never per frame (the figures are static).
  draw() {
    const dpr = window.devicePixelRatio || 1;

    this.canvases.forEach(({ canvas, ctx, item }) => {
      const css = canvas.clientWidth || CARD_CSS_SIZE;
      canvas.width = Math.round(css * dpr);
      canvas.height = Math.round(css * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const w = css;
      const h = css;
      const cx = w * 0.5;
      const cy = h * 0.5;
      const radius = w * 0.40;

      ctx.clearRect(0, 0, w, h);

      // Draw Lissajous loop (matching exact reel closed figures)
      const f1 = item.ratio[1]; // Root note (X axis)
      const f2 = item.ratio[0]; // Interval note (Y axis)
      const steps = 800;

      ctx.save();
      // Outer glow
      ctx.shadowBlur = 10;
      ctx.shadowColor = item.color;
      ctx.strokeStyle = item.color;
      ctx.lineWidth = 1.8;
      ctx.beginPath();

      for (let i = 0; i <= steps; i++) {
        const t = (i / steps) * 2 * Math.PI;
        const x = cx + Math.sin(f1 * t) * radius;
        const y = cy + Math.cos(f2 * t) * radius;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // Bright inner core
      ctx.shadowBlur = 4;
      ctx.shadowColor = '#ffffff';
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
      ctx.lineWidth = 1.0;
      ctx.stroke();

      ctx.restore();
    });
  }

  resize() {
    this.draw();
  }
}
