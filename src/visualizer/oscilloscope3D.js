// 3D Oscilloscope Visualizer: Three.js 3D Lissajous curve inside a wireframe bounding cube,
// with orbit controls, sliding glowing orbs along 3 axes, and extrema detection.

import * as THREE from 'three';

export class Oscilloscope3D {
  constructor(container, options = {}) {
    this.container = container;
    this.options = options;
    this.onExtrema = options.onExtrema || null;

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

    this.prevVelocities = [0, 0, 0];
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

  clearPath() {
    this.liveTrail = [];
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

  render(state) {
    // Check if renderer needs resize
    if (this.renderer.domElement.width === 0 && window.innerWidth > 0) {
      this.resize(window.innerWidth, window.innerHeight);
    }

    const time = state.time || 0;
    const colors = state.colors || ['#ff5376', '#2ecc71', '#ff9f43'];
    const phase = state.phase || 0;
    const notes = state.notes || [];
    const drawMode = state.drawMode || 'live';

    // Smooth camera orbit
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

    const ratioInts = state.ratioInts || [2, 3];
    const n1 = ratioInts[0] || 1;
    const n2 = ratioInts[1] || 1;
    const n3 = ratioInts[2] || (notes.length >= 3 ? 6 : null);
    const n4 = ratioInts[3] || null;

    // Instantaneous 3D tracer orb position
    const theta = (2 * Math.PI * time);
    let curX = 0;
    let curY = 0;
    let curZ = 0;

    if (notes.length <= 1) {
      // 1 Note: 1D oscillation along X axis
      curX = Math.sin(theta);
      curY = 0;
      curZ = 0;
    } else if (notes.length === 2) {
      // 2 Notes: Symmetrical closed loop in 3D space
      curX = Math.sin(n1 * theta);
      curY = Math.cos(n2 * theta + phase);
      curZ = 0;
    } else {
      // 3+ Notes: 3D Lissajous knot
      curX = Math.sin(n1 * theta);
      curY = Math.cos(n2 * theta + phase);
      curZ = Math.sin((n3 || 1) * theta + phase * 0.5);

      if (n4 !== null) {
        const mod = 1.0 + 0.15 * Math.sin(n4 * theta);
        curX *= mod;
        curY *= mod;
        curZ *= mod;
      }
    }

    this.tracerGroup.position.set(curX, curY, curZ);

    // Axis orbs on cube edges
    if (this.axisOrbs[0]) {
      this.axisOrbs[0].visible = notes.length > 0;
      this.axisOrbs[0].position.set(curX, -1.02, -1.02);
    }
    if (this.axisOrbs[1]) {
      this.axisOrbs[1].visible = notes.length > 1;
      this.axisOrbs[1].position.set(-1.02, curY, -1.02);
    }
    if (this.axisOrbs[2]) {
      this.axisOrbs[2].visible = notes.length > 2;
      this.axisOrbs[2].position.set(-1.02, -1.02, curZ);
    }

    // Extrema detection for polyrhythm clicks
    const velX = Math.cos(n1 * theta);
    const velY = notes.length > 1 ? -Math.sin(n2 * theta + phase) : 0;
    const velZ = notes.length > 2 ? Math.cos((n3 || 1) * theta + phase * 0.5) : 0;

    if (this.prevVelocities[0] * velX < 0 && this.onExtrema) this.onExtrema(0);
    if (notes.length > 1 && this.prevVelocities[1] * velY < 0 && this.onExtrema) this.onExtrema(1);
    if (notes.length > 2 && this.prevVelocities[2] * velZ < 0 && this.onExtrema) this.onExtrema(2);

    this.prevVelocities[0] = velX;
    this.prevVelocities[1] = velY;
    this.prevVelocities[2] = velZ;

    // Curve Line Rendering: Live Progressive Trace vs Full Pre-rendered Loop
    const posArray = this.curveGeometry.attributes.position.array;

    if (drawMode === 'live') {
      // Accumulate real-time positions as the orb traverses the knot
      const last = this.liveTrail[this.liveTrail.length - 1];
      if (!last || Math.hypot(last.x - curX, last.y - curY, last.z - curZ) > 0.015) {
        this.liveTrail.push({ x: curX, y: curY, z: curZ });
        if (this.liveTrail.length > this.maxPoints) {
          this.liveTrail.shift();
        }
      }

      const count = this.liveTrail.length;
      for (let i = 0; i < count; i++) {
        posArray[i * 3] = this.liveTrail[i].x;
        posArray[i * 3 + 1] = this.liveTrail[i].y;
        posArray[i * 3 + 2] = this.liveTrail[i].z;
      }

      this.curveGeometry.setDrawRange(0, count);
      this.curveGeometry.attributes.position.needsUpdate = true;
      this.glowMat.opacity = 0.55;
      this.coreMat.opacity = 0.85;
    } else {
      // Full Static Pre-rendered Mode
      const numPoints = 2400;
      const period = 2 * Math.PI;

      for (let i = 0; i < numPoints; i++) {
        const tau = (i / (numPoints - 1)) * period;
        let px = 0;
        let py = 0;
        let pz = 0;

        if (notes.length <= 1) {
          px = Math.sin(tau);
          py = 0;
          pz = 0;
        } else if (notes.length === 2) {
          px = Math.sin(n1 * tau);
          py = Math.cos(n2 * tau + phase);
          pz = 0;
        } else {
          px = Math.sin(n1 * tau);
          py = Math.cos(n2 * tau + phase);
          pz = Math.sin((n3 || 1) * tau + phase * 0.5);

          if (n4 !== null) {
            const mod = 1.0 + 0.15 * Math.sin(n4 * tau);
            px *= mod;
            py *= mod;
            pz *= mod;
          }
        }

        posArray[i * 3] = px;
        posArray[i * 3 + 1] = py;
        posArray[i * 3 + 2] = pz;
      }

      this.curveGeometry.setDrawRange(0, numPoints);
      this.curveGeometry.attributes.position.needsUpdate = true;
      this.glowMat.opacity = 0.75;
      this.coreMat.opacity = 0.98;
    }

    // Dynamic color matching
    const primaryColor = notes.length > 1 ? (colors[1] || '#ff9f43') : (colors[0] || '#ff5376');
    this.glowMat.color.set(primaryColor);
    this.coronaMat.color.set(primaryColor);

    this.renderer.render(this.scene, this.camera);
  }
}
