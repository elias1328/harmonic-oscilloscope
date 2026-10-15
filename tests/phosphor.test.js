// @vitest-environment jsdom
// G3.5 persistence/decay and G3.6 X-Y vectorscope through the phosphor buffer.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { installCanvasStub } from './helpers/appHarness.js';
import { installFakeAudio, makeWav } from './helpers/fakeAudio.js';

const { Phosphor2D, persistenceTau, decayAlpha, PERSISTENCE_INFINITE } = await import('../src/visualizer/phosphor2D.js');

beforeEach(() => installCanvasStub());

describe('G3.5: persistence', () => {
  it('G3.5: the decay applied per frame changes with the persistence slider', () => {
    const dt = 1 / 60;
    const values = [0, 25, 50, 75, 99].map(v => decayAlpha(dt, persistenceTau(v)));
    for (let i = 1; i < values.length; i++) expect(values[i]).toBeLessThan(values[i - 1]);
    expect(values[0]).toBeGreaterThan(0.2);
    expect(values[4]).toBeGreaterThan(0);
  });

  it('G3.5: the top of the slider is infinite persistence (no decay at all)', () => {
    expect(persistenceTau(PERSISTENCE_INFINITE)).toBe(Infinity);
    expect(decayAlpha(1 / 60, Infinity)).toBe(0);
  });

  it('G3.5: Phosphor2D.decay fades the buffer with destination-out by that amount', () => {
    const p = new Phosphor2D();
    p.resize(100, 100, 1);
    const ops = [];
    const ctx = p.bctx;
    const fill = ctx.fillRect;
    ctx.fillRect = (...a) => { ops.push({ op: ctx.globalCompositeOperation, style: ctx.fillStyle }); return fill?.(...a); };
    const a1 = p.decay(1 / 60, persistenceTau(20));
    const a2 = p.decay(1 / 60, persistenceTau(80));
    expect(a1).toBeGreaterThan(a2);
    expect(ops.map(o => o.op)).toEqual(['destination-out', 'destination-out']);
    expect(p.decay(1 / 60, Infinity)).toBe(0);
    expect(ops.length).toBe(2);
  });

  it('G3.4: the phosphor renderer uses no shadowBlur at all', () => {
    expect(readFileSync('src/visualizer/phosphor2D.js', 'utf8')).not.toMatch(/shadowBlur/);
  });
});

describe('G3.6: X-Y vectorscope samples per frame', () => {
  installFakeAudio();
  let now = 1000;
  beforeEach(() => vi.spyOn(performance, 'now').mockImplementation(() => now));
  afterEach(() => vi.restoreAllMocks());

  async function playing(rate) {
    const { AudioEngine } = await import('../src/audio/audioEngine.js');
    const { MediaImporter } = await import('../src/audio/mediaImporter.js');
    const a = new AudioEngine();
    a.init();
    a.ctx.sampleRate = 48000;
    a.setDroneEnabled(false);
    const m = new MediaImporter(a);
    await m.loadAudioBuffer(makeWav({ seconds: 3, sampleRate: 48000, fn: t => [Math.sin(2 * Math.PI * 200 * t), Math.cos(2 * Math.PI * 300 * t)] }), 'xy.wav');
    m.setPlaybackRate(rate);
    m.play();
    a.ctx.currentTime += 0.5; m.update(); // settle
    return { a, m };
  }

  it('G3.6: a 1/60 s media-clock step at 48 kHz, rate 1, draws 800 ± 5% new samples', async () => {
    const { a, m } = await playing(1);
    const counts = [];
    for (let i = 0; i < 10; i++) { a.ctx.currentTime += 1 / 60; counts.push(m.update().xySegment.length); }
    counts.forEach(n => expect(Math.abs(n - 800)).toBeLessThanOrEqual(40));
  });

  it('G3.6: at rate 2 it draws ~1600 samples per 1/60 s', async () => {
    const { a, m } = await playing(2);
    const counts = [];
    for (let i = 0; i < 10; i++) { a.ctx.currentTime += 1 / 60; counts.push(m.update().xySegment.length); }
    counts.forEach(n => expect(Math.abs(n - 1600)).toBeLessThanOrEqual(80));
  });

  it('G3.6: the segment is contiguous with the previous one (no gaps, no repeats)', async () => {
    const { a, m } = await playing(1);
    a.ctx.currentTime += 1 / 60;
    const s1 = m.update();
    a.ctx.currentTime += 1 / 60;
    const s2 = m.update();
    expect(s2.xyStart).toBe(s1.xyStart + s1.xySegment.length);
  });
});
