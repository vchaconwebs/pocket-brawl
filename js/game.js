// Simulación de la partida (modo Atrapagemas 3v3).
// No dibuja nada: recibe "inputs" por luchador y avanza el estado. Así, en el futuro,
// la misma lógica puede correr en un servidor o en el host de una partida online.
//
// input = { mx, my, attack, super }
//   mx, my  -> dirección de movimiento (-1..1)
//   attack / super -> null | { auto: true } | { dx, dy, dist }
PB.Game = class {
  constructor(opts) {
    this.world = new PB.World(PB.buildMap());
    this.rules = PB.RULES;
    this.time = 0;
    this.brawlers = [];
    this.projectiles = [];
    this.zones = [];
    this.gems = [];
    this.particles = [];
    this.texts = [];
    this.events = []; // para sonido / interfaz: { type, ... }
    this.feed = []; // mensajes de K.O.
    this.gemT = 2;
    this.countdown = null; // { team, t }
    this.winner = null; // 'blue' | 'red' | 'draw'
    this.shake = 0;
    this.nextShotId = 1;

    const add = (id, team, i, isPlayer) => {
      const def = PB.brawlerById(id);
      const sp = this.world.spawns[team][i % 3];
      this.brawlers.push({
        idx: this.brawlers.length, def, team, isPlayer: !!isPlayer,
        name: isPlayer ? 'TÚ' : def.name,
        x: sp.x, y: sp.y, r: 22, vx: 0, vy: 0, kx: 0, ky: 0,
        hp: def.hp, maxHp: def.hp, ammo: this.rules.maxAmmo, shotCd: 0, superCharge: 0,
        gems: 0, dead: false, respawnT: 0, lastCombat: -99, revealT: 0,
        facing: team === 'blue' ? -Math.PI / 2 : Math.PI / 2,
        moving: false, animT: Math.random() * 3, action: null, hurtT: 0,
        stunT: 0, dash: null, stealthT: 0, powerNext: false, shieldT: this.rules.spawnShield,
        burst: null, kills: 0, deaths: 0, gemsTaken: 0, dmgDone: 0,
      });
    };
    opts.blue.forEach((id, i) => add(id, 'blue', i, i === 0 && opts.playerInBlue));
    opts.red.forEach((id, i) => add(id, 'red', i, false));
  }

  get player() {
    return this.brawlers.find((b) => b.isPlayer);
  }

  enemiesOf(b) {
    return this.brawlers.filter((e) => e.team !== b.team && !e.dead);
  }

  teamGems(team) {
    let n = 0;
    for (const b of this.brawlers) if (b.team === team && !b.dead) n += b.gems;
    return n;
  }

  inBush(b) {
    return this.world.isBushAt(b.x, b.y);
  }

  // ¿Ve el equipo "team" al luchador b? (arbustos e invisibilidad)
  visibleTo(b, team) {
    if (b.team === team) return true;
    if (b.dead) return false;
    const hidden = b.stealthT > 0 || (this.inBush(b) && b.revealT <= 0);
    if (!hidden) return true;
    const near = b.stealthT > 0 ? 90 : 150;
    for (const o of this.brawlers) {
      if (o.team === team && !o.dead && Math.hypot(o.x - b.x, o.y - b.y) < near) return true;
    }
    return false;
  }

  // ---------------------------------------------------------------- bucle
  update(dt, inputs) {
    if (this.winner) {
      this.updateFx(dt);
      return;
    }
    this.time += dt;
    for (const b of this.brawlers) this.updateBrawler(b, dt, inputs[b.idx] || {});
    this.updateProjectiles(dt);
    this.updateZones(dt);
    this.updateGems(dt);
    this.updateFx(dt);
    this.checkWin(dt);
  }

  updateBrawler(b, dt, input) {
    const R = this.rules;
    if (b.dead) {
      b.respawnT -= dt;
      if (b.respawnT <= 0) this.respawn(b);
      return;
    }
    b.animT += dt;
    b.shotCd -= dt;
    b.hurtT -= dt;
    b.revealT -= dt;
    b.shieldT -= dt;
    b.stunT -= dt;
    if (b.stealthT > 0) b.stealthT -= dt;
    if (b.action) {
      b.action.t += dt;
      if (b.action.t >= b.action.len) b.action = null;
    }

    if (b.ammo < R.maxAmmo) b.ammo = Math.min(R.maxAmmo, b.ammo + dt / b.def.reload);
    if (this.time - b.lastCombat > R.regenDelay && b.hp < b.maxHp) {
      b.hp = Math.min(b.maxHp, b.hp + b.maxHp * R.regenRate * dt);
    }

    // movimiento
    const ox = b.x, oy = b.y;
    if (b.dash) {
      const d = b.dash;
      d.t -= dt;
      this.world.moveCircle(b, d.vx * dt, d.vy * dt);
      for (const e of this.enemiesOf(b)) {
        if (!d.hit.has(e.idx) && Math.hypot(e.x - b.x, e.y - b.y) < d.r + e.r) {
          d.hit.add(e.idx);
          this.damage(e, d.dmg, b, b.def.atkType, { stun: d.stun, knockback: 300, kx: d.vx, ky: d.vy });
        }
      }
      if (d.t <= 0) b.dash = null;
    } else {
      let mx = input.mx || 0, my = input.my || 0;
      const len = Math.hypot(mx, my);
      if (len > 1) { mx /= len; my /= len; }
      if (b.stunT > 0) { mx = 0; my = 0; }
      const sp = b.def.speed * (b.stealthT > 0 ? b.def.super.speedMul || 1 : 1);
      this.world.moveCircle(b, mx * sp * dt + b.kx * dt, my * sp * dt + b.ky * dt);
      b.moving = len > 0.15 && b.stunT <= 0;
      if (b.moving && !b.action) b.facing = Math.atan2(my, mx);
    }
    const decay = Math.exp(-8 * dt);
    b.kx *= decay;
    b.ky *= decay;
    b.vx = (b.x - ox) / dt;
    b.vy = (b.y - oy) / dt;

    // ráfaga pendiente (Pikachu)
    if (b.burst) {
      b.burst.t -= dt;
      if (b.burst.t <= 0) {
        this.spawnShot(b, b.burst.atk, b.burst.ang, false, b.burst.mul);
        b.burst.left--;
        b.burst.t = b.burst.atk.delay;
        if (b.burst.left <= 0) b.burst = null;
      }
    }

    // ataques
    if (b.stunT <= 0 && !b.dash) {
      if (input.super && b.superCharge >= 1) this.doSuper(b, input.super);
      else if (input.attack && b.ammo >= 1 && b.shotCd <= 0 && !b.burst) this.doAttack(b, input.attack);
    }

    // recoger gemas
    for (const g of this.gems) {
      if (g.taken || g.delay > 0) continue;
      if (Math.hypot(g.x - b.x, g.y - b.y) < b.r + 18) {
        g.taken = true;
        b.gems++;
        b.gemsTaken++;
        this.events.push({ type: 'gem', b });
      }
    }
  }

  // Resuelve el apuntado (manual o automático) -> { ang, dist }
  aim(b, aim, range) {
    if (aim && aim.auto) {
      let best = null, bd = Infinity;
      for (const e of this.enemiesOf(b)) {
        if (!this.visibleTo(e, b.team)) continue;
        const d = Math.hypot(e.x - b.x, e.y - b.y);
        if (d < bd && d < range * 1.1) { bd = d; best = e; }
      }
      if (best) return { ang: Math.atan2(best.y - b.y, best.x - b.x), dist: bd };
      return { ang: b.facing, dist: range };
    }
    return { ang: Math.atan2(aim.dy, aim.dx), dist: aim.dist == null ? range : aim.dist };
  }

  startAction(b, ang, anim, len) {
    b.facing = ang;
    b.action = { anim, t: 0, len };
    b.revealT = 0.8;
    b.lastCombat = this.time;
  }

  doAttack(b, aimIn) {
    const atk = b.def.attack;
    const { ang, dist } = this.aim(b, aimIn, atk.range);
    b.ammo -= 1;
    b.shotCd = 0.3;
    let mul = 1;
    if (b.powerNext) { mul = b.def.super.bonus || 1; b.powerNext = false; }
    if (b.stealthT > 0) b.stealthT = 0; // atacar rompe la invisibilidad
    this.startAction(b, ang, 'Shoot', 0.35);
    this.events.push({ type: 'shoot', b, fx: atk.fx });
    if (atk.kind === 'burst') {
      this.spawnShot(b, atk, ang, false, mul);
      b.burst = { left: atk.count - 1, t: atk.delay, ang, atk, mul };
    } else if (atk.kind === 'lob') {
      this.spawnLob(b, atk, ang, Math.min(dist, atk.range), false, mul);
    } else {
      this.spawnSpread(b, atk, ang, false, mul);
    }
  }

  doSuper(b, aimIn) {
    const s = b.def.super;
    const { ang, dist } = this.aim(b, aimIn, s.range || s.radius || 400);
    b.superCharge = 0;
    this.events.push({ type: 'super', b });
    if (s.kind === 'spread') {
      this.startAction(b, ang, 'Attack', 0.45);
      this.spawnSpread(b, s, ang, true, 1);
    } else if (s.kind === 'zone') {
      this.startAction(b, ang, 'Shoot', 0.4);
      this.spawnLob(b, s, ang, Math.min(dist, s.range), true, 1);
    } else if (s.kind === 'dash') {
      this.startAction(b, ang, 'Attack', s.time + 0.1);
      const v = s.range / s.time;
      b.dash = { t: s.time, vx: Math.cos(ang) * v, vy: Math.sin(ang) * v, dmg: s.dmg, stun: s.stun, r: s.r, hit: new Set() };
      for (let i = 0; i < 12; i++) this.particle(b.x, b.y, '#ffe14d', 180, 0.4);
    } else if (s.kind === 'slam') {
      this.startAction(b, b.facing, 'Attack', 0.5);
      this.explode(b, b.x, b.y, s.radius, s.dmg, b.def.atkType, { knockback: s.knockback, stun: s.stun, fx: 'rock', big: true });
      if (s.destroysWalls) this.breakWalls(b.x, b.y, s.radius);
      this.shake = Math.max(this.shake, 14);
    } else if (s.kind === 'stealth') {
      this.startAction(b, b.facing, 'Attack', 0.4);
      b.stealthT = s.time;
      b.revealT = 0;
      b.powerNext = true;
      for (let i = 0; i < 16; i++) this.particle(b.x, b.y - 10, '#9d7bff', 140, 0.6);
    }
  }

  spawnSpread(b, atk, ang, isSuper, mul) {
    const n = atk.count || 1;
    const id = this.nextShotId++;
    for (let i = 0; i < n; i++) {
      const a = n === 1 ? ang : ang - atk.spread / 2 + (atk.spread * i) / (n - 1);
      this.spawnShot(b, atk, a, isSuper, mul, id);
    }
  }

  spawnShot(b, atk, ang, isSuper, mul, shotId) {
    const ox = b.x + Math.cos(ang) * 18, oy = b.y + Math.sin(ang) * 18 - 4;
    this.projectiles.push({
      x: ox, y: oy, vx: Math.cos(ang) * atk.speed, vy: Math.sin(ang) * atk.speed, ang,
      r: atk.r || 12, dmg: atk.dmg * (mul || 1), team: b.team, owner: b, range: atk.range, traveled: 0,
      pierce: !!atk.pierce, hit: new Set(), fx: atk.fx, atkType: b.def.atkType, charge: !isSuper,
      destroysWalls: !!atk.destroysWalls, knockback: atk.knockback || 0, isSuper, shotId: shotId || this.nextShotId++,
    });
  }

  spawnLob(b, atk, ang, dist, isSuper, mul) {
    this.projectiles.push({
      lob: true, sx: b.x, sy: b.y, tx: b.x + Math.cos(ang) * dist, ty: b.y + Math.sin(ang) * dist,
      t: 0, T: atk.flight, x: b.x, y: b.y, z: 0, team: b.team, owner: b, fx: atk.fx, atkType: b.def.atkType,
      atk, isSuper, mul: mul || 1, charge: !isSuper,
    });
  }

  updateProjectiles(dt) {
    const keep = [];
    for (const p of this.projectiles) {
      if (p.lob) {
        p.t += dt;
        const k = Math.min(1, p.t / p.T);
        p.x = p.sx + (p.tx - p.sx) * k;
        p.y = p.sy + (p.ty - p.sy) * k;
        p.z = Math.sin(k * Math.PI) * (60 + Math.hypot(p.tx - p.sx, p.ty - p.sy) * 0.18);
        if (k >= 1) {
          if (p.atk.kind === 'zone') {
            this.zones.push({ x: p.x, y: p.y, r: p.atk.radius, t: p.atk.duration, team: p.team, owner: p, atk: p.atk, by: p.owner });
            this.events.push({ type: 'zone' });
          } else {
            this.explode(p.owner, p.x, p.y, p.atk.radius, p.atk.dmg * p.mul, p.atkType, { charge: p.charge, fx: p.fx });
          }
          continue;
        }
        keep.push(p);
        continue;
      }
      const step = Math.hypot(p.vx, p.vy) * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.traveled += step;
      if (p.fx === 'fire' && Math.random() < 0.5) this.particle(p.x, p.y, '#ffb347', 30, 0.25, 3);
      if (p.traveled >= p.range) {
        this.puff(p);
        continue;
      }
      if (this.world.shotBlockedAt(p.x, p.y)) {
        if (p.destroysWalls && this.breakWalls(p.x, p.y, 40).length) {
          // sigue su camino
        } else {
          this.puff(p);
          continue;
        }
      }
      let dead = false;
      for (const e of this.brawlers) {
        if (e.dead || e.team === p.team || p.hit.has(e.idx)) continue;
        if (Math.hypot(e.x - p.x, e.y - 8 - p.y) < p.r + e.r) {
          p.hit.add(e.idx);
          this.damage(e, p.dmg, p.owner, p.atkType, {
            charge: p.charge, knockback: p.knockback, kx: p.vx, ky: p.vy, shotId: p.shotId,
          });
          if (!p.pierce) { dead = true; this.puff(p); break; }
        }
      }
      if (!dead) keep.push(p);
    }
    this.projectiles = keep;
  }

  updateZones(dt) {
    for (const z of this.zones) {
      z.t -= dt;
      for (const b of this.brawlers) {
        if (b.dead || Math.hypot(b.x - z.x, b.y - z.y) > z.r) continue;
        if (b.team === z.team) {
          if (b.hp < b.maxHp) b.hp = Math.min(b.maxHp, b.hp + z.atk.heal * dt);
        } else {
          z.acc = (z.acc || 0);
          b._zoneAcc = (b._zoneAcc || 0) + z.atk.dps * dt;
          if (b._zoneAcc >= 150) {
            this.damage(b, b._zoneAcc, z.by, z.by.def.atkType, { quiet: false });
            b._zoneAcc = 0;
          }
        }
      }
      if (Math.random() < 0.4) {
        const a = Math.random() * Math.PI * 2, d = Math.random() * z.r;
        this.particle(z.x + Math.cos(a) * d, z.y + Math.sin(a) * d, '#7dff7a', 20, 0.6, 3, -40);
      }
    }
    this.zones = this.zones.filter((z) => z.t > 0);
  }

  explode(owner, x, y, radius, dmg, atkType, opts) {
    for (const e of this.brawlers) {
      if (e.dead || e.team === owner.team) continue;
      if (Math.hypot(e.x - x, e.y - y) < radius + e.r) {
        this.damage(e, dmg, owner, atkType, { ...opts, kx: e.x - x, ky: e.y - y });
      }
    }
    const n = opts.big ? 40 : 14;
    const col = opts.fx === 'rock' ? '#a58c5f' : '#ffffff';
    for (let i = 0; i < n; i++) this.particle(x, y, col, radius * 2.2, 0.5, opts.big ? 6 : 4);
    this.texts.push({ ring: true, x, y, r: radius, t: 0, life: 0.35 });
    this.events.push({ type: 'boom', big: !!opts.big });
  }

  breakWalls(x, y, radius) {
    const broken = this.world.destroyAround(x, y, radius);
    for (const w of broken) {
      for (let i = 0; i < 10; i++) this.particle(w.x, w.y, '#c79a5a', 220, 0.6, 6);
    }
    if (broken.length) this.events.push({ type: 'wall' });
    return broken;
  }

  puff(p) {
    const col = { fire: '#ffa53a', water: '#9fd4ff', leaf: '#8be27a', electric: '#fff27a', ghost: '#b693ff' }[p.fx] || '#fff';
    for (let i = 0; i < 5; i++) this.particle(p.x, p.y, col, 80, 0.3, 3);
  }

  damage(target, amount, source, atkType, opts) {
    if (target.dead || target.shieldT > 0) return;
    const eff = PB.effectiveness(atkType, target.def.types);
    const amt = Math.round(amount * eff);
    target.hp -= amt;
    target.lastCombat = this.time;
    target.hurtT = 0.2;
    target.revealT = Math.max(target.revealT, 0.5);
    if (source) {
      source.dmgDone += amt;
      if (opts.charge) source.superCharge = Math.min(1, source.superCharge + 1 / source.def.superHits);
    }
    if (opts.knockback) {
      const l = Math.hypot(opts.kx || 0, opts.ky || 0) || 1;
      target.kx += ((opts.kx || 0) / l) * opts.knockback;
      target.ky += ((opts.ky || 0) / l) * opts.knockback;
    }
    if (opts.stun) target.stunT = Math.max(target.stunT, opts.stun);
    const col = eff > 1 ? '#ffcf3a' : eff < 1 ? '#c9c9c9' : '#ffffff';
    this.texts.push({ x: target.x + (Math.random() - 0.5) * 20, y: target.y - 60, text: String(amt), color: col, t: 0, life: 0.8, size: eff > 1 ? 26 : 20 });
    if (eff > 1 && opts.shotId && this._lastEffShot !== opts.shotId) {
      this._lastEffShot = opts.shotId;
      this.texts.push({ x: target.x, y: target.y - 88, text: '¡Muy eficaz!', color: '#ffcf3a', t: 0, life: 0.9, size: 16 });
    }
    this.events.push({ type: 'hit', target, source });
    if (target.hp <= 0) this.kill(target, source);
  }

  kill(b, killer) {
    b.dead = true;
    b.hp = 0;
    b.deaths++;
    b.respawnT = this.rules.respawn;
    b.dash = null;
    b.burst = null;
    b.stealthT = 0;
    if (killer && killer !== b) killer.kills++;
    for (let i = 0; i < b.gems; i++) {
      const a = Math.random() * Math.PI * 2, s = 120 + Math.random() * 160;
      this.gems.push({ x: b.x, y: b.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, delay: 0.5, taken: false, bob: Math.random() * 6 });
    }
    b.gems = 0;
    for (let i = 0; i < 24; i++) this.particle(b.x, b.y - 10, b.team === 'blue' ? '#5ab0ff' : '#ff5a5a', 260, 0.7, 5);
    this.feed.push({ text: (killer ? killer.name : '?') + '  ➜  ' + b.name, team: killer ? killer.team : 'red', t: this.time });
    if (this.feed.length > 4) this.feed.shift();
    this.events.push({ type: 'ko', b, killer });
    this.shake = Math.max(this.shake, b.isPlayer ? 16 : 6);
  }

  respawn(b) {
    const sp = this.world.spawns[b.team][Math.floor(Math.random() * 3)];
    Object.assign(b, {
      x: sp.x, y: sp.y, dead: false, hp: b.maxHp, ammo: this.rules.maxAmmo, shieldT: this.rules.spawnShield,
      kx: 0, ky: 0, stunT: 0, action: null, powerNext: false,
    });
    this.events.push({ type: 'respawn', b });
  }

  updateGems(dt) {
    this.gemT -= dt;
    if (this.gemT <= 0) {
      this.gemT = this.rules.gemEvery;
      const a = Math.random() * Math.PI * 2;
      const m = this.world.mine;
      this.gems.push({ x: m.x, y: m.y, vx: Math.cos(a) * 140, vy: Math.sin(a) * 140, delay: 0.3, taken: false, bob: Math.random() * 6 });
      this.events.push({ type: 'gemspawn' });
    }
    for (const g of this.gems) {
      g.delay -= dt;
      g.bob += dt;
      if (g.vx || g.vy) {
        const e = { x: g.x, y: g.y, r: 10 };
        this.world.moveCircle(e, g.vx * dt, g.vy * dt);
        g.x = e.x;
        g.y = e.y;
        const f = Math.exp(-4 * dt);
        g.vx *= f;
        g.vy *= f;
        if (Math.hypot(g.vx, g.vy) < 5) g.vx = g.vy = 0;
      }
    }
    this.gems = this.gems.filter((g) => !g.taken);
  }

  checkWin(dt) {
    const R = this.rules;
    const blue = this.teamGems('blue'), red = this.teamGems('red');
    let leader = null;
    if (blue >= R.gemsToWin && blue > red) leader = 'blue';
    else if (red >= R.gemsToWin && red > blue) leader = 'red';
    if (leader) {
      if (!this.countdown || this.countdown.team !== leader) {
        this.countdown = { team: leader, t: R.countdown };
        this.events.push({ type: 'countdown', team: leader });
      }
      const before = Math.ceil(this.countdown.t);
      this.countdown.t -= dt;
      if (Math.ceil(this.countdown.t) !== before) this.events.push({ type: 'tick', team: leader });
      if (this.countdown.t <= 0) this.end(leader);
    } else if (this.countdown) {
      this.countdown = null;
      this.events.push({ type: 'countdownStop' });
    }
    if (!this.winner && this.time >= R.matchTime) {
      this.end(blue > red ? 'blue' : red > blue ? 'red' : 'draw');
    }
  }

  end(result) {
    this.winner = result;
    this.events.push({ type: 'end', result });
  }

  // ---------------------------------------------------------------- efectos
  particle(x, y, color, speed, life, size, vz) {
    const a = Math.random() * Math.PI * 2, s = Math.random() * speed;
    this.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s + (vz || 0), color, t: 0, life: life * (0.6 + Math.random() * 0.6), size: size || 4 });
  }

  updateFx(dt) {
    for (const p of this.particles) {
      p.t += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.92;
      p.vy *= 0.92;
    }
    this.particles = this.particles.filter((p) => p.t < p.life);
    for (const t of this.texts) {
      t.t += dt;
      if (!t.ring) t.y -= 40 * dt;
    }
    this.texts = this.texts.filter((t) => t.t < t.life);
    this.shake = Math.max(0, this.shake - 40 * dt);
  }
};
