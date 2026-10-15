# 🎵 Harmonic Oscilloscope Visualizer

[![Live Demo](https://img.shields.io/badge/Live%20Demo-GitHub%20Pages-brightgreen?style=for-the-badge&logo=github)](https://elias1328.github.io/harmonic-oscilloscope/)
[![Vite](https://img.shields.io/badge/Vite-6.0-646CFF?style=for-the-badge&logo=vite&logoColor=white)](https://vitejs.dev/)
[![Three.js](https://img.shields.io/badge/Three.js-r170-black?style=for-the-badge&logo=three.js&logoColor=white)](https://threejs.org/)
[![Web Audio](https://img.shields.io/badge/Web%20Audio-API-orange?style=for-the-badge)](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)

> **Experience the live visualizer:** [https://elias1328.github.io/harmonic-oscilloscope/](https://elias1328.github.io/harmonic-oscilloscope/)

An interactive physical harmonic visualizer and audio synthesizer that turns musical intervals, rational chord harmonics, and microtonal polyrhythms into living **Lissajous figures** and **3D spatial knots** — capturing the viral aesthetics of *@michaelsmusicmind*.

---

## ✨ Features

### 🔬 2D Oscilloscope Lab
* **CRT Phosphor Bloom:** Deep dark aesthetic (`#07080c`) with luminous additive bloom, warm golden tracer particles, and outer coronas.
* **Dual Axis Rails & Gliding Orbs:** 
  * Top rail ($X$-axis): Horizontal root frequency deflection.
  * Left rail ($Y$-axis): Vertical interval frequency deflection with dashed laser tracking guides.
* **Exact Symmetrical Closed Loops:** Ratios like $3:2$ (Perfect Fifth) form closed loops with crossing lines and symmetrical lobes matching the original video.
* **Single-Note 1D Oscillation:** Physical oscilloscope channel behavior — selecting one note oscillates as a pure straight horizontal line along the center axis, and expands into a 2D Lissajous figure when a 2nd note is introduced.
* **Progressive Live Trace:** 
  * Watch figures be drawn in real time by the tracer orb.
  * Additive light accumulation (`lighter`) ensures lines get progressively lighter and more radiant as overlapping loops repeat.
  * Sub-step interpolation maintains silky smooth arcs even for complex dissonances ($45:32$).

### 🧊 3D Spatial Lissajous Visualizer
* **Wireframe Bounding Cube:** Glowing cyan/blue bounding box with corner anchor points and axis tracking orbs.
* **Interactive 3D Orbit Camera:** Full mouse/touch drag rotation, auto-rotation, and smooth zoom.
* **Multi-Layered Spatial Knots:** Triads and 7th chords ($4:5:6$, $10:12:15$, $4:5:6:7$) weave symmetrical 3D Lissajous knots with real-time progressive spatial trails.

### 🔊 Sound Engine & The Pitch-to-Rhythm Continuum
* **Polyrhythm Clicks ($< 20\text{ Hz}$):** Extrema bounce detection triggers percussive woodblock clicks with pitch-coded frequencies for each axis ($X$, $Y$, $Z$).
* **Fusion Threshold ($20\text{--}30\text{ Hz}$):** The physical acoustic zone where discrete rhythmic pulses blur and fuse into a continuous musical pitch.
* **Audible Tones ($> 30\text{ Hz}$):** Pure sine waves, warm analog tube saturation, and soft electric piano timbres.
* **Just Intonation vs 12-TET:** Toggle between pure mathematical integer ratios and standard piano equal temperament with acoustic phase drift.
* **Audible Phase Offset ($\phi$):**
  * Visually rotates the figure like a 3D wireframe.
  * Acoustically shifts the stereo field between voices via `StereoPannerNode` for 3D spatial widening in headphones.
  * Syncopates the timing of polyrhythm clicks in sub-audio mode.

### 🎹 Interactive Piano Keyboard & Harmonic Presets
* **13-Key Clickable Piano (C4–C5):** Choose any root note and build custom intervals or chords dynamically.
* **Harmonic Presets:** Instant access to 2:1 Octave, 3:2 Fifth, 4:5:6 Major Triad, 10:12:15 Minor Triad, 6:8:9 Sus4, 4:5:6:7 Harmonic 7th, and Dissonance Cluster.
* **Simplest First Matrix:** Dedicated 12-card gallery rendering every interval from C ordered by harmonic simplicity.
* **Custom Integer Ratio Input:** Enter arbitrary ratios (e.g. `16:17:18` or `3:4:5`) with automatic GCD reduction.
* **Mini Oscilloscope Waveform:** Real-time time-domain audio trace strip at the bottom of the screen.
* **Snapshot Export:** One-click high-resolution PNG export.

---

## 📐 Harmonic Ratios ("Simplest First")

| Interval | Note | Ratio | Frequency Ratio | Consonance Classification | Visual Form |
| :--- | :---: | :---: | :---: | :--- | :--- |
| **Octave** | C' | $2 : 1$ | $2.000$ | Purest Consonance | Figure-8 / Infinity loop |
| **Fifth** | G | $3 : 2$ | $1.500$ | Perfect Consonance | 2-lobed symmetrical closed loop |
| **Fourth** | F | $4 : 3$ | $1.333$ | Perfect Consonance | 3-lobed closed loop |
| **Major Sixth** | A | $5 : 3$ | $1.667$ | Imperfect Consonance | 5:3 interwoven loop |
| **Major Third** | E | $5 : 4$ | $1.250$ | Sweet Consonance | 5:4 tranquil lattice |
| **Minor Third** | Eb | $6 : 5$ | $1.200$ | Somber Consonance | 6:5 harmonic knot |
| **Minor Sixth** | Ab | $8 : 5$ | $1.600$ | Mild Consonance | 8:5 expanded orbital |
| **Minor Seventh** | Bb | $9 : 5$ | $1.800$ | Mild Dissonance | 9:5 forward momentum |
| **Major Second** | D | $9 : 8$ | $1.125$ | Moderate Dissonance | Dense, close Lissajous mesh |
| **Major Seventh** | B | $15 : 8$ | $1.875$ | Sharp Dissonance | High-density tension mesh |
| **Minor Second** | Db | $16 : 15$ | $1.067$ | Severe Dissonance | Fast acoustic beating mesh |
| **Tritone** | F# | $45 : 32$ | $1.406$ | Extreme Dissonance | Complex 45:32 non-resolving web |

---

## 🚀 Getting Started

### Prerequisites
* [Node.js](https://nodejs.org/) (v18 or higher)
* npm (bundled with Node)

### Installation
```bash
# Clone the repository
git clone https://github.com/elias1328/harmonic-oscilloscope.git
cd harmonic-oscilloscope

# Install dependencies
npm install

# Start the Vite development server
npm run dev
```

Open your browser at `http://localhost:5173/` to view the visualizer.

### Production Build
```bash
npm run build
npm run preview
```

---

## 🌐 Deploying to GitHub Pages

This repository includes a GitHub Actions workflow (`.github/workflows/deploy.yml`) that automatically builds and publishes the visualizer to GitHub Pages whenever you push to the `main` branch.

To enable GitHub Pages in your GitHub repository:
1. Go to your repository on GitHub: `https://github.com/elias1328/harmonic-oscilloscope`.
2. Navigate to **Settings** > **Pages**.
3. Under **Build and deployment** > **Source**, select **GitHub Actions**.
4. Push a commit to `main`, and the deployment will run automatically!

---

## 🛠️ Tech Stack
* **Vite** — Blazing fast dev server and optimized production bundler.
* **Three.js** — 3D Lissajous knot rendering and WebGL camera orbit controls.
* **HTML5 Canvas 2D** — Dual-rail CRT oscilloscope with sub-step interpolation and additive bloom.
* **Web Audio API** — Real-time polyphonic synthesis, `StereoPannerNode` spatial phase modulation, and time-domain analysis.

---

## 📄 License
MIT License. Open for educational, creative, and musical exploration.
