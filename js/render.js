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
    this.cv.width = Math.round(this.cw * dpr);
    this.cv.height = Math.round(this.ch * dpr);
    this.cv.style.width = this.cw + 'px';
    this.cv.style.height = this.ch + 'px';
    // cuánto mundo se ve: ~1050x720 en PC, menos en móvil horizontal para que no se vea todo diminuto
    const portrait = this.ch > this.cw;
    const touch = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
    let vw = 1050, vh = 720;
    if (portrait) { vw = 520; vh = 1000; }
    else if (touch) { vw = 820; vh = 480; }
    this.cam.scale = Math.min(this.cw / vw, this.ch / vh);
  }

  toWorld(sx, sy) {
    const c = this.cam;
    return { x: (sx - this.cw / 2) / c.scale + c.x, y: (sy - this.ch / 2) / c.scale + c.y };
  }

  announce(text, color, sub, life) {
    this.banner = { text, color: color || '#ffffff', sub: sub || '', t: 0, life: life || 1.4 };
  }

  // Suelo y agua pre-dibujados en un canvas aparte (se rehace si se rompe un muro).
  buildFloor(world) {
    const T = PB.TILE;
    const cv = document.createElement('canvas');
    cv.width = world.pixelW;
    cv.height = world.pixelH;
    const c = cv.getContext('2d');
    for (let r = 0; r < world.h; r++) {
      for (let col = 0; col < world.w; col++) {
        const x = col * T, y = r * T;
        c.fillStyle = (r + col) % 2 ? '#7cc95a' : '#86d163';
        c.fillRect(x, y, T, T);
        c.fillStyle = 'rgba(40,110,40,0.25)';
        const seed = (r * 31 + col * 17) % 7;
        for (let i = 0; i < 3; i++) c.fillRect(x + ((seed * 9 + i * 19) % 56) + 4, y + ((seed * 13 + i * 23) % 52) + 6, 3, 6);
        if (seed === 3) {
          c.fillStyle = '#ffe36a';
          c.fillRect(x + 20, y + 30, 4, 4);
          c.fillStyle = '#ffffff';
          c.fillRect(x + 44, y + 14, 4, 4);
        }
        if (world.tile(col, r) === '~') {
          c.fillStyle = '#2f86c4';
          c.fillRect(x, y, T, T);
          c.fillStyle = '#3aa3e0';
          c.fillRect(x + 4, y + 4, T - 8, T - 8);
          c.fillStyle = '#5fbdf0';
          c.fillRect(x + 8, y + 8, T - 16, T - 20);
        }
      }
    }
    // bases de cada equipo
    for (const [sp, col] of [[world.spawns.blue, '60,140,255'], [world.spawns.red, '255,70,70']]) {
      for (const s of sp) {
        c.fillStyle = `rgba(${col},0.25)`;
        c.beginPath();
        c.arc(s.x, s.y, 34, 0, Math.PI * 2);
        c.fill();
        c.strokeStyle = `rgba(${col},0.6)`;
        c.lineWidth = 4;
        c.stroke();
      }
    }
    PB.Pokeball.drawPad(c, world.mine.x, world.mine.y, 46);
    this.floor = cv;
    this.floorFor = world.version;
  }

  draw(game, view) {
    const ctx = this.ctx, T = PB.TILE, W = game.world;
    if (this.floorFor !== W.version || !this.floor) this.buildFloor(W);
    const focus = view.focus;
    const team = view.team;
    const t = game.clock;

    // cámara (con controles táctiles en vertical, el jugador más arriba para que no lo tapen los joysticks)
    const lift = view.touch && this.ch > this.cw ? 150 : 0;
    if (focus) {
      this.cam.x += (focus.x - this.cam.x) * 0.15;
      this.cam.y += (focus.y + (lift || -40) - this.cam.y) * 0.15;
    }
    const halfW = this.cw / 2 / this.cam.scale, halfH = this.ch / 2 / this.cam.scale;
    this.cam.x = W.pixelW < halfW * 2 ? W.pixelW / 2 : Math.max(halfW - 60, Math.min(W.pixelW - halfW + 60, this.cam.x));
    this.cam.y = Math.max(halfH - 80, Math.min(W.pixelH - halfH + 80 + (lift ? lift + 60 : 0), this.cam.y));

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#2c5a3a';
    ctx.fillRect(0, 0, this.cv.width, this.cv.height);
    const s = this.cam.scale * this.dpr;
    const shx = (Math.random() - 0.5) * game.shake, shy = (Math.random() - 0.5) * game.shake;
    ctx.setTransform(s, 0, 0, s, (this.cw / 2 - this.cam.x * this.cam.scale + shx) * this.dpr, (this.ch / 2 - this.cam.y * this.cam.scale + shy) * this.dpr);
    ctx.imageSmoothingEnabled = false;

    const vx0 = this.cam.x - halfW - T, vx1 = this.cam.x + halfW + T;
    const vy0 = this.cam.y - halfH - T * 2, vy1 = this.cam.y + halfH + T;
    const c0 = Math.max(-1, Math.floor(vx0 / T)), c1 = Math.min(W.w, Math.ceil(vx1 / T));
    const r0 = Math.max(-1, Math.floor(vy0 / T)), r1 = Math.min(W.h, Math.ceil(vy1 / T));
    const inView = (x, y, m) => x > vx0 - m && x < vx1 + m && y > vy0 - m && y < vy1 + m;

    ctx.drawImage(this.floor, 0, 0);
    ctx.fillStyle = '#1f4a2c';
    ctx.fillRect(-400, -400, W.pixelW + 800, 400);
    ctx.fillRect(-400, W.pixelH, W.pixelW + 800, 400);
    ctx.fillRect(-400, 0, 400, W.pixelH);
    ctx.fillRect(W.pixelW, 0, 400, W.pixelH);

    // brillo del agua
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    for (let r = r0; r < r1; r++) for (let c = c0; c < c1; c++) {
      if (W.tile(c, r) !== '~') continue;
      const o = Math.sin(t * 2 + c + r) * 6;
      ctx.fillRect(c * T + 14 + o, r * T + 22, 14, 3);
      ctx.fillRect(c * T + 34 - o, r * T + 42, 12, 3);
    }

    // botón de la plataforma central que se ilumina al soltar una Pokéball
    const m = W.mine;
    const glow = 0.35 + Math.sin(t * 3) * 0.15 + game.padGlow;
    ctx.fillStyle = `rgba(255,250,200,${Math.min(1, glow)})`;
    ctx.beginPath();
    ctx.arc(m.x, m.y, 11, 0, Math.PI * 2);
    ctx.fill();
    if (game.padGlow > 0) this.glow(m.x, m.y, 70 * game.padGlow + 20, 'rgba(255,255,220,0.8)');

    // grietas del suelo (Magnitud)
    for (const f of game.fx) if (f.kind === 'crack') this.drawCrack(f);

    // zonas (Drenadoras)
    for (const z of game.zones) this.drawZone(z, t, team);

    // indicador de apuntado (debajo de los personajes)
    if (view.aim && focus && !focus.dead && game.started) this.drawAim(focus, view.aim);

    // objetos ordenados por Y
    const items = [];
    for (let r = r0; r < r1; r++) for (let c = c0; c < c1; c++) {
      if (W.tile(c, r) === '#') items.push({ k: 'wall', y: r * T + T, c, r });
    }
    for (const b of game.brawlers) {
      if (b.dead || !game.visibleTo(b, team)) continue;
      items.push({ k: 'b', y: b.y, b });
    }
    for (const g of game.balls) if (inView(g.x, g.y, 40)) items.push({ k: 'ball', y: g.y, g });
    for (const f of game.fx) {
      if (f.kind === 'faint' || f.kind === 'release' || f.kind === 'ghost') items.push({ k: f.kind, y: f.y, f });
    }
    items.sort((a, b) => a.y - b.y);
    for (const it of items) {
      if (it.k === 'wall') this.drawWall(it.c, it.r);
      else if (it.k === 'ball') this.drawBall(it.g);
      else if (it.k === 'b') this.drawBrawler(it.b, game, team);
      else if (it.k === 'faint') this.drawFaint(it.f);
      else if (it.k === 'release') this.drawRelease(it.f);
      else if (it.k === 'ghost') this.drawGhost(it.f);
    }

    // proyectiles
    for (const p of game.projectiles) if (inView(p.x, p.y, 80)) this.drawShot(p, t);

    // arbustos (por encima)
    for (let r = r0; r < r1; r++) for (let c = c0; c < c1; c++) {
      if (W.tile(c, r) !== 'b') continue;
      const cx = c * T + T / 2, cy = r * T + T / 2;
      const near = focus && !focus.dead && Math.hypot(focus.x - cx, focus.y - cy) < 110;
      this.drawBush(c, r, near ? 0.45 : 1, t);
    }
    // aliados dentro de arbustos se ven en semitransparente
    for (const b of game.brawlers) {
      if (b.dead || b.team !== team || !game.inBush(b)) continue;
      ctx.globalAlpha = 0.5;
      this.drawBrawler(b, game, team, true);
      ctx.globalAlpha = 1;
    }

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
      this.drawOverhead(b, game, team, focus);
    }

    // textos de daño
    ctx.textAlign = 'center';
    for (const f of game.fx) {
      if (f.kind !== 'text') continue;
      const k = f.t / f.life;
      const pop = k < 0.15 ? 0.6 + (k / 0.15) * 0.7 : 1.3 - Math.min(0.3, (k - 0.15) * 1.5);
      ctx.globalAlpha = 1 - k * k;
      ctx.font = `${Math.round(f.size * pop)}px "Lilita One", system-ui, sans-serif`;
      ctx.lineWidth = 5;
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#000';
      ctx.strokeText(f.text, f.x, f.y);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.drawHud(game, view);
  }

  // Brillo radial aditivo
  glow(x, y, r, color) {
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

  drawWall(c, r) {
    const ctx = this.ctx, T = PB.TILE, x = c * T, y = r * T, h = 20;
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(x + 4, y + T - 4, T, 10);
    ctx.fillStyle = '#8a5a34';
    ctx.fillRect(x, y + T - h, T, h);
    ctx.fillStyle = '#c98a4b';
    ctx.fillRect(x, y - h, T, T);
    ctx.fillStyle = '#dca062';
    ctx.fillRect(x + 4, y - h + 4, T - 8, T - 8);
    ctx.fillStyle = 'rgba(120,70,30,0.5)';
    ctx.fillRect(x + 4, y - h + T / 2 - 2, T - 8, 3);
    ctx.fillRect(x + T / 2 - 1, y - h + 4, 3, T / 2 - 4);
  }

  drawBush(c, r, alpha, t) {
    const ctx = this.ctx, T = PB.TILE, x = c * T, y = r * T;
    const sway = Math.sin(t * 1.5 + c * 0.7 + r) * 1.5;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#2f8f3a';
    ctx.fillRect(x, y - 10, T, T + 4);
    ctx.fillStyle = '#3fae48';
    for (const [ox, oy, rr] of [[16, 6, 18], [46, 4, 18], [30, 24, 20], [12, 40, 16], [50, 40, 16]]) {
      ctx.beginPath();
      ctx.arc(x + ox + sway * (oy < 20 ? 1 : 0.4), y + oy - 6, rr, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#5cc964';
    ctx.beginPath();
    ctx.arc(x + 22 + sway, y - 6, 6, 0, Math.PI * 2);
    ctx.arc(x + 44 + sway * 0.5, y + 14, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  drawBall(g) {
    const ctx = this.ctx;
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
    ctx.fillStyle = z.team === team ? `rgba(90,220,120,${a})` : `rgba(170,230,60,${a})`;
    ctx.beginPath();
    ctx.arc(z.x, z.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(30,110,30,0.8)';
    ctx.lineWidth = 4;
    ctx.setLineDash([14, 10]);
    ctx.lineDashOffset = -t * 30;
    ctx.stroke();
    ctx.setLineDash([]);
    // enredaderas
    ctx.strokeStyle = 'rgba(40,140,40,0.75)';
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
    PB.VFX.draw(ctx, 'blob', 'grass', z.x, z.y - 6, { scale: 1.6, frame: Math.floor(t * 4) });
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
      PB.Sprites.drawTint(ctx, b.def.dex, 'Idle', b.facing, at, b.x, b.y + (1 - k) * 10, sc, 0, '#ffffff', 1 - k * 0.6);
      return;
    }
    const prev = ctx.globalAlpha;
    if (b.stealthT > 0) ctx.globalAlpha = prev * 0.35;
    if (b.shieldT > 0) ctx.globalAlpha *= 0.75 + Math.sin(t * 20) * 0.25;
    if (b.flashT > 0) PB.Sprites.drawTint(ctx, b.def.dex, anim, b.facing, at, b.x, b.y, 2, len, '#ffffff', 0.85);
    else PB.Sprites.draw(ctx, b.def.dex, anim, b.facing, at, b.x, b.y, 2, len);
    ctx.globalAlpha = prev;

    if (ghostPass) return;
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
      const has = window.SPRITE_DATA[f.dex] && window.SPRITE_DATA[f.dex].anims.Faint;
      PB.Sprites.draw(ctx, f.dex, has ? 'Faint' : 'Hurt', f.facing, t, f.x, f.y, 2, has ? 0.7 : 0);
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
      PB.Sprites.drawTint(ctx, f.dex, 'Hurt', f.facing, 0, f.x, f.y - k * 34, 2 * (1 - k * 0.9), 0, '#ff3a28', 0.9);
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
    PB.Sprites.drawTint(this.ctx, f.dex, 'Attack', f.facing, 0.1, f.x, f.y, 2, 0.3, '#fff36a', 0.7);
    this.ctx.globalAlpha = 1;
  }

  drawOverhead(b, game, team, focus) {
    const ctx = this.ctx;
    const x = b.x, y = b.y - 72;
    const w = 66;
    const mine = b.team === team;
    const isMe = b === focus && b.isPlayer;
    ctx.textAlign = 'center';
    ctx.font = '13px "Lilita One", system-ui, sans-serif';
    ctx.lineWidth = 4;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#000';
    ctx.strokeText(b.name, x, y - 12);
    ctx.fillStyle = isMe ? '#7dff8f' : mine ? '#a9d0ff' : '#ffb0b0';
    ctx.fillText(b.name, x, y - 12);
    // vida
    ctx.fillStyle = '#111';
    ctx.fillRect(x - w / 2 - 2, y - 2, w + 4, 13);
    const hpk = Math.max(0, b.hp) / b.maxHp;
    ctx.fillStyle = isMe ? '#43e05a' : mine ? '#3d8bff' : '#ff4545';
    ctx.fillRect(x - w / 2, y, w * hpk, 9);
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.fillRect(x - w / 2, y, w * hpk, 3);
    ctx.font = 'bold 10px system-ui, sans-serif';
    ctx.lineWidth = 3;
    ctx.strokeText(Math.ceil(b.hp), x, y + 9);
    ctx.fillStyle = '#fff';
    ctx.fillText(Math.ceil(b.hp), x, y + 9);
    if (isMe) {
      const seg = (w - 4) / 3;
      for (let i = 0; i < 3; i++) {
        ctx.fillStyle = '#222';
        ctx.fillRect(x - w / 2 + i * (seg + 2), y + 13, seg, 6);
        const f = Math.max(0, Math.min(1, b.ammo - i));
        ctx.fillStyle = f >= 1 ? '#ff9a1f' : '#a5652a';
        ctx.fillRect(x - w / 2 + i * (seg + 2), y + 13, seg * f, 6);
      }
    }
    // Pokéballs que lleva encima
    if (b.balls > 0) {
      const n = Math.min(b.balls, 5);
      const bx = x - ((n - 1) * 13) / 2;
      for (let i = 0; i < n; i++) PB.Pokeball.draw(ctx, bx + i * 13, y - 34, 1, {});
      if (b.balls > 5 || b.balls > 1) {
        ctx.font = '15px "Lilita One", system-ui, sans-serif';
        ctx.lineWidth = 4;
        ctx.strokeText('×' + b.balls, x + (n * 13) / 2 + 14, y - 28);
        ctx.fillStyle = '#fff';
        ctx.fillText('×' + b.balls, x + (n * 13) / 2 + 14, y - 28);
      }
    }
  }

  drawShot(p, t) {
    const ctx = this.ctx;
    const look = p.look || {};
    const pal = PB.VFX.PAL[p.atkType] ? p.atkType : 'normal';
    const colors = PB.VFX.PAL[pal];
    const frame = Math.floor(p.t * 12);
    if (p.lob) {
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
      PB.VFX.draw(ctx, look.shape || 'rock', pal, p.x, y, { scale: look.scale || 1.4, angle: p.t * 10, frame });
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
    const color = aim.isSuper ? 'rgba(255,210,40,' : 'rgba(255,255,255,';
    const alpha = aim.strong ? 0.35 : 0.14;
    ctx.fillStyle = color + alpha + ')';
    ctx.strokeStyle = color + Math.min(1, alpha * 2.2) + ')';
    ctx.lineWidth = 2;
    const ang = aim.ang;
    if (a.kind === 'spread' || a.kind === 'burst') {
      const half = Math.max(a.spread || 0, 0.12) / 2 + 0.05;
      if ((a.count || 1) > 1) {
        ctx.beginPath();
        ctx.moveTo(b.x, b.y);
        ctx.arc(b.x, b.y, a.range, ang - half, ang + half);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      } else {
        const w = (a.r || 12) * 2 + 8;
        ctx.save();
        ctx.translate(b.x, b.y);
        ctx.rotate(ang);
        ctx.fillRect(0, -w / 2, a.range, w);
        ctx.strokeRect(0, -w / 2, a.range, w);
        ctx.restore();
      }
    } else if (a.kind === 'lob' || a.kind === 'zone') {
      const d = Math.min(aim.dist, a.range);
      const tx = b.x + Math.cos(ang) * d, ty = b.y + Math.sin(ang) * d;
      ctx.beginPath();
      ctx.arc(tx, ty, a.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.setLineDash([8, 8]);
      ctx.beginPath();
      ctx.moveTo(b.x, b.y);
      ctx.quadraticCurveTo((b.x + tx) / 2, (b.y + ty) / 2 - 80, tx, ty);
      ctx.stroke();
      ctx.setLineDash([]);
    } else if (a.kind === 'dash') {
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(ang);
      ctx.fillRect(0, -a.r, a.range, a.r * 2);
      ctx.strokeRect(0, -a.r, a.range, a.r * 2);
      ctx.restore();
    } else if (a.kind === 'slam') {
      ctx.beginPath();
      ctx.arc(b.x, b.y, a.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }

  outlined(text, x, y, size, color, align) {
    const ctx = this.ctx;
    ctx.textAlign = align || 'center';
    ctx.font = `${size}px "Lilita One", system-ui, sans-serif`;
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(3, size / 7);
    ctx.strokeStyle = '#0c1020';
    ctx.strokeText(text, x, y);
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
  }

  drawHud(game, view) {
    const ctx = this.ctx, W = this.cw, H = this.ch;
    const team = view.team;
    const foe = team === 'blue' ? 'red' : 'blue';
    const mine = game.teamBalls(team), theirs = game.teamBalls(foe);
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

    // marcador: 10 huecos de Pokéball por equipo
    const R = game.rules.ballsToWin;
    const px = W < 600 ? 1 : 1.2;
    const slot = 15 * px + 2;
    const panelW = slot * R + 70;
    const cx = W / 2;
    const rowY = (i) => 22 + i * 24;
    ctx.fillStyle = 'rgba(10,15,40,0.55)';
    this.roundRect(cx - panelW / 2, 6, panelW, 58, 14);
    ctx.fill();
    for (const [i, tm, n, col] of [[0, team, mine, '#5aa8ff'], [1, foe, theirs, '#ff5f5f']]) {
      const y = rowY(i);
      this.outlined(String(n), cx - panelW / 2 + 22, y + 8, 22, col);
      for (let s = 0; s < R; s++) {
        const x = cx - panelW / 2 + 46 + s * slot + slot / 2;
        if (s < n) PB.Pokeball.draw(ctx, x, y + 1, px, {});
        else PB.Pokeball.drawSlot(ctx, x, y + 1, px);
      }
      void tm;
    }
    const left = Math.max(0, game.rules.matchTime - game.time);
    this.outlined(Math.floor(left / 60) + ':' + String(Math.floor(left % 60)).padStart(2, '0'), cx, 82, 15, '#ffffff');

    if (game.countdown) {
      const ours = game.countdown.team === team;
      const pulse = 1 + Math.max(0, (game.countdown.t % 1) - 0.7) * 0.8;
      this.outlined(String(Math.ceil(game.countdown.t)), cx, 130, Math.round(44 * pulse), ours ? '#5aa8ff' : '#ff5f5f');
      this.outlined(ours ? '¡Aguantad las Pokéballs!' : '¡Quitadles las Pokéballs!', cx, 154, 16, '#ffffff');
    }

    // registro de K.O.
    ctx.font = '14px "Lilita One", system-ui, sans-serif';
    game.feed.forEach((f, i) => {
      const age = game.time - f.t;
      if (age > 5) return;
      ctx.globalAlpha = Math.min(1, 5 - age);
      const tw = ctx.measureText(f.text).width + 16;
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(W - tw - 10, 12 + i * 24, tw, 20);
      ctx.textAlign = 'right';
      ctx.fillStyle = f.team === team ? '#9fcbff' : '#ffaaaa';
      ctx.fillText(f.text, W - 18, 27 + i * 24);
    });
    ctx.globalAlpha = 1;

    // cuenta atrás inicial
    if (game.startT > 0) {
      const n = Math.ceil(game.startT);
      const k = 1 - (game.startT % 1 || 1);
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(0, 0, W, H);
      this.outlined(String(n), W / 2, H / 2 + 30, Math.round(110 * (1.4 - k * 0.4)), '#ffcf2e');
      this.outlined('Atrapa Pokéballs', W / 2, H / 2 - 60, 26, '#ffffff');
    }

    // anuncios grandes (¡A LUCHAR!, ¡K.O.!, ...)
    if (this.banner) {
      const b = this.banner;
      b.t += 1 / 60;
      const k = b.t / b.life;
      if (k >= 1) this.banner = null;
      else {
        const pop = k < 0.12 ? 0.5 + (k / 0.12) * 0.7 : k < 0.2 ? 1.2 - ((k - 0.12) / 0.08) * 0.2 : 1;
        ctx.globalAlpha = k > 0.8 ? (1 - k) / 0.2 : 1;
        this.outlined(b.text, W / 2, H * 0.36, Math.round(52 * pop), b.color);
        if (b.sub) this.outlined(b.sub, W / 2, H * 0.36 + 32, 18, '#ffffff');
        ctx.globalAlpha = 1;
      }
    }

    if (me) {
      if (me.dead) {
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.fillRect(0, H / 2 - 40, W, 70);
        this.outlined('Vuelves en ' + Math.ceil(me.respawnT), W / 2, H / 2 + 8, 30, '#ffffff');
      }
      if (view.touch) this.drawTouch(view, me, game);
      else this.drawDesktopSuper(me, game);
    }
  }

  drawDesktopSuper(me, game) {
    this.superCircle(this.cw - 70, this.ch - 70, 44, me.superCharge, 'E', game.clock);
  }

  superCircle(x, y, r, charge, label, t) {
    const ctx = this.ctx;
    const ready = charge >= 1;
    if (ready) this.glow(x, y, r * 1.8, `rgba(255,200,40,${0.4 + Math.sin(t * 6) * 0.2})`);
    ctx.fillStyle = ready ? 'rgba(255,200,30,0.95)' : 'rgba(0,0,0,0.45)';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffd23a';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(x, y, r - 3, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, charge));
    ctx.stroke();
    PB.VFX.draw(ctx, 'bolt', 'electric', x, y - 6, { scale: 1.3, angle: -Math.PI / 2.4, alpha: ready ? 1 : 0.5 });
    ctx.textAlign = 'center';
    ctx.font = '13px "Lilita One", system-ui, sans-serif';
    ctx.fillStyle = ready ? '#3a2500' : '#ffd23a';
    ctx.fillText('SÚPER', x, y + 18);
    if (label) {
      ctx.font = '11px system-ui, sans-serif';
      ctx.fillText(label, x, y + r + 14);
    }
  }

  drawTouch(view, me, game) {
    const ctx = this.ctx, inp = view.inputState;
    const L = inp.layout(this.cw, this.ch);
    const stick = (base, knob, r, col) => {
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.beginPath();
      ctx.arc(base.x, base.y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(knob.x, knob.y, r * 0.42, 0, Math.PI * 2);
      ctx.fill();
    };
    const mv = inp.sticks.move;
    stick(mv ? mv.origin : L.move, mv ? mv.pos : L.move, L.r, 'rgba(255,255,255,0.6)');
    const at = inp.sticks.attack;
    stick(at ? at.origin : L.attack, at ? at.pos : L.attack, L.r, 'rgba(255,160,40,0.85)');
    // munición alrededor del joystick de ataque
    for (let i = 0; i < 3; i++) {
      const f = Math.max(0, Math.min(1, me.ammo - i));
      const a0 = -Math.PI * 0.85 + i * 0.32;
      ctx.strokeStyle = 'rgba(0,0,0,0.4)';
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.arc(L.attack.x, L.attack.y, L.r + 9, a0, a0 + 0.28);
      ctx.stroke();
      ctx.strokeStyle = f >= 1 ? '#ff9a1f' : '#a5652a';
      ctx.beginPath();
      ctx.arc(L.attack.x, L.attack.y, L.r + 9, a0, a0 + 0.28 * f);
      ctx.stroke();
    }
    const sp = inp.sticks.super;
    this.superCircle(L.super.x, L.super.y, L.sr, me.superCharge, '', game.clock);
    if (sp) stick(sp.origin, sp.pos, L.sr, 'rgba(255,210,40,0.9)');
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
