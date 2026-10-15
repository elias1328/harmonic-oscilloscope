// 3D Oscilloscope Visualizer: Three.js 3D Lissajous curve inside a wireframe bounding cube,
// with orbit controls and glowing orbs sliding along the 3 axes (voices 0/1/2). Points come from
// the shared figure model (src/app/figure.js on src/render/lissajous.js).

import * as THREE from 'three';
import { makeProjector, project } from '../render/lissajous.js';

export class Oscilloscope3D {
  constructor(container, options = {}) {
    this.container = container;
    this.options = options;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
    this.camera.position.set(2.6, 2.0, 3.8);
    this.camera.lookAt(0, 0, 0);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    const initW = container.clientWidth || window.innerWidth || 800;
    const initH = container.clientHeight || window.innerHeight || 600;
    this.renderer.setSize(initW, initH);
    this.camera.aspect = initW / initH;
    this.camera.updateProjectionMatrix();
    container.appendChild(this.renderer.domElement);

    // Mouse interaction / orbit
    this.isDragging = false;
    this.prevMouse = { x: 0, y: 0 };
    this.rotation = { x: 0.35, y: -0.6 };
    this.targetRotation = { x: 0.35, y: -0.6 };
    this.distance = 4.6;
    this.targetDistance = 4.6;
    this.autoRotate = true;

    this.maxPoints = 12000;
    this.liveTrail = [];

    this.setupCube();
    this.setupCurveObjects();
    this.setupAxisOrbs();
    this.bindEvents();
  }

