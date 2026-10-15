// @vitest-environment jsdom
// Phase 1 integration tests: the real src/main.js wiring, booted in jsdom with fake audio,
// a stubbed canvas, a mocked WebGL renderer and manually stepped animation frames.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { makeWav } from './helpers/fakeAudio.js';
import { bootApp } from './helpers/appHarness.js';

vi.mock('three', async (orig) => ({ ...(await orig()), WebGLRenderer: (await import('./helpers/appHarness.js')).FakeWebGLRenderer }));

let h;
beforeEach(async () => { h = await bootApp(); h.unlock(); h.step(); });
afterEach(() => vi.restoreAllMocks());

const text = (sel) => h.$(sel).textContent.trim();
const activeKeys = () => [...document.querySelectorAll('.piano-key-white.active, .piano-key-black.active')].map(k => k.dataset.note).sort();
const applyRatio = (v) => { h.$('#input-custom-ratio').value = v; h.click('#btn-apply-ratio'); };

describe('R1: drone lifecycle in the app', () => {
  it('R1: loading the MIDI demo silences the drone for the whole playback; eject brings it back', () => {
    const { audio } = h.app;
    expect(audio.voices.length).toBe(2);
    h.click('#btn-demo-midi');
    h.frames(60);
    expect(audio.voices.length).toBe(0);
    // user fiddles with sound controls during playback
    h.click('[data-timbre="tube"]'); h.click('#btn-mute'); h.click('#btn-mute'); h.click('#btn-tuning');
    h.frames(10);
    expect(audio.voices.length).toBe(0);
    h.click('#btn-player-eject');
    expect(audio.voices.length).toBe(2);
  });

  it('R1: a manual action (preset) during media re-enables the drone', () => {
    h.click('#btn-demo-midi'); h.frames(5);
    document.querySelectorAll('.preset-chip')[2].click();
    expect(h.app.state.isMediaActive).toBe(false);
    expect(h.app.audio.voices.length).toBe(3);
  });
});

describe('R11 / H / D: player wiring', () => {
  it('R11: the play button shows ▶ right after pause and after the track ends', () => {
    h.click('#btn-demo-midi'); h.frames(3);
    expect(text('#btn-player-play')).toBe('⏸');
    h.click('#btn-player-play');
    expect(text('#btn-player-play')).toBe('▶');
    h.click('#btn-player-play');
    expect(text('#btn-player-play')).toBe('⏸');
    h.click('#btn-player-loop');
    h.app.mediaImporter.seek(h.app.mediaImporter.currentMedia.duration - 0.05);
    h.frames(10);
    expect(text('#btn-player-play')).toBe('▶');
  });

  it('H: while playing, the scrubber seeks on change, not on every input event', () => {
    h.click('#btn-demo-midi'); h.frames(3);
    const seek = vi.spyOn(h.app.mediaImporter, 'seek');
    const s = h.$('#player-scrubber');
    for (const v of [10, 20, 30, 40]) { s.value = v; s.dispatchEvent(new Event('input', { bubbles: true })); }
    expect(seek).not.toHaveBeenCalled();
    s.dispatchEvent(new Event('change', { bubbles: true }));
    expect(seek).toHaveBeenCalledTimes(1);
    expect(h.app.mediaImporter.currentTime).toBeCloseTo(0.4 * h.app.mediaImporter.currentMedia.duration, 6);
  });

  it('H: while paused, dragging the scrubber previews (seeks on input)', () => {
    h.click('#btn-demo-midi'); h.frames(3);
    h.click('#btn-player-play'); // pause
    const seek = vi.spyOn(h.app.mediaImporter, 'seek');
    const s = h.$('#player-scrubber');
    s.value = 50; s.dispatchEvent(new Event('input', { bubbles: true }));
    expect(seek).toHaveBeenCalledTimes(1);
  });

  it('H: the scrubber thumb is not overwritten by playback while the user drags it', () => {
    h.click('#btn-demo-midi'); h.frames(3);
    const s = h.$('#player-scrubber');
    s.value = 80; s.dispatchEvent(new Event('input', { bubbles: true }));
    h.frames(5);
    expect(Number(s.value)).toBe(80);
    s.dispatchEvent(new Event('change', { bubbles: true }));
    h.frames(2);
    expect(Number(s.value)).toBeGreaterThan(79);
  });

  it('D: hiding the tab pauses media and releases MIDI voices', () => {
    h.click('#btn-demo-midi'); h.frames(30);
    expect(h.app.mediaImporter.activeMidiVoices.size).toBeGreaterThan(0);
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(h.app.mediaImporter.isPlaying).toBe(false);
    expect(h.app.mediaImporter.activeMidiVoices.size).toBe(0);
    expect(text('#btn-player-play')).toBe('▶');
    delete document.hidden;
  });

  it('D: a long gap between frames advances the visual clock by at most 0.1 s worth', () => {
    const before = h.app.state.time;
    h.step(5000);
    const advanced = h.app.state.time - before;
    expect(advanced).toBeGreaterThan(0);
    // visual speed at 261.6 Hz = 1 + log10(261.6/30) ≈ 1.94 cycles/s
    expect(advanced).toBeLessThanOrEqual(0.1 * (1 + Math.log10(261.6256 / 30)) + 1e-9);
  });
});

