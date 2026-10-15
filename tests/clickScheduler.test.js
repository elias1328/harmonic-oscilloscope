// R18 (G2.10): sample-accurate clicks from the click scheduler, on the audio clock.
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { installFakeAudio } from './helpers/fakeAudio.js';

const audioLog = installFakeAudio();
const { AudioEngine } = await import('../src/audio/audioEngine.js');
const { ClickScheduler } = await import('../src/audio/clickScheduler.js');
const { Clock, PhaseModel } = await import('../src/core/clock.js');
const { voiceOffsets } = await import('../src/render/lissajous.js');

beforeEach(() => audioLog.reset());

function setup(rootHz, ratio = [2, 3]) {
  const engine = new AudioEngine();
  engine.init();
  engine.setRootFrequency(rootHz);
  const ctx = engine.ctx;
  ctx.currentTime = 5; // arbitrary non-zero audio time
  const clock = new Clock(() => ctx.currentTime);
  clock.tick();
  const model = new PhaseModel();
  const freqs = ratio.map(r => (rootHz * r) / ratio[0]);
  model.configure({ freqs, k: 1 }, clock.now(), { reset: true });
  const deltas = voiceOffsets(ratio, 0);
  const sched = new ClickScheduler({ engine, clock, model, getDeltas: () => deltas, getRootHz: () => rootHz });
  const run = (seconds) => {
    const end = ctx.currentTime + seconds;
    while (ctx.currentTime < end) { sched.tick(); ctx.currentTime += 0.025; clock.tick(); }
  };
  return { engine, ctx, clock, model, deltas, sched, run };
}

// Click oscillators: their first frequency value is the axis woodblock pitch.
const clicks = (pitch) => audioLog.oscillators.filter(o => o.frequency.history[0] === pitch).map(o => o.startTime).sort((a, b) => a - b);
const spacings = (ts) => ts.slice(1).map((t, i) => t - ts[i]);

describe('R18: click scheduler', () => {
  it('R18: at 2 Hz with 3:2, root clicks are 0.25 s apart and Y clicks 1/6 s apart (±1 ms)', () => {
    const { run } = setup(2);
    run(3);
    const x = clicks(900);
    const y = clicks(600);
    expect(x.length).toBeGreaterThanOrEqual(11);
    expect(y.length).toBeGreaterThanOrEqual(17);
    spacings(x).forEach(d => expect(Math.abs(d - 0.25)).toBeLessThan(0.001));
    spacings(y).forEach(d => expect(Math.abs(d - 1 / 6)).toBeLessThan(0.001));
  });

  it('R18: clicks are scheduled ahead with start(t) exactly at the extrema of the voice', () => {
    const { run, model, clock, deltas } = setup(2);
    run(1);
    const x = clicks(900);
    for (const when of x) {
      const t = when - clock.offset; // audio time -> clock time
      // root at an extreme of its rail: sin(θ + δ) = ±1
      expect(Math.abs(Math.abs(Math.sin(model.theta(0, t) + deltas[0])) - 1)).toBeLessThan(1e-9);
    }
    // nothing scheduled twice
    expect(new Set(x.map(t => t.toFixed(9))).size).toBe(x.length);
  });

  it('R18: no clicks at or above 30 Hz', () => {
    const { run } = setup(30);
    run(1);
    expect(audioLog.created.osc).toBe(0);
    const s2 = setup(261.6);
    s2.run(1);
    expect(audioLog.created.osc).toBe(0);
  });

  it('R18: invalidate() cancels clicks scheduled after a parameter change', () => {
    const { run, sched, ctx } = setup(2);
    run(0.5);
    sched.lookahead = 0.5; // a window longer than the click spacing: some clicks are surely pending
    sched.tick();
    const pending = audioLog.oscillators.filter(o => o.startTime > ctx.currentTime);
    expect(pending.length).toBeGreaterThan(0);
    sched.invalidate();
    pending.forEach(o => expect(o.stopped).toBe(true));
  });

  it('R18: the renderers contain no onExtrema', () => {
    for (const f of ['src/visualizer/oscilloscope2D.js', 'src/visualizer/oscilloscope3D.js', 'src/main.js']) {
      expect(readFileSync(f, 'utf8')).not.toMatch(/onExtrema/);
    }
  });
});
