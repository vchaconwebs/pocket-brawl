// Simulación de la partida. Las reglas de cada modo están en js/modes.js.
// No dibuja nada: recibe "inputs" por luchador y avanza el estado. Así, en el futuro,
// la misma lógica puede correr en un servidor o en el host de una partida online.
//
// input = { mx, my, attack, super }
//   mx, my  -> dirección de movimiento (-1..1)
//   attack / super -> null | { auto: true } | { dx, dy, dist }
PB.Game = class {
  // opts: { mode, blue: [ids], red: [ids], ffa: [ids], playerInBlue, noCountdown }
  constructor(opts) {
    this.mode = PB.MODES[opts.mode] || PB.MODES.gems;
    // cada modo tiene varios mapas: opts.mapIdx dice cuál (en red lo decide el anfitrión)
    const maps = PB.mapsOf(this.mode.map);
    this.mapIdx = Math.max(0, Math.min(maps.length - 1, opts.mapIdx | 0));
    const map = maps[this.mapIdx];
    this.mapName = map.name || '';
    this.world = new PB.World(map.quad ? PB.buildQuadMap(map.quad) : PB.buildMap(map.top));
    this.world.theme = map.theme || ''; // otono, nieve, arena (cambia suelo, árboles, rocas e hierba)
    this.rules = Object.assign({}, PB.RULES, this.mode.rules || {});
    this.time = 0; // tiempo de juego (empieza al terminar la cuenta atrás)
    this.clock = 0; // tiempo real de la partida (efectos)
    this.startT = opts.noCountdown ? 0 : this.rules.startCountdown;
    this.brawlers = [];
    this.projectiles = [];
    this.zones = []; // zonas de Drenadoras
    this.mines = []; // trampas en el suelo (súper)
    this.turrets = []; // orbes que disparan solos (súper)
    this.timers = []; // cosas que pasan un poco después (rayo que se carga)
    this.balls = []; // objetos del suelo: Pokéballs y Caramelos Raros ({ kind })
    this.structures = []; // Snorlax
    this.fx = []; // efectos visuales (no afectan al juego)
    this.events = []; // para sonido / interfaz: { type, ... }
    this.feed = []; // mensajes de K.O.
    this.padGlow = 0;
    this.countdown = null; // { team, t }
    this.winner = null; // 'blue' | 'red' | equipo del ganador en Niebla | 'draw'
    this.shake = 0;
    this.nextShotId = 1;

    const add = (id, team, sp, isPlayer) => {
      const def = PB.brawlerById(id);
      const line = (opts.lines && opts.lines[this.brawlers.length]) || def.line;
      this.brawlers.push({
        idx: this.brawlers.length, def, team, isPlayer: !!isPlayer,
        name: isPlayer ? 'TÚ' : def.name,
        // evolución: fase actual (0 = primera), su número de Pokédex y sus tipos
        line, stage: 0, xp: 0, dex: line[0], types: PB.stageTypes({ line }, 0), shiny: false, evoT: 0,
        x: sp.x, y: sp.y, r: 22, vx: 0, vy: 0, kx: 0, ky: 0,
        hp: def.hp, maxHp: def.hp, ammo: this.rules.maxAmmo, shotCd: 0, superCharge: 0,
        balls: 0, power: 0, stat: 0, dead: false, out: false, respawnT: 0, lastCombat: -99, revealT: 0,
        facing: sp.y > this.world.pixelH / 2 ? -Math.PI / 2 : Math.PI / 2,
        moving: false, animT: Math.random() * 3, action: null, hurtT: 0, flashT: 0,
        stunT: 0, dash: null, stealthT: 0, powerNext: false, shieldT: this.rules.spawnShield,
        spawnT: 0, dustT: 0, burst: null, streak: 0,
        kills: 0, deaths: 0, ballsTaken: 0, dmgDone: 0,
      });
    };
    if (this.mode.ffa) {
      const spots = this.world.spawns.free.slice().sort(() => Math.random() - 0.5);
      opts.ffa.forEach((id, i) => add(id, 'p' + i, spots[i % spots.length], i === 0 && opts.playerInBlue));
    } else {
      opts.blue.forEach((id, i) => add(id, 'blue', this.world.spawns.blue[i % 3], i === 0 && opts.playerInBlue));
      opts.red.forEach((id, i) => add(id, 'red', this.world.spawns.red[i % 3], false));
    }
    if (this.mode.setup) this.mode.setup(this);
    if (!this.startT) for (const b of this.brawlers) this.releaseFx(b);
  }

  // Multiplicador de daño: Caramelos Raros, nivel y fase de evolución
  powerMul(b) {
    return b ? (1 + 0.1 * (b.power || 0)) * (b.lvlMul || 1) * PB.stageMul(b.def, b.stage || 0) : 1;
  }

  // ---------------------------------------------------------------- evolución
  // EXP de evolución: por daño, K.O., objetivos y un poco solo por el tiempo.
  // Si algún rival va más evolucionado que tú, ganas EXP más rápido (para que nadie se escape).
  gainXp(b, amount) {
    if (!b || b.dead || amount <= 0) return;
    const steps = PB.evoSteps(b.def);
    if (b.stage >= steps.length) return;
    let k = 1;
    for (const e of this.brawlers) if (e.team !== b.team && e.stage > b.stage) { k = PB.EVO.catchUp; break; }
    b.xp += amount * k;
    if (b.xp >= steps[b.stage]) this.evolve(b);
  }

  // progreso hacia la siguiente fase (0..1); 1 si ya está en la última
  evoProgress(b) {
    const steps = PB.evoSteps(b.def);
    if (b.stage >= steps.length) return 1;
    const from = b.stage ? steps[b.stage - 1] : 0;
    return Math.max(0, Math.min(1, (b.xp - from) / (steps[b.stage] - from)));
  }

  evolve(b) {
    const before = PB.stageMul(b.def, b.stage);
    const oldName = PB.stageName(b, b.stage);
    b.evoFrom = b.dex; // para la animación: alterna entre la forma de antes y la nueva
    b.stage++;
    const after = PB.stageMul(b.def, b.stage);
    b.dex = b.line[b.stage];
    b.types = PB.stageTypes(b, b.stage);
    // ramas que cambian de tipo (Eevee): ataques nuevos
    const nd = PB.retype(b.def, b.line, b.stage);
    if (nd !== b.def) {
      b.def = nd;
      b.superCharge = Math.max(b.superCharge, 0.5);
      this.text(b.x, b.y - 128, nd.attack.name + ' · ' + nd.super.name, '#ffffff', 14);
    }
    // más vida máxima y se cura una parte
    b.maxHp = Math.round((b.maxHp * after) / before);
    b.hp = Math.min(b.maxHp, (b.hp * after) / before + b.maxHp * 0.25);
    b.evoT = PB.EVO_ANIM;
    b.shieldT = Math.max(b.shieldT, PB.EVO_ANIM + 0.2); // no se le puede dañar mientras evoluciona
    this.ring(b.x, b.y - 20, 10, 80, '#ffffff', 0.5, 5);
    for (let i = 0; i < 10; i++) this.px(b.x, b.y - 24, '#ffffff', { speed: 120, vy: -40, life: 0.5, size: 4 });
    this.text(b.x, b.y - 110, PB.T('¡Evoluciona!'), '#ffe066', 18);
    this.events.push({ type: 'evolve', b, from: oldName, to: PB.stageName(b, b.stage) });
  }

  get player() {
    return this.brawlers.find((b) => b.isPlayer);
  }

  get started() {
    return this.startT <= 0;
  }

  enemiesOf(b) {
    return this.brawlers.filter((e) => e.team !== b.team && !e.dead);
  }

  teamBalls(team) {
    let n = 0;
    for (const b of this.brawlers) if (b.team === team && !b.dead) n += b.balls;
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
    this.clock += dt;
    if (this.startT > 0) {
      const before = Math.ceil(this.startT);
      this.startT -= dt;
      if (Math.ceil(this.startT) !== before) this.events.push({ type: 'count', n: Math.max(0, Math.ceil(this.startT)) });
      if (this.startT <= 0) {
        this.events.push({ type: 'go' });
        for (const b of this.brawlers) this.releaseFx(b);
      }
      for (const b of this.brawlers) b.animT += dt;
      this.updateFx(dt);
      return;
    }
    if (this.winner) {
      for (const b of this.brawlers) b.animT += dt;
      this.updateFx(dt);
      return;
    }
    this.time += dt;
    for (const b of this.brawlers) this.updateBrawler(b, dt, inputs[b.idx] || {});
    this.updateProjectiles(dt);
    this.updateZones(dt);
    this.updateMines(dt);
    this.updateTurrets(dt);
    for (const tm of this.timers) { tm.t -= dt; if (tm.t <= 0) tm.fn(); }
    this.timers = this.timers.filter((tm) => tm.t > 0);
    this.updateBalls(dt);
    for (const s of this.structures) s.flashT -= dt;
    if (this.mode.update) this.mode.update(this, dt);
    this.updateFx(dt);
    if (!this.winner && this.time >= (this.overtimeEnd || this.rules.matchTime) && this.mode.timeUp) this.mode.timeUp(this);
  }

  updateBrawler(b, dt, input) {
    const R = this.rules;
    if (b.dead) {
      if (b.out) return; // eliminado (Niebla Tóxica)
      b.respawnT -= dt;
      if (b.respawnT <= 0) this.respawn(b);
      return;
    }
    // con el golpe, la animación se para un instante
    if (b.hitStopT > 0) b.hitStopT -= dt;
    else b.animT += dt;
    b.shotCd -= dt;
    b.hurtT -= dt;
    b.flashT -= dt;
    b.revealT -= dt;
    b.shieldT -= dt;
    b.stunT -= dt;
    b.spawnT -= dt;
    if (b.evoT > 0) {
      const before = b.evoT;
      b.evoT -= dt;
      // final de la evolución: se ve la forma nueva con un estallido de luz
      if (before > PB.EVO_REVEAL && b.evoT <= PB.EVO_REVEAL) {
        const pal = PB.VFX.PAL[b.def.atkType] || PB.VFX.PAL.normal;
        this.ring(b.x, b.y - 20, 10, 130, '#ffffff', 0.5, 6);
        this.ring(b.x, b.y - 20, 10, 90, pal[3], 0.45, 5);
        this.flash(b.x, b.y - 24, 140, '#ffffff', 0.4);
        for (let i = 0; i < 26; i++) this.px(b.x, b.y - 24, i % 2 ? '#ffffff' : pal[3], { speed: 280, vy: -60, life: 0.7, size: 5 });
        this.events.push({ type: 'evolved', b });
      }
    }
    if (b.barrierT > 0) b.barrierT -= dt;
    this.gainXp(b, PB.EVO.passive * dt);
    if (b.stealthT > 0) b.stealthT -= dt;
    if (b.action) {
      b.action.t += dt;
      if (b.action.t >= b.action.len) b.action = null;
    }

    if (b.ammo < R.maxAmmo) b.ammo = Math.min(R.maxAmmo, b.ammo + dt / b.def.reload);
    if (this.time - b.lastCombat > R.regenDelay && b.hp < b.maxHp) {
      const before = b.hp;
      b.hp = Math.min(b.maxHp, b.hp + b.maxHp * R.regenRate * dt);
      if (Math.floor(before / 400) !== Math.floor(b.hp / 400)) {
        this.px(b.x + (Math.random() - 0.5) * 30, b.y - 20, '#7dff8f', { speed: 10, vy: -50, life: 0.6, size: 5 });
      }
    }

    // movimiento
    const ox = b.x, oy = b.y;
    if (b.dash) {
      const d = b.dash;
      d.t -= dt;
      this.world.moveCircle(b, d.vx * dt, d.vy * dt);
      d.ghostT = (d.ghostT || 0) - dt;
      if (d.ghostT <= 0) {
        d.ghostT = 0.035;
        this.fx.push({ kind: 'ghost', dex: b.dex, shiny: b.shiny, x: b.x, y: b.y, facing: b.facing, t: 0, life: 0.25, type: b.def.atkType });
        const T = d.type || b.def.atkType;
        this.vfx(T === 'electric' ? 'bolt' : PB.VFX.forType(T).proj, T, b.x + (Math.random() - 0.5) * 40, b.y - 20 + (Math.random() - 0.5) * 30, { angle: Math.random() * 6, scale: 1, life: 0.15 });
      }
      for (const e of this.enemiesOf(b)) {
        if (!d.hit.has(e.idx) && Math.hypot(e.x - b.x, e.y - b.y) < d.r + e.r) {
          d.hit.add(e.idx);
          this.damage(e, d.dmg, b, d.type || b.def.atkType, { stun: d.stun, knockback: 300, kx: d.vx, ky: d.vy, big: true });
        }
      }
      if (d.t <= 0) b.dash = null;
    } else {
      let mx = input.mx || 0, my = input.my || 0;
      const len = Math.hypot(mx, my);
      if (len > 1) { mx /= len; my /= len; }
      if (b.stunT > 0) { mx = 0; my = 0; }
      // parón del golpe: casi quieto durante unas centésimas
      if (b.hitStopT > 0) { mx *= 0.15; my *= 0.15; }
      const sp = b.def.speed * (b.stealthT > 0 ? b.def.super.speedMul || 1 : 1);
      this.world.moveCircle(b, mx * sp * dt + b.kx * dt, my * sp * dt + b.ky * dt);
      b.moving = len > 0.15 && b.stunT <= 0;
      if (b.moving && !b.action) b.facing = Math.atan2(my, mx);
    }
    // Snorlax y demás estructuras ocupan sitio
    for (const s of this.structures) {
      if (s.hp <= 0) continue;
      const dx = b.x - s.x, dy = b.y - s.y, d = Math.hypot(dx, dy), min = s.r + b.r;
      if (d < min && d > 0.01) {
        this.world.moveCircle(b, (dx / d) * (min - d), (dy / d) * (min - d));
      }
    }
    const decay = Math.exp(-8 * dt);
    b.kx *= decay;
    b.ky *= decay;
    b.vx = (b.x - ox) / dt;
    b.vy = (b.y - oy) / dt;

    // polvo al andar / arbusto que se mueve (delata a quien está dentro)
    if (b.moving && b.stealthT <= 0) {
      b.dustT -= dt;
      if (b.dustT <= 0) {
        b.dustT = 0.2;
        if (this.inBush(b)) {
          for (let i = 0; i < 3; i++) this.px(b.x + (Math.random() - 0.5) * 40, b.y - 20 - Math.random() * 20, Math.random() < 0.5 ? '#3fae48' : '#5cc964', { speed: 50, vy: -30, life: 0.45, size: 5 });
        } else {
          this.px(b.x - Math.cos(b.facing) * 14, b.y + 6, 'rgba(235,240,210,0.7)', { speed: 20, vy: -15, life: 0.35, size: 6, grow: 1.6 });
        }
      }
    }

    // ráfaga pendiente (Pikachu)
    if (b.burst) {
      b.burst.t -= dt;
      if (b.burst.t <= 0) {
        this.spawnShot(b, b.burst.atk, b.burst.ang, false, b.burst.mul);
        this.muzzle(b, b.burst.ang);
        b.burst.left--;
        b.burst.t = b.burst.atk.delay;
        if (b.burst.left <= 0) b.burst = null;
      }
    }

    // ataques (si pulsas el súper justo cuando estás aturdido o embistiendo, se guarda un momento)
    // (también si le falta muy poco: en red la pantalla puede ir un pelín por delante)
    if (input.super && b.superCharge >= 0.9) b.superQ = { aim: input.super, t: 0.6 };
    if (b.superQ) { b.superQ.t -= dt; if (b.superQ.t <= 0) b.superQ = null; }
    // el ataque también se guarda un poco: si pegas justo antes de que acabe el anterior, no se pierde
    if (b.atkQ) { b.atkQ.t -= dt; if (b.atkQ.t <= 0) b.atkQ = null; }
    // (con el ratón mantenido llega un ataque en cada fotograma: ese no se guarda o un clic gastaría dos)
    if (input.attack && !(input.attack.held && b.atkQ)) b.atkQ = { aim: input.attack, t: b.ai || input.attack.held ? 0 : 0.35 };
    if (b.stunT <= 0 && !b.dash && b.spawnT <= 0) {
      const atk = b.atkQ && b.atkQ.aim;
      if (b.superQ && b.superCharge >= 1) { const q = b.superQ.aim; b.superQ = null; this.doSuper(b, q); }
      else if (input.attack && this.mode.onAttack && this.mode.onAttack(this, b, input.attack)) {
        // el modo se ha encargado (p. ej. chutar el Voltorb)
        b.atkQ = null;
      } else if (atk && b.ammo >= 1 && b.shotCd <= 0 && !b.burst) { b.atkQ = null; this.doAttack(b, atk); }
    }

    // recoger Pokéballs / Caramelos Raros
    for (const g of this.balls) {
      if (g.taken || g.delay > 0 || g.z > 12) continue;
      if (Math.hypot(g.x - b.x, g.y - b.y) < b.r + 18) {
        g.taken = true;
        if (g.kind === 'candy') {
          // Caramelo Raro: +10 % de vida y daño
          b.power++;
          b.stat++;
          this.gainXp(b, 8);
          const extra = b.def.hp * 0.1;
          b.maxHp += extra;
          b.hp = Math.min(b.maxHp, b.hp + extra + 400);
          this.events.push({ type: 'candy', b });
          this.ring(g.x, g.y - 10, 6, 40, '#9ad4ff', 0.3, 4);
          for (let i = 0; i < 8; i++) this.px(g.x, g.y - 10, i % 2 ? '#5a86ea' : '#e8f6ff', { speed: 140, vy: -40, life: 0.45, size: 4 });
          this.text(b.x, b.y - 96, PB.T('¡Sube de nivel!'), '#9ad4ff', 15);
        } else {
          b.balls++;
          b.ballsTaken++;
          b.stat++;
          this.gainXp(b, 3);
          this.events.push({ type: 'ball', b });
          this.ring(g.x, g.y - 10, 6, 34, '#ffffff', 0.25, 3);
          for (let i = 0; i < 6; i++) this.px(g.x, g.y - 10, i % 2 ? '#ff5a3c' : '#ffffff', { speed: 120, life: 0.35, size: 4 });
          this.text(b.x, b.y - 96, '+1', '#ffffff', 18);
        }
      }
    }
  }

  // Objetivos que no son luchadores (Snorlax enemigos y cajas) a menos de "range"
  objectTargets(b, range) {
    const out = [];
    for (const s of this.structures) {
      if (s.hp > 0 && s.team !== b.team) out.push({ x: s.x, y: s.y, d: Math.hypot(s.x - b.x, s.y - b.y) - s.r * 0.6, struct: s });
    }
    const T = PB.TILE, W = this.world;
    const c0 = Math.floor((b.x - range) / T), c1 = Math.floor((b.x + range) / T);
    const r0 = Math.floor((b.y - range) / T), r1 = Math.floor((b.y + range) / T);
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
      if (W.tile(c, r) !== 'C') continue;
      const x = c * T + T / 2, y = r * T + T / 2;
      out.push({ x, y, d: Math.hypot(x - b.x, y - b.y) - 20, crate: { c, r } });
    }
    return out.filter((o) => o.d < range);
  }

  // Resuelve el apuntado (manual o automático) -> { ang, dist }
  aim(b, aim, range) {
    if (aim && aim.facing) return { ang: b.facing, dist: range };
    if (aim && aim.auto) {
      // apuntado automático: el enemigo visible más cercano (aunque esté algo lejos)
      let best = null, bd = Infinity;
      for (const e of this.enemiesOf(b)) {
        if (!this.visibleTo(e, b.team) || e.spawnT > 0) continue;
        const d = Math.hypot(e.x - b.x, e.y - b.y);
        if (d < bd && d < Math.max(range * 1.8, 520)) { bd = d; best = e; }
      }
      if (best) return { ang: Math.atan2(best.y - b.y, best.x - b.x), dist: Math.min(bd, range) };
      const objs = this.objectTargets(b, range * 1.05).sort((p, q) => p.d - q.d);
      if (objs.length) return { ang: Math.atan2(objs[0].y - b.y, objs[0].x - b.x), dist: Math.hypot(objs[0].x - b.x, objs[0].y - b.y) };
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
    this.events.push({ type: 'shoot', b, atkType: b.def.atkType });
    this.muzzle(b, ang);
    if (atk.kind === 'melee') {
      this.slash(b, atk, ang, mul);
    } else if (atk.kind === 'twin') {
      const id = this.nextShotId++;
      this.spawnShot(b, atk, ang, false, mul, id, -atk.gap);
      this.spawnShot(b, atk, ang, false, mul, id, atk.gap);
    } else if (atk.kind === 'burst') {
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
    b.supersUsed = (b.supersUsed || 0) + 1;
    this.events.push({ type: 'super', b });
    const sT = s.type || b.def.atkType;
    const pal = PB.VFX.PAL[sT] || PB.VFX.PAL.normal;
    this.ring(b.x, b.y - 10, 20, 90, pal[3], 0.35, 6);
    this.flash(b.x, b.y - 20, 90, pal[3], 0.25);
    if (s.kind === 'spread') {
      this.startAction(b, ang, 'Attack', 0.45);
      this.spawnSpread(b, s, ang, true, 1);
      this.shake = Math.max(this.shake, 5);
    } else if (s.kind === 'zone') {
      this.startAction(b, ang, 'Shoot', 0.4);
      this.spawnLob(b, s, ang, Math.min(dist, s.range), true, 1);
    } else if (s.kind === 'dash') {
      this.startAction(b, ang, 'Attack', s.time + 0.1);
      const v = s.range / s.time;
      b.dash = { t: s.time, vx: Math.cos(ang) * v, vy: Math.sin(ang) * v, dmg: s.dmg, stun: s.stun, r: s.r, hit: new Set(), type: sT };
      for (let i = 0; i < 14; i++) this.px(b.x, b.y - 10, i % 2 ? pal[3] : '#ffffff', { speed: 220, life: 0.4, size: 4 });
    } else if (s.kind === 'slam') {
      this.startAction(b, b.facing, 'Attack', 0.5);
      this.explode(b, b.x, b.y, s.radius, s.dmg, sT, { knockback: s.knockback, stun: s.stun, big: true });
      if (s.destroysWalls) this.breakWalls(b.x, b.y, s.radius);
      this.fx.push({ kind: 'crack', x: b.x, y: b.y, r: s.radius, t: 0, life: 1.2, seed: Math.random() * 100 });
      this.shake = Math.max(this.shake, 16);
    } else if (s.kind === 'nova') {
      // estallido: ataques en todas direcciones
      this.startAction(b, ang, 'Attack', 0.4);
      for (let i = 0; i < s.count; i++) this.spawnShot(b, s, ang + (i / s.count) * Math.PI * 2, true, 1);
      this.ring(b.x, b.y - 10, 20, 120, pal[3], 0.35, 6);
      this.shake = Math.max(this.shake, 6);
    } else if (s.kind === 'boomerang') {
      // va y vuelve: puede golpear a la ida y a la vuelta
      this.startAction(b, ang, 'Shoot', 0.4);
      this.spawnShot(b, s, ang, true, 1);
      const p = this.projectiles[this.projectiles.length - 1];
      p.boomerang = true;
      p.pierce = true;
    } else if (s.kind === 'chain') {
      this.startAction(b, ang, 'Shoot', 0.4);
      this.chainHit(b, s, sT, ang);
    } else if (s.kind === 'beam') {
      // se carga un instante y sale un rayo larguísimo
      this.startAction(b, ang, 'Attack', s.delay + 0.25);
      this.fx.push({ kind: 'beamCharge', x: b.x, y: b.y - 18, ang, len: s.range, t: 0, life: s.delay, type: sT, by: b });
      this.timers.push({ t: s.delay, fn: () => { if (!b.dead) this.beamHit(b, s, sT, ang); } });
    } else if (s.kind === 'mines') {
      this.startAction(b, ang, 'Shoot', 0.4);
      const d = Math.min(dist, s.range);
      const cx = b.x + Math.cos(ang) * d, cy = b.y + Math.sin(ang) * d;
      for (let i = 0; i < s.count; i++) {
        const a = ang + (i / s.count) * Math.PI * 2, r = s.count > 1 ? s.spreadR : 0;
        const p = this.world.walkable(b.x, b.y, cx + Math.cos(a) * r, cy + Math.sin(a) * r, 8) ? { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r } : { x: cx, y: cy };
        this.mines.push({ x: p.x, y: p.y, team: b.team, owner: b, atk: s, type: sT, armT: 0.6, t: s.life, phase: Math.random() * 6 });
        for (let k = 0; k < 5; k++) this.px(p.x, p.y, pal[3], { speed: 90, life: 0.35, size: 4 });
      }
    } else if (s.kind === 'turret') {
      this.startAction(b, ang, 'Shoot', 0.4);
      const d = Math.min(dist, s.place || 160);
      let x = b.x + Math.cos(ang) * d, y = b.y + Math.sin(ang) * d;
      if (!this.world.walkable(b.x, b.y, x, y, 10)) { x = b.x; y = b.y; }
      this.turrets.push({ x, y, team: b.team, owner: b, atk: s, type: sT, t: s.dur, life: s.dur, fireT: 0.3 });
      this.ring(x, y - 20, 10, 70, pal[3], 0.35, 5);
    } else if (s.kind === 'barrier') {
      // escudo para él y su equipo cercano
      this.startAction(b, b.facing, 'Attack', 0.4);
      for (const a of this.brawlers) {
        if (a.dead || a.team !== b.team || Math.hypot(a.x - b.x, a.y - b.y) > s.radius) continue;
        a.barrierT = s.time;
        a.barrierReduce = s.reduce;
        a.barrierType = sT;
        this.ring(a.x, a.y - 20, 10, 50, pal[3], 0.35, 4);
      }
      this.ring(b.x, b.y - 10, 20, s.radius, pal[3], 0.45, 4);
    } else if (s.kind === 'wish') {
      // cura de golpe a su equipo cercano (y quita el aturdimiento)
      this.startAction(b, b.facing, 'Attack', 0.4);
      for (const a of this.brawlers) {
        if (a.dead || a.team !== b.team || Math.hypot(a.x - b.x, a.y - b.y) > s.radius) continue;
        const heal = a.maxHp * s.heal;
        a.hp = Math.min(a.maxHp, a.hp + heal);
        a.stunT = 0;
        this.text(a.x, a.y - 96, '+' + Math.round(heal), '#7dff8f', 18);
        for (let k = 0; k < 4; k++) this.vfx('heart', 'fairy', a.x + (Math.random() - 0.5) * 40, a.y - 30, { vy: -60, life: 0.8, scale: 1.2, fade: true });
      }
      this.ring(b.x, b.y - 10, 20, s.radius, '#7dff8f', 0.5, 5);
      this.flash(b.x, b.y - 20, 120, '#c8ffd0', 0.3);
    } else if (s.kind === 'meteor') {
      // lluvia de golpes alrededor del punto elegido
      this.startAction(b, ang, 'Shoot', 0.45);
      const d = Math.min(dist, s.range);
      const cx = b.x + Math.cos(ang) * d, cy = b.y + Math.sin(ang) * d;
      for (let i = 0; i < s.count; i++) {
        const a = (i / s.count) * Math.PI * 2 + Math.random(), r = i ? s.spreadR * (0.5 + Math.random() * 0.5) : 0;
        this.projectiles.push({
          lob: true, sx: b.x, sy: b.y, tx: cx + Math.cos(a) * r, ty: cy + Math.sin(a) * r,
          t: -i * 0.12, T: s.flight, x: b.x, y: b.y, z: 0, team: b.team, owner: b, look: s.look || {}, atkType: sT,
          atk: s, isSuper: true, mul: 1, charge: false, trailT: 0,
        });
      }
    } else if (s.kind === 'stealth') {
      this.startAction(b, b.facing, 'Attack', 0.4);
      b.stealthT = s.time;
      b.revealT = 0;
      b.powerNext = true;
      for (let i = 0; i < 18; i++) this.px(b.x + (Math.random() - 0.5) * 50, b.y - 20 + (Math.random() - 0.5) * 40, i % 2 ? '#5c48aa' : '#9e8aea', { speed: 40, vy: -40, life: 0.8, size: 7, grow: 1.5 });
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

  spawnShot(b, atk, ang, isSuper, mul, shotId, side) {
    // side: desplazamiento lateral (para los disparos dobles en paralelo)
    const ox = b.x + Math.cos(ang) * 18 - Math.sin(ang) * (side || 0), oy = b.y + Math.sin(ang) * 18 - 4 + Math.cos(ang) * (side || 0);
    this.projectiles.push({
      x: ox, y: oy, vx: Math.cos(ang) * atk.speed, vy: Math.sin(ang) * atk.speed, ang,
      r: atk.r || 12, dmg: atk.dmg * (mul || 1), team: b.team, owner: b, range: atk.range, traveled: 0,
      pierce: !!atk.pierce, hit: new Set(), look: atk.look || {}, atkType: (isSuper && atk.type) || b.def.atkType, charge: !isSuper,
      destroysWalls: !!atk.destroysWalls, knockback: atk.knockback || 0, stun: atk.stun || 0, isSuper, shotId: shotId || this.nextShotId++,
      powered: (mul || 1) > 1, t: 0, trailT: 0, homing: atk.homing || 0, boomerang: !!atk.boomerang,
    });
  }

  spawnLob(b, atk, ang, dist, isSuper, mul) {
    this.projectiles.push({
      lob: true, sx: b.x, sy: b.y, tx: b.x + Math.cos(ang) * dist, ty: b.y + Math.sin(ang) * dist,
      t: 0, T: atk.flight, x: b.x, y: b.y, z: 0, team: b.team, owner: b, look: atk.look || {}, atkType: (isSuper && atk.type) || b.def.atkType,
      atk, isSuper, mul: mul || 1, charge: !isSuper, trailT: 0,
    });
  }

  updateProjectiles(dt) {
    const keep = [];
    for (const p of this.projectiles) {
      p.t += dt;
      this.trail(p, dt);
      if (p.lob) {
        const k = Math.max(0, Math.min(1, p.t / p.T));
        p.x = p.sx + (p.tx - p.sx) * k;
        p.y = p.sy + (p.ty - p.sy) * k;
        p.z = Math.sin(k * Math.PI) * (60 + Math.hypot(p.tx - p.sx, p.ty - p.sy) * 0.18);
        if (k >= 1) {
          if (p.atk.kind === 'zone') {
            this.zones.push({ x: p.x, y: p.y, r: p.atk.radius, t: p.atk.duration, life: p.atk.duration, team: p.team, atk: p.atk, by: p.owner, tickT: 0 });
            const zp = PB.VFX.PAL[p.atkType] || PB.VFX.PAL.grass;
            this.ring(p.x, p.y, 20, p.atk.radius, zp[3], 0.4, 5);
            for (let i = 0; i < 16; i++) this.px(p.x, p.y, i % 2 ? zp[2] : zp[3], { speed: 260, life: 0.5, size: 5 });
            this.events.push({ type: 'zone' });
          } else {
            this.explode(p.owner, p.x, p.y, p.atk.radius, p.atk.dmg * p.mul, p.atkType, { charge: p.charge });
            // trozos de roca
            for (let i = 0; i < 6; i++) {
              const a = Math.random() * Math.PI * 2, s = 80 + Math.random() * 140;
              this.vfx('rock', PB.VFX.PAL[p.atkType] ? p.atkType : 'rock', p.x, p.y, { vx: Math.cos(a) * s, vy: Math.sin(a) * s, z: 10, vz: 220 + Math.random() * 200, scale: 0.6, life: 0.7, spin: 8 });
            }
          }
          continue;
        }
        keep.push(p);
        continue;
      }
      if (p.homing) {
        let best = null, bd = 320;
        for (const e of this.brawlers) {
          if (e.dead || e.team === p.team || !this.visibleTo(e, p.team)) continue;
          const d = Math.hypot(e.x - p.x, e.y - 8 - p.y);
          if (d < bd && (e.x - p.x) * p.vx + (e.y - p.y) * p.vy > 0) { bd = d; best = e; }
        }
        if (best) {
          const want = Math.atan2(best.y - 8 - p.y, best.x - p.x), cur = Math.atan2(p.vy, p.vx);
          const diff = ((want - cur + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
          const turn = Math.max(-p.homing * dt, Math.min(p.homing * dt, diff));
          const sp = Math.hypot(p.vx, p.vy);
          p.ang = cur + turn;
          p.vx = Math.cos(p.ang) * sp;
          p.vy = Math.sin(p.ang) * sp;
        }
      }
      if (p.boomerang && p.back) {
        const o = p.owner, dx = o.x - p.x, dy = o.y - 10 - p.y, d = Math.hypot(dx, dy) || 1;
        const sp = Math.hypot(p.vx, p.vy);
        p.vx = (dx / d) * sp;
        p.vy = (dy / d) * sp;
        if (d < 30 || o.dead || p.t > 4) continue;
      }
      const step = Math.hypot(p.vx, p.vy) * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.traveled += step;
      if (p.traveled >= p.range) {
        if (p.boomerang && !p.back) { p.back = true; p.hit = new Set(); }
        else if (!p.boomerang) {
          this.puff(p);
          continue;
        }
      }
      if (!p.boomerang && this.world.shotBlockedAt(p.x, p.y)) {
        const T = PB.TILE, c = Math.floor(p.x / T), r = Math.floor(p.y / T);
        if (p.destroysWalls && this.breakWalls(p.x, p.y, 40).length) {
          this.shake = Math.max(this.shake, 6);
        } else {
          if (this.world.tile(c, r) === 'C') this.damageCrate(c, r, p.dmg, p.owner, p.charge);
          this.puff(p, true);
          continue;
        }
      }
      let dead = false;
      for (const st of this.structures) {
        if (st.hp <= 0 || st.team === p.team || p.hit.has('s' + st.id)) continue;
        if (Math.hypot(st.x - p.x, st.y - 10 - p.y) < p.r + st.r) {
          p.hit.add('s' + st.id);
          this.damageStructure(st, p.dmg, p.owner, p.charge, p.x, p.y);
          if (!p.pierce) { dead = true; this.puff(p); break; }
        }
      }
      if (dead) continue;
      for (const e of this.brawlers) {
        if (e.dead || e.team === p.team || p.hit.has(e.idx)) continue;
        if (Math.hypot(e.x - p.x, e.y - 8 - p.y) < p.r + e.r) {
          p.hit.add(e.idx);
          this.damage(e, p.dmg, p.owner, p.atkType, {
            charge: p.charge, knockback: p.knockback, stun: p.stun, kx: p.vx, ky: p.vy, shotId: p.shotId, hx: p.x, hy: p.y, big: p.isSuper || p.powered,
          });
          if (!p.pierce) { dead = true; break; }
        }
      }
      if (!dead) keep.push(p);
    }
    this.projectiles = keep;
  }

  // Partículas que deja cada proyectil al volar
  trail(p, dt) {
    const tr = p.look && p.look.trail;
    if (!tr || p.t < 0) return;
    p.trailT -= dt;
    if (p.trailT > 0) return;
    p.trailT = p.isSuper ? 0.02 : 0.035;
    const y = p.lob ? p.y - p.z - 10 : p.y;
    const pal = PB.VFX.PAL[p.atkType] || PB.VFX.PAL.normal;
    const jitter = (s) => (Math.random() - 0.5) * s;
    switch (tr) {
      case 'ember':
        this.px(p.x + jitter(10), y + jitter(10), pal[2 + Math.floor(Math.random() * 3)], { speed: 20, vy: -60, life: 0.35, size: 4 });
        break;
      case 'drip':
        this.px(p.x + jitter(6), y + jitter(6), pal[3], { speed: 10, vy: 40, life: 0.3, size: 4 });
        break;
      case 'bubbles':
        this.vfx('bubble', 'water', p.x + jitter(50), y + jitter(50), { scale: 0.7 + Math.random() * 0.6, life: 0.45, vy: -30, fade: true });
        this.px(p.x + jitter(40), y + jitter(40), pal[4], { speed: 30, life: 0.3, size: 4 });
        break;
      case 'leaves':
        if (Math.random() < 0.5) this.px(p.x + jitter(8), y + jitter(8), pal[3], { speed: 20, life: 0.3, size: 3 });
        break;
      case 'spark':
        this.px(p.x + jitter(8), y + jitter(8), Math.random() < 0.5 ? pal[3] : '#ffffff', { speed: 90, life: 0.18, size: 3 });
        break;
      case 'dirt':
        this.px(p.x + jitter(10), y + jitter(10), pal[1 + Math.floor(Math.random() * 2)], { speed: 20, vy: 30, life: 0.3, size: 4 });
        break;
      case 'wisp':
        this.px(p.x + jitter(20), y + jitter(20), pal[2 + Math.floor(Math.random() * 2)], { speed: 15, vy: -25, life: 0.5, size: 6, grow: 0.5 });
        break;
    }
  }

  updateZones(dt) {
    for (const z of this.zones) {
      z.t -= dt;
      z.tickT -= dt;
      const tick = z.tickT <= 0;
      if (tick) z.tickT = 0.25;
      for (const b of this.brawlers) {
        if (b.dead || Math.hypot(b.x - z.x, b.y - z.y) > z.r) continue;
        if (b.team !== z.team && z.atk.pull) {
          // remolino: arrastra hacia el centro
          const dx = z.x - b.x, dy = z.y - b.y, d = Math.hypot(dx, dy) || 1;
          if (d > 12) this.world.moveCircle(b, (dx / d) * z.atk.pull * dt, (dy / d) * z.atk.pull * dt);
        }
        if (b.team === z.team) {
          if (z.atk.heal > 0 && b.hp < b.maxHp) {
            b.hp = Math.min(b.maxHp, b.hp + z.atk.heal * dt);
            if (tick) this.vfx('heart', 'fairy', b.x + (Math.random() - 0.5) * 30, b.y - 40, { vy: -50, life: 0.6, scale: 1, fade: true });
          }
        } else if (tick) {
          this.damage(b, z.atk.dps * 0.25, z.by, z.atk.type || z.by.def.atkType, { quiet: true });
          // drenado: partícula que va hacia el centro
          this.px(b.x, b.y - 20, (PB.VFX.PAL[z.atk.type || z.by.def.atkType] || PB.VFX.PAL.grass)[3], { vx: (z.x - b.x) * 2, vy: (z.y - b.y) * 2, life: 0.45, size: 5 });
        }
      }
      if (Math.random() < 0.5) {
        const a = Math.random() * Math.PI * 2, d = Math.random() * z.r;
        const T = z.atk.type || z.by.def.atkType;
        this.vfx(T === 'grass' ? 'leaf' : T === 'poison' ? 'bubble' : PB.VFX.forType(T).proj, T, z.x + Math.cos(a) * d, z.y + Math.sin(a) * d, { vy: -40, life: 0.6, scale: 0.8, spin: 6, fade: true });
      }
    }
    this.zones = this.zones.filter((z) => z.t > 0);
  }

  // golpe cuerpo a cuerpo en arco delante del Pokémon (rompe cajas)
  slash(b, atk, ang, mul) {
    const half = atk.arc / 2;
    let hitAny = false;
    for (const e of this.brawlers) {
      if (e.dead || e.team === b.team) continue;
      const d = Math.hypot(e.x - b.x, e.y - b.y);
      if (d > atk.range + e.r) continue;
      const off = Math.abs(((Math.atan2(e.y - b.y, e.x - b.x) - ang + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
      if (off > half && d > e.r + 10) continue;
      this.damage(e, atk.dmg * (mul || 1), b, b.def.atkType, { charge: true, knockback: 160, kx: Math.cos(ang), ky: Math.sin(ang), big: true });
      hitAny = true;
    }
    for (const st of this.structures) {
      if (st.hp <= 0 || st.team === b.team || Math.hypot(st.x - b.x, st.y - b.y) > atk.range + st.r) continue;
      this.damageStructure(st, atk.dmg * (mul || 1), b, true, st.x, st.y - 30);
    }
    // cajas (Niebla Tóxica) delante
    const T = PB.TILE;
    for (const k of [0.5, 0.9]) {
      const x = b.x + Math.cos(ang) * atk.range * k, y = b.y + Math.sin(ang) * atk.range * k;
      const c = Math.floor(x / T), r = Math.floor(y / T);
      if (this.world.tile(c, r) === 'C') { this.damageCrate(c, r, atk.dmg * (mul || 1), b, true); break; }
    }
    this.fx.push({ kind: 'slash', x: b.x, y: b.y - 14, ang, r: atk.range, arc: atk.arc, t: 0, life: 0.2, type: b.def.atkType });
    if (hitAny) this.shake = Math.max(this.shake, 3);
  }

  // rayo en cadena: golpea al más cercano y salta a los siguientes
  chainHit(b, s, type, ang) {
    const pts = [{ x: b.x, y: b.y - 20 }];
    const hit = new Set();
    let from = b, dmg = s.dmg;
    for (let i = 0; i < s.count; i++) {
      let best = null, bd = i === 0 ? s.range : s.hop;
      for (const e of this.brawlers) {
        if (e.dead || e.team === b.team || hit.has(e.idx) || !this.visibleTo(e, b.team)) continue;
        const d = Math.hypot(e.x - from.x, e.y - from.y);
        // el primero: hacia donde apuntas (o el más cercano)
        const off = i === 0 ? Math.abs(((Math.atan2(e.y - b.y, e.x - b.x) - ang + Math.PI * 3) % (Math.PI * 2)) - Math.PI) : 0;
        if (d - (i === 0 ? e.r : 0) < bd && off < 0.9 && this.world.los(from.x, from.y, e.x, e.y)) { bd = d; best = e; }
      }
      if (!best) break;
      hit.add(best.idx);
      pts.push({ x: best.x, y: best.y - 20 });
      this.damage(best, dmg, b, type, { stun: s.stun, big: true });
      from = best;
      dmg *= s.falloff || 0.85;
    }
    if (pts.length === 1) pts.push({ x: b.x + Math.cos(ang) * s.range * 0.6, y: b.y - 20 + Math.sin(ang) * s.range * 0.6 });
    this.fx.push({ kind: 'chain', pts, t: 0, life: 0.35, type, seed: Math.random() * 100 });
  }

  // rayo recto: daña a todo lo que pille en la línea (atraviesa)
  beamHit(b, s, type, ang) {
    const x1 = b.x, y1 = b.y - 18, x2 = x1 + Math.cos(ang) * s.range, y2 = y1 + Math.sin(ang) * s.range;
    for (const e of this.brawlers) {
      if (e.dead || e.team === b.team) continue;
      const t = Math.max(0, Math.min(1, ((e.x - x1) * (x2 - x1) + (e.y - 10 - y1) * (y2 - y1)) / (s.range * s.range)));
      const d = Math.hypot(e.x - (x1 + (x2 - x1) * t), e.y - 10 - (y1 + (y2 - y1) * t));
      if (d < s.width / 2 + e.r) this.damage(e, s.dmg, b, type, { knockback: 240, kx: x2 - x1, ky: y2 - y1, big: true });
    }
    for (const st of this.structures) {
      if (st.hp <= 0 || st.team === b.team) continue;
      const t = Math.max(0, Math.min(1, ((st.x - x1) * (x2 - x1) + (st.y - y1) * (y2 - y1)) / (s.range * s.range)));
      if (Math.hypot(st.x - (x1 + (x2 - x1) * t), st.y - (y1 + (y2 - y1) * t)) < s.width / 2 + st.r) this.damageStructure(st, s.dmg, b, false, st.x, st.y - 30);
    }
    this.fx.push({ kind: 'beam', x1, y1, x2, y2, w: s.width, t: 0, life: 0.4, type });
    this.shake = Math.max(this.shake, 8);
  }

  // trampas: se activan al acercarse un rival
  updateMines(dt) {
    for (const m of this.mines) {
      m.t -= dt;
      m.armT -= dt;
      if (m.armT > 0) continue;
      for (const e of this.brawlers) {
        if (e.dead || e.team === m.team || Math.hypot(e.x - m.x, e.y - m.y) > m.atk.trigger + e.r) continue;
        this.explode(m.owner, m.x, m.y, m.atk.radius, m.atk.dmg, m.type, { stun: m.atk.stun, big: true });
        m.t = 0;
        break;
      }
    }
    this.mines = this.mines.filter((m) => m.t > 0);
  }

  // orbes que disparan solos al rival más cercano que vean
  updateTurrets(dt) {
    for (const tu of this.turrets) {
      tu.t -= dt;
      tu.fireT -= dt;
      if (tu.fireT > 0) continue;
      let best = null, bd = tu.atk.range;
      for (const e of this.brawlers) {
        if (e.dead || e.team === tu.team || !this.visibleTo(e, tu.team)) continue;
        const d = Math.hypot(e.x - tu.x, e.y - tu.y);
        if (d < bd && this.world.los(tu.x, tu.y, e.x, e.y)) { bd = d; best = e; }
      }
      if (!best) continue;
      tu.fireT = tu.atk.rate;
      const ang = Math.atan2(best.y - 8 - (tu.y - 24), best.x - tu.x);
      this.projectiles.push({
        x: tu.x, y: tu.y - 24, vx: Math.cos(ang) * tu.atk.speed, vy: Math.sin(ang) * tu.atk.speed, ang,
        r: tu.atk.r, dmg: tu.atk.dmg, team: tu.team, owner: tu.owner, range: tu.atk.range + 40, traveled: 0,
        pierce: false, hit: new Set(), look: tu.atk.look || {}, atkType: tu.type, charge: false,
        destroysWalls: false, knockback: 0, stun: 0, isSuper: false, shotId: this.nextShotId++, powered: false, t: 0, trailT: 0,
      });
    }
    this.turrets = this.turrets.filter((tu) => tu.t > 0);
  }

  explode(owner, x, y, radius, dmg, atkType, opts) {
    for (const e of this.brawlers) {
      if (e.dead || e.team === owner.team) continue;
      if (Math.hypot(e.x - x, e.y - y) < radius + e.r) {
        this.damage(e, dmg, owner, atkType, { ...opts, kx: e.x - x, ky: e.y - y });
      }
    }
    for (const st of this.structures) {
      if (st.hp > 0 && st.team !== owner.team && Math.hypot(st.x - x, st.y - y) < radius + st.r) this.damageStructure(st, dmg, owner, opts.charge, st.x, st.y - 20);
    }
    const T = PB.TILE;
    for (let r = Math.floor((y - radius) / T); r <= Math.floor((y + radius) / T); r++) {
      for (let c = Math.floor((x - radius) / T); c <= Math.floor((x + radius) / T); c++) {
        if (this.world.tile(c, r) === 'C' && Math.hypot(c * T + T / 2 - x, r * T + T / 2 - y) < radius + 30) this.damageCrate(c, r, dmg, owner, opts.charge);
      }
    }
    const pal = PB.VFX.PAL[atkType] || PB.VFX.PAL.normal;
    const n = opts.big ? 36 : 14;
    for (let i = 0; i < n; i++) this.px(x, y, pal[1 + (i % 4)], { speed: radius * 2.4, life: 0.5, size: opts.big ? 7 : 5, vz: 1 });
    for (let i = 0; i < (opts.big ? 10 : 4); i++) {
      this.px(x + (Math.random() - 0.5) * radius, y + (Math.random() - 0.5) * radius * 0.6, 'rgba(230,220,190,0.6)', { speed: 30, vy: -30, life: 0.7, size: 14, grow: 1.5 });
    }
    this.ring(x, y, radius * 0.3, radius, '#ffffff', 0.3, opts.big ? 8 : 5);
    this.flash(x, y, radius * 0.9, pal[3], 0.18);
    this.events.push({ type: 'boom', big: !!opts.big });
    this.shake = Math.max(this.shake, opts.big ? 14 : 5);
  }

  breakWalls(x, y, radius) {
    const broken = this.world.destroyAround(x, y, radius);
    for (const w of broken) {
      const cols = w.kind === 'T' ? ['#2f8a3e', '#48a850', '#6a4428'] : w.kind === 'F' || w.kind === 'W' ? ['#8e5a2e', '#b07640', '#5a3818'] : ['#5c6672', '#9ca8b4', '#7c8894'];
      for (let i = 0; i < 12; i++) {
        const a = Math.random() * Math.PI * 2, s = 60 + Math.random() * 220;
        this.px(w.x, w.y, cols[i % 3], { vx: Math.cos(a) * s, vy: Math.sin(a) * s, z: 20, vz: 200 + Math.random() * 250, life: 0.9, size: 7 });
      }
      if (w.kind === 'T') for (let i = 0; i < 5; i++) this.vfx('leaf', 'grass', w.x, w.y - 40, { vx: (Math.random() - 0.5) * 160, vy: -40 - Math.random() * 60, life: 0.9, spin: 6, scale: 1, fade: true });
      this.px(w.x, w.y, 'rgba(220,220,210,0.6)', { speed: 20, life: 0.8, size: 40, grow: 1.5 });
    }
    for (const w of broken) if (w.kind === 'C') this.dropCandy(w.x, w.y, 1);
    if (broken.length) this.events.push({ type: 'wall' });
    return broken;
  }

  // Daño a una caja de Caramelos (se rompe al llegar a 0)
  damageCrate(c, r, amount, source, charge) {
    const W = this.world, key = r * W.w + c;
    const hp = (W.crateHp.get(key) || 0) - amount * this.powerMul(source);
    const T = PB.TILE, x = c * T + T / 2, y = r * T + T / 2;
    if (source && charge) source.superCharge = Math.min(1, source.superCharge + 0.5 / source.def.superHits);
    this.fx.push({ kind: 'crateHit', c, r, t: 0, life: 0.15 });
    if (hp <= 0) {
      W.crateHp.delete(key);
      W.tiles[r][c] = '.';
      W.version++;
      for (let i = 0; i < 14; i++) {
        const a = Math.random() * Math.PI * 2, s = 60 + Math.random() * 200;
        this.px(x, y, ['#6e4220', '#b07640', '#a4acb8'][i % 3], { vx: Math.cos(a) * s, vy: Math.sin(a) * s, z: 20, vz: 200 + Math.random() * 250, life: 0.9, size: 7 });
      }
      this.dropCandy(x, y, 1);
      this.events.push({ type: 'wall' });
    } else W.crateHp.set(key, hp);
  }

  dropCandy(x, y, n) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = n > 1 ? 80 + Math.random() * 120 : 20;
      this.balls.push({ kind: 'candy', x, y, z: 10, vx: Math.cos(a) * s, vy: Math.sin(a) * s, vz: 380, delay: 0.4, taken: false, spin: 0 });
    }
  }

  // Daño a Snorlax (o cualquier estructura)
  damageStructure(st, amount, source, charge, hx, hy) {
    const amt = Math.round(amount * this.powerMul(source));
    st.hp = Math.max(0, st.hp - amt);
    st.flashT = 0.1;
    if (source) {
      source.dmgDone += amt;
      source.stat += amt;
      this.gainXp(source, amt * PB.EVO.perDamage * 0.5);
      if (charge) source.superCharge = Math.min(1, source.superCharge + 0.6 / source.def.superHits);
    }
    const pal = PB.VFX.PAL[source ? source.def.atkType : 'normal'] || PB.VFX.PAL.normal;
    this.vfx('impact', source ? source.def.atkType : 'normal', hx, hy, { scale: 1.6, life: 0.16, frameRate: 14 });
    for (let i = 0; i < 4; i++) this.px(hx, hy, pal[2 + (i % 3)], { speed: 140, life: 0.3, size: 4 });
    this.text(st.x + (Math.random() - 0.5) * 40, st.y - 90, String(amt), '#ffffff', 16);
    this.events.push({ type: 'structHit', st });
  }

  muzzle(b, ang) {
    const pal = PB.VFX.PAL[b.def.atkType] || PB.VFX.PAL.normal;
    const x = b.x + Math.cos(ang) * 26, y = b.y + Math.sin(ang) * 26 - 8;
    this.flash(x, y, 26, pal[4], 0.08);
    for (let i = 0; i < 4; i++) {
      const a = ang + (Math.random() - 0.5) * 0.9, s = 80 + Math.random() * 120;
      this.px(x, y, pal[3], { vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.2, size: 4 });
    }
  }

  puff(p, wall) {
    const pal = PB.VFX.PAL[p.atkType] || PB.VFX.PAL.normal;
    for (let i = 0; i < (wall ? 8 : 5); i++) this.px(p.x, p.y, pal[2 + (i % 3)], { speed: wall ? 140 : 80, life: 0.3, size: 4 });
    if (wall) this.vfx('impact', p.atkType, p.x, p.y, { scale: 1, life: 0.14 });
  }

  damage(target, amount, source, atkType, opts) {
    if (target.dead || target.shieldT > 0 || target.spawnT > 0) return;
    const eff = atkType ? PB.effectiveness(atkType, target.types || target.def.types) : 1;
    // escudo de súper: reduce el daño
    const shield = target.barrierT > 0 ? 1 - (target.barrierReduce || 0.5) : 1;
    const amt = Math.round(amount * eff * this.powerMul(source) * shield);
    target.hp -= amt;
    target.lastCombat = this.time;
    target.hurtT = 0.2;
    target.flashT = 0.1;
    target.revealT = Math.max(target.revealT, 0.5);
    if (source) {
      source.dmgDone += amt;
      if (source.team !== target.team) this.gainXp(source, Math.min(amt, target.hp + amt) * PB.EVO.perDamage);
      if (opts.charge) {
        const before = source.superCharge;
        source.superCharge = Math.min(1, source.superCharge + 1 / source.def.superHits);
        if (before < 1 && source.superCharge >= 1) this.events.push({ type: 'superReady', b: source });
      }
    }
    if (opts.knockback) {
      const l = Math.hypot(opts.kx || 0, opts.ky || 0) || 1;
      target.kx += ((opts.kx || 0) / l) * opts.knockback;
      target.ky += ((opts.ky || 0) / l) * opts.knockback;
    }
    if (opts.stun) target.stunT = Math.max(target.stunT, opts.stun);
    // efecto de impacto
    if (!opts.quiet) {
      const hx = opts.hx != null ? opts.hx : target.x, hy = opts.hy != null ? opts.hy : target.y - 20;
      const pal = PB.VFX.PAL[atkType] || PB.VFX.PAL.normal;
      this.vfx('impact', atkType, hx, hy, { scale: opts.big ? 2.2 : 1.4, life: 0.16, frameRate: 14 });
      for (let i = 0; i < (opts.big ? 10 : 5); i++) this.px(hx, hy, pal[2 + (i % 3)], { speed: opts.big ? 220 : 140, life: 0.3, size: 4 });
    }
    // número de daño: pequeño y por colores (amarillo = muy eficaz, gris = poco eficaz).
    // Los golpes seguidos al mismo Pokémon se suman en un solo número para no llenar la pantalla.
    const col = eff > 1 ? '#ffcf3a' : eff < 1 ? '#b8b8b8' : target.isPlayer ? '#ff8a80' : '#ffffff';
    const prevTxt = this.fx.find((f) => f.kind === 'text' && f.dmg && f.tid === target.idx && !f._s && f.t < 0.3);
    if (prevTxt) {
      prevTxt.val += amt;
      prevTxt.text = String(prevTxt.val);
      prevTxt.t = Math.min(prevTxt.t, 0.06);
      if (eff > 1) { prevTxt.color = col; prevTxt.size = 19; }
    } else {
      this.text(target.x + (Math.random() - 0.5) * 20, target.y - 62, String(amt), col, eff > 1 ? 19 : opts.quiet ? 12 : 15, true);
      const f = this.fx[this.fx.length - 1];
      f.tid = target.idx;
      f.val = amt;
    }
    // golpe que "pesa": el objetivo se queda quieto un instante y retrocede un poco
    if (!opts.quiet && source && amt > 0) {
      target.hitStopT = Math.max(target.hitStopT || 0, opts.big || eff > 1 ? 0.07 : 0.04);
      if (!opts.knockback) {
        const a = Math.atan2(target.y - source.y, target.x - source.x);
        target.kx += Math.cos(a) * 140;
        target.ky += Math.sin(a) * 140;
      }
    }
    if (eff > 1 && opts.shotId && this._lastEffShot !== opts.shotId) {
      this._lastEffShot = opts.shotId;
      this.text(target.x, target.y - 92, PB.T('¡Muy eficaz!'), '#ffcf3a', 16);
    }
    this.events.push({ type: 'hit', target, source });
    if (target.hp <= 0) this.kill(target, source);
  }

  kill(b, killer) {
    b.dead = true;
    b.hp = 0;
    b.deaths++;
    b.streak = 0;
    b.respawnT = this.rules.respawn;
    b.dash = null;
    b.burst = null;
    b.stealthT = 0;
    if (killer && killer !== b) {
      killer.kills++;
      killer.streak++;
      this.gainXp(killer, PB.EVO.perKO + PB.EVO.perKOStage * (b.stage || 0));
    }
    for (let i = 0; i < b.balls; i++) {
      const a = Math.random() * Math.PI * 2, s = 90 + Math.random() * 140;
      this.balls.push({ kind: 'ball', x: b.x, y: b.y, z: 20, vx: Math.cos(a) * s, vy: Math.sin(a) * s, vz: 300 + Math.random() * 200, delay: 0.5, taken: false, spin: Math.random() * 6 });
    }
    b.balls = 0;
    if (this.mode.onKill) this.mode.onKill(this, b, killer);
    // animación: se debilita y vuelve a su Pokéball con el rayo rojo
    this.fx.push({ kind: 'faint', dex: b.dex, shiny: b.shiny, x: b.x, y: b.y, facing: b.facing, team: b.team, t: 0, life: 1.5 });
    for (let i = 0; i < 16; i++) this.px(b.x, b.y - 16, i % 2 ? '#ffffff' : b.team === 'blue' ? '#5ab0ff' : '#ff5a5a', { speed: 240, life: 0.5, size: 5 });
    this.feed.push({ killer: killer ? killer.name : '?', kdex: killer && killer.def ? killer.dex : null, victim: b.name, vdex: b.dex, team: killer ? killer.team : 'red', t: this.time });
    if (this.feed.length > 4) this.feed.shift();
    this.events.push({ type: 'ko', b, killer, streak: killer ? killer.streak : 0 });
    this.shake = Math.max(this.shake, b.isPlayer ? 16 : 6);
  }

  respawn(b) {
    const list = this.world.spawns[b.team] || this.world.spawns.free;
    const sp = list[Math.floor(Math.random() * list.length)];
    Object.assign(b, {
      x: sp.x, y: sp.y, dead: false, hp: b.maxHp, ammo: this.rules.maxAmmo, shieldT: this.rules.spawnShield,
      kx: 0, ky: 0, stunT: 0, action: null, powerNext: false,
    });
    this.releaseFx(b);
    this.events.push({ type: 'respawn', b });
  }

  // Sale de la Pokéball: la bola se abre con un destello blanco
  releaseFx(b) {
    b.spawnT = 0.45;
    this.fx.push({ kind: 'release', x: b.x, y: b.y, t: 0, life: 0.6 });
  }

  // Física de los objetos del suelo (Pokéballs, Caramelos): saltan, rebotan y ruedan
  updateBalls(dt) {
    this.padGlow = Math.max(0, this.padGlow - dt);
    for (const g of this.balls) {
      g.delay -= dt;
      // altura con gravedad y rebotes
      g.vz -= 1500 * dt;
      g.z += g.vz * dt;
      if (g.z <= 0) {
        g.z = 0;
        if (Math.abs(g.vz) > 140) { g.vz = -g.vz * 0.45; this.px(g.x, g.y, 'rgba(235,240,210,0.7)', { speed: 30, life: 0.25, size: 5 }); }
        else g.vz = 0;
      }
      if (g.vx || g.vy) {
        const e = { x: g.x, y: g.y, r: 10 };
        this.world.moveCircle(e, g.vx * dt, g.vy * dt);
        g.x = e.x;
        g.y = e.y;
        g.spin += (Math.hypot(g.vx, g.vy) / 14) * dt * (g.vx >= 0 ? 1 : -1);
        const f = Math.exp((g.z > 0 ? -1 : -5) * dt);
        g.vx *= f;
        g.vy *= f;
        if (Math.hypot(g.vx, g.vy) < 5) g.vx = g.vy = 0;
      } else {
        g.spin *= Math.exp(-6 * dt);
      }
    }
    this.balls = this.balls.filter((g) => !g.taken);
  }

  end(result) {
    this.winner = result;
    this.events.push({ type: 'end', result });
  }

  // ---------------------------------------------------------------- efectos
  // Cuadrado de color (con altura opcional z/vz para trozos que saltan)
  px(x, y, color, o) {
    o = o || {};
    if (PB.Settings.get('quality') === 'baja' && Math.random() < 0.55) return; // menos partículas
    let vx = o.vx, vy = o.vy;
    if (vx == null) {
      const a = Math.random() * Math.PI * 2, s = Math.random() * (o.speed || 0);
      vx = Math.cos(a) * s;
      vy = Math.sin(a) * s + (o.vy || 0);
    }
    const life = (o.life || 0.4) * (0.6 + Math.random() * 0.6);
    this.fx.push({ kind: 'px', x, y, vx, vy, z: o.z || 0, vz: o.vz || 0, color, t: 0, life, size: o.size || 4, grow: o.grow || 0, drag: o.vz ? 1 : 0.9 });
  }

  // Sprite de efecto de PB.VFX
  vfx(shape, pal, x, y, o) {
    o = o || {};
    this.fx.push({
      kind: 'vfx', shape, pal, x, y, vx: o.vx || 0, vy: o.vy || 0, z: o.z || 0, vz: o.vz || 0,
      angle: o.angle || 0, spin: o.spin || 0, scale: o.scale || 1, t: 0, life: o.life || 0.3, fade: o.fade, frameRate: o.frameRate || 10,
    });
  }

  ring(x, y, r0, r1, color, life, width) {
    this.fx.push({ kind: 'ring', x, y, r0, r1, color, t: 0, life, width: width || 4 });
  }

  flash(x, y, r, color, life) {
    this.fx.push({ kind: 'flash', x, y, r, color, t: 0, life });
  }

  text(x, y, text, color, size, dmg) {
    this.fx.push({ kind: 'text', x, y, text, color, size, t: 0, life: 0.85, dmg: !!dmg });
  }

  updateFx(dt) {
    for (const f of this.fx) {
      f.t += dt;
      if (f.kind === 'px' || f.kind === 'vfx') {
        f.x += f.vx * dt;
        f.y += f.vy * dt;
        if (f.vz || f.z > 0) {
          f.vz -= 1200 * dt;
          f.z += f.vz * dt;
          if (f.z < 0) { f.z = 0; f.vz = -f.vz * 0.35; f.vx *= 0.6; f.vy *= 0.6; if (Math.abs(f.vz) < 60) f.vz = 0; }
        } else if (f.kind === 'px') {
          const k = Math.pow(f.drag, dt * 60);
          f.vx *= k;
          f.vy *= k;
        }
        if (f.spin) f.angle += f.spin * dt;
      } else if (f.kind === 'text') {
        f.y -= 40 * dt;
      }
    }
    this.fx = this.fx.filter((f) => f.t < f.life);
    this.shake = Math.max(0, this.shake - 40 * dt);
  }
};
