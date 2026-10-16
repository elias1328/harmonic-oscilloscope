// @vitest-environment jsdom
// Phase 6: live MIDI keyboard in the real app (jsdom, fake Web Audio, fake Web MIDI).
import { describe, it, expect, afterEach, vi } from 'vitest';
import { bootApp } from './helpers/appHarness.js';
import { makeFakeMidi } from './helpers/fakeMidi.js';

vi.mock('three', async (orig) => ({ ...(await orig()), WebGLRenderer: (await import('./helpers/appHarness.js')).FakeWebGLRenderer }));

afterEach(() => vi.restoreAllMocks());

const ET = (m) => 440 * Math.pow(2, (m - 69) / 12);
const on = (fake, note, vel = 100, ch = 0, dev = 'kb1') => fake.send(dev, [0x90 | ch, note, vel]);
const off = (fake, note, ch = 0, dev = 'kb1') => fake.send(dev, [0x80 | ch, note, 0]);

async function live(opts = {}) {
  const fake = makeFakeMidi(opts);
  const h = await bootApp({ midi: fake, storage: opts.storage });
  h.unlock();
  h.step();
  h.click('#btn-midi-keyboard');
  await h.settle();
  return { h, fake, kb: h.app.live };
}
const text = (h, sel) => h.$(sel).textContent.trim();
// voice frequencies of the held notes, keyed by MIDI note
const freqs = (kb) => Object.fromEntries([...kb.synth.voices.entries()].map(([n, v]) => [n.midi, v.oscs[0].frequency.value]));

describe('G6.2 / G6.9: the MIDI Keyboard control', () => {
  it('G6.2: unsupported browser: the button is disabled with the browser hint', async () => {
    const h = await bootApp();
    const btn = h.$('#btn-midi-keyboard');
    expect(btn.disabled).toBe(true);
    expect(text(h, '#midi-status')).toBe("Web MIDI isn't supported in this browser — use Chrome, Edge or Firefox");
  });

  it('G6.2: permission denied shows a visible message', async () => {
    const { h } = await live({ deny: true });
    expect(text(h, '#midi-status')).toMatch(/blocked/i);
    expect(h.$('#midi-status').hidden).toBe(false);
    expect(h.$('#btn-midi-keyboard').dataset.state).toBe('error');
  });

  it('G6.9: connected shows the device name; with several inputs a picker offers All inputs + each, and persists', async () => {
    const one = await live();
    expect(one.h.$('#btn-midi-keyboard').dataset.state).toBe('connected');
    expect(text(one.h, '#midi-status')).toMatch(/Fake Keys 49/);
    expect(one.h.$('#midi-device').hidden).toBe(true);

    const two = await live({ devices: [{ id: 'a', name: 'Keys A' }, { id: 'b', name: 'Pads B' }] });
    const sel = two.h.$('#midi-device');
    expect(sel.hidden).toBe(false);
    expect([...sel.options].map(o => o.textContent)).toEqual(['All inputs', 'Keys A', 'Pads B']);
    sel.value = 'b';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    expect(localStorage.getItem('harmonic.midiDevice')).toBe('b');
    on(two.fake, 60, 100, 0, 'a'); // ignored: not the chosen device
    expect(two.kb.synth.voices.size).toBe(0);
    on(two.fake, 60, 100, 0, 'b');
    expect(two.kb.synth.voices.size).toBe(1);

    const again = await live({ devices: [{ id: 'a', name: 'Keys A' }, { id: 'b', name: 'Pads B' }], storage: { 'harmonic.midiDevice': 'b' } });
    expect(again.h.$('#midi-device').value).toBe('b');
  });
});

describe('G6.4: latency', () => {
  it('G6.4: the voice exists as soon as onmidimessage returns (no animation frame needed)', async () => {
    const { fake, kb } = await live();
    on(fake, 60, 100);
    expect(kb.synth.voices.size).toBe(1);
    const v = [...kb.synth.voices.values()][0];
    expect(v.oscs[0].started).toBe(true);
  });
});

describe('G6.5: held notes drive the chord model', () => {
  it('G6.5: C-E-G gives 4 : 5 : 6 in the header and the piano; releasing all gives SILENCE', async () => {
    const { h, fake } = await live();
    on(fake, 60); on(fake, 64); on(fake, 67);
    h.step();
    expect(text(h, '#header-title')).toBe('4 : 5 : 6');
    const keys = [...document.querySelectorAll('.piano-key-white.active, .piano-key-black.active')].map(k => k.dataset.note).sort();
    expect(keys).toEqual(['C', 'E', 'G']);
    expect(h.app.state.chord.source).toBe('live');
    off(fake, 60); off(fake, 64); off(fake, 67);
    h.step();
    expect(text(h, '#header-title')).toBe('SILENCE');
  });

  it('G6.5: a staggered C → C+E → C+E+G within 40 ms leaves exactly one tunnel ring "4 : 5 : 6"', async () => {
    const { h, fake } = await live();
    h.click('#btn-tunnel');
    await h.settle();
    h.frames(10);
    const t = h.app.visualizer3D.tunnel;
    const before = t.markersCreated;
    on(fake, 60); h.step(15);
    on(fake, 64); h.step(15);
    on(fake, 67);
    h.frames(40, 16); // 0.64 s
    expect(t.markersCreated - before).toBe(1);
    expect(t.markerLabels.at(-1)).toBe('4 : 5 : 6');
  });
});

