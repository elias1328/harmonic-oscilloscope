// "🎹 MIDI Keyboard" control: connect / status / device picker / Keyboard-sound toggle.

import { MidiInput } from '../audio/midiInput.js';
import { LiveKeyboard, storage } from '../app/liveKeyboard.js';

const $ = (id) => document.getElementById(id);

export function initMidiKeyboard({ store, actions, audio }) {
  const live = new LiveKeyboard({ store, audio, actions });
  const btn = $('btn-midi-keyboard');
  const status = $('midi-status');
  const select = $('midi-device');
  const sound = $('btn-keyboard-sound');
  const nav = typeof navigator !== 'undefined' ? navigator : {};

  const input = new MidiInput({
    requestMIDIAccess: typeof nav.requestMIDIAccess === 'function' ? nav.requestMIDIAccess.bind(nav) : undefined,
    device: storage.get('harmonic.midiDevice') || 'all',
    onEvent: (ev, device) => live.event(ev, device),
    onDeviceGone: (device) => live.releaseDevice(device),
    onStatus: (s) => store.set({ midi: s })
  });
  live.input = input;

  btn.addEventListener('click', () => {
    audio.resume(); // the click is the user gesture that lets the keyboard make sound
    if (input.state === 'connected') {
      input.disconnect();
      live.exit();
      storage.set('harmonic.midiEnabled', 'off');
    } else {
      input.connect().then(ok => { if (ok) storage.set('harmonic.midiEnabled', 'on'); });
    }
  });
  select.addEventListener('change', () => {
    storage.set('harmonic.midiDevice', select.value);
    input.setDevice(select.value);
  });
  sound.addEventListener('click', () => live.setSound(!store.get().liveSound));

  store.subscribe(s => s.midi, (m) => {
    btn.dataset.state = m.state;
    btn.disabled = m.state === 'unsupported';
    btn.classList.toggle('active', m.state === 'connected');
    const names = m.devices.map(d => d.name);
    let text = '';
    if (m.state === 'connecting') text = 'Connecting…';
    else if (m.state === 'connected') {
      const chosen = m.devices.find(d => d.id === m.device);
      text = !names.length ? 'Connected — plug in a MIDI keyboard'
        : `Connected: ${chosen ? chosen.name : names.length === 1 ? names[0] : `All inputs (${names.length})`}`;
    } else if (m.state === 'error' || m.state === 'unsupported') text = m.message;
    status.textContent = text;
    status.hidden = !text;
    status.classList.toggle('error', m.state === 'error' || m.state === 'unsupported');
    // device picker only when there is a choice to make
    select.replaceChildren(...[{ id: 'all', name: 'All inputs' }, ...m.devices].map(d => new Option(d.name, d.id)));
    select.value = m.devices.some(d => d.id === m.device) ? m.device : 'all';
    select.hidden = !(m.state === 'connected' && m.devices.length > 1);
  });
  store.subscribe(s => s.liveSound, (on) => {
    sound.setAttribute('aria-pressed', String(on));
    sound.classList.toggle('active', on);
    sound.textContent = on ? '🔊 Keyboard sound' : '🔇 Keyboard sound off';
  });

  if (!input.supported) input.connect(); // reports "unsupported" with the browser hint
  else if (storage.get('harmonic.midiEnabled') === 'on') input.connect(); // reconnect (no prompt once allowed)
  else store.set({ midi: { state: 'off', message: '', devices: [], device: input.device } });
  return live;
}
