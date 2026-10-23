// Dibujado en Canvas 2D.
PB.Renderer = class {
  constructor(canvas) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d');
    this.cam = { x: 0, y: 0, scale: 1 };
    this.floor = null;
    this.floorFor = null;
    this.banner = null; // { text, sub, color, t, life }
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.dpr = dpr;
    this.cw = window.innerWidth;
    this.ch = window.innerHeight;
    const sf = PB.safe ? PB.safe() : { r: 0 };
    this.safeR = sf.r;
    this.cv.width = Math.round(this.cw * dpr);
    this.cv.height = Math.round(this.ch * dpr);
    this.cv.style.width = this.cw + 'px';
    this.cv.style.height = this.ch + 'px';
    // cuánto mundo se ve: ~1050x720 en PC, menos en móvil horizontal para que no se vea todo diminuto
    const portrait = this.ch > this.cw;
    const touch = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
    let vw = 1100, vh = 760;
    if (portrait) { vw = 520; vh = 1000; }
    else if (touch) { vw = 900; vh = 580; }
    this.cam.scale = Math.min(this.cw / vw, this.ch / vh);
  }

  toWorld(sx, sy) {
    const c = this.cam, k = this.flip ? -1 : 1;
    return { x: (k * (sx - this.cw / 2)) / c.scale + c.x, y: (k * (sy - this.ch / 2)) / c.scale + c.y };
  }

  // Vista girada 180° (si juegas en el equipo rojo, tu base queda abajo, como en Brawl Stars).
  // Lo que tiene "altura" (Pokémon, árboles, textos) se dibuja derecho alrededor de su punto de apoyo.
  up(x, y, fn) {
    if (!this.flip) return fn();
    const c = this.ctx;
    c.save();
    c.translate(x, y);
    c.rotate(Math.PI);
    c.translate(-x, -y);
    fn();
    c.restore();
  }
  // igual, pero además el Pokémon mira hacia donde se mueve en pantalla
  upFacing(o, fn) {
    if (!this.flip) return fn();
    const f = o.facing;
    o.facing = f + Math.PI;
    this.up(o.x, o.y, fn);
    o.facing = f;
  }

  // súper lanzada cerca: destello del color del tipo en los bordes
  superFx(type, mine) {
    const P = PB.VFX.PAL[type] || PB.VFX.PAL.normal;
    this.sfx = { t0: performance.now(), color: P[3], mine: !!mine };
  }

  announce(text, color, sub, life) {
    this.banner = { text: PB.T(text), color: color || '#ffffff', sub: sub ? PB.T(sub) : '', t: 0, life: life || 1.4 };
  }

  // Suelo pintado en pixel art (PB.Tiles) y escalado ×4 una sola vez por mapa.
  // Rocas, árboles y hierba alta se dibujan aparte porque cambian (se rompen, se mueven).
  buildFloor(world, flip) {
    const art = PB.Tiles.floor(world, flip);
    const cv = document.createElement('canvas');
    cv.width = world.pixelW;
    cv.height = world.pixelH;
    const c = cv.getContext('2d');
    c.imageSmoothingEnabled = false;
    c.drawImage(art, 0, 0, cv.width, cv.height);
    this.floor = cv;
    this.floorFor = world;
    this.floorFlip = flip;
  }

  draw(game, view) {
    this.game = game;
    this.low = PB.Settings.get('quality') === 'baja';
    const ctx = this.ctx, T = PB.TILE, W = game.world;
    const flip = (this.flip = !!view.flip);
    if (this.floorFor !== W || !this.floor || this.floorFlip !== flip) this.buildFloor(W, flip);
    const focus = view.focus;
    const team = view.team;
    const t = game.clock;
    const fk = flip ? -1 : 1;

    // cámara (con controles táctiles en vertical, el jugador más arriba para que no lo tapen los joysticks)
    const lift = view.touch && this.ch > this.cw ? 150 : 0;
    if (focus) {
      this.cam.x += (focus.x - this.cam.x) * 0.15;
      this.cam.y += (focus.y + fk * (lift || -60) - this.cam.y) * 0.15;
    }
    const halfW = this.cw / 2 / this.cam.scale, halfH = this.ch / 2 / this.cam.scale;
    this.cam.x = W.pixelW < halfW * 2 ? W.pixelW / 2 : Math.max(halfW - 60, Math.min(W.pixelW - halfW + 60, this.cam.x));
    const mTop = 150, mBot = 80 + (lift ? lift + 60 : 0);
    this.cam.y = Math.max(halfH - (flip ? mBot : mTop), Math.min(W.pixelH - halfH + (flip ? mTop : mBot), this.cam.y));

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#2c5a3a';
    ctx.fillRect(0, 0, this.cv.width, this.cv.height);
    let sfxK = -1;
    if (this.sfx) {
      sfxK = (performance.now() - this.sfx.t0) / 380;
      if (sfxK >= 1) this.sfx = null;
    }
    const sc = this.cam.scale;
    const s = sc * this.dpr;
    const sk = PB.Settings.get('shake') ? game.shake : 0;
    const shx = (Math.random() - 0.5) * sk, shy = (Math.random() - 0.5) * sk;
    ctx.setTransform(fk * s, 0, 0, fk * s, (this.cw / 2 - fk * this.cam.x * sc + shx) * this.dpr, (this.ch / 2 - fk * this.cam.y * sc + shy) * this.dpr);
    ctx.imageSmoothingEnabled = false;

    const vx0 = this.cam.x - halfW - T, vx1 = this.cam.x + halfW + T;
    const vy0 = this.cam.y - halfH - T * 2, vy1 = this.cam.y + halfH + T;
    const c0 = Math.max(-1, Math.floor(vx0 / T)), c1 = Math.min(W.w, Math.ceil(vx1 / T));
    const r0 = Math.max(-1, Math.floor(vy0 / T)), r1 = Math.min(W.h, Math.ceil(vy1 / T));
    const inView = (x, y, m) => x > vx0 - m && x < vx1 + m && y > vy0 - m && y < vy1 + m;

    // bosque de fuera del mapa
    for (let r = r0 - 1; r <= r1; r++) for (let c = c0 - 1; c <= c1; c++) {
      if (c >= 0 && r >= 0 && c < W.w && r < W.h) continue;
      PB.Tiles.draw(ctx, PB.Tiles.outsideFloor(c, r, W.theme), c * T, r * T);
    }
    ctx.drawImage(this.floor, 0, 0);

    // brillo del agua
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    for (let r = r0; r < r1; r++) for (let c = c0; c < c1; c++) {
      if (W.tile(c, r) !== '~') continue;
      const ph = (t * 0.8 + PB.Tiles.H(c, r, 5) * 10) % 3;
      if (ph < 1) {
        const gx = c * T + 16 + Math.floor(PB.Tiles.H(c, r, 6) * 8) * 4, gy = r * T + 20 + Math.floor(PB.Tiles.H(c, r, 7) * 6) * 4;
        const w = ph < 0.5 ? 12 : 4;
        ctx.fillRect(gx - w / 2 + 8, gy, w, 4);
      }
    }

    // botón de la plataforma central que se ilumina al soltar una Pokéball
    if (W.hasMine) {
      const m = W.mine;
      const glow = 0.25 + Math.sin(t * 3) * 0.15 + game.padGlow;
      ctx.fillStyle = `rgba(255,250,200,${Math.min(1, glow)})`;
      ctx.fillRect(m.x - 8, m.y - 8, 16, 16);
      ctx.fillRect(m.x - 4, m.y - 12, 8, 24);
      ctx.fillRect(m.x - 12, m.y - 4, 24, 8);
      if (game.padGlow > 0) this.glow(m.x, m.y, 70 * game.padGlow + 20, 'rgba(255,255,220,0.8)');
    }

    // zona de Territorio
    if (game.zone) this.drawHotZone(game.zone, t, team);

    // grietas del suelo (Magnitud)
    for (const f of game.fx) if (f.kind === 'crack') this.drawCrack(f);

    // zonas (Drenadoras)
    for (const z of game.zones) this.drawZone(z, t, team);
    // trampas y orbes de los súper
    for (const m of game.mines) this.drawMine(m, t, team);
    for (const tu of game.turrets) this.up(tu.x, tu.y, () => this.drawTurret(tu, t));

    // indicador de apuntado (debajo de los personajes)
    if (view.aim && !view.aim.cancel && focus && !focus.dead && game.started) this.drawAim(focus, view.aim);

    // objetos ordenados por Y
    const items = [];
    for (let r = r0 - 1; r <= r1 + 1; r++) for (let c = c0 - 1; c <= c1; c++) {
      const tt = W.tile(c, r);
      if (tt === '#' || tt === 'T' || tt === 'C' || tt === 'F' || tt === 'W') items.push({ k: 'wall', y: r * T + T, c, r, tt });
      else if (tt === 'X' && PB.Tiles.H(c, r, 9) < 0.85) items.push({ k: 'wall', y: r * T + T, c, r, tt: 'B' });
    }
    for (const b of game.brawlers) {
      if (b.dead || !game.visibleTo(b, team)) continue;
      items.push({ k: 'b', y: b.y, b });
    }
    for (const g of game.balls) if (inView(g.x, g.y, 40)) items.push({ k: 'ball', y: g.y, g });
    for (const st of game.structures) items.push({ k: 'struct', y: st.y, st });
    if (game.voltorb) {
      items.push({ k: 'voltorb', y: game.voltorb.y + 1, v: game.voltorb });
      for (const tm of ['red', 'blue']) {
        const R = W.goalRect(tm);
        if (R) items.push({ k: 'goal', y: R.y0 < W.pixelH / 2 ? R.y1 : R.y0, tm });
      }
    }
    for (const f of game.fx) {
      if (f.kind === 'faint' || f.kind === 'release' || f.kind === 'ghost') items.push({ k: f.kind, y: f.y, f });
    }
    items.sort((a, b) => fk * (a.y - b.y));
    for (const it of items) {
      if (it.k === 'wall') this.up(it.c * T + T / 2, it.r * T + T / 2, () => this.drawWall(it.c, it.r, it.tt));
      else if (it.k === 'ball') this.up(it.g.x, it.g.y, () => this.drawBall(it.g));
      else if (it.k === 'b') this.upFacing(it.b, () => this.drawBrawler(it.b, game, team));
      else if (it.k === 'faint') this.upFacing(it.f, () => this.drawFaint(it.f));
      else if (it.k === 'release') this.up(it.f.x, it.f.y, () => this.drawRelease(it.f));
      else if (it.k === 'ghost') this.upFacing(it.f, () => this.drawGhost(it.f));
      else if (it.k === 'struct') this.up(it.st.x, it.st.y, () => this.drawSnorlax(it.st, game, team));
      else if (it.k === 'voltorb') this.up(it.v.x, it.v.y, () => this.drawVoltorb(it.v, game));
      else if (it.k === 'goal') {
        const Rg = W.goalRect(it.tm);
        this.up((Rg.x0 + Rg.x1) / 2, (Rg.y0 + Rg.y1) / 2, () => this.drawGoal(W, it.tm, team));
      }
    }

    // proyectiles
    for (const p of game.projectiles) if (inView(p.x, p.y, 80)) this.drawShot(p, t);
    // rayos de los súper
    for (const f of game.fx) {
      if (f.kind === 'chain') this.drawChain(f);
      else if (f.kind === 'beam') this.drawBeam(f);
      else if (f.kind === 'beamCharge') this.drawBeamCharge(f);
      else if (f.kind === 'slash') this.drawSlash(f);
    }

    // arbustos (por encima)
    for (let r = r0; r < r1; r++) for (let c = c0; c < c1; c++) {
      if (W.tile(c, r) !== 'b') continue;
      const cx = c * T + T / 2, cy = r * T + T / 2;
      const near = focus && !focus.dead && Math.hypot(focus.x - cx, focus.y - cy) < 110;
      let rustle = false;
      for (const b of game.brawlers) {
        if (!b.dead && b.moving && Math.abs(b.x - cx) < 40 && Math.abs(b.y - cy) < 40) rustle = true;
      }
      this.up(cx, cy, () => this.drawBush(c, r, near ? 0.5 : 1, t, rustle));
    }
    // aliados dentro de arbustos se ven en semitransparente
    for (const b of game.brawlers) {
      if (b.dead || b.team !== team || !game.inBush(b)) continue;
      ctx.globalAlpha = 0.5;
      this.upFacing(b, () => this.drawBrawler(b, game, team, true));
      ctx.globalAlpha = 1;
    }

    // niebla venenosa (Niebla Tóxica)
    if (game.gas) this.drawGas(game.gas, t, W);

    // efectos
    for (const f of game.fx) {
      if (!inView(f.x, f.y, 120)) continue;
      const k = f.t / f.life;
      switch (f.kind) {
        case 'px': {
          const sz = f.size * (1 + (f.grow || 0) * k);
          ctx.globalAlpha = Math.min(1, (1 - k) * 1.4);
          ctx.fillStyle = f.color;
          if (sz > 10) {
            // nubes de polvo: redondas
            ctx.globalAlpha *= 0.7;
            ctx.beginPath();
            ctx.arc(f.x, f.y - f.z, sz / 2, 0, Math.PI * 2);
            ctx.fill();
          } else {
            ctx.fillRect(Math.round(f.x - sz / 2), Math.round(f.y - f.z - sz / 2), Math.round(sz), Math.round(sz));
          }
          break;
        }
        case 'vfx': {
          const fr = Math.floor(f.t * f.frameRate);
          if (f.z > 0 || f.vz) {
            ctx.globalAlpha = 0.25;
            ctx.fillStyle = '#000';
            ctx.beginPath();
            ctx.ellipse(f.x, f.y, 8 * f.scale, 3 * f.scale, 0, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.globalAlpha = f.fade ? 1 - k : k > 0.7 ? (1 - k) / 0.3 : 1;
          PB.VFX.draw(ctx, f.shape, f.pal, f.x, f.y - f.z, { angle: f.angle, scale: f.scale, frame: fr });
          break;
        }
        case 'ring':
          ctx.globalAlpha = 1 - k;
          ctx.strokeStyle = f.color;
          ctx.lineWidth = f.width * (1 - k * 0.5);
          ctx.beginPath();
          ctx.arc(f.x, f.y, f.r0 + (f.r1 - f.r0) * (1 - (1 - k) * (1 - k)), 0, Math.PI * 2);
          ctx.stroke();
          break;
        case 'flash':
          ctx.globalAlpha = 1 - k;
          this.glow(f.x, f.y, f.r, f.color);
          break;
      }
    }
    ctx.globalAlpha = 1;

    // barras de vida y nombres
    for (const b of game.brawlers) {
      if (b.dead || !game.visibleTo(b, team) || b.spawnT > 0.2) continue;
      this.up(b.x, b.y, () => this.drawOverhead(b, game, team, focus));
    }

    // textos de daño
    ctx.textAlign = 'center';
    for (const f of game.fx) {
      if (f.kind !== 'text') continue;
      if (f.dmg && !PB.Settings.get('dmgNumbers')) continue;
      const k = f.t / f.life;
      // los números de daño saltan un poco y suben mientras se desvanecen
      const pop = f.dmg ? (k < 0.12 ? 0.7 + (k / 0.12) * 0.45 : 1.15 - Math.min(0.15, (k - 0.12) * 0.8)) : k < 0.15 ? 0.6 + (k / 0.15) * 0.7 : 1.3 - Math.min(0.3, (k - 0.15) * 1.5);
      const fy = f.dmg ? f.y - k * 22 : f.y;
      ctx.globalAlpha = 1 - k * k;
      ctx.font = `${Math.round(f.size * pop)}px "Jersey 10", system-ui, sans-serif`;
      ctx.lineWidth = f.dmg ? 4 : 5;
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#000';
      this.up(f.x, fy, () => {
        ctx.strokeText(f.text, f.x, fy);
        ctx.fillStyle = f.color;
        ctx.fillText(f.text, f.x, fy);
      });
    }
    ctx.globalAlpha = 1;

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    // Halloween: noche con los bordes en penumbra morada
    if (game.world.theme === 'halloween') {
      const gr = ctx.createRadialGradient(this.cw / 2, this.ch / 2, Math.min(this.cw, this.ch) * 0.3, this.cw / 2, this.ch / 2, Math.max(this.cw, this.ch) * 0.75);
      gr.addColorStop(0, 'rgba(20,10,40,0)');
      gr.addColorStop(1, 'rgba(20,10,40,0.55)');
      ctx.fillStyle = gr;
      ctx.fillRect(0, 0, this.cw, this.ch);
    }
    // destello de la súper: borde de pantalla del color del tipo
    if (this.sfx && sfxK >= 0) {
      const a = (1 - sfxK) * (this.sfx.mine ? 0.65 : 0.35);
      const gr = ctx.createRadialGradient(this.cw / 2, this.ch / 2, Math.min(this.cw, this.ch) * 0.22, this.cw / 2, this.ch / 2, Math.max(this.cw, this.ch) * 0.7);
      gr.addColorStop(0, 'rgba(0,0,0,0)');
      gr.addColorStop(1, this.hexA(this.sfx.color, a));
      ctx.fillStyle = gr;
      ctx.fillRect(0, 0, this.cw, this.ch);
    }
    if (view.hud !== false) this.drawHud(game, view);
  }

  // Brillo radial aditivo
  glow(x, y, r, color) {
    if (this.low) return;
    const ctx = this.ctx;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    const prev = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
    ctx.globalCompositeOperation = prev;
  }

  hexA(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }

  // Rocas, árboles del mapa y árboles del bosque de fuera (tt = 'B')
  drawWall(c, r, tt) {
    const ctx = this.ctx, T = PB.TILE, x = c * T, y = r * T;
    const v = Math.floor(PB.Tiles.H(c, r, 3) * 4);
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.beginPath();
    ctx.ellipse(x + T / 2 + 4, y + T - 6, tt === '#' || tt === 'W' ? 30 : tt === 'F' ? 32 : 34, tt === 'F' ? 6 : 11, 0, 0, Math.PI * 2);
    ctx.fill();
    const W0 = this.game.world, theme = W0.theme;
    if (tt === '#') PB.Tiles.draw(ctx, PB.Tiles.rock(v, theme), x, y + T - 80);
    else if (tt === 'W') PB.Tiles.draw(ctx, PB.Tiles.barrel(v, theme), x, y + T - (theme === 'halloween' ? 72 : 80));
    else if (tt === 'F') PB.Tiles.draw(ctx, PB.Tiles.fence(W0.tile(c - 1, r) === 'F', W0.tile(c + 1, r) === 'F'), x, y);
    else if (tt === 'C') {
      const W = this.game.world, hp = W.crateHp.get(r * W.w + c) || 0;
      const hit = this.game.fx.some((f) => f.kind === 'crateHit' && f.c === c && f.r === r);
      PB.Tiles.draw(ctx, PB.Tiles.crate(0), x + (hit ? (Math.random() - 0.5) * 6 : 0), y + T - 72);
      // barra de vida (siempre visible)
      ctx.fillStyle = '#111';
      ctx.fillRect(x + 4, y - 30, T - 8, 10);
      ctx.fillStyle = '#ffd23a';
      ctx.fillRect(x + 6, y - 28, ((T - 12) * hp) / 3000, 6);
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.fillRect(x + 6, y - 28, ((T - 12) * hp) / 3000, 2);
    } else {
      const jx = tt === 'B' ? (PB.Tiles.H(c, r, 4) - 0.5) * 24 : 0;
      PB.Tiles.draw(ctx, PB.Tiles.tree(v, this.game.world.theme), x - 8 + jx, y + T - 128);
    }
  }

  // Hierba alta: la de los Pokémon salvajes. Se mece y se sacude si alguien pasa por dentro.
  drawBush(c, r, alpha, t, rustle) {
    const T = PB.TILE;
    const frame = rustle ? (Math.floor(t * 10) % 2 ? 2 : 1) : Math.floor(t * 1.2 + PB.Tiles.H(c, r, 8) * 2) % 2;
    this.ctx.globalAlpha = alpha;
    PB.Tiles.draw(this.ctx, PB.Tiles.tallGrass(frame, this.game && this.game.world.theme), c * T, r * T - 24);
    this.ctx.globalAlpha = 1;
  }

  // Snorlax dormido (Despierta a Snorlax)
  drawSnorlax(st, game, team) {
    const ctx = this.ctx, t = game.clock;
    const mine = st.team === team;
    const col = mine ? '#3d8bff' : '#ff4d4d';
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(st.x, st.y + 14, 62, 20, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = col;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.ellipse(st.x, st.y + 14, 66, 22, 0, 0, Math.PI * 2);
    ctx.stroke();
    if (st.hp <= 0) {
      PB.Sprites.draw(ctx, '0143', 'Hurt', Math.PI / 2, t, st.x, st.y + 6, 3, 0);
    } else if (st.flashT > 0) {
      PB.Sprites.drawTint(ctx, '0143', 'Sleep', 0, t, st.x, st.y + 10, 3.2, 0, '#ffffff', 0.85);
    } else {
      const breathe = 3.2 + Math.sin(t * 2) * 0.06;
      PB.Sprites.draw(ctx, '0143', 'Sleep', 0, t, st.x, st.y + 10, breathe, 0);
    }
    // "Z z z" del sueño
    if (st.hp > 0) {
      for (let i = 0; i < 3; i++) {
        const k = (t * 0.5 + i / 3) % 1;
        ctx.globalAlpha = 1 - k;
        this.outlined('Z', st.x + 30 + k * 26, st.y - 40 - k * 50, Math.round(12 + k * 10), '#ffffff');
        ctx.globalAlpha = 1;
      }
    }
    // barra de vida grande
    const w = 110, y = st.y - 92;
    ctx.fillStyle = '#111';
    ctx.fillRect(st.x - w / 2 - 3, y - 3, w + 6, 16);
    ctx.fillStyle = col;
    ctx.fillRect(st.x - w / 2, y, (w * st.hp) / st.maxHp, 10);
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.fillRect(st.x - w / 2, y, (w * st.hp) / st.maxHp, 3);
    this.outlined(String(Math.ceil(st.hp)), st.x, y + 10, 12, '#ffffff');
  }

  // Voltorb (Voltorbol)
  drawVoltorb(v, game) {
    const ctx = this.ctx, t = game.clock;
    const sh = Math.max(0.4, 1 - v.z / 200);
    ctx.fillStyle = `rgba(0,0,0,${0.3 * sh})`;
    ctx.beginPath();
    ctx.ellipse(v.x, v.y + 4, 18 * sh, 7 * sh, 0, 0, Math.PI * 2);
    ctx.fill();
    const moving = v.carrier || Math.hypot(v.vx, v.vy) > 20;
    const ang = v.carrier ? v.carrier.facing : Math.atan2(v.vy, v.vx);
    const danger = v.holdT > 6;
    if (danger && Math.floor(t * (v.holdT > 8.5 ? 16 : 8)) % 2) {
      PB.Sprites.drawTint(ctx, '0100', moving ? 'Walk' : 'Idle', ang, v.spin, v.x, v.y - v.z + 2, 2, 0, '#ff3020', 0.7);
      this.glow(v.x, v.y - v.z - 8, 40, 'rgba(255,60,30,0.5)');
    } else {
      PB.Sprites.draw(ctx, '0100', moving ? 'Walk' : 'Idle', ang, v.spin, v.x, v.y - v.z + 2, 2, 0);
    }
    if (!v.carrier) this.glow(v.x, v.y - v.z - 8, 26, 'rgba(255,255,160,0.25)');
  }

  // Zona de Territorio
  drawHotZone(z, t, team) {
    const ctx = this.ctx;
    const col = z.owner === 'contested' ? '255,210,40' : z.owner ? (z.owner === team ? '70,150,255' : '255,80,80') : '255,255,255';
    ctx.fillStyle = `rgba(${col},${0.16 + Math.sin(t * 4) * 0.04})`;
    ctx.beginPath();
    ctx.arc(z.x, z.y, z.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = `rgba(${col},0.9)`;
    ctx.lineWidth = 6;
    ctx.setLineDash([16, 12]);
    ctx.lineDashOffset = -t * 20;
    ctx.stroke();
    ctx.setLineDash([]);
    // bandera pixel art en el centro (del color de quien controla la zona)
    const fc = z.owner === 'contested' ? 'contested' : z.owner ? (z.owner === team ? 'blue' : 'red') : 'neutral';
    const frame = Math.floor(t * 6) % 4;
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(z.x + 2, z.y + 4, 18, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    // la bandera tiene altura: derecha también con la vista girada
    this.up(z.x, z.y, () => {
      if (z.owner && z.owner !== 'contested') this.glow(z.x + 20, z.y - 70, 46, z.owner === team ? 'rgba(80,150,255,0.35)' : 'rgba(255,80,70,0.35)');
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(PB.Tiles.flag(fc, frame), z.x - 14, z.y - 102, 66, 108);
    });
  }

  // Portería de Voltorbol vista desde arriba (como un campo de fútbol real):
  // larguero delante, postes con altura hasta la línea de gol, red cuadriculada,
  // laterales en perspectiva y barra de fondo más baja. Estilo pixel: tubos blancos
  // con sombra y contorno oscuro, todo alineado a píxeles de 4.
  drawGoal(W, team, myTeam) {
    const R = W.goalRect(team);
    if (!R) return;
    const ctx = this.ctx;
    const top = (R.y0 < W.pixelH / 2) !== !!this.flip;
    const col = team === myTeam ? '#3d8bff' : '#ff4d4d';
    const snap = (v) => Math.round(v / 4) * 4;
    const x0 = snap(R.x0 + 8), x1 = snap(R.x1 - 8);
    const mouth = top ? R.y1 : R.y0; // línea de gol (en el suelo)
    const backG = top ? R.y0 + 24 : R.y1 - 24; // fondo de la portería (en el suelo)
    const H = 48, Hb = 16; // altura del larguero y de la barra de fondo
    const inset = 16; // el fondo es algo más estrecho (perspectiva)
    const fy = snap(mouth - H); // larguero en pantalla
    const by = snap(backG - Hb); // barra de fondo en pantalla
    const bx0 = x0 + inset, bx1 = x1 - inset;

    // sombra en el césped
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.beginPath();
    ctx.moveTo(x0 + 10, mouth + 4);
    ctx.lineTo(x1 + 14, mouth + 4);
    ctx.lineTo(bx1 + 14, backG + 4);
    ctx.lineTo(bx0 + 10, backG + 4);
    ctx.closePath();
    ctx.fill();

    // red: techo (del larguero a la barra de fondo) y laterales
    const net = (pts, alpha) => {
      ctx.save();
      ctx.beginPath();
      pts.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
      ctx.closePath();
      ctx.fillStyle = 'rgba(255,255,255,' + alpha * 0.25 + ')';
      ctx.fill();
      ctx.clip();
      ctx.fillStyle = 'rgba(255,255,255,' + alpha + ')';
      const yA = Math.min(...pts.map((p) => p[1])), yB = Math.max(...pts.map((p) => p[1]));
      for (let x = x0 - 8; x <= x1 + 8; x += 12) ctx.fillRect(x, yA, 2, yB - yA);
      for (let y = yA; y <= yB; y += 12) ctx.fillRect(x0 - 8, y, x1 - x0 + 16, 2);
      ctx.restore();
    };
    net([[x0, fy], [x1, fy], [bx1, by], [bx0, by]], 0.75);
    net([[x0, fy], [bx0, by], [bx0, backG], [x0, mouth]], 0.5);
    net([[x1, fy], [bx1, by], [bx1, backG], [x1, mouth]], 0.5);

    // tubo pixel: contorno oscuro, blanco, brillo y sombra
    const tube = (ax, ay, bx, byy, w) => {
      const seg = (c, ww) => {
        ctx.strokeStyle = c;
        ctx.lineWidth = ww;
        ctx.lineCap = 'square';
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(bx, byy);
        ctx.stroke();
      };
      seg('#1b1418', w + 4);
      seg('#c8c4d0', w);
      seg('#f6f4f8', w - 4);
    };
    // fondo y laterales de arriba (más finos, están detrás)
    tube(bx0, by, bx1, by, 6);
    tube(x0, fy, bx0, by, 6);
    tube(x1, fy, bx1, by, 6);
    // patas del fondo
    tube(bx0, by, bx0, backG, 4);
    tube(bx1, by, bx1, backG, 4);
    // tapones oscuros en las esquinas de atrás
    ctx.fillStyle = '#2a2630';
    ctx.fillRect(bx0 - 6, by - 6, 12, 12);
    ctx.fillRect(bx1 - 6, by - 6, 12, 12);
    // postes y larguero (delante, más gruesos)
    tube(x0, fy, x0, mouth, 12);
    tube(x1, fy, x1, mouth, 12);
    tube(x0, fy, x1, fy, 12);
    // brillo del larguero
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.fillRect(x0 + 4, fy - 4, x1 - x0 - 8, 2);
    // marca del color del equipo en la base de los postes
    ctx.fillStyle = col;
    for (const x of [x0, x1]) ctx.fillRect(x - 8, mouth - 8, 16, 6);
  }

  // Niebla venenosa: todo lo que queda fuera del círculo seguro
  drawGas(gas, t, W) {
    const ctx = this.ctx;
    ctx.save();
    ctx.beginPath();
    ctx.rect(-600, -600, W.pixelW + 1200, W.pixelH + 1200);
    ctx.arc(gas.x, gas.y, Math.max(1, gas.r), 0, Math.PI * 2, true);
    ctx.fillStyle = `rgba(110,40,150,${0.38 + Math.sin(t * 2) * 0.04})`;
    ctx.fill('evenodd');
    ctx.strokeStyle = 'rgba(190,110,240,0.8)';
    ctx.lineWidth = 8;
    ctx.setLineDash([20, 14]);
    ctx.lineDashOffset = t * 25;
    ctx.beginPath();
    ctx.arc(gas.x, gas.y, Math.max(1, gas.r), 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  drawBall(g) {
    const ctx = this.ctx;
    if (g.kind === 'candy') {
      const sh = Math.max(0.4, 1 - g.z / 200);
      ctx.fillStyle = `rgba(0,0,0,${0.3 * sh})`;
      ctx.beginPath();
      ctx.ellipse(g.x, g.y + 2, 12 * sh, 4 * sh, 0, 0, Math.PI * 2);
      ctx.fill();
      const y = g.y - 14 - g.z + (g.z > 0 ? 0 : Math.sin(this.ctxTime(g) * 4) * 2);
      if (g.z <= 0) this.glow(g.x, y, 24, 'rgba(120,180,255,0.4)');
      ctx.drawImage(PB.Tiles.candy(), g.x - 20, y - 20, 40, 40);
      return;
    }
    const sh = Math.max(0.4, 1 - g.z / 200);
    ctx.fillStyle = `rgba(0,0,0,${0.3 * sh})`;
    ctx.beginPath();
    ctx.ellipse(g.x, g.y + 2, 13 * sh, 5 * sh, 0, 0, Math.PI * 2);
    ctx.fill();
    const bob = g.z > 0 ? 0 : Math.sin(this.ctxTime(g) * 4) * 2;
    const y = g.y - 14 - g.z + bob;
    if (g.z <= 0) this.glow(g.x, y, 22, 'rgba(255,90,60,0.35)');
    PB.Pokeball.draw(this.ctx, g.x, y, 2, { angle: Math.sin(g.spin) * 0.35 + (g.vx || g.vy ? g.spin : 0) });
  }

  ctxTime(g) {
    g.bobT = (g.bobT || Math.random() * 6) + 1 / 60;
    return g.bobT;
  }

  drawCrack(f) {
    const ctx = this.ctx;
    const k = f.t / f.life;
    ctx.globalAlpha = k < 0.7 ? 0.8 : (1 - k) / 0.3 * 0.8;
    ctx.strokeStyle = '#4a3420';
    ctx.lineWidth = 4;
    let seed = f.seed;
    const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + rnd() * 0.4;
      let x = f.x, y = f.y;
      ctx.beginPath();
      ctx.moveTo(x, y);
      const len = f.r * Math.min(1, k * 6) * (0.6 + rnd() * 0.4);
      for (let s = 1; s <= 4; s++) {
        const aa = a + (rnd() - 0.5) * 0.6;
        x = f.x + Math.cos(aa) * (len * s) / 4;
        y = f.y + Math.sin(aa) * (len * s) / 4 * 0.7;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  drawZone(z, t, team) {
    const ctx = this.ctx;
    const k = 1 - z.t / z.life;
    const appear = Math.min(1, k * 8);
    const r = z.r * (0.6 + 0.4 * appear);
    const a = 0.22 + Math.sin(t * 6) * 0.05;
    const zt = z.atk.type || (z.by && z.by.def.atkType);
    const T = PB.VFX.PAL[zt] ? zt : 'grass';
    const P = PB.VFX.PAL[T];
    ctx.fillStyle = this.hexA(P[z.team === team ? 3 : 2], a);
    ctx.beginPath();
    ctx.arc(z.x, z.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = this.hexA(P[1], 0.8);
    ctx.lineWidth = 4;
    ctx.setLineDash([14, 10]);
    ctx.lineDashOffset = -t * 30;
    ctx.stroke();
    ctx.setLineDash([]);
    // enredaderas
    ctx.strokeStyle = this.hexA(P[2], 0.75);
    ctx.lineWidth = 3;
    for (let i = 0; i < 6; i++) {
      const a0 = (i / 6) * Math.PI * 2 + t * 0.4;
      ctx.beginPath();
      for (let s = 0; s <= 10; s++) {
        const rr = (r * s) / 10;
        const aa = a0 + Math.sin(s * 0.9 + t * 2) * 0.25;
        const x = z.x + Math.cos(aa) * rr, y = z.y + Math.sin(aa) * rr;
        s ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.stroke();
    }
    PB.VFX.draw(ctx, T === 'grass' || T === 'poison' ? 'blob' : PB.VFX.forType(T).proj, T, z.x, z.y - 6, { scale: 1.6, frame: Math.floor(t * 4) });
  }

  // trampa: los tuyos se ven bien; las del rival, casi transparentes
  drawMine(m, t, team) {
    const ctx = this.ctx;
    const P = PB.VFX.PAL[m.type] || PB.VFX.PAL.normal;
    const mine = m.team === team;
    ctx.globalAlpha = mine ? 1 : 0.32;
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(m.x, m.y + 4, 16, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    const armed = m.armT <= 0;
    ctx.fillStyle = '#141824';
    ctx.fillRect(m.x - 12, m.y - 10, 24, 16);
    ctx.fillStyle = P[1];
    ctx.fillRect(m.x - 10, m.y - 8, 20, 12);
    ctx.fillStyle = P[3];
    ctx.fillRect(m.x - 10, m.y - 8, 20, 4);
    // pinchos
    ctx.fillStyle = '#141824';
    for (const dx of [-8, 0, 8]) ctx.fillRect(m.x + dx - 2, m.y - 14, 4, 5);
    ctx.fillStyle = armed && Math.sin(t * 8 + m.phase) > 0 ? '#ff4a3a' : P[4];
    ctx.fillRect(m.x - 3, m.y - 4, 6, 4);
    ctx.globalAlpha = 1;
  }

  // orbe que dispara solo, con un anillo que marca lo que le queda
  drawTurret(tu, t) {
    const ctx = this.ctx;
    const P = PB.VFX.PAL[tu.type] || PB.VFX.PAL.normal;
    const bob = Math.sin(t * 4) * 3;
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(tu.x, tu.y + 4, 18, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    this.glow(tu.x, tu.y - 24 + bob, 34, this.hexA(P[3], 0.5));
    PB.VFX.draw(ctx, PB.VFX.forType(tu.type).proj, tu.type, tu.x, tu.y - 24 + bob, { scale: 2.2, frame: Math.floor(t * 6), angle: t * 2 });
    ctx.strokeStyle = this.hexA(P[4], 0.9);
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(tu.x, tu.y - 24 + bob, 22, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (tu.t / tu.life));
    ctx.stroke();
  }

  // rayo en cadena: zigzag pixel entre los golpeados
  drawChain(f) {
    const ctx = this.ctx, P = PB.VFX.PAL[f.type] || PB.VFX.PAL.electric;
    const a = 1 - f.t / f.life;
    for (const [w, col] of [[9, this.hexA(P[2], a * 0.6)], [4, this.hexA(P[4], a)]]) {
      ctx.strokeStyle = col;
      ctx.lineWidth = w;
      ctx.beginPath();
      for (let i = 0; i < f.pts.length - 1; i++) {
        const p = f.pts[i], q = f.pts[i + 1];
        const n = 6;
        for (let k = 0; k <= n; k++) {
          const x = p.x + ((q.x - p.x) * k) / n, y = p.y + ((q.y - p.y) * k) / n;
          const j = k === 0 || k === n ? 0 : Math.sin(f.seed + k * 7.3 + i * 3 + f.t * 40) * 12;
          if (i === 0 && k === 0) ctx.moveTo(x, y); else ctx.lineTo(x + j, y - j);
        }
      }
      ctx.stroke();
    }
    for (const p of f.pts.slice(1)) this.glow(p.x, p.y, 40 * a + 10, this.hexA(P[3], a * 0.7));
  }

  // rayo recto que se va estrechando
  drawBeam(f) {
    const ctx = this.ctx, P = PB.VFX.PAL[f.type] || PB.VFX.PAL.normal;
    const a = 1 - f.t / f.life;
    ctx.lineCap = 'butt';
    for (const [k, col] of [[1, this.hexA(P[2], a * 0.55)], [0.55, this.hexA(P[3], a * 0.9)], [0.22, this.hexA(P[4], a)]]) {
      ctx.strokeStyle = col;
      ctx.lineWidth = f.w * k * (0.6 + a * 0.4);
      ctx.beginPath();
      ctx.moveTo(f.x1, f.y1);
      ctx.lineTo(f.x2, f.y2);
      ctx.stroke();
    }
    this.glow(f.x1, f.y1, f.w * a + 10, this.hexA(P[4], a));
  }

  // tajo: arco que barre delante
  drawSlash(f) {
    const ctx = this.ctx, P = PB.VFX.PAL[f.type] || PB.VFX.PAL.normal;
    const k = f.t / f.life, a = 1 - k;
    const half = f.arc / 2, sweep = f.ang - half + f.arc * Math.min(1, k * 1.6);
    for (const [w, col, rr] of [[14, this.hexA(P[2], a * 0.5), 0.95], [7, this.hexA(P[3], a * 0.9), 0.8], [3, this.hexA(P[4], a), 0.65]]) {
      ctx.strokeStyle = col;
      ctx.lineWidth = w;
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.r * rr, f.ang - half, sweep);
      ctx.stroke();
    }
  }

  // aviso del rayo mientras se carga
  drawBeamCharge(f) {
    const ctx = this.ctx, P = PB.VFX.PAL[f.type] || PB.VFX.PAL.normal;
    const b = f.by, k = f.t / f.life;
    const x1 = b.x, y1 = b.y - 18;
    ctx.strokeStyle = this.hexA(P[3], 0.25 + k * 0.4);
    ctx.lineWidth = 3;
    ctx.setLineDash([10, 8]);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x1 + Math.cos(f.ang) * f.len, y1 + Math.sin(f.ang) * f.len);
    ctx.stroke();
    ctx.setLineDash([]);
    this.glow(x1, y1, 20 + k * 30, this.hexA(P[4], 0.4 + k * 0.5));
  }

  drawBrawler(b, game, team, ghostPass) {
    const ctx = this.ctx;
    const col = b.team === 'blue' ? '#3d8bff' : '#ff4d4d';
    const t = game.clock;
    const spawning = b.spawnT > 0;
    if (!ghostPass) {
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath();
      ctx.ellipse(b.x, b.y + 6, 24, 9, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = b.isPlayer ? '#5dff7a' : col;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(b.x, b.y + 6, 26, 11, 0, 0, Math.PI * 2);
      ctx.stroke();
      if (b.superCharge >= 1 && !spawning) {
        ctx.strokeStyle = `rgba(255,210,40,${0.55 + Math.sin(t * 8) * 0.3})`;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.ellipse(b.x, b.y + 6, 33 + Math.sin(t * 8) * 2, 14, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    let anim = b.moving ? 'Walk' : 'Idle', len = 0, at = b.animT;
    if (b.action) { anim = b.action.anim; len = b.action.len; at = b.action.t; }
    if (b.hurtT > 0 && !b.action) anim = 'Hurt';
    if (b.stunT > 0) anim = 'Hurt';

    if (spawning) {
      // sale de la Pokéball: silueta blanca que crece
      const k = 1 - b.spawnT / 0.45;
      const sc = 2 * (0.25 + 0.75 * k);
      PB.Sprites.drawTint(ctx, b.dex, 'Idle', b.facing, at, b.x, b.y + 4, sc, 0, '#ffffff', 1 - k * 0.6, b.shiny);
      return;
    }
    const prev = ctx.globalAlpha;
    if (b.stealthT > 0) ctx.globalAlpha = prev * 0.35;
    if (b.shieldT > 0) ctx.globalAlpha *= 0.75 + Math.sin(t * 20) * 0.25;
    if (b.evoT > PB.EVO_REVEAL && b.evoFrom) {
      // evolución como en los juegos: silueta blanca que alterna entre la forma de antes y la nueva,
      // cada vez más deprisa, con un halo de luz y rayos
      const el = PB.EVO_ANIM - b.evoT, k = el / (PB.EVO_ANIM - PB.EVO_REVEAL);
      const showNew = Math.sin(k * k * 30) > 0.2 && k > 0.12;
      const sc = 2 * (1 + 0.08 * Math.sin(k * 25) * k);
      this.glow(b.x, b.y - 24, 50 + 40 * k, `rgba(255,255,255,${0.18 + 0.25 * k})`);
      ctx.save();
      ctx.globalAlpha = prev * 0.35 * k;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3;
      for (let i = 0; i < 8; i++) {
        const a = i * (Math.PI / 4) + k * 2;
        ctx.beginPath();
        ctx.moveTo(b.x + Math.cos(a) * 30, b.y - 24 + Math.sin(a) * 30);
        ctx.lineTo(b.x + Math.cos(a) * (70 + 40 * k), b.y - 24 + Math.sin(a) * (70 + 40 * k));
        ctx.stroke();
      }
      ctx.restore();
      // contorno del color del tipo detrás de la silueta blanca, para que se vea bien la forma
      const evDex = showNew ? b.dex : b.evoFrom;
      const pal = PB.VFX.PAL[b.def.atkType] || PB.VFX.PAL.normal;
      ctx.globalAlpha = prev * 0.85;
      for (const [ox, oy] of [[-2, 0], [2, 0], [0, -2], [0, 2]]) PB.Sprites.drawTint(ctx, evDex, 'Idle', b.facing, at, b.x + ox, b.y + 4 + oy, sc, 0, pal[1] || '#3060c0', 1, b.shiny);
      ctx.globalAlpha = prev;
      PB.Sprites.drawTint(ctx, evDex, 'Idle', b.facing, at, b.x, b.y + 4, sc, 0, '#ffffff', 1, b.shiny);
    } else if (b.evoT > 0) {
      // forma nueva: el brillo blanco se va apagando
      PB.Sprites.drawTint(ctx, b.dex, 'Idle', b.facing, at, b.x, b.y + 4, 2, 0, '#ffffff', Math.min(1, (b.evoT / PB.EVO_REVEAL) * 0.9), b.shiny);
    } else if (b.flashT > 0) PB.Sprites.drawTint(ctx, b.dex, anim, b.facing, at, b.x, b.y + 4, 2, len, '#ffffff', 0.85, b.shiny);
    else PB.Sprites.draw(ctx, b.dex, anim, b.facing, at, b.x, b.y + 4, 2, len, b.shiny);
    ctx.globalAlpha = prev;

    if (ghostPass) return;
    // escudo del súper: burbuja hexagonal del color del tipo
    if (b.barrierT > 0) {
      const P = PB.VFX.PAL[b.barrierType] || PB.VFX.PAL.steel;
      const a = Math.min(1, b.barrierT) * (0.6 + Math.sin(t * 10) * 0.15);
      ctx.strokeStyle = this.hexA(P[3], a);
      ctx.fillStyle = this.hexA(P[4], a * 0.18);
      ctx.lineWidth = 3;
      ctx.beginPath();
      for (let i = 0; i <= 6; i++) {
        const an = (i / 6) * Math.PI * 2 + Math.PI / 6;
        const x = b.x + Math.cos(an) * 40, y = b.y - 22 + Math.sin(an) * 40;
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.fill();
      ctx.stroke();
    }
    if (b.shieldT > 0) {
      ctx.strokeStyle = `rgba(150,220,255,${Math.min(1, b.shieldT)})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(b.x, b.y - 14, 38, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (b.stunT > 0) {
      for (let i = 0; i < 3; i++) {
        const a = t * 6 + (i * Math.PI * 2) / 3;
        PB.VFX.draw(ctx, 'star', 'electric', b.x + Math.cos(a) * 22, b.y - 64 + Math.sin(a) * 6, { scale: 0.8, frame: i });
      }
    }
    if (b.powerNext) this.glow(b.x, b.y - 20, 40, 'rgba(150,110,255,0.5)');
    // destellos del súper listo
    if (b.superCharge >= 1 && Math.sin(t * 5 + b.idx) > 0.6) {
      const a = t * 3 + b.idx;
      PB.VFX.draw(ctx, 'star', 'electric', b.x + Math.cos(a) * 30, b.y - 30 + Math.sin(a * 1.3) * 20, { scale: 0.6, frame: Math.floor(t * 8) });
    }
  }

  // Se debilita y vuelve a su Pokéball (rayo rojo)
  drawFaint(f) {
    const ctx = this.ctx;
    const t = f.t;
    const by = f.y - 50;
    if (t < 0.7) {
      const A = PB.Sprites.anims(f.dex, f.shiny);
      const has = !!(A && A.Faint);
      PB.Sprites.draw(ctx, f.dex, has ? 'Faint' : 'Hurt', f.facing, t, f.x, f.y + 4, 2, has ? 0.7 : 0, f.shiny);
      if (t > 0.45) PB.Pokeball.draw(ctx, f.x, by, 2, { variant: 'open', alpha: (t - 0.45) / 0.25 });
    } else if (t < 1.1) {
      const k = (t - 0.7) / 0.4;
      // rayo rojo de la Pokéball al Pokémon
      ctx.strokeStyle = `rgba(255,60,40,${0.8 * (1 - k)})`;
      ctx.lineWidth = 10 * (1 - k) + 2;
      ctx.beginPath();
      ctx.moveTo(f.x, by + 8);
      ctx.lineTo(f.x, f.y - 16 * (1 - k));
      ctx.stroke();
      this.glow(f.x, f.y - 16, 50 * (1 - k) + 10, 'rgba(255,60,40,0.6)');
      PB.Sprites.drawTint(ctx, f.dex, 'Hurt', f.facing, 0, f.x, f.y + 4 - k * 34, 2 * (1 - k * 0.9), 0, '#ff3a28', 0.9, f.shiny);
      PB.Pokeball.draw(ctx, f.x, by, 2, { variant: 'open' });
    } else {
      const k = (f.t - 1.1) / (f.life - 1.1);
      const wob = Math.sin(k * 20) * 0.3 * (1 - k);
      PB.Pokeball.draw(ctx, f.x, by + k * 10, 2, { angle: wob, alpha: 1 - k * k });
    }
  }

  // Sale de la Pokéball (al empezar y al reaparecer)
  drawRelease(f) {
    const k = f.t / f.life;
    const y = f.y - 46;
    if (k < 0.45) {
      PB.Pokeball.draw(this.ctx, f.x, y + Math.sin((k / 0.45) * Math.PI) * -18, 2, { variant: k > 0.3 ? 'open' : 'glow', angle: k * 12 });
    } else {
      PB.Pokeball.draw(this.ctx, f.x, y, 2, { variant: 'open', alpha: 1 - (k - 0.45) / 0.55 });
    }
    if (k > 0.25) {
      const kk = (k - 0.25) / 0.75;
      this.glow(f.x, f.y - 20, 70 * (1 - kk) + 10, `rgba(255,255,255,${0.9 * (1 - kk)})`);
    }
  }

  // Estela de Pikachu en la embestida
  drawGhost(f) {
    const k = f.t / f.life;
    this.ctx.globalAlpha = 0.5 * (1 - k);
    const P = PB.VFX.PAL[f.type] || PB.VFX.PAL.electric;
    PB.Sprites.drawTint(this.ctx, f.dex, 'Attack', f.facing, 0.1, f.x, f.y + 4, 2, 0.3, P[3], 0.7, f.shiny);
    this.ctx.globalAlpha = 1;
  }

  drawOverhead(b, game, team, focus) {
    const ctx = this.ctx;
    const UI = PB.PixUI;
    const x = Math.round(b.x), y = Math.round(b.y - 74);
    const w = 70;
    const mine = b.team === team;
    const isMe = b === focus && b.isPlayer;
    // nombre (y un rayo si tiene el súper listo)
    this.outlined(b.name, x, y - 8, 13, b.creator ? '#ffd23a' : isMe ? '#7dff8f' : mine ? '#a9d0ff' : '#ffb0b0');
    // vida: barra pixel con una marca cada 1000
    const hpk = Math.max(0, b.hp) / b.maxHp;
    const col = isMe ? '#43e05a' : mine ? '#3d8bff' : '#ff4545';
    UI.bar(ctx, x - w / 2, y - 2, w, 14, hpk, col, { p: 2, seg: true, segCount: Math.min(12, Math.ceil(b.maxHp / 1000)) });
    if (PB.Settings.get('hpNumbers')) this.outlined(String(Math.ceil(b.hp)), x, y + 9, 11, '#ffffff');
    if (b.superCharge >= 1) UI.icon(ctx, 'bolt', x - w / 2 - 20, y - 6, 1.5);
    // evolución: barra fina de EXP (dorada cuando ya está en su última fase)
    const ey = isMe ? y + 23 : y + 13;
    const ek = game.evoProgress ? game.evoProgress(b) : 0;
    const maxed = b.stage >= PB.evoSteps(b.def).length;
    ctx.fillStyle = '#141824';
    ctx.fillRect(x - w / 2, ey, w, 6);
    ctx.fillStyle = '#2a3350';
    ctx.fillRect(x - w / 2 + 1, ey + 1, w - 2, 4);
    ctx.fillStyle = maxed ? '#ffd23a' : '#7fd4ff';
    ctx.fillRect(x - w / 2 + 1, ey + 1, Math.round((w - 2) * ek), 4);
    if (!maxed && ek > 0.85 && Math.sin(game.clock * 12) > 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.fillRect(x - w / 2 + 1, ey + 1, Math.round((w - 2) * ek), 4);
    }
    // munición (solo la tuya)
    if (isMe) {
      const sw = (w - 4) / 3;
      for (let i = 0; i < 3; i++) {
        const f = Math.max(0, Math.min(1, b.ammo - i));
        UI.bar(ctx, x - w / 2 + i * (sw + 2), y + 13, sw, 8, f, f >= 1 ? '#ff9a1f' : '#b8702a', { p: 2 });
      }
    }
    // Caramelos Raros (Niebla Tóxica)
    if (b.power > 0) {
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(PB.Tiles.candy(), x - w / 2 - 38, y - 8, 22, 22);
      this.outlined(String(b.power), x - w / 2 - 14, y + 9, 13, '#ffffff');
    }
    // lo que acaba de escribir en el chat
    if (b.say && game.clock - b.say.t < 3.5 && !(PB.Chat && PB.Chat.matchMuted)) this.drawSay(b.say.text, x, b.balls > 0 ? y - 46 : y - 28, game.clock - b.say.t);
    // Pokéballs que lleva encima
    if (b.balls > 0) {
      const n = Math.min(b.balls, 5);
      const bx = x - ((n - 1) * 13) / 2;
      for (let i = 0; i < n; i++) PB.Pokeball.draw(ctx, bx + i * 13, y - 30, 1, {});
      if (b.balls > 1) this.outlined('×' + b.balls, x + (n * 13) / 2 + 14, y - 24, 15, '#ffffff');
    }
  }

  // Bocadillo de chat (pixel): se recorta si es muy largo y se desvanece al final
  drawSay(text, x, y, age) {
    const ctx = this.ctx;
    const t = text.length > 28 ? text.slice(0, 27) + '…' : text;
    ctx.font = '14px "Jersey 10", system-ui, sans-serif';
    const w = Math.ceil(ctx.measureText(t).width) + 16, h = 22;
    const bx = Math.round(x - w / 2), by = Math.round(y - h);
    ctx.globalAlpha = Math.max(0, Math.min(1, (3.5 - age) / 0.5));
    ctx.fillStyle = '#141824';
    ctx.fillRect(bx - 2, by - 2, w + 4, h + 4);
    ctx.fillRect(x - 4, by + h, 8, 6);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(bx, by, w, h);
    ctx.fillRect(x - 2, by + h, 4, 4);
    ctx.fillStyle = '#141824';
    ctx.textAlign = 'center';
    ctx.fillText(t, x, by + 16);
    ctx.globalAlpha = 1;
  }

  drawShot(p, t) {
    const ctx = this.ctx;
    const look = p.look || {};
    const pal = PB.VFX.PAL[p.atkType] ? p.atkType : 'normal';
    const colors = PB.VFX.PAL[pal];
    const frame = Math.floor(p.t * 12);
    if (p.lob) {
      if (p.t < 0) return; // meteoro que aún no ha salido
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, 12, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      // zona de impacto
      const k = Math.min(1, p.t / p.T);
      ctx.strokeStyle = `rgba(255,255,255,${0.25 + k * 0.4})`;
      ctx.fillStyle = `rgba(255,255,255,${0.08 + k * 0.12})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.tx, p.ty, p.atk.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      const y = p.y - p.z - 10;
      this.up(p.x, p.y, () => PB.VFX.draw(ctx, look.shape || 'rock', pal, p.x, y, { scale: look.scale || 1.4, angle: p.t * 10, frame }));
      return;
    }
    const sc = (look.scale || 1) * (p.powered ? 1.4 : 1);
    this.glow(p.x, p.y, (p.r + 10) * (p.isSuper ? 1.6 : 1.1), this.hexA(colors[3], p.isSuper ? 0.6 : 0.4));
    if (p.powered) this.glow(p.x, p.y, p.r * 3, 'rgba(160,120,255,0.5)');
    const shape = look.shape || 'ball';
    const angle = PB.VFX.isDir(shape) ? p.ang : PB.VFX.spins(shape) ? p.t * 18 : 0;
    PB.VFX.draw(ctx, shape, pal, p.x, p.y, { angle, scale: sc, frame });
  }

  // aim = { isSuper, ang, dist, strong }
  drawAim(b, aim) {
    const ctx = this.ctx;
    const a = aim.isSuper ? b.def.super : b.def.attack;
    // en suelos claros (nieve, arena) el relleno blanco no se ve: va en azul oscuro
    const light = this.game && ['nieve', 'arena'].includes(this.game.world.theme);
    const color = aim.isSuper ? 'rgba(255,210,40,' : light ? 'rgba(30,50,120,' : 'rgba(255,255,255,';
    const alpha = aim.strong ? (light && !aim.isSuper ? 0.3 : 0.35) : 0.14;
    ctx.fillStyle = color + alpha + ')';
    ctx.strokeStyle = color + Math.min(1, alpha * 2.2) + ')';
    ctx.lineWidth = 2;
    // borde oscuro debajo del claro: así se ve también en la nieve y en la arena
    const edge = () => {
      const st = ctx.strokeStyle;
      ctx.strokeStyle = 'rgba(12,16,32,' + (aim.strong ? 0.55 : 0.3) + ')';
      ctx.lineWidth = 5;
      ctx.stroke();
      ctx.strokeStyle = st;
      ctx.lineWidth = 2;
      ctx.stroke();
    };
    const ang = aim.ang;
    // hasta dónde llega de verdad un disparo: sale 18 px por delante y golpea con su tamaño
    const reach = a.range + 18 + (a.r || 12);
    if (!aim.isSuper && this.game && this.game.voltorb && this.game.voltorb.carrier === b) {
      // con el Voltorb: indicador de chut
      ctx.fillStyle = 'rgba(255,240,120,' + (aim.strong ? 0.4 : 0.2) + ')';
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(ang);
      ctx.fillRect(0, -10, PB.KICK.reach, 20);
      ctx.restore();
      return;
    }
    if (a.kind === 'spread' || a.kind === 'burst') {
      const half = Math.max(a.spread || 0, 0.12) / 2 + 0.05;
      if ((a.count || 1) > 1) {
        ctx.beginPath();
        ctx.moveTo(b.x, b.y);
        ctx.arc(b.x, b.y, reach, ang - half, ang + half);
        ctx.closePath();
        ctx.fill();
        edge();
      } else {
        const w = (a.r || 12) * 2 + 8;
        ctx.save();
        ctx.translate(b.x, b.y);
        ctx.rotate(ang);
        ctx.fillRect(0, -w / 2, reach, w);
        ctx.beginPath(); ctx.rect(0, -w / 2, reach, w); edge();
        ctx.restore();
      }
    } else if (a.kind === 'lob' || a.kind === 'zone') {
      const d = Math.min(aim.dist, a.range);
      const tx = b.x + Math.cos(ang) * d, ty = b.y + Math.sin(ang) * d;
      ctx.beginPath();
      ctx.arc(tx, ty, a.radius, 0, Math.PI * 2);
      ctx.fill();
      edge();
      ctx.setLineDash([8, 8]);
      ctx.beginPath();
      ctx.moveTo(b.x, b.y);
      ctx.quadraticCurveTo((b.x + tx) / 2, (b.y + ty) / 2 - 80, tx, ty);
      edge();
      ctx.setLineDash([]);
    } else if (a.kind === 'dash') {
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(ang);
      // embestida: el cuerpo recorre el rango y golpea con su radio
      ctx.fillRect(0, -a.r, a.range + a.r, a.r * 2);
      ctx.beginPath(); ctx.rect(0, -a.r, a.range + a.r, a.r * 2); edge();
      ctx.restore();
    } else if (a.kind === 'slam' || a.kind === 'barrier' || a.kind === 'wish' || a.kind === 'nova') {
      ctx.beginPath();
      ctx.arc(b.x, b.y, a.radius || a.range, 0, Math.PI * 2);
      ctx.fill();
      edge();
    } else if (a.kind === 'melee') {
      ctx.beginPath();
      ctx.moveTo(b.x, b.y);
      ctx.arc(b.x, b.y, a.range, ang - a.arc / 2, ang + a.arc / 2);
      ctx.closePath();
      ctx.fill();
      edge();
    } else if (a.kind === 'twin' || a.kind === 'beam' || a.kind === 'boomerang' || a.kind === 'chain') {
      const w = a.kind === 'twin' ? a.gap * 2 + 20 : a.kind === 'beam' ? a.width : 40;
      const len = a.kind === 'twin' || a.kind === 'boomerang' ? reach : a.range;
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(ang);
      ctx.fillRect(0, -w / 2, len, w);
      ctx.beginPath(); ctx.rect(0, -w / 2, len, w); edge();
      ctx.restore();
    } else if (a.kind === 'meteor' || a.kind === 'mines' || a.kind === 'turret') {
      const d = Math.min(aim.dist, a.kind === 'turret' ? a.place : a.range);
      const tx = b.x + Math.cos(ang) * d, ty = b.y + Math.sin(ang) * d;
      ctx.beginPath();
      ctx.arc(tx, ty, a.kind === 'turret' ? 30 : (a.spreadR || 0) + (a.radius || 40), 0, Math.PI * 2);
      ctx.fill();
      edge();
    }
  }

  outlined(text, x, y, size, color, align) {
    const ctx = this.ctx;
    ctx.textAlign = align || 'center';
    ctx.font = `${size}px "Jersey 10", system-ui, sans-serif`;
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(3, size / 6);
    ctx.strokeStyle = '#0c1020';
    ctx.strokeText(text, x, y);
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
  }

  drawHud(game, view) {
    const ctx = this.ctx, W = this.cw, H = this.ch;
    const UI = PB.PixUI;
    const team = view.team;
    const me = view.player;

    // viñeta roja con poca vida
    if (me && !me.dead && me.hp / me.maxHp < 0.35) {
      const k = 1 - me.hp / me.maxHp / 0.35;
      const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
      g.addColorStop(0, 'rgba(255,0,0,0)');
      g.addColorStop(1, `rgba(200,0,0,${0.35 * k + Math.sin(game.clock * 6) * 0.08 * k})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }

    // marcador del modo (en móviles, más pequeño para que no tape a los rivales que vienen por arriba)
    const hk = H < 500 ? 0.74 : 1;
    ctx.save();
    ctx.translate(Math.round(W / 2), 0);
    ctx.scale(hk, hk);
    ctx.translate(-Math.round(W / 2), 0);
    this.drawModeHud(game, view);
    ctx.restore();

    // registro de K.O. con retratos: [quien] ➜ [a quién]
    let fy = Math.round((W < 760 ? 112 : game.mode.id === 'gems' ? 74 : 10) * hk); // en pantallas estrechas, debajo del marcador
    for (const f of game.feed) {
      const age = game.time - f.t;
      if (age > 5) continue;
      ctx.globalAlpha = Math.min(1, 5 - age);
      const ours = f.team === team;
      ctx.font = '13px "Jersey 10", system-ui, sans-serif';
      if (f.info) {
        // aviso (alguien se ha desconectado): solo texto
        const txt = f.killer + ' ' + f.victim, tw = ctx.measureText(txt).width + 24;
        const px = W - tw - 10 - (this.safeR || 0);
        UI.panel(ctx, px, fy, tw, 30, { p: 2, fill: 'rgba(40,40,60,0.85)' });
        ctx.textAlign = 'left';
        ctx.fillStyle = '#ffe9a8';
        ctx.fillText(txt, px + 12, fy + 20);
        fy += 34;
        continue;
      }
      const t1 = f.killer || '?', t2 = f.victim || '';
      const w1 = ctx.measureText(t1).width, w2 = ctx.measureText(t2).width;
      const pw = w1 + w2 + 92;
      const px = W - pw - 10 - (this.safeR || 0);
      UI.panel(ctx, px, fy, pw, 30, { p: 2, fill: ours ? 'rgba(30,70,150,0.85)' : 'rgba(140,30,40,0.85)' });
      const por = (dex, x2) => {
        const img = PB.Sprites.portrait(dex);
        if (img) { ctx.imageSmoothingEnabled = false; ctx.drawImage(img, x2, fy + 4, 22, 22); }
      };
      por(f.kdex, px + 6);
      ctx.textAlign = 'left';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(t1, px + 32, fy + 20);
      // flecha pixel
      const ax = px + 36 + w1;
      ctx.fillStyle = '#ffd23a';
      ctx.fillRect(ax, fy + 13, 10, 4);
      ctx.fillRect(ax + 8, fy + 10, 3, 10);
      ctx.fillRect(ax + 11, fy + 12, 3, 6);
      por(f.vdex, ax + 18);
      ctx.fillStyle = '#ffd8d8';
      ctx.fillText(t2, ax + 44, fy + 20);
      fy += 34;
    }
    ctx.globalAlpha = 1;

    // cuenta atrás inicial
    if (game.startT > 0) {
      const n = Math.ceil(game.startT);
      const k = 1 - (game.startT % 1 || 1);
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.fillRect(0, 0, W, H);
      ctx.font = '22px "Jersey 10", system-ui, sans-serif';
      const tw = ctx.measureText(PB.T(game.mode.name)).width + 40;
      UI.panel(ctx, W / 2 - tw / 2, H / 2 - 92, tw, 42, { p: 3, fill: 'rgba(30,50,110,0.95)' });
      this.outlined(PB.T(game.mode.name), W / 2, H / 2 - 63, 22, '#ffffff');
      this.outlined(String(n), W / 2, H / 2 + 46, Math.round(68 * (1.3 - k * 0.3)), '#ffcf2e');
    }

    // avisos importantes: una tira pequeña arriba, debajo del marcador (no tapa la partida)
    if (this.banner) {
      const b = this.banner;
      b.t += 1 / 60;
      const k = b.t / b.life;
      if (k >= 1) this.banner = null;
      else {
        ctx.globalAlpha = k < 0.1 ? k / 0.1 : k > 0.8 ? (1 - k) / 0.2 : 1;
        const size = W < 700 ? 16 : 19;
        ctx.font = size + 'px "Jersey 10", system-ui, sans-serif';
        const bw = Math.min(W - 20, ctx.measureText(b.text).width + 36);
        const by = 104 - (k < 0.1 ? (1 - k / 0.1) * 8 : 0);
        UI.panel(ctx, W / 2 - bw / 2, by, bw, size + 14, { p: 2, fill: 'rgba(14,20,48,0.85)' });
        this.outlined(b.text, W / 2, by + size + 3, size, b.color);
        ctx.globalAlpha = 1;
      }
    }

    if (me) {
      if (me.dead && !me.out) {
        UI.panel(ctx, W / 2 - 130, H / 2 - 34, 260, 62, { p: 3, fill: 'rgba(14,20,48,0.88)' });
        PB.Pokeball.draw(ctx, W / 2 - 92, H / 2 - 3, 2, { angle: Math.sin(game.clock * 6) * 0.3 });
        this.outlined(PB.T('Vuelves en {n}', { n: Math.ceil(me.respawnT) }), W / 2 + 20, H / 2 + 8, 26, '#ffffff');
      }
      if (view.touch) this.drawTouch(view, me, game);
      else { this.drawDesktopSuper(me, game); this.drawDesktopSuperHint(view); }
    }

    // FPS
    if (PB.Settings.get('fps')) {
      this._fpsT = (this._fpsT || 0) + 1;
      const now = performance.now();
      if (!this._fpsAt || now - this._fpsAt > 500) { this._fps = Math.round((this._fpsT * 1000) / (now - (this._fpsAt || now - 500))); this._fpsT = 0; this._fpsAt = now; }
      this.outlined((this._fps || 0) + ' FPS', W - 12, H - 10, 12, '#9fff9f', 'right');
    }
  }

  // Panel de arriba según el modo
  drawModeHud(game, view) {
    const ctx = this.ctx, W = this.cw;
    const UI = PB.PixUI;
    const team = view.team;
    const foe = team === 'blue' ? 'red' : 'blue';
    const cx = Math.round(W / 2);
    const id = game.mode.id;
    const panel = (w, h, y) => UI.panel(ctx, cx - w / 2, y || 6, w, h, { p: 3 });
    const clock = (y) => {
      const left = Math.max(0, (game.overtimeEnd || game.rules.matchTime) - game.time);
      const txt = Math.floor(left / 60) + ':' + String(Math.floor(left % 60)).padStart(2, '0');
      UI.panel(ctx, cx - 34, y - 15, 68, 22, { p: 2, fill: left < 20 ? 'rgba(150,30,30,0.9)' : 'rgba(16,24,56,0.86)' });
      this.outlined(txt, cx, y + 1, 14, '#ffffff');
    };
    // barra doble (Snorlax, Territorio)
    const bars = (label, mineK, theirsK, txtMine, txtTheirs) => {
      const w = Math.min(380, W - 140);
      panel(w + 30, 60);
      this.outlined(label, cx, 25, 13, '#ffd23a');
      const bw = w / 2 - 8;
      for (const [k, x, col, txt] of [[mineK, cx - 4 - bw, '#3d8bff', txtMine], [theirsK, cx + 4, '#ff4d4d', txtTheirs]]) {
        UI.bar(ctx, x, 32, bw, 20, Math.max(0, Math.min(1, k)), col, { p: 3 });
        this.outlined(txt, x + bw / 2, 47, 14, '#ffffff');
      }
    };

    if (id === 'gems') {
      // un marcador por equipo en cada esquina: Pokéball + número (tu equipo a la izquierda)
      const mine = game.teamBalls(team), theirs = game.teamBalls(foe);
      const R = game.rules.ballsToWin;
      const S = PB.safe ? PB.safe() : { l: 0, r: 0 };
      const counter = (x, n, fill, right, ours) => {
        const w = 98, h = 40, bx = right ? x - w : x;
        // con 10 o más, el marcador brilla en dorado y avisa debajo (sin tapar el centro)
        const full = n >= R;
        if (full) {
          const p = 0.5 + Math.sin(game.clock * 7) * 0.5;
          ctx.fillStyle = `rgba(255,214,58,${0.35 + p * 0.5})`;
          ctx.fillRect(bx - 3, 5, w + 6, h + 6);
        }
        UI.panel(ctx, bx, 8, w, h, { p: 2, fill });
        PB.Pokeball.draw(ctx, bx + 22, 28, 1.3, {});
        this.outlined(String(n), bx + 42, 39, 30, full ? '#ffe066' : '#ffffff', 'left');
        this.outlined('/' + R, bx + 44 + (n >= 10 ? 30 : 16), 39, 16, 'rgba(255,255,255,0.75)', 'left');
        if (full) this.outlined(PB.T(ours ? '¡Tenéis {n}!' : '¡Tienen {n}!', { n }), bx + w / 2, h + 24, 13, ours ? '#9fd0ff' : '#ffb0a8');
      };
      counter(10 + S.l + 58, mine, 'rgba(30,70,150,0.9)', false, true);
      counter(W - 10 - S.r, theirs, 'rgba(150,30,40,0.9)', true, false);
      clock(28);
      if (game.countdown) {
        const ours = game.countdown.team === team;
        UI.panel(ctx, cx - 110, 46, 220, 36, { p: 2, fill: ours ? 'rgba(30,70,150,0.85)' : 'rgba(140,30,40,0.85)' });
        this.outlined(String(Math.ceil(game.countdown.t)), cx - 80, 74, 26, '#ffffff');
        this.outlined(PB.T(ours ? '¡Aguantad!' : '¡Quitádselas!'), cx + 16, 71, 16, '#ffffff');
      }
    } else if (id === 'brawl') {
      // K.O. de cada equipo
      panel(220, 50);
      UI.panel(ctx, cx - 100, 13, 74, 36, { p: 2, fill: '#2a5ab8' });
      UI.panel(ctx, cx + 26, 13, 74, 36, { p: 2, fill: '#b83a3a' });
      this.outlined(String(game.kos[team]), cx - 63, 42, 30, '#ffffff');
      this.outlined('K.O.', cx, 38, 15, '#ffd23a');
      this.outlined(String(game.kos[foe]), cx + 63, 42, 30, '#ffffff');
      clock(78);
      if (game.overtime) this.outlined(PB.T('¡K.O. DE ORO!'), cx, 108, 18, '#ffd23a');
    } else if (id === 'knockout') {
      // rondas ganadas (puntos) y Pokémon que quedan en pie de cada equipo
      panel(260, 50);
      const dots = (x, n, col) => { for (let i = 0; i < 2; i++) { ctx.fillStyle = '#141824'; ctx.fillRect(x + i * 18 - 7, 15, 14, 14); ctx.fillStyle = i < n ? col : '#3a4466'; ctx.fillRect(x + i * 18 - 5, 17, 10, 10); } };
      dots(cx - 96, game.rounds[team], '#5aa8ff');
      dots(cx + 78, game.rounds[foe], '#ff6060');
      this.outlined(PB.T('Ronda {n}', { n: game.round }), cx, 30, 17, '#ffd23a');
      const alive = (t) => game.brawlers.filter((b) => b.team === t && !b.dead).length;
      this.outlined('●'.repeat(alive(team)) + '○'.repeat(3 - alive(team)), cx - 70, 46, 13, '#8ec2ff');
      this.outlined('●'.repeat(alive(foe)) + '○'.repeat(3 - alive(foe)), cx + 70, 46, 13, '#ff9a9a');
      if (!game.roundEnd && game.startT <= 0) {
        const left = Math.max(0, game.mode.roundTime - game.roundT);
        UI.panel(ctx, cx - 34, 63, 68, 22, { p: 2, fill: left < 10 ? 'rgba(150,30,30,0.9)' : 'rgba(16,24,56,0.86)' });
        this.outlined('0:' + String(Math.ceil(left)).padStart(2, '0'), cx, 79, 14, '#ffffff');
      }
    } else if (id === 'showdown' || id === 'duo') {
      const alive = id === 'duo' ? new Set(game.brawlers.filter((b) => !b.dead).map((b) => b.team)).size : game.brawlers.filter((b) => !b.dead).length;
      const wide = id === 'duo' ? 60 : 0;
      panel(200 + wide, 42);
      PB.Pokeball.draw(ctx, cx - 66 - wide / 2, 27, 1.4, {});
      this.outlined(PB.T(id === 'duo' ? 'Quedan {n} parejas' : 'Quedan {n}', { n: alive }), cx + 10, 34, 20, '#ffffff');
      const me = view.player;
      if (me && !me.dead && Math.hypot(me.x - game.gas.x, me.y - game.gas.y) > game.gas.r) {
        UI.panel(ctx, cx - 110, 58, 220, 30, { p: 2, fill: 'rgba(90,30,120,0.9)' });
        this.outlined(PB.T('¡Sal de la niebla!'), cx, 79, 18, Math.floor(game.clock * 4) % 2 ? '#e8b0ff' : '#ffffff');
      }
    } else if (id === 'heist') {
      const m = game.structures.find((s2) => s2.team === team), t2 = game.structures.find((s2) => s2.team !== team);
      bars('Snorlax', m.hp / m.maxHp, t2.hp / t2.maxHp, Math.ceil((100 * m.hp) / m.maxHp) + '%', Math.ceil((100 * t2.hp) / t2.maxHp) + '%');
      clock(88);
    } else if (id === 'ball') {
      panel(190, 50);
      UI.panel(ctx, cx - 86, 13, 64, 36, { p: 2, fill: '#2a5ab8' });
      UI.panel(ctx, cx + 22, 13, 64, 36, { p: 2, fill: '#b83a3a' });
      this.outlined(String(game.score[team]), cx - 54, 42, 30, '#ffffff');
      this.outlined('-', cx, 40, 24, '#ffd23a');
      this.outlined(String(game.score[foe]), cx + 54, 42, 30, '#ffffff');
      clock(78);
      if (game.overtime) this.outlined(PB.T('¡GOL DE ORO!'), cx, 108, 18, '#ffd23a');
      const v = game.voltorb, me = view.player;
      if (me && v.carrier === me) {
        const left = Math.max(0, 10 - v.holdT);
        UI.panel(ctx, cx - 150, 98, 300, 28, { p: 2, fill: left < 4 ? 'rgba(150,30,30,0.9)' : 'rgba(16,24,56,0.86)' });
        this.outlined(PB.T('¡Chuta! Voltorb explota en {n} s', { n: left.toFixed(1) }), cx, 117, 15, left < 4 ? '#ffd0c0' : '#fff36a');
      }
    } else if (id === 'zone') {
      bars('Territorio', game.progress[team] / 100, game.progress[foe] / 100, Math.floor(game.progress[team]) + '%', Math.floor(game.progress[foe]) + '%');
      clock(88);
    }
  }

  drawDesktopSuper(me, game) {
    this.superButton(this.cw - 72, this.ch - 72, 44, me.superCharge, game.clock, document.body.classList.contains('pad') ? 'LT' : 'E');
  }

  // Botón de súper pixel: anillo con 16 casillas que se van encendiendo y un rayo en el centro
  superButton(x, y, r, charge, t, key) {
    const ctx = this.ctx;
    const UI = PB.PixUI;
    const ready = charge >= 1;
    if (ready) this.glow(x, y, r * 1.8, `rgba(255,200,40,${0.4 + Math.sin(t * 6) * 0.2})`);
    const base = UI.ring(r, 6, ready ? '#ffd23a' : '#4a5478', ready ? 'rgba(255,190,30,0.95)' : 'rgba(10,15,40,0.65)');
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(base, Math.round(x - base.width / 2), Math.round(y - base.height / 2));
    const n = 16, lit = Math.floor(Math.min(1, charge) * n);
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (i / n) * Math.PI * 2;
      const sx = Math.round((x + Math.cos(a) * (r - 7)) / 3) * 3, sy = Math.round((y + Math.sin(a) * (r - 7)) / 3) * 3;
      ctx.fillStyle = i < lit ? (ready ? '#fff6a8' : '#ffd23a') : 'rgba(0,0,0,0.45)';
      ctx.fillRect(sx - 3, sy - 3, 6, 6);
    }
    UI.icon(ctx, 'bolt', x - 18, y - 22, 3);
    this.outlined(PB.T('SÚPER'), x, y + 22, 12, ready ? '#3a2500' : '#ffd23a');
    if (key) {
      UI.panel(ctx, x - 12, y + r + 2, 24, 22, { p: 2, fill: '#2c3f78' });
      this.outlined(key, x, y + r + 18, 12, '#ffffff');
    }
  }

  drawDesktopSuperHint(view) {
    const inp = view.inputState;
    if (!inp || view.touch) return;
    if (inp.superKeyHeld && view.player && view.player.superCharge >= 1) {
      this.outlined(PB.T('Suelta E para lanzar · X o clic derecho para cancelar'), this.cw / 2, this.ch - 22, 14, '#ffe066');
    } else if (inp.superCancelled && performance.now() - inp.superCancelled < 900) {
      this.outlined(PB.T('Súper cancelado'), this.cw / 2, this.ch - 22, 15, '#ffb0b0');
    }
  }

  drawTouch(view, me, game) {
    const ctx = this.ctx, inp = view.inputState;
    const UI = PB.PixUI;
    const L = inp.layout(this.cw, this.ch);
    ctx.imageSmoothingEnabled = false;
    const stick = (base, knob, r, col) => {
      const b = UI.ring(r, 6, 'rgba(255,255,255,0.4)', 'rgba(10,15,40,0.35)');
      ctx.drawImage(b, Math.round(base.x - b.width / 2), Math.round(base.y - b.height / 2));
      const k = UI.ring(Math.round(r * 0.42), 6, 'rgba(255,255,255,0.9)', col);
      ctx.drawImage(k, Math.round(knob.x - k.width / 2), Math.round(knob.y - k.height / 2));
    };
    const mv = inp.sticks.move;
    stick(mv ? mv.origin : L.move, mv ? mv.pos : L.move, L.r, 'rgba(200,210,240,0.85)');
    const at = inp.sticks.attack;
    stick(at ? at.origin : L.attack, at ? at.pos : L.attack, L.r, 'rgba(255,150,40,0.95)');
    // munición: tres barras pixel encima del joystick de ataque
    const aw = 22;
    for (let i = 0; i < 3; i++) {
      const f = Math.max(0, Math.min(1, me.ammo - i));
      UI.bar(ctx, L.attack.x - (aw * 3 + 8) / 2 + i * (aw + 4), L.attack.y - L.r - 22, aw, 10, f, f >= 1 ? '#ff9a1f' : '#b8702a', { p: 2 });
    }
    this.superButton(L.super.x, L.super.y, L.sr, me.superCharge, game.clock, '');
    const sp = inp.sticks.super;
    if (sp) stick(sp.origin, sp.pos, L.sr, view.aim && view.aim.cancel ? 'rgba(230,60,50,0.95)' : 'rgba(255,210,40,0.95)');
    // súper devuelto al centro: se cancela al soltar
    if (view.aim && view.aim.cancel) {
      UI.panel(ctx, L.super.x - 56, L.super.y - L.sr - 40, 112, 26, { p: 2, fill: 'rgba(150,30,30,0.92)' });
      this.outlined(PB.T('✕ Cancelar'), L.super.x, L.super.y - L.sr - 21, 15, '#ffffff');
    }
    if (inp.superCancelled && performance.now() - inp.superCancelled < 900) {
      this.outlined(PB.T('Súper cancelado'), L.super.x, L.super.y - L.sr - 21, 15, '#ffb0b0');
    }
  }

  roundRect(x, y, w, h, r) {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
};
