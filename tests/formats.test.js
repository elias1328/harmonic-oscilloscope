// R27: one accepted-format list shared by the file input, the drop overlay and the README.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { MEDIA_FORMATS, ACCEPT_ATTR, parseHeaderSampleRate } from '../src/audio/audioFormats.js';

const exts = (s) => [...new Set((s.match(/\.[a-z0-9]{2,4}\b/gi) || []).map(x => x.toLowerCase()))].sort();
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');
const sorted = [...MEDIA_FORMATS].sort();

describe('R27: accepted formats', () => {
  it('R27: the input accept attribute in index.html matches MEDIA_FORMATS', () => {
    expect(ACCEPT_ATTR).toBe(MEDIA_FORMATS.join(','));
    const accept = html.match(/id="file-media-input"[^>]*accept="([^"]+)"/)[1];
    expect(exts(accept)).toEqual(sorted);
  });

  it('R27: the drop overlay text lists the same formats', () => {
    const overlay = html.match(/<div id="drop-overlay">[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/)[1];
    expect(exts(overlay)).toEqual(sorted);
  });

  it('R27: the README "Supported formats" line lists the same formats', () => {
    const line = readme.split('\n').find(l => /supported formats/i.test(l));
    expect(line).toBeTruthy();
    expect(exts(line)).toEqual(sorted);
  });

  it('R27: no Bach claim for the interval demo', () => {
    expect(html).not.toMatch(/Bach/);
    expect(readme).not.toMatch(/Bach/);
  });
});

describe('R26: header sample-rate parsing', () => {
  const bytes = (arr, len = 64) => { const u = new Uint8Array(len); u.set(arr); return u.buffer; };
  it('R26: WAV fmt chunk', () => {
    const u = new Uint8Array(44);
    u.set([...'RIFF'].map(c => c.charCodeAt(0)), 0); u.set([...'WAVEfmt '].map(c => c.charCodeAt(0)), 8);
    new DataView(u.buffer).setUint32(16, 16, true);
    new DataView(u.buffer).setUint32(24, 22050, true);
    expect(parseHeaderSampleRate(u.buffer)).toBe(22050);
  });
  it('R26: MP3 frame header (MPEG-1 Layer III, 44.1 kHz) with and without ID3', () => {
    expect(parseHeaderSampleRate(bytes([0xff, 0xfb, 0x90, 0x64]))).toBe(44100);
    expect(parseHeaderSampleRate(bytes([0xff, 0xfb, 0x94, 0x64]))).toBe(48000);
    const id3 = [0x49, 0x44, 0x33, 3, 0, 0, 0, 0, 0, 10, ...new Array(10).fill(0), 0xff, 0xfb, 0x98, 0x64];
    expect(parseHeaderSampleRate(bytes(id3))).toBe(32000);
  });
  it('R26: FLAC STREAMINFO', () => {
    // fLaC, metadata header (type 0, length 34), min/max block (4), min/max frame (6), then 20-bit rate
    const sr = 96000;
    const head = [0x66, 0x4c, 0x61, 0x43, 0x00, 0x00, 0x00, 0x22, 0x10, 0x00, 0x10, 0x00, 0, 0, 0, 0, 0, 0,
      (sr >> 12) & 0xff, (sr >> 4) & 0xff, ((sr & 0xf) << 4) | 0x02];
    expect(parseHeaderSampleRate(bytes(head))).toBe(96000);
  });
  it('R26: Ogg Vorbis identification header', () => {
    const u = new Uint8Array(80);
    u.set([...'OggS'].map(c => c.charCodeAt(0)), 0);
    const vorbis = [0x01, ...[...'vorbis'].map(c => c.charCodeAt(0))];
    u.set(vorbis, 28);
    new DataView(u.buffer).setUint32(28 + 7 + 4 + 1, 44100, true); // version(4) channels(1) rate(4)
    expect(parseHeaderSampleRate(u.buffer)).toBe(44100);
  });
  it('R26: unknown data → null', () => {
    expect(parseHeaderSampleRate(new TextEncoder().encode('this is not audio at all').buffer)).toBe(null);
    expect(parseHeaderSampleRate(new ArrayBuffer(0))).toBe(null);
  });
});
