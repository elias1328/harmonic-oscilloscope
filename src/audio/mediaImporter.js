// Media Importer & Player: Supports MIDI (.mid, .midi) and Audio (MP3, WAV, OGG)
// Handles parsing, polyphonic synthesis, X-Y stereo vectorscope extraction, and timeline control.

import { Midi } from '@tonejs/midi';
import { autoCorrelate, freqToMidi } from './pitchDetector.js';
import { INTERVALS_BY_SEMITONE, identifyChordFromIntervals, NOTE_NAMES, NOTE_COLORS } from '../math/harmonics.js';

export class MediaImporter {
  constructor(audioEngine) {
    this.audioEngine = audioEngine;
    this.currentMedia = null; // { type: 'midi' | 'audio', name, duration, ... }
    this.isPlaying = false;
    this.currentTime = 0;
    this.playbackRate = 1.0;
    this.isLooping = true;
    this.lastClockTime = 0;

    // Callbacks
    this.onLoaded = null; // (info) => {}
    this.onPlaybackUpdate = null; // (currentTime, duration, isPlaying) => {}
    this.onMidiStateChange = null; // (activeNotes, ratioInfo) => {}
    this.onAudioStateChange = null; // (xyPoints, pitchInfo) => {}
    this.onEnded = null;

    // MIDI specific state
    this.midiData = null;
    this.midiNotes = []; // Flat sorted array of { midi, name, time, duration, velocity }
    this.activeMidiVoices = new Map(); // midiNote -> { osc, gain, stopTime }

    // Audio specific state
    this.audioBuffer = null;
    this.audioSourceNode = null;
    this.audioStartTime = 0;
    this.audioStartOffset = 0;
    this.audioMode = 'xy'; // 'xy' | 'harmonic'
  }

  // Ensure AudioContext is ready
  get ctx() {
    this.audioEngine.resume();
    return this.audioEngine.ctx;
  }

  // Load a file from File object or ArrayBuffer
  async loadFile(file) {
    const fileName = file.name || 'Imported File';
    const ext = fileName.split('.').pop().toLowerCase();
    const arrayBuffer = await file.arrayBuffer();

    if (ext === 'mid' || ext === 'midi') {
      return this.loadMidiBuffer(arrayBuffer, fileName);
    } else {
      // Audio file (MP3, WAV, OGG, etc.)
      return this.loadAudioBuffer(arrayBuffer, fileName);
    }
  }

  // ----------------------------------------------------
  // MIDI LOADING & PLAYBACK
  // ----------------------------------------------------
  async loadMidiBuffer(arrayBuffer, name = 'MIDI Song') {
    this.stop();
    try {
      const midi = new Midi(arrayBuffer);
      this.midiData = midi;

      // Extract all notes from all tracks
      const allNotes = [];
      midi.tracks.forEach(track => {
        track.notes.forEach(note => {
          allNotes.push({
            midi: note.midi,
            name: note.name,
            pitchClass: NOTE_NAMES[note.midi % 12],
            octave: Math.floor(note.midi / 12) - 1,
            time: note.time,
            duration: note.duration,
            velocity: note.velocity
          });
        });
      });

      // Sort notes chronologically
      allNotes.sort((a, b) => a.time - b.time);
      this.midiNotes = allNotes;

      const duration = midi.duration || (allNotes.length ? allNotes[allNotes.length - 1].time + 2 : 10);
      const bpm = midi.header.tempos && midi.header.tempos.length > 0 ? Math.round(midi.header.tempos[0].bpm) : 120;

      this.currentMedia = {
        type: 'midi',
        name: midi.name || name,
        duration,
        bpm,
        noteCount: allNotes.length,
        tracksCount: midi.tracks.length
      };

      this.currentTime = 0;
      if (this.onLoaded) this.onLoaded(this.currentMedia);
      return this.currentMedia;
    } catch (err) {
      console.error('Failed to parse MIDI file:', err);
      throw new Error('Could not parse MIDI file. Please check that it is a standard MIDI format.');
    }
  }

