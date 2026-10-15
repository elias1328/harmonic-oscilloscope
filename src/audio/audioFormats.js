// Accepted media formats (single source of truth for the file input `accept`, the drop
// overlay text and the README) and a tiny header parser for the file's own sample rate.

export const MIDI_FORMATS = ['.mid', '.midi'];
export const AUDIO_FORMATS = ['.mp3', '.wav', '.ogg', '.m4a', '.flac'];
export const MEDIA_FORMATS = [...MIDI_FORMATS, ...AUDIO_FORMATS];

export const ACCEPT_ATTR = MEDIA_FORMATS.join(',');
export const FORMATS_LABEL = MEDIA_FORMATS.join(', ');

const MP3_RATES = {
  3: [44100, 48000, 32000], // MPEG-1
  2: [22050, 24000, 16000], // MPEG-2
  0: [11025, 12000, 8000] // MPEG-2.5
};

function ascii(bytes, offset, len) {
  let s = '';
  for (let i = 0; i < len && offset + i < bytes.length; i++) s += String.fromCharCode(bytes[offset + i]);
  return s;
}

function findAscii(bytes, needle, limit) {
  const end = Math.min(bytes.length - needle.length, limit);
  outer: for (let i = 0; i <= end; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (bytes[i + j] !== needle.charCodeAt(j)) continue outer;
    }
    return i;
  }
  return -1;
}

/**
 * Reads the sample rate stored in a file header, before `decodeAudioData` resamples it to the
 * AudioContext rate. Supports WAV, MP3 (with or without ID3v2), FLAC and Ogg Vorbis.
 * Returns null when the header is not recognised (e.g. M4A/AAC), so callers can fall back
 * to the context rate and label it as such.
 */
export function parseHeaderSampleRate(arrayBuffer) {
  if (!arrayBuffer || arrayBuffer.byteLength < 4) return null;
  const bytes = new Uint8Array(arrayBuffer);
  const view = new DataView(arrayBuffer);

  // WAV: RIFF....WAVE then chunks; the 'fmt ' chunk holds the rate at +12
  if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WAVE') {
    let p = 12;
    while (p + 8 <= bytes.length) {
      const id = ascii(bytes, p, 4);
      const size = view.getUint32(p + 4, true);
      if (id === 'fmt ' && p + 16 <= bytes.length) return view.getUint32(p + 12, true) || null;
      p += 8 + size + (size % 2);
    }
    return null;
  }

  // FLAC: 'fLaC' + STREAMINFO; 20-bit rate at byte 18
  if (ascii(bytes, 0, 4) === 'fLaC' && bytes.length >= 21) {
    const rate = (bytes[18] << 12) | (bytes[19] << 4) | (bytes[20] >> 4);
    return rate || null;
  }

  // Ogg Vorbis: identification header '\x01vorbis', rate after version (4) + channels (1)
  if (ascii(bytes, 0, 4) === 'OggS') {
    const i = findAscii(bytes, '\x01vorbis', 512);
    if (i >= 0 && i + 16 <= bytes.length) return view.getUint32(i + 12, true) || null;
    return null;
  }

  // MP3: skip an ID3v2 tag, then read the first frame header
  let p = 0;
  if (ascii(bytes, 0, 3) === 'ID3' && bytes.length >= 10) {
    p = 10 + ((bytes[6] & 0x7f) << 21 | (bytes[7] & 0x7f) << 14 | (bytes[8] & 0x7f) << 7 | (bytes[9] & 0x7f));
  }
  const limit = Math.min(bytes.length - 4, p + 4096);
  for (; p <= limit; p++) {
    if (bytes[p] !== 0xff || (bytes[p + 1] & 0xe0) !== 0xe0) continue;
    const version = (bytes[p + 1] >> 3) & 0x03;
    const layer = (bytes[p + 1] >> 1) & 0x03;
    const rateIdx = (bytes[p + 2] >> 2) & 0x03;
    if (version === 1 || layer === 0 || rateIdx === 3) continue;
    return MP3_RATES[version][rateIdx];
  }
  return null;
}
