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
    // mando: botones del fotograma anterior (para saber cuándo se acaba de pulsar uno)
    this.padPrev = [];
    this.padOn = false;
    window.addEventListener('gamepadconnected', () => { if (PB.Lobby && PB.Lobby.toast) PB.Lobby.toast(PB.T('🎮 Mando conectado')); });

    window.addEventListener('keydown', (e) => {
      if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return; // escribiendo en el chat
      const k = e.key.toLowerCase();
      if (this.enabled && [' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) e.preventDefault();
      if (k === 'e' && !this.keys.has('e')) this.superKeyHeld = true;
      // PC: con E pulsada, X cancela el súper
      if (k === 'x' && this.superKeyHeld) { this.superKeyHeld = false; this.superCancelled = performance.now(); }
      if (k === ' ' && !this.keys.has(' ')) this.pending.attack = { auto: true };
      if (k === 'q' && !this.keys.has('q')) this.pending.super = { auto: true };
      if (k === 'f' && !this.keys.has('f')) this.megaPending = true;
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
    // Red de seguridad: a veces el móvil no avisa de que levantas el dedo (gestos del sistema,
    // notificaciones...). Si ya no hay ningún dedo cerca de un joystick, se suelta.
    const prune = (e) => {
      const ts = [...e.touches];
      for (const name of ['move', 'attack', 'super']) {
        const s = this.sticks[name];
        if (!s) continue;
        const f = s.raw || s.pos; // donde está el dedo (pos se queda dentro del círculo del joystick)
        const near = ts.some((t) => Math.hypot(t.clientX - f.x, t.clientY - f.y) < 90);
        if (!near) this.sticks[name] = null;
      }
    };
    window.addEventListener('touchend', prune, { passive: true });
    window.addEventListener('touchcancel', prune, { passive: true });
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.sticks = { move: null, attack: null, super: null }; });
  }

  // Posición y tamaño de los joysticks (según los ajustes: tamaño y modo zurdo)
  layout(W, H) {
    const k = { 'pequeño': 0.82, mediano: 1, grande: 1.2 }[PB.Settings.get('joySize')] || 1;
    const r = Math.min(70, Math.max(48, Math.min(W, H) * 0.11)) * k;
    const left = PB.Settings.get('leftHanded');
    const S = PB.safe ? PB.safe() : { l: 0, r: 0, b: 0 };
    const near = r + 40 + S.l, far = W - r - 40 - S.r;
    const atkX = left ? near : far, moveX = left ? far : near;
    const dir = left ? 1 : -1; // el súper va hacia el centro de la pantalla
    return {
      r,
      sr: r * 0.7,
      left,
      move: { x: moveX, y: H - r - 40 },
      attack: { x: atkX, y: H - r - 40 },
      super: { x: atkX + dir * r * 1.7, y: H - r - 40 - r * 1.5 },
      mega: { x: atkX + dir * r * 3.15, y: H - r - 40 - r * 0.4 }, // (separado del súper: antes se tocaban y al pulsar el súper saltaba la mega)
      mr: r * 0.5,
    };
  }

  down(e) {
    if (e.pointerType === 'mouse') {
      this.touch = false;
      this.mouse.x = e.clientX;
      this.mouse.y = e.clientY;
      // el clic cuenta como pulsación aunque sea tan rápido que no dure ni un fotograma
      if (e.button === 0) { this.mouse.left = true; this.pending.attack = 'mouse'; }
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
    // si el joystick ya tenía un dedo (o el móvil no avisó de que lo levantaste), el dedo nuevo lo
    // sustituye: el anterior cuenta como soltado y así nunca se queda bloqueado
    const take = (name) => {
      if (this.sticks[name]) this.release(name, this.sticks[name], L);
      this.sticks[name] = s;
    };
    // megaevolución: botón que solo se pulsa (sin apuntar). Si el dedo cae entre los dos botones, gana el más cercano
    const dMega = Math.hypot(p.x - L.mega.x, p.y - L.mega.y) / (L.mr * 1.3), dSuper = Math.hypot(p.x - L.super.x, p.y - L.super.y) / (L.sr * 1.4);
    if (this.megaShown && dMega < 1 && dMega < dSuper) {
      this.megaPending = true;
      return;
    }
    if (Math.hypot(p.x - L.super.x, p.y - L.super.y) < L.sr * 1.4) {
      s.origin = { ...L.super };
      s.pos = { ...p };
      take('super');
    } else if ((p.x < window.innerWidth / 2) !== L.left) {
      take('move');
    } else {
      take('attack');
    }
  }

  move(e) {
    if (e.pointerType === 'mouse') {
      this.mouse.x = e.clientX;
      this.mouse.y = e.clientY;
      return;
    }
    for (const s of Object.values(this.sticks)) {
      if (s && s.id === e.pointerId) { s.pos = { x: e.clientX, y: e.clientY }; s.raw = { x: e.clientX, y: e.clientY }; }
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
      if (!cancel) this.release(name, s, L);
    }
  }

  // Soltar un joystick: el de ataque o el de súper disparan
  release(name, s, L) {
    this.sticks[name] = null;
    if (name === 'move') return;
    const v = this.stickVec(s, name === 'super' ? L.sr : L.r);
    // súper: si lo arrastraste y lo devuelves al centro antes de soltar, se cancela
    if (name === 'super' && (s.maxLen || 0) >= 0.5 && v.len < 0.3) { this.superCancelled = performance.now(); return; }
    // toque rápido o casi sin arrastrar = disparo automático al enemigo más cercano
    const quick = performance.now() - s.t0 < 220;
    if (v.len < 0.35 || (quick && v.len < 0.7)) this.pending[name] = PB.Settings.get('autoAim') ? { auto: true } : { facing: true };
    else this.pending[name] = { dx: v.x, dy: v.y, frac: v.len };
  }

  stickVec(s, r) {
    const dx = s.pos.x - s.origin.x, dy = s.pos.y - s.origin.y;
    const d = Math.hypot(dx, dy);
    if (d > r) {
      s.pos = { x: s.origin.x + (dx / d) * r, y: s.origin.y + (dy / d) * r };
    }
    return { x: d ? dx / d : 0, y: d ? dy / d : 0, len: Math.min(1, d / r) };
  }

  // Mando (distribución estándar de Xbox / PlayStation):
  //   stick izquierdo o cruceta: moverse · stick derecho: apuntar
  //   RT, RB, A (✕) o X (□): atacar (mantener = seguido) · LT, LB, B (○) o Y (△): súper · Start: pausa
  //   En los menús: A = jugar / volver a jugar / aceptar · B = atrás
  pollPad() {
    const pads = navigator.getGamepads ? [...navigator.getGamepads()].filter((g) => g && g.connected) : [];
    const gp = pads[0];
    if (!gp) { this.pad = null; return null; }
    const now = gp.buttons.map((b) => !!(b && (b.pressed || b.value > 0.5)));
    const prev = this.padPrev;
    this.padPrev = now;
    const down = (i) => now[i] && !prev[i];
    const dz = (x, y) => {
      const l = Math.hypot(x, y);
      return l < 0.22 ? { x: 0, y: 0, len: 0 } : { x: x / l, y: y / l, len: Math.min(1, (l - 0.22) / 0.78) };
    };
    const L = dz(gp.axes[0] || 0, gp.axes[1] || 0), R = dz(gp.axes[2] || 0, gp.axes[3] || 0);
    const dx = (now[15] ? 1 : 0) - (now[14] ? 1 : 0), dy = (now[13] ? 1 : 0) - (now[12] ? 1 : 0);
    if (now.some(Boolean) || L.len || R.len) {
      // en cuanto se usa el mando, fuera los joysticks táctiles y la ayuda del mando
      this.padOn = true;
      this.touch = false;
      document.body.classList.add('pad');
    }
    this.pad = { L, R, dx, dy, now, down, gp };
    this.padMenus();
    return this.pad;
  }

  // Menús con mando: las flechas (o el stick) mueven una selección por los botones de la ventana
  // que esté delante, ✕ pulsa el seleccionado y ○ vuelve atrás o cierra.
  padLayer() {
    const vis = (e) => e && !e.classList.contains('hidden') && e.offsetParent !== null;
    // primero las ventanas que van por encima (aviso, nota de parche, chat...), luego la pantalla
    for (const sel of ['#modal', '#pview', '#patch', '#about', '#feedback', '#gchat']) { const e = document.querySelector(sel); if (vis(e) || (e && !e.classList.contains('hidden') && sel === '#modal')) return e; }
    return document.querySelector('.screen:not(.hidden)');
  }
  padItems(layer) {
    const sel = 'button, a[href], input, select, textarea, .card, .mode-card2, #lb-hero, [data-k], [data-t], [data-v]';
    return [...layer.querySelectorAll(sel)].filter((e) => {
      if (e.disabled || e.closest('.hidden')) return false;
      const r = e.getBoundingClientRect();
      return r.width > 4 && r.height > 4 && getComputedStyle(e).visibility !== 'hidden';
    });
  }
  padFocusOn(e) {
    if (this.padFocus) this.padFocus.classList.remove('pad-focus');
    this.padFocus = e;
    if (!e) return;
    e.classList.add('pad-focus');
    e.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
  padMove(dx, dy, layer) {
    const items = this.padItems(layer);
    if (!items.length) return;
    const cur = this.padFocus && items.includes(this.padFocus) ? this.padFocus : null;
    if (!cur) {
      // al entrar en una ventana: el botón principal si lo hay (¡JUGAR!, Reanudar...), si no, el primero
      const main = items.find((e) => /^(play|pz-resume|again|patch-ok|modal-ok|nm-go|sp-go|chest-again)$/.test(e.id));
      const chosen = items.find((e) => e.classList.contains('sel'));
      return this.padFocusOn(main || chosen || items.find((e) => !e.classList.contains('back')) || items[0]);
    }
    const c = cur.getBoundingClientRect(), cx = c.left + c.width / 2, cy = c.top + c.height / 2;
    let best = null, bs = Infinity;
    for (const e of items) {
      if (e === cur || cur.contains(e) || e.contains(cur)) continue;
      const r = e.getBoundingClientRect(), ex = r.left + r.width / 2, ey = r.top + r.height / 2;
      const along = (ex - cx) * dx + (ey - cy) * dy; // cuánto avanza en la dirección pedida
      if (along <= 4) continue;
      const side = Math.abs((ex - cx) * dy) + Math.abs((ey - cy) * dx); // cuánto se desvía
      const sc = along + side * 2.2;
      if (sc < bs) { bs = sc; best = e; }
    }
    if (best) { this.padFocusOn(best); if (PB.Audio) PB.Audio.play('tick'); }
  }
  padMenus() {
    const P = this.pad, vis = (s) => { const e = document.querySelector(s); return e && !e.classList.contains('hidden'); };
    const click = (s) => { const e = document.querySelector(s); if (e && !e.disabled) e.click(); };
    const A = P.down(0), B = P.down(1), start = P.down(9);
    const inMenu = !this.enabled;
    // en partida solo Start (pausa)
    if (!inMenu) {
      if (this.padFocus) this.padFocusOn(null);
      if (start) click('#btn-pause');
      return;
    }
    const layer = this.padLayer();
    if (!layer) return;
    if (this.padFocus && !layer.contains(this.padFocus)) this.padFocusOn(null);
    // dirección: cruceta o stick izquierdo, con repetición si se mantiene
    let dx = P.dx, dy = P.dy;
    if (!dx && !dy && P.L.len > 0.55) { if (Math.abs(P.L.x) > Math.abs(P.L.y)) dx = Math.sign(P.L.x); else dy = Math.sign(P.L.y); }
    const dir = dx || dy ? dx + ',' + dy : '';
    const t = performance.now();
    if (dir && (dir !== this.padDir || t >= this.padRepeat)) {
      this.padRepeat = t + (dir !== this.padDir ? 380 : 140);
      this.padMove(dx, dy, layer);
    }
    this.padDir = dir;
    if (!A && !B && !start) return;
    if (A || start) {
      const f = this.padFocus;
      if (f && layer.contains(f)) {
        if (/^(INPUT|TEXTAREA|SELECT)$/.test(f.tagName)) f.focus(); else f.click();
        return;
      }
      // sin nada seleccionado: lo de siempre
      if (vis('#patch')) return click('#patch-ok');
      if (vis('#end')) return click('#again');
      if (vis('#pause')) return click('#pz-resume');
      if (PB.Lobby && PB.Lobby.current === 'lobby' && vis('#lobby') && layer.id === 'lobby') return click('#play');
      return;
    }
    if (B) {
      // atrás: cerrar la ventana de encima o volver de la pantalla
      if (layer.id === 'modal') return click('#modal-cancel');
      if (layer.id === 'patch') return click('#patch-ok');
      if (layer.id === 'gchat') return click('#gc-close');
      if (layer.classList.contains('patch')) { const x = layer.querySelector('.fb-close'); if (x) x.click(); return; }
      if (layer.id === 'end') return click('#back');
      if (layer.id === 'pause') return click('#pz-resume');
      const back = layer.querySelector('.back');
      if (back) back.click();
    }
  }

  // Devuelve el input del jugador y lo necesario para dibujar el apuntado.
  read(game, renderer) {
    const pad = this.pollPad();
    const me = game.player;
    const out = { input: { mx: 0, my: 0, attack: null, super: null }, aim: null };
    if (!me || !this.enabled) {
      this.pending = { attack: null, super: null };
      this.megaPending = false;
      this.megaShown = false;
      return out;
    }
    this.megaShown = !!(game.canMega && game.canMega(me));
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
      if (this.mouse.left) inp.attack = Object.assign({ held: true }, m);
    }

    if (this.pending.attack) inp.attack = fromFrac(this.pending.attack, false);
    if (this.pending.super) inp.super = fromFrac(this.pending.super, true);
    this.pending = { attack: null, super: null };
    if (this.megaPending) inp.mega = true;
    this.megaPending = false;
    // mando
    const usePad = !!(pad && this.padOn);
    if (usePad) {
      const { L, R, dx, dy, now, down } = pad;
      if (L.len) { inp.mx = L.x * Math.min(1, L.len * 1.3); inp.my = L.y * Math.min(1, L.len * 1.3); }
      else if (dx || dy) { const l = Math.hypot(dx, dy); inp.mx = dx / l; inp.my = dy / l; }
      const superHeld = now[6] || now[4] || now[1];
      // apuntado con el stick derecho; sin tocarlo, al rival más cercano (o hacia donde mira)
      const aimOf = (isSuper) => (R.len ? { dx: R.x, dy: R.y, dist: rangeOf(isSuper) * Math.max(0.3, R.len) } : PB.Settings.get('autoAim') ? { auto: true } : { facing: true });
      // la guía solo se ve mientras mueves el stick derecho (no la del ratón, ni por un stick que "baila" un poco)
      out.aim = R.len > 0.12 ? { isSuper: superHeld && me.superCharge >= 1, ang: Math.atan2(R.y, R.x), dist: rangeOf(superHeld) * Math.max(0.3, R.len), strong: true } : null;
      const atkBtn = [7, 5, 0, 2];
      if (atkBtn.some((i) => down(i))) inp.attack = aimOf(false);
      else if (atkBtn.some((i) => now[i])) inp.attack = Object.assign({ held: true }, aimOf(false));
      if ([6, 4, 1].some((i) => down(i))) inp.super = aimOf(true);
      if (down(3)) inp.mega = true; // △ / Y: megaevolución
    }
    // vista girada (equipo rojo): arriba en pantalla es abajo en el mapa
    // (el ratón ya se pasa al mapa con la vista girada; los joysticks y el teclado, no)
    if (renderer.flip) {
      inp.mx = -inp.mx;
      inp.my = -inp.my;
      if (this.touch || usePad) {
        for (const k of ['attack', 'super']) if (inp[k] && inp[k].dx !== undefined) inp[k] = Object.assign({}, inp[k], { dx: -inp[k].dx, dy: -inp[k].dy });
        if (out.aim && !out.aim.cancel) out.aim.ang += Math.PI;
      }
    }
    return out;
  }

  mouseAim(me, renderer) {
    const w = renderer.toWorld(this.mouse.x, this.mouse.y);
    const dx = w.x - me.x, dy = w.y - me.y, d = Math.hypot(dx, dy) || 1;
    return { dx: dx / d, dy: dy / d, dist: d };
  }
};