  // ----------------------------------------------------
  // AUDIO LOADING (MP3 / WAV / OGG)
  // ----------------------------------------------------
  async loadAudioBuffer(arrayBuffer, name = 'Audio Track') {
    this.stop();
    try {
      const audioBuffer = await this.ctx.decodeAudioData(arrayBuffer);
      this.audioBuffer = audioBuffer;

      this.currentMedia = {
        type: 'audio',
        name,
        duration: audioBuffer.duration,
        channels: audioBuffer.numberOfChannels,
        sampleRate: audioBuffer.sampleRate
      };

      this.currentTime = 0;
      if (this.onLoaded) this.onLoaded(this.currentMedia);
      return this.currentMedia;
    } catch (err) {
      console.error('Failed to decode audio file:', err);
      throw new Error('Could not decode audio file. Please ensure it is a valid MP3, WAV, or OGG file.');
    }
  }

  // ----------------------------------------------------
  // PLAYBACK CONTROL
  // ----------------------------------------------------
  play() {
    if (!this.currentMedia) return;
    this.audioEngine.resume();

    if (this.isPlaying) return;
    this.isPlaying = true;
    this.lastClockTime = performance.now();

    if (this.currentMedia.type === 'audio') {
      this.startAudioSource(this.currentTime);
    }
  }

  pause() {
    if (!this.isPlaying) return;
    this.isPlaying = false;

    if (this.currentMedia && this.currentMedia.type === 'audio') {
      this.stopAudioSource();
    }
    this.stopMidiVoices();
  }

  stop() {
    this.pause();
    this.currentTime = 0;
    this.stopMidiVoices();
    if (this.onPlaybackUpdate && this.currentMedia) {
      this.onPlaybackUpdate(0, this.currentMedia.duration, false);
    }
  }

  seek(time) {
    if (!this.currentMedia) return;
    const clampedTime = Math.max(0, Math.min(this.currentMedia.duration, time));
    this.currentTime = clampedTime;

    if (this.isPlaying) {
      if (this.currentMedia.type === 'audio') {
        this.stopAudioSource();
        this.startAudioSource(this.currentTime);
      } else {
        this.stopMidiVoices();
      }
    }

    if (this.onPlaybackUpdate) {
      this.onPlaybackUpdate(this.currentTime, this.currentMedia.duration, this.isPlaying);
    }
  }

  setPlaybackRate(rate) {
    this.playbackRate = Math.max(0.25, Math.min(3.0, rate));
    if (this.audioSourceNode && this.isPlaying) {
      this.audioSourceNode.playbackRate.setValueAtTime(this.playbackRate, this.ctx.currentTime);
    }
  }

  setLoop(loop) {
    this.isLooping = loop;
    if (this.audioSourceNode) {
      this.audioSourceNode.loop = loop;
    }
  }

  // ----------------------------------------------------
  // AUDIO SOURCE NODE HELPERS
  // ----------------------------------------------------
  startAudioSource(offset = 0) {
    if (!this.audioBuffer || !this.ctx) return;
    this.stopAudioSource();

    this.audioSourceNode = this.ctx.createBufferSource();
    this.audioSourceNode.buffer = this.audioBuffer;
    this.audioSourceNode.playbackRate.setValueAtTime(this.playbackRate, this.ctx.currentTime);
    this.audioSourceNode.loop = this.isLooping;

    // Connect to AudioEngine's master analyser & gain
    this.audioSourceNode.connect(this.audioEngine.masterGain);

    this.audioStartTime = this.ctx.currentTime;
    this.audioStartOffset = offset;

    this.audioSourceNode.onended = () => {
      if (!this.isLooping && this.isPlaying && this.currentTime >= this.currentMedia.duration - 0.1) {
        this.isPlaying = false;
        if (this.onEnded) this.onEnded();
      }
    };

    this.audioSourceNode.start(0, offset);
  }

