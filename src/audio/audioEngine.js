// Audio Engine: Real-time synthesis, Just Intonation vs 12-TET, Timbre shaping,
// and the Pitch-to-Rhythm continuum (audio tones -> polyrhythmic clicks).

// Continuous-tone gain multiplier for a root frequency: silent below 20 Hz (pure clicks),
// linear crossfade 20-30 Hz (fusion zone), full above 30 Hz (musical pitch).
export function toneGainForHz(hz) {
  if (hz >= 30) return 1.0;
  if (hz > 20) return (hz - 20) / 10.0;
  return 0;
}

// Audible oscillator minimum is ~20 Hz
const MIN_OSC_HZ = 20;
const VOICE_ATTACK = 0.05;
const VOICE_RELEASE = 0.03;

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.analyser = null;
    this.voices = []; // Active drone voices (see createVoice)
    this.isMuted = false;
    this.timbre = 'sine'; // 'sine' | 'tube' | 'epiano'
    this.tuning = 'just'; // 'just' | 'equal'
    this.baseFreq = 261.6256; // C4
    this.currentHz = this.baseFreq; // current root frequency (speed slider)
    this.droneEnabled = true; // false while MIDI/audio media owns the output
    this.volume = 0.6;
    this.polyrhythmPitches = [900, 600, 420, 1200]; // woodblock click frequencies for axes X, Y, Z, W
  }

  init() {
    if (this.ctx) return;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AudioContextClass();

    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : this.volume, this.ctx.currentTime);

    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.analyser.smoothingTimeConstant = 0.8;

    this.masterGain.connect(this.analyser);
    this.analyser.connect(this.ctx.destination);

    if (this.droneEnabled && this.currentNotes && this.voices.length === 0) {
      this.refreshVoices();
    }
  }

  // Unlock/resume the AudioContext. Restarts the drone only when it is enabled.
  resume() {
    if (!this.ctx) {
      this.init();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    if (this.ctx && this.droneEnabled && this.currentNotes && this.voices.length === 0) {
      this.refreshVoices();
    }
  }

  // Unlock/resume the AudioContext only (never touches the drone). Used by the media player.
  resumeContext() {
    if (!this.ctx) this.init();
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  // The manual drone is disabled while media (MIDI / audio files) plays, and re-enabled
  // on eject or on any manual action (preset, piano, custom ratio, matrix card).
  // Pass { rebuild: false } when the caller reconfigures the voices right after.
  setDroneEnabled(enabled, { rebuild = true } = {}) {
    if (this.droneEnabled === enabled) return;
    this.droneEnabled = enabled;
    if (!this.ctx) return;
    if (enabled) {
      if (rebuild) this.refreshVoices();
    } else {
      this.stopVoices();
    }
  }

  setMuted(muted) {
    this.isMuted = muted;
    this.resume();
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.masterGain.gain.cancelScheduledValues(t);
    this.masterGain.gain.linearRampToValueAtTime(muted ? 0 : this.volume, t + 0.05);
    if (!muted && this.droneEnabled && this.voices.length === 0 && this.currentNotes) {
      this.refreshVoices();
    }
  }

  setVolume(vol) {
    this.volume = Math.max(0, Math.min(1, vol));
    if (this.masterGain && !this.isMuted) {
      this.masterGain.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.03);
    }
  }

  setTimbre(timbre) {
    this.timbre = timbre;
    this.refreshVoices();
  }

  setTuning(tuning) {
    this.tuning = tuning;
    this.refreshVoices();
  }

  // Set notes, tuning and root together with a single voice rebuild.
  configure({ notes, tuning, rootHz }) {
    if (notes) this.currentNotes = notes;
    if (tuning) this.tuning = tuning;
    if (rootHz !== undefined) this.currentHz = rootHz;
    this.refreshVoices();
    this.setRootFrequency(this.currentHz);
  }

  // Create warm tube distortion curve
  createTubeDistortionCurve(k = 20) {
    const n_samples = 44100;
    const curve = new Float32Array(n_samples);
    const deg = Math.PI / 180;
    for (let i = 0; i < n_samples; ++i) {
      const x = (i * 2) / n_samples - 1;
      curve[i] = ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x));
    }
    return curve;
  }

  // The tube curve never changes: build it once and share it between all voices.
  getTubeCurve() {
    if (!this.tubeCurve) this.tubeCurve = this.createTubeDistortionCurve(10);
    return this.tubeCurve;
  }

  // Set the current chord/interval frequencies
  setNotes(notesData) {
    // notesData: array of { name, semitones, justRatio }
    this.currentNotes = notesData;
    this.refreshVoices();
  }

  noteFrequency(note, rootHz) {
    if (this.tuning === 'just') {
      return rootHz * (note.justRatio || 1);
    }
    // Equal temperament (12-TET)
    return rootHz * Math.pow(2, (note.semitones || 0) / 12);
  }

  droneLevel() {
    return (0.8 / Math.sqrt(this.currentNotes?.length || 1)) * toneGainForHz(this.currentHz);
  }

  // Voice factory shared by the drone and the MIDI synth, so a timbre sounds the same in both.
  // Returns { oscs, gain, panner, nodes, baseFreq } where nodes are the extra internal nodes.
  createVoice(freq, level, { pan = 0, attack = VOICE_ATTACK } = {}) {
    const ctx = this.ctx;
    const t = ctx.currentTime;

    // Voice gain
    const vGain = ctx.createGain();
    vGain.gain.setValueAtTime(0, t);
    vGain.gain.linearRampToValueAtTime(level, t + attack);

    // Stereo spatial panner node for phase-acoustic modulation
    const panner = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if (panner) {
      panner.pan.setValueAtTime(pan, t);
      vGain.connect(panner);
      panner.connect(this.masterGain);
    } else {
      vGain.connect(this.masterGain);
    }

    const voice = { oscs: [], gain: vGain, panner, nodes: [], baseFreq: freq };

    if (this.timbre === 'tube') {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t);

      const shaper = ctx.createWaveShaper();
      shaper.curve = this.getTubeCurve();
      shaper.oversample = '4x';

      const lowpass = ctx.createBiquadFilter();
      lowpass.type = 'lowpass';
      lowpass.frequency.setValueAtTime(Math.min(freq * 4, 8000), t);

      osc.connect(shaper);
      shaper.connect(lowpass);
      lowpass.connect(vGain);
      osc.start(t);
      voice.oscs.push(osc);
      voice.nodes.push(shaper, lowpass);
      voice.lowpass = lowpass;
    } else if (this.timbre === 'epiano') {
      // Fundamental + soft bell harmonic (3rd harmonic)
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const g2 = ctx.createGain();

      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(freq, t);

      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(freq * 3, t); // bell chime
      g2.gain.setValueAtTime(0.15, t);

      osc1.connect(vGain);
      osc2.connect(g2);
      g2.connect(vGain);

      osc1.start(t);
      osc2.start(t);
      voice.oscs.push(osc1, osc2);
      voice.nodes.push(g2);
    } else {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t);
      osc.connect(vGain);
      osc.start(t);
      voice.oscs.push(osc);
    }
    return voice;
  }

  // Glide a running voice to a new pitch on the same oscillators (no restart): the 3rd harmonic
  // of the e-piano and the tube's lowpass follow. glide ≤ 30 ms keeps it click-free but quick.
  retuneVoice(voice, freq, glide = 0.02) {
    if (!this.ctx || !voice) return;
    const t = this.ctx.currentTime;
    const ramp = (param, value) => {
      try {
        param.cancelScheduledValues(t);
        param.setValueAtTime(param.value, t);
        param.linearRampToValueAtTime(value, t + glide);
      } catch { /* param not automatable */ }
    };
    voice.oscs.forEach((osc, i) => ramp(osc.frequency, i === 0 ? freq : freq * 3));
    if (voice.lowpass) ramp(voice.lowpass.frequency, Math.min(freq * 4, 8000));
    voice.baseFreq = freq;
  }

  // Fade a voice out, then stop and disconnect every node (panner included).
  releaseVoice(voice, release = VOICE_RELEASE) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    try {
      voice.gain.gain.cancelScheduledValues(t);
      voice.gain.gain.linearRampToValueAtTime(0, t + release);
    } catch { /* param not automatable */ }
    setTimeout(() => {
      voice.oscs.forEach(osc => {
        try { osc.stop(); } catch { /* already stopped */ }
        try { osc.disconnect(); } catch { /* already disconnected */ }
      });
      [...voice.nodes, voice.gain, voice.panner].forEach(n => {
        if (!n) return;
        try { n.disconnect(); } catch { /* already disconnected */ }
      });
    }, (release * 1000) + 20);
  }

  refreshVoices() {
    if (!this.ctx || !this.currentNotes) return;
    this.stopVoices();
    if (!this.droneEnabled) return;

    const level = this.droneLevel();
    this.currentNotes.forEach((note, idx) => {
      const freq = Math.max(MIN_OSC_HZ, this.noteFrequency(note, this.currentHz));
      const voice = this.createVoice(freq, level);
      voice.idx = idx;
      this.voices.push(voice);
    });

    if (this.currentPhase !== undefined) {
      this.setPhase(this.currentPhase);
    }
  }

  // Set phase: creates physical audible stereo widening / interaural delay between the notes!
  setPhase(phi) {
    this.currentPhase = phi;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.voices.forEach((v) => {
      if (!v.panner) return;
      let pan = 0;
      if (v.idx === 0) {
        pan = -Math.sin(phi) * 0.45;
      } else if (v.idx === 1) {
        pan = Math.sin(phi) * 0.45;
      } else if (v.idx === 2) {
        pan = Math.cos(phi) * 0.35;
      }
      try {
        v.panner.pan.setTargetAtTime(pan, t, 0.03);
      } catch { /* node already stopped or param not automatable */ }
    });
  }

  stopVoices() {
    if (!this.ctx) return;
    this.voices.forEach(v => this.releaseVoice(v));
    this.voices = [];
  }

  // Update frequency in Hertz and handle the 20-30 Hz polyrhythm-to-pitch transition
  setRootFrequency(hz) {
    this.currentHz = hz;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;

    // Below 20 Hz: pure polyrhythm clicks, continuous tone volume = 0
    // Between 20 and 30 Hz: crossfade (clicks fade out, continuous tone fades in)
    // Above 30 Hz: pure musical tone, clicks completely stopped
    const baseLevel = this.droneLevel();

    // Update voice frequencies and target gain
    this.voices.forEach((v, idx) => {
      const note = this.currentNotes[idx];
      if (!note) return;
      const oscFreq = Math.max(MIN_OSC_HZ, this.noteFrequency(note, hz));
      v.oscs.forEach((osc, i) => {
        try {
          // epiano's second oscillator is the 3rd harmonic
          osc.frequency.setTargetAtTime(i === 0 ? oscFreq : oscFreq * 3, t, 0.03);
        } catch { /* param not automatable */ }
      });
      if (v.lowpass) {
        // the tube's lowpass tracks the pitch (4th harmonic, capped at 8 kHz)
        try { v.lowpass.frequency.setTargetAtTime(Math.min(oscFreq * 4, 8000), t, 0.03); } catch { /* param not automatable */ }
      }
      try {
        v.gain.gain.setTargetAtTime(baseLevel, t, 0.03);
      } catch { /* param not automatable */ }
    });
  }

  // Percussive woodblock click for voice `axisIndex`, started exactly at audio time `when`.
  // Scheduling (which extrema, the 30 Hz cut-off, the 20-30 Hz fade) is the ClickScheduler's job.
  scheduleClick(axisIndex, when, gainScale = 1) {
    if (!this.ctx || this.isMuted || gainScale <= 0.01) return null;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();

    const pitch = this.polyrhythmPitches[axisIndex % this.polyrhythmPitches.length];
    osc.type = 'sine';
    osc.frequency.setValueAtTime(pitch, when);
    osc.frequency.exponentialRampToValueAtTime(pitch * 0.35, when + 0.045);

    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(pitch, when);
    filter.Q.setValueAtTime(2.0, when);

    const clickVol = Math.max(0.4, this.volume) * gainScale;
    gain.gain.setValueAtTime(clickVol, when);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.045);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    osc.start(when);
    osc.stop(when + 0.05);
    osc.onended = () => { try { osc.disconnect(); filter.disconnect(); gain.disconnect(); } catch { /* gone */ } };
    return osc;
  }

  // Immediate click, gated by the current root frequency (silent at 30 Hz and above, fading
  // out from 20 Hz).
  triggerPolyrhythmClick(axisIndex) {
    if (!this.ctx || this.isMuted) return null;
    if (this.currentHz >= 30) return null;
    const scale = this.currentHz >= 20 ? 1.0 - (this.currentHz - 20) / 10.0 : 1.0;
    return this.scheduleClick(axisIndex, this.ctx.currentTime, scale);
  }

  getWaveformData() {
    if (!this.analyser) return null;
    const bufferLength = this.analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    this.analyser.getByteTimeDomainData(dataArray);
    return dataArray;
  }
}
