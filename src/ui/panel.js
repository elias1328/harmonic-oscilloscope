// Controls panel: speed / slow-motion, phase, volume, sound, tuning, timbre, collapse.

import { rootHz } from '../app/figure.js';
import { timeScale } from '../core/clock.js';
import { persistenceTau } from '../visualizer/phosphor2D.js';

const $ = (id) => document.getElementById(id);

export function initPanel(store, actions) {
  const panel = $('controls-panel');
  const app = $('app-container');
  const speed = $('slider-speed');
  const valSpeed = $('val-speed');
  const slowmo = $('slider-slowmo');
  const valSlowmo = $('val-slowmo');
  const phase = $('slider-phase');
  const valPhase = $('val-phase');
  const volume = $('slider-volume');
  const valVolume = $('val-volume');
  const mute = $('btn-mute');
  const tuning = $('btn-tuning');

  speed.addEventListener('input', () => store.set({ speedVal: parseFloat(speed.value) }));
  const tSpeed = $('slider-tunnel-speed');
  const tHist = $('slider-tunnel-history');
  tSpeed.addEventListener('input', () => store.set({ tunnelSpeed: parseFloat(tSpeed.value) }));
  tHist.addEventListener('input', () => store.set({ tunnelHistory: parseInt(tHist.value, 10) }));
  store.subscribe(s => s.tunnelSpeed, (v) => { $('val-tunnel-speed').textContent = `${v.toFixed(2)} /s`; });
  store.subscribe(s => s.tunnelHistory, (n) => { $('val-tunnel-history').textContent = `${(n / 30).toFixed(1)} s`; });
  const persistence = $('slider-persistence');
  const glow = $('btn-glow');
  persistence.addEventListener('input', () => store.set({ persistence: parseFloat(persistence.value) }));
  glow.addEventListener('click', () => store.set({ bloom: !store.get().bloom }));
  store.subscribe(s => s.persistence, (v) => {
    const tau = persistenceTau(v);
    $('val-persistence').textContent = tau === Infinity ? '∞' : `${tau < 10 ? tau.toFixed(1) : Math.round(tau)} s`;
  });
  store.subscribe(s => s.bloom, (on) => {
    glow.classList.toggle('active', on);
    glow.textContent = on ? '✨ Glow' : '✨ Glow off';
  });
  slowmo.addEventListener('input', () => store.set({ tClose: parseFloat(slowmo.value) }));
  phase.addEventListener('input', () => store.set({ phi: parseFloat(phase.value) }));
  volume.addEventListener('input', () => store.set({ volume: parseFloat(volume.value) }));
  mute.addEventListener('click', () => store.set({ muted: !store.get().muted }));
  tuning.addEventListener('click', () => store.set({ tuning: store.get().tuning === 'just' ? 'equal' : 'just' }));
  document.querySelectorAll('[data-timbre]').forEach(btn => btn.addEventListener('click', () => store.set({ timbre: btn.dataset.timbre })));
  $('btn-collapse-panel').addEventListener('click', () => actions.setPanelCollapsed(true));
  $('panel-toggle').addEventListener('click', () => actions.setPanelCollapsed(false));

  store.subscribe(s => s.panelCollapsed, (c) => {
    panel.classList.toggle('collapsed', c);
    app.classList.toggle('panel-collapsed', c);
  });

  // Root Hz, acoustic zone and the time-scale readout ("real time" / "slowed ×N")
  store.subscribe(s => [s.chord, s.tuning, s.speedVal, s.tClose], (_, s) => {
    if (s.chord.source === 'xy') {
      // an audio signal has no root frequency: its samples are drawn as they play
      valSpeed.textContent = 'X-Y audio signal';
      valSpeed.style.color = '#2ecc71';
      valSlowmo.textContent = 'real time (audio)';
      valSlowmo.style.color = '#2ecc71';
      return;
    }
    const hz = rootHz(s);
    if (hz < 20) {
      valSpeed.textContent = `${hz.toFixed(1)} Hz (Polyrhythm Clicks)`;
      valSpeed.style.color = '#ff7f50';
    } else if (hz <= 30) {
      valSpeed.textContent = `${hz.toFixed(1)} Hz (⚡ Pitch Fusion Threshold)`;
      valSpeed.style.color = '#feca57';
    } else {
      valSpeed.textContent = `${hz.toFixed(1)} Hz (Musical Pitch)`;
      valSpeed.style.color = '#2ecc71';
    }
    const ints = s.chord.ratioInts();
    const k = ints.length ? timeScale(hz, ints[0], s.tClose) : 1;
    valSlowmo.textContent = k === 1 ? 'real time' : `slowed ×${Math.round(1 / k).toLocaleString('en-US')}`;
    valSlowmo.style.color = k === 1 ? '#2ecc71' : '#feca57';
  });
  store.subscribe(s => s.tClose, (t) => { $('val-tclose').textContent = `${t.toFixed(1)} s / period`; });
  store.subscribe(s => s.phi, (phi) => { valPhase.textContent = `${phi.toFixed(2)} rad`; });
  store.subscribe(s => s.volume, (v) => { valVolume.textContent = `${Math.round(v * 100)}%`; });
  store.subscribe(s => s.muted, (m) => {
    mute.textContent = m ? '🔇 Sound: OFF (Click to Unmute)' : '🔊 Sound: ON';
    mute.classList.toggle('active', !m);
  });
  store.subscribe(s => s.tuning, (t) => {
    tuning.textContent = t === 'just' ? 'Just Intonation (Pure)' : '12-TET (Equal Temperament)';
    tuning.classList.toggle('active', t === 'just');
  });
  store.subscribe(s => s.timbre, (t) => {
    document.querySelectorAll('[data-timbre]').forEach(b => b.classList.toggle('active', b.dataset.timbre === t));
  });
}
