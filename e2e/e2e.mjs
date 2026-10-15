// End-to-end smoke test of the built app with Playwright (Chromium headless).
// Ported from Agent/e2e/e2e.mjs + Agent/e2e/pause-check.mjs, extended with pass/fail
// assertions for the Phase 1 acceptance gates (G1.1–G1.10).
//
// Usage: node e2e/e2e.mjs <baseUrl> [--strict]
//   (normally via `npm run e2e`, which builds and serves dist/ first)
// Writes e2e/results/results.json and e2e/results/screenshots/*.png.
// Exit code: 1 if the run crashes; with --strict also 1 if any gate fails.
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync, readFileSync, statSync } from 'node:fs';

const BASE = process.argv[2] || 'http://127.0.0.1:4179/';
const STRICT = process.argv.includes('--strict');
const RESULTS = new URL('./results/', import.meta.url);
const SHOTS = new URL('./results/screenshots/', import.meta.url).pathname;
const FIX = new URL('./fixtures/', import.meta.url).pathname;
const README = new URL('../README.md', import.meta.url);
mkdirSync(SHOTS, { recursive: true });

const GATES = {
  'G1.1': 'R1: no drone oscillator (261.63 / 392.44 Hz) live while the audio and MIDI demos play',
  'G1.2': 'R2: at slider 5 Hz, clicking "Warm Tube" produces no tone oscillator with gain > 0.01',
  'G1.3': 'R3: at 1280x720 the 2:1, 5:4, 9:8 matrix cards are hit-testable and all 12 cards load on click',
  'G1.4': 'R5: header / nav / panel / player bar never intersect at 390x844, 1280x720, 1600x1000; nothing overflows horizontally',
  'G1.5': 'R10: switching to 2x at t~3 s reads t in [2.7, 3.6] s on the next frame',
  'G1.6': 'R11: after pressing pause the play button shows ▶ within 200 ms',
  'G1.7': 'R12: with loop off, pressing Play after the end gives t < 1 s and the clock advances',
  'G1.8': 'R14: 3D after X-Y mode, then eject: the core line material is white (0xffffff)',
  'G1.9': 'R27: input accept, drop-overlay text and README list the same formats',
  'G1.10': 'zero uncaught page errors over the full session',
  'G2.7': 'R6: the MIDI demo octave step is labeled 2 : 1',
  'G2.8': 'R16: custom "4:6" shows 2 : 3; "1.5:2" shows a visible inline error',
  'G2.9': 'B: "slowed ×N" readout visible above 30 Hz, "real time" below'
};
const gates = Object.fromEntries(Object.entries(GATES).map(([id, desc]) => [id, { desc, pass: null, details: [] }]));
const gateResult = (id, ok, detail) => {
  const g = gates[id];
  g.pass = (g.pass === null ? true : g.pass) && !!ok;
  g.details.push(`${ok ? 'ok' : 'FAIL'}: ${detail}`);
  console.log(`${ok ? 'PASS' : 'FAIL'}  [${id}] ${detail}`);
};
const checks = [];
const log = (name, ok, detail = '') => { checks.push({ name, ok: !!ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };
const note = (name, detail) => { checks.push({ name, ok: null, detail }); console.log(`INFO  ${name}  — ${detail}`); };
// Runs a section; an exception fails the given gate (or check) instead of aborting the run.
const section = async (name, gateIds, fn) => {
  try { await fn(); } catch (e) {
    const msg = `${name}: exception ${String(e).split('\n')[0]}`;
    if (gateIds.length) gateIds.forEach(id => gateResult(id, false, msg)); else log(name, false, msg);
  }
};

const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, acceptDownloads: true });
const page = await ctx.newPage();

const consoleErrors = [], pageErrors = [], dialogs = [];
page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', e => pageErrors.push(String(e)));
page.on('dialog', async d => { dialogs.push(d.message()); await d.dismiss(); });

