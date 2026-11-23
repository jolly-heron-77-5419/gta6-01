// All sound is synthesized in the browser with WebAudio: no audio files,
// nothing to download. Engine hum, sirens, jingles and impacts are built
// from oscillators and filtered noise, and start only after the first
// gesture, as browsers require.

export function createSound() {
  let context = null;
  let master = null;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenTimer = 0;
  let muted = false;

  function ensure() {
    if (context) return true;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return false;
      context = new AudioContext();
      master = context.createGain();
      master.gain.value = 0.5;
      master.connect(context.destination);
    } catch {
      return false;
    }
    return true;
  }

  // A short tone with an envelope: frequency, length, waveform, volume.
  function tone(freq, seconds, type, volume, when = 0, slideTo = 0) {
    if (!context || muted) return;
    const start = context.currentTime + when;
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    if (slideTo > 0) osc.frequency.exponentialRampToValueAtTime(slideTo, start + seconds);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + seconds);
    osc.connect(gain);
    gain.connect(master);
    osc.start(start);
    osc.stop(start + seconds + 0.05);
  }

  // A burst of filtered noise: thuds, crashes and footsteps.
  function noise(seconds, volume, lowFreq) {
    if (!context || muted) return;
    const start = context.currentTime;
    const length = Math.max(1, Math.floor(context.sampleRate * seconds));
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    const source = context.createBufferSource();
    source.buffer = buffer;
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = lowFreq;
    const gain = context.createGain();
    gain.gain.value = volume;
    source.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    source.start(start);
  }

  return {
    // Call from any user gesture; harmless to call often.
    unlock() {
      if (ensure() && context.state === 'suspended') context.resume();
    },
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.5;
      return muted;
    },
    isMuted() {
      return muted;
    },
    // The engine hum follows the car's speed: pitch and loudness rise.
    engine(speed01, on) {
      if (!ensure() || muted) return;
      if (!on) {
        if (engineGain) engineGain.gain.setTargetAtTime(0, context.currentTime, 0.1);
        return;
      }
      if (!engineOsc) {
        engineOsc = context.createOscillator();
        engineOsc.type = 'sawtooth';
        engineGain = context.createGain();
        engineGain.gain.value = 0;
        const filter = context.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 420;
        engineOsc.connect(filter);
        filter.connect(engineGain);
        engineGain.connect(master);
        engineOsc.start();
      }
      engineOsc.frequency.setTargetAtTime(55 + speed01 * 130, context.currentTime, 0.08);
      engineGain.gain.setTargetAtTime(0.05 + speed01 * 0.09, context.currentTime, 0.08);
    },
    // A two-tone police siren, alternating while any police are near.
    siren(on, dt) {
      if (!ensure() || muted) return;
      if (!on) {
        if (sirenGain) sirenGain.gain.setTargetAtTime(0, context.currentTime, 0.15);
        return;
      }
      if (!sirenOsc) {
        sirenOsc = context.createOscillator();
        sirenOsc.type = 'triangle';
        sirenGain = context.createGain();
        sirenGain.gain.value = 0;
        sirenOsc.connect(sirenGain);
        sirenGain.connect(master);
        sirenOsc.start();
      }
      sirenTimer += dt;
      const high = Math.floor(sirenTimer / 0.45) % 2 === 0;
      sirenOsc.frequency.setTargetAtTime(high ? 880 : 660, context.currentTime, 0.05);
      sirenGain.gain.setTargetAtTime(0.045, context.currentTime, 0.1);
    },
    pickup() {
      tone(660, 0.12, 'sine', 0.25);
      tone(990, 0.18, 'sine', 0.25, 0.09);
    },
    success() {
      const notes = [523, 659, 784, 1047];
      notes.forEach((freq, i) => tone(freq, 0.22, 'triangle', 0.22, i * 0.11));
    },
    fail() {
      tone(220, 0.5, 'sawtooth', 0.18, 0, 110);
    },
    punch() {
      noise(0.12, 0.4, 500);
    },
    crash() {
      noise(0.3, 0.5, 300);
      tone(90, 0.25, 'sine', 0.35, 0, 45);
    },
    step() {
      noise(0.05, 0.08, 400);
    },
    click() {
      tone(1200, 0.05, 'square', 0.12);
    },
  };
}
