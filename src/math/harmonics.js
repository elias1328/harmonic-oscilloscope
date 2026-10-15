// Harmonic mathematics: note names, interval tables (exact fractions), chord presets and
// chord identification. Data plus pure functions.

import { Fraction, fractionsToInts } from '../core/fraction.js';

export const ROOT_FREQ_DEFAULT = 261.6256; // C4 in Hz

export const NOTE_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

export const NOTE_COLORS = {
  'C': '#ff5376',   // Coral Pink
  'Db': '#70a1ff',  // Soft Cyan
  'D': '#ffa502',   // Warm Amber
  'Eb': '#e056fd',  // Orchid Purple
  'E': '#2ed573',   // Lime Green
  'F': '#ff4757',   // Rose Red
  'F#': '#00d2d3',  // Turquoise
  'G': '#ff7f50',   // Coral Orange
  'Ab': '#1e90ff',  // Dodger Blue
  'A': '#9aec80',   // Soft Chartreuse
  'Bb': '#be2edd',  // Purple Magenta
  'B': '#1dd1a1'    // Bright Mint
};

// The 12 Intervals from C ordered "Simplest First" (exact match to video screenshot)
export const INTERVALS_SIMPLEST_FIRST = [
  {
    note: 'C',
    name: 'Octave',
    ratio: [2, 1],
    color: '#ff6b8b',
    semitones: 12,
    consonance: 'Purest Consonance',
    description: 'A 2:1 frequency doubling. The simplest possible harmonic relationship after unison. Waves align on every single cycle of the lower note.'
  },
  {
    note: 'G',
    name: 'Fifth',
    ratio: [3, 2],
    color: '#ff9f43',
    semitones: 7,
    consonance: 'Perfect Consonance',
    description: 'The foundation of tonal harmony. For every 2 cycles of C, G cycles 3 times. Forms a clean 2-lobed Lissajous figure with minimal acoustic tension.'
  },
  {
    note: 'F',
    name: 'Fourth',
    ratio: [4, 3],
    color: '#f368e0',
    semitones: 5,
    consonance: 'Perfect Consonance',
    description: 'Inversion of the fifth. 4 cycles against 3. Extremely stable and foundational in ancient and modern scales.'
  },
  {
    note: 'A',
    name: 'Major Sixth',
    ratio: [5, 3],
    color: '#a8e063',
    semitones: 9,
    consonance: 'Imperfect Consonance',
    description: '5 cycles against 3. Bright, uplifting consonant interval derived from the 5th harmonic.'
  },
  {
    note: 'E',
    name: 'Major Third',
    ratio: [5, 4],
    color: '#2ecc71',
    semitones: 4,
    consonance: 'Sweet Consonance',
    description: '5 cycles against 4. The defining note of major keys and chords. In pure Just Intonation (5:4), it sounds tranquil and pure.'
  },
  {
    note: 'Eb',
    name: 'Minor Third',
    ratio: [6, 5],
    color: '#ff7979',
    semitones: 3,
    consonance: 'Somber Consonance',
    description: '6 cycles against 5. The cornerstone of the minor triad, providing poignant emotional warmth.'
  },
  {
    note: 'Ab',
    name: 'Minor Sixth',
    ratio: [8, 5],
    color: '#74b9ff',
    semitones: 8,
    consonance: 'Mild Consonance',
    description: '8 cycles against 5. Rich, yearning harmonic quality that bridges consonance and emotional longing.'
  },
  {
    note: 'Bb',
    name: 'Minor Seventh',
    ratio: [9, 5],
    color: '#d980fa',
    semitones: 10,
    consonance: 'Mild Dissonance',
    description: '9 cycles against 5. Introduces dynamic forward harmonic motion, essential for blues and dominant 7th chords.'
  },
  {
    note: 'D',
    name: 'Major Second',
    ratio: [9, 8],
    color: '#feca57',
    semitones: 2,
    consonance: 'Moderate Dissonance',
    description: '9 cycles against 8. Neighboring scale steps create rapid acoustic interference and close Lissajous grid density.'
  },
  {
    note: 'B',
    name: 'Major Seventh',
    ratio: [15, 8],
    color: '#48dbfb',
    semitones: 11,
    consonance: 'Sharp Dissonance',
    description: '15 cycles against 8. Strong acoustic pull (leading tone) wanting to resolve upwards to the octave.'
  },
  {
    note: 'Db',
    name: 'Minor Second',
    ratio: [16, 15],
    color: '#c7ecee',
    semitones: 1,
    consonance: 'Severe Dissonance',
    description: '16 cycles against 15. The closest standard semitone interval. Frequencies clash intensely, producing fast acoustic roughness.'
  },
  {
    note: 'F#',
    name: 'Tritone',
    ratio: [45, 32],
    color: '#00d2d3',
    semitones: 6,
    consonance: 'Extreme Dissonance',
    description: 'The "Diabolus in Musica". 45/32 ≈ 1.406 is close to √2 ≈ 1.414 (the exact half-octave of 12-TET) but not equal to it. Its complex 45:32 ratio weaves an extremely dense, non-resolving mesh.'
  }
];


