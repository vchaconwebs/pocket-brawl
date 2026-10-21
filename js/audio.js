// Efectos de sonido sintetizados con Web Audio (sin archivos de audio).
PB.Audio = {
  ctx: null,
  muted: false,
  last: {},

  init() {
    if (this.ctx) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.25;
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
      case 'shoot':
        if (o.fx === 'fire') this.noise(0.18, 0.25, 900);
        else if (o.fx === 'water') this.tone(700, 300, 0.15, 'sine', 0.3);
        else if (o.fx === 'electric') this.tone(1400, 600, 0.1, 'sawtooth', 0.15);
        else if (o.fx === 'rock') this.tone(200, 120, 0.15, 'triangle', 0.35);
        else if (o.fx === 'ghost') this.tone(300, 600, 0.25, 'sine', 0.25);
        else this.tone(900, 500, 0.08, 'triangle', 0.2);
        break;
      case 'hit': this.tone(220, 110, 0.07, 'square', o.me ? 0.3 : 0.12); break;
      case 'ko': this.tone(500, 80, 0.4, 'sawtooth', 0.3); break;
      case 'gem': this.tone(1200, 1800, 0.12, 'sine', 0.25); break;
      case 'super': this.tone(400, 1200, 0.3, 'square', 0.2); break;
      case 'boom': this.noise(o.big ? 0.5 : 0.25, o.big ? 0.5 : 0.3, o.big ? 500 : 800); break;
      case 'tick': this.tone(880, 0, 0.08, 'square', 0.15); break;
      case 'win':
        [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0, 0.25, 'square', 0.2, i * 0.13));
        break;
      case 'lose':
        [392, 330, 262, 196].forEach((f, i) => this.tone(f, 0, 0.3, 'triangle', 0.25, i * 0.16));
        break;
    }
  },
};