// Web Audio instrumentation: every oscillator, its liveness (honouring scheduled stop times),
// the node graph it feeds, and whether it is a bandpassed polyrhythm "click" oscillator.
await page.addInitScript(() => {
  window.__osc = [];
  const C = window.AudioContext;
  const origCreate = C.prototype.createOscillator;
  C.prototype.createOscillator = function () {
    const o = origCreate.call(this);
    o.__rec = { o, started: false, stopAt: null };
    window.__osc.push(o.__rec);
    return o;
  };
  const s = OscillatorNode.prototype.start, p = OscillatorNode.prototype.stop;
  OscillatorNode.prototype.start = function (...a) { this.__rec && (this.__rec.started = true); return s.apply(this, a); };
  OscillatorNode.prototype.stop = function (when) {
    if (this.__rec) {
      const at = when ? when : this.context.currentTime;
      this.__rec.stopAt = this.__rec.stopAt === null ? at : Math.min(this.__rec.stopAt, at);
    }
    return p.apply(this, arguments);
  };
  const conn = AudioNode.prototype.connect;
  AudioNode.prototype.connect = function (dest, ...rest) {
    (this.__out ||= []).push(dest);
    return conn.call(this, dest, ...rest);
  };
  const isLive = (r) => r.started && (r.stopAt === null || r.o.context.currentTime < r.stopAt);
  const isClick = (r) => (r.o.__out || []).some(n => n instanceof BiquadFilterNode && n.type === 'bandpass');
  // Product of the GainNode gains on the first path from the oscillator to the analyser/destination.
  const pathGain = (node) => {
    let g = 1, n = node, guard = 0;
    while (n && guard++ < 12) {
      if (n instanceof GainNode) g *= n.gain.value;
      if (n instanceof AnalyserNode || n instanceof AudioDestinationNode) break;
      n = (n.__out || [])[0];
    }
    return g;
  };
  window.__live = () => window.__osc.filter(r => isLive(r) && r.o.frequency.value < 5000).map(r => +r.o.frequency.value.toFixed(2));
  window.__liveTones = () => window.__osc.filter(r => isLive(r) && !isClick(r)).map(r => ({ f: +r.o.frequency.value.toFixed(2), gain: pathGain(r.o) }));
  window.__fps = (ms) => new Promise(res => { let n = 0; const t0 = performance.now(); const f = () => { n++; performance.now() - t0 < ms ? requestAnimationFrame(f) : res(n * 1000 / (performance.now() - t0)); }; requestAnimationFrame(f); });
  window.__nextFrame = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
});

const txt = (sel) => page.locator(sel).first().innerText({ timeout: 2000 }).catch(() => '<missing>');
const shot = (n) => page.screenshot({ path: SHOTS + n + '.png' });
const wait = (ms) => page.waitForTimeout(ms);
const visible = (sel) => page.locator(sel).first().isVisible();
// Slider drag: input while dragging, change on release (like a real user).
const setRange = (sel, v) => page.$eval(sel, (el, v) => {
  el.value = v;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}, v);
const mediaTime = () => page.evaluate(() => window.__harmonic?.mediaImporter?.currentTime ?? NaN);
const panelCollapsed = () => page.locator('#controls-panel').evaluate(e => e.classList.contains('collapsed'));
const ensurePanelOpen = async () => { if (await panelCollapsed()) { await page.click('#panel-toggle'); await wait(450); } };
const barHidden = () => page.locator('#media-player-bar').evaluate(e => e.classList.contains('hidden'));
const clickPreset = async (i) => { await ensurePanelOpen(); await page.locator('.preset-chip').nth(i).click(); };

// ---------------- Boot ----------------
await section('boot', [], async () => {
  await page.goto(BASE);
  await wait(1500);
  log('boot: header shows default 3 : 2', (await txt('#header-title')) === '3 : 2', await txt('#header-title'));
  log('boot: 7 preset chips rendered', (await page.locator('.preset-chip').count()) === 7);
  log('boot: 13 piano keys (8 white + 5 black)', (await page.locator('.piano-key-white').count()) === 8 && (await page.locator('.piano-key-black').count()) === 5);
  log('boot: 2D canvas visible, 3D hidden', (await visible('#canvas-2d')) && !(await visible('#viewport-3d')));
  log('boot: media player bar hidden', await barHidden());
  note('boot: oscillators live before any user gesture', JSON.stringify(await page.evaluate(() => window.__live())));
  await page.mouse.click(1000, 500); // first gesture unlock (on the canvas, away from the panel)
  await wait(400);
  note('after first click: live oscillators (Hz)', JSON.stringify(await page.evaluate(() => window.__live())));
  await wait(1500);
  await shot('01-boot-fifth-2d');
});

// ---------------- Presets ----------------
await section('presets', [], async () => {
  const presetCount = await page.locator('.preset-chip').count();
  for (let i = 0; i < presetCount; i++) {
    const chip = page.locator('.preset-chip').nth(i);
    const label = await chip.innerText();
    await chip.click();
    await wait(900);
    const dim3 = await visible('#viewport-3d');
    log(`preset "${label}"`, (await chip.getAttribute('class')).includes('active'), `title=${await txt('#header-title')} | 3D=${dim3} | voices=${JSON.stringify(await page.evaluate(() => window.__live()))}`);
    await shot(`02-preset-${i}-${label.replace(/[^a-z0-9]+/gi, '_').slice(0, 30)}`);
  }
  await clickPreset(1); // octave
  await page.click('#btn-draw-mode'); await wait(500);
  await shot('03-octave-full-loop-phi0');
  await page.click('#btn-draw-mode'); await wait(100); // labels update on the next frame (store flush)
  log('draw mode toggles back to live', (await txt('#btn-draw-mode')).includes('Live') || (await page.locator('#btn-draw-mode').getAttribute('title') || '').includes('Live'));
});