  stopAudioSource() {
    if (this.audioSourceNode) {
      try {
        this.audioSourceNode.stop();
        this.audioSourceNode.disconnect();
      } catch { /* node already stopped or param not automatable */ }
      this.audioSourceNode = null;
    }
  }

  // ----------------------------------------------------
  // MIDI SYNTHESIS & VOICE HANDLING
  // ----------------------------------------------------
  triggerMidiNoteOn(note) {
    if (!this.ctx || this.audioEngine.isMuted) return;
    const freq = 440 * Math.pow(2, (note.midi - 69) / 12);
    const t = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    // Map timbre from audioEngine
    const timbre = this.audioEngine.timbre || 'sine';
    if (timbre === 'tube') {
      osc.type = 'triangle';
    } else if (timbre === 'epiano') {
      osc.type = 'sawtooth';
    } else {
      osc.type = 'sine';
    }

    osc.frequency.setValueAtTime(freq, t);

    // Velocity & Master Volume scaling
    const vel = (note.velocity || 0.8);
    const targetGain = 0.25 * vel * (this.audioEngine.volume || 0.6);

    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(targetGain, t + 0.015);

    // Pan based on pitch for stereo immersion
    const panner = this.ctx.createStereoPanner ? this.ctx.createStereoPanner() : null;
    if (panner) {
      const panVal = Math.max(-0.8, Math.min(0.8, (note.midi - 60) / 36));
      panner.pan.setValueAtTime(panVal, t);
      osc.connect(gain);
      gain.connect(panner);
      panner.connect(this.audioEngine.masterGain);
    } else {
      osc.connect(gain);
      gain.connect(this.audioEngine.masterGain);
    }

    osc.start(t);
    this.activeMidiVoices.set(note.midi, { osc, gain, panner });
  }

  triggerMidiNoteOff(midiNum) {
    const voice = this.activeMidiVoices.get(midiNum);
    if (!voice || !this.ctx) return;

    const t = this.ctx.currentTime;
    voice.gain.gain.cancelScheduledValues(t);
    voice.gain.gain.linearRampToValueAtTime(0.0001, t + 0.08);

    setTimeout(() => {
      try {
        voice.osc.stop();
        voice.osc.disconnect();
      } catch { /* node already stopped or param not automatable */ }
    }, 100);

    this.activeMidiVoices.delete(midiNum);
  }

  stopMidiVoices() {
    this.activeMidiVoices.forEach(voice => {
      try {
        voice.osc.stop();
        voice.osc.disconnect();
      } catch { /* node already stopped or param not automatable */ }
    });
    this.activeMidiVoices.clear();
  }

  // ----------------------------------------------------
  // REAL-TIME FRAME UPDATE (Invoked by main animation loop)
  // ----------------------------------------------------
  update() {
    if (!this.currentMedia) return null;

    const now = performance.now();
    const dt = (now - this.lastClockTime) * 0.001;
    this.lastClockTime = now;

    if (this.isPlaying) {
      if (this.currentMedia.type === 'audio') {
        if (this.audioBuffer) {
          const elapsed = (this.ctx.currentTime - this.audioStartTime) * this.playbackRate;
          this.currentTime = this.audioStartOffset + elapsed;
          if (this.currentTime >= this.currentMedia.duration) {
            if (this.isLooping) {
              this.currentTime = this.currentTime % this.currentMedia.duration;
              this.audioStartTime = this.ctx.currentTime;
              this.audioStartOffset = this.currentTime;
            } else {
              this.currentTime = this.currentMedia.duration;
              this.pause();
            }
          }
        }
      } else {
        // MIDI clock progression
        this.currentTime += dt * this.playbackRate;
        if (this.currentTime >= this.currentMedia.duration) {
          if (this.isLooping) {
            this.currentTime = 0;
            this.stopMidiVoices();
          } else {
            this.currentTime = this.currentMedia.duration;
            this.pause();
          }
        }
      }

      if (this.onPlaybackUpdate) {
        this.onPlaybackUpdate(this.currentTime, this.currentMedia.duration, this.isPlaying);
      }
    }

    // Process Frame Data based on media type
    if (this.currentMedia.type === 'midi') {
      return this.processMidiFrame();
    } else {
      return this.processAudioFrame();
    }
  }

