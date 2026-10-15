// 3D oscilloscope (lazy-loaded with three.js on the first switch to 3D).
//
// - The figure lives in a wireframe cube; glowing orbs slide along the X/Y/Z edges, one per voice.
// - Ghost: the complete figure as a faint thin line, shown at once (exact period in just
//   intonation, the current precessing shape in 12-TET).
// - Live trace: a real-width Line2 whose vertex colours fade with age, fed from a preallocated
//   ring buffer (copyWithin, no Array.shift) with analytic sub-steps.
// - Glow: EffectComposer + UnrealBloomPass, switched off automatically when frames get slow.
// - The camera is centred on, and the cube fitted into, the free area (not under the panel or
//   the player bar). Drag to orbit, wheel or pinch to zoom, double-click to reset.

import * as THREE from 'three';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { makeProjector, project } from '../render/lissajous.js';
import { BloomGovernor } from './bloomGovernor.js';
import { TimeTunnel } from './timeTunnel.js';

const MAX_POINTS = 12000;
const DEFAULT_VIEW = { rx: 0.35, ry: -0.6, zoom: 1 };
// Time Tunnel: look into the tunnel at 25° to its axis: cos 25° = cos(rx)·cos(ry)
const TUNNEL_RX = 0.25;
export const TUNNEL_VIEW = { rx: TUNNEL_RX, ry: -Math.acos(Math.cos((25 * Math.PI) / 180) / Math.cos(TUNNEL_RX)), zoom: 1 };
const FOV = 45;
const CUBE_RADIUS = Math.sqrt(3) * 1.04; // circumscribed sphere of the cube and its edge orbs

/** A Line2 whose geometry buffers are allocated once and updated in place. */
function makeLine(material, maxPoints) {
  const geo = new LineGeometry();
  geo.setPositions(new Float32Array(maxPoints * 3));
  geo.setColors(new Float32Array(maxPoints * 3));
  const line = new Line2(geo, material);
  line.frustumCulled = false;
  geo.instanceCount = 0;
  return line;
}

export class Oscilloscope3D {
  constructor(container) {
    this.container = container;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 1000);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setClearColor(0x08090c, 1);
    // the CRT black as the scene background, so it survives the post-processing colour pipeline
    this.scene.background = new THREE.Color(0x08090c);
    container.appendChild(this.renderer.domElement);
    this.renderer.domElement.style.touchAction = 'none';

    this.view = { ...DEFAULT_VIEW };
    this.target = { ...DEFAULT_VIEW };
    this.autoRotate = true;
    this.pointers = new Map();
    this.safeArea = null;

    // ring buffer of live-trace points
    this.maxPoints = MAX_POINTS;
    this.trail = new Float32Array(MAX_POINTS * 3);
    this.trailCount = 0;
    this.lastT = null;
    this.traceKey = null;
    this.ghostKey = null;
    this.ghostLog = [];

    this.mode = 'figure';
    this.setupCube();
    this.setupCurveObjects();
    this.setupAxisOrbs();
    this.tunnel = new TimeTunnel();
    this.scene.add(this.tunnel.group);
    this.setupBloom();
    this.bindEvents();

