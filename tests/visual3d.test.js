// @vitest-environment jsdom
// R14: the normal 3D path restores every material that X-Y mode changes.
import { describe, it, expect, vi } from 'vitest';

vi.mock('three', async (orig) => ({ ...(await orig()), WebGLRenderer: (await import('./helpers/appHarness.js')).FakeWebGLRenderer }));

const { Oscilloscope3D } = await import('../src/visualizer/oscilloscope3D.js');

const { Figure } = await import('../src/app/figure.js');
const { presetChord } = await import('../src/core/voices.js');

// Phase 2: renderers take a frame built on the shared figure model instead of the old state bag.
const figure = new Figure();
figure.sync({ chord: presetChord('fifth'), tuning: 'just', speedVal: 100, phi: 0, tClose: 4, traceReset: 0 }, 0);
const xyState = { figure, t: 0, xyPoints: Array.from({ length: 64 }, (_, i) => ({ x: Math.sin(i / 5), y: Math.cos(i / 7) })) };
const chordState = { figure, t: 0.3, xyPoints: null, labels: ['C', 'G'], colors: ['#ff5376', '#ff9f43'], drawMode: 'live' };

describe('R14: 3D materials after X-Y mode', () => {
  it('R14: core line returns to white (and glow/corona to the voice color) on the next normal render', () => {
    const v = new Oscilloscope3D(document.createElement('div'));
    const defaults = { core: v.coreMat.color.getHex(), coreOpacity: v.coreMat.opacity };
    expect(defaults.core).toBe(0xffffff);
    v.render(xyState);
    expect(v.coreMat.color.getHex()).not.toBe(0xffffff);
    v.render(chordState);
    expect(v.coreMat.color.getHex()).toBe(0xffffff);
    expect(v.glowMat.color.getHexString()).toBe('ff9f43');
    expect(v.coronaMat.color.getHexString()).toBe('ff9f43');
    expect(v.coreMat.opacity).toBeCloseTo(defaults.coreOpacity, 6);
  });

  it('R14: resetMaterials() restores the defaults immediately (used on eject)', () => {
    const v = new Oscilloscope3D(document.createElement('div'));
    v.render(xyState);
    v.resetMaterials();
    expect(v.coreMat.color.getHex()).toBe(0xffffff);
    expect(v.glowMat.color.getHex()).toBe(0xff9f43);
  });
});

describe('G3.7 / G3.11: 3D lines, bloom governor, camera controls', async () => {
  const { readFileSync, readdirSync } = await import('node:fs');
  const { BloomGovernor } = await import('../src/visualizer/bloomGovernor.js');

  it('G3.7: the 3D view uses Line2 / LineMaterial / LineGeometry, no preserveDrawingBuffer, no Array.shift', () => {
    const src = readFileSync('src/visualizer/oscilloscope3D.js', 'utf8');
    expect(src).toMatch(/Line2/);
    expect(src).toMatch(/LineMaterial/);
    expect(src).toMatch(/LineGeometry/);
    expect(src).not.toMatch(/preserveDrawingBuffer/);
    for (const f of readdirSync('src/visualizer')) expect(readFileSync(`src/visualizer/${f}`, 'utf8'), f).not.toMatch(/\.shift\(/);
  });

  it('G3.7: bloom turns itself off when the average frame time stays above 25 ms', () => {
    const fast = new BloomGovernor();
    for (let i = 0; i < 300; i++) fast.record(12);
    expect(fast.autoDisabled).toBe(false);
    const slow = new BloomGovernor();
    let on = true;
    for (let i = 0; i < 89; i++) on = slow.record(40);
    expect(on).toBe(true); // not judged before a full window
    expect(slow.record(40)).toBe(false);
    expect(slow.autoDisabled).toBe(true);
    const border = new BloomGovernor();
    for (let i = 0; i < 200; i++) border.record(i % 2 ? 20 : 29); // average 24.5 ms
    expect(border.autoDisabled).toBe(false);
  });

  it('G3.7: the renderer applies it (slow frames disable bloom; the Glow toggle re-arms it)', () => {
    const v = new Oscilloscope3D(document.createElement('div'));
    v.setBloom(true);
    for (let i = 0; i < 90; i++) v.governor.record(30);
    expect(v.bloomActive).toBe(false);
    v.setBloom(true);
    expect(v.governor.autoDisabled).toBe(false);
  });

  it('G3.7: the live trail is a fixed ring buffer (copyWithin) that never exceeds its size', () => {
    const v = new Oscilloscope3D(document.createElement('div'));
    for (let i = 0; i < v.maxPoints + 5000; i++) v.pushPoint([Math.sin(i), Math.cos(i), 0]);
    expect(v.trailCount).toBeLessThanOrEqual(v.maxPoints);
    expect(v.trail.length).toBe(v.maxPoints * 3);
    const last = v.maxPoints + 4999;
    expect(v.trail[(v.trailCount - 1) * 3]).toBeCloseTo(Math.sin(last), 6);
  });

  const ev = (type, id, x, y) => {
    const e = new MouseEvent(type, { clientX: x, clientY: y, bubbles: true });
    Object.defineProperty(e, 'pointerId', { value: id });
    return e;
  };

  it('G3.11: the canvas has touch-action: none', () => {
    const v = new Oscilloscope3D(document.createElement('div'));
    expect(v.renderer.domElement.style.touchAction).toBe('none');
  });

  it('G3.11: double-click resets the camera to its default view', () => {
    const v = new Oscilloscope3D(document.createElement('div'));
    v.resetView();
    v.autoRotate = false; // the exact default pose, without the idle auto-rotation
    v.updateCamera(true);
    const home = v.camera.position.clone();
    const el = v.renderer.domElement;
    el.dispatchEvent(ev('pointerdown', 1, 100, 100));
    el.dispatchEvent(ev('pointermove', 1, 260, 180));
    el.dispatchEvent(ev('pointerup', 1, 260, 180));
    el.dispatchEvent(new WheelEvent('wheel', { deltaY: -400, cancelable: true }));
    v.updateCamera(true);
    expect(v.camera.position.distanceTo(home)).toBeGreaterThan(0.1);
    el.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    expect(v.target).toEqual({ rx: 0.35, ry: -0.6, zoom: 1 });
    v.autoRotate = false; // compare the exact default pose
    v.updateCamera(true);
    expect(v.camera.position.distanceTo(home)).toBeLessThan(1e-9);
  });

  it('G3.11: pinch (two pointers moving apart) zooms in; moving together zooms out', () => {
    const v = new Oscilloscope3D(document.createElement('div'));
    const el = v.renderer.domElement;
    v.updateCamera(true);
    const d0 = v.camera.position.length();
    el.dispatchEvent(ev('pointerdown', 1, 100, 200));
    el.dispatchEvent(ev('pointerdown', 2, 200, 200));
    el.dispatchEvent(ev('pointermove', 2, 300, 200)); // 100 px -> 200 px apart
    expect(v.target.zoom).toBeCloseTo(2, 6);
    v.updateCamera(true);
    expect(v.camera.position.length()).toBeLessThan(d0 * 0.6);
    el.dispatchEvent(ev('pointermove', 2, 125, 200)); // 25 px apart
    expect(v.target.zoom).toBeLessThan(1);
    el.dispatchEvent(ev('pointerup', 1, 0, 0));
    el.dispatchEvent(ev('pointerup', 2, 0, 0));
    expect(v.pointers.size).toBe(0);
  });
});