  // Process MIDI active notes & chord calculation at current timestamp
  processMidiFrame() {
    const t = this.currentTime;
    const active = [];
    const activeMidiSet = new Set();

    // Collect currently sounding notes
    for (let i = 0; i < this.midiNotes.length; i++) {
      const n = this.midiNotes[i];
      if (n.time <= t && t < n.time + n.duration) {
        active.push(n);
        activeMidiSet.add(n.midi);
      }
      if (n.time > t + 2) break; // Optimization
    }

    // Trigger synthesis noteOn/noteOff diffs during playback
    if (this.isPlaying) {
      // Note On for newly sounded notes
      active.forEach(n => {
        if (!this.activeMidiVoices.has(n.midi)) {
          this.triggerMidiNoteOn(n);
        }
      });
      // Note Off for finished notes
      this.activeMidiVoices.forEach((_, midiNum) => {
        if (!activeMidiSet.has(midiNum)) {
          this.triggerMidiNoteOff(midiNum);
        }
      });
    }

    // Sort active notes by pitch
    active.sort((a, b) => a.midi - b.midi);

    // Compute harmonic ratio and context
    let ratioInfo = null;
    if (active.length === 0) {
      ratioInfo = {
        notes: [],
        ratioInts: [1],
        ratios: [1],
        category: 'REST',
        title: 'SILENCE',
        consonance: 'Rest',
        description: 'Waiting for notes in MIDI score...',
        colors: ['#8892b0']
      };
    } else if (active.length === 1) {
      const note = active[0];
      ratioInfo = {
        notes: [note.pitchClass],
        noteFullNames: [note.name],
        ratioInts: [1],
        ratios: [1],
        category: `SOLO NOTE (${note.name})`,
        title: '1 : 1',
        consonance: 'Pure Fundamental',
        description: `Single voice ${note.name} (${(440 * Math.pow(2, (note.midi - 69) / 12)).toFixed(1)} Hz). Single-axis linear oscillation.`,
        colors: [NOTE_COLORS[note.pitchClass] || '#ff5376']
      };
    } else if (active.length === 2) {
      const n1 = active[0];
      const n2 = active[1];
      const semitoneDiff = (n2.midi - n1.midi) % 12;
      const intDef = INTERVALS_BY_SEMITONE[semitoneDiff] || {
        name: 'Interval',
        ratio: [3, 2],
        ratioInts: [3, 2],
        consonance: 'Harmonic Interval'
      };

      ratioInfo = {
        notes: [n1.pitchClass, n2.pitchClass],
        noteFullNames: [n1.name, n2.name],
        ratioInts: [...intDef.ratioInts],
        ratios: [1, intDef.ratio[0] / intDef.ratio[1]],
        category: `AN INTERVAL (${intDef.name.toUpperCase()})`,
        title: `${intDef.ratio[0]} : ${intDef.ratio[1]}`,
        consonance: intDef.consonance,
        description: `${n2.name} completes ${intDef.ratio[0]} cycles for every ${intDef.ratio[1]} cycles of ${n1.name}.`,
        colors: [NOTE_COLORS[n1.pitchClass] || '#ff5376', NOTE_COLORS[n2.pitchClass] || '#ff9f43']
      };
    } else {
      // 3 or more notes: Chord
      const rootMidi = active[0].midi;
      const intervalsFromRoot = active.map(n => (n.midi - rootMidi) % 12);
      const chord = identifyChordFromIntervals(intervalsFromRoot);
      const uniquePitchClasses = [...new Set(active.map(n => n.pitchClass))];

      ratioInfo = {
        notes: uniquePitchClasses,
        noteFullNames: active.map(n => n.name),
        ratioInts: [...chord.ratioInts],
        ratios: chord.ratioInts.map(r => r / chord.ratioInts[0]),
        category: chord.category,
        title: chord.title,
        consonance: chord.consonance,
        description: chord.description,
        colors: uniquePitchClasses.map(p => NOTE_COLORS[p] || '#ff9f43')
      };
    }

    if (this.onMidiStateChange) {
      this.onMidiStateChange(active, ratioInfo);
    }

    return { type: 'midi', activeNotes: active, ratioInfo };
  }