describe('G6.6: tuning', () => {
  it('G6.6: 12-TET gives piano pitches 440·2^((m−69)/12)', async () => {
    const { h, fake, kb } = await live();
    h.click('#btn-tuning'); // -> 12-TET
    for (const m of [21, 48, 60, 64, 67, 69, 108]) on(fake, m);
    Object.entries(freqs(kb)).forEach(([m, f]) => expect(Math.abs(f - ET(+m))).toBeLessThan(0.01));
  });

  it('G6.6: JI: C4 E4 G4 = [261.63, 327.03, 392.44]; the lowest keeps its 12-TET pitch', async () => {
    const { fake, kb } = await live();
    on(fake, 60); on(fake, 64); on(fake, 67);
    const f = freqs(kb);
    expect(Math.abs(f[60] - 261.63)).toBeLessThan(0.05);
    expect(Math.abs(f[64] - 327.03)).toBeLessThan(0.05);
    expect(Math.abs(f[67] - 392.44)).toBeLessThan(0.05);
    expect(Math.abs(f[60] - ET(60))).toBeLessThan(0.01);
  });

  it('G6.6: toggling tuning while held retunes the same oscillators with a glide ≤ 30 ms', async () => {
    const { h, fake, kb } = await live();
    on(fake, 60); on(fake, 64); on(fake, 67);
    const oscs = [...kb.synth.voices.values()].map(v => v.oscs[0]);
    const ctx = h.app.audio.ctx;
    h.click('#btn-tuning'); // -> 12-TET
    expect([...kb.synth.voices.values()].map(v => v.oscs[0])).toEqual(oscs); // same objects
    oscs.forEach(o => expect(o.stopped).toBe(false));
    const f = freqs(kb);
    expect(Math.abs(f[64] - ET(64))).toBeLessThan(0.01);
    expect(Math.abs(f[67] - ET(67))).toBeLessThan(0.01);
    const ramp = oscs[1].frequency.calls.filter(c => c.method === 'linear').at(-1);
    expect(ramp.time - ctx.currentTime).toBeGreaterThan(0);
    expect(ramp.time - ctx.currentTime).toBeLessThanOrEqual(0.03);
  });

  it('G6.6: adding a lower note retunes the held ones (same oscillators, glide)', async () => {
    const { h, fake, kb } = await live();
    on(fake, 64); on(fake, 67); // E4 + G4: 6 : 5 above E
    const oscE = [...kb.synth.voices.entries()].find(([n]) => n.midi === 64)[1].oscs[0];
    expect(Math.abs(freqs(kb)[64] - ET(64))).toBeLessThan(0.01); // E is the lowest: 12-TET pitch
    on(fake, 60); // C4 below: E becomes 5/4 of C
    expect([...kb.synth.voices.entries()].find(([n]) => n.midi === 64)[1].oscs[0]).toBe(oscE);
    expect(Math.abs(freqs(kb)[64] - 327.03)).toBeLessThan(0.05);
    const ramp = oscE.frequency.calls.filter(c => c.method === 'linear').at(-1);
    expect(ramp.time - h.app.audio.ctx.currentTime).toBeLessThanOrEqual(0.03);
  });

  it('G6.6: the figure uses the same frequencies: closed in JI, precessing in 12-TET', async () => {
    const { h, fake, kb } = await live();
    on(fake, 60); on(fake, 64); on(fake, 67);
    h.step();
    const fig = h.app.figure;
    expect(fig.closed).toBe(true);
    const f = freqs(kb);
    fig.model.freqs.forEach((x, i) => expect(Math.abs(x - [f[60], f[64], f[67]][i])).toBeLessThan(1e-6));
    h.click('#btn-tuning');
    h.step();
    expect(fig.closed).toBe(false);
    const g = freqs(kb);
    fig.model.freqs.forEach((x, i) => expect(Math.abs(x - [g[60], g[64], g[67]][i])).toBeLessThan(1e-6));
  });
});

