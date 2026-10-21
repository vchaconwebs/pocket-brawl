// Controles: teclado + ratón en PC, dos joysticks táctiles en móvil.
PB.Input = class {
  constructor(canvas) {
    this.cv = canvas;
    this.keys = new Set();
    this.mouse = { x: 0, y: 0, left: false };
    this.pending = { attack: null, super: null };
    this.superKeyHeld = false;
    this.touch = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
    this.sticks = { move: null, attack: null, super: null };
    this.enabled = false;

    window.addEventListener('keydown', (e) => {
      const k = e.key.toLowerCase();
      if (this.enabled && [' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) e.preventDefault();
      if (k === 'e' && !this.keys.has('e')) this.superKeyHeld = true;
      // PC: con E pulsada, X cancela el súper
      if (k === 'x' && this.superKeyHeld) { this.superKeyHeld = false; this.superCancelled = performance.now(); }
      if (k === ' ' && !this.keys.has(' ')) this.pending.attack = { auto: true };
      if (k === 'q' && !this.keys.has('q')) this.pending.super = { auto: true };
      this.keys.add(k);
    });
    window.addEventListener('keyup', (e) => {
      const k = e.key.toLowerCase();
      this.keys.delete(k);
      if (k === 'e' && this.superKeyHeld) {
        this.superKeyHeld = false;
        this.pending.super = 'mouse';
      }
    });
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.mouse.left = false;
      this.sticks = { move: null, attack: null, super: null };
    });

    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('pointerdown', (e) => this.down(e));
    window.addEventListener('pointermove', (e) => this.move(e));
    window.addEventListener('pointerup', (e) => this.up(e));
    window.addEventListener('pointercancel', (e) => this.up(e, true));
  }

  // Posición y tamaño de los joysticks (según los ajustes: tamaño y modo zurdo)
  layout(W, H) {
    const k = { 'pequeño': 0.82, mediano: 1, grande: 1.2 }[PB.Settings.get('joySize')] || 1;
    const r = Math.min(70, Math.max(48, Math.min(W, H) * 0.11)) * k;
    const left = PB.Settings.get('leftHanded');
    const near = r + 40, far = W - r - 40;
    const atkX = left ? near : far, moveX = left ? far : near;
    const dir = left ? 1 : -1; // el súper va hacia el centro de la pantalla
    return {
      r,
      sr: r * 0.7,
      left,
      move: { x: moveX, y: H - r - 40 },
      attack: { x: atkX, y: H - r - 40 },
      super: { x: atkX + dir * r * 1.7, y: H - r - 40 - r * 1.5 },
    };
  }

  down(e) {
    if (e.pointerType === 'mouse') {
      this.touch = false;
      this.mouse.x = e.clientX;
      this.mouse.y = e.clientY;
      if (e.button === 0) this.mouse.left = true;
      // clic derecho: lanza el súper; si estabas apuntándolo con E, lo cancela
      if (e.button === 2) {
        if (this.superKeyHeld) { this.superKeyHeld = false; this.superCancelled = performance.now(); }
        else this.pending.super = 'mouse';
      }
      return;
    }
    e.preventDefault();
    this.touch = true;
    const L = this.layout(window.innerWidth, window.innerHeight);
    const p = { x: e.clientX, y: e.clientY };
    const s = { id: e.pointerId, origin: p, pos: { ...p }, t0: performance.now() };
    if (Math.hypot(p.x - L.super.x, p.y - L.super.y) < L.sr * 1.4 && !this.sticks.super) {
      s.origin = { ...L.super };
      s.pos = { ...p };
      this.sticks.super = s;
    } else if ((p.x < window.innerWidth / 2) !== L.left) {
      if (!this.sticks.move) this.sticks.move = s;
    } else if (!this.sticks.attack) {
      this.sticks.attack = s;
    }
  }

  move(e) {
    if (e.pointerType === 'mouse') {
      this.mouse.x = e.clientX;
      this.mouse.y = e.clientY;
      return;
    }
    for (const s of Object.values(this.sticks)) {
      if (s && s.id === e.pointerId) s.pos = { x: e.clientX, y: e.clientY };
    }
  }

  up(e, cancel) {
    if (e.pointerType === 'mouse') {
      if (e.button === 0) this.mouse.left = false;
      return;
    }
    const L = this.layout(window.innerWidth, window.innerHeight);
    for (const name of ['move', 'attack', 'super']) {
      const s = this.sticks[name];
      if (!s || s.id !== e.pointerId) continue;
      this.sticks[name] = null;
      if (name === 'move' || cancel) continue;
      const v = this.stickVec(s, name === 'super' ? L.sr : L.r);
      // súper: si lo arrastraste y lo devuelves al centro antes de soltar, se cancela
      if (name === 'super' && (s.maxLen || 0) >= 0.5 && v.len < 0.3) { this.superCancelled = performance.now(); continue; }
      // toque rápido o casi sin arrastrar = disparo automático al enemigo más cercano
      const quick = performance.now() - s.t0 < 220;
      if (v.len < 0.35 || (quick && v.len < 0.7)) this.pending[name] = PB.Settings.get('autoAim') ? { auto: true } : { facing: true };
      else this.pending[name] = { dx: v.x, dy: v.y, frac: v.len };
    }
  }

  stickVec(s, r) {
    const dx = s.pos.x - s.origin.x, dy = s.pos.y - s.origin.y;
    const d = Math.hypot(dx, dy);
    if (d > r) {
      s.pos = { x: s.origin.x + (dx / d) * r, y: s.origin.y + (dy / d) * r };
    }
    return { x: d ? dx / d : 0, y: d ? dy / d : 0, len: Math.min(1, d / r) };
  }

  // Devuelve el input del jugador y lo necesario para dibujar el apuntado.
  read(game, renderer) {
    const me = game.player;
    const out = { input: { mx: 0, my: 0, attack: null, super: null }, aim: null };
    if (!me || !this.enabled) {
      this.pending = { attack: null, super: null };
      return out;
    }
    const inp = out.input;
    const L = this.layout(renderer.cw, renderer.ch);
    const rangeOf = (isSuper) => {
      const a = isSuper ? me.def.super : me.def.attack;
      return a.range || a.radius || 400;
    };
    const fromFrac = (p, isSuper) => {
      if (!p || p.auto || p.facing) return p;
      if (p === 'mouse') return this.mouseAim(me, renderer);
      return { dx: p.dx, dy: p.dy, dist: rangeOf(isSuper) * Math.max(0.15, p.frac) };
    };

    if (this.touch) {
      if (this.sticks.move) {
        const v = this.stickVec(this.sticks.move, L.r);
        if (v.len > 0.15) { inp.mx = v.x * Math.min(1, v.len * 1.4); inp.my = v.y * Math.min(1, v.len * 1.4); }
      }
      for (const name of ['super', 'attack']) {
        const s = this.sticks[name];
        if (!s) continue;
        const v = this.stickVec(s, name === 'super' ? L.sr : L.r);
        s.maxLen = Math.max(s.maxLen || 0, v.len);
        if (name === 'super' && s.maxLen >= 0.5 && v.len < 0.3) {
          out.aim = { isSuper: true, cancel: true, ang: 0, dist: 0 };
          break;
        }
        if (v.len >= 0.2) {
          out.aim = { isSuper: name === 'super', ang: Math.atan2(v.y, v.x), dist: rangeOf(name === 'super') * v.len, strong: true };
          break;
        }
      }
    } else {
      const k = this.keys;
      inp.mx = (k.has('d') || k.has('arrowright') ? 1 : 0) - (k.has('a') || k.has('arrowleft') ? 1 : 0);
      inp.my = (k.has('s') || k.has('arrowdown') ? 1 : 0) - (k.has('w') || k.has('arrowup') ? 1 : 0);
      const m = this.mouseAim(me, renderer);
      const showSuper = this.superKeyHeld && me.superCharge >= 1;
      if (PB.Settings.get('aimGuide') || this.mouse.left || showSuper) out.aim = { isSuper: showSuper, ang: Math.atan2(m.dy, m.dx), dist: m.dist, strong: this.mouse.left || showSuper };
      if (this.mouse.left) inp.attack = m;
    }

    if (this.pending.attack) inp.attack = fromFrac(this.pending.attack, false);
    if (this.pending.super) inp.super = fromFrac(this.pending.super, true);
    this.pending = { attack: null, super: null };
    return out;
  }

  mouseAim(me, renderer) {
    const w = renderer.toWorld(this.mouse.x, this.mouse.y);
    const dx = w.x - me.x, dy = w.y - me.y, d = Math.hypot(dx, dy) || 1;
    return { dx: dx / d, dy: dy / d, dist: d };
  }
};