// Exact just-intonation interval from the root, by semitone. 0 = unison, 12 = octave.
// `ratio` is [hi, lo]; `ratioInts` is [lo, hi] (X cycles : Y cycles); `ji` is the Fraction hi/lo.
const BY_SEMITONE_DATA = {
  0:  { name: 'Unison',        ratio: [1, 1],   consonance: 'Identity',            description: 'The same pitch: a single straight line.' },
  1:  { name: 'Minor Second',  ratio: [16, 15], consonance: 'Severe Dissonance',   description: 'Closest standard semitone. Intense acoustic interference and rapid beating.' },
  2:  { name: 'Major Second',  ratio: [9, 8],   consonance: 'Moderate Dissonance', description: '9 cycles against 8. Creates a dense, tight Lissajous figure.' },
  3:  { name: 'Minor Third',   ratio: [6, 5],   consonance: 'Somber Consonance',   description: '6 cycles against 5. Heart of the minor chord, warm and poignant.' },
  4:  { name: 'Major Third',   ratio: [5, 4],   consonance: 'Sweet Consonance',    description: '5 cycles against 4. Pure tranquil harmony defining major tonality.' },
  5:  { name: 'Fourth',        ratio: [4, 3],   consonance: 'Perfect Consonance',  description: '4 cycles against 3. Stable, foundational symmetry.' },
  6:  { name: 'Tritone',       ratio: [45, 32], consonance: 'Extreme Dissonance',  description: '45 cycles against 32: close to, but not exactly, half an octave. A dense mesh.' },
  7:  { name: 'Fifth',         ratio: [3, 2],   consonance: 'Perfect Consonance',  description: 'The foundation of tonal harmony. 3 cycles against 2.' },
  8:  { name: 'Minor Sixth',   ratio: [8, 5],   consonance: 'Mild Consonance',     description: '8 cycles against 5. Rich, expansive harmonic depth.' },
  9:  { name: 'Major Sixth',   ratio: [5, 3],   consonance: 'Bright Consonance',   description: '5 cycles against 3. Uplifting, harmonious overtone.' },
  10: { name: 'Minor Seventh', ratio: [9, 5],   consonance: 'Mild Dissonance',     description: '9 cycles against 5. Dynamic forward harmonic momentum.' },
  11: { name: 'Major Seventh', ratio: [15, 8],  consonance: 'Sharp Dissonance',    description: '15 cycles against 8. Strong acoustic yearning to resolve.' },
  12: { name: 'Octave',        ratio: [2, 1],   consonance: 'Purest Consonance',   description: '2:1 double frequency. Waves synchronize on every cycle.' }
};

export const INTERVALS_BY_SEMITONE = Object.fromEntries(Object.entries(BY_SEMITONE_DATA).map(([k, d]) => [k, {
  ...d,
  ratioInts: [d.ratio[1], d.ratio[0]],
  ji: new Fraction(d.ratio[0], d.ratio[1])
}]));

INTERVALS_SIMPLEST_FIRST.forEach(i => { i.ji = new Fraction(i.ratio[0], i.ratio[1]); });

