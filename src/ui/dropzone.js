// File input, import and demo buttons, and full-window drag & drop.

import { ACCEPT_ATTR, FORMATS_LABEL } from '../audio/audioFormats.js';

export function initDropzone(actions, audio, importer) {
  const input = document.getElementById('file-media-input');
  const overlay = document.getElementById('drop-overlay');
  input.setAttribute('accept', ACCEPT_ATTR);
  overlay.querySelector('p').textContent = `Supports ${FORMATS_LABEL}`;

  const pick = () => { audio.resume(); input.click(); };
  document.getElementById('btn-import-media').addEventListener('click', pick);
  document.getElementById('btn-side-import').addEventListener('click', pick);
  document.getElementById('btn-demo-midi').addEventListener('click', () => { audio.resume(); importer.loadBuiltInMidiDemo(); });
  document.getElementById('btn-demo-audio').addEventListener('click', () => { audio.resume(); importer.loadBuiltInOscilloscopeDemo(); });
  input.addEventListener('change', async () => {
    const file = input.files[0];
    if (file) {
      await actions.loadFile(file);
      input.value = '';
    }
  });

  window.addEventListener('dragover', (e) => {
    e.preventDefault();
    overlay.classList.add('drag-active');
  });
  window.addEventListener('dragleave', (e) => {
    if (e.relatedTarget === null) overlay.classList.remove('drag-active');
  });
  window.addEventListener('drop', async (e) => {
    e.preventDefault();
    overlay.classList.remove('drag-active');
    if (e.dataTransfer && e.dataTransfer.files.length > 0) await actions.loadFile(e.dataTransfer.files[0]);
  });
}
