// Free area for the 2D/3D scope: right of the side panel (or above the phone bottom sheet), below
// the header, above the player bar and left of the waveform strip. Uses offset* (layout boxes, unaffected by the slide
// transitions) so the figure does not jitter while the panel or bar animates.
export function computeSafeArea() {
  const $ = (id) => document.getElementById(id);
  const panel = $('controls-panel');
  const header = $('harmonic-header');
  const bar = $('media-player-bar');
  const W = window.innerWidth;
  const H = window.innerHeight;
  let left = 0;
  let top = 0;
  let bottom = H;
  const panelOpen = !panel.classList.contains('collapsed');
  const isSheet = panel.offsetWidth >= W - 1;
  if (panelOpen && !isSheet) left = panel.offsetLeft + panel.offsetWidth;
  if (panelOpen && isSheet) bottom = Math.min(bottom, panel.offsetTop);
  if (header.style.display !== 'none') top = header.offsetTop + header.offsetHeight + 8;
  if (!bar.classList.contains('hidden')) bottom = Math.min(bottom, bar.offsetTop);
  let right = W;
  const strip = $('bottom-strip');
  if (strip && strip.offsetWidth && getComputedStyle(strip).display !== 'none') {
    // keep the figure clear of the waveform strip in the corner
    right = Math.min(right, strip.offsetLeft - 16);
  }
  return { left, top, right, bottom };
}
