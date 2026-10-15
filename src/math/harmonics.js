// Harmonic mathematics, intervals, chord presets, and tuning systems

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

export const CHORD_PRESETS = [
  {
    id: 'fifth',
    title: '3 : 2',
    category: 'A RATIO OF',
    notes: ['C', 'G'],
    ratios: [1, 1.5],
    ratioInts: [2, 3],
    colors: ['#ff5376', '#ff9f43'],
    type: '2D',
    consonance: 'Perfect Consonance',
    description: 'G completes 3 cycles for every 2 cycles of C. The waveforms synchronize every 2 cycles of C, forming a stable 2-lobed Lissajous loop.'
  },
  {
    id: 'octave',
    title: '2 : 1',
    category: 'AN OCTAVE',
    notes: ['C', "C'"],
    ratios: [1, 2],
    ratioInts: [1, 2],
    colors: ['#ff5376', '#ff6b8b'],
    type: '2D',
    consonance: 'Purest Consonance',
    description: 'Double frequency (2:1). Creates the iconic figure-8 (infinity) Lissajous curve.'
  },
  {
    id: 'major_triad',
    title: '4 : 5 : 6',
    category: 'A MAJOR CHORD',
    notes: ['C', 'E', 'G'],
    ratios: [1, 1.25, 1.5],
    ratioInts: [4, 5, 6],
    colors: ['#ff5376', '#2ecc71', '#ff9f43'],
    type: '3D',
    consonance: 'Universal Major Harmony',
    description: 'The fundamental building block of Western music: Root (4), Major 3rd (5), Fifth (6). Weaves a symmetrical 3D Lissajous knot inside the bounding cube.'
  },
  {
    id: 'minor_triad',
    title: '10 : 12 : 15',
    category: 'A MINOR CHORD',
    notes: ['C', 'Eb', 'G'],
    ratios: [1, 1.2, 1.5],
    ratioInts: [10, 12, 15],
    colors: ['#ff5376', '#e056fd', '#ff9f43'],
    type: '3D',
    consonance: 'Somber Minor Harmony',
    description: 'Root (10), Minor 3rd (12), Fifth (15). Higher harmonic integers create a denser, darker 3D orbital mesh.'
  },
  {
    id: 'sus4',
    title: '6 : 8 : 9',
    category: 'SUSPENDED 4TH',
    notes: ['C', 'F', 'G'],
    ratios: [1, 4/3, 1.5],
    ratioInts: [6, 8, 9],
    colors: ['#ff5376', '#f368e0', '#ff9f43'],
    type: '3D',
    consonance: 'Open Suspension',
    description: 'Replaces the 3rd with the 4th (6:8:9), creating an open, ungrounded tension waiting to resolve.'
  },
  {
    id: 'dominant7',
    title: '4 : 5 : 6 : 7',
    category: 'HARMONIC 7TH CHORD',
    notes: ['C', 'E', 'G', 'Bb'],
    ratios: [1, 1.25, 1.5, 1.75],
    ratioInts: [4, 5, 6, 7],
    colors: ['#ff5376', '#2ecc71', '#ff9f43', '#d980fa'],
    type: '3D',
    consonance: 'Dynamic Drive',
    description: 'Natural harmonic series overtone chord (4:5:6:7). The 7th harmonic creates bluesy tension and chromatic shimmer.'
  },
  {
    id: 'dissonance',
    title: 'DISSONANCE',
    category: 'C + Db + D',
    notes: ['C', 'Db', 'D'],
    ratios: [1, 16/15, 9/8],
    ratioInts: [15, 16, 17],
    colors: ['#ff5376', '#70a1ff', '#ffa502'],
    type: '3D',
    consonance: 'Extreme Dissonance / Cluster',
    description: 'Clashing semitones produce chaotic acoustic beating and an undulating, tangled Lissajous wireframe that fills the space.'
  }
];

export function gcd(a, b) {
  return b === 0 ? a : gcd(b, a % b);
}

export function simplifyRatio(a, b) {
  const g = gcd(Math.round(a), Math.round(b));
  return [Math.round(a) / g, Math.round(b) / g];
}

