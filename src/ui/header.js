// Header (category, ratio title, notes with their real Hz) and the "Harmonic Physics" card.

import { NOTE_COLORS } from '../math/harmonics.js';
import { voiceFreqs, rootHz } from '../app/figure.js';

const $ = (id) => document.getElementById(id);

// When the notes wrap onto several lines, a "+" must never start or end a line. Separators are
// decided left to right: each is shown and kept only if both neighbours share its line (deciding
// in order means a hidden one never leaves two notes on one line without their "+").
export function tidySeparators(badge) {
  badge.querySelectorAll('.line-break').forEach(b => b.remove());
  const kids = [...badge.children];
  const seps = kids.filter(k => k.classList.contains('sep'));
  seps.forEach(k => { k.style.display = 'none'; });
  for (const sep of seps) {
    sep.style.display = '';
    const i = kids.indexOf(sep);
    const prev = kids[i - 1];
    const next = kids[i + 1];
    if (!prev || !next || prev.offsetTop !== sep.offsetTop || next.offsetTop !== sep.offsetTop) {
      sep.style.display = 'none';
      // the next note only fits on this line without its "+": start it on a new line instead
      if (prev && next && prev.offsetTop === next.offsetTop) {
        const br = document.createElement('span');
        br.className = 'line-break';
        next.before(br);
      }
    }
  }
}

export function initHeader(store) {
  const category = $('header-category');
  const title = $('header-title');
  const badge = $('header-notes-badge');
  const header = $('harmonic-header');
  const consonance = $('info-consonance-badge');
  const breakdown = $('info-freq-breakdown');
  const description = $('info-description');
  const acoustic = $('info-acoustic-mode');

  store.subscribe(s => s.tab, (tab) => { header.style.display = tab === 'matrix' ? 'none' : ''; });
  window.addEventListener('resize', () => tidySeparators(badge));
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => tidySeparators(badge));

  // Everything shown depends only on the chord, the tuning and the speed slider.
  store.subscribe(s => [s.chord, s.tuning, s.speedVal], (_, s) => {
    const { chord } = s;
    const freqs = voiceFreqs(s);
    category.textContent = chord.meta.category;
    title.textContent = chord.meta.title;

    if (chord.source === 'xy') {
      badge.innerHTML = '<span style="color: #2ecc71">L → X</span> <span style="color: rgba(255,255,255,0.4)">+</span> <span style="color: #a8ff78">R → Y</span>';
    } else if (!chord.size) {
      badge.innerHTML = '<span style="color: rgba(255,255,255,0.4); font-size: 14px;">Select piano keys below to set root note and build harmony</span>';
    } else {
      badge.innerHTML = chord.voices.map((v, i) => {
        const color = v.color || NOTE_COLORS[v.label] || '#fff';
        const plus = i < chord.size - 1 ? '<span class="sep" style="color: rgba(255,255,255,0.4)">+</span>' : '';
        return `<span class="note" style="color: ${color}">${v.label} <small style="font-size: 13px; opacity: 0.85;">(${freqs[i].toFixed(1)} Hz)</small></span> ${plus}`;
      }).join(' ');
      tidySeparators(badge);
    }

    consonance.textContent = chord.meta.consonance;
    consonance.style.color = chord.meta.consonance.includes('Dissonance') ? '#ff5376' : '#2ecc71';
    breakdown.textContent = chord.voices.map((v, i) => `${v.label}: ${freqs[i].toFixed(1)} Hz`).join('  |  ');
    description.textContent = chord.meta.description;

    const hz = rootHz(s);
    if (chord.source === 'xy') {
      acoustic.textContent = '📡 Stereo signal: every sample is drawn in real time as it plays (no slow motion).';
      acoustic.style.borderLeftColor = '#2ecc71';
    } else if (hz < 20) {
      acoustic.textContent = `🥁 Rhythmic Mode (${hz.toFixed(1)} Hz): Ears resolve separate mechanical pulses/clicks.`;
      acoustic.style.borderLeftColor = '#ff7f50';
    } else if (hz <= 30) {
      acoustic.textContent = `⚡ Fusion Threshold (${hz.toFixed(1)} Hz): Clicks blur and fuse into continuous pitch!`;
      acoustic.style.borderLeftColor = '#feca57';
    } else {
      acoustic.textContent = `🎵 Musical Pitch (${hz.toFixed(1)} Hz): Continuous audible tone. Polyrhythm stopped.`;
      acoustic.style.borderLeftColor = '#2ecc71';
    }
  });
}
