// Boots the real src/main.js inside jsdom with:
//  - the body of index.html,
//  - the fake Web Audio API (tests/helpers/fakeAudio.js),
//  - a recording no-op 2D canvas context,
//  - a manual requestAnimationFrame queue and a controllable clock.
// Test files using it must run in jsdom and mock three's WebGLRenderer, e.g.:
//   // @vitest-environment jsdom
//   vi.mock('three', async (orig) => ({ ...(await orig()), WebGLRenderer: (await import('./helpers/appHarness.js')).FakeWebGLRenderer }));
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { vi } from 'vitest';
import { installFakeAudio, audioLog } from './fakeAudio.js';

export class FakeWebGLRenderer {
  constructor(opts = {}) { this.opts = opts; this.domElement = document.createElement('canvas'); this.renders = 0; this.pr = 1; }
  setPixelRatio(p) { this.pr = p; }
  getPixelRatio() { return this.pr; }
  setClearColor() {}
  setSize(w, h) { this.domElement.width = w; this.domElement.height = h; }
  getSize(v) { return v.set(this.domElement.width, this.domElement.height); }
  render() { this.renders++; }
}

/** A 2D context stub that records method calls and accepts any property. */
export function makeFake2DContext(canvas) {
  const calls = [];
  const target = { canvas, calls };
  const gradient = { addColorStop() {} };
  return new Proxy(target, {
    get(t, k) {
      if (k in t) return t[k];
      if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => gradient;
      if (k === 'measureText') return () => ({ width: 10 });
      if (k === 'getImageData') return () => ({ data: new Uint8ClampedArray(4) });
      return (...args) => { calls.push(k); return args.length ? undefined : undefined; };
    },
    set(t, k, v) { t[k] = v; return true; }
  });
}

export function installCanvasStub() {
  const contexts = new Map();
  HTMLCanvasElement.prototype.getContext = function () {
    if (!contexts.has(this)) contexts.set(this, makeFake2DContext(this));
    return contexts.get(this);
  };
  HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,';
  return contexts;
}

export async function bootApp({ midi = null, storage = {} } = {}) {
  // Web MIDI: jsdom has none (an unsupported browser) unless a fake is given
  if (midi) Object.defineProperty(navigator, 'requestMIDIAccess', { configurable: true, value: midi.requestMIDIAccess });
  else delete navigator.requestMIDIAccess;
  localStorage.clear();
  Object.entries(storage).forEach(([k, v]) => localStorage.setItem(k, v));
  const html = readFileSync(join(process.cwd(), 'index.html'), 'utf8');
  const body = html.match(/<body>([\s\S]*)<\/body>/)[1].replace(/<script[\s\S]*?<\/script>/g, '');
  document.body.innerHTML = body;
  installCanvasStub();
  installFakeAudio();
  audioLog.reset();
  window.alert = vi.fn();

  let now = 1000;
  const frames = [];
  window.requestAnimationFrame = (cb) => { frames.push(cb); return frames.length; };
  vi.spyOn(performance, 'now').mockImplementation(() => now);

  vi.resetModules();
  await import('../../src/main.js');
  const app = window.__harmonic;

  const h = {
    app,
    audioLog,
    get now() { return now; },
    /** Advance the clock by `ms` and run one animation frame. */
    step(ms = 16) {
      now += ms;
      if (app.audio.ctx) app.audio.ctx.currentTime = now / 1000;
      const fs = frames.splice(0);
      fs.forEach(cb => cb(now));
    },
    frames(n, ms = 16) { for (let i = 0; i < n; i++) h.step(ms); },
    $(sel) { return document.querySelector(sel); },
    // Store notifications are batched per animation frame; deliver them so the DOM reflects the action.
    flush() { app.store.flush(); },
    click(sel) { document.querySelector(sel).dispatchEvent(new window.MouseEvent('click', { bubbles: true })); app.store.flush(); },
    /** First user gesture: unlocks the AudioContext like a real pointerdown. */
    unlock() { window.dispatchEvent(new window.Event('pointerdown')); },
    async uploadFile(name, bytes) {
      const input = document.querySelector('#file-media-input');
      const file = new File([bytes], name);
      Object.defineProperty(input, 'files', { configurable: true, value: [file] });
      input.dispatchEvent(new window.Event('change', { bubbles: true }));
      // let the async loader settle
      for (let i = 0; i < 10; i++) await new Promise(r => setTimeout(r, 0));
      app.store.flush();
    },
    async settle() {
      for (let i = 0; i < 20; i++) await new Promise(r => setTimeout(r, 0));
      app.store.flush();
    }
  };
  h.step(16);
  return h;
}
