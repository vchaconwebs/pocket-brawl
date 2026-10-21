// Bots: generan el mismo tipo de "input" que un jugador humano.
PB.Bot = class {
  constructor(game, b, skill) {
    this.g = game;
    this.b = b;
    this.skill = skill == null ? 0.45 : skill; // 0 = torpe, 1 = muy bueno
    this.path = [];
    this.goal = null;
    this.repathT = 0;
    this.strafe = Math.random() < 0.5 ? 1 : -1;
    this.strafeT = 0;
    this.fireT = 0.5;
    this.lastFoe = null;
    this.seenT = 0;
    this.reaction = 0.5;
    this.superWait = 0;
    this.stuckT = 0;
    this.lastPos = { x: b.x, y: b.y };
  }

  think(dt) {
    const g = this.g, b = this.b, W = g.world;
    const input = { mx: 0, my: 0, attack: null, super: null };
    if (b.dead) { this.path = []; return input; }

    this.repathT -= dt;
    this.strafeT -= dt;
    this.fireT -= dt;

    const atk = b.def.attack;
    const hpF = b.hp / b.maxHp;

    // enemigo visible más cercano
    let foe = null, fd = Infinity;
    for (const e of g.enemiesOf(b)) {
      if (!g.visibleTo(e, b.team)) continue;
      const d = Math.hypot(e.x - b.x, e.y - b.y);
      if (d < fd) { fd = d; foe = e; }
    }

    const closeRange = atk.range < 250;

    // el modo decide a dónde ir y qué atacar
    const plan = (g.mode.botPlan && g.mode.botPlan(this, { foe, fd, hpF })) || {};
    const carrying = g.voltorb && g.voltorb.carrier === b;
    let goal = plan.goal || null;
    let fight = false;
    if (plan.retreat) {
      if (foe && fd < atk.range) fight = true;
    } else if (foe && !plan.avoidFight && !carrying && fd < Math.max(atk.range * 0.95, closeRange ? 520 : 0)) {
      fight = true;
    }
    // con un objetivo prioritario (Snorlax), solo se pelea si el enemigo está muy encima
    if (fight && plan.focus && plan.target && foe && fd > atk.range * 0.55) fight = false;

    // objetivo que no es un luchador (Snorlax, caja)
    const tgt = plan.target || null;
    const tgtD = tgt ? Math.hypot(tgt.x - b.x, tgt.y - b.y) - (tgt.struct ? tgt.struct.r * 0.6 : 20) : Infinity;
    const tgtLos = tgt && (atk.kind === 'lob' || (tgt.crate ? W.los(b.x, b.y, tgt.x, tgt.y, tgt.crate.c, tgt.crate.r) : W.los(b.x, b.y, tgt.x, tgt.y)));

    // movimiento
    if (fight && foe && !plan.retreat) {
      if (this.strafeT <= 0) { this.strafe *= -1; this.strafeT = 0.6 + Math.random() * 1.2; }
      const ax = (foe.x - b.x) / fd, ay = (foe.y - b.y) / fd;
      let push = 0, side = 1;
      if (closeRange) {
        // los de corta distancia van directos a por el rival, zigzagueando poco
        push = fd > atk.range * 0.45 ? 1 : 0.2;
        side = fd > atk.range * 0.45 ? 0.35 : 1;
      } else push = fd < atk.range * 0.55 ? -0.8 : fd > atk.range * 0.85 ? 0.6 : 0;
      input.mx = -ay * this.strafe * side + ax * push;
      input.my = ax * this.strafe * side + ay * push;
      if (!W.los(b.x, b.y, foe.x, foe.y) && atk.kind !== 'lob') this.followTo(foe, input);
    } else if (tgt && tgtD < atk.range * 0.8 && tgtLos && !plan.retreat) {
      // a tiro del objetivo: quedarse y moverse un poco de lado
      if (this.strafeT <= 0) { this.strafe *= -1; this.strafeT = 0.8 + Math.random(); }
      const ax = (tgt.x - b.x) / (tgtD || 1), ay = (tgt.y - b.y) / (tgtD || 1);
      input.mx = -ay * this.strafe * 0.4;
      input.my = ax * this.strafe * 0.4;
    } else if (plan.retreat) {
      this.survive(goal, foe, fd, input, dt);
    } else if (goal) {
      this.followTo(goal, input);
    }
    // esquivar disparos que vienen hacia él (mejor cuanto más nivel)
    this.dodge(input, dt);

    // atascado -> recalcular camino
    const moved = Math.hypot(b.x - this.lastPos.x, b.y - this.lastPos.y);
    this.lastPos = { x: b.x, y: b.y };
    if ((input.mx || input.my) && moved < 0.5) {
      this.stuckT += dt;
      if (this.stuckT > 0.5) { this.repathT = 0; this.strafe *= -1; this.stuckT = 0; }
    } else this.stuckT = 0;

    // disparar: los bots tardan en reaccionar y no vacían el cargador de golpe
    if (foe !== this.lastFoe) {
      this.lastFoe = foe;
      this.seenT = 0;
      this.reaction = 0.25 + (1 - this.skill) * 0.75 + Math.random() * 0.25;
    }
    this.seenT += dt;
    this.superWait -= dt;
    // chutar el Voltorb
    if (carrying) {
      if (plan.kick && g.started) input.attack = { dx: plan.kick.dx, dy: plan.kick.dy };
      return input;
    }
    // disparar a Snorlax / cajas si no hay enemigos a tiro
    const foeInRange = foe && fd <= atk.range * (plan.focus ? 0.55 : 0.95);
    if (!foeInRange && tgt && tgtD <= atk.range * 0.95 && tgtLos && b.ammo >= 1 && this.fireT <= 0 && g.started) {
      const ang = Math.atan2(tgt.y - b.y, tgt.x - b.x) + (Math.random() - 0.5) * 0.15;
      input.attack = { dx: Math.cos(ang), dy: Math.sin(ang), dist: Math.hypot(tgt.x - b.x, tgt.y - b.y) };
      this.fireT = 0.35 + (1 - this.skill) * 0.5 + Math.random() * 0.3;
      if (b.superCharge >= 1 && tgt.struct && ['spread', 'zone', 'meteor'].includes(b.def.super.kind)) input.super = input.attack;
    }
    if (foe && this.seenT >= this.reaction && g.started && !(plan.focus && input.attack)) {
      const canHit = atk.kind === 'lob' || W.los(b.x, b.y, foe.x, foe.y);
      const keepAmmo = this.skill < 0.5 && b.ammo < 2 && hpF > 0.5 && Math.random() < 0.6;
      if (fd <= atk.range * 0.95 && canHit && b.ammo >= 1 && this.fireT <= 0 && !keepAmmo) {
        input.attack = this.aimAt(foe, fd, atk);
        this.fireT = 0.4 + (1 - this.skill) * 0.9 + Math.random() * 0.4;
      }
      if (b.superCharge >= 1 && this.superWait <= 0) {
        const s = b.def.super;
        let use = false;
        if (s.kind === 'spread') use = fd < s.range * 0.8 && W.los(b.x, b.y, foe.x, foe.y);
        else if (s.kind === 'zone' || s.kind === 'meteor') use = fd < s.range;
        else if (s.kind === 'dash') use = fd < s.range * 0.85 && W.walkable(b.x, b.y, foe.x, foe.y, 10);
        else if (s.kind === 'slam') use = fd < s.radius * 0.75;
        else if (s.kind === 'stealth') use = fd < 500 || hpF < 0.5;
        if (use) {
          // los bots torpes a veces "se olvidan" un rato de usar el súper
          if (Math.random() < 0.5 - this.skill * 0.4) this.superWait = 1 + Math.random() * 2;
          else {
            input.super = this.aimAt(foe, fd, s);
            input.attack = null;
          }
        }
      }
    }
    return input;
  }

  // Jugar a no morir (lleva Pokéballs, va ganando o tiene poca vida):
  // se aleja del rival en zigzag hacia su zona, y si no hay nadie cerca se esconde en un arbusto
  survive(home, foe, fd, input, dt) {
    const g = this.g, b = this.b, W = g.world;
    const danger = foe && fd < Math.max(560, (foe.def.attack.range || 300) + 180);
    if (danger) {
      if (this.strafeT <= 0) { this.strafe *= -1; this.strafeT = 0.35 + Math.random() * 0.45; }
      const ax = (b.x - foe.x) / fd, ay = (b.y - foe.y) / fd; // alejarse
      let hx = 0, hy = 0;
      if (home) { const hd = Math.hypot(home.x - b.x, home.y - b.y) || 1; hx = (home.x - b.x) / hd; hy = (home.y - b.y) / hd; }
      let mx = ax + hx * 0.7 - ay * this.strafe * 0.8;
      let my = ay + hy * 0.7 + ax * this.strafe * 0.8;
      const l = Math.hypot(mx, my) || 1;
      mx /= l; my /= l;
      // si hay pared delante, a buscar refugio por el camino
      if (!W.walkable(b.x, b.y, b.x + mx * 60, b.y + my * 60, b.r)) {
        this.strafe *= -1;
        const cover = this.findCover(home || b);
        if (cover) return this.followTo(cover, input);
      }
      input.mx = mx;
      input.my = my;
      return;
    }
    // nadie cerca: a un arbusto cerca de casa y quieto dentro (escondido se cura)
    const cover = this.findCover(home || b);
    const spot = cover || home;
    if (!spot) return;
    if (Math.hypot(spot.x - b.x, spot.y - b.y) > 18) this.followTo(spot, input);
  }

  // Arbusto más seguro cerca de un punto (lejos de los rivales vivos)
  findCover(near) {
    const g = this.g, b = this.b, W = g.world, T = PB.TILE;
    this.coverT = (this.coverT || 0) - 1;
    if (this.cover && this.coverT > 0) return this.cover;
    const foes = g.enemiesOf(b);
    let best = null, bs = Infinity;
    const c0 = Math.floor(near.x / T), r0 = Math.floor(near.y / T);
    for (let r = r0 - 6; r <= r0 + 6; r++) for (let c = c0 - 6; c <= c0 + 6; c++) {
      if (W.tile(c, r) !== 'b') continue;
      const x = (c + 0.5) * T, y = (r + 0.5) * T;
      let sc = Math.hypot(x - near.x, y - near.y) * 0.6 + Math.hypot(x - b.x, y - b.y) * 0.3;
      for (const f of foes) { const d = Math.hypot(f.x - x, f.y - y); if (d < 520) sc += (520 - d) * 2.5; }
      if (sc < bs) { bs = sc; best = { x, y }; }
    }
    this.cover = best;
    this.coverT = 40; // se recalcula cada ~40 pensamientos
    return best;
  }

  // Esquivar: si un proyectil rival viene directo, paso lateral
  dodge(input, dt) {
    const g = this.g, b = this.b;
    this.dodgeT = (this.dodgeT || 0) - dt;
    if (this.dodgeT <= 0) { this.dodgeT = 0.25; this.canDodge = Math.random() < this.skill * 0.75; }
    if (!this.canDodge || b.dash) return;
    for (const p of g.projectiles) {
      if (p.lob || p.team === b.team || p.hit.has(b.idx)) continue;
      const dx = b.x - p.x, dy = b.y - 8 - p.y;
      const d = Math.hypot(dx, dy);
      if (d > 280) continue;
      const v = Math.hypot(p.vx, p.vy) || 1;
      const ux = p.vx / v, uy = p.vy / v;
      if (dx * ux + dy * uy <= 0) continue; // ya ha pasado
      const side = dx * -uy + dy * ux; // distancia lateral a la trayectoria
      if (Math.abs(side) > p.r + b.r + 16) continue;
      const s = side >= 0 ? 1 : -1;
      let mx = input.mx * 0.4 + -uy * s * 1.2, my = input.my * 0.4 + ux * s * 1.2;
      const l = Math.hypot(mx, my) || 1;
      input.mx = mx / l;
      input.my = my / l;
      return;
    }
  }

  aimAt(foe, dist, atk) {
    const b = this.b;
    const t = atk.speed ? dist / atk.speed : atk.flight || atk.time || 0;
    const lead = this.skill * 0.85;
    const px = foe.x + foe.vx * t * lead, py = foe.y + foe.vy * t * lead;
    const err = (Math.random() - 0.5) * 0.7 * (1 - this.skill);
    const ang = Math.atan2(py - b.y, px - b.x) + err;
    return { dx: Math.cos(ang), dy: Math.sin(ang), dist: Math.hypot(px - b.x, py - b.y) * (0.9 + Math.random() * 0.2) };
  }

  followTo(target, input) {
    const b = this.b, W = this.g.world;
    const tx = target.x, ty = target.y;
    if (this.repathT <= 0 || !this.goal || Math.hypot(this.goal.x - tx, this.goal.y - ty) > 96 || this.wallsV !== W.version) {
      this.path = W.findPath(b.x, b.y, tx, ty);
      this.goal = { x: tx, y: ty };
      this.repathT = 0.6 + Math.random() * 0.3;
      this.wallsV = W.version;
    }
    // atajar: saltar puntos si hay camino recto
    while (this.path.length > 1 && W.walkable(b.x, b.y, this.path[1].x, this.path[1].y, b.r)) this.path.shift();
    let p = this.path[0];
    if (p && Math.hypot(p.x - b.x, p.y - b.y) < 14) { this.path.shift(); p = this.path[0]; }
    if (!p) {
      if (W.walkable(b.x, b.y, tx, ty, b.r)) p = { x: tx, y: ty };
      else return;
    }
    const dx = p.x - b.x, dy = p.y - b.y, d = Math.hypot(dx, dy);
    if (d > 4) { input.mx = dx / d; input.my = dy / d; }
  }
};