/** Just-intonation ratio of an interval of `semitones` (compound intervals keep their octaves). */
export function jiForSemitones(semitones) {
  const octaves = Math.floor(semitones / 12);
  const r = semitones - 12 * octaves;
  const base = INTERVALS_BY_SEMITONE[r].ji;
  return octaves >= 0 ? base.mul(new Fraction(2 ** octaves, 1)) : base.mul(new Fraction(1, 2 ** -octaves));
}

// Piano keys (C4 to C5). "C'" is the upper octave C.
export const PIANO_KEY_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B', "C'"];

// Notes for an interval measured up from C. The octave's upper note is C', not a second C.
export function intervalNotes(interval) {
  return ['C', interval.semitones === 12 ? "C'" : interval.note];
}

// Map note name like 'C', 'C#', 'Db', 'Eb', etc., to semitone offset from C (0)
export function noteNameToSemitone(name) {
  const clean = name.trim();
  const map = {
    'C': 0, 'B#': 0,
    'C#': 1, 'Db': 1,
    'D': 2,
    'D#': 3, 'Eb': 3,
    'E': 4, 'Fb': 4,
    'F': 5, 'E#': 5,
    'F#': 6, 'Gb': 6,
    'G': 7,
    'G#': 8, 'Ab': 8,
    'A': 9,
    'A#': 10, 'Bb': 10,
    'B': 11, 'Cb': 11,
    "C'": 12, 'C5': 12
  };
  return map[clean] !== undefined ? map[clean] : 0;
}

// Known chords: pitch-class intervals above the chord root -> exact JI fractions.
const F = (n, d = 1) => new Fraction(n, d);
const KNOWN_CHORDS = [
  { key: '0,4,7', quality: 'major', category: 'A MAJOR CHORD', consonance: 'Universal Major Harmony', ji: [F(1), F(5, 4), F(3, 2)], description: 'Major triad: Root (4), 3rd (5), 5th (6). Weaves a symmetrical 3D Lissajous knot.' },
  { key: '0,3,7', quality: 'minor', category: 'A MINOR CHORD', consonance: 'Somber Minor Harmony', ji: [F(1), F(6, 5), F(3, 2)], description: 'Minor triad: Root (10), Minor 3rd (12), 5th (15). Higher harmonic integers create a darker 3D weave.' },
  { key: '0,5,7', quality: 'sus4', category: 'SUSPENDED 4TH', consonance: 'Open Suspension', ji: [F(1), F(4, 3), F(3, 2)], description: 'Suspended 4th (6:8:9): open, unresolved space waiting to step down.' },
  { key: '0,2,7', quality: 'sus2', category: 'SUSPENDED 2ND', consonance: 'Gentle Suspension', ji: [F(1), F(9, 8), F(3, 2)], description: 'Suspended 2nd (8:9:12): floating acoustic resonance.' },
  { key: '0,3,6', quality: 'diminished', category: 'DIMINISHED CHORD', consonance: 'Tense Dissonance', ji: [F(1), F(6, 5), F(36, 25)], description: 'Stacked minor thirds creating unstable, suspenseful tension.' },
  { key: '0,4,8', quality: 'augmented', category: 'AUGMENTED CHORD', consonance: 'Unstable Symmetry', ji: [F(1), F(5, 4), F(25, 16)], description: 'Stacked major thirds dividing the octave symmetrically.' },
  { key: '0,4,7,10', quality: 'dominant7', category: 'DOMINANT 7TH', consonance: 'Dynamic Overtone Drive', ji: [F(1), F(5, 4), F(3, 2), F(7, 4)], description: 'Overtone 7th chord. The 7th harmonic creates strong bluesy pull.' },
  { key: '0,3,7,10', quality: 'minor7', category: 'MINOR 7TH CHORD', consonance: 'Mellow Tension', ji: [F(1), F(6, 5), F(3, 2), F(9, 5)], description: 'Minor triad with a minor seventh on top.' },
  { key: '0,4,7,11', quality: 'major7', category: 'MAJOR 7TH CHORD', consonance: 'Lush Tension', ji: [F(1), F(5, 4), F(3, 2), F(15, 8)], description: 'Major triad with a major seventh: 8:10:12:15.' },
  { key: '0,1,2', quality: 'cluster', category: 'DISSONANCE CLUSTER', consonance: 'Extreme Dissonance', ji: [F(1), F(16, 15), F(9, 8)], description: 'Clashing chromatic semitones (1 : 16/15 : 9/8) forming dense, undulating moiré interference.' }
];
KNOWN_CHORDS.forEach(c => { c.tones = c.key.split(',').map(Number); c.ratioInts = fractionsToInts(c.ji); });