// Convert semitones relative to C (0..12+) to 12-TET frequency multiplier
export function semitoneToEqualTemperament(semitones) {
  return Math.pow(2, semitones / 12);
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

// Piano keys (C4 to C5). "C'" is the upper octave C.
export const PIANO_KEY_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B', "C'"];

// Notes for an interval measured up from C. The octave's upper note is C', not a second C.
export function intervalNotes(interval) {
  return ['C', interval.semitones === 12 ? "C'" : interval.note];
}

// Piano selection derived from the current voices: only real piano keys, no duplicates.
// Custom-ratio voices ("H4", ...) have no key, so they select nothing.
export function pianoSelectionFromNotes(notes) {
  return [...new Set((notes || []).filter(n => PIANO_KEY_NAMES.includes(n)))];
}

export const INTERVALS_BY_SEMITONE = {
  1:  { name: 'Minor Second',  ratio: [16, 15], ratioInts: [15, 16], consonance: 'Severe Dissonance',  description: 'Closest standard semitone. Intense acoustic interference and rapid beating.' },
  2:  { name: 'Major Second',  ratio: [9, 8],   ratioInts: [8, 9],   consonance: 'Moderate Dissonance', description: '9 cycles against 8. Creates a dense, tight Lissajous figure.' },
  3:  { name: 'Minor Third',   ratio: [6, 5],   ratioInts: [5, 6],   consonance: 'Somber Consonance',   description: '6 cycles against 5. Heart of the minor chord, warm and poignant.' },
  4:  { name: 'Major Third',   ratio: [5, 4],   ratioInts: [4, 5],   consonance: 'Sweet Consonance',    description: '5 cycles against 4. Pure tranquil harmony defining major tonality.' },
  5:  { name: 'Fourth',        ratio: [4, 3],   ratioInts: [3, 4],   consonance: 'Perfect Consonance',  description: '4 cycles against 3. Stable, foundational symmetry.' },
  6:  { name: 'Tritone',       ratio: [45, 32], ratioInts: [32, 45], consonance: 'Extreme Dissonance', description: 'The tritone divides the octave into tension with dense mesh.' },
  7:  { name: 'Fifth',         ratio: [3, 2],   ratioInts: [2, 3],   consonance: 'Perfect Consonance',  description: 'The foundation of tonal harmony. 3 cycles against 2.' },
  8:  { name: 'Minor Sixth',   ratio: [8, 5],   ratioInts: [5, 8],   consonance: 'Mild Consonance',     description: '8 cycles against 5. Rich, expansive harmonic depth.' },
  9:  { name: 'Major Sixth',   ratio: [5, 3],   ratioInts: [3, 5],   consonance: 'Bright Consonance',   description: '5 cycles against 3. Uplifting, harmonious overtone.' },
  10: { name: 'Minor Seventh', ratio: [9, 5],   ratioInts: [5, 9],   consonance: 'Mild Dissonance',     description: '9 cycles against 5. Dynamic forward harmonic momentum.' },
  11: { name: 'Major Seventh', ratio: [15, 8],  ratioInts: [8, 15],  consonance: 'Sharp Dissonance',    description: '15 cycles against 8. Strong acoustic yearning to resolve.' },
  12: { name: 'Octave',        ratio: [2, 1],   ratioInts: [1, 2],   consonance: 'Purest Consonance',   description: '2:1 double frequency. Waves synchronize on every cycle.' }
};

export function identifyChordFromIntervals(intervals) {
  // intervals: e.g. [0, 4, 7] for Major, [0, 3, 7] for Minor, etc.
  const key = intervals.join(',');

  if (key === '0,4,7') {
    return {
      category: 'A MAJOR CHORD',
      title: '4 : 5 : 6',
      ratioInts: [4, 5, 6],
      consonance: 'Universal Major Harmony',
      description: 'Major triad: Root (4), 3rd (5), 5th (6). Weaves a symmetrical 3D Lissajous knot.'
    };
  }
  if (key === '0,3,7') {
    return {
      category: 'A MINOR CHORD',
      title: '10 : 12 : 15',
      ratioInts: [10, 12, 15],
      consonance: 'Somber Minor Harmony',
      description: 'Minor triad: Root (10), Minor 3rd (12), 5th (15). Higher harmonic integers create a darker 3D weave.'
    };
  }
  if (key === '0,5,7') {
    return {
      category: 'SUSPENDED 4TH',
      title: '6 : 8 : 9',
      ratioInts: [6, 8, 9],
      consonance: 'Open Suspension',
      description: 'Suspended 4th (6:8:9): open, unresolved space waiting to step down.'
    };
  }
  if (key === '0,2,7') {
    return {
      category: 'SUSPENDED 2ND',
      title: '8 : 9 : 12',
      ratioInts: [8, 9, 12],
      consonance: 'Gentle Suspension',
      description: 'Suspended 2nd (8:9:12): floating acoustic resonance.'
    };
  }
  if (key === '0,3,6') {
    return {
      category: 'DIMINISHED CHORD',
      title: '25 : 30 : 36',
      ratioInts: [25, 30, 36],
      consonance: 'Tense Dissonance',
      description: 'Stacked minor thirds creating unstable, suspenseful tension.'
    };
  }
  if (key === '0,4,8') {
    return {
      category: 'AUGMENTED CHORD',
      title: '16 : 20 : 25',
      ratioInts: [16, 20, 25],
      consonance: 'Unstable Symmetry',
      description: 'Stacked major thirds dividing the octave symmetrically.'
    };
  }
  if (key === '0,4,7,10') {
    return {
      category: 'DOMINANT 7TH',
      title: '4 : 5 : 6 : 7',
      ratioInts: [4, 5, 6, 7],
      consonance: 'Dynamic Overtone Drive',
      description: 'Overtone 7th chord. The 7th harmonic creates strong bluesy pull.'
    };
  }
  if (key === '0,1,2') {
    return {
      category: 'DISSONANCE CLUSTER',
      title: '15 : 16 : 17',
      ratioInts: [15, 16, 17],
      consonance: 'Extreme Dissonance',
      description: 'Clashing chromatic semitones forming dense, undulating moiré interference.'
    };
  }

  // Fallback for custom combinations
  const ratioInts = intervals.map(semi => {
    const intDef = INTERVALS_BY_SEMITONE[semi];
    if (semi === 0) return 12;
    if (intDef) return Math.round(12 * (intDef.ratio[0] / intDef.ratio[1]));
    return Math.round(12 * Math.pow(2, semi / 12));
  });

  return {
    category: 'CUSTOM CHORD',
    title: ratioInts.join(' : '),
    ratioInts: ratioInts,
    consonance: 'Custom Harmonic Cluster',
    description: `Compound harmony of ${intervals.length} notes. Cycles weave together in complex multi-dimensional space.`
  };
}
