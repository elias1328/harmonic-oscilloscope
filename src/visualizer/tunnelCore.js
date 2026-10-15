// Waterfall Time Tunnel — the parts that need no WebGL (unit-tested): the slice ring buffer, the
// depth and fade mapping (mirrored by the GPU shader in timeTunnel.js), what a slice contains,
// and the tunnel's clock.

import { closedCurve, makeProjector, project } from '../render/lissajous.js';

export const SLICE_POINTS = 256;
export const CAPTURE_HZ = 30;
export const MAX_SLICES = 480; // preallocated; the History control only changes the visible count
export const DEFAULT_SLICES = 240;
export const DEFAULT_SPEED = 2; // tunnel depth units per second
const XY_COLOR = [0.18, 0.8, 0.44];
// Clearing moves tunnel time this far ahead (≫ the 16 s maximum history, small enough for float32).
const CLEAR_GAP = 1024;

/** Depth of a slice: z = (birthTime − now)·speed (older slices are further back, z < 0). */
export function sliceZ(birth, now, speed) {
  return (birth - now) * speed;
}

/** Fade with age: 1 when new, strictly decreasing, 0 from `history` seconds on. */
export function sliceAlpha(age, history) {
  if (age < 0 || age >= history) return 0;
  return Math.pow(1 - age / history, 1.6);
}

/**
 * Ring of `capacity` slices of SLICE_POINTS vertices each, in flat typed arrays that map 1:1 onto
 * the GPU attributes (position xyz, birthTime, colour rgb). Pushing writes one slot in place.
 */
export class SliceRing {
  constructor(capacity = MAX_SLICES, points = SLICE_POINTS) {
    this.capacity = capacity;
    this.points = points;
    this.positions = new Float32Array(capacity * points * 3);
    this.births = new Float32Array(capacity * points).fill(-1e9);
    this.colors = new Float32Array(capacity * points * 3);
    this.slotBirth = new Float64Array(capacity).fill(-Infinity);
    this.head = 0; // next slot to write
    this.count = 0;
    this.history = Math.min(DEFAULT_SLICES, capacity);
  }

  /** Visible history in slices (≤ capacity). Nothing is reallocated. */
  setHistory(n) {
    this.history = Math.max(1, Math.min(this.capacity, Math.round(n)));
  }

  /** Write a slice; returns the written slot (vertex range [slot·P, slot·P + P)). */
  push(points, color, birth) {
    const slot = this.head;
    const P = this.points;
    const base = slot * P;
    for (let i = 0; i < P; i++) {
      const p = points[Math.min(i, points.length - 1)];
      this.positions[(base + i) * 3] = p[0];
      this.positions[(base + i) * 3 + 1] = p[1];
      this.positions[(base + i) * 3 + 2] = 0;
      this.births[base + i] = birth;
      this.colors[(base + i) * 3] = color[0];
      this.colors[(base + i) * 3 + 1] = color[1];
      this.colors[(base + i) * 3 + 2] = color[2];
    }
    this.slotBirth[slot] = birth;
    this.head = (slot + 1) % this.capacity;
    this.count = Math.min(this.capacity, this.count + 1);
    return slot;
  }

  birthOf(slot) {
    return this.slotBirth[slot];
  }

  /** Slots in chronological order (oldest first). */
  ordered() {
    const out = [];
    const start = (this.head - this.count + this.capacity) % this.capacity;
    for (let i = 0; i < this.count; i++) out.push((start + i) % this.capacity);
    return out;
  }
}

/**
 * Tunnel time. With media it is the media clock (pause freezes it); without media the wall clock.
 * A jump (seek, loop, eject, media change) clears the tunnel by moving an epoch far ahead, so
 * every older slice ages out at once — no buffer needs rewriting.
 */
export class TunnelClock {
  constructor() {
    this.epoch = 0;
    this.last = null; // { now, media }
  }

  update(mediaTime, wallTime) {
    const media = mediaTime !== null && mediaTime !== undefined;
    const base = media ? mediaTime : wallTime;
    let cleared = false;
    if (this.last) {
      const jumped = media !== this.last.media || base < this.last.base || base - this.last.base > 0.5;
      if (jumped) {
        this.epoch += this.last.now - (base + this.epoch) + CLEAR_GAP;
        cleared = true;
      }
    }
    const now = base + this.epoch;
    this.last = { now, base, media };
    return { now, cleared };
  }

  /** Clear now (e.g. the tunnel was switched on again). */
  clear() {
    this.epoch += CLEAR_GAP;
    if (this.last) this.last.now += CLEAR_GAP;
  }
}

/** Evenly decimate an X-Y window to n points (first and last kept). */
export function decimate(win, n = SLICE_POINTS) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const p = win[Math.round((i * (win.length - 1)) / (n - 1))];
    out.push([p.x, p.y]);
  }
  return out;
}

const hexToRgb = (hex) => {
  const c = parseInt(String(hex || '#ffffff').replace('#', ''), 16);
  return [((c >> 16) & 255) / 255, ((c >> 8) & 255) / 255, (c & 255) / 255];
};

/**
 * What one slice shows:
 * - audio (X-Y): the current X-Y window, decimated;
 * - a just-intonation or MIDI chord: one exact closed period (the chord's shape);
 * - a manual chord in 12-TET: a 1/f_fund window of the real, precessing motion from now.
 * Colour: the average of the voice colours.
 */
export function buildSlice({ state, figure, t, xyPoints }) {
  const { chord } = state;
  if (chord.source === 'xy') {
    if (!xyPoints || !xyPoints.length) return null;
    return { points: decimate(xyPoints), color: XY_COLOR, window: 0 };
  }
  if (!figure || !figure.size) return null;
  const rgb = chord.voices.map(v => hexToRgb(v.color));
  const color = [0, 1, 2].map(j => rgb.reduce((s, c) => s + c[j], 0) / rgb.length);
  const P = SLICE_POINTS;
  if (figure.closed || chord.source !== 'manual') {
    return { points: closedCurve(figure.ratioInts, figure.deltas, 2, P - 1).map(p => [p[0], p[1]]), color, window: figure.period };
  }
  const proj = makeProjector(figure.size, 2);
  const th0 = figure.phasesAt(t);
  const w = figure.model.freqs.map((_, i) => figure.model.omega(i));
  const T = figure.period;
  const points = [];
  for (let i = 0; i < P; i++) {
    const dt = (T * i) / (P - 1);
    const p = project(th0.map((ph, j) => ph + w[j] * dt), proj);
    points.push([p[0], p[1]]);
  }
  return { points, color, window: T };
}
