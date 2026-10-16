// What the renderers need for one frame: the figure, display settings, X-Y data and, when it is
// on, the Time Tunnel (driven by the media clock — pause freezes, seek/eject clears — or the wall
// clock without media).

import { persistenceTau } from '../visualizer/phosphor2D.js';
import { buildSlice } from '../visualizer/tunnelCore.js';

export function buildFrame({ state, figure, t, bridge, tunnelClock, tunnelWasOn, mediaTime }) {
  const xyMode = state.media && state.media.type === 'audio' && state.media.audioMode === 'xy';
  const frame = {
    figure, t, drawMode: state.drawMode,
    labels: state.chord.labels(), colors: state.chord.colors(),
    persistence: persistenceTau(state.persistence), bloom: state.bloom,
    xyPoints: xyMode ? bridge.frame.xyPoints : null,
    xy: xyMode && bridge.frame.xy ? bridge.frame.xy : null
  };
  bridge.frame.xy = null; // each X-Y segment is drawn once
  const tunnelOn = state.tunnel && state.dimension === '3D';
  if (tunnelOn) {
    const tc = tunnelClock.update(state.media ? mediaTime : null, t);
    const xyWindow = bridge.frame.xyPoints;
    frame.tunnel = {
      on: true, now: tc.now, cleared: tc.cleared || !tunnelWasOn, title: state.chord.meta.title,
      speed: state.tunnelSpeed, history: state.tunnelHistory,
      makeSlice: () => buildSlice({ state, figure, t, xyPoints: xyWindow })
    };
  }
  return { frame, tunnelOn };
}
