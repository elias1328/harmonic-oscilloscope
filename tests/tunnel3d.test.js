// @vitest-environment jsdom
// Phase 4: the three.js side of the Time Tunnel (G4.5 GPU motion, G4.11 camera).
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { installCanvasStub } from './helpers/appHarness.js';

vi.mock('three', async (orig) => ({ ...(await orig()), WebGLRenderer: (await import('./helpers/appHarness.js')).FakeWebGLRenderer }));

const { TimeTunnel } = await import('../src/visualizer/timeTunnel.js');
const { Oscilloscope3D, TUNNEL_VIEW } = await import('../src/visualizer/oscilloscope3D.js');
const { SLICE_POINTS } = await import('../src/visualizer/tunnelCore.js');

beforeEach(() => installCanvasStub());

const slice = (v) => ({ points: Array.from({ length: SLICE_POINTS }, (_, i) => [Math.cos(i / 40 + v), Math.sin(i / 40)]), color: [1, 0.5, 0.2] });

describe('G4.5: GPU-driven motion', () => {
  it('G4.5: a ShaderMaterial with uNow and uSpeed places the slices (z computed in the shader)', () => {
    const t = new TimeTunnel();
    expect(t.material).toBeInstanceOf(THREE.ShaderMaterial);
    expect(t.material.uniforms.uNow).toBeDefined();
    expect(t.material.uniforms.uSpeed).toBeDefined();
    expect(t.material.vertexShader).toMatch(/\(birthTime - uNow\) \* uSpeed/);
    const src = readFileSync('src/visualizer/timeTunnel.js', 'utf8');
    expect(src).toMatch(/ShaderMaterial/);
    t.update({ now: 3, cleared: true, title: 'A', makeSlice: () => slice(0) });
    expect(t.material.uniforms.uNow.value).toBe(3);
    t.setSpeed(1.7);
    expect(t.material.uniforms.uSpeed.value).toBe(1.7);
  });

  it('G4.5: each frame uploads at most one slice (partial update ranges, never the whole buffer)', () => {
    const t = new TimeTunnel();
    const attrs = ['position', 'birthTime', 'color'].map(n => t.geometry.attributes[n]);
    let now = 10;
    t.update({ now, cleared: true, title: 'A', makeSlice: () => slice(0) });
    for (let f = 0; f < 200; f++) {
      attrs.forEach(a => a.clearUpdateRanges()); // what the renderer does after uploading
      now += 1 / 60;
      t.update({ now, cleared: false, title: f < 100 ? 'A' : 'B', makeSlice: () => slice(f) });
      for (const a of attrs) {
        const verts = a.updateRanges.reduce((n, r) => n + r.count, 0) / a.itemSize;
        expect(verts).toBeLessThanOrEqual(SLICE_POINTS);
        expect(a.updateRanges.length).toBeLessThanOrEqual(1);
        a.updateRanges.forEach(r => expect(r.count).toBeLessThan(a.array.length));
      }
    }
    // the slices themselves were written in place: 200 frames at 60 fps -> ~100 slices at 30 Hz
    expect(t.stats().count).toBeGreaterThan(90);
    expect(t.stats().count).toBeLessThan(110);
    expect(t.markersCreated).toBe(1);
    expect(t.markerLabels).toEqual(['B']);
  });

  it('G4.10: History changes the visible slice count without reallocating', () => {
    const t = new TimeTunnel();
    const arrays = ['position', 'birthTime', 'color'].map(n => t.geometry.attributes[n].array);
    t.setHistory(60);
    expect(t.ring.history).toBe(60);
    expect(t.material.uniforms.uHistory.value).toBeCloseTo(2, 9);
    t.setHistory(480);
    expect(['position', 'birthTime', 'color'].map(n => t.geometry.attributes[n].array)).toEqual(arrays);
    arrays.forEach((a, i) => expect(t.geometry.attributes[['position', 'birthTime', 'color'][i]].array).toBe(a));
  });
});

describe('G4.11: tunnel camera', () => {
  const angleToAxis = (v) => {
    const look = new THREE.Vector3();
    v.camera.getWorldDirection(look);
    return (Math.acos(look.dot(new THREE.Vector3(0, 0, -1))) * 180) / Math.PI;
  };

  it('G4.11: the default tunnel view looks into the tunnel at 25° ± 5°', () => {
    const v = new Oscilloscope3D(document.createElement('div'));
    v.setMode('tunnel');
    v.updateCamera(true);
    expect(Math.abs(angleToAxis(v) - 25)).toBeLessThanOrEqual(5);
    expect(v.target).toEqual(TUNNEL_VIEW);
  });

  it('G4.11: orbit and zoom still work, and double-click resets to the tunnel default', () => {
    const v = new Oscilloscope3D(document.createElement('div'));
    v.setMode('tunnel');
    v.updateCamera(true);
    const home = v.camera.position.clone();
    const el = v.renderer.domElement;
    const ev = (type, id, x, y) => { const e = new MouseEvent(type, { clientX: x, clientY: y, bubbles: true }); Object.defineProperty(e, 'pointerId', { value: id }); return e; };
    el.dispatchEvent(ev('pointerdown', 1, 100, 100));
    el.dispatchEvent(ev('pointermove', 1, 300, 160));
    el.dispatchEvent(ev('pointerup', 1, 300, 160));
    el.dispatchEvent(new WheelEvent('wheel', { deltaY: -300, cancelable: true }));
    v.updateCamera(true);
    expect(v.camera.position.distanceTo(home)).toBeGreaterThan(0.2);
    el.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    expect(v.target).toEqual(TUNNEL_VIEW);
    v.updateCamera(true);
    expect(v.camera.position.distanceTo(home)).toBeLessThan(1e-9);
    expect(Math.abs(angleToAxis(v) - 25)).toBeLessThanOrEqual(5);
  });

  it('G4.11: leaving the tunnel restores the cube view defaults', () => {
    const v = new Oscilloscope3D(document.createElement('div'));
    v.setMode('tunnel');
    v.setMode('figure');
    expect(v.target.rx).toBe(0.35);
    expect(v.target.zoom).toBe(1);
    expect(Math.abs(v.target.ry + 0.6)).toBeLessThan(0.01); // the cube view auto-rotates slowly
    expect(v.cubeGroup.visible).toBe(true);
    expect(v.tunnel.group.visible).toBe(false);
  });
});
