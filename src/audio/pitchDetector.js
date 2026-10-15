// Real-time pitch detector using autocorrelation for audio files (MP3, WAV, etc.)
// Accurately extracts fundamental frequencies and maps them to musical notes and harmonic ratios.

import { NOTE_NAMES } from '../math/harmonics.js';

export function autoCorrelate(buf, sampleRate) {
  const SIZE = buf.length;
  // Calculate RMS amplitude to avoid detecting noise
  let sumSquares = 0;
  for (let i = 0; i < SIZE; i++) {
    const val = buf[i];
    sumSquares += val * val;
  }
  const rms = Math.sqrt(sumSquares / SIZE);
  if (rms < 0.015) {
    // Too quiet or silent
    return -1;
  }

  // Trim to first positive crossing
  let r1 = 0;
  let r2 = SIZE - 1;
  const thres = 0.2;
  for (let i = 0; i < SIZE / 2; i++) {
    if (Math.abs(buf[i]) < thres) {
      r1 = i;
      break;
    }
  }
  for (let i = 1; i < SIZE / 2; i++) {
    if (Math.abs(buf[SIZE - i]) < thres) {
      r2 = SIZE - i;
      break;
    }
  }

  const trimmedBuf = buf.slice(r1, r2);
  const c = new Float32Array(trimmedBuf.length);
  for (let lag = 0; lag < trimmedBuf.length; lag++) {
    let sum = 0;
    for (let i = 0; i < trimmedBuf.length - lag; i++) {
      sum += trimmedBuf[i] * trimmedBuf[i + lag];
    }
    c[lag] = sum;
  }

  // Find the peak after the first dip
  let d = 0;
  while (d < c.length - 1 && c[d] > c[d + 1]) {
    d++;
  }
  let maxval = -1;
  let maxpos = -1;
  for (let i = d; i < c.length; i++) {
    if (c[i] > maxval) {
      maxval = c[i];
      maxpos = i;
    }
  }

  if (maxpos <= 0) return -1;

  // Parabolic interpolation around peak
  let T0 = maxpos;
  const x1 = c[T0 - 1];
  const x2 = c[T0];
  const x3 = c[T0 + 1];
  const a = (x1 + x3 - 2 * x2) / 2;
  const b = (x3 - x1) / 2;
  if (a) {
    T0 = T0 - b / (2 * a);
  }

  const freq = sampleRate / T0;
  if (freq >= 40 && freq <= 3000) {
    return freq;
  }
  return -1;
}

// Map frequency to nearest MIDI note number and name, using the app-wide (flat) note names

export function freqToMidi(freq) {
  if (freq <= 0) return null;
  const midi = Math.round(69 + 12 * Math.log2(freq / 440));
  const octave = Math.floor(midi / 12) - 1;
  const name = NOTE_NAMES[((midi % 12) + 12) % 12];
  return {
    midi,
    name: `${name}${octave}`,
    pitchClass: name,
    octave,
    cents: Math.round(1200 * Math.log2(freq / (440 * Math.pow(2, (midi - 69) / 12))))
  };
}
