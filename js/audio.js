// Efectos de sonido sintetizados con Web Audio (sin archivos de audio).
PB.Audio = {
  ctx: null,
  muted: false,
  volume: 0.7,

  // volumen general (0-1), lo fija el menú de ajustes
  setVolume(v) {
    this.volume = v;
    this.muted = v <= 0;
    if (this.master) this.master.gain.value = 0.36 * v;
  },
  last: {},

  init() {
    if (this.ctx) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.36 * this.volume;
      this.master.connect(this.ctx.destination);
    } catch (e) {
      this.ctx = null;
    }
  },

  tone(freq, to, len, type, vol, delay) {
    const c = this.ctx, t = c.currentTime + (delay || 0);
    const o = c.createOscillator(), g = c.createGain();
    o.type = type || 'square';
    o.frequency.setValueAtTime(freq, t);
    if (to) o.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + len);
    g.gain.setValueAtTime(vol || 0.3, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + len);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + len + 0.02);
  },

  noise(len, vol, freq) {
    const c = this.ctx, t = c.currentTime;
    const buf = c.createBuffer(1, Math.floor(c.sampleRate * len), c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    src.buffer = buf;
    f.type = 'lowpass';
    f.frequency.value = freq || 1200;
    g.gain.value = vol || 0.3;
    src.connect(f).connect(g).connect(this.master);
    src.start(t);
  },

  play(type, opt) {
    if (!this.ctx || this.muted) return;
    // evitar saturar con muchos sonidos iguales a la vez
    const now = this.ctx.currentTime;
    if (this.last[type] && now - this.last[type] < 0.04) return;
    this.last[type] = now;
    const o = opt || {};
    switch (type) {
      case 'shoot': {
        const v = o.me ? 1 : 0.6;
        if (o.type === 'fire') this.noise(0.2, 0.28 * v, 1000);
        else if (o.type === 'water') { this.tone(650, 260, 0.16, 'sine', 0.3 * v); this.noise(0.1, 0.1 * v, 2500); }
        else if (o.type === 'electric') this.tone(1500, 500, 0.1, 'sawtooth', 0.15 * v);
        else if (o.type === 'rock') this.tone(180, 90, 0.18, 'triangle', 0.4 * v);
        else if (o.type === 'ghost') this.tone(260, 520, 0.28, 'sine', 0.28 * v);
        else if (o.type === 'grass') { this.noise(0.08, 0.15 * v, 4000); this.tone(900, 1300, 0.08, 'triangle', 0.15 * v); }
        else this.tone(900, 500, 0.08, 'triangle', 0.2 * v);
        break;
      }
      case 'hit': this.tone(o.me ? 160 : 240, 90, 0.08, 'square', o.me ? 0.3 : 0.14); break;
      case 'ko': this.tone(600, 70, 0.45, 'sawtooth', 0.28); this.tone(900, 300, 0.3, 'square', 0.1, 0.05); break;
      case 'ball': // recoger Pokéball
        this.tone(988, 0, 0.08, 'square', 0.18);
        this.tone(1319, 0, 0.14, 'square', 0.18, 0.07);
        break;
      case 'ballspawn': this.tone(500, 900, 0.12, 'triangle', 0.15); break;
      case 'super': this.tone(300, 1200, 0.35, 'square', 0.2); this.noise(0.3, 0.15, 1800); break;
      case 'ready': [784, 988, 1175].forEach((f, i) => this.tone(f, 0, 0.1, 'square', 0.13, i * 0.06)); break;
      case 'boom': this.noise(o.big ? 0.6 : 0.28, o.big ? 0.55 : 0.32, o.big ? 450 : 800); if (o.big) this.tone(90, 40, 0.5, 'sine', 0.5); break;
      case 'wall': this.noise(0.3, 0.35, 600); break;
      case 'release': this.tone(400, 1600, 0.25, 'sine', 0.2); this.noise(0.15, 0.1, 5000); break;
      case 'count': this.tone(660, 0, 0.15, 'square', 0.2); break;
      case 'go': this.tone(1320, 0, 0.35, 'square', 0.22); this.tone(400, 1600, 0.25, 'sine', 0.15); break;
      case 'tick': this.tone(880, 0, 0.08, 'square', 0.15); break;
      case 'candy': [660, 880, 1320].forEach((f, i) => this.tone(f, 0, 0.09, 'square', 0.15, i * 0.05)); break;
      case 'gas': this.tone(200, 120, 0.8, 'sawtooth', 0.12); this.noise(0.8, 0.15, 500); break;
      case 'thump': this.tone(110, 60, 0.15, 'sine', 0.35); break;
      case 'kick': this.tone(320, 140, 0.1, 'square', 0.25); this.noise(0.08, 0.2, 2000); break;
      case 'goal':
        [523, 659, 784, 1046, 1318].forEach((f, i) => this.tone(f, 0, 0.18, 'square', 0.2, i * 0.08));
        this.noise(0.8, 0.12, 3000);
        break;
      case 'win':
        [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0, 0.25, 'square', 0.2, i * 0.13));
        break;
      case 'lose':
        [392, 330, 262, 196].forEach((f, i) => this.tone(f, 0, 0.3, 'triangle', 0.25, i * 0.16));
        break;
    }
  },
};