  // Process MP3 / Audio Frame
  processAudioFrame() {
    if (!this.audioBuffer) return null;

    const sampleRate = this.audioBuffer.sampleRate;
    const currentSample = Math.floor(this.currentTime * sampleRate);
    const N = 1024; // Samples to render on the oscilloscope screen
    const leftData = this.audioBuffer.getChannelData(0);
    const rightData = this.audioBuffer.numberOfChannels > 1 ? this.audioBuffer.getChannelData(1) : null;

    // Extract X-Y sample pairs
    const xyPoints = [];
    const windowBuf = new Float32Array(N);

    for (let i = 0; i < N; i++) {
      const idx = (currentSample + i) % this.audioBuffer.length;
      const x = leftData[idx] || 0;
      let y = 0;
      if (rightData) {
        y = rightData[idx] || 0;
      } else {
        // Mono track: create orthogonal phase quadrature for Lissajous portrait
        const phaseIdx = (idx + Math.floor(sampleRate / (4 * 440))) % this.audioBuffer.length;
        y = leftData[phaseIdx] || 0;
      }
      xyPoints.push({ x, y });
      windowBuf[i] = x;
    }

    // Real-time Pitch Detection on the window
    let pitchInfo = null;
    const detectedHz = autoCorrelate(windowBuf, sampleRate);
    if (detectedHz > 0) {
      const noteData = freqToMidi(detectedHz);
      if (noteData) {
        pitchInfo = {
          frequency: detectedHz,
          note: noteData.pitchClass,
          fullName: noteData.name,
          cents: noteData.cents
        };
      }
    }

    const result = {
      type: 'audio',
      mode: this.audioMode,
      xyPoints,
      pitchInfo
    };

    if (this.onAudioStateChange) {
      this.onAudioStateChange(result);
    }

    return result;
  }

  // ----------------------------------------------------
  // BUILT-IN DEMO GENERATORS
  // ----------------------------------------------------

  // Generate a built-in counterpoint progression exploring all harmonic ratios
  loadBuiltInMidiDemo() {
    const demoNotes = [];
    // Progression through intervals: C4 + notes
    const progression = [
      { notes: [60, 67], dur: 2.0, name: '3:2 Perfect Fifth (C4 + G4)' },
      { notes: [60, 64], dur: 2.0, name: '5:4 Major Third (C4 + E4)' },
      { notes: [60, 65], dur: 2.0, name: '4:3 Perfect Fourth (C4 + F4)' },
      { notes: [60, 69], dur: 2.0, name: '5:3 Major Sixth (C4 + A4)' },
      { notes: [60, 66], dur: 2.0, name: '45:32 Tritone (C4 + F#4)' },
      { notes: [60, 64, 67], dur: 2.5, name: '4:5:6 Major Triad (C4 + E4 + G4)' },
      { notes: [60, 63, 67], dur: 2.5, name: '10:12:15 Minor Triad (C4 + Eb4 + G4)' },
      { notes: [60, 71], dur: 2.0, name: '15:8 Major Seventh (C4 + B4)' },
      { notes: [60, 72], dur: 2.5, name: '2:1 Octave (C4 + C5)' },
      { notes: [60], dur: 2.0, name: '1:1 Single Fundamental (C4)' },
      { notes: [60, 64, 67, 72], dur: 3.5, name: 'Triumphant Full Harmonic (C-E-G-C)' }
    ];

    let t = 0;
    progression.forEach(item => {
      item.notes.forEach(midi => {
        demoNotes.push({
          midi,
          name: `${NOTE_NAMES[midi % 12]}${Math.floor(midi / 12) - 1}`,
          pitchClass: NOTE_NAMES[midi % 12],
          octave: Math.floor(midi / 12) - 1,
          time: t,
          duration: item.dur * 0.9,
          velocity: 0.85
        });
      });
      t += item.dur;
    });

    this.stop();
    this.midiNotes = demoNotes;
    this.currentMedia = {
      type: 'midi',
      name: 'Demo: Harmonic Intervals Journey (Bach Style)',
      duration: t,
      bpm: 100,
      noteCount: demoNotes.length,
      tracksCount: 2
    };

    this.currentTime = 0;
    if (this.onLoaded) this.onLoaded(this.currentMedia);
    return this.currentMedia;
  }