    const w = container.clientWidth || window.innerWidth || 800;
    const h = container.clientHeight || window.innerHeight || 600;
    this.resize(w, h);
  }

  setupCube() {
    this.cubeGroup = new THREE.Group();
    const wireframeGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(2, 2, 2));
    const wireframeMat = new THREE.LineBasicMaterial({ color: 0x4a90e2, transparent: true, opacity: 0.32 });
    this.cubeGroup.add(new THREE.LineSegments(wireframeGeo, wireframeMat));
    const markerMat = new THREE.MeshBasicMaterial({ color: 0x60a5fa, transparent: true, opacity: 0.6 });
    const dotGeo = new THREE.SphereGeometry(0.022, 8, 8);
    for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) {
      const dot = new THREE.Mesh(dotGeo, markerMat);
      dot.position.set(x, y, z);
      this.cubeGroup.add(dot);
    }
    this.scene.add(this.cubeGroup);
  }

  setupCurveObjects() {
    this.curveGroup = new THREE.Group();

    // Ghost of the complete figure (faint, thin). glowMat = the voice-coloured material.
    this.glowMat = new LineMaterial({ color: 0xff9f43, linewidth: 1.3, transparent: true, opacity: 0.32, depthWrite: false });
    this.ghostLine = makeLine(this.glowMat, 4001);
    // soft glow for when bloom is off (slow devices): a wide faint copy of the same geometry
    this.ghostHaloMat = new LineMaterial({ color: 0xff9f43, linewidth: 6, transparent: true, opacity: 0.1, depthWrite: false, blending: THREE.AdditiveBlending });
    this.ghostHalo = new Line2(this.ghostLine.geometry, this.ghostHaloMat);
    this.ghostHalo.frustumCulled = false;
    this.curveGroup.add(this.ghostHalo, this.ghostLine);

    // Live trace: white multiplier × per-vertex colours that fade with age. coreMat is white in
    // the normal view and tinted phosphor-green by the X-Y vectorscope.
    this.coreMat = new LineMaterial({ color: 0xffffff, linewidth: 2.6, vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending });
    this.trailLine = makeLine(this.coreMat, MAX_POINTS);
    this.trailHaloMat = new LineMaterial({ color: 0xffffff, linewidth: 9, vertexColors: true, transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending });
    this.trailHalo = new Line2(this.trailLine.geometry, this.trailHaloMat);
    this.trailHalo.frustumCulled = false;
    this.curveGroup.add(this.trailHalo, this.trailLine);

    // Tracer: white core + coloured corona
    this.tracerGroup = new THREE.Group();
    this.tracerCore = new THREE.Mesh(new THREE.SphereGeometry(0.045, 20, 20), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    this.coronaMat = new THREE.MeshBasicMaterial({ color: 0xff9f43, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false });
    this.tracerCorona = new THREE.Mesh(new THREE.SphereGeometry(0.085, 20, 20), this.coronaMat);
    this.tracerGroup.add(this.tracerCore, this.tracerCorona);
    this.curveGroup.add(this.tracerGroup);
    this.scene.add(this.curveGroup);
  }

  setupAxisOrbs() {
    this.axisOrbs = [0xff5376, 0x2ecc71, 0xff9f43].map(c => {
      const orb = new THREE.Mesh(new THREE.SphereGeometry(0.045, 16, 16), new THREE.MeshBasicMaterial({ color: c }));
      this.scene.add(orb);
      return orb;
    });
  }

  setupBloom() {
    this.governor = new BloomGovernor();
    this.bloomWanted = true;
    try {
      this.composer = new EffectComposer(this.renderer);
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      this.bloomPass = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.7, 0.4, 0.12);
      this.composer.addPass(this.bloomPass);
      this.composer.addPass(new OutputPass());
    } catch {
      this.composer = null; // no post-processing available: plain rendering
    }
  }

  /** Glow toggle. Turning it on again re-arms the automatic slow-frame check. */
  setBloom(on) {
    this.bloomWanted = on;
    if (on) this.governor.reset();
  }

  get bloomActive() {
    return !!(this.composer && this.bloomWanted && !this.governor.autoDisabled);
  }

  // Exact defaults of the current mode: orientation, zoom.
  resetView() {
    const v = this.mode === 'tunnel' ? TUNNEL_VIEW : DEFAULT_VIEW;
    this.view = { ...v };
    this.target = { ...v };
    this.autoRotate = this.mode !== 'tunnel';
  }

  /** 'figure' (the cube) or 'tunnel' (the Waterfall Time Tunnel). */
  setMode(mode) {
    if (mode === this.mode) return;
    this.mode = mode;
    const tunnel = mode === 'tunnel';
    this.tunnel.group.visible = tunnel;
    this.cubeGroup.visible = !tunnel;
    this.curveGroup.visible = !tunnel;
    this.axisOrbs.forEach(o => { o.visible = !tunnel; });
    if (tunnel) this.tunnel.clear();
    this.resetView();
    this.updateCamera(true);
  }

  bindEvents() {
    const el = this.renderer.domElement;
    const pinchDist = () => {
      const [a, b] = [...this.pointers.values()];
      return Math.hypot(a.x - b.x, a.y - b.y);
    };
    el.addEventListener('pointerdown', (e) => {
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      this.autoRotate = false;
      if (this.pointers.size === 2) this.pinch = { dist: pinchDist(), zoom: this.target.zoom };
      try { el.setPointerCapture?.(e.pointerId); } catch { /* synthetic pointer */ }
    });
    el.addEventListener('pointermove', (e) => {
      const p = this.pointers.get(e.pointerId);
      if (!p) return;
      const dx = e.clientX - p.x;
      const dy = e.clientY - p.y;
      p.x = e.clientX;
      p.y = e.clientY;
      if (this.pointers.size >= 2 && this.pinch) {
        // fingers apart -> zoom in
        this.target.zoom = Math.max(0.4, Math.min(2.5, this.pinch.zoom * (pinchDist() / Math.max(1, this.pinch.dist))));
      } else {
        this.target.ry += dx * 0.008;
        this.target.rx = Math.max(-1.45, Math.min(1.45, this.target.rx + dy * 0.008));
      }
    });
    const up = (e) => {
      this.pointers.delete(e.pointerId);
      if (this.pointers.size < 2) this.pinch = null;
    };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.target.zoom = Math.max(0.4, Math.min(2.5, this.target.zoom * Math.exp(-e.deltaY * 0.001)));
    }, { passive: false });
    el.addEventListener('dblclick', () => this.resetView());
  }

  resize(w, h) {
    if (w <= 0 || h <= 0) return;
    this.width = w;
    this.height = h;
    this.renderer.setSize(w, h);
    if (this.composer) this.composer.setSize(w, h);
    const pr = this.renderer.getPixelRatio ? this.renderer.getPixelRatio() : 1;
    for (const m of [this.glowMat, this.coreMat, this.ghostHaloMat, this.trailHaloMat]) m.resolution.set(w * pr, h * pr);
    this.tunnel.setResolution(w * pr, h * pr);
    this.updateCamera(true);
  }

  // Free area of the window (CSS px) not covered by the panel, header, player bar or strip.
  setSafeArea(area) {
    this.safeArea = area;
  }

  /** Camera centred on the free area, at a distance that fits the whole cube into it. */
  updateCamera(snap = false) {
    const W = this.width || 1;
    const H = this.height || 1;
    const a = this.safeArea && this.safeArea.right - this.safeArea.left > 120 && this.safeArea.bottom - this.safeArea.top > 120
      ? this.safeArea : { left: 0, top: 0, right: W, bottom: H };
    const cx = (a.left + a.right) / 2;
    const cy = (a.top + a.bottom) / 2;
    const half = Math.min(a.right - a.left, a.bottom - a.top) / 2 * 0.92;
    // sphere of radius r at distance d spans tan(asin(r/d)) / tan(fov/2) × H/2 pixels
    const k = (half / (H / 2)) * Math.tan((FOV * Math.PI) / 360);
    // the tunnel: aim a little behind the front figure so the receding slices fill the view
    const tunnel = this.mode === 'tunnel';
    const lookZ = tunnel ? -Math.min(this.tunnel.depth, 10) * 0.22 : 0;
    const radius = tunnel ? 1.3 + Math.min(this.tunnel.depth, 10) * 0.16 : CUBE_RADIUS;
    this.fitDistance = radius / Math.sin(Math.atan(k));

    if (this.autoRotate && this.pointers.size === 0) this.target.ry += 0.0025;
    const ease = snap ? 1 : 0.1;
    for (const key of ['rx', 'ry', 'zoom']) this.view[key] += (this.target[key] - this.view[key]) * ease;
    const d = this.fitDistance / this.view.zoom;
    const { rx, ry } = this.view;
    this.camera.aspect = W / H;
    this.camera.position.set(d * Math.sin(ry) * Math.cos(rx), d * Math.sin(rx), lookZ + d * Math.cos(ry) * Math.cos(rx));
    this.camera.lookAt(0, 0, lookZ);
    // shift the principal point to the centre of the free area
    this.camera.setViewOffset(W, H, W / 2 - cx, H / 2 - cy, W, H);
    this.camera.updateProjectionMatrix();
  }

  clearPath() {
    this.trailCount = 0;
    this.lastT = null;
    this.trailLine.geometry.instanceCount = 0;
  }

  // Ring buffer: when full, drop the oldest 10% in one copyWithin.
  pushPoint(p) {
    if (this.trailCount === this.maxPoints) {
      const drop = Math.floor(this.maxPoints / 10);
      this.trail.copyWithin(0, drop * 3, this.trailCount * 3);
      this.trailCount -= drop;
    }
    const i = this.trailCount * 3;
    this.trail[i] = p[0];
    this.trail[i + 1] = p[1];
    this.trail[i + 2] = p[2];
    this.trailCount++;
  }

  /** Copy the ring buffer into the line's segment buffers with colours fading by age. */
  uploadTrail(color) {
    const geo = this.trailLine.geometry;
    const pos = geo.attributes.instanceStart.data;
    const col = geo.attributes.instanceColorStart.data;
    const n = this.trailCount;
    const P = this.trail;
    for (let i = 0; i < n - 1; i++) {
      pos.array.set(P.subarray(i * 3, i * 3 + 6), i * 6);
      const f0 = 0.08 + 0.92 * Math.pow(i / (n - 1), 1.6);
      const f1 = 0.08 + 0.92 * Math.pow((i + 1) / (n - 1), 1.6);
      col.array[i * 6] = color.r * f0; col.array[i * 6 + 1] = color.g * f0; col.array[i * 6 + 2] = color.b * f0;
      col.array[i * 6 + 3] = color.r * f1; col.array[i * 6 + 4] = color.g * f1; col.array[i * 6 + 5] = color.b * f1;
    }
    pos.needsUpdate = true;
    col.needsUpdate = true;
    geo.instanceCount = Math.max(0, n - 1);
  }

  setGhost(key, points, color) {
    if (key === this.ghostKey) return;
    this.ghostKey = key;
    const geo = this.ghostLine.geometry;
    const pos = geo.attributes.instanceStart.data;
    const n = Math.min(points.length, 4001);
    for (let i = 0; i < n - 1; i++) {
      pos.array.set(points[i], i * 6);
      pos.array.set(points[i + 1], i * 6 + 3);
    }
    const col = geo.attributes.instanceColorStart.data;
    col.array.fill(1);
    pos.needsUpdate = true;
    col.needsUpdate = true;
    geo.instanceCount = Math.max(0, n - 1);
    this.glowMat.color.set(color);
    this.ghostHaloMat.color.set(color);
    this.ghostLog.push({ key, at: performance.now() });
    if (this.ghostLog.length > 400) this.ghostLog.splice(0, 200);
  }

  // Restore every material X-Y vectorscope mode changes (core/glow/corona colours, tracer).
  resetMaterials() {
    this.coreMat.color.setHex(0xffffff);
    this.glowMat.color.setHex(0xff9f43);
    this.coronaMat.color.setHex(0xff9f43);
    this.tracerGroup.visible = true;
    this.ghostLine.visible = true;
  }

  periodPoints(figure, t, steps) {
    const proj = makeProjector(figure.size, 3);
    const th0 = figure.phasesAt(t);
    const w = figure.model.freqs.map((_, i) => figure.model.omega(i));
    const T = figure.period;
    const pts = [];
    for (let i = 0; i <= steps; i++) {
      const dt = (T * i) / steps;
      pts.push(project(th0.map((p, j) => p + w[j] * dt), proj));
    }
    return pts;
  }

  /** frame: { figure, t (clock s), drawMode, colors, xyPoints?, bloom, tunnel? } */
  render(frame) {
    // the governor judges the real frame interval (GPU work included), not just this JS
    const start = performance.now();
    const interval = this.lastFrameStart ? start - this.lastFrameStart : 0;
    this.lastFrameStart = start;
    this.setMode(frame.tunnel && frame.tunnel.on ? 'tunnel' : 'figure');
    if (this.bloomPass) {
      // the tunnel stacks many slices: a gentler, higher-threshold glow keeps their colours
      this.bloomPass.strength = this.mode === 'tunnel' ? 0.35 : 0.7;
      this.bloomPass.radius = this.mode === 'tunnel' ? 0.2 : 0.4;
      this.bloomPass.threshold = this.mode === 'tunnel' ? 0.45 : 0.12;
    }
    this.updateCamera();
    if (this.mode === 'tunnel') {
      if (frame.tunnel.speed !== undefined && frame.tunnel.speed !== this.tunnel.speed) this.tunnel.setSpeed(frame.tunnel.speed);
      if (frame.tunnel.history !== undefined && frame.tunnel.history !== this.tunnel.ring.history) this.tunnel.setHistory(frame.tunnel.history);
      this.tunnel.update(frame.tunnel);
    } else if (frame.xyPoints) {
      this.renderXYVectorscope3D(frame.xyPoints);
    } else {
      this.renderFigure(frame);
    }
    this.draw();
    if (this.bloomActive && interval > 0 && interval < 250) this.governor.record(interval);
  }

  draw() {
    // the line halos stand in for bloom when it is off
    const halo = !this.bloomActive;
    this.ghostHalo.visible = halo && this.ghostLine.visible;
    this.trailHalo.visible = halo && this.trailLine.visible;
    this.tunnel.frontHalo.visible = halo && this.tunnel.front.visible;
    if (this.bloomActive) {
      try {
        this.composer.render();
        return;
      } catch {
        this.composer = null;
      }
    }
    this.renderer.render(this.scene, this.camera);
  }

  /** Render now and read the canvas in the same tick (the drawing buffer is not preserved). */
  snapshot() {
    this.draw();
    return this.renderer.domElement.toDataURL('image/png');
  }

  renderFigure(frame) {
    const { figure, t, drawMode } = frame;
    const colors = frame.colors || [];
    const n = figure.size;
    const primary = new THREE.Color(n > 1 ? (colors[1] || '#ff9f43') : (colors[0] || '#ff5376'));
    this.coreMat.color.setHex(0xffffff);
    this.coronaMat.color.copy(primary);
    this.tracerGroup.visible = n > 0;
    this.ghostLine.visible = n > 0;
    this.trailLine.visible = n > 0;

    if (!n) {
      this.axisOrbs.forEach(o => { o.visible = false; });
      this.clearPath();
      return;
    }
    const head = figure.pointAt(t, 3);
    const sines = figure.sinesAt(t);
    this.tracerGroup.position.set(head[0], head[1], head[2]);
    const orbPos = [(v) => [v, -1.02, -1.02], (v) => [-1.02, v, -1.02], (v) => [-1.02, -1.02, v]];
    this.axisOrbs.forEach((orb, i) => {
      orb.visible = n > i;
      if (n > i) {
        orb.position.set(...orbPos[i](sines[i]));
        orb.material.color.set(colors[i] || '#ffffff');
      }
    });

    // Ghost: the whole figure at once (exact period in JI, current precessing shape in 12-TET)
    const steps = Math.min(4000, Math.max(1200, figure.ratioInts.reduce((s, r) => s + r, 0) * 40));
    const ghostKey = figure.closed ? figure.key : `${figure.key}|${Math.floor(t * 10)}`;
    if (ghostKey !== this.ghostKey) this.setGhost(ghostKey, this.periodPoints(figure, t, steps), primary);

    const reset = figure.resetVersion !== this.traceKey || this.lastT === null || t < this.lastT;
    if (reset) {
      this.traceKey = figure.resetVersion;
      this.trailCount = 0;
      this.pushPoint(head);
    }
    if (drawMode === 'full' && figure.closed) {
      // Full Loop: one exact closed period, bright
      if (this.fullKey !== ghostKey || reset) {
        this.trailCount = 0;
        for (const p of this.periodPoints(figure, t, Math.min(steps, this.maxPoints - 1))) this.pushPoint(p);
        this.fullKey = ghostKey;
      }
    } else {
      this.fullKey = null;
      if (!reset) {
        const from = Math.max(this.lastT, t - figure.period);
        for (const ts of figure.substeps(from, t, 0.03, 600)) this.pushPoint(figure.pointAt(ts, 3));
      }
    }
    this.lastT = t;
    this.uploadTrail(drawMode === 'full' && figure.closed ? primary.clone().lerp(new THREE.Color(0xffffff), 0.35) : primary.clone().lerp(new THREE.Color(0xffffff), 0.4));
  }

  // 3D X-Y vectorscope: x = L, y = R, the sample index sweeps along Z.
  renderXYVectorscope3D(pts) {
    if (!pts || pts.length === 0) return;
    const count = Math.min(pts.length, this.maxPoints);
    this.trailCount = 0;
    for (let i = 0; i < count; i++) this.pushPoint([pts[i].x * 0.95, pts[i].y * 0.95, ((i / count) * 2.0 - 1.0) * 0.95]);
    this.lastT = null;
    this.ghostLine.visible = false;
    this.uploadTrail(new THREE.Color(0x2ecc71));
    const last = pts[count - 1];
    this.tracerGroup.position.set(last.x * 0.95, last.y * 0.95, 0.95);
    this.tracerGroup.visible = true;
    // phosphor green
    this.glowMat.color.setHex(0x2ecc71);
    this.coreMat.color.setHex(0xa8ff78);
    this.coronaMat.color.setHex(0x2ecc71);
    if (this.axisOrbs[0]) this.axisOrbs[0].position.set(last.x * 0.95, -1.02, -1.02);
    if (this.axisOrbs[1]) this.axisOrbs[1].position.set(-1.02, last.y * 0.95, -1.02);
    if (this.axisOrbs[2]) this.axisOrbs[2].position.set(-1.02, -1.02, 0.95);
  }
}
