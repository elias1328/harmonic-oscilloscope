// 13-key piano (C4 to C5). The selection is always derived from the current chord's voices.

import { PIANO_KEY_NAMES, noteNameToSemitone } from '../math/harmonics.js';

export function initPiano(store, actions) {
  const container = document.getElementById('piano-keyboard');
  const whites = document.createElement('div');
  whites.className = 'piano-white-keys';
  const blacks = document.createElement('div');
  blacks.className = 'piano-black-keys';
  const isBlack = (k) => k.length > 1 && k !== "C'";

  PIANO_KEY_NAMES.filter(k => !isBlack(k)).forEach(name => {
    const key = document.createElement('div');
    key.className = 'piano-key-white';
    key.dataset.note = name;
    key.title = name;
    key.addEventListener('click', () => actions.togglePianoKey(name));
    whites.appendChild(key);

    const slot = document.createElement('div');
    slot.className = 'piano-black-slot';
    const next = PIANO_KEY_NAMES.find(k => isBlack(k) && noteNameToSemitone(k) === noteNameToSemitone(name) + 1);
    if (next) {
      const black = document.createElement('div');
      black.className = 'piano-key-black';
      black.dataset.note = next;
      black.title = next;
      black.addEventListener('click', (e) => {
        e.stopPropagation();
        actions.togglePianoKey(next);
      });
      slot.appendChild(black);
    }
    blacks.appendChild(slot);
  });
  container.replaceChildren(whites, blacks);
  document.getElementById('btn-clear-piano').addEventListener('click', () => actions.clearPiano());

  store.subscribe(s => s.chord.pianoKeys().join('|'), (sel) => {
    const keys = sel ? sel.split('|') : [];
    container.querySelectorAll('[data-note]').forEach(k => k.classList.toggle('active', keys.includes(k.dataset.note)));
  });
}
