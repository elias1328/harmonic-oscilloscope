// Phase 6: Web MIDI input — message parsing (G6.3) and access / hot-plug (G6.2).
import { describe, it, expect, vi } from 'vitest';
import { parseMidiMessage, MidiInput, UNSUPPORTED_MSG } from '../src/audio/midiInput.js';
import { makeFakeMidi } from './helpers/fakeMidi.js';

const flush = () => new Promise(r => setTimeout(r, 0));

describe('G6.3: message parsing', () => {
  it('G6.3: note-on (0x9n, vel > 0) on all 16 channels', () => {
    for (let ch = 0; ch < 16; ch++) {
      expect(parseMidiMessage([0x90 | ch, 60, 100])).toEqual({ type: 'noteon', channel: ch, note: 60, velocity: 100 });
    }
  });

  it('G6.3: note-on with velocity 0 is a note-off; 0x8n is a note-off', () => {
    expect(parseMidiMessage([0x93, 64, 0])).toEqual({ type: 'noteoff', channel: 3, note: 64, velocity: 0 });
    expect(parseMidiMessage([0x8f, 67, 40])).toEqual({ type: 'noteoff', channel: 15, note: 67, velocity: 40 });
  });

  it('G6.3: CC64 sustain (≥ 64 = down) and CC123 all notes off', () => {
    expect(parseMidiMessage([0xb0, 64, 127])).toEqual({ type: 'sustain', channel: 0, on: true });
    expect(parseMidiMessage([0xb2, 64, 64])).toEqual({ type: 'sustain', channel: 2, on: true });
    expect(parseMidiMessage([0xb0, 64, 63])).toEqual({ type: 'sustain', channel: 0, on: false });
    expect(parseMidiMessage([0xb5, 123, 0])).toEqual({ type: 'allnotesoff', channel: 5 });
  });

  it('G6.3: clock, active sensing and other messages are ignored', () => {
    for (const m of [[0xf8], [0xfe], [0xfa], [0xfc], [0xa0, 60, 10], [0xe0, 0, 64], [0xb0, 1, 50], [0xc0, 5], []]) {
      expect(parseMidiMessage(m)).toBe(null);
    }
  });
});

describe('G6.2: Web MIDI access', () => {
  it('G6.2: unsupported browser -> status "unsupported" with the browser hint', async () => {
    const status = [];
    const mi = new MidiInput({ requestMIDIAccess: undefined, onStatus: (s) => status.push(s) });
    expect(mi.supported).toBe(false);
    await mi.connect();
    expect(status.at(-1).state).toBe('unsupported');
    expect(status.at(-1).message).toBe(UNSUPPORTED_MSG);
    expect(UNSUPPORTED_MSG).toBe("Web MIDI isn't supported in this browser — use Chrome, Edge or Firefox");
  });

  it('G6.2: asks with sysex: false; permission denied -> error status with a message', async () => {
    const fake = makeFakeMidi({ deny: true });
    const status = [];
    const mi = new MidiInput({ requestMIDIAccess: fake.requestMIDIAccess, onStatus: (s) => status.push(s) });
    await mi.connect();
    expect(fake.calls[0]).toEqual({ sysex: false });
    expect(status.map(s => s.state)).toEqual(['connecting', 'error']);
    expect(status.at(-1).message).toMatch(/blocked|denied|allow/i);
  });

  it('G6.2: connected lists the devices and forwards their messages', async () => {
    const fake = makeFakeMidi({ devices: [{ id: 'a', name: 'Keys A' }] });
    const events = [];
    const status = [];
    const mi = new MidiInput({ requestMIDIAccess: fake.requestMIDIAccess, onEvent: (e, dev) => events.push([e.type, e.note, dev]), onStatus: (s) => status.push(s) });
    await mi.connect();
    expect(status.at(-1)).toMatchObject({ state: 'connected', devices: [{ id: 'a', name: 'Keys A' }] });
    fake.send('a', [0x90, 60, 90]);
    fake.send('a', [0xf8]);
    expect(events).toEqual([['noteon', 60, 'a']]);
  });

  it('G6.2: hot-plug: statechange updates the list; unplugging releases that device', async () => {
    const fake = makeFakeMidi({ devices: [{ id: 'a', name: 'Keys A' }] });
    const gone = vi.fn();
    const status = [];
    const mi = new MidiInput({ requestMIDIAccess: fake.requestMIDIAccess, onDeviceGone: gone, onStatus: (s) => status.push(s) });
    await mi.connect();
    fake.plug('b', 'Pads B');
    expect(status.at(-1).devices.map(d => d.id)).toEqual(['a', 'b']);
    const events = [];
    mi.onEvent = (e, dev) => events.push(dev);
    fake.send('b', [0x90, 40, 80]);
    expect(events).toEqual(['b']); // the new device is bound at once
    fake.unplug('a');
    expect(gone).toHaveBeenCalledWith('a');
    expect(status.at(-1).devices.map(d => d.id)).toEqual(['b']);
  });

  it('G6.9: a chosen device filters messages; "all" listens to every input', async () => {
    const fake = makeFakeMidi({ devices: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }] });
    const events = [];
    const mi = new MidiInput({ requestMIDIAccess: fake.requestMIDIAccess, onEvent: (e, dev) => events.push(dev) });
    await mi.connect();
    fake.send('a', [0x90, 60, 90]); fake.send('b', [0x90, 61, 90]);
    mi.setDevice('b');
    fake.send('a', [0x90, 62, 90]); fake.send('b', [0x90, 63, 90]);
    expect(events).toEqual(['a', 'b', 'b']);
    await flush();
  });
});