  // Generate a synthesized stereo oscilloscope music buffer with evolving geometric figures
  loadBuiltInOscilloscopeDemo() {
    this.stop();
    const sampleRate = this.ctx.sampleRate || 44100;
    const duration = 16.0; // 16 seconds
    const totalSamples = Math.floor(sampleRate * duration);
    const audioBuffer = this.ctx.createBuffer(2, totalSamples, sampleRate);

    const left = audioBuffer.getChannelData(0);
    const right = audioBuffer.getChannelData(1);

    // Synthesize stereo waveforms that draw evolving geometric Lissajous shapes
    for (let i = 0; i < totalSamples; i++) {
      const time = i / sampleRate;
      let x = 0;
      let y = 0;

      if (time < 4.0) {
        // Section 1: Circle to 3:2 Trefoil Lissajous
        const morph = time / 4.0;
        const fx = 150;
        const fy = 150 * (1 + 0.5 * morph); // 1.0 -> 1.5 (3:2)
        const phase = time * 0.5;
        x = Math.sin(2 * Math.PI * fx * time);
        y = Math.cos(2 * Math.PI * fy * time + phase);
      } else if (time < 8.0) {
        // Section 2: 5:4 Star Lissajous
        const t2 = time - 4.0;
        const fx = 200;
        const fy = 250; // 5:4
        const rot = t2 * 0.8;
        x = Math.sin(2 * Math.PI * fx * time) * Math.cos(rot) - Math.cos(2 * Math.PI * fy * time) * Math.sin(rot);
        y = Math.sin(2 * Math.PI * fx * time) * Math.sin(rot) + Math.cos(2 * Math.PI * fy * time) * Math.cos(rot);
      } else if (time < 12.0) {
        // Section 3: Oscilloscope Square & Diamond Morphing
        const t3 = time - 8.0;
        const phase = t3 * Math.PI * 0.5;
        x = Math.sin(2 * Math.PI * 220 * time) * 0.8 + 0.2 * Math.sin(2 * Math.PI * 660 * time);
        y = Math.cos(2 * Math.PI * 330 * time + phase) * 0.8;
      } else {
        // Section 4: 3D rotating spiral projected on 2D
        const t4 = time - 12.0;
        const r = 0.4 + 0.4 * Math.sin(t4 * 2);
        x = r * Math.sin(2 * Math.PI * 261.63 * time);
        y = r * Math.cos(2 * Math.PI * 392.4 * time + t4);
      }

      // Smooth amplitude envelope
      const env = Math.min(1.0, time / 0.2) * Math.min(1.0, (duration - time) / 0.5);
      left[i] = x * 0.7 * env;
      right[i] = y * 0.7 * env;
    }

    this.audioBuffer = audioBuffer;
    this.currentMedia = {
      type: 'audio',
      name: 'Demo: Synthesized Stereo Oscilloscope Music (X-Y Mode)',
      duration,
      channels: 2,
      sampleRate
    };

    this.currentTime = 0;
    if (this.onLoaded) this.onLoaded(this.currentMedia);
    return this.currentMedia;
  }
}