  setupCube() {
    this.cubeGroup = new THREE.Group();
    const boxGeo = new THREE.BoxGeometry(2, 2, 2);
    const wireframeGeo = new THREE.EdgesGeometry(boxGeo);
    const wireframeMat = new THREE.LineBasicMaterial({
      color: 0x4a90e2,
      transparent: true,
      opacity: 0.42,
      blending: THREE.AdditiveBlending
    });
    this.cubeWireframe = new THREE.LineSegments(wireframeGeo, wireframeMat);
    this.cubeGroup.add(this.cubeWireframe);

    // Subtle corner markers
    const markerMat = new THREE.MeshBasicMaterial({ color: 0x60a5fa, transparent: true, opacity: 0.6 });
    const corners = [
      [-1, -1, -1], [1, -1, -1], [-1, 1, -1], [1, 1, -1],
      [-1, -1, 1], [1, -1, 1], [-1, 1, 1], [1, 1, 1]
    ];
    corners.forEach(([cx, cy, cz]) => {
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 8), markerMat);
      dot.position.set(cx, cy, cz);
      this.cubeGroup.add(dot);
    });

    this.scene.add(this.cubeGroup);
  }

  setupCurveObjects() {
    this.curveGroup = new THREE.Group();

    // Shared geometry for both core line and glowing halo
    this.positions = new Float32Array(this.maxPoints * 3);
    this.curveGeometry = new THREE.BufferGeometry();
    this.curveGeometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));

    // Outer glow line (additive, translucent)
    this.glowMat = new THREE.LineBasicMaterial({
      color: 0xff9f43,
      transparent: true,
      opacity: 0.65,
      blending: THREE.AdditiveBlending
    });

    // Core sharp line
    this.coreMat = new THREE.LineBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending
    });

    this.glowLine = new THREE.Line(this.curveGeometry, this.glowMat);
    this.coreLine = new THREE.Line(this.curveGeometry, this.coreMat);

    this.curveGroup.add(this.glowLine);
    this.curveGroup.add(this.coreLine);

    // Active tracer particle inside 3D space (white luminous core + colored corona)
    this.tracerGroup = new THREE.Group();
    const tracerGeo = new THREE.SphereGeometry(0.065, 24, 24);
    const tracerMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.tracerCore = new THREE.Mesh(tracerGeo, tracerMat);

    const coronaGeo = new THREE.SphereGeometry(0.11, 24, 24);
    this.coronaMat = new THREE.MeshBasicMaterial({
      color: 0xff9f43,
      transparent: true,
      opacity: 0.5,
      blending: THREE.AdditiveBlending
    });
    this.tracerCorona = new THREE.Mesh(coronaGeo, this.coronaMat);

    this.tracerGroup.add(this.tracerCore);
    this.tracerGroup.add(this.tracerCorona);
    this.curveGroup.add(this.tracerGroup);

    this.scene.add(this.curveGroup);
  }

  // Restore every material X-Y vectorscope mode changes (core/glow/corona colours, tracer).
  resetMaterials() {
    this.coreMat.color.setHex(0xffffff);
    this.glowMat.color.setHex(0xff9f43);
    this.coronaMat.color.setHex(0xff9f43);
    this.tracerGroup.visible = true;
  }

  clearPath() {
    this.liveTrail = [];
    this.lastT = null;
    if (this.curveGeometry) {
      this.curveGeometry.setDrawRange(0, 0);
    }
  }

  setupAxisOrbs() {
    this.axisOrbs = [];
    const colors = [0xff5376, 0x2ecc71, 0xff9f43];

    for (let i = 0; i < 3; i++) {
      const geo = new THREE.SphereGeometry(0.05, 16, 16);
      const mat = new THREE.MeshBasicMaterial({ color: colors[i] });
      const orb = new THREE.Mesh(geo, mat);
      this.axisOrbs.push(orb);
      this.scene.add(orb);
    }
  }

  bindEvents() {
    const el = this.renderer.domElement;

    el.addEventListener('pointerdown', (e) => {
      this.isDragging = true;
      this.prevMouse = { x: e.clientX, y: e.clientY };
      this.autoRotate = false;
    });

    window.addEventListener('pointermove', (e) => {
      if (!this.isDragging) return;
      const dx = e.clientX - this.prevMouse.x;
      const dy = e.clientY - this.prevMouse.y;
      this.targetRotation.y += dx * 0.008;
      this.targetRotation.x += dy * 0.008;
      this.prevMouse = { x: e.clientX, y: e.clientY };
    });

    window.addEventListener('pointerup', () => {
      this.isDragging = false;
    });

    el.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.targetDistance += e.deltaY * 0.005;
      this.targetDistance = Math.max(2.0, Math.min(8.0, this.targetDistance));
    }, { passive: false });
  }

  resize(w, h) {
    if (w <= 0 || h <= 0) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  updateCamera() {
    if (this.autoRotate && !this.isDragging) {
      this.targetRotation.y += 0.0025;
    }
    this.rotation.x += (this.targetRotation.x - this.rotation.x) * 0.1;
    this.rotation.y += (this.targetRotation.y - this.rotation.y) * 0.1;
    this.distance += (this.targetDistance - this.distance) * 0.1;
    this.camera.position.x = this.distance * Math.sin(this.rotation.y) * Math.cos(this.rotation.x);
    this.camera.position.y = this.distance * Math.sin(this.rotation.x);
    this.camera.position.z = this.distance * Math.cos(this.rotation.y) * Math.cos(this.rotation.x);
    this.camera.lookAt(0, 0, 0);
  }

  /** frame: { figure, t (clock s), drawMode, colors, xyPoints? } */
  render(frame) {
    if (this.renderer.domElement.width === 0 && window.innerWidth > 0) {
      this.resize(window.innerWidth, window.innerHeight);
    }
    this.updateCamera();

    if (frame.xyPoints) {
      this.renderXYVectorscope3D(frame.xyPoints);
      this.renderer.render(this.scene, this.camera);
      return;
    }

    const { figure, t, drawMode } = frame;
    const colors = frame.colors || [];
    const n = figure.size;
    const head = n ? figure.pointAt(t, 3) : [0, 0, 0];
    const sines = n ? figure.sinesAt(t) : [];
    this.tracerGroup.position.set(head[0], head[1], head[2]);
    this.tracerGroup.visible = n > 0;

    // Axis orbs on the cube edges, one per voice (0/1/2), in the voice colours
    const orbPos = [
      (v) => [v, -1.02, -1.02],
      (v) => [-1.02, v, -1.02],
      (v) => [-1.02, -1.02, v]
    ];
    this.axisOrbs.forEach((orb, i) => {
      orb.visible = n > i;
      if (n > i) {
        orb.position.set(...orbPos[i](sines[i]));
        orb.material.color.set(colors[i] || '#ffffff');
      }
    });

    const posArray = this.curveGeometry.attributes.position.array;
    if (!n) {
      this.curveGeometry.setDrawRange(0, 0);
    } else if (drawMode === 'live') {
      if (figure.resetVersion !== this.traceKey || this.lastT === null || this.lastT === undefined || t < this.lastT) {
        this.traceKey = figure.resetVersion;
        this.liveTrail = [head.slice()];
      } else {
        // analytic sub-steps between frames (no straight-line polygons for dense ratios)
        for (const ts of figure.substeps(this.lastT, t, 0.08, 200)) {
          const p = figure.pointAt(ts, 3);
          const last = this.liveTrail[this.liveTrail.length - 1];
          if (!last || Math.hypot(last[0] - p[0], last[1] - p[1], last[2] - p[2]) > 0.006) this.liveTrail.push(p);
        }
        if (this.liveTrail.length > this.maxPoints) this.liveTrail.splice(0, this.liveTrail.length - this.maxPoints);
      }
      this.lastT = t;
      const count = this.liveTrail.length;
      for (let i = 0; i < count; i++) {
        posArray[i * 3] = this.liveTrail[i][0];
        posArray[i * 3 + 1] = this.liveTrail[i][1];
        posArray[i * 3 + 2] = this.liveTrail[i][2];
      }
      this.curveGeometry.setDrawRange(0, count);
      this.curveGeometry.attributes.position.needsUpdate = true;
      this.glowMat.opacity = 0.55;
      this.coreMat.opacity = 0.85;
    } else {
      this.lastT = null;
      // One closed period from the current phases (exact closure in just intonation)
      const numPoints = 2400;
      const proj = makeProjector(n, 3);
      const th0 = figure.phasesAt(t);
      const w = figure.model.freqs.map((_, i) => figure.model.omega(i));
      const T = figure.period;
      for (let i = 0; i < numPoints; i++) {
        const dt = (T * i) / (numPoints - 1);
        const p = project(th0.map((ph, j) => ph + w[j] * dt), proj);
        posArray[i * 3] = p[0];
        posArray[i * 3 + 1] = p[1];
        posArray[i * 3 + 2] = p[2];
      }
      this.curveGeometry.setDrawRange(0, numPoints);
      this.curveGeometry.attributes.position.needsUpdate = true;
      this.glowMat.opacity = 0.75;
      this.coreMat.opacity = 0.98;
    }

    // Dynamic color matching (and undo any X-Y vectorscope colouring of the core line)
    const primaryColor = n > 1 ? (colors[1] || '#ff9f43') : (colors[0] || '#ff5376');
    this.coreMat.color.setHex(0xffffff);
    this.glowMat.color.set(primaryColor);
    this.coronaMat.color.set(primaryColor);

    this.renderer.render(this.scene, this.camera);
  }

  // Dedicated 3D hardware X-Y stereo vectorscope renderer (sweeps time along Z-axis)
  renderXYVectorscope3D(pts) {
    if (!pts || pts.length === 0) return;

    const count = Math.min(pts.length, this.maxPoints);
    const posArray = this.curveGeometry.attributes.position.array;

    for (let i = 0; i < count; i++) {
      const pt = pts[i];
      posArray[i * 3] = pt.x * 0.95;
      posArray[i * 3 + 1] = pt.y * 0.95;
      posArray[i * 3 + 2] = ((i / count) * 2.0 - 1.0) * 0.95;
    }

    this.curveGeometry.setDrawRange(0, count);
    this.curveGeometry.attributes.position.needsUpdate = true;

    // Position tracer orb at current head of sweep
    const last = pts[pts.length - 1];
    this.tracerGroup.position.set(last.x * 0.95, last.y * 0.95, 0.95);
    this.tracerGroup.visible = true;

    // Phosphor green glow
    this.glowMat.color.setHex(0x2ecc71);
    this.glowMat.opacity = 0.8;
    this.coreMat.color.setHex(0xa8ff78);
    this.coreMat.opacity = 0.98;
    this.coronaMat.color.setHex(0x2ecc71);

    if (this.axisOrbs[0]) this.axisOrbs[0].position.set(last.x * 0.95, -1.02, -1.02);
    if (this.axisOrbs[1]) this.axisOrbs[1].position.set(-1.02, last.y * 0.95, -1.02);
    if (this.axisOrbs[2]) this.axisOrbs[2].position.set(-1.02, -1.02, 0.95);
  }
}
