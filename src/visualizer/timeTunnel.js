// Waterfall Time Tunnel (3D). About 30 times a second the current figure is captured as a slice;
// the newest sits at the front (z = 0) and every past slice slides back along −z and fades, so a
// song becomes a tunnel of shapes you can orbit. Chord changes leave a labelled marker ring.
//
// GPU motion: all slices live in one preallocated BufferGeometry (a ring of MAX_SLICES slices ×
// 256 vertices with position, birthTime and colour). A ShaderMaterial computes
// z = (birthTime − uNow)·uSpeed and the age fade, so each frame uploads only the new slice
// (partial update ranges) and a few uniforms.

import * as THREE from 'three';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { SliceRing, sliceZ, sliceAlpha, SLICE_POINTS, CAPTURE_HZ, MAX_SLICES, DEFAULT_SPEED, ChordMarkerFilter } from './tunnelCore.js';

const VERT = /* glsl */ `
  uniform float uNow;
  uniform float uSpeed;
  uniform float uHistory;
  uniform float uVeil;
  attribute float birthTime;
  attribute vec3 color;
  varying vec3 vColor;
  varying float vAlpha;
  varying float vRib;
  void main() {
    float age = uNow - birthTime;
    vRib = step(fract(birthTime * 4.0), 0.12);
    // same fade as sliceAlpha() in tunnelCore.js: ribs over the whole history, the faint veil
    // between them over its first uVeil seconds
    float h = vRib > 0.5 ? uHistory : min(uVeil, uHistory);
    vAlpha = (age < 0.0 || age >= h) ? 0.0 : pow(1.0 - age / h, 1.6);
    vColor = color;
    vec3 p = vec3(position.xy, (birthTime - uNow) * uSpeed);
    // invisible slices are moved outside the clip volume, so they cost no rasterisation
    gl_Position = vAlpha > 0.0 ? projectionMatrix * modelViewMatrix * vec4(p, 1.0) : vec4(2.0, 2.0, 2.0, 1.0);
  }
`;

const FRAG = /* glsl */ `
  uniform float uIntensity;
  varying vec3 vColor;
  varying float vAlpha;
  varying float vRib;
  void main() {
    if (vAlpha <= 0.002) discard;
    // most slices are a faint veil; a brighter rib every quarter second marks time along the depth
    float b = mix(0.1, 1.0, vRib) * vAlpha * uIntensity;
    gl_FragColor = vec4(vColor * b, b);
  }
`;

function labelSprite(text, color) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 96;
  const ctx = canvas.getContext('2d');
  ctx.font = '700 54px "Space Grotesk", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  ctx.fillText(text, 256, 48);
  const tex = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(1.4, 0.26, 1);
  sprite.center.set(0.5, 0); // centred above its ring
  return sprite;
}

