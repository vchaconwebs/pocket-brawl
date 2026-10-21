// Dibujado en Canvas 2D.
PB.Renderer = class {
  constructor(canvas) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d');
    this.cam = { x: 0, y: 0, scale: 1 };
    this.floor = null;
    this.floorFor = null;
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
        // briznas de hierba
        c.fillStyle = 'rgba(40,110,40,0.25)';
        const seed = (r * 31 + col * 17) % 7;
        for (let i = 0; i < 3; i++) c.fillRect(x + ((seed * 9 + i * 19) % 56) + 4, y + ((seed * 13 + i * 23) % 52) + 6, 3, 6);
        if (world.tile(col, r) === '~') {
          c.fillStyle = '#3aa3e0';
          c.fillRect(x, y, T, T);
          c.fillStyle = '#5fbdf0';
          c.fillRect(x + 6, y + 6, T - 12, T - 12);
        }
      }
    }
    // bases y mina
    const pad = (sp, col) => {
      for (const s of sp) {
        c.fillStyle = col;
        c.beginPath();
        c.arc(s.x, s.y, 30, 0, Math.PI * 2);
        c.fill();
      }
    };
    pad(world.spawns.blue, 'rgba(60,140,255,0.35)');
    pad(world.spawns.red, 'rgba(255,70,70,0.35)');
    const m = world.mine;
    c.fillStyle = '#5b4a3a';
    c.beginPath();
    c.ellipse(m.x, m.y, 48, 36, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#2b2119';
    c.beginPath();
    c.ellipse(m.x, m.y + 4, 30, 20, 0, 0, Math.PI * 2);
    c.fill();
    this.floor = cv;
    this.floorFor = world.version;
  }

  draw(game, view) {
    const ctx = this.ctx, T = PB.TILE, W = game.world;
    if (this.floorFor !== W.version || !this.floor) this.buildFloor(W);
    const focus = view.focus;
    const team = view.team;
    const t = game.time;

    // cámara
    // con controles táctiles, el jugador se coloca más arriba para que no lo tapen los joysticks
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

    // límites visibles (en casillas)
    const vx0 = this.cam.x - halfW - T, vx1 = this.cam.x + halfW + T;
    const vy0 = this.cam.y - halfH - T * 2, vy1 = this.cam.y + halfH + T;
    const c0 = Math.max(-1, Math.floor(vx0 / T)), c1 = Math.min(W.w, Math.ceil(vx1 / T));
    const r0 = Math.max(-1, Math.floor(vy0 / T)), r1 = Math.min(W.h, Math.ceil(vy1 / T));

    ctx.drawImage(this.floor, 0, 0);
    // borde del mapa
    ctx.fillStyle = '#1f4a2c';
    ctx.fillRect(-400, -400, W.pixelW + 800, 400);
    ctx.fillRect(-400, W.pixelH, W.pixelW + 800, 400);
    ctx.fillRect(-400, 0, 400, W.pixelH);
    ctx.fillRect(W.pixelW, 0, 400, W.pixelH);

    // brillo del agua
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    for (let r = r0; r < r1; r++) for (let c = c0; c < c1; c++) {
      if (W.tile(c, r) !== '~') continue;
      const o = Math.sin(t * 2 + c + r) * 6;
      ctx.fillRect(c * T + 14 + o, r * T + 22, 14, 3);
      ctx.fillRect(c * T + 34 - o, r * T + 42, 12, 3);
    }

    // zonas
    for (const z of game.zones) {
      const a = 0.25 + Math.sin(t * 6) * 0.06;
      ctx.fillStyle = z.team === team ? `rgba(90,220,120,${a})` : `rgba(160,220,60,${a})`;
      ctx.beginPath();
      ctx.arc(z.x, z.y, z.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(40,140,40,0.7)';
      ctx.lineWidth = 3;
      ctx.stroke();
    }

    // indicador de apuntado (debajo de los personajes)
    if (view.aim && focus && !focus.dead) this.drawAim(focus, view.aim);

    // objetos ordenados por Y: muros, luchadores, gemas
    const items = [];
    for (let r = r0; r < r1; r++) for (let c = c0; c < c1; c++) {
      if (W.tile(c, r) === '#') items.push({ k: 'wall', y: r * T + T, c, r });
    }
    for (const b of game.brawlers) {
      if (b.dead || !game.visibleTo(b, team)) continue;
      items.push({ k: 'b', y: b.y, b });
    }
    for (const g of game.gems) items.push({ k: 'gem', y: g.y, g });
    items.sort((a, b) => a.y - b.y);
    for (const it of items) {
      if (it.k === 'wall') this.drawWall(it.c, it.r);
      else if (it.k === 'gem') this.drawGem(it.g, t);
      else this.drawBrawler(it.b, game, team);
    }

    // proyectiles
    for (const p of game.projectiles) this.drawShot(p, t);

    // arbustos (por encima)
    for (let r = r0; r < r1; r++) for (let c = c0; c < c1; c++) {
      if (W.tile(c, r) !== 'b') continue;
      const cx = c * T + T / 2, cy = r * T + T / 2;
      const near = focus && !focus.dead && Math.hypot(focus.x - cx, focus.y - cy) < 110;
      this.drawBush(c, r, near ? 0.45 : 1);
    }
    // aliados dentro de arbustos se ven en semitransparente
    for (const b of game.brawlers) {
      if (b.dead || b.team !== team || !game.inBush(b)) continue;
      ctx.globalAlpha = 0.5;
      this.drawBrawler(b, game, team, true);
      ctx.globalAlpha = 1;
    }

    // partículas
    for (const p of game.particles) {
      ctx.globalAlpha = 1 - p.t / p.life;
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;

    // barras de vida y nombres
    for (const b of game.brawlers) {
      if (b.dead || !game.visibleTo(b, team)) continue;
      this.drawOverhead(b, game, team, focus);
    }

    // textos de daño y ondas
    ctx.textAlign = 'center';
    for (const tx of game.texts) {
      const k = tx.t / tx.life;
      if (tx.ring) {
        ctx.strokeStyle = `rgba(255,255,255,${1 - k})`;
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.arc(tx.x, tx.y, tx.r * (0.4 + k * 0.6), 0, Math.PI * 2);
        ctx.stroke();
        continue;
      }
      ctx.globalAlpha = 1 - k * k;
      ctx.font = `bold ${tx.size}px "Lilita One", system-ui, sans-serif`;
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#000';
      ctx.strokeText(tx.text, tx.x, tx.y);
      ctx.fillStyle = tx.color;
      ctx.fillText(tx.text, tx.x, tx.y);
    }
    ctx.globalAlpha = 1;

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.drawHud(game, view);
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

  drawBush(c, r, alpha) {
    const ctx = this.ctx, T = PB.TILE, x = c * T, y = r * T;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#2f8f3a';
    ctx.fillRect(x, y - 10, T, T + 4);
    ctx.fillStyle = '#3fae48';
    for (const [ox, oy, rr] of [[16, 6, 18], [46, 4, 18], [30, 24, 20], [12, 40, 16], [50, 40, 16]]) {
      ctx.beginPath();
      ctx.arc(x + ox, y + oy - 6, rr, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#5cc964';
    ctx.beginPath();
    ctx.arc(x + 22, y - 6, 6, 0, Math.PI * 2);
    ctx.arc(x + 44, y + 14, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  drawGem(g, t) {
    const ctx = this.ctx, y = g.y - 14 + Math.sin(g.bob * 4) * 3;
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(g.x, g.y, 10, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#c04dff';
    ctx.beginPath();
    ctx.moveTo(g.x, y - 12);
    ctx.lineTo(g.x + 10, y);
    ctx.lineTo(g.x, y + 12);
    ctx.lineTo(g.x - 10, y);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#ecb8ff';
    ctx.beginPath();
    ctx.moveTo(g.x, y - 12);
    ctx.lineTo(g.x + 4, y - 2);
    ctx.lineTo(g.x - 4, y - 2);
    ctx.closePath();
    ctx.fill();
  }

  drawBrawler(b, game, team, ghostPass) {
    const ctx = this.ctx;
    const col = b.team === 'blue' ? '#3d8bff' : '#ff4d4d';
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
    }
    let anim = b.moving ? 'Walk' : 'Idle', len = 0, at = b.animT;
    if (b.action) { anim = b.action.anim; len = b.action.len; at = b.action.t; }
    if (b.hurtT > 0 && !b.action) anim = 'Hurt';
    const prev = ctx.globalAlpha;
    if (b.stealthT > 0) ctx.globalAlpha = prev * 0.35;
    if (b.hurtT > 0 && Math.floor(b.hurtT * 30) % 2) ctx.globalAlpha *= 0.6;
    PB.Sprites.draw(ctx, b.def.dex, anim, b.facing, at, b.x, b.y, 2, len);
    ctx.globalAlpha = prev;
    if (b.shieldT > 0 && !ghostPass) {
      ctx.strokeStyle = 'rgba(150,220,255,0.8)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(b.x, b.y - 14, 36, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (b.stunT > 0 && !ghostPass) {
      ctx.fillStyle = '#ffe14d';
      for (let i = 0; i < 3; i++) {
        const a = game.time * 6 + (i * Math.PI * 2) / 3;
        ctx.fillRect(b.x + Math.cos(a) * 20 - 3, b.y - 62 + Math.sin(a) * 6, 6, 6);
      }
    }
  }

  drawOverhead(b, game, team, focus) {
    const ctx = this.ctx;
    const x = b.x, y = b.y - 70;
    const w = 64;
    const mine = b.team === team;
    const isMe = b === focus && b.isPlayer;
    ctx.textAlign = 'center';
    ctx.font = 'bold 13px "Lilita One", system-ui, sans-serif';
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#000';
    ctx.strokeText(b.name, x, y - 12);
    ctx.fillStyle = isMe ? '#7dff8f' : mine ? '#a9d0ff' : '#ffb0b0';
    ctx.fillText(b.name, x, y - 12);
    ctx.fillStyle = '#111';
    ctx.fillRect(x - w / 2 - 2, y - 2, w + 4, 12);
    ctx.fillStyle = isMe ? '#43e05a' : mine ? '#3d8bff' : '#ff4545';
    ctx.fillRect(x - w / 2, y, (w * Math.max(0, b.hp)) / b.maxHp, 8);
    ctx.font = 'bold 10px system-ui, sans-serif';
    ctx.fillStyle = '#fff';
    ctx.fillText(Math.ceil(b.hp), x, y + 8);
    if (isMe) {
      const seg = (w - 4) / 3;
      for (let i = 0; i < 3; i++) {
        ctx.fillStyle = '#222';
        ctx.fillRect(x - w / 2 + i * (seg + 2), y + 12, seg, 5);
        const f = Math.max(0, Math.min(1, b.ammo - i));
        ctx.fillStyle = f >= 1 ? '#ff9a1f' : '#a5652a';
        ctx.fillRect(x - w / 2 + i * (seg + 2), y + 12, seg * f, 5);
      }
    }
    if (b.gems > 0) {
      ctx.fillStyle = '#c04dff';
      ctx.beginPath();
      ctx.moveTo(x - 46, y - 2);
      ctx.lineTo(x - 40, y + 4);
      ctx.lineTo(x - 46, y + 10);
      ctx.lineTo(x - 52, y + 4);
      ctx.fill();
      ctx.font = 'bold 13px "Lilita One", system-ui, sans-serif';
      ctx.strokeText(b.gems, x - 46, y - 6);
      ctx.fillStyle = '#fff';
      ctx.fillText(b.gems, x - 46, y - 6);
    }
    if (b.superCharge >= 1) {
      ctx.strokeStyle = `rgba(255,210,40,${0.5 + Math.sin(game.time * 8) * 0.3})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(b.x, b.y + 6, 32, 14, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  drawShot(p, t) {
    const ctx = this.ctx;
    if (p.lob) {
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, 12, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      // marca de impacto
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.tx, p.ty, p.atk.radius, 0, Math.PI * 2);
      ctx.stroke();
      const y = p.y - p.z - 10;
      if (p.fx === 'rock') {
        ctx.fillStyle = '#8b7a5c';
        ctx.beginPath();
        ctx.arc(p.x, y, 14, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#b5a17a';
        ctx.beginPath();
        ctx.arc(p.x - 4, y - 4, 6, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillStyle = '#5a3a1a';
        ctx.beginPath();
        ctx.arc(p.x, y, 9, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#7dff7a';
        ctx.fillRect(p.x - 2, y - 14, 4, 8);
      }
      return;
    }
    const big = p.isSuper ? 1.4 : 1;
    switch (p.fx) {
      case 'fire':
        ctx.fillStyle = 'rgba(255,120,30,0.5)';
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * 1.3 * big, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffd25a';
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * 0.7 * big, 0, Math.PI * 2);
        ctx.fill();
        break;
      case 'water':
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.ang);
        ctx.fillStyle = 'rgba(80,170,255,0.55)';
        ctx.beginPath();
        ctx.ellipse(-p.r * 1.2, 0, p.r * 2.2, p.r * 0.9, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#d9f1ff';
        ctx.beginPath();
        ctx.ellipse(0, 0, p.r, p.r * 0.6, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        break;
      case 'leaf':
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(t * 20);
        ctx.fillStyle = '#4fd14a';
        ctx.beginPath();
        ctx.ellipse(0, 0, p.r * 1.3, p.r * 0.55, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        break;
      case 'electric': {
        ctx.strokeStyle = '#fff27a';
        ctx.lineWidth = 4;
        ctx.beginPath();
        const bx = Math.cos(p.ang), by = Math.sin(p.ang);
        ctx.moveTo(p.x - bx * 26, p.y - by * 26);
        for (let i = 1; i <= 3; i++) {
          const j = (Math.random() - 0.5) * 12;
          ctx.lineTo(p.x - bx * (26 - i * 9) - by * j, p.y - by * (26 - i * 9) + bx * j);
        }
        ctx.stroke();
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * 0.7, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 'ghost':
        ctx.fillStyle = 'rgba(80,30,140,0.6)';
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * 1.25, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#b48cff';
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * 0.75, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#20083a';
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * 0.35, 0, Math.PI * 2);
        ctx.fill();
        break;
      default:
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
    }
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

  drawHud(game, view) {
    const ctx = this.ctx, W = this.cw, H = this.ch;
    const team = view.team;
    const foe = team === 'blue' ? 'red' : 'blue';
    const mine = game.teamGems(team), theirs = game.teamGems(foe);
    // marcador de gemas
    ctx.textAlign = 'center';
    const cx = W / 2;
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    this.roundRect(cx - 120, 10, 240, 46, 14);
    ctx.fill();
    ctx.font = '28px "Lilita One", system-ui, sans-serif';
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#000';
    ctx.fillStyle = '#5aa8ff';
    ctx.strokeText(mine, cx - 60, 45);
    ctx.fillText(mine, cx - 60, 45);
    ctx.fillStyle = '#ff5f5f';
    ctx.strokeText(theirs, cx + 60, 45);
    ctx.fillText(theirs, cx + 60, 45);
    ctx.fillStyle = '#c04dff';
    ctx.beginPath();
    ctx.moveTo(cx, 18); ctx.lineTo(cx + 13, 33); ctx.lineTo(cx, 48); ctx.lineTo(cx - 13, 33);
    ctx.fill();
    // tiempo
    const left = Math.max(0, game.rules.matchTime - game.time);
    ctx.font = '14px "Lilita One", system-ui, sans-serif';
    ctx.fillStyle = '#fff';
    ctx.fillText(Math.floor(left / 60) + ':' + String(Math.floor(left % 60)).padStart(2, '0'), cx, 72);
    if (game.countdown) {
      const ours = game.countdown.team === team;
      ctx.font = '42px "Lilita One", system-ui, sans-serif';
      ctx.fillStyle = ours ? '#5aa8ff' : '#ff5f5f';
      ctx.strokeText(Math.ceil(game.countdown.t), cx, 120);
      ctx.fillText(Math.ceil(game.countdown.t), cx, 120);
      ctx.font = '15px "Lilita One", system-ui, sans-serif';
      ctx.fillStyle = '#fff';
      ctx.strokeText(ours ? '¡Aguantad las gemas!' : '¡Quitadles las gemas!', cx, 142);
      ctx.fillText(ours ? '¡Aguantad las gemas!' : '¡Quitadles las gemas!', cx, 142);
    }
    // registro de K.O.
    ctx.textAlign = 'right';
    ctx.font = '14px "Lilita One", system-ui, sans-serif';
    game.feed.forEach((f, i) => {
      const age = game.time - f.t;
      if (age > 5) return;
      ctx.globalAlpha = Math.min(1, 5 - age);
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      const tw = ctx.measureText(f.text).width + 16;
      ctx.fillRect(W - tw - 10, 12 + i * 24, tw, 20);
      ctx.fillStyle = f.team === team ? '#9fcbff' : '#ffaaaa';
      ctx.fillText(f.text, W - 18, 27 + i * 24);
    });
    ctx.globalAlpha = 1;

    const me = view.player;
    if (me) {
      if (me.dead) {
        ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.fillRect(0, H / 2 - 40, W, 70);
        ctx.font = '30px "Lilita One", system-ui, sans-serif';
        ctx.fillStyle = '#fff';
        ctx.fillText('Reapareces en ' + Math.ceil(me.respawnT), W / 2, H / 2 + 8);
      }
      if (view.touch) this.drawTouch(view, me);
      else this.drawDesktopSuper(me);
    }
  }

  drawDesktopSuper(me) {
    const ctx = this.ctx, x = this.cw - 70, y = this.ch - 70;
    this.superCircle(x, y, 44, me.superCharge, 'E');
  }

  superCircle(x, y, r, charge, label) {
    const ctx = this.ctx;
    const ready = charge >= 1;
    ctx.fillStyle = ready ? 'rgba(255,200,30,0.9)' : 'rgba(0,0,0,0.45)';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffd23a';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(x, y, r - 3, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, charge));
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.font = '16px "Lilita One", system-ui, sans-serif';
    ctx.fillStyle = ready ? '#3a2500' : '#ffd23a';
    ctx.fillText('SÚPER', x, y + 2);
    if (label) {
      ctx.font = '11px system-ui, sans-serif';
      ctx.fillText(label, x, y + 18);
    }
  }

  drawTouch(view, me) {
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
    const sp = inp.sticks.super;
    this.superCircle(L.super.x, L.super.y, L.sr, me.superCharge, '');
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
