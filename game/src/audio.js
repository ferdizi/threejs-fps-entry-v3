// Sound, synthesized live with WebAudio: no audio files, no network.
// Every shot, reload, beep and footstep is a small oscillator/noise recipe.
export function createAudio() {
  let ctx = null;
  let master = null;
  let muted = false;
  let noiseBuf = null;

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.32;
      master.connect(ctx.destination);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
      const data = noiseBuf.getChannelData(0);
      for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
      return true;
    } catch {
      return false;
    }
  }

  function noise(dur, filterFreq, gain, type = 'lowpass') {
    if (!ensure() || muted) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = filterFreq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter).connect(g).connect(master);
    src.start(t, Math.random() * 0.2);
    src.stop(t + dur);
  }

  function tone(freq, dur, gain, type = 'sine', slideTo = null) {
    if (!ensure() || muted) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g).connect(master);
    osc.start(t);
    osc.stop(t + dur);
  }

  function unlock() {
    if (ensure() && ctx.state === 'suspended') ctx.resume();
  }

  return {
    unlock,
    toggleMute() {
      muted = !muted;
      return muted;
    },
    shot(kind) {
      // crack + body thump, pitched per weapon
      const pitch = { pistol: 1400, smg: 1700, rifle: 1100, shotgun: 700, sniper: 900 }[kind] ?? 1100;
      noise(0.09, pitch * 2, 0.5, 'bandpass');
      noise(0.16, 320, 0.55);
      tone(160, 0.1, 0.3, 'sine', 55);
    },
    distantShot() {
      noise(0.12, 500, 0.12);
    },
    dryClick() {
      tone(1400, 0.03, 0.15, 'square');
    },
    reload() {
      tone(900, 0.05, 0.12, 'square');
      setTimeout(() => tone(620, 0.05, 0.12, 'square'), 260);
    },
    hit() {
      tone(2100, 0.04, 0.18, 'square');
    },
    kill() {
      tone(880, 0.09, 0.2, 'sine');
      setTimeout(() => tone(1320, 0.12, 0.2, 'sine'), 90);
    },
    hurt() {
      tone(220, 0.12, 0.25, 'sawtooth', 110);
    },
    step() {
      noise(0.05, 420, 0.07);
    },
    beep(final = false) {
      tone(final ? 1560 : 1040, 0.07, 0.2, 'square');
    },
    buy() {
      tone(1320, 0.06, 0.16, 'sine');
      setTimeout(() => tone(1760, 0.09, 0.16, 'sine'), 70);
    },
    roundWin() {
      [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => tone(f, 0.16, 0.18, 'triangle'), i * 110));
    },
    roundLose() {
      [392, 330, 262].forEach((f, i) => setTimeout(() => tone(f, 0.2, 0.16, 'triangle'), i * 130));
    },
    explosion() {
      noise(0.9, 240, 0.9);
      tone(70, 0.8, 0.5, 'sine', 30);
    },
    hiss() {
      // smoke pop: a short high-frequency burst, then a low settling poof
      noise(0.7, 2200, 0.22, 'highpass');
      noise(0.35, 260, 0.3);
    },
    throwWhoosh() {
      noise(0.16, 900, 0.2, 'bandpass');
    },
    plantStart() {
      tone(1040, 0.1, 0.2, 'square');
    },
  };
}
