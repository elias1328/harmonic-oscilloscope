// Media player bar. All DOM writes come from store subscriptions, so they happen only when the
// displayed value changes (formatted time, play state, track).

const $ = (id) => document.getElementById(id);

export function formatTime(sec) {
  if (isNaN(sec) || sec < 0) return '00:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
}

export function initPlayer(store, actions, importer, bridge) {
  const app = $('app-container');
  const bar = $('media-player-bar');
  const play = $('btn-player-play');
  const loop = $('btn-player-loop');
  const scrubber = $('player-scrubber');
  const timeCur = $('player-time-current');
  const timeTot = $('player-time-total');
  const modeSel = $('player-audio-mode-selector');
  const modeXy = $('btn-audio-mode-xy');
  const modePitch = $('btn-audio-mode-pitch');
  let scrubbing = false;

  play.addEventListener('click', () => (importer.isPlaying ? importer.pause() : importer.play()));
  $('btn-player-stop').addEventListener('click', () => importer.stop());
  $('btn-player-eject').addEventListener('click', () => actions.eject());
  loop.addEventListener('click', () => {
    importer.setLoop(!importer.isLooping);
    loop.classList.toggle('active', importer.isLooping);
  });
  document.querySelectorAll('.speed-btn').forEach(btn => btn.addEventListener('click', () => {
    document.querySelectorAll('.speed-btn').forEach(b => b.classList.toggle('active', b === btn));
    importer.setPlaybackRate(parseFloat(btn.dataset.speed));
  }));
  modeXy.addEventListener('click', () => bridge.setAudioMode('xy'));
  modePitch.addEventListener('click', () => bridge.setAudioMode('pitch'));

  // While playing, dragging only previews the time; the seek happens on release ('change').
  // While paused, dragging seeks live so the picture follows the thumb.
  const target = () => (parseFloat(scrubber.value) / 100) * importer.currentMedia.duration;
  scrubber.addEventListener('input', () => {
    if (!importer.currentMedia) return;
    if (importer.isPlaying) {
      scrubbing = true;
      timeCur.textContent = formatTime(target());
    } else {
      importer.seek(target());
    }
  });
  scrubber.addEventListener('change', () => {
    scrubbing = false;
    if (importer.currentMedia) importer.seek(target());
  });

  store.subscribe(s => !!s.media, (active) => {
    bar.classList.toggle('hidden', !active);
    app.classList.toggle('media-active', active);
  });
  store.subscribe(s => (s.media ? s.media.info : null), (info) => {
    if (!info) return;
    $('player-track-icon').textContent = info.type === 'midi' ? '🎹' : '🎵';
    $('player-track-title').textContent = info.name;
    if (info.type === 'midi') {
      $('player-track-meta').textContent = `MIDI • ${info.tracksCount || 1} Tracks • ${info.bpm || 120} BPM • ${info.noteCount || 0} Notes`;
    } else {
      const rateLabel = info.sampleRateSource === 'context' ? ' (context rate)' : '';
      $('player-track-meta').textContent = `Audio • ${info.channels} Channel(s) • ${(info.sampleRate / 1000).toFixed(1)} kHz${rateLabel}`;
    }
    modeSel.style.display = info.type === 'audio' ? 'flex' : 'none';
    scrubber.value = 0;
  });
  store.subscribe(s => s.playerReset, () => {
    $('player-track-title').textContent = 'No Track Loaded';
    $('player-track-meta').textContent = 'MIDI / Audio';
  }, { immediate: false });
  store.subscribe(s => (s.media ? s.media.audioMode : null), (mode) => {
    modeXy.classList.toggle('active', mode === 'xy');
    modePitch.classList.toggle('active', mode === 'pitch');
  });
  store.subscribe(s => (s.media ? formatTime(s.media.time) : '00:00'), (txt) => { if (!scrubbing) timeCur.textContent = txt; });
  store.subscribe(s => (s.media ? formatTime(s.media.duration) : '00:00'), (txt) => { timeTot.textContent = txt; });
  store.subscribe(s => (s.media ? s.media.time / s.media.duration : 0), (frac) => {
    if (!scrubbing && isFinite(frac)) scrubber.value = frac * 100;
  });
  store.subscribe(s => !!(s.media && s.media.playing), (playing) => {
    const icon = playing ? '⏸' : '▶';
    if (play.textContent !== icon) play.textContent = icon;
  });
}
