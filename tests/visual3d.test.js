// @vitest-environment jsdom
// R14: the normal 3D path restores every material that X-Y mode changes.
import { describe, it, expect, vi } from 'vitest';

vi.mock('three', async (orig) => ({ ...(await orig()), WebGLRenderer: (await import('./helpers/appHarness.js')).FakeWebGLRenderer }));

const { Oscilloscope3D } = await import('../src/visualizer/oscilloscope3D.js');

const xyState = { audioMode: 'xy', xyPoints: Array.from({ length: 64 }, (_, i) => ({ x: Math.sin(i / 5), y: Math.cos(i / 7) })) };
const chordState = { audioMode: 'midi', xyPoints: null, notes: ['C', 'G'], colors: ['#ff5376', '#ff9f43'], ratioInts: [2, 3], phase: 0, time: 0.3, drawMode: 'live' };

describe('R14: 3D materials after X-Y mode', () => {
  it('R14: core line returns to white (and glow/corona to the voice color) on the next normal render', () => {
    const v = new Oscilloscope3D(document.createElement('div'));
    const defaults = { core: v.coreMat.color.getHex(), coreOpacity: 0.85 };
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