// ---------------- G1.3 Matrix tab at 1280x720 ----------------
await section('matrix', ['G1.3'], async () => {
  await page.setViewportSize({ width: 1280, height: 720 }); await wait(400);
  await ensurePanelOpen(); // the panel is open when the user switches tabs
  await page.click('#btn-tab-matrix'); await wait(800);
  log('matrix: 12 interval cards', (await page.locator('.interval-card').count()) === 12);
  await shot('04-matrix-1280x720');
  const hit = await page.evaluate(async () => {
    const out = {};
    for (const c of document.querySelectorAll('.interval-card')) {
      const label = c.querySelector('.ratio-text').textContent;
      if (!['2:1', '5:4', '9:8'].includes(label)) continue;
      c.scrollIntoView({ block: 'center' });
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      const r = c.getBoundingClientRect();
      const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      out[label] = !!top && c.contains(top);
    }
    return out;
  });
  for (const k of ['2:1', '5:4', '9:8']) gateResult('G1.3', hit[k] === true, `card ${k} center hit-test → ${hit[k]}`);
  const n = await page.locator('.interval-card').count();
  const failed = [];
  for (let i = 0; i < n; i++) {
    if (!(await visible('#intervals-grid-view'))) { await page.click('#btn-tab-matrix'); await wait(400); }
    const card = page.locator('.interval-card').nth(i);
    const ratio = (await card.locator('.ratio-text').innerText()).replace(':', ' : ');
    try {
      await card.click({ timeout: 2500 });
      await wait(250);
      const title = await txt('#header-title');
      if (title !== ratio || !(await visible('#canvas-2d'))) failed.push(`${ratio}→"${title}"`);
    } catch (e) { failed.push(`${ratio}: not clickable (${String(e).split('\n')[0].slice(0, 80)})`); }
  }
  gateResult('G1.3', failed.length === 0, `12 cards load on click; failures: ${failed.join(', ') || 'none'}`);
  log('matrix: panel restored after leaving matrix', !(await panelCollapsed()));
  // R13: the octave card loads C + C'
  await page.click('#btn-tab-matrix'); await wait(300);
  await page.locator('.interval-card').first().click(); await wait(300);
  const octBadge = await txt('#header-notes-badge');
  log('R13 matrix octave card: notes are C + C\'', /C'/.test(octBadge), JSON.stringify(octBadge));
  await page.setViewportSize({ width: 1600, height: 1000 }); await wait(300);
});

// ---------------- Piano ----------------
await section('piano', [], async () => {
  await ensurePanelOpen();
  await page.click('#btn-clear-piano'); await wait(200);
  log('piano clear: header "SELECT NOTES"', (await txt('#header-title')) === 'SELECT NOTES');
  const key = (n) => page.locator(`[data-note="${n}"]`);
  await key('C').click(); await wait(200);
  log('piano: single C -> ROOT NOTE', (await txt('#header-category')) === 'ROOT NOTE');
  await key('E').click(); await key('G').click(); await wait(500);
  log('piano: C+E+G -> 4 : 5 : 6 in 3D', (await txt('#header-title')) === '4 : 5 : 6' && await visible('#viewport-3d'), await txt('#header-title'));
  await shot('05-piano-CEG-3d');
  await key('E').click(); await key('G').click(); await key("C'").click(); await wait(300);
  log('piano: C + C\' -> 2 : 1 octave', (await txt('#header-title')) === '2 : 1', `${await txt('#header-category')} ${await txt('#header-title')}`);
  await page.click('#btn-clear-piano');
  await key('G').click(); await key("C'").click(); await wait(200);
  log('piano: G + C\' -> 4 : 3 Fourth', (await txt('#header-title')) === '4 : 3', await txt('#header-title'));
  await page.click('#btn-clear-piano');
  await key('C').click(); await key('Db').click(); await key('D').click(); await wait(200);
  // R19 (Phase 2): the cluster label matches its JI ratios 1 : 16/15 : 9/8
  log('piano: C+Db+D -> 120:128:135 cluster', (await txt('#header-title')) === '120 : 128 : 135', await txt('#header-title'));
  await page.click('#btn-clear-piano');
  await key('E').click(); await key('Ab').click(); await wait(200);
  const eg = await txt('#header-notes-badge');
  log('R4 piano E+G# shows 329.6 / 412.0 Hz (JI)', eg.includes('329.6') && eg.includes('412.0'), eg);
});

// ---------------- Custom ratio ----------------
await section('custom ratio', [], async () => {
  const applyRatio = async (v) => { await page.fill('#input-custom-ratio', v); await page.press('#input-custom-ratio', 'Enter'); await wait(250); return txt('#header-title'); };
  log('custom "3:2"', (await applyRatio('3:2')) === '3 : 2');
  log('custom "16 17 18" (space separated) -> 3D', (await applyRatio('16 17 18')) === '16 : 17 : 18' && await visible('#viewport-3d'));
  const before = await txt('#header-title');
  log('custom "abc" ignored', (await applyRatio('abc')) === before);
  log('custom "5" (single) ignored', (await applyRatio('5')) === before);
  log('custom "0:3" ignored (zero filtered)', (await applyRatio('0:3')) === before);
  const t46 = await applyRatio('4:6');
  const tDec = await applyRatio('1.5:2');
  const errVisible = await visible('#custom-ratio-error');
  const errText = await txt('#custom-ratio-error');
  gateResult('G2.8', t46 === '2 : 3' && tDec === '2 : 3' && errVisible && /whole numbers/i.test(errText), `"4:6" -> "${t46}"; "1.5:2" -> title "${tDec}", error visible=${errVisible} "${errText}"`);
  await shot('06-custom-ratio-error');
  const t8 = await applyRatio('8:9:10:11:12:13:14:15');
  log('custom 8 voices accepted', t8 === '8 : 9 : 10 : 11 : 12 : 13 : 14 : 15', t8);
  await shot('06-custom-8-voices');
  await applyRatio('4:5:6');
  const key = (n) => page.locator(`[data-note="${n}"]`);
  await key('A').click(); await wait(200);
  log('R22 piano click after custom ratio starts a fresh selection', (await txt('#header-category')) === 'ROOT NOTE', `${await txt('#header-category')} | ${await txt('#header-notes-badge')}`);
  await page.click('[data-timbre="sine"]');
});

// ---------------- G1.2 timbre change at 5 Hz ----------------
await section('timbre at 5 Hz', ['G1.2'], async () => {
  await clickPreset(0); await wait(200);
  // slider value whose Hz is ~5: sliderToHz(v) = 0.2 * 150^(v/60) -> v = 60*ln(25)/ln(150) ≈ 38.5
  await setRange('#slider-speed', '38.5'); await wait(300);
  const hz = await txt('#val-speed');
  await page.click('[data-timbre="tube"]'); await wait(500);
  const tones = await page.evaluate(() => window.__liveTones());
  const loud = tones.filter(t => t.gain > 0.01);
  gateResult('G1.2', loud.length === 0, `slider ${hz}; live tone oscillators ${JSON.stringify(tones)}`);
  await page.click('[data-timbre="sine"]'); await wait(300);
  const tones2 = await page.evaluate(() => window.__liveTones().filter(t => t.gain > 0.01));
  log('R2 back to sine at 5 Hz stays silent', tones2.length === 0, JSON.stringify(tones2));
  // unmuting at sub-audio speed must not bring the tone back either
  await page.click('#btn-mute'); await page.click('#btn-mute'); await wait(400);
  const tones3 = await page.evaluate(() => window.__liveTones().filter(t => t.gain > 0.01));
  log('R2 unmute at 5 Hz stays silent', tones3.length === 0, JSON.stringify(tones3));
  const clicksBefore = await page.evaluate(() => window.__osc.length);
  await wait(1500);
  log('polyrhythm zone (<20 Hz) generates click oscillators', (await page.evaluate(() => window.__osc.length)) > clicksBefore);
  // G2.9 time-scale readout
  const below = await txt('#val-slowmo');
  await setRange('#slider-speed', '100'); await wait(200);
  const above = await txt('#val-slowmo');
  gateResult('G2.9', below === 'real time' && /^slowed ×\d+/.test(above) && await visible('#val-slowmo'), `at 5.2 Hz "${below}", at 261.6 Hz "${above}"`);
});

// ---------------- 3D interaction & snapshot ----------------
await section('3d + snapshot', [], async () => {
  await clickPreset(5); await wait(1200); // dominant7 3D
  await page.mouse.move(1100, 500); await page.mouse.down(); await page.mouse.move(1250, 560, { steps: 10 }); await page.mouse.up();
  await page.mouse.wheel(0, 400); await wait(600);
  await shot('07-3d-dom7-dragged-zoomed');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#btn-snapshot')]);
  const p3 = SHOTS + 'snapshot-3d.png'; await dl.saveAs(p3);
  log('snapshot 3D produces PNG', statSync(p3).size > 10000, `${statSync(p3).size} bytes`);
  await page.click('#btn-toggle-dimension'); await wait(400);
  const [dl2] = await Promise.all([page.waitForEvent('download'), page.click('#btn-snapshot')]);
  const p2 = SHOTS + 'snapshot-2d.png'; await dl2.saveAs(p2);
  log('snapshot 2D produces PNG', statSync(p2).size > 10000, `${statSync(p2).size} bytes`);
});

// ---------------- MIDI demo: G1.1, G1.6, G1.7 ----------------
await section('midi demo', ['G1.1', 'G1.6', 'G1.7'], async () => {
  await clickPreset(0); await wait(300); // drone would be C 261.63 + G 392.44 (just)
  await page.click('#btn-demo-midi'); await wait(600);
  log('MIDI demo: player bar shown', !(await barHidden()));
  log('MIDI demo: title', (await txt('#player-track-title')).includes('Harmonic Intervals Journey'), await txt('#player-track-title'));
  note('MIDI demo meta', await txt('#player-track-meta'));
  // Sample mid-step (steps last 2–3.5 s; same-pitch retrigger releases happen only at step boundaries).
  const samples = [];
  const starts = [0, 2, 4, 6, 8, 10, 12.5, 15, 17, 19.5, 21.5];
  for (let k = 0; k < 5; k++) {
    await page.waitForFunction((st) => { const t = window.__harmonic.mediaImporter.currentTime; return st.some(s => t > s + 0.5 && t < s + 1.4); }, starts, { timeout: 5000 });
    samples.push(await page.evaluate(() => ({
      t: +window.__harmonic.mediaImporter.currentTime.toFixed(2),
      drone: window.__harmonic.audio.voices.length,
      live: window.__live()
    })));
    await wait(1100);
  }
  const bad = samples.filter(s => s.drone > 0 || s.live.some(f => Math.abs(f - 392.44) < 0.05) || s.live.filter(f => Math.abs(f - 261.63) < 0.05).length > 1);
  gateResult('G1.1', bad.length === 0, `MIDI demo: engine drone voices 0, no 392.44 Hz, ≤1 osc at 261.63 (the MIDI C4) — samples ${JSON.stringify(samples)}`);

  const titles = new Set();
  for (let i = 0; i < 8; i++) { titles.add(`${await txt('#header-category')} | ${await txt('#header-title')}`); await wait(400); }
  // G2.7: jump to the octave step (17.0–19.5 s) and read the header
  await setRange('#player-scrubber', String((18.2 / 25) * 100)); await wait(500);
  const octCat = await txt('#header-category'), octTitle = await txt('#header-title');
  gateResult('G2.7', octTitle === '2 : 1' && /OCTAVE/.test(octCat), `MIDI demo at ~18.2 s: ${octCat} | ${octTitle}`);
  await shot('09b-midi-demo-octave');
  note('MIDI demo header sequence (partial)', [...titles].join(' ;; '));
  log('R23 MIDI demo never shows SILENCE between steps', ![...titles].some(t => t.includes('SILENCE')));
  await shot('09-midi-demo-playing');

  // G1.6 pause icon
  await page.click('#btn-player-play');
  const t0 = Date.now();
  await page.waitForFunction(() => document.querySelector('#btn-player-play').textContent.trim() === '▶', null, { timeout: 200 }).catch(() => {});
  const icon = (await page.locator('#btn-player-play').textContent()).trim();
  gateResult('G1.6', icon === '▶', `MIDI pause → icon "${icon}" after ${Date.now() - t0} ms`);
  const tp = await mediaTime(); await wait(800);
  log('pause halts the clock (MIDI)', Math.abs((await mediaTime()) - tp) < 1e-6);
  await page.click('#btn-player-play'); await wait(300);
  log('resume shows ⏸', (await page.locator('#btn-player-play').textContent()).trim() === '⏸');

  // G1.7 play after end (loop off)
  await page.click('#btn-player-loop');
  log('loop toggle off', !(await page.locator('#btn-player-loop').getAttribute('class')).includes('active'));
  await setRange('#player-scrubber', '99.5'); await wait(1500);
  const endIcon = (await page.locator('#btn-player-play').textContent()).trim();
  log('R11 end of track (loop off) shows ▶', endIcon === '▶', endIcon);
  await page.click('#btn-player-play'); await wait(150);
  const ta = await mediaTime(); await wait(600); const tb = await mediaTime();
  gateResult('G1.7', ta < 1 && tb > ta, `MIDI play after end: t=${ta.toFixed(2)} → ${tb.toFixed(2)} s`);
  await page.click('#btn-player-stop'); await wait(300);
  log('stop rewinds to 00:00 and shows ▶', (await txt('#player-time-current')) === '00:00' && (await page.locator('#btn-player-play').textContent()).trim() === '▶');
  await page.click('#btn-player-loop');
  await page.click('#btn-player-eject'); await wait(400);
  log('eject hides bar and restores 3 : 2', (await barHidden()) && (await txt('#header-title')) === '3 : 2');
});

// ---------------- Audio demo: G1.1, G1.5, G1.6, G1.7, G1.8 ----------------
await section('audio demo', ['G1.1', 'G1.5', 'G1.6', 'G1.7', 'G1.8'], async () => {
  await page.click('#btn-demo-audio'); await wait(1200);
  log('audio demo: X-Y mode selector visible', await visible('#player-audio-mode-selector'));
  log('audio demo: header STEREO VECTORSCOPE', (await txt('#header-category')) === 'STEREO VECTORSCOPE');
  const live = await page.evaluate(() => window.__live());
  const drone = await page.evaluate(() => window.__harmonic.audio.voices.length);
  gateResult('G1.1', drone === 0 && !live.some(f => Math.abs(f - 261.63) < 0.05 || Math.abs(f - 392.44) < 0.05), `audio demo: drone voices=${drone}, live oscillators ${JSON.stringify(live)}`);
  await shot('10-audio-demo-xy-2d');

  // G1.8: X-Y in 3D, then eject → core line white
  await page.click('#btn-toggle-dimension'); await wait(800); await shot('10-audio-demo-xy-3d');
  const green = await page.evaluate(() => window.__harmonic.visualizer3D.coreMat.color.getHex());
  note('3D X-Y core color while playing', '0x' + green.toString(16));
  await page.click('#btn-player-eject'); await wait(400);
  const afterEject = await page.evaluate(() => window.__harmonic.visualizer3D.coreMat.color.getHex());
  gateResult('G1.8', afterEject === 0xffffff, `core color right after eject 0x${afterEject.toString(16)}`);
  await page.click('#btn-toggle-dimension'); await wait(600);
  const in3D = await page.evaluate(() => window.__harmonic.visualizer3D.coreMat.color.getHex());
  gateResult('G1.8', in3D === 0xffffff, `core color after eject + normal 3D render 0x${in3D.toString(16)}`);
  await shot('10b-3d-after-xy-eject');
  await page.click('#btn-toggle-dimension'); await wait(300);

  // Pitch mode (R21)
  await page.click('#btn-demo-audio'); await wait(800);
  await page.click('#btn-audio-mode-pitch'); await wait(1200);
  const cat = await txt('#header-category'), title = await txt('#header-title'), badge = await txt('#header-notes-badge');
  note('pitch-tracking header', `${cat} | ${title} | badge=${badge}`);
  const hz = parseFloat(title);
  log('R21 pitch badge shows the detected Hz', !Number.isNaN(hz) && badge.includes(hz.toFixed(1)), `title ${title} badge ${badge}`);
  await shot('11-audio-demo-pitch');
  await page.click('#btn-audio-mode-xy');

  // G1.6 for audio
  await page.click('#btn-player-play');
  const t0 = Date.now();
  await page.waitForFunction(() => document.querySelector('#btn-player-play').textContent.trim() === '▶', null, { timeout: 200 }).catch(() => {});
  const icon = (await page.locator('#btn-player-play').textContent()).trim();
  gateResult('G1.6', icon === '▶', `audio pause → icon "${icon}" after ${Date.now() - t0} ms`);

  // G1.5: rate change keeps position
  await page.click('#btn-player-stop'); await page.click('#btn-player-play');
  const r = await page.evaluate(async () => {
    const m = window.__harmonic.mediaImporter;
    await new Promise(res => { const f = () => (m.currentTime >= 3.0 ? res() : requestAnimationFrame(f)); f(); });
    const before = m.currentTime;
    document.querySelector('[data-speed="2.0"]').click();
    await new Promise(res => requestAnimationFrame(res));
    const next = m.currentTime;
    await new Promise(res => setTimeout(res, 500));
    return { before, next, later: m.currentTime };
  });
  gateResult('G1.5', r.next >= 2.7 && r.next <= 3.6, `t before=${r.before.toFixed(3)} next frame=${r.next.toFixed(3)} +0.5 s wall=${r.later.toFixed(3)}`);
  log('R10 2x actually runs at ~2x after the switch', r.later - r.next > 0.7 && r.later - r.next < 1.4, `${(r.later - r.next).toFixed(2)} s media per ~0.5 s wall`);
  await page.click('[data-speed="1.0"]');

  // G1.7 for audio
  await page.click('#btn-player-loop');
  await setRange('#player-scrubber', '99'); await wait(1200);
  log('R11 audio end (loop off) shows ▶', (await page.locator('#btn-player-play').textContent()).trim() === '▶');
  await page.click('#btn-player-play'); await wait(150);
  const ta = await mediaTime(); await wait(600); const tb = await mediaTime();
  gateResult('G1.7', ta < 1 && tb > ta, `audio play after end: t=${ta.toFixed(2)} → ${tb.toFixed(2)} s`);
  await page.click('#btn-player-loop');
  await page.click('#btn-player-eject'); await wait(300);
});

// ---------------- File imports ----------------
await section('file imports', [], async () => {
  const upload = async (f) => { dialogs.length = 0; await page.setInputFiles('#file-media-input', FIX + f); await wait(1200); };
  await upload('song.mid');
  log('upload song.mid: title from MIDI name', (await txt('#player-track-title')) === 'Fixture Song', await txt('#player-track-title'));
  note('song.mid meta', await txt('#player-track-meta'));
  await upload('stereo-3-2.wav');
  const meta = await txt('#player-track-meta');
  log('upload stereo WAV', meta.includes('2 Channel'), meta);
  log('R26 audio meta shows the file sample rate (44.1 kHz)', meta.includes('44.1 kHz'), meta);
  await upload('mono-a440.wav');
  log('upload mono WAV', (await txt('#player-track-meta')).includes('1 Channel'), await txt('#player-track-meta'));
  await page.click('#btn-audio-mode-pitch'); await wait(1000);
  log('pitch tracking of 440 Hz mono -> A4', (await txt('#header-category')).includes('A4'), `${await txt('#header-category')} ${await txt('#header-title')}`);
  await page.click('#btn-audio-mode-xy');
  await upload('garbage.mp3');
  log('garbage.mp3 -> alert shown', dialogs.length === 1, dialogs.join(' | '));
  log('R25 player title cleared after failed import', (await txt('#player-track-title')) !== 'mono-a440.wav' && (await barHidden()), `hidden=${await barHidden()} title=${await txt('#player-track-title')}`);
  await upload('garbage.mid');
  log('garbage.mid -> alert shown', dialogs.length === 1, dialogs.join(' | '));
  await page.dispatchEvent('body', 'dragover', { dataTransfer: await page.evaluateHandle(() => new DataTransfer()) });
  await wait(300);
  log('dragover shows drop overlay', await page.locator('#drop-overlay').evaluate(e => e.classList.contains('drag-active')));
  await shot('13-drop-overlay');
  await page.evaluate(() => window.dispatchEvent(new DragEvent('drop', { dataTransfer: new DataTransfer(), bubbles: true, cancelable: true })));
  await wait(300);
});

// ---------------- G1.9 formats ----------------
await section('formats', ['G1.9'], async () => {
  const exts = (s) => [...new Set((s.match(/\.[a-z0-9]{2,4}\b/gi) || []).map(x => x.toLowerCase()))].sort();
  const accept = exts(await page.locator('#file-media-input').getAttribute('accept'));
  const overlay = exts(await page.locator('#drop-overlay p').first().textContent());
  const readme = readFileSync(README, 'utf8').split('\n').find(l => /supported formats/i.test(l)) || '';
  const readmeExts = exts(readme);
  const same = (a, b) => a.length > 0 && a.join() === b.join();
  gateResult('G1.9', same(accept, overlay) && same(accept, readmeExts), `accept=${accept} overlay=${overlay} README=${readmeExts}`);
});

// ---------------- G1.4 layout ----------------
await section('layout', ['G1.4'], async () => {
  const measure = () => page.evaluate(() => {
    const vis = (el) => { const cs = getComputedStyle(el); return cs.display !== 'none' && cs.visibility !== 'hidden' && +cs.opacity > 0.05 && el.getClientRects().length > 0; };
    const box = (sel) => { const el = document.querySelector(sel); if (!el || !vis(el)) return null; const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; };
    const out = { header: box('#harmonic-header'), nav: box('#top-nav'), panel: box('#controls-panel'), bar: box('#media-player-bar') };
    const W = window.innerWidth;
    const overflow = [];
    for (const el of document.querySelectorAll('body *')) {
      if (!vis(el)) continue;
      // skip children of hidden/clipped ancestors (scroll containers clip their content)
      let p = el.parentElement, clipped = false;
      while (p && p !== document.body) { const cs = getComputedStyle(p); if (!vis(p) || /(auto|scroll|hidden)/.test(cs.overflowX)) { clipped = true; break; } p = p.parentElement; }
      if (clipped) continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      if (r.left < -0.5 || r.right > W + 0.5) overflow.push(`${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}.${el.className}`.slice(0, 60) + ` [${r.left.toFixed(0)}..${r.right.toFixed(0)}]`);
    }
    out.overflow = overflow.slice(0, 8);
    out.scrollW = document.documentElement.scrollWidth;
    out.W = W;
    return out;
  });
  const area = (a, b) => (a && b) ? Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)) : 0;
  const judge = (label, m, needPanel) => {
    const names = ['header', 'nav', 'panel', 'bar'];
    const inter = [];
    for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) {
      const a = area(m[names[i]], m[names[j]]);
      if (a > 0) inter.push(`${names[i]}∩${names[j]}=${a.toFixed(0)}px²`);
    }
    const missing = ['header', 'nav', 'bar', ...(needPanel ? ['panel'] : [])].filter(n => !m[n]);
    const ok = inter.length === 0 && m.overflow.length === 0 && m.scrollW <= m.W && missing.length === 0;
    gateResult('G1.4', ok, `${label}: intersections [${inter.join(', ') || 'none'}] overflow [${m.overflow.join('; ') || 'none'}] missing [${missing.join(',') || 'none'}]`);
  };
  for (const demo of ['#btn-demo-midi', '#btn-demo-audio']) {
    for (const [w, h] of [[1600, 1000], [1280, 720], [390, 844]]) {
      await page.setViewportSize({ width: w, height: h }); await wait(500);
      await page.locator('#btn-tab-lab').click();
      await ensurePanelOpen();
      await page.locator(demo).click(); await wait(900);
      const tag = demo.includes('midi') ? 'midi' : 'audio';
      if (w <= 768) {
        judge(`${w}x${h} ${tag} sheet open`, await measure(), true);
        await shot(`14-layout-${w}x${h}-${tag}-sheet-open`);
        await page.click('#btn-collapse-panel'); await wait(500);
        judge(`${w}x${h} ${tag} sheet closed`, await measure(), false);
        await shot(`14-layout-${w}x${h}-${tag}`);
        await page.click('#panel-toggle'); await wait(450);
      } else {
        judge(`${w}x${h} ${tag} panel open`, await measure(), true);
        await shot(`14-layout-${w}x${h}-${tag}`);
      }
      await page.click('#btn-player-eject'); await wait(300);
    }
  }
  // Lab without media + matrix at phone width
  await page.setViewportSize({ width: 390, height: 844 }); await wait(400);
  await shot('14-layout-390x844-lab');
  await page.click('#btn-tab-matrix'); await wait(500);
  await shot('14-layout-390x844-matrix');
  await page.click('#btn-tab-lab'); await wait(300);
  await page.setViewportSize({ width: 1600, height: 1000 }); await wait(300);
});

