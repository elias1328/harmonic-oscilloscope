// Minimal fake Web Audio API for Node/jsdom tests.
// Ported from Agent/tests/media.test.mjs and extended with buffer sources, decoding,
// and bookkeeping (which oscillators are live, which nodes were disconnected).

export const audioLog = {
  created: { osc: 0, shaper: 0, panner: 0, gain: 0, filter: 0, source: 0 },
  oscillators: [],
  nodes: [],
  reset() {
    for (const k of Object.keys(this.created)) this.created[k] = 0;
    this.oscillators.length = 0;
    this.nodes.length = 0;
  },
  /** Oscillators that were started and not (yet) stopped. */
  live() {
    return this.oscillators.filter(o => o.started && !o.stopped);
  }
};

export class Param {
  constructor(v = 0) { this.value = v; this.history = []; this.calls = []; }
  _set(v, method, time) { this.value = v; this.history.push(v); this.calls.push({ method, value: v, time }); }
  setValueAtTime(v, t) { this._set(v, 'set', t); }
  linearRampToValueAtTime(v, t) { this._set(v, 'linear', t); }
  exponentialRampToValueAtTime(v, t) { this._set(v, 'exp', t); }
  setTargetAtTime(v, t) { this._set(v, 'target', t); }
  cancelScheduledValues(t) { this.calls.push({ method: 'cancel', time: t }); }
}

export class Node {
  constructor(kind = 'node') {
    this.kind = kind;
    this.disconnected = 0;
    this.connections = [];
    audioLog.nodes.push(this);
  }
  connect(dest) { this.connections.push(dest); return dest; }
  disconnect() { this.disconnected++; }
}

export class FakeAudioBuffer {
  constructor(numberOfChannels, length, sampleRate) {
    this.numberOfChannels = numberOfChannels;
    this.length = length;
    this.sampleRate = sampleRate;
    this.duration = length / sampleRate;
    this._data = Array.from({ length: numberOfChannels }, () => new Float32Array(length));
  }
  getChannelData(c) { return this._data[c]; }
}

export class FakeCtx {
  constructor() {
    this.currentTime = 0;
    this.state = 'running';
    this.sampleRate = FakeCtx.sampleRate;
    this.destination = new Node('destination');
  }
  createGain() { audioLog.created.gain++; const n = new Node('gain'); n.gain = new Param(1); return n; }
  createAnalyser() { const n = new Node('analyser'); n.frequencyBinCount = 512; n.getByteTimeDomainData = () => {}; return n; }
  createOscillator() {
    audioLog.created.osc++;
    const n = new Node('osc');
    n.frequency = new Param(440);
    n.type = 'sine';
    n.started = false;
    n.stopped = false;
    n.start = (when = 0) => { n.started = true; n.startTime = when; };
    n.stop = () => { n.stopped = true; };
    audioLog.oscillators.push(n);
    return n;
  }
  createStereoPanner() { audioLog.created.panner++; const n = new Node('panner'); n.pan = new Param(0); return n; }
  createWaveShaper() { audioLog.created.shaper++; return new Node('shaper'); }
  createBiquadFilter() { audioLog.created.filter++; const n = new Node('filter'); n.frequency = new Param(); n.Q = new Param(); return n; }
  createBuffer(ch, len, sr) { return new FakeAudioBuffer(ch, len, sr); }
  createBufferSource() {
    audioLog.created.source++;
    const n = new Node('source');
    n.playbackRate = new Param(1);
    n.buffer = null;
    n.loop = false;
    n.onended = null;
    n.started = false;
    n.stopped = false;
    n.start = (_when, offset = 0) => { n.started = true; n.startOffset = offset; };
    n.stop = () => { n.stopped = true; };
    return n;
  }
  // "Decodes" PCM WAV files (resampling to the context rate, like real browsers do).
  // Anything that is not a RIFF/WAVE file is rejected.
  async decodeAudioData(arrayBuffer) {
    const v = new DataView(arrayBuffer);
    const tag = (o) => String.fromCharCode(v.getUint8(o), v.getUint8(o + 1), v.getUint8(o + 2), v.getUint8(o + 3));
    if (arrayBuffer.byteLength < 44 || tag(0) !== 'RIFF' || tag(8) !== 'WAVE') {
      throw new DOMException('Unable to decode audio data', 'EncodingError');
    }
    const channels = v.getUint16(22, true);
    const fileRate = v.getUint32(24, true);
    const dataBytes = v.getUint32(40, true);
    const frames = dataBytes / (channels * 2);
    const seconds = frames / fileRate;
    const out = new FakeAudioBuffer(channels, Math.round(seconds * this.sampleRate), this.sampleRate);
    const sample = (i, c) => (i < frames ? v.getInt16(44 + (i * channels + c) * 2, true) / 32767 : 0);
    const step = fileRate / this.sampleRate;
    for (let c = 0; c < channels; c++) {
      const d = out.getChannelData(c);
      for (let i = 0; i < out.length; i++) {
        const x = i * step, i0 = Math.floor(x), f = x - i0;
        d[i] = sample(i0, c) * (1 - f) + sample(i0 + 1, c) * f;
      }
    }
    return out;
  }
  resume() { this.state = 'running'; return Promise.resolve(); }
}
FakeCtx.sampleRate = 44100;

export function installFakeAudio() {
  if (typeof globalThis.window === 'undefined') globalThis.window = {};
  globalThis.window.AudioContext = FakeCtx;
  return audioLog;
}

/** Builds a 16-bit PCM WAV file in memory. */
export function makeWav({ channels = 2, seconds = 1, sampleRate = 44100, fn = () => [0, 0] } = {}) {
  const n = Math.floor(sampleRate * seconds);
  const buf = new ArrayBuffer(44 + n * channels * 2);
  const v = new DataView(buf);
  const str = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF'); v.setUint32(4, 36 + n * channels * 2, true); str(8, 'WAVE');
  str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, channels, true);
  v.setUint32(24, sampleRate, true); v.setUint32(28, sampleRate * channels * 2, true);
  v.setUint16(32, channels * 2, true); v.setUint16(34, 16, true);
  str(36, 'data'); v.setUint32(40, n * channels * 2, true);
  for (let i = 0; i < n; i++) {
    const s = fn(i / sampleRate);
    for (let c = 0; c < channels; c++) {
      v.setInt16(44 + (i * channels + c) * 2, Math.round(Math.max(-1, Math.min(1, s[c] ?? 0)) * 32767), true);
    }
  }
  return buf;
}