export class TimeTunnel {
  constructor() {
    this.group = new THREE.Group();
    this.group.visible = false;
    this.ring = new SliceRing(MAX_SLICES, SLICE_POINTS);
    this.speed = DEFAULT_SPEED;
    this.lastCapture = -Infinity;
    this.lastTitle = null;
    this.markerFilter = new ChordMarkerFilter();
    this.now = 0;
    this.markers = [];
    this.markersCreated = 0;
    this.markerLabels = [];
    this.countTrace = []; // visible slices per frame, last 240 frames (debug / e2e)

    const geo = new THREE.BufferGeometry();
    const attr = (array, size) => {
      const a = new THREE.BufferAttribute(array, size);
      a.setUsage(THREE.DynamicDrawUsage);
      return a;
    };
    geo.setAttribute('position', attr(this.ring.positions, 3));
    geo.setAttribute('birthTime', attr(this.ring.births, 1));
    geo.setAttribute('color', attr(this.ring.colors, 3));
    // static index: segments inside each slice only (slices are never joined to each other)
    const P = SLICE_POINTS;
    const index = new Uint32Array(MAX_SLICES * (P - 1) * 2);
    let k = 0;
    for (let s = 0; s < MAX_SLICES; s++) {
      for (let i = 0; i < P - 1; i++) {
        index[k++] = s * P + i;
        index[k++] = s * P + i + 1;
      }
    }
    geo.setIndex(new THREE.BufferAttribute(index, 1));
    this.geometry = geo;

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uNow: { value: 0 },
        uSpeed: { value: this.speed },
        uHistory: { value: this.ring.history / CAPTURE_HZ },
        uVeil: { value: 2.0 },
        uIntensity: { value: 0.9 }
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    this.lines = new THREE.LineSegments(geo, this.material);
    this.lines.frustumCulled = false;
    // explicit draw order (the shader moves the slices, so depth sorting cannot): slices, then
    // the front figure, then the marker rings and labels on top
    this.lines.renderOrder = 1;
    this.group.add(this.lines);

    // The current figure, crisp and bright at the front of the tunnel
    // normal blending: crossings of a dense figure do not add up to white
    this.frontMat = new LineMaterial({ color: 0xffffff, linewidth: 2.2, transparent: true, opacity: 0.95, depthWrite: false });
    const fg = new LineGeometry();
    fg.setPositions(new Float32Array(SLICE_POINTS * 3));
    this.front = new Line2(fg, this.frontMat);
    this.front.frustumCulled = false;
    this.front.visible = false;
    this.frontHaloMat = new LineMaterial({ color: 0xffffff, linewidth: 8, transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending });
    this.frontHalo = new Line2(fg, this.frontHaloMat); // glow stand-in when bloom is off
    this.frontHalo.frustumCulled = false;
    this.frontHalo.visible = false;
    this.frontHalo.renderOrder = 2;
    this.front.renderOrder = 3;
    this.group.add(this.frontHalo, this.front);

    // faint axis guide along the depth
    const axisGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0.3), new THREE.Vector3(0, 0, -12)]);
    this.axis = new THREE.Line(axisGeo, new THREE.LineBasicMaterial({ color: 0x4a90e2, transparent: true, opacity: 0.18 }));
    this.group.add(this.axis);
  }

  get historySeconds() {
    return this.ring.history / CAPTURE_HZ;
  }

  get depth() {
    return this.historySeconds * this.speed;
  }

  setSpeed(speed) {
    this.speed = speed;
    this.material.uniforms.uSpeed.value = speed;
  }

  setHistory(slices) {
    this.ring.setHistory(slices);
    this.material.uniforms.uHistory.value = this.historySeconds;
  }

  setResolution(w, h) {
    this.frontMat.resolution.set(w, h);
    this.frontHaloMat.resolution.set(w, h);
  }

  clear() {
    this.lastCapture = -Infinity;
    this.markerFilter.reset();
    this.markers.forEach(m => this.removeMarker(m));
    this.markers = [];
    this.front.visible = false;
  }

  /** Upload only the vertices of one slot (partial update ranges, no full re-upload). */
  uploadSlot(slot) {
    const P = SLICE_POINTS;
    for (const [name, size] of [['position', 3], ['birthTime', 1], ['color', 3]]) {
      const a = this.geometry.attributes[name];
      a.clearUpdateRanges();
      a.addUpdateRange(slot * P * size, P * size);
      a.needsUpdate = true;
    }
  }

  addMarker(title, color, birth) {
    const g = new THREE.Group();
    const pts = [];
    for (let i = 0; i <= 96; i++) pts.push(Math.cos((i / 96) * Math.PI * 2) * 1.18, Math.sin((i / 96) * Math.PI * 2) * 1.18, 0);
    const ringGeo = new LineGeometry();
    ringGeo.setPositions(pts);
    // the ring carries the new chord's colour
    const ringMat = new LineMaterial({ color, linewidth: 2.5, transparent: true, opacity: 0.9, depthWrite: false });
    ringMat.resolution.copy(this.frontMat.resolution);
    const ring = new Line2(ringGeo, ringMat);
    ring.frustumCulled = false;
    ring.renderOrder = 4;
    g.add(ring);
    const sprite = labelSprite(title, `#${new THREE.Color(color).getHexString()}`);
    sprite.position.set(0, 1.24, 0);
    sprite.renderOrder = 5;
    g.add(sprite);
    this.group.add(g);
    const marker = { group: g, birth, title, ringMat, spriteMat: sprite.material };
    this.markers.push(marker);
    this.markersCreated++;
    this.markerLabels.push(title);
    return marker;
  }

  removeMarker(m) {
    this.group.remove(m.group);
    m.group.traverse(o => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        if (o.material.map) o.material.map.dispose();
        o.material.dispose();
      }
    });
  }

  /**
   * tun: { now, cleared, title, makeSlice() -> { points, color } | null }
   * Captures at most one slice per frame, at CAPTURE_HZ of tunnel time.
   */
  update(tun) {
    const { now } = tun;
    if (tun.cleared) {
      this.clear();
      this.lastTitle = tun.title;
    }
    if (this.lastTitle === null) this.lastTitle = tun.title;
    this.now = now;

    let captured = null;
    const titleChanged = tun.title !== this.lastTitle;
    // the clearing frame shows an empty tunnel; capturing resumes on the next frame. A chord
    // change is captured at once, so its marker sits exactly where the new shape starts.
    if (!tun.cleared && (titleChanged || now - this.lastCapture >= 1 / CAPTURE_HZ - 1e-9)) {
      const slice = tun.makeSlice();
      if (slice) {
        const slot = this.ring.push(slice.points, slice.color, now);
        this.uploadSlot(slot);
        this.lastCapture = now;
        captured = slice;
        const fp = new Float32Array(slice.points.length * 3);
        slice.points.forEach((p, i) => { fp[i * 3] = p[0]; fp[i * 3 + 1] = p[1]; });
        this.front.geometry.setPositions(fp);
        // density normalization (as in 2D): dense ratios get a thinner, dimmer front figure
        const d = slice.density ?? 1;
        this.frontMat.color.setRGB(...(slice.front || slice.color));
        this.frontMat.linewidth = 2.2 * (0.5 + 0.5 * d);
        this.frontHaloMat.color.setRGB(...(slice.front || slice.color));
        this.frontHaloMat.opacity = 0.16 * d;
        this.front.visible = true;
      }
    }
    if (titleChanged) this.lastTitle = tun.title;
    // a chord that holds leaves a labelled ring at the depth where it began (brief note-switch
    // states and rests do not; see ChordMarkerFilter)
    const mark = this.markerFilter.observe(tun.title, now);
    if (mark) {
      const color = captured ? new THREE.Color(...(captured.front || captured.color)) : this.frontMat.color.clone();
      this.addMarker(mark.title, color, mark.birth);
    }

    const H = this.historySeconds;
    this.material.uniforms.uNow.value = now;
    this.markers = this.markers.filter(m => {
      const age = now - m.birth;
      if (age >= H) {
        this.removeMarker(m);
        return false;
      }
      m.group.position.z = sliceZ(m.birth, now, this.speed);
      const a = sliceAlpha(age, H);
      m.ringMat.opacity = Math.min(1, 1.25 * a); // opaque while recent, then fading
      m.spriteMat.opacity = a;
      return true;
    });
    this.countTrace.push(this.stats().count);
    if (this.countTrace.length > 240) this.countTrace.splice(0, 120);
  }

  /** Visible slices and how much of the tunnel depth they span (debug / e2e). */
  stats() {
    const H = this.historySeconds;
    let count = 0;
    let oldest = 0;
    for (const slot of this.ring.ordered()) {
      const age = this.now - this.ring.birthOf(slot);
      if (age >= 0 && age < H) {
        count++;
        oldest = Math.max(oldest, age);
      }
    }
    return { count, span: oldest * this.speed, depth: this.depth, uNow: this.material.uniforms.uNow.value, uSpeed: this.speed, markersCreated: this.markersCreated, labels: [...this.markerLabels] };
  }
}
