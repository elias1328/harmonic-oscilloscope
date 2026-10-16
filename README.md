# 🎵 Harmonic Oscilloscope Visualizer

[![Live Demo](https://img.shields.io/badge/Live%20Demo-GitHub%20Pages-brightgreen?style=for-the-badge&logo=github)](https://elias1328.github.io/harmonic-oscilloscope/)
[![Vite](https://img.shields.io/badge/Vite-6-646CFF?style=for-the-badge&logo=vite&logoColor=white)](https://vitejs.dev/)
[![Three.js](https://img.shields.io/badge/Three.js-r170-black?style=for-the-badge&logo=three.js&logoColor=white)](https://threejs.org/)
[![Web Audio](https://img.shields.io/badge/Web%20Audio-API-orange?style=for-the-badge)](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)

> **Live visualizer:** [https://elias1328.github.io/harmonic-oscilloscope/](https://elias1328.github.io/harmonic-oscilloscope/)

An interactive harmonic visualizer and synthesizer. Musical intervals, chords, MIDI songs and stereo audio become **Lissajous figures** on a dark CRT-style oscilloscope, as **3D figures** in a wireframe cube, and as a **Waterfall Time Tunnel** of shapes receding into depth. The pictures are driven by the same frequencies you hear, on the same clock — visually pleasing and truthful to the physics.

---

## ✨ Features

### ⏱️ A truthful clock (and honest slow motion)
* **One clock for sound and picture.** Every voice has a phase that advances at 2π·f·k, where f is its *real* frequency in the active tuning and k is the time scale. Once audio is unlocked the clock follows `AudioContext.currentTime`.
* **Real time up to 30 Hz.** While the root is at most 30 Hz, k = 1: what you see is exactly what you hear.
* **Slow motion above 30 Hz.** Audible pitches are far too fast to watch, so the figure is the *true* motion slowed down so that one closed period of the chord lasts the **Slow-mo** time (1–20 s, default 4 s). The panel shows the factor, e.g. `slowed ×523` for a fifth on C4, or `real time`.
* **X-Y audio** is drawn sample by sample as it plays: the readout says `real time (audio)` and claims no root frequency.
* **A stalled or background tab never makes the figure jump** (frame steps are capped at 0.1 s); hiding the tab pauses media.

### 🔬 2D oscilloscope lab
* **Ghost + live tracer.** The complete figure appears at once as a faint ghost; the bright beam then traces over it at the true (slowed) speed.
* **CRT phosphor.** Each frame only the new piece of the beam path is drawn into an accumulation buffer, additively, so overlapping laps glow brighter. A blurred, quarter-size copy is added on top as bloom (✨ **Glow** toggle). Dense ratios are drawn dimmer so they stay readable.
* **Live Trace / Full Loop.** Live Trace keeps the whole trace (infinite persistence). Full Loop shows exactly one closed period in just intonation; in 12-TET, where there is no closed period, it shows the moving figure with the **Persistence** setting.
* **Rails and gliding orbs.** Voice 0 slides along the top rail and voice 1 along the left rail, each at its own position sin(θ + δ), with dashed guides to the beam for two voices. One note alone is a straight line.
* **The figure fits the free area** of the screen (right of the panel, below the header, above the player bar, clear of the waveform strip).

### 📐 The geometry
* Each voice is a coordinate x_i = sin(θ_i + δ_i). Two voices give a classic Lissajous figure; three or more are projected from N dimensions onto fixed, evenly spread directions (voices 0/1/2 on X/Y/Z, further voices on diagonals). In just intonation every figure closes exactly.
* **No accidental arcs.** For a ratio a:b the curve retraces itself into an open arc exactly at δ = (π/2)(1 − b/a) + jπ/a. The default offset δ₀ sits midway between two of these, so at φ = 0 the octave is a figure-8 and 4:3, 6:5, 8:5 and 16:15 are closed loops.
* **The φ (phase) slider is a truthful full sweep:** δ = δ₀ + φ over 0–2π. Sweeping it turns the figure like a rotating wireframe, and at some phases it really collapses into a back-and-forth arc for an instant (for example 2:1 at φ = π/2). That is the physics, not a glitch. φ also pans the voices in stereo.

### 🎼 Tuning: just intonation vs 12-TET
* **Just intonation** uses exact integer ratios (3:2, 5:4, …); the figures close and stand still.
* **12-TET** uses the real equal-tempered ratios (2^(n/12)), which are irrational: the figure **precesses** by itself at its true beat rate × k. The ghost follows the current precessing shape.
* The root is the real pitch of the lowest note (piano E = 329.63 Hz), and switching tuning never transposes it.

### 🔊 Sound and the pitch-to-rhythm continuum
* **< 20 Hz: polyrhythm clicks.** Each voice clicks when its orb reaches the end of its rail. Clicks are scheduled ahead on the audio clock at the exact analytic extrema (a 25 ms timer with a 100 ms look-ahead), so they line up with the picture.
* **20–30 Hz: fusion.** The clicks fade out while the continuous tone fades in.
* **≥ 30 Hz: musical pitch.** No clicks.
* **Timbres:** Pure Sine, Warm Tube (waveshaper with a lowpass that follows the pitch) and Soft E-Piano (fundamental plus a soft 3rd harmonic). MIDI notes use the same voices, so each timbre sounds the same for the drone and for MIDI.
* Volume, mute, and a mini waveform strip of the output.

### 🧊 3D view
* The figure inside a wireframe cube, with real-width lines whose colour fades with age, a faint ghost of the whole figure, and orbs on the X/Y/Z edges in the voice colours.
* Bloom glow (switches itself off when frames get slow; soft line halos stand in for it).
* Drag to orbit, wheel or pinch to zoom, **double-click to reset**. The cube is fitted into the free area of the screen.
* three.js is loaded only when you first switch to 3D, so the app starts fast.

### ⏳ Waterfall Time Tunnel
* Click **⏳ Time Tunnel** (from 2D it switches to 3D). About 30 times a second the current figure is captured as a slice: the newest sits at the front, and every past moment slides back along the depth and fades. A song becomes a tunnel of shapes you can orbit.
* **Each kind of interval or chord has its own colour**, so chord changes read as changes of shape *and* colour along the depth. Each change also leaves a ring labelled with the new ratio (e.g. `4 : 5 : 6`).
* **What a slice shows:** for a just-intonation chord or a MIDI chord, one exact closed period; for a manual chord in 12-TET, a 1/f_fund window of the real, precessing motion; for an audio file, the current X-Y window.
* **Driven by the media clock:** pause freezes the tunnel, seeking or ejecting clears it; without media it runs on the wall clock.
* **Controls:** Depth / Speed (0.25–4 units/s, default 2) and History length (2–16 s, default 8 s). The default camera looks into the tunnel at 25°; orbit, zoom and double-click reset work as in 3D.
* Loading a MIDI or audio file marks the button as *suggested*; the tunnel is never switched on by itself.
* The slices move on the GPU: each frame uploads only the newest slice.

### 🎹 Piano, presets, matrix and custom ratios
* **13-key piano (C4–C5).** Pick any notes; the root is the real pitch of the lowest key. Chords are recognised regardless of note order, doublings or inversion (E-G-C is C major, 1st inversion, 4 : 5 : 6), and compound intervals keep their octaves (C4 + G5 = 3 : 1). Unknown chords get the exact just-intonation ratio. The keys always show the notes that are sounding, including during MIDI playback.
* **Presets:** 3 : 2 fifth, 2 : 1 octave, 4 : 5 : 6 major, 10 : 12 : 15 minor, 6 : 8 : 9 sus4, 4 : 5 : 6 : 7 harmonic 7th, and the 120 : 128 : 135 cluster (C + Db + D in just intonation).
* **Simplest First matrix:** all 12 intervals from C, ordered by simplicity, each drawn as one closed period (the octave is a figure-8). Click a card to open it in the lab.
* **Custom integer ratio:** e.g. `4:5:6` or `16 17 18`. Whole numbers only (decimals show an inline error), reduced by their GCD (`4:6` → `2 : 3`), up to 8 voices in 8 colours. In 12-TET each voice takes the nearest equal-tempered pitch.

### 📁 MIDI and audio files
* **Import:** the 🎵 button, the panel button, or drag and drop anywhere on the window.
* **Supported formats:** `.mid`, `.midi`, `.mp3`, `.wav`, `.ogg`, `.m4a`, `.flac` (audio decoding uses the browser's codecs, so `.m4a`/`.flac` support depends on the browser).
* **MIDI:** polyphonic playback with velocity and pitch-based stereo spread; the sounding notes are identified live as an interval or chord, and the header, piano, figure and tunnel follow every change. Repeated notes of the same pitch retrigger.
* **Audio, X-Y vectorscope:** left channel on X, right channel on Y, drawn through the phosphor sample by sample.
* **Audio, pitch tracking:** autocorrelation pitch detection (at most 20 times a second) shown as the nearest note with its real frequency and cents.
* **Player bar:** play/pause, stop, scrubber (seeks on release while playing), loop, speed 0.5× / 1× / 1.5× / 2× (the position is kept when the speed changes), eject. Play after the end starts over. Audio files show their own sample rate (or the context rate, labelled as such).
* **Built-in demos:** *Harmonic Intervals Journey* (MIDI), a legato progression through the basic intervals and triads, and a synthesized stereo X-Y oscilloscope track.

### 🎹 Live MIDI keyboard
* **Connect:** plug a USB MIDI keyboard into your computer (or pair a Bluetooth MIDI keyboard with your operating system first), open the controls panel and click **🎹 MIDI Keyboard**. Allow MIDI access when the browser asks (no SysEx is requested). The status shows the device name; with several devices, a picker offers *All inputs* or one device, and the choice is remembered. Devices can be plugged in or out while the page is open; unplugging releases that keyboard's held notes. Once allowed, the app reconnects by itself next time.
* **What you see:** the held notes go through the same chord model as everything else, so the header shows the interval or chord (e.g. play C-E-G for `4 : 5 : 6`), the on-screen piano lights up, and the 2D/3D figure and the Time Tunnel follow. Releasing every key shows the rest state.
* **Tuning follows the toggle.** In **12-TET** the keyboard is an ordinary piano (440 Hz A). In **Just Intonation** every held chord is retuned live to pure ratios above its *lowest* note: the lowest note keeps its piano pitch and the others glide (≤ 30 ms, on the same oscillators) to their just pitches — C4-E4-G4 sounds 261.63, 327.03 and 392.44 Hz. Adding a lower note or switching the toggle while you hold a chord retunes it the same way. The figure uses exactly these frequencies: closed in Just Intonation, slowly precessing in 12-TET.
* **Playing:** velocity sets the loudness, the current timbre (Pure Sine, Warm Tube, Soft E-Piano) is used, the sustain pedal (CC64) holds notes, and "all notes off" (CC123) is honoured. Notes sound the moment the message arrives.
* **🔊 Keyboard sound:** turn it off to use the app as a visualizer only (for digital pianos with their own speakers). The setting is remembered.
* **Files and the drone:** the first note you play pauses a playing MIDI or audio file and silences the manual drone, which stays off while you play. Clicking a preset or an on-screen piano key, or loading a file, leaves live-keyboard mode.
* **Browser support:** Chrome, Edge and Firefox on desktop (Chrome on Android works too; Firefox asks once to allow MIDI for the site). Safari and iOS browsers do not support Web MIDI; the button is then disabled with a hint. Web MIDI needs a secure page: HTTPS (as on GitHub Pages) or `http://localhost`.

### 📱 Layout
* Works from phones to large screens: on narrow screens the nav becomes icons, the controls become a bottom sheet (start closed; ⚙️ opens them) and the player bar docks above it.
* 📸 **Snapshot** exports a PNG of the 2D or 3D view.

---

## 📐 Harmonic ratios ("Simplest First")

| Interval | Note | Just ratio | Value | Character |
| :--- | :---: | :---: | :---: | :--- |
| **Octave** | C' | 2 : 1 | 2.000 | Purest consonance (figure-8) |
| **Fifth** | G | 3 : 2 | 1.500 | Perfect consonance |
| **Fourth** | F | 4 : 3 | 1.333 | Perfect consonance |
| **Major sixth** | A | 5 : 3 | 1.667 | Imperfect consonance |
| **Major third** | E | 5 : 4 | 1.250 | Sweet consonance |
| **Minor third** | Eb | 6 : 5 | 1.200 | Somber consonance |
| **Minor sixth** | Ab | 8 : 5 | 1.600 | Mild consonance |
| **Minor seventh** | Bb | 9 : 5 | 1.800 | Mild dissonance |
| **Major second** | D | 9 : 8 | 1.125 | Moderate dissonance |
| **Major seventh** | B | 15 : 8 | 1.875 | Sharp dissonance |
| **Minor second** | Db | 16 : 15 | 1.067 | Severe dissonance |
| **Tritone** | F# | 45 : 32 | 1.406 | Extreme dissonance (close to, but not exactly, √2 ≈ 1.414) |

---

## 🚀 Getting started

### Prerequisites
* [Node.js](https://nodejs.org/) 22.12 or newer (required by the test runner)
* npm (bundled with Node)

### Install and run
```bash
git clone https://github.com/elias1328/harmonic-oscilloscope.git
cd harmonic-oscilloscope
npm install
npm run dev          # Vite dev server at http://localhost:5173/
```

### Scripts
| Command | What it does |
| :--- | :--- |
| `npm run dev` | Starts the Vite development server. |
| `npm run build` | Builds the production site into `dist/` (three.js goes into a separate chunk that loads on the first switch to 3D). |
| `npm run preview` | Serves the built `dist/` locally. |
| `npm test` | Runs the Vitest unit and integration tests (`tests/`): harmonic maths and chord identification, Lissajous geometry and closure, the clock and phase model, the click scheduler, the audio engine and media player (against a fake Web Audio API), the phosphor and tunnel logic, and the whole app wiring in jsdom. |
| `npm run test:watch` | Runs the tests in watch mode. |
| `npm run lint` | Runs ESLint (flat config, `@eslint/js` recommended rules) over the project. |
| `npm run e2e` | End-to-end check in a real browser: builds the site, serves it with `vite preview` on port 4179, generates test media, drives the app with Playwright (headless Chromium) and checks the acceptance gates (audio lifecycle, layout at 390×844 / 1280×720 / 1600×1000, player behaviour, ghost and phosphor, 3D, tunnel, colours, frame rate). Writes `e2e/results/results.json` and screenshots to `e2e/results/screenshots/`; exits non-zero if any gate fails (`npm run e2e -- --no-strict` only reports). Needs `npx playwright install chromium` once. Not run in CI. |

---

## 🌐 Deploying to GitHub Pages

The workflow `.github/workflows/deploy.yml` runs on every push to `main`: `npm ci`, `npm test`, `npm run lint`, `npm run build`, then uploads `dist/` and deploys it to GitHub Pages.

To enable it: repository **Settings** → **Pages** → **Build and deployment** → **Source: GitHub Actions**, then push to `main`.

---

## 🛠️ Tech stack
* **Vite** — dev server and bundler (code-split, lazy 3D).
* **Vanilla JavaScript (ES modules)** — a small observable store, one voice/chord model with exact fractions, and UI modules that subscribe to it.
* **HTML5 Canvas 2D** — phosphor accumulation, blur-filter bloom and the oscilloscope overlay.
* **Three.js** — 3D view (Line2 lines, UnrealBloom post-processing) and the GPU-driven Time Tunnel (custom `ShaderMaterial`).
* **Web Audio API** — drone voices, MIDI synthesis, scheduled clicks, stereo panning and analysis.
* **@tonejs/midi** — MIDI file parsing.
* **Vitest, jsdom, ESLint, Playwright** — tests, lint and end-to-end checks.

---

## 📄 License
MIT License. Open for educational, creative and musical exploration.
