// Preset chips.

import { PRESETS, chordFromPreset } from '../core/voices.js';

export function initPresets(store, actions) {
  const container = document.getElementById('presets-container');
  const chips = PRESETS.map(p => {
    const chip = document.createElement('button');
    chip.className = 'preset-chip';
    chip.dataset.preset = p.id;
    chip.textContent = `${chordFromPreset(p).meta.title} (${p.category})`;
    chip.addEventListener('click', () => actions.loadPreset(p.id));
    return chip;
  });
  container.replaceChildren(...chips);
  store.subscribe(s => s.chord.presetId, (id) => chips.forEach(c => c.classList.toggle('active', c.dataset.preset === id)));
}