describe('G6.7: velocity and Keyboard sound', () => {
  it('G6.7: velocity maps monotonically to gain through the shared voice factory and timbre', async () => {
    const { h, fake, kb } = await live();
    h.click('[data-timbre="epiano"]');
    const gains = [];
    for (const [i, vel] of [10, 40, 64, 100, 127].entries()) {
      on(fake, 60 + i, vel);
      const v = [...kb.synth.voices.entries()].find(([n]) => n.midi === 60 + i)[1];
      expect(v.oscs.length).toBe(2); // e-piano: fundamental + 3rd harmonic
      gains.push(v.gain.gain.value);
    }
    for (let i = 1; i < gains.length; i++) expect(gains[i]).toBeGreaterThan(gains[i - 1]);
  });

  it('G6.7: Keyboard sound off = visuals only; the setting persists', async () => {
    const { h, fake, kb } = await live();
    h.click('#btn-keyboard-sound');
    expect(localStorage.getItem('harmonic.liveSound')).toBe('off');
    on(fake, 60); on(fake, 64);
    h.step();
    expect(kb.synth.voices.size).toBe(0);
    expect(text(h, '#header-title')).toBe('5 : 4');
    h.click('#btn-keyboard-sound'); // back on: the held notes start sounding
    expect(kb.synth.voices.size).toBe(2);
    const again = await live({ storage: { 'harmonic.liveSound': 'off' } });
    expect(again.h.$('#btn-keyboard-sound').getAttribute('aria-pressed')).toBe('false');
    on(again.fake, 60);
    expect(again.kb.synth.voices.size).toBe(0);
  });
});

describe('G6.8: interplay with files, the drone and manual actions', () => {
  it('G6.8: the first note pauses a playing file and silences the drone; it stays off while live', async () => {
    const { h, fake } = await live();
    h.click('#btn-demo-midi'); h.frames(5);
    expect(h.app.mediaImporter.isPlaying).toBe(true);
    on(fake, 60);
    expect(h.app.mediaImporter.isPlaying).toBe(false);
    h.step();
    expect(h.app.state.live).toBe(true);
    expect(h.app.state.media).toBe(null);
    expect(h.app.audio.voices.length).toBe(0);
    h.click('#btn-tuning'); h.click('[data-timbre="tube"]'); h.click('#btn-mute'); h.click('#btn-mute');
    expect(h.app.audio.voices.length).toBe(0);
  });

  it('G6.8: a preset or an on-screen piano key leaves live mode and restores the drone', async () => {
    const { h, fake, kb } = await live();
    on(fake, 60); on(fake, 67); h.step();
    expect(h.app.audio.voices.length).toBe(0);
    document.querySelectorAll('.preset-chip')[2].click(); h.flush();
    expect(h.app.state.live).toBe(false);
    expect(kb.synth.voices.size).toBe(0);
    expect(h.app.audio.voices.length).toBe(3);
    on(fake, 62); h.step();
    expect(h.app.state.live).toBe(true);
    h.$('[data-note="A"]').click(); h.flush();
    expect(h.app.state.live).toBe(false);
    expect(h.app.audio.voices.length).toBeGreaterThan(0);
  });

  it('G6.8: loading a file leaves live mode', async () => {
    const { h, fake } = await live();
    on(fake, 60); h.step();
    h.click('#btn-demo-midi'); h.frames(2);
    expect(h.app.state.live).toBe(false);
    expect(h.app.mediaImporter.isPlaying).toBe(true);
  });
});

describe('G6.3 / G6.2 in the app: sustain, all-notes-off, clock, hot-plug', () => {
  it('G6.3: CC64 holds released notes until the pedal goes up', async () => {
    const { h, fake, kb } = await live();
    fake.send('kb1', [0xb0, 64, 127]);
    on(fake, 60); on(fake, 64); off(fake, 60); off(fake, 64);
    h.step();
    expect(kb.synth.voices.size).toBe(2);
    expect(text(h, '#header-title')).toBe('5 : 4');
    fake.send('kb1', [0xb0, 64, 0]);
    h.step();
    expect(kb.synth.voices.size).toBe(0);
    expect(text(h, '#header-title')).toBe('SILENCE');
  });

  it('G6.3: CC123 releases every note; clock / active sensing change nothing', async () => {
    const { h, fake, kb } = await live();
    on(fake, 60); on(fake, 64, 90, 3);
    h.step();
    const set = vi.spyOn(h.app.store, 'set');
    for (let i = 0; i < 100; i++) { fake.send('kb1', [0xf8]); fake.send('kb1', [0xfe]); }
    expect(set).not.toHaveBeenCalled();
    fake.send('kb1', [0xb0, 123, 0]);
    expect(kb.synth.voices.size).toBe(0);
  });

  it('G6.2: unplugging a device releases its held notes and updates the status', async () => {
    const { h, fake, kb } = await live({ devices: [{ id: 'kb1', name: 'Fake Keys 49' }, { id: 'p2', name: 'Pads' }] });
    on(fake, 60); on(fake, 64, 100, 0, 'p2');
    expect(kb.synth.voices.size).toBe(2);
    fake.unplug('kb1');
    h.flush();
    expect(kb.synth.voices.size).toBe(1);
    expect([...kb.synth.voices.keys()][0].midi).toBe(64);
    expect([...h.$('#midi-device').options].map(o => o.textContent)).toEqual(['All inputs', 'Pads']);
  });
});