const ORDINAL = ['', '1ST', '2ND', '3RD'];
const ratioTitle = (ints) => ints.join(' : ');

/**
 * Identify a set of notes given as absolute semitones (MIDI numbers or piano semitones).
 * - duplicates are removed and the notes sorted (order never matters);
 * - two notes: the exact (compound) interval, e.g. C4+C5 = 2 : 1, C4+G5 = 3 : 1;
 * - three or more pitch classes: every rotation is tried as the root, so inversions are
 *   recognised (E-G-C = C major, 1st inversion, 4 : 5 : 6);
 * - otherwise the exact product of the JI intervals above the bass, scaled to integers.
 * `voiceJi[i]` is the JI ratio of `notes[i]` (sorted, unique) to the lowest note.
 */
export function identifyChord(input) {
  const notes = [...new Set(input)].sort((a, b) => a - b);
  if (notes.length === 0) {
    return { kind: 'rest', notes, voiceJi: [], ratioInts: [], category: 'REST', title: 'SILENCE', consonance: 'Rest', description: 'No notes sounding.' };
  }
  const bass = notes[0];
  if (notes.length === 1) {
    return { kind: 'solo', notes, voiceJi: [F(1)], ratioInts: [1], category: 'ROOT NOTE', title: '1 : 1', consonance: 'Fundamental Pitch', description: 'A single voice: a straight 1D oscillation.' };
  }
  if (notes.length === 2) {
    const diff = notes[1] - bass;
    const ji = jiForSemitones(diff);
    const base = INTERVALS_BY_SEMITONE[diff % 12];
    let name = base.name;
    if (diff % 12 === 0) name = diff === 12 ? 'Octave' : `${diff / 12} Octaves`;
    else if (diff > 12) name = `Compound ${base.name}`;
    return {
      kind: 'interval', notes, name,
      voiceJi: [F(1), ji],
      ratioInts: [ji.den, ji.num],
      category: `AN INTERVAL (${name.toUpperCase()})`,
      title: `${ji.num} : ${ji.den}`,
      consonance: base.consonance,
      description: `${ji.num} cycles of the upper note for every ${ji.den} of the lower. ${base.description}`
    };
  }

  const pcs = [...new Set(notes.map(n => ((n % 12) + 12) % 12))];
  if (pcs.length >= 3) {
    const bassPc = ((bass % 12) + 12) % 12;
    // try the bass first, then the other pitch classes as the root
    const candidates = [bassPc, ...pcs.filter(p => p !== bassPc)];
    for (const rootPc of candidates) {
      const key = pcs.map(p => (p - rootPc + 12) % 12).sort((a, b) => a - b).join(',');
      const known = KNOWN_CHORDS.find(c => c.key === key);
      if (!known) continue;
      // Voice each note: chord tone fraction × its octave above the root below the bass.
      const rootRef = bass - ((bassPc - rootPc + 12) % 12);
      const frac = (n) => {
        const d = n - rootRef;
        const oct = Math.floor(d / 12);
        return known.ji[known.tones.indexOf(d - 12 * oct)].mul(F(2 ** oct));
      };
      const bassFrac = frac(bass);
      const inversion = known.tones.indexOf((bassPc - rootPc + 12) % 12);
      return {
        kind: 'chord', notes, quality: known.quality, inversion, rootPc,
        voiceJi: notes.map(n => frac(n).div(bassFrac)),
        ratioInts: [...known.ratioInts],
        category: inversion > 0 ? `${known.category} (${ORDINAL[inversion]} INVERSION)` : known.category,
        title: ratioTitle(known.ratioInts),
        consonance: known.consonance,
        description: known.description
      };
    }
  }

  const voiceJi = notes.map(n => jiForSemitones(n - bass));
  const ratioInts = fractionsToInts(voiceJi);
  return {
    kind: 'custom', notes, voiceJi, ratioInts,
    category: 'CUSTOM CHORD',
    title: ratioTitle(ratioInts),
    consonance: 'Custom Harmonic Cluster',
    description: `Exact just-intonation product of ${notes.length} notes above the bass. Cycles weave together in multi-dimensional space.`
  };
}

