// Sonido sintetizado con Web Audio (sin archivos): efectos por tipo y música chiptune original.
// Toda la música se compone aquí con código (no es de ningún juego), así no hay problemas de derechos.
PB.Audio = {
  ctx: null,
  muted: false,
  volume: 0.7,
  musicVolume: 0.45,
  last: {},

  // volumen general (0-1), lo fija el menú de ajustes
  setVolume(v) {
    this.volume = v;
    this.muted = v <= 0;
    if (this.master) this.master.gain.value = 0.42 * v;
  },
  setMusicVolume(v) {
    this.musicVolume = v;
    if (this.musicBus) this.musicBus.gain.value = 0.55 * v;
  },

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.42 * this.volume;
      this.master.connect(this.ctx.destination);
      this.sfx = this.ctx.createGain();
      this.sfx.connect(this.master);
      this.musicBus = this.ctx.createGain();
      this.musicBus.gain.value = 0.55 * this.musicVolume;
      this.musicBus.connect(this.master);
      this.noiseBuf = this.ctx.createBuffer(1, this.ctx.sampleRate, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      if (this.wantSong) this.music(this.wantSong);
    } catch (e) {
      this.ctx = null;
    }
  },

  // ---------------------------------------------------------------- piezas de sonido
  // tono con envolvente: o = { to, type, vol, delay, attack, vib (Hz), vibAmt, out }
  tone(freq, len, o = {}) {
    const c = this.ctx, t = c.currentTime + (o.delay || 0);
    const osc = c.createOscillator(), g = c.createGain();
    osc.type = o.type || 'square';
    osc.frequency.setValueAtTime(freq, t);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.to), t + len);
    if (o.vib) {
      const lfo = c.createOscillator(), lg = c.createGain();
      lfo.frequency.value = o.vib;
      lg.gain.value = o.vibAmt || freq * 0.04;
      lfo.connect(lg).connect(osc.frequency);
      lfo.start(t);
      lfo.stop(t + len + 0.05);
    }
    const v = o.vol || 0.2, a = o.attack || 0.004;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(v, t + a);
    g.gain.exponentialRampToValueAtTime(0.0008, t + len);
    osc.connect(g).connect(o.out || this.sfx);
    osc.start(t);
    osc.stop(t + len + 0.05);
  },
  // ruido filtrado: o = { filter: 'lowpass'|'highpass'|'bandpass', freq, to, q, vol, delay, attack, out }
  noise(len, o = {}) {
    const c = this.ctx, t = c.currentTime + (o.delay || 0);
    const src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    src.buffer = this.noiseBuf;
    src.loop = true;
    f.type = o.filter || 'lowpass';
    f.frequency.setValueAtTime(o.freq || 1200, t);
    if (o.to) f.frequency.exponentialRampToValueAtTime(Math.max(30, o.to), t + len);
    f.Q.value = o.q || 1;
    const v = o.vol || 0.2;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(v, t + (o.attack || 0.005));
    g.gain.exponentialRampToValueAtTime(0.0008, t + len);
    src.connect(f).connect(g).connect(o.out || this.sfx);
    src.start(t, Math.random() * 0.5);
    src.stop(t + len + 0.05);
  },
  // golpe metálico: varios tonos que no casan entre sí
  metal(freq, len, vol, delay) {
    for (const k of [1, 2.76, 5.4, 8.93]) this.tone(freq * k, len / Math.sqrt(k), { type: 'sine', vol: vol / k, delay });
  },

  // ---------------------------------------------------------------- disparos por tipo
  // big = súper (más largo y fuerte)
  typeSound(type, v, big) {
    const L = big ? 1.8 : 1;
    switch (type) {
      case 'fire': // crepitar y soplo de llama
        this.noise(0.28 * L, { filter: 'lowpass', freq: 2600, to: 500, vol: 0.32 * v, attack: 0.02 });
        this.noise(0.12 * L, { filter: 'bandpass', freq: 5000, q: 3, vol: 0.12 * v, delay: 0.03 });
        this.tone(140, 0.2 * L, { to: 70, type: 'sawtooth', vol: 0.06 * v });
        break;
      case 'water': // chorro y burbujas
        this.noise(0.22 * L, { filter: 'bandpass', freq: 1400, to: 3000, q: 1.5, vol: 0.18 * v, attack: 0.02 });
        for (let i = 0; i < (big ? 5 : 3); i++) this.tone(500 + Math.random() * 500, 0.07, { to: 1100 + Math.random() * 700, type: 'sine', vol: 0.12 * v, delay: 0.04 + i * 0.045 });
        break;
      case 'grass': // hojas cortando el aire
        this.noise(0.16 * L, { filter: 'highpass', freq: 3500, vol: 0.16 * v });
        this.tone(1200, 0.07, { to: 1800, type: 'triangle', vol: 0.1 * v });
        this.tone(1500, 0.06, { to: 2200, type: 'triangle', vol: 0.07 * v, delay: 0.05 });
        break;
      case 'electric': // chispazo zumbón
        this.tone(1800, 0.12 * L, { to: 300, type: 'sawtooth', vol: 0.12 * v, vib: 60, vibAmt: 500 });
        this.noise(0.08 * L, { filter: 'highpass', freq: 6000, vol: 0.14 * v });
        this.tone(2400, 0.05, { type: 'square', vol: 0.06 * v, delay: 0.04 });
        break;
      case 'ice': // cristales
        [2093, 2637, 3136].forEach((f, i) => this.tone(f, 0.18 * L, { type: 'sine', vol: 0.09 * v, delay: i * 0.03 }));
        this.noise(0.1, { filter: 'highpass', freq: 7000, vol: 0.1 * v });
        break;
      case 'fighting': // puñetazo seco
        this.tone(180, 0.12 * L, { to: 60, type: 'sine', vol: 0.35 * v });
        this.noise(0.06, { filter: 'lowpass', freq: 2000, vol: 0.22 * v });
        break;
      case 'poison': // burbujeo viscoso
        for (let i = 0; i < (big ? 4 : 2); i++) this.tone(220 + i * 40, 0.12, { to: 120, type: 'sine', vol: 0.18 * v, delay: i * 0.06, vib: 18, vibAmt: 30 });
        this.noise(0.15 * L, { filter: 'lowpass', freq: 700, vol: 0.12 * v });
        break;
      case 'ground': // tierra que se levanta
        this.noise(0.25 * L, { filter: 'lowpass', freq: 600, to: 200, vol: 0.32 * v });
        this.tone(90, 0.22 * L, { to: 45, type: 'triangle', vol: 0.25 * v });
        break;
      case 'flying': // ráfaga de viento
        this.noise(0.3 * L, { filter: 'bandpass', freq: 600, to: 2400, q: 2, vol: 0.2 * v, attack: 0.06 });
        break;
      case 'psychic': // onda mental que vibra
        this.tone(660, 0.3 * L, { to: 990, type: 'sine', vol: 0.13 * v, vib: 14, vibAmt: 40, attack: 0.03 });
        this.tone(330, 0.3 * L, { to: 495, type: 'triangle', vol: 0.08 * v, vib: 9, vibAmt: 20 });
        break;
      case 'bug': // zumbido de alas
        this.tone(240, 0.16 * L, { to: 320, type: 'sawtooth', vol: 0.08 * v, vib: 45, vibAmt: 25 });
        this.noise(0.08, { filter: 'bandpass', freq: 3000, q: 4, vol: 0.08 * v });
        break;
      case 'rock': // piedra que sale y cruje
        this.tone(160, 0.16 * L, { to: 80, type: 'triangle', vol: 0.32 * v });
        this.noise(0.12 * L, { filter: 'bandpass', freq: 900, q: 1.2, vol: 0.2 * v, delay: 0.02 });
        break;
      case 'ghost': // lamento que baja
        this.tone(720, 0.4 * L, { to: 280, type: 'sine', vol: 0.14 * v, vib: 6, vibAmt: 25, attack: 0.05 });
        this.tone(540, 0.35 * L, { to: 210, type: 'triangle', vol: 0.06 * v, vib: 5, vibAmt: 18, delay: 0.04 });
        break;
      case 'dragon': // rugido
        this.tone(110, 0.3 * L, { to: 70, type: 'sawtooth', vol: 0.16 * v, vib: 30, vibAmt: 12 });
        this.noise(0.25 * L, { filter: 'lowpass', freq: 1500, to: 400, vol: 0.18 * v });
        break;
      case 'dark': // tajo oscuro
        this.noise(0.16 * L, { filter: 'bandpass', freq: 2500, to: 500, q: 2, vol: 0.2 * v });
        this.tone(200, 0.18 * L, { to: 100, type: 'sawtooth', vol: 0.06 * v });
        break;
      case 'steel': // clang metálico
        this.metal(620, 0.35 * L, 0.18 * v);
        break;
      case 'fairy': // destellos
        [1568, 2093, 2637, 3136].forEach((f, i) => this.tone(f, 0.12, { type: 'triangle', vol: 0.07 * v, delay: i * 0.035 }));
        break;
      default: // normal
        this.tone(700, 0.08 * L, { to: 380, type: 'triangle', vol: 0.18 * v });
        this.noise(0.05, { filter: 'highpass', freq: 3000, vol: 0.06 * v });
    }
  },

  play(type, opt) {
    if (!this.ctx || this.muted) return;
    // evitar saturar con muchos sonidos iguales a la vez
    const now = this.ctx.currentTime;
    const key = type + (opt && opt.type ? opt.type : '');
    if (this.last[key] && now - this.last[key] < 0.04) return;
    this.last[key] = now;
    const o = opt || {};
    switch (type) {
      case 'shoot': this.typeSound(o.type, o.me ? 1 : 0.55, false); break;
      case 'super':
        this.tone(300, 0.3, { to: 1200, type: 'square', vol: 0.1 });
        this.typeSound(o.type, o.me ? 1.1 : 0.6, true);
        break;
      case 'hit': this.tone(o.me ? 160 : 240, 0.08, { to: 90, vol: o.me ? 0.24 : 0.11 }); break;
      case 'ko':
        this.tone(600, 0.45, { to: 70, type: 'sawtooth', vol: 0.2 });
        this.tone(900, 0.3, { to: 300, vol: 0.08, delay: 0.05 });
        break;
      case 'ball': // recoger Pokéball
        this.tone(988, 0.08, { vol: 0.14 });
        this.tone(1319, 0.14, { vol: 0.14, delay: 0.07 });
        break;
      case 'ballspawn': this.tone(500, 0.12, { to: 900, type: 'triangle', vol: 0.12 }); break;
      case 'ready': [784, 988, 1175].forEach((f, i) => this.tone(f, 0.1, { vol: 0.1, delay: i * 0.06 })); break;
      case 'boom':
        this.noise(o.big ? 0.7 : 0.3, { filter: 'lowpass', freq: o.big ? 900 : 1400, to: 120, vol: o.big ? 0.5 : 0.3 });
        if (o.big) this.tone(90, 0.5, { to: 35, type: 'sine', vol: 0.45 });
        break;
      case 'wall': this.noise(0.3, { filter: 'lowpass', freq: 700, to: 150, vol: 0.32 }); this.tone(120, 0.2, { to: 60, type: 'triangle', vol: 0.15 }); break;
      case 'release': this.tone(400, 0.25, { to: 1600, type: 'sine', vol: 0.16 }); this.noise(0.15, { filter: 'highpass', freq: 5000, vol: 0.08 }); break;
      case 'count': this.tone(660, 0.15, { vol: 0.16 }); break;
      case 'go': this.tone(1320, 0.35, { vol: 0.16 }); this.tone(400, 0.25, { to: 1600, type: 'sine', vol: 0.12 }); break;
      case 'tick': this.tone(880, 0.07, { vol: 0.1 }); break;
      case 'candy': [660, 880, 1320].forEach((f, i) => this.tone(f, 0.09, { vol: 0.12, delay: i * 0.05 })); break;
      case 'evolve': // arpegio que sube, como al evolucionar en los juegos
        [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => this.tone(f, 0.11, { vol: 0.11, delay: i * 0.08 }));
        this.tone(400, 0.6, { to: 1800, type: 'sine', vol: 0.1, delay: 0.1 });
        break;
      case 'gas': this.tone(200, 0.8, { to: 120, type: 'sawtooth', vol: 0.09 }); this.noise(0.8, { filter: 'lowpass', freq: 500, vol: 0.12 }); break;
      case 'thump': this.tone(110, 0.15, { to: 60, type: 'sine', vol: 0.3 }); break;
      case 'kick': this.tone(320, 0.1, { to: 140, vol: 0.2 }); this.noise(0.08, { filter: 'lowpass', freq: 2000, vol: 0.16 }); break;
      case 'goal':
        [523, 659, 784, 1046, 1318].forEach((f, i) => this.tone(f, 0.18, { vol: 0.15, delay: i * 0.08 }));
        this.noise(0.8, { filter: 'highpass', freq: 3000, vol: 0.1 });
        break;
      case 'win': this.jingle('victory'); break;
      case 'lose': this.jingle('defeat'); break;
    }
  },

  // ---------------------------------------------------------------- música
  // Cada canción: tempo, escala, acordes por compás (grado de la escala), motivos de melodía y batería.
  // La melodía se construye a partir de un motivo de 2 compases que se adapta a cada acorde,
  // así suena a canción (se repite y varía) y no a notas al azar.
  SONGS: {
    menu: { // tranquila y alegre, como la música de un pueblo
      bpm: 108, root: 60, scale: [0, 2, 4, 5, 7, 9, 11], swing: 0.08,
      sections: [
        { chords: [0, 4, 5, 3], motif: 'A', reps: 2 },
        { chords: [3, 4, 2, 5], motif: 'B', reps: 1 },
        { chords: [3, 4, 0, 0], motif: 'A', reps: 1 },
      ],
      motifs: {
        A: [[0, 4, 3], null, null, null, [2, 2], null, [1, 2], null, [0, 4], null, null, null, [4, 4], null, null, null,
            [5, 2], null, [4, 2], null, [2, 4], null, null, null, [1, 2], null, [2, 2], null, [0, 6], null, null, null],
        B: [[4, 2], null, [5, 2], null, [7, 4], null, null, null, [5, 2], null, [4, 2], null, [2, 4], null, null, null,
            [4, 2], null, [2, 2], null, [1, 2], null, [2, 2], null, [4, 8], null, null, null, null, null, null, null],
      },
      lead: 'square', leadVol: 0.05, arp: true, bass: 'walk',
      drums: { k: 'x.......x.......', s: '....x.......x...', h: '..x...x...x...x.' },
    },
    battle: { // enérgica, para las partidas por equipos
      bpm: 150, root: 57, scale: [0, 2, 3, 5, 7, 8, 10],
      sections: [
        { chords: [0, 5, 6, 4], motif: 'A', reps: 2 },
        { chords: [5, 6, 0, 0], motif: 'B', reps: 1 },
        { chords: [3, 4, 5, 4], motif: 'C', reps: 1 },
      ],
      motifs: {
        A: [[0, 2], null, [0, 1], [2, 1], [4, 2], null, [2, 2], null, [5, 3], null, null, [4, 1], [2, 2], null, [0, 2], null,
            [4, 2], null, [4, 1], [5, 1], [7, 4], null, null, null, [5, 2], null, [4, 2], null, [2, 4], null, null, null],
        B: [[7, 3], null, null, [5, 1], [4, 2], null, [5, 2], null, [7, 2], null, [9, 2], null, [7, 4], null, null, null,
            [5, 2], null, [4, 2], null, [2, 2], null, [4, 2], null, [0, 8], null, null, null, null, null, null, null],
        C: [[0, 1], [2, 1], [4, 1], [7, 1], [4, 1], [2, 1], [4, 2], null, [0, 1], [2, 1], [4, 1], [7, 1], [9, 2], null, [7, 2], null,
            [7, 1], [5, 1], [4, 1], [2, 1], [4, 2], null, [5, 2], null, [4, 4], null, null, null, [2, 4], null, null, null],
      },
      lead: 'square', leadVol: 0.055, arp: true, bass: 'drive',
      drums: { k: 'x.....x.x.......', s: '....x.......x..x', h: 'x.x.x.x.x.x.x.x.' },
    },
    showdown: { // tensa, para Niebla Tóxica
      bpm: 132, root: 62, scale: [0, 1, 3, 5, 7, 8, 10],
      sections: [
        { chords: [0, 0, 1, 0], motif: 'A', reps: 2 },
        { chords: [5, 6, 0, 1], motif: 'B', reps: 1 },
      ],
      motifs: {
        A: [[0, 3], null, null, [1, 1], [0, 4], null, null, null, [4, 2], null, [3, 2], null, [1, 4], null, null, null,
            [0, 3], null, null, [1, 1], [3, 2], null, [4, 2], null, [1, 8], null, null, null, null, null, null, null],
        B: [[4, 2], null, [5, 2], null, [4, 2], null, [3, 2], null, [4, 4], null, null, null, [7, 4], null, null, null,
            [5, 2], null, [4, 2], null, [3, 2], null, [1, 2], null, [0, 8], null, null, null, null, null, null, null],
      },
      lead: 'sawtooth', leadVol: 0.035, arp: false, bass: 'pulse',
      drums: { k: 'x.......x.x.....', s: '........x.......', h: '..x...x...x...xx' },
    },
    arena: { // alegre y rápida, para Voltorbol y Territorio
      bpm: 160, root: 64, scale: [0, 2, 3, 5, 7, 9, 10],
      sections: [
        { chords: [0, 3, 0, 6], motif: 'A', reps: 2 },
        { chords: [3, 4, 3, 6], motif: 'B', reps: 1 },
      ],
      motifs: {
        A: [[4, 1], null, [4, 1], null, [3, 1], [4, 1], null, [6, 2], null, [4, 2], null, [3, 2], null, [2, 2], null, null,
            [0, 1], null, [2, 1], null, [3, 2], null, [4, 2], null, [2, 4], null, null, null, [0, 4], null, null, null],
        B: [[7, 2], null, [6, 2], null, [4, 2], null, [6, 2], null, [7, 4], null, null, null, [9, 4], null, null, null,
            [7, 2], null, [6, 2], null, [4, 2], null, [3, 2], null, [4, 8], null, null, null, null, null, null, null],
      },
      lead: 'square', leadVol: 0.05, arp: true, bass: 'drive',
      drums: { k: 'x...x...x...x...', s: '....x.......x...', h: '.xx..xx..xx..xx.' },
    },
  },
  JINGLES: {
    victory: { bpm: 150, notes: [[72, 1], [76, 1], [79, 1], [84, 3], [79, 1], [84, 6]], bass: [48, 55, 60] },
    defeat: { bpm: 110, notes: [[67, 2], [65, 2], [63, 2], [60, 6]], bass: [48, 46, 44] },
  },

  midi: (n) => 440 * Math.pow(2, (n - 69) / 12),

  // cambia de canción (null = silencio). Si el audio aún no está activo, se queda pendiente.
  music(name) {
    this.wantSong = name;
    if (!this.ctx) return;
    if (this.song === name) return;
    this.song = name;
    clearInterval(this.seqTimer);
    if (!name) return;
    const S = this.SONGS[name];
    const step = 60 / S.bpm / 4; // semicorchea
    // partitura: lista de compases con su acorde y el motivo que toca
    const bars = [];
    for (const sec of S.sections) for (let r = 0; r < sec.reps; r++) sec.chords.forEach((ch, i) => bars.push({ ch, motif: sec.motif, half: i % 2 }));
    let pos = 0; // semicorchea absoluta
    let next = this.ctx.currentTime + 0.1;
    const total = bars.length * 16;
    const note = (deg, oct) => {
      const sc = S.scale, n = sc.length;
      const o = Math.floor(deg / n);
      return S.root + oct * 12 + o * 12 + sc[((deg % n) + n) % n];
    };
    const tick = () => {
      if (!this.ctx || this.song !== name) return;
      while (next < this.ctx.currentTime + 0.15) {
        const p = pos % total, bar = bars[Math.floor(p / 16)], s = p % 16;
        const swing = S.swing && s % 2 ? step * S.swing : 0;
        this.playStep(S, bar, s, next + swing, step, note);
        pos++;
        next += step;
      }
    };
    this.seqTimer = setInterval(tick, 30);
    tick();
  },

  playStep(S, bar, s, t, step, note) {
    const out = this.musicBus, c = this.ctx;
    const at = (fn) => fn(Math.max(0, t - c.currentTime));
    // melodía: el motivo dura 2 compases; cada nota se coloca sobre el acorde del compás
    const m = S.motifs[bar.motif][bar.half * 16 + s];
    if (m) at((d) => this.tone(this.midi(note(bar.ch + m[0], 1)), m[1] * step * 0.95, { type: S.lead, vol: S.leadVol, delay: d, attack: 0.01, vib: m[1] >= 4 ? 5.5 : 0, vibAmt: 4, out }));
    // bajo
    const root = note(bar.ch, -1);
    if (S.bass === 'walk' && s % 4 === 0) at((d) => this.tone(this.midi(root + [0, 7, 12, 7][s / 4]), step * 3.6, { type: 'triangle', vol: 0.13, delay: d, out }));
    if (S.bass === 'drive' && s % 2 === 0) at((d) => this.tone(this.midi(root + (s % 8 === 6 ? 12 : 0)), step * 1.8, { type: 'triangle', vol: 0.13, delay: d, out }));
    if (S.bass === 'pulse' && [0, 3, 6, 10, 12].includes(s)) at((d) => this.tone(this.midi(root), step * 2.5, { type: 'triangle', vol: 0.14, delay: d, out }));
    // arpegio suave del acorde
    if (S.arp && s % 2 === 1) {
      const tones = [0, 2, 4, 7];
      at((d) => this.tone(this.midi(note(bar.ch + tones[(s >> 1) % 4], 0) + 12), step * 1.4, { type: 'square', vol: 0.018, delay: d, out }));
    }
    // batería
    const D = S.drums;
    if (D.k[s] === 'x') at((d) => this.tone(150, 0.14, { to: 45, type: 'sine', vol: 0.32, delay: d, out }));
    if (D.s[s] === 'x') at((d) => this.noise(0.12, { filter: 'bandpass', freq: 1800, q: 0.8, vol: 0.14, delay: d, out }));
    if (D.h[s] === 'x') at((d) => this.noise(0.035, { filter: 'highpass', freq: 7500, vol: 0.06, delay: d, out }));
  },

  // fanfarria corta (victoria / derrota)
  jingle(name) {
    if (!this.ctx) return;
    const J = this.JINGLES[name], beat = 60 / J.bpm / 2;
    let t = 0;
    for (const [n, len] of J.notes) {
      this.tone(this.midi(n), len * beat * 0.95, { type: 'square', vol: 0.12, delay: t, vib: len > 2 ? 5 : 0, vibAmt: 5 });
      this.tone(this.midi(n - 12), len * beat * 0.9, { type: 'triangle', vol: 0.08, delay: t });
      t += len * beat;
    }
    J.bass.forEach((n, i) => this.tone(this.midi(n), beat * 3, { type: 'triangle', vol: 0.12, delay: i * beat * 2 }));
  },
};

// Los navegadores no dejan sonar nada hasta que el jugador toca la pantalla: se activa en el primer toque.
(function () {
  const start = () => {
    PB.Audio.init();
    window.removeEventListener('pointerdown', start);
    window.removeEventListener('keydown', start);
  };
  window.addEventListener('pointerdown', start);
  window.addEventListener('keydown', start);
})();
