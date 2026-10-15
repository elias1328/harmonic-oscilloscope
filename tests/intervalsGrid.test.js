// @vitest-environment jsdom
// R28: matrix canvases are DPR-aware and drawn on build/resize only, never per frame.
import { describe, it, expect, beforeEach } from 'vitest';
import { installCanvasStub } from './helpers/appHarness.js';

const { IntervalsGrid } = await import('../src/visualizer/intervalsGrid.js');

let contexts;
beforeEach(() => { contexts = installCanvasStub(); window.devicePixelRatio = 2; });
const strokes = () => [...contexts.values()].reduce((n, c) => n + c.calls.filter(k => k === 'stroke').length, 0);

describe('R28: matrix canvases', () => {
  it('R28: backing store is CSS size × devicePixelRatio and drawn once on build', () => {
    const el = document.createElement('div');
    const grid = new IntervalsGrid(el, () => {});
    const canvases = el.querySelectorAll('canvas');
    expect(canvases.length).toBe(12);
    canvases.forEach(c => { expect(c.width).toBe(360); expect(c.height).toBe(360); });
    const afterBuild = strokes();
    expect(afterBuild).toBeGreaterThan(0);
    for (let i = 0; i < 30; i++) grid.render?.(i);
    expect(strokes()).toBe(afterBuild);
  });

  it('R28: resize() redraws at the new DPR', () => {
    const el = document.createElement('div');
    const grid = new IntervalsGrid(el, () => {});
    const before = strokes();
    window.devicePixelRatio = 3;
    grid.resize();
    el.querySelectorAll('canvas').forEach(c => expect(c.width).toBe(540));
    expect(strokes()).toBeGreaterThan(before);
  });
});