// ---------------- Long-run trace performance (info) ----------------
await section('perf', [], async () => {
  await clickPreset(0);
  await page.fill('#input-custom-ratio', '45:32'); await page.press('#input-custom-ratio', 'Enter');
  const fps0 = await page.evaluate(() => window.__fps(1500));
  await wait(6000);
  const fps1 = await page.evaluate(() => window.__fps(1500));
  note('2D live trace fps 45:32: start vs after 6s (headless software GL; trend only)', `${fps0.toFixed(1)} -> ${fps1.toFixed(1)}`);
});

gateResult('G1.10', pageErrors.length === 0, `uncaught page errors: ${pageErrors.length ? pageErrors.join(' | ') : 'none'}`);
note('console errors', consoleErrors.length ? consoleErrors.slice(0, 10).join(' | ') : 'none');

await browser.close();

const gateList = Object.entries(gates).map(([id, g]) => ({ id, ...g, pass: g.pass === true }));
const summary = {
  gatesPassed: gateList.filter(g => g.pass).length,
  gatesFailed: gateList.filter(g => !g.pass).map(g => g.id),
  checksPassed: checks.filter(c => c.ok === true).length,
  checksFailed: checks.filter(c => c.ok === false).map(c => c.name),
  pageErrors: pageErrors.length
};
writeFileSync(new URL('results.json', RESULTS), JSON.stringify({ date: new Date().toISOString(), base: BASE, summary, gates: Object.fromEntries(gateList.map(g => [g.id, { pass: g.pass, desc: g.desc, details: g.details }])), checks, pageErrors, consoleErrors }, null, 2));
console.log(`\nE2E summary: gates ${summary.gatesPassed}/${gateList.length} passed${summary.gatesFailed.length ? ' (failed: ' + summary.gatesFailed.join(', ') + ')' : ''}; checks ${summary.checksPassed} passed, ${summary.checksFailed.length} failed${summary.checksFailed.length ? ' (' + summary.checksFailed.join('; ') + ')' : ''}`);
process.exit(STRICT && summary.gatesFailed.length ? 1 : 0);
