// Media Importer & Player: Supports MIDI (.mid, .midi) and Audio (MP3, WAV, OGG)
// Handles parsing, polyphonic synthesis, X-Y stereo vectorscope extraction, and timeline control.

import { Midi } from '@tonejs/midi';
import { autoCorrelate, freqToMidi } from './pitchDetector.js';
import { NOTE_NAMES } from '../math/harmonics.js';
import { chordFromMidiNotes } from '../core/voices.js';
import { MAX_FRAME_DT } from '../core/clock.js';
import { parseHeaderSampleRate } from './audioFormats.js';
import { MidiSynth } from './midiSynth.js';

export { MAX_FRAME_DT };
// Pitch detection (O(N²) autocorrelation) runs at most this often.
const PITCH_INTERVAL_MS = 50;

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
    this.synth = new MidiSynth(audioEngine);
    this.resetNoteCursor();

    // Audio specific state
    this.audioBuffer = null;
    this.audioSourceNode = null;
    this.audioStartTime = 0;
    this.audioStartOffset = 0;
    this.audioMode = 'xy'; // 'xy' | 'pitch'
    this.lastPitchTime = -Infinity;
    this.lastPitchInfo = null;
    this.xyCursor = null;
  }

  // note instance -> voice of the notes currently sounding
  get activeMidiVoices() {
    return this.synth.voices;
  }

  // Moving-index note lookup: notes are sorted by start time; `cursor` is the first note not yet
  // started and `activeNotes` the started ones. Jumps (seek, loop) re-locate by binary search.
  resetNoteCursor() {
    this.cursor = 0;
    this.cursorT = null;
    this.activeNotes = [];
    this.maxDuration = this.midiNotes.reduce((m, n) => Math.max(m, n.duration), 0);
  }

  updateActiveNotes(t) {
    const notes = this.midiNotes;
    if (this.cursorT === null || t < this.cursorT || t - this.cursorT > 1) {
      let lo = 0;
      let hi = notes.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (notes[mid].time <= t) lo = mid + 1; else hi = mid;
      }
      this.cursor = lo;
      this.activeNotes = [];
      for (let j = lo - 1; j >= 0; j--) {
        const n = notes[j];
        if (n.time < t - this.maxDuration) break;
        if (t < n.time + n.duration) this.activeNotes.unshift(n);
      }
    } else {
      while (this.cursor < notes.length) {
        const n = notes[this.cursor];
        if (n.time > t) break;
        this.activeNotes.push(n);
        this.cursor++;
      }
      this.activeNotes = this.activeNotes.filter(n => t < n.time + n.duration);
    }
    this.cursorT = t;
    return this.activeNotes;
  }

  // Ensure the AudioContext exists. No side effects on the manual drone.
  get ctx() {
    this.audioEngine.init();
    return this.audioEngine.ctx;
  }

  // Forget the current media (after a failed import, so nothing stale is left behind).
  clearMedia() {
    this.stopAudioSource();
    this.stopMidiVoices();
    this.isPlaying = false;
    this.currentMedia = null;
    this.currentTime = 0;
    this.midiData = null;
    this.midiNotes = [];
    this.resetNoteCursor();
    this.audioBuffer = null;
    this.lastPitchInfo = null;
  }

  emitPlaybackUpdate() {
    if (this.onPlaybackUpdate && this.currentMedia) {
      this.onPlaybackUpdate(this.currentTime, this.currentMedia.duration, this.isPlaying);
    }
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
      this.resetNoteCursor();

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
      this.clearMedia();
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
      // decodeAudioData resamples to the context rate (and detaches the buffer): read the
      // file's own rate from its header first.
      const fileRate = parseHeaderSampleRate(arrayBuffer);
      const audioBuffer = await this.ctx.decodeAudioData(arrayBuffer);
      this.audioBuffer = audioBuffer;

      this.currentMedia = {
        type: 'audio',
        name,
        duration: audioBuffer.duration,
        channels: audioBuffer.numberOfChannels,
        sampleRate: fileRate || audioBuffer.sampleRate,
        sampleRateSource: fileRate ? 'file' : 'context'
      };

      this.currentTime = 0;
      this.lastPitchInfo = null;
      this.xyCursor = null;
      if (this.onLoaded) this.onLoaded(this.currentMedia);
      return this.currentMedia;
    } catch (err) {
      this.clearMedia();
      console.error('Failed to decode audio file:', err);
      throw new Error('Could not decode audio file. Please ensure it is a valid MP3, WAV, or OGG file.');
    }
  }

  // ----------------------------------------------------
  // PLAYBACK CONTROL
  // ----------------------------------------------------
  play() {
    if (!this.currentMedia) return;
    this.audioEngine.resumeContext();

    if (this.isPlaying) return;
    // Play after the end of the track starts over
    if (this.currentTime >= this.currentMedia.duration) {
      this.currentTime = 0;
    }
    this.isPlaying = true;
    this.lastClockTime = performance.now();

    if (this.currentMedia.type === 'audio') {
      this.startAudioSource(this.currentTime);
    }
    this.emitPlaybackUpdate();
  }

  pause() {
    if (!this.isPlaying) return;
    this.isPlaying = false;

    if (this.currentMedia && this.currentMedia.type === 'audio') {
      this.stopAudioSource();
    }
    this.stopMidiVoices();
    this.emitPlaybackUpdate();
  }

  // End of track with loop off: park at the end, report the stopped state, notify.
  handleEnded() {
    this.currentTime = this.currentMedia.duration;
    this.pause();
    if (this.onEnded) this.onEnded();
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
    this.xyCursor = null;

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
    const newRate = Math.max(0.25, Math.min(3.0, rate));
    if (this.audioSourceNode && this.isPlaying) {
      // Re-anchor the clock at the current position before the rate changes, otherwise the
      // whole elapsed time since the start would be re-scaled by the new rate.
      const now = this.ctx.currentTime;
      this.audioStartOffset += (now - this.audioStartTime) * this.playbackRate;
      this.audioStartTime = now;
      this.audioSourceNode.playbackRate.setValueAtTime(newRate, now);
    }
    this.playbackRate = newRate;
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

    const source = this.audioSourceNode;
    source.onended = () => {
      // Ignore sources that were replaced (seek, rate change) or stopped by pause()
      if (source !== this.audioSourceNode) return;
      if (!this.isLooping && this.isPlaying && this.currentTime >= this.currentMedia.duration - 0.1) {
        this.handleEnded();
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
  // Note instances (not pitches) key the voices, so same-pitch notes retrigger.
  triggerMidiNoteOn(note) {
    this.synth.noteOn(note);
  }

  triggerMidiNoteOff(note) {
    this.synth.noteOff(note);
  }

  stopMidiVoices() {
    this.synth.stopAll();
  }

  // ----------------------------------------------------
  // REAL-TIME FRAME UPDATE (Invoked by main animation loop)
  // ----------------------------------------------------
  update() {
    if (!this.currentMedia) return null;

    const now = performance.now();
    const dt = Math.min(MAX_FRAME_DT, Math.max(0, (now - this.lastClockTime) * 0.001));
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
              this.handleEnded();
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
            this.handleEnded();
          }
        }
      }

      if (this.isPlaying) this.emitPlaybackUpdate();
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
    const active = [...this.updateActiveNotes(this.currentTime)];
    const activeSet = new Set(active);

    // Trigger synthesis noteOn/noteOff diffs during playback, keyed by note instance
    if (this.isPlaying) {
      // Note Off for finished notes (first, so a same-pitch successor retriggers cleanly)
      this.synth.voices.forEach((_, n) => {
        if (!activeSet.has(n)) this.synth.noteOff(n);
      });
      active.forEach(n => this.synth.noteOn(n));
    }

    active.sort((a, b) => a.midi - b.midi);
    const chord = chordFromMidiNotes(active);
    const ratioInfo = { ...chord.meta, notes: chord.labels(), ratioInts: chord.ratioInts() };

    if (this.onMidiStateChange) {
      this.onMidiStateChange(active, ratioInfo, chord);
    }

    return { type: 'midi', activeNotes: active, ratioInfo, chord };
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

    // Samples played since the previous frame (media-clock delta × sample rate), for the phosphor
    // vectorscope: each frame draws only the new piece of the beam path.
    const len = this.audioBuffer.length;
    let start = this.xyCursor;
    if (start === null || currentSample < start || currentSample - start > sampleRate * 0.5) {
      start = Math.max(0, currentSample - 1); // first frame or a jump (seek, loop): restart
    }
    const xySegment = [];
    const quad = Math.floor(sampleRate / (4 * 440));
    for (let i = start; i < currentSample; i++) {
      const idx = i % len;
      xySegment.push({ x: leftData[idx] || 0, y: rightData ? (rightData[idx] || 0) : (leftData[(idx + quad) % len] || 0) });
    }
    this.xyCursor = currentSample;

    // Real-time pitch detection: only in pitch mode, throttled to PITCH_INTERVAL_MS
    let pitchInfo = null;
    if (this.audioMode === 'pitch') {
      const now = performance.now();
      if (now - this.lastPitchTime >= PITCH_INTERVAL_MS) {
        this.lastPitchTime = now;
        this.lastPitchInfo = null;
        const detectedHz = autoCorrelate(windowBuf, sampleRate);
        const noteData = detectedHz > 0 ? freqToMidi(detectedHz) : null;
        if (noteData) {
          this.lastPitchInfo = {
            frequency: detectedHz,
            note: noteData.pitchClass,
            fullName: noteData.name,
            cents: noteData.cents
          };
        }
      }
      pitchInfo = this.lastPitchInfo;
    }

    const result = {
      type: 'audio',
      mode: this.audioMode,
      xyPoints,
      xySegment,
      xyStart: start,
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
          duration: item.dur, // legato: no rest between steps
          velocity: 0.85
        });
      });
      t += item.dur;
    });

    this.stop();
    this.midiNotes = demoNotes;
    this.resetNoteCursor();
    this.currentMedia = {
      type: 'midi',
      name: 'Demo: Harmonic Intervals Journey',
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
    this.xyCursor = null;
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
