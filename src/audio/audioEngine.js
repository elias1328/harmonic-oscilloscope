// Audio Engine: Real-time synthesis, Just Intonation vs 12-TET, Timbre shaping,
// and the Pitch-to-Rhythm continuum (audio tones -> polyrhythmic clicks).

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.analyser = null;
    this.voices = []; // Active oscillator/gain pairs
    this.isMuted = false;
    this.timbre = 'sine'; // 'sine' | 'tube' | 'epiano'
    this.tuning = 'just'; // 'just' | 'equal'
    this.baseFreq = 261.6256; // C4
    this.speedMultiplier = 1.0;
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

    if (this.currentNotes && this.voices.length === 0) {
      this.refreshVoices();
    }
  }

  resume() {
    if (!this.ctx) {
      this.init();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    if (this.ctx && this.currentNotes && this.voices.length === 0) {
      this.refreshVoices();
    }
  }

  setMuted(muted) {
    this.isMuted = muted;
    this.resume();
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.masterGain.gain.cancelScheduledValues(t);
    this.masterGain.gain.linearRampToValueAtTime(muted ? 0 : this.volume, t + 0.05);
    if (!muted && this.voices.length === 0 && this.currentNotes) {
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

  // Set the current chord/interval frequencies
  setNotes(notesData) {
    // notesData: array of { name, semitones, justRatio }
    this.currentNotes = notesData;
    this.refreshVoices();
  }

  refreshVoices() {
    if (!this.ctx || !this.currentNotes) return;
    this.stopVoices();

    const t = this.ctx.currentTime;
    // Speed factor: if speedMultiplier < 0.1 (slow-mo), continuous tones fade out
    // as polyrhythmic clicks take over
    const isSubAudio = this.speedMultiplier < 0.15;
    const voiceGainLevel = isSubAudio ? 0 : (0.8 / Math.sqrt(this.currentNotes.length || 1));

    this.currentNotes.forEach((note, idx) => {
      let freq = this.baseFreq;
      if (this.tuning === 'just') {
        freq = this.baseFreq * (note.justRatio || 1);
      } else {
        // Equal temperament (12-TET)
        freq = this.baseFreq * Math.pow(2, (note.semitones || 0) / 12);
      }

      // Voice gain
      const vGain = this.ctx.createGain();
      vGain.gain.setValueAtTime(0, t);
      vGain.gain.linearRampToValueAtTime(voiceGainLevel, t + 0.05);

      // Stereo spatial panner node for phase-acoustic modulation
      const panner = this.ctx.createStereoPanner ? this.ctx.createStereoPanner() : null;
      if (panner) {
        vGain.connect(panner);
        panner.connect(this.masterGain);
      } else {
        vGain.connect(this.masterGain);
      }

      const voiceObj = { oscs: [], gain: vGain, panner, baseFreq: freq, idx };

      if (this.timbre === 'sine') {
        const osc = this.ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, t);
        osc.connect(vGain);
        osc.start(t);
        voiceObj.oscs.push(osc);
      } else if (this.timbre === 'tube') {
        const osc = this.ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, t);

        const shaper = this.ctx.createWaveShaper();
        shaper.curve = this.createTubeDistortionCurve(10);
        shaper.oversample = '4x';

        const lowpass = this.ctx.createBiquadFilter();
        lowpass.type = 'lowpass';
        lowpass.frequency.setValueAtTime(Math.min(freq * 4, 8000), t);

        osc.connect(shaper);
        shaper.connect(lowpass);
        lowpass.connect(vGain);
        osc.start(t);
        voiceObj.oscs.push(osc);
      } else if (this.timbre === 'epiano') {
        // Fundamental + soft bell harmonic (3rd harmonic)
        const osc1 = this.ctx.createOscillator();
        const osc2 = this.ctx.createOscillator();
        const g2 = this.ctx.createGain();

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
        voiceObj.oscs.push(osc1, osc2);
      }

      this.voices.push(voiceObj);
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
    const t = this.ctx.currentTime;
    this.voices.forEach(v => {
      try {
        v.gain.gain.cancelScheduledValues(t);
        v.gain.gain.linearRampToValueAtTime(0, t + 0.03);
        setTimeout(() => {
          v.oscs.forEach(osc => {
            try { osc.stop(); osc.disconnect(); } catch { /* node already stopped or param not automatable */ }
          });
          v.gain.disconnect();
        }, 50);
      } catch { /* node already stopped or param not automatable */ }
    });
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
    let toneGainMult = 0;
    if (hz >= 30) {
      toneGainMult = 1.0;
    } else if (hz > 20) {
      toneGainMult = (hz - 20) / 10.0; // 0.0 to 1.0
    }

    const baseLevel = (0.8 / Math.sqrt(this.currentNotes?.length || 1)) * toneGainMult;

    // Update voice frequencies and target gain
    this.voices.forEach((v, idx) => {
      const note = this.currentNotes[idx];
      if (!note) return;
      let freq = hz;
      if (this.tuning === 'just') {
        freq = hz * (note.justRatio || 1);
      } else {
        freq = hz * Math.pow(2, (note.semitones || 0) / 12);
      }

      // Audible oscillator minimum is ~20 Hz
      const oscFreq = Math.max(20, freq);
      v.oscs.forEach(osc => {
        try {
          osc.frequency.setTargetAtTime(oscFreq, t, 0.03);
        } catch { /* node already stopped or param not automatable */ }
      });
      try {
        v.gain.gain.setTargetAtTime(baseLevel, t, 0.03);
      } catch { /* node already stopped or param not automatable */ }
    });
  }

  // Trigger a percussive woodblock click when an axis ball bounces in slow-motion
  // Exactly as requested: stops completely on about 20-30 Hertz!
  triggerPolyrhythmClick(axisIndex) {
    if (!this.ctx || this.isMuted) return;
    if (this.currentHz >= 30) return; // Completely stopped above 30 Hz!

    // Fade down click volume between 20 Hz and 30 Hz
    let clickGainScale = 1.0;
    if (this.currentHz >= 20) {
      clickGainScale = 1.0 - (this.currentHz - 20) / 10.0;
    }
    if (clickGainScale <= 0.01) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();

    const pitch = this.polyrhythmPitches[axisIndex % this.polyrhythmPitches.length];
    osc.type = 'sine';
    osc.frequency.setValueAtTime(pitch, t);
    osc.frequency.exponentialRampToValueAtTime(pitch * 0.35, t + 0.045);

    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(pitch, t);
    filter.Q.setValueAtTime(2.0, t);

    const clickVol = Math.max(0.4, this.volume) * clickGainScale;
    gain.gain.setValueAtTime(clickVol, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.045);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    osc.start(t);
    osc.stop(t + 0.05);
  }

  getWaveformData() {
    if (!this.analyser) return null;
    const bufferLength = this.analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    this.analyser.getByteTimeDomainData(dataArray);
    return dataArray;
  }
}
