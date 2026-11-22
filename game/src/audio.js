// audio.js — all sound is synthesized live with WebAudio. No audio files.
// Engine hum, police siren, punches, gunshots, pickups and a bass music loop.
// Everything is created after the first user gesture (AudioContext policy).

export class SoundBank {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.musicTimer = null;
    this.sirenNodes = null;
    this.engineNodes = null;
    this.musicStep = 0;
    this.noiseBuf = null; // one shared 1 s noise buffer, built lazily
  }
  ensure() {
    if (!this.ctx) {
      try {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.35;
        this.master.connect(this.ctx.destination);
      } catch (e) { /* audio unavailable — game still plays */ }
    }
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    return !!this.ctx;
  }
  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.35;
    if (m) this.stopAll();
  }
  /** Stop every continuous sound (siren + engine hum). Used on mute and
   *  on game over so nothing keeps droning after the game stops. */
  stopAll() { this.stopSiren(); this.stopEngine(); }
  tone(freq, dur, type = 'sine', vol = 0.3, slideTo = 0) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  }
  noise(dur, vol = 0.25, lowpass = 1200) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    // Reuse one shared 1 s noise buffer instead of allocating a fresh
    // AudioBuffer on every punch, shot and hi-hat — noise() is the hottest
    // sound path in the game. Shorter sounds just play a slice of it.
    if (!this.noiseBuf) {
      const len = this.ctx.sampleRate;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    src.loopEnd = dur;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = lowpass;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t); src.stop(t + dur + 0.02);
  }
  punch() { this.noise(0.12, 0.5, 500); this.tone(90, 0.1, 'square', 0.2, 50); }
  shoot() { this.noise(0.09, 0.4, 3500); this.tone(220, 0.08, 'sawtooth', 0.15, 60); }
  pickup() { this.tone(660, 0.12, 'sine', 0.25); setTimeout(() => this.tone(990, 0.18, 'sine', 0.25), 90); }
  missionDone() { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this.tone(f, 0.25, 'triangle', 0.3), i * 110)); }
  busted() { [400, 300, 200].forEach((f, i) => setTimeout(() => this.tone(f, 0.3, 'sawtooth', 0.25), i * 160)); }
  crash() { this.noise(0.3, 0.5, 700); }
  startEngine() { this.tone(60, 0.5, 'sawtooth', 0.2, 140); }

  // Continuous engine hum whose pitch follows speed. Call every frame.
  engine(speedRatio, driving) {
    if (!this.ctx || this.muted) { this.stopEngine(); return; }
    if (!driving) { this.stopEngine(); return; }
    if (!this.engineNodes) {
      const o = this.ctx.createOscillator();
      o.type = 'sawtooth'; o.frequency.value = 70;
      const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 500;
      const g = this.ctx.createGain(); g.gain.value = 0.06;
      o.connect(f); f.connect(g); g.connect(this.master); o.start();
      this.engineNodes = { o, g };
    }
    this.engineNodes.o.frequency.value = 60 + speedRatio * 160;
    this.engineNodes.g.gain.value = 0.04 + speedRatio * 0.05;
  }
  stopEngine() {
    if (this.engineNodes) { try { this.engineNodes.o.stop(); } catch (e) {} this.engineNodes = null; }
  }
  siren(on) {
    if (!this.ctx) return;
    if (!on || this.muted) { this.stopSiren(); return; }
    if (this.sirenNodes) return;
    const o = this.ctx.createOscillator();
    o.type = 'sine'; o.frequency.value = 700;
    const g = this.ctx.createGain(); g.gain.value = 0.05;
    const lfo = this.ctx.createOscillator(); lfo.frequency.value = 0.6;
    const lg = this.ctx.createGain(); lg.gain.value = 220;
    lfo.connect(lg); lg.connect(o.frequency);
    o.connect(g); g.connect(this.master); o.start(); lfo.start();
    this.sirenNodes = { o, lfo };
  }
  stopSiren() {
    if (this.sirenNodes) {
      try { this.sirenNodes.o.stop(); this.sirenNodes.lfo.stop(); } catch (e) {}
      this.sirenNodes = null;
    }
  }
  // Simple bass-and-hat loop, scheduled in steps.
  startMusic() {
    if (!this.ctx || this.musicTimer) return;
    const bass = [55, 0, 55, 0, 65.4, 0, 49, 0, 55, 0, 55, 0, 82.4, 73.4, 65.4, 0];
    this.musicTimer = setInterval(() => {
      if (this.muted || document.hidden) return; // don't burn steps in a background tab
      const f = bass[this.musicStep % bass.length];
      if (f) this.tone(f, 0.22, 'triangle', 0.22);
      if (this.musicStep % 2 === 0) this.noise(0.03, 0.06, 6000);
      this.musicStep++;
    }, 240);
  }
  stopMusic() { if (this.musicTimer) { clearInterval(this.musicTimer); this.musicTimer = null; } }
}