describe('E: media callbacks only touch the DOM on change', () => {
  function observe(selectors) {
    const records = [];
    const mo = new MutationObserver(r => records.push(...r));
    selectors.forEach(s => mo.observe(h.$(s), { subtree: true, childList: true, characterData: true, attributes: true }));
    return { count: () => { records.push(...mo.takeRecords()); return records.length; }, reset: () => { mo.takeRecords(); records.length = 0; } };
  }

  it('E: a steady MIDI chord causes no header/info/piano DOM writes frame after frame', () => {
    h.click('#btn-demo-midi');
    h.frames(30); // ~0.5 s into the first step (C4+G4, 2 s long)
    const obs = observe(['#harmonic-header', '#harmonic-info-card', '#piano-keyboard']);
    obs.reset();
    h.frames(30);
    expect(obs.count()).toBe(0);
  });

  it('E: the player time label is written only when the displayed second changes', () => {
    h.click('#btn-demo-midi'); h.frames(2);
    const obs = observe(['#player-time-current', '#player-time-total', '#btn-player-play']);
    obs.reset();
    h.frames(30, 16); // 0.48 s: the label changes at most once
    expect(obs.count()).toBeLessThanOrEqual(1);
  });

  it('E: X-Y audio mode writes the header once, not every frame', async () => {
    h.click('#btn-demo-audio');
    await new Promise(r => setTimeout(r, 0));
    h.frames(5);
    const obs = observe(['#harmonic-header', '#harmonic-info-card']);
    obs.reset();
    h.frames(30);
    expect(obs.count()).toBe(0);
  });
});

