// Top navigation: tabs, 2D/3D, draw mode, clear & redraw, snapshot, import.

export function setNavButton(btn, icon, label) {
  const ico = btn.querySelector('.nav-ico');
  const lab = btn.querySelector('.nav-label');
  if (ico && icon) ico.textContent = icon;
  if (lab) lab.textContent = label; else btn.textContent = label;
  btn.title = label;
}

export function initNav(store, actions, { grid, snapshot }) {
  const $ = (id) => document.getElementById(id);
  const app = $('app-container');
  const dim = $('btn-toggle-dimension');
  const draw = $('btn-draw-mode');
  const lab = $('btn-tab-lab');
  const matrix = $('btn-tab-matrix');

  lab.addEventListener('click', () => actions.setTab('lab'));
  matrix.addEventListener('click', () => actions.setTab('matrix'));
  dim.addEventListener('click', () => {
    const to2D = store.get().dimension === '3D';
    store.set(to2D ? { dimension: '2D', tunnel: false } : { dimension: '3D' });
  });
  const tunnel = $('btn-tunnel');
  tunnel.addEventListener('click', () => actions.toggleTunnel());
  store.subscribe(s => [s.tunnel && s.dimension === '3D', s.tunnelSuggested], ([on, suggested]) => {
    tunnel.classList.toggle('active', on);
    tunnel.classList.toggle('suggested', !!suggested && !on);
    if (suggested && !on) tunnel.setAttribute('data-suggested', 'true'); else tunnel.removeAttribute('data-suggested');
    tunnel.title = suggested && !on ? 'Time Tunnel — try it with this track!' : 'Time Tunnel: past figures recede into depth';
  });
  draw.addEventListener('click', () => {
    const live = store.get().drawMode !== 'live';
    store.set({ drawMode: live ? 'live' : 'full' });
    if (live) actions.clearRedraw();
  });
  $('btn-clear-redraw').addEventListener('click', () => actions.clearRedraw());
  $('btn-snapshot').addEventListener('click', snapshot);

  store.subscribe(s => s.tab, (tab) => {
    app.classList.toggle('tab-matrix', tab === 'matrix');
    $('intervals-grid-view').style.display = tab === 'matrix' ? 'block' : 'none';
    $('render-viewport').style.display = tab === 'matrix' ? 'none' : 'block';
    lab.classList.toggle('active', tab === 'lab');
    matrix.classList.toggle('active', tab === 'matrix');
    if (tab === 'matrix') grid.resize(); // real card sizes are only known once the grid is visible
  });
  store.subscribe(s => s.dimension, (d) => {
    $('canvas-2d').style.display = d === '2D' ? 'block' : 'none';
    $('viewport-3d').style.display = d === '3D' ? 'block' : 'none';
    setNavButton(dim, d === '3D' ? '🟦' : '🧊', d === '3D' ? '2D Mode' : '3D Mode');
    dim.classList.toggle('active', d === '3D');
    window.dispatchEvent(new Event('resize'));
  });
  store.subscribe(s => s.drawMode, (m) => {
    setNavButton(draw, m === 'live' ? '✏️' : '⭕', m === 'live' ? 'Mode: Live Trace' : 'Mode: Full Loop');
    draw.classList.toggle('active', m === 'live');
  });
}
