let audioCtx: AudioContext | null = null;

function getContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (audioCtx) return audioCtx;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  audioCtx = new Ctor();
  return audioCtx;
}

/** Play a short beep. Safe to call when the document hasn't been clicked yet — it just no-ops. */
export function beep(durationMs = 400, frequency = 880, volume = 0.4): void {
  const ctx = getContext();
  if (!ctx) return;
  // Many browsers create the context in 'suspended' state; resume opportunistically.
  if (ctx.state === 'suspended') void ctx.resume();

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.value = frequency;

  const t0 = ctx.currentTime;
  const t1 = t0 + durationMs / 1000;
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(volume, t0 + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, t1);

  osc.connect(gain).connect(ctx.destination);
  osc.start(t0);
  osc.stop(t1);
}

/** Play `count` beeps spaced `gapMs` apart. */
export function beepBurst(count = 3, gapMs = 200): void {
  for (let i = 0; i < count; i++) {
    setTimeout(() => beep(180, 880), i * gapMs);
  }
}
