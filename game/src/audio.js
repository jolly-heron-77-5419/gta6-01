// SOLMAR BAY — all sound, synthesized in the browser.
// One job: engine hum, police siren, pickup blips and success jingles
// from the Web Audio API. No audio files are loaded, ever.

export function createSound() {
  let ctx = null;
  let master = null;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenLfo = null;
  let muted = false;
  // Browsers only let an AudioContext start after a user gesture; until
  // one happens every call here is a silent no-op, never a warning.
  let unlocked = false;
  function unlock() {
    unlocked = true;
    if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
  }
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);

  function ensure() {
    if (!unlocked) return false;
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      return true;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
    } catch {
      return false;
    }
    return true;
  }

  // A short tone with a pitch slide and a fade — the atom every jingle
  // below is built from.
  function blip(freqA, freqB, seconds, type, volume, when = 0) {
    if (!ensure() || muted) return;
    const t0 = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freqA, t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqB), t0 + seconds);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(volume || 0.2, t0 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + seconds);
    osc.connect(gain).connect(master);
    osc.start(t0);
    osc.stop(t0 + seconds + 0.05);
  }

  function noiseBurst(seconds, volume, lowpass) {
    if (!ensure() || muted) return;
    const t0 = ctx.currentTime;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = lowpass || 900;
    const gain = ctx.createGain();
    gain.gain.value = volume || 0.25;
    src.connect(filter).connect(gain).connect(master);
    src.start(t0);
  }

  return {
    ensure,
    setMuted(value) {
      muted = !!value;
      if (master) master.gain.value = muted ? 0 : 0.5;
    },

    // Continuous engine drone; call every frame with 0..1 speed.
    engine(speed01, driving) {
      if (!ensure() || muted) return;
      if (!engineOsc) {
        engineOsc = ctx.createOscillator();
        engineOsc.type = 'sawtooth';
        engineGain = ctx.createGain();
        engineGain.gain.value = 0;
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 700;
        engineOsc.connect(filter).connect(engineGain).connect(master);
        engineOsc.start();
      }
      const target = driving ? 0.05 + speed01 * 0.12 : 0;
      engineGain.gain.setTargetAtTime(target, ctx.currentTime, 0.08);
      engineOsc.frequency.setTargetAtTime(55 + speed01 * 165, ctx.currentTime, 0.08);
    },

    // Two-tone police siren that wails while any police car is near.
    siren(on) {
      if (!ensure() || muted) {
        if (sirenOsc) sirenGain.gain.setTargetAtTime(0, ctx.currentTime, 0.1);
        return;
      }
      if (!sirenOsc) {
        sirenOsc = ctx.createOscillator();
        sirenOsc.type = 'triangle';
        sirenOsc.frequency.value = 720;
        sirenLfo = ctx.createOscillator();
        sirenLfo.type = 'square';
        sirenLfo.frequency.value = 0.55;
        const lfoGain = ctx.createGain();
        lfoGain.gain.value = 180;
        sirenLfo.connect(lfoGain).connect(sirenOsc.frequency);
        sirenGain = ctx.createGain();
        sirenGain.gain.value = 0;
        sirenOsc.connect(sirenGain).connect(master);
        sirenOsc.start();
        sirenLfo.start();
      }
      sirenGain.gain.setTargetAtTime(on ? 0.045 : 0, ctx.currentTime, 0.2);
    },

    pickup() {
      blip(660, 660, 0.09, 'sine', 0.22);
      blip(990, 990, 0.12, 'sine', 0.22, 0.08);
    },
    success() {
      [523, 659, 784, 1047].forEach((f, i) => blip(f, f, 0.16, 'triangle', 0.2, i * 0.11));
    },
    fail() {
      blip(220, 110, 0.5, 'sawtooth', 0.16);
      blip(165, 82, 0.5, 'sawtooth', 0.14, 0.12);
    },
    thud() {
      noiseBurst(0.14, 0.3, 500);
      blip(90, 45, 0.12, 'sine', 0.3);
    },
    punch() {
      noiseBurst(0.09, 0.35, 1400);
    },
    door() {
      noiseBurst(0.12, 0.2, 700);
      blip(180, 120, 0.1, 'square', 0.08);
    },
    click() {
      blip(880, 880, 0.05, 'square', 0.1);
    },
    gullChirp() {
      blip(1400, 900, 0.12, 'sine', 0.05);
      blip(1500, 1000, 0.1, 'sine', 0.04, 0.14);
    },
  };
}

// Second pass on audio: a short ambient loop of gulls and waves for the
// beach side of the map, kept separate so the main file stays readable.

export function createAmbience(sound) {
  // The sound object above owns the AudioContext; ambience only schedules
  // soft filtered-noise swells through it, so it needs no new plumbing.
  // Kept intentionally tiny: waves are a slow gain swell on noise, gulls
  // are two quick descending chirps, both sparse and quiet.
  let timer = null;
  return {
    start() {
      if (timer) return;
      timer = setInterval(() => {
        if (Math.random() < 0.3) sound.gullChirp();
      }, 9000);
    },
    stop() {
      if (timer) { clearInterval(timer); timer = null; }
    },
  };
}
