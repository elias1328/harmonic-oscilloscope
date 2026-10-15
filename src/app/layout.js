// Free area for the 2D scope: right of the side panel (or above the phone bottom sheet), below
// the header, above the player bar. Uses offset* (layout boxes, unaffected by the slide
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
  return { left, top, right: W, bottom };
}