describe('R13 / R21 / R22: notes, names and piano selection', () => {
  it("R13: the matrix Octave card loads C + C' and selects both piano keys", () => {
    h.click('#btn-tab-matrix');
    document.querySelector('.interval-card').click();
    expect(h.app.state.notes).toEqual(['C', "C'"]);
    expect(activeKeys()).toEqual(['C', "C'"]);
    expect(text('#header-notes-badge')).toMatch(/C'/);
  });

  it('R22: after a custom ratio, a piano key starts a fresh selection', () => {
    applyRatio('4:5:6');
    expect(activeKeys()).toEqual([]);
    h.$('[data-note="A"]').click();
    expect(h.app.state.notes).toEqual(['A']);
    expect(text('#header-category')).toBe('ROOT NOTE');
  });

  it('R22: during MIDI playback the piano shows (and later builds on) the sounding notes', () => {
    document.querySelectorAll('.preset-chip')[3].click(); // minor triad C Eb G: must not leak into the MIDI selection
    h.click('#btn-demo-midi'); h.frames(30); // C4 + G4
    expect(activeKeys()).toEqual(['C', 'G']);
    h.$('[data-note="E"]').click();
    expect(h.app.state.notes).toEqual(['C', 'E', 'G']);
    expect(text('#header-title')).toBe('4 : 5 : 6');
  });

  it('R21: pitch mode shows the detected frequency in the badge (flat note names)', async () => {
    await h.uploadFile('a3.wav', makeWav({ channels: 1, seconds: 2, fn: t => [0.5 * Math.sin(2 * Math.PI * 220 * t)] }));
    h.click('#btn-audio-mode-pitch');
    h.frames(20, 50);
    const title = text('#header-title');
    const hz = parseFloat(title);
    expect(hz).toBeGreaterThan(215);
    expect(hz).toBeLessThan(225);
    expect(text('#header-notes-badge')).toContain(`${hz.toFixed(1)} Hz`);
    expect(text('#header-category')).toMatch(/A3/);
  });

  it('R21: X-Y mode does not show the previous preset notes in the badge', async () => {
    h.click('#btn-demo-audio');
    await new Promise(r => setTimeout(r, 0));
    h.frames(3);
    expect(text('#header-notes-badge')).not.toMatch(/261\.6|392\.4/);
  });
});

describe('R25 / R26 / R27: imports', () => {
  it('R25: a failed import clears the player title and returns to manual mode', async () => {
    h.click('#btn-demo-midi'); h.frames(3);
    await h.uploadFile('broken.mid', new Uint8Array([1, 2, 3]));
    expect(window.alert).toHaveBeenCalled();
    expect(text('#player-track-title')).toBe('No Track Loaded');
    expect(h.$('#media-player-bar').classList.contains('hidden')).toBe(true);
    expect(h.app.state.isMediaActive).toBe(false);
    expect(h.app.audio.voices.length).toBeGreaterThan(0);
  });

  it('R26: audio meta shows the file sample rate, or labels the context rate', async () => {
    h.app.audio.ctx.sampleRate = 48000;
    await h.uploadFile('a.wav', makeWav({ seconds: 1, sampleRate: 44100 }));
    expect(text('#player-track-meta')).toMatch(/44\.1 kHz/);
    expect(text('#player-track-meta')).not.toMatch(/context/);
    const odd = new Uint8Array(makeWav({ seconds: 1 }));
    odd.set([0x78, 0x78, 0x78, 0x20], 12);
    await h.uploadFile('b.wav', odd);
    expect(text('#player-track-meta')).toMatch(/48\.0 kHz \(context rate\)/);
  });

  it('R27: the file input accept list comes from the shared format list', async () => {
    const { ACCEPT_ATTR } = await import('../src/audio/audioFormats.js');
    expect(h.$('#file-media-input').getAttribute('accept')).toBe(ACCEPT_ATTR);
  });
});

describe('R3 / R28: matrix tab', () => {
  it('R3: entering the matrix collapses the panel; leaving restores it', () => {
    const panel = h.$('#controls-panel');
    expect(panel.classList.contains('collapsed')).toBe(false);
    h.click('#btn-tab-matrix');
    expect(panel.classList.contains('collapsed')).toBe(true);
    h.click('#btn-tab-lab');
    expect(panel.classList.contains('collapsed')).toBe(false);
  });

  it('R3: a panel the user collapsed stays collapsed after leaving the matrix', () => {
    h.click('#btn-collapse-panel');
    h.click('#btn-tab-matrix');
    h.click('#btn-tab-lab');
    expect(h.$('#controls-panel').classList.contains('collapsed')).toBe(true);
  });

  it('R28: the matrix is not redrawn every frame', () => {
    h.click('#btn-tab-matrix');
    h.frames(2);
    const cards = [...document.querySelectorAll('.card-canvas')].map(c => c.getContext('2d'));
    const count = () => cards.reduce((n, c) => n + c.calls.length, 0);
    const before = count();
    h.frames(30);
    expect(count()).toBe(before);
  });
});
