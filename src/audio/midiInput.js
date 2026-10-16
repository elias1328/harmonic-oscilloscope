// Web MIDI input: connects to hardware keyboards through navigator.requestMIDIAccess, parses
// their messages and reports devices as they are plugged in or out.

export const UNSUPPORTED_MSG = "Web MIDI isn't supported in this browser — use Chrome, Edge or Firefox";
export const DENIED_MSG = 'MIDI access was blocked — allow MIDI for this site in the browser settings, then try again';

/**
 * Parse one MIDI message (array of bytes). Returns null for everything the app ignores
 * (clock 0xF8, active sensing 0xFE and all other system messages, pitch bend, aftertouch, …).
 */
export function parseMidiMessage(data) {
  if (!data || data.length === 0) return null;
  const status = data[0];
  if (status >= 0xf0) return null; // system realtime/common: no state change, no work
  const type = status & 0xf0;
  const channel = status & 0x0f;
  if (type === 0x90 && data.length >= 3) {
    return data[2] > 0
      ? { type: 'noteon', channel, note: data[1], velocity: data[2] }
      : { type: 'noteoff', channel, note: data[1], velocity: 0 };
  }
  if (type === 0x80 && data.length >= 3) return { type: 'noteoff', channel, note: data[1], velocity: data[2] };
  if (type === 0xb0 && data.length >= 3) {
    if (data[1] === 64) return { type: 'sustain', channel, on: data[2] >= 64 };
    if (data[1] === 123 || data[1] === 120) return { type: 'allnotesoff', channel };
  }
  return null;
}

export class MidiInput {
  /**
   * @param requestMIDIAccess  navigator.requestMIDIAccess (bound), or undefined when unsupported
   * @param onEvent(event, deviceId)  parsed messages, called synchronously inside onmidimessage
   * @param onDeviceGone(deviceId)    a device was unplugged
   * @param onStatus({ state, message, devices, device })  'off' | 'connecting' | 'connected' | 'error' | 'unsupported'
   */
  constructor({ requestMIDIAccess, onEvent = () => {}, onDeviceGone = () => {}, onStatus = () => {}, device = 'all' } = {}) {
    this.request = requestMIDIAccess;
    this.onEvent = onEvent;
    this.onDeviceGone = onDeviceGone;
    this.onStatus = onStatus;
    this.device = device;
    this.access = null;
    this.state = this.supported ? 'off' : 'unsupported';
  }

  get supported() {
    return typeof this.request === 'function';
  }

  devices() {
    if (!this.access) return [];
    return [...this.access.inputs.values()].filter(i => i.state !== 'disconnected').map(i => ({ id: i.id, name: i.name || 'MIDI input' }));
  }

  emit(message = '') {
    this.onStatus({ state: this.state, message, devices: this.devices(), device: this.device });
  }

  async connect() {
    if (!this.supported) {
      this.state = 'unsupported';
      this.emit(UNSUPPORTED_MSG);
      return false;
    }
    this.state = 'connecting';
    this.emit();
    try {
      this.access = await this.request({ sysex: false });
    } catch (err) {
      this.state = 'error';
      this.emit(err && err.name === 'SecurityError' || /denied|permission/i.test(String(err && err.message)) ? DENIED_MSG : `Could not open MIDI: ${err && err.message ? err.message : err}`);
      return false;
    }
    this.access.onstatechange = (e) => this.onStateChange(e);
    this.state = 'connected';
    this.bind();
    this.emit();
    return true;
  }

  /** 'all' or one device id. */
  setDevice(id) {
    this.device = id || 'all';
    this.bind();
    if (this.access) this.emit();
  }

  bind() {
    if (!this.access) return;
    for (const input of this.access.inputs.values()) {
      const listen = this.device === 'all' || input.id === this.device;
      input.onmidimessage = listen ? (e) => {
        const ev = parseMidiMessage(e.data);
        if (ev) this.onEvent(ev, input.id);
      } : null;
    }
  }

  onStateChange(e) {
    const port = e && e.port;
    if (port && port.type === 'input' && port.state === 'disconnected') this.onDeviceGone(port.id);
    this.bind();
    this.emit();
  }

  disconnect() {
    if (this.access) {
      for (const input of this.access.inputs.values()) input.onmidimessage = null;
      this.access.onstatechange = null;
    }
    this.access = null;
    this.state = this.supported ? 'off' : 'unsupported';
    this.emit();
  }
}