// Presets: voices given as exact JI ratios to the root (semitones for 12-TET).
export const CHORD_PRESETS = [
  { id: 'fifth', category: 'A RATIO OF', labels: ['C', 'G'], semitones: [0, 7], ji: [[1, 1], [3, 2]], colors: ['#ff5376', '#ff9f43'], type: '2D', consonance: 'Perfect Consonance', description: 'G completes 3 cycles for every 2 cycles of C. The waveforms synchronize every 2 cycles of C, forming a stable 2-lobed Lissajous loop.' },
  { id: 'octave', category: 'AN OCTAVE', labels: ['C', "C'"], semitones: [0, 12], ji: [[1, 1], [2, 1]], colors: ['#ff5376', '#ff6b8b'], type: '2D', consonance: 'Purest Consonance', description: 'Double frequency (2:1). Creates the iconic figure-8 (infinity) Lissajous curve.' },
  { id: 'major_triad', category: 'A MAJOR CHORD', labels: ['C', 'E', 'G'], semitones: [0, 4, 7], ji: [[1, 1], [5, 4], [3, 2]], colors: ['#ff5376', '#2ecc71', '#ff9f43'], type: '3D', consonance: 'Universal Major Harmony', description: 'The fundamental building block of Western music: Root (4), Major 3rd (5), Fifth (6). Weaves a symmetrical 3D Lissajous knot inside the bounding cube.' },
  { id: 'minor_triad', category: 'A MINOR CHORD', labels: ['C', 'Eb', 'G'], semitones: [0, 3, 7], ji: [[1, 1], [6, 5], [3, 2]], colors: ['#ff5376', '#e056fd', '#ff9f43'], type: '3D', consonance: 'Somber Minor Harmony', description: 'Root (10), Minor 3rd (12), Fifth (15). Higher harmonic integers create a denser, darker 3D orbital mesh.' },
  { id: 'sus4', category: 'SUSPENDED 4TH', labels: ['C', 'F', 'G'], semitones: [0, 5, 7], ji: [[1, 1], [4, 3], [3, 2]], colors: ['#ff5376', '#f368e0', '#ff9f43'], type: '3D', consonance: 'Open Suspension', description: 'Replaces the 3rd with the 4th (6:8:9), creating an open, ungrounded tension waiting to resolve.' },
  { id: 'dominant7', category: 'HARMONIC 7TH CHORD', labels: ['C', 'E', 'G', 'Bb'], semitones: [0, 4, 7, 10], ji: [[1, 1], [5, 4], [3, 2], [7, 4]], colors: ['#ff5376', '#2ecc71', '#ff9f43', '#d980fa'], type: '3D', consonance: 'Dynamic Drive', description: 'Natural harmonic series overtone chord (4:5:6:7). The 7th harmonic creates bluesy tension and chromatic shimmer.' },
  { id: 'dissonance', category: 'DISSONANCE (C + Db + D)', labels: ['C', 'Db', 'D'], semitones: [0, 1, 2], ji: [[1, 1], [16, 15], [9, 8]], colors: ['#ff5376', '#70a1ff', '#ffa502'], type: '3D', consonance: 'Extreme Dissonance / Cluster', description: 'Clashing just semitones (1 : 16/15 : 9/8 = 120:128:135) produce chaotic acoustic beating and an undulating, tangled Lissajous wireframe that fills the space.' }
];
