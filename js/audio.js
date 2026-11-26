export function createAudio() {
  let ctx = null, noise = null, muted = false;
  try { muted = localStorage.getItem('tank-muted') === '1'; } catch { /* storage blocked */ }

  function unlock() {
    if (ctx) return void ctx.resume();
    ctx = new AudioContext();
    noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  addEventListener('pointerdown', unlock);
  addEventListener('keydown', unlock);

  function envelope(volume, duration, at) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(volume, at);
    g.gain.exponentialRampToValueAtTime(0.001, at + duration);
    g.connect(ctx.destination);
    return g;
  }
  function tone(type, from, to, duration, volume, delay = 0) {
    const at = ctx.currentTime + delay, o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(from, at);
    o.frequency.exponentialRampToValueAtTime(to, at + duration);
    o.connect(envelope(volume, duration, at));
    o.start(at); o.stop(at + duration);
  }
  function crunch(cutoff, duration, volume) {
    const at = ctx.currentTime, src = ctx.createBufferSource(), f = ctx.createBiquadFilter();
    src.buffer = noise;
    f.type = 'lowpass'; f.frequency.value = cutoff;
    src.connect(f).connect(envelope(volume, duration, at));
    src.start(at); src.stop(at + duration);
  }
  const SOUNDS = {
    fire: v => { crunch(2200, 0.18, 0.35 * v); tone('sine', 160, 45, 0.18, 0.4 * v); },
    boom: v => { crunch(900, 0.8, 0.7 * v); tone('sine', 100, 28, 0.6, 0.6 * v); },
    brick: v => crunch(1400, 0.25, 0.35 * v),
    hit: v => { tone('square', 320, 90, 0.12, 0.18 * v); crunch(3000, 0.08, 0.2 * v); },
    bounce: v => tone('triangle', 1500, 700, 0.1, 0.15 * v),
    pickup: v => [520, 660, 880].forEach((f, i) => tone('triangle', f, f, 0.12, 0.2 * v, i * 0.07)),
  };

  return {
    play(events, x, y) {
      if (!ctx || muted) return;
      for (const e of events.slice(0, 8)) {
        const volume = 1 - Math.hypot(e.x - x, e.y - y) / 1300;
        if (volume > 0.05) SOUNDS[e.type]?.(volume);
      }
    },
    get muted() { return muted; },
    toggleMute() {
      muted = !muted;
      try { localStorage.setItem('tank-muted', muted ? '1' : '0'); } catch { /* storage blocked */ }
      return muted;
    },
  };
}
