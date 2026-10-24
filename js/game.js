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
    // partida en red (con otras personas): que te eliminen no acaba la partida de los demás
    this.online = !!opts.humans;
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
      // set de movimientos elegido (nuevo / clásico) para el ataque y para el súper
      const kit = PB.validKit(id, opts.kits && opts.kits[this.brawlers.length]);
      const line = (opts.lines && opts.lines[this.brawlers.length]) || PB.brawlerById(id).line;
      const def = PB.retype(PB.brawlerById(id), line, 0, kit);
      this.brawlers.push({
        idx: this.brawlers.length, def, team, isPlayer: !!isPlayer,
        name: isPlayer ? 'TÚ' : def.name,
        // evolución: fase actual (0 = primera), su número de Pokédex y sus tipos
        line, kit, stage: 0, xp: 0, dex: line[0], types: PB.stageTypes({ line }, 0), shiny: false, evoT: 0,
        x: sp.x, y: sp.y, r: 22, vx: 0, vy: 0, kx: 0, ky: 0,
        hp: def.hp, maxHp: def.hp, ammo: this.rules.maxAmmo, shotCd: 0, superCharge: 0, megaCharge: 0, megaT: 0,
        balls: 0, power: 0, stat: 0, dead: false, out: false, respawnT: 0, lastCombat: -99, revealT: 0,
        facing: sp.y > this.world.pixelH / 2 ? -Math.PI / 2 : Math.PI / 2,
        moving: false, animT: Math.random() * 3, action: null, hurtT: 0, flashT: 0,
        stunT: 0, dash: null, stealthT: 0, powerNext: false, shieldT: this.rules.spawnShield,
        spawnT: 0, dustT: 0, burst: null, streak: 0,
        kills: 0, deaths: 0, ballsTaken: 0, dmgDone: 0,
      });
    };
    if (this.mode.duo) {
      // dúo: parejas (0-1, 2-3...) que salen juntas
      const spots = this.world.spawns.free.slice().sort(() => Math.random() - 0.5);
      opts.ffa.forEach((id, i) => {
        const sp = spots[Math.floor(i / 2) % spots.length];
        add(id, 'p' + Math.floor(i / 2), { x: sp.x + (i % 2 ? 34 : -34), y: sp.y }, i === 0 && opts.playerInBlue);
      });
    } else if (this.mode.ffa) {
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
    return b && b.line ? (1 + 0.1 * (b.power || 0)) * (b.lvlMul || 1) * PB.stageMul(b.def, b.stage || 0) * (b.megaT > 0 ? PB.MEGA.dmg : 1) * (b.rageT > 0 ? b.def.super.dmgMul || 1 : 1) * (b.buffT > 0 ? b.buffDmg || 1 : 1) : 1;
  }

  // velocidad al andar (invisible o con Danza Dragón y parecidos, más rápido; también el aura de algunos legendarios)
  speedOf(b) {
    const s = b.def.super;
    return b.def.speed * (b.stealthT > 0 || b.rageT > 0 ? s.speedMul || 1 : 1) * (b.buffT > 0 ? b.buffSpeed || 1 : 1) * (b.megaT > 0 ? PB.MEGA.speed : 1);
  }

  // Tipos de un luchador: los de su fase o, con skin regional, los de esa forma (Vulpix de Alola es de Hielo)
  typesFor(b) {
    const reg = b.megaSkin ? b.skinBase : b.skin;
    return PB.regionTypes(b.line, b.stage, reg) || PB.stageTypes(b, b.stage);
  }

  // ---------------------------------------------------------------- megaevolución
  canMega(b) {
    return b.stage >= PB.evoSteps(b.def).length;
  }

  gainMega(b, amount) {
    if (!b || !b.line || b.dead || b.megaT > 0 || amount <= 0) return; // el Voltorb del Voltorbol no es un luchador
    if (!b.megas) amount /= PB.MEGA.first[Math.min(3, b.line.length) - 1];
    const before = b.megaCharge;
    b.megaCharge = Math.min(1, b.megaCharge + amount);
    if (before < 1 && b.megaCharge >= 1 && this.canMega(b)) this.events.push({ type: 'megaReady', b });
  }

  megaEvolve(b) {
    b.megaCharge = 0;
    b.megaT = PB.MEGA.time;
    b.megas = (b.megas || 0) + 1;
    const mega = PB.megaSkin(b.dex, b.idx);
    b.megaSkin = !!mega;
    if (mega) { b.skinBase = b.skin || null; b.skin = mega; }
    b.shieldT = Math.max(b.shieldT, 0.5);
    const pal = PB.VFX.PAL[b.def.atkType] || PB.VFX.PAL.normal;
    this.ring(b.x, b.y - 20, 10, 150, '#ffffff', 0.55, 7);
    this.ring(b.x, b.y - 20, 10, 110, '#ff5ad8', 0.5, 6);
    this.ring(b.x, b.y - 20, 10, 80, pal[3], 0.45, 5);
    this.flash(b.x, b.y - 24, 160, '#ffffff', 0.45);
    for (let i = 0; i < 30; i++) this.px(b.x, b.y - 24, ['#ff5ad8', '#7ad8ff', '#ffe066', pal[3]][i % 4], { speed: 300, vy: -60, life: 0.8, size: 5 });
    this.text(b.x, b.y - 118, PB.T(mega ? '¡Megaevolución!' : '¡Poder Mega!'), '#ff8ae6', 20);
    this.shake = Math.max(this.shake, b.isPlayer ? 10 : 4);
    this.events.push({ type: 'mega', b, form: !!mega });
  }

  megaEnd(b) {
    b.megaT = 0;
    if (b.megaSkin) { b.skin = b.skinBase || null; b.megaSkin = false; }
    if (!b.dead) {
      this.ring(b.x, b.y - 20, 10, 70, '#ff8ae6', 0.4, 4);
      for (let i = 0; i < 10; i++) this.px(b.x, b.y - 24, '#ffd0f4', { speed: 140, vy: -40, life: 0.5, size: 4 });
    }
    this.events.push({ type: 'megaEnd', b });
  }

  // ---------------------------------------------------------------- evolución
  // EXP de evolución: por daño, K.O., objetivos y un poco solo por el tiempo.
  // Si algún rival va más evolucionado que tú, ganas EXP más rápido (para que nadie se escape).
  gainXp(b, amount) {
    if (!b || !b.line || b.dead || amount <= 0) return;
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
    b.types = this.typesFor(b);
    // ramas que cambian de tipo (Eevee): ataques nuevos
    const nd = PB.retype(PB.brawlerById(b.def.id), b.line, b.stage, b.kit);
    const changed = nd.attack.name !== b.def.attack.name || nd.super.name !== b.def.super.name;
    b.def = nd;
    if (changed) {
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
    if (b.megaCharge >= 1 && this.canMega(b)) this.events.push({ type: 'megaReady', b });
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
    if (b.dead || b.phase) return false; // Golpe Umbrío y parecidos: desaparece del todo
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
    if (b.reflectT > 0) b.reflectT -= dt;
    this.gainXp(b, PB.EVO.passive * dt);
    if (b.tfT > 0) {
      b.tfT -= dt;
      if (b.tfT <= 0) this.untransform(b);
    }
    if (b.megaT > 0) {
      b.megaT -= dt;
      if (b.megaT <= 0) this.megaEnd(b);
    } else this.gainMega(b, PB.MEGA.passive * dt);
    if (input.mega && b.megaCharge >= 1 && !(b.megaT > 0) && this.canMega(b) && b.spawnT <= 0 && !(b.evoT > 0)) this.megaEvolve(b);
    if (b.stealthT > 0) b.stealthT -= dt;
    if (b.rageT > 0) {
      b.rageT -= dt;
      b.rageFxT = (b.rageFxT || 0) - dt;
      if (b.rageFxT <= 0) {
        b.rageFxT = 0.05;
        const P = PB.VFX.PAL[b.def.super.type || b.def.atkType] || PB.VFX.PAL.fire;
        this.px(b.x + (Math.random() - 0.5) * 36, b.y - Math.random() * 30, Math.random() < 0.5 ? '#ff5a32' : P[3], { vx: 0, vy: -110, life: 0.45, size: 5 });
      }
    }
    if (b.orbit) this.updateOrbit(b, dt);
    if (b.buffT > 0) {
      // aura de un legendario (Geocontrol, Danza Lunar...): brillo que sube
      b.buffT -= dt;
      if (Math.random() < 0.35) {
        const P = PB.VFX.PAL[b.buffPal] || PB.VFX.PAL.fairy;
        this.px(b.x + (Math.random() - 0.5) * 40, b.y - Math.random() * 20, P[3 + Math.floor(Math.random() * 2)], { vx: 0, vy: -90, life: 0.5, size: 4 });
      }
    }
    if (b.rootT > 0) b.rootT -= dt;
    if (b.ultGlowT > 0) b.ultGlowT -= dt;
    if (b.action) {
      b.action.t += dt;
      if (b.action.t >= b.action.len) b.action = null;
    }

    if (b.ammo < R.maxAmmo) b.ammo = Math.min(R.maxAmmo, b.ammo + (dt / b.def.reload) * (b.rageT > 0 ? b.def.super.reloadMul || 1 : 1));
    if (this.time - b.lastCombat > R.regenDelay && b.hp < b.maxHp) {
      const before = b.hp;
      b.hp = Math.min(b.maxHp, b.hp + b.maxHp * R.regenRate * dt);
      if (Math.floor(before / 400) !== Math.floor(b.hp / 400)) {
        this.px(b.x + (Math.random() - 0.5) * 30, b.y - 20, '#7dff8f', { speed: 10, vy: -50, life: 0.6, size: 5 });
      }
    }

    // movimiento
    const ox = b.x, oy = b.y;
    if (b.leap) {
      this.updateLeap(b, dt);
    } else if (b.phase) {
      this.updatePhase(b, dt);
    } else if (b.dash) {
      const d = b.dash;
      d.t -= dt;
      this.world.moveCircle(b, d.vx * dt, d.vy * dt);
      d.ghostT = (d.ghostT || 0) - dt;
      if (d.ghostT <= 0) {
        d.ghostT = 0.035;
        this.fx.push({ kind: 'ghost', dex: PB.skinDex(b.dex, b.skin), shiny: b.shiny, x: b.x, y: b.y, facing: b.facing, t: 0, life: 0.25, type: b.def.atkType });
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
      if (b.stunT > 0 || b.rootT > 0) { mx = 0; my = 0; } // rootT: quieto mientras lanza un megarrayo o un infierno
      // parón del golpe: casi quieto durante unas centésimas
      if (b.hitStopT > 0) { mx *= 0.15; my *= 0.15; }
      const sp = this.speedOf(b);
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
    if (b.stunT <= 0 && !b.dash && !b.leap && !b.phase && b.spawnT <= 0) {
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
          // Caramelo Raro: +10 % de vida y daño. En Dúo cuenta para los dos de la pareja (si el otro está en pie)
          const who = this.mode.duo ? this.brawlers.filter((o) => o.team === b.team && (o === b || !o.dead)) : [b];
          for (const o of who) {
            o.power++;
            o.stat++;
            const extra = o.def.hp * 0.1;
            o.maxHp += extra;
            o.hp = Math.min(o.maxHp, o.hp + extra + 400);
            if (o !== b) this.text(o.x, o.y - 96, '+1', '#9ad4ff', 15);
          }
          this.gainXp(b, 8);
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
    const aT = atk.type || b.def.atkType; // tipo del ataque básico (puede no ser el primero del Pokémon)
    this.events.push({ type: 'shoot', b, atkType: aT });
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
    } else if (atk.kind === 'laser') {
      // láser: un aviso cortísimo y sale el rayo (como el súper Rayo, pero fino y casi instantáneo)
      this.fx.push({ kind: 'beamCharge', x: b.x, y: b.y - 18, ang, len: atk.range, t: 0, life: atk.delay, type: aT, by: b });
      this.timers.push({ t: atk.delay, fn: () => { if (!b.dead) this.beamHit(b, atk, aT, ang, mul); } });
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
    const np = this.projectiles.length, nz = this.zones.length; // para marcar lo que crea este súper
    this.ring(b.x, b.y - 10, 20, 90, pal[3], 0.35, 6);
    this.flash(b.x, b.y - 20, 90, pal[3], 0.25);
    if (s.legend) {
      this.legendFx(b, s);
      this.doLegend(b, s, ang, dist, sT);
    } else if (s.special) {
      this.doSpecial(b, s, ang, dist, sT);
    } else if (s.kind === 'spread') {
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
      // el centro: donde apuntas, o lo más lejos que se pueda llegar sin cruzar un muro
      let d = Math.min(dist, s.range);
      while (d > 20 && !this.world.walkable(b.x, b.y, b.x + Math.cos(ang) * d, b.y + Math.sin(ang) * d, 8)) d -= 20;
      const cx = b.x + Math.cos(ang) * d, cy = b.y + Math.sin(ang) * d;
      // cada trampa busca un hueco libre alrededor (girando y acercándose); antes, junto a una pared se
      // ponían todas en el mismo sitio y parecía que solo salía una
      const spot = (i) => {
        for (const k of [1, 0.7, 0.45]) for (const da of [0, 0.5, -0.5, 1, -1]) {
          const a = ang + (i / s.count) * Math.PI * 2 + da, r = s.spreadR * k;
          const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
          if (this.world.walkable(cx, cy, x, y, 8)) return { x, y };
        }
        return { x: cx, y: cy };
      };
      for (let i = 0; i < s.count; i++) {
        const p = s.count > 1 ? spot(i) : { x: cx, y: cy };
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
    } else if (s.kind === 'wave' || s.kind === 'ricochet' || s.kind === 'hook') {
      // ola (pasa por encima de los muros), disparo que rebota y látigo que atrae: un proyectil especial
      this.startAction(b, ang, s.kind === 'wave' ? 'Attack' : 'Shoot', 0.4);
      this.spawnShot(b, s, ang, true, 1);
      if (s.kind === 'wave') this.shake = Math.max(this.shake, 6);
    } else if (s.kind === 'tornado') {
      // torbellino que avanza: es una zona que se mueve y arrastra
      this.startAction(b, ang, 'Attack', 0.4);
      const x = b.x + Math.cos(ang) * 40, y = b.y + Math.sin(ang) * 40;
      this.zones.push({
        x, y, r: s.radius, t: s.duration, life: s.duration, team: b.team, atk: s, by: b, tickT: 0,
        vx: Math.cos(ang) * s.speed, vy: Math.sin(ang) * s.speed, spin: Math.random() * 6,
      });
      this.ring(x, y, 20, s.radius, pal[3], 0.4, 5);
    } else if (s.kind === 'orbit') {
      this.startAction(b, b.facing, 'Attack', 0.4);
      b.orbit = { t: s.duration, ang: b.facing, hitT: {} };
      this.ring(b.x, b.y - 16, 10, s.rad, pal[3], 0.4, 4);
    } else if (s.kind === 'leap') {
      // salta hacia el punto elegido (por encima de muros); cae en el último sitio libre del camino
      this.startAction(b, ang, 'Attack', s.flight);
      const d = Math.min(dist, s.range);
      let tx = b.x, ty = b.y;
      for (let k = 16; k <= d; k += 16) {
        const x = b.x + Math.cos(ang) * k, y = b.y + Math.sin(ang) * k;
        if (x < b.r || y < b.r || x > this.world.pixelW - b.r || y > this.world.pixelH - b.r) break;
        if (!this.world.circleSolid(x, y, b.r)) { tx = x; ty = y; }
      }
      b.leap = { t: 0, T: s.flight, sx: b.x, sy: b.y, tx, ty, z: 0, burrow: !!s.burrow, type: sT };
      for (let i = 0; i < 12; i++) this.px(b.x, b.y, s.burrow ? PB.VFX.PAL.ground[1 + (i % 3)] : 'rgba(235,240,210,0.8)', { speed: 160, life: 0.4, size: s.burrow ? 6 : 8, grow: s.burrow ? 0 : 1 });
    } else if (s.kind === 'reflect') {
      this.startAction(b, b.facing, 'Attack', 0.35);
      b.reflectT = s.time;
      b.reflectType = sT;
      this.ring(b.x, b.y - 20, 10, s.radius + 10, '#ffffff', 0.35, 4);
    } else if (s.kind === 'rage') {
      this.startAction(b, b.facing, 'Attack', 0.45);
      b.rageT = s.time;
      b.ammo = Math.max(b.ammo, 1);
      this.ring(b.x, b.y - 20, 10, 80, pal[2], 0.45, 6);
      for (let i = 0; i < 16; i++) this.px(b.x, b.y - 20, i % 2 ? pal[3] : pal[4], { speed: 200, vy: -80, life: 0.5, size: 5 });
      this.text(b.x, b.y - 110, PB.T('¡Más fuerte!'), pal[3], 16);
    } else if (s.kind === 'stealth') {
      this.startAction(b, b.facing, 'Attack', 0.4);
      b.stealthT = s.time;
      b.revealT = 0;
      b.powerNext = true;
      for (let i = 0; i < 18; i++) this.px(b.x + (Math.random() - 0.5) * 50, b.y - 20 + (Math.random() - 0.5) * 40, i % 2 ? '#5c48aa' : '#9e8aea', { speed: 40, vy: -40, life: 0.8, size: 7, grow: 1.5 });
    }
    this.superTierFx(b, s, sT, np, nz);
  }

  // Lo vistoso que es el súper según la fase: 0 = primera fase, 1 = segunda, 2 = la última
  // (y los que no evolucionan). Las líneas de dos fases saltan de 0 a 2.
  superTier(b) {
    const L = b.line.length;
    if (L <= 1) return 2;
    if (L === 2) return b.stage >= 1 ? 2 : 0;
    return Math.min(2, b.stage);
  }

  // Efectos extra del súper según la fase (no cambian el daño: eso ya lo sube la evolución)
  superTierFx(b, s, sT, np, nz) {
    const tier = this.superTier(b), pal = s.pal || sT;
    for (let i = np; i < this.projectiles.length; i++) this.projectiles[i].tier = tier;
    for (let i = nz; i < this.zones.length; i++) this.zones[i].tier = tier;
    if (tier === 0) return;
    this.fx.push({ kind: 'tierBurst', x: b.x, y: b.y, pal, tier, t: 0, life: tier === 2 ? 1.1 : 0.7, seed: Math.random() * 100 });
    b.ultGlowT = tier === 2 ? 1.4 : 0.7;
    b.ultGlowPal = pal;
    this.shake = Math.max(this.shake, tier === 2 ? 9 : 5);
    if (s.special && tier === 2) this.legendFx(b, s, 'SÚPER ESPECIAL');
  }

  spawnSpread(b, atk, ang, isSuper, mul) {
    const n = atk.count || 1;
    const id = this.nextShotId++;
    for (let i = 0; i < n; i++) {
      let a = n === 1 ? ang : ang - atk.spread / 2 + (atk.spread * i) / (n - 1);
      if (atk.jitter) a += (Math.random() - 0.5) * 2 * atk.jitter; // rociada: un poco desordenada
      this.spawnShot(b, atk, a, isSuper, mul, id);
      if (atk.speedVar) {
        const p = this.projectiles[this.projectiles.length - 1], k = 1 + (Math.random() - 0.5) * 2 * atk.speedVar;
        p.vx *= k;
        p.vy *= k;
      }
    }
  }

  // Disparo que se parte en tres (Bomba Germen, Pirotecnia...): los trozos salen desde donde estaba
  // y no vuelven a golpear a quien ya golpeó el disparo grande
  splitShot(p, back) {
    const sp = p.split;
    if (!sp || !p.owner) return;
    p.split = null;
    const x = p.x - (back ? p.vx * 0.03 : 0), y = p.y - (back ? p.vy * 0.03 : 0);
    const ang = Math.atan2(p.vy, p.vx) + (back ? Math.PI : 0);
    for (let i = 0; i < sp.count; i++) {
      const a = ang - sp.spread / 2 + (sp.spread * i) / (sp.count - 1);
      this.projectiles.push({
        x, y, vx: Math.cos(a) * sp.speed, vy: Math.sin(a) * sp.speed, ang: a,
        r: sp.r, dmg: sp.dmg * (p.powered ? 1.5 : 1), team: p.team, owner: p.owner, range: sp.range, traveled: 0,
        pierce: false, hit: new Set(p.hit), look: Object.assign({}, p.look, { scale: (p.look.scale || 1) * 0.6 }), atkType: p.atkType, charge: p.charge,
        destroysWalls: false, knockback: 0, stun: 0, isSuper: false, shotId: p.shotId, powered: false, t: 0, trailT: 0, homing: sp.homing || 0, tier: p.tier,
      });
    }
    const pal = PB.VFX.PAL[p.atkType] || PB.VFX.PAL.normal;
    this.ring(x, y, 4, 34, pal[3], 0.2, 3);
    for (let i = 0; i < 6; i++) this.px(x, y, pal[2 + (i % 3)], { speed: 160, life: 0.25, size: 4 });
  }

  spawnShot(b, atk, ang, isSuper, mul, shotId, side) {
    // side: desplazamiento lateral (para los disparos dobles en paralelo)
    const ox = b.x + Math.cos(ang) * 18 - Math.sin(ang) * (side || 0), oy = b.y + Math.sin(ang) * 18 - 4 + Math.cos(ang) * (side || 0);
    this.projectiles.push({
      x: ox, y: oy, vx: Math.cos(ang) * atk.speed, vy: Math.sin(ang) * atk.speed, ang,
      r: atk.r || 12, dmg: atk.dmg * (mul || 1), team: b.team, owner: b, range: atk.range, traveled: 0,
      pierce: !!atk.pierce, hit: new Set(), look: atk.look || {}, atkType: atk.type || b.def.atkType, charge: !isSuper,
      destroysWalls: !!atk.destroysWalls, knockback: atk.knockback || 0, stun: atk.stun || 0, isSuper, shotId: shotId || this.nextShotId++,
      powered: (mul || 1) > 1, t: 0, trailT: 0, homing: atk.homing || 0, boomerang: !!atk.boomerang, transform: !!atk.transform,
      wave: atk.kind === 'wave' ? atk.width : atk.ripple || 0, waveStops: !!atk.ripple, bounces: atk.bounces || 0, hook: atk.kind === 'hook',
      split: atk.split || null, sine: atk.sine || 0, sineF: atk.sineF || 0, baseAng: ang,
    });
  }

  // ---------------------------------------------------------------- Transformación (Ditto)
  transform(b, e) {
    if (b.dead || e.dead) return;
    if (!b.tfBase) b.tfBase = { def: b.def, dex: b.dex, types: b.types };
    b.tf = { id: e.def.id, line: e.line, stage: e.stage || 0, kit: e.kit };
    b.def = PB.tfDef(b.tfBase.def, b.tf);
    b.dex = e.dex;
    b.types = e.types;
    b.tfT = PB.TF_TIME;
    b.ammo = Math.min(b.ammo, this.rules.maxAmmo);
    b.evoFrom = b.tfBase.dex; // se ve como una evolución rápida: de Ditto a la nueva forma
    b.evoT = PB.EVO_ANIM;
    this.ring(b.x, b.y - 20, 10, 100, '#e0a0ff', 0.45, 6);
    for (let i = 0; i < 16; i++) this.px(b.x, b.y - 24, i % 2 ? '#d48cff' : '#ffffff', { speed: 200, vy: -40, life: 0.5, size: 4 });
    this.text(b.x, b.y - 110, PB.T('¡Transformación!'), '#e0a0ff', 18);
    this.events.push({ type: 'transform', b, target: e });
  }

  untransform(b) {
    if (!b.tfBase) return;
    b.def = b.tfBase.def;
    b.dex = b.tfBase.dex;
    b.types = b.tfBase.types;
    b.tf = null;
    b.tfBase = null;
    b.tfT = 0;
    if (!b.dead) {
      this.ring(b.x, b.y - 20, 10, 70, '#e0a0ff', 0.35, 4);
      for (let i = 0; i < 10; i++) this.px(b.x, b.y - 24, '#d48cff', { speed: 140, vy: -30, life: 0.4, size: 4 });
    }
  }

  // ¿Toca el proyectil un círculo (x, y, r)? La ola es un rectángulo ancho atravesado a su avance.
  shotTouches(p, x, y, r) {
    if (!p.wave) {
      const s = this._seg;
      if (!s) return Math.hypot(x - p.x, y - p.y) < p.r + r;
      // distancia al tramo recorrido en este paso
      const ax = s[0], ay = s[1], dx = p.x - ax, dy = p.y - ay, l2 = dx * dx + dy * dy;
      const k = l2 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l2)) : 1;
      return Math.hypot(x - ax - dx * k, y - ay - dy * k) < p.r + r;
    }
    const c = Math.cos(p.ang), s = Math.sin(p.ang), dx = x - p.x, dy = y - p.y;
    return Math.abs(dx * c + dy * s) < p.r + r && Math.abs(-dx * s + dy * c) < p.wave / 2 + r;
  }

  // Salto (Vuelo, Golpe Cuerpo, Excavar...): no se le puede tocar hasta que cae
  updateLeap(b, dt) {
    const l = b.leap, s = b.def.super;
    l.t += dt;
    const k = Math.min(1, l.t / l.T);
    if (l.comet) {
      // cometa (Ascenso Draco, Meteoro Astral...): sube hasta salir de la pantalla y cae en picado
      const up = 0.42;
      if (k < up) {
        const u = k / up;
        b.x = l.sx;
        b.y = l.sy;
        l.z = (1 - (1 - u) * (1 - u)) * 900;
      } else {
        const u = (k - up) / (1 - up);
        b.x = l.sx + (l.tx - l.sx) * u;
        b.y = l.sy + (l.ty - l.sy) * u;
        l.z = 900 * (1 - u * u);
      }
      l.trail.push({ x: Math.round(b.x), y: Math.round(b.y), z: Math.round(l.z) });
      if (l.trail.length > 14) l.trail.shift();
      if (k >= up && Math.random() < 0.8) {
        const P = PB.VFX.PAL[l.pal] || PB.VFX.PAL.dragon;
        this.px(b.x + (Math.random() - 0.5) * 30, b.y - l.z + (Math.random() - 0.5) * 30, P[2 + Math.floor(Math.random() * 3)], { speed: 60, vy: -120, life: 0.4, size: 6 });
      }
    } else {
      b.x = l.sx + (l.tx - l.sx) * k;
      b.y = l.sy + (l.ty - l.sy) * k;
      l.z = l.burrow ? 0 : Math.sin(k * Math.PI) * (70 + Math.hypot(l.tx - l.sx, l.ty - l.sy) * 0.25);
    }
    b.moving = false;
    if (l.burrow && Math.random() < 0.6) this.px(b.x, b.y, PB.VFX.PAL.ground[1 + Math.floor(Math.random() * 3)], { speed: 60, vz: 180, z: 2, life: 0.4, size: 5 });
    if (k < 1) return;
    b.leap = null;
    this.explode(b, b.x, b.y, s.radius, s.dmg, l.type, { knockback: s.knockback, stun: s.stun, big: true });
    this.fx.push({ kind: 'crack', x: b.x, y: b.y, r: s.radius * 0.8, t: 0, life: 0.9, seed: Math.random() * 100 });
    b.action = { anim: 'Attack', t: 0, len: 0.3 };
    if (l.comet) {
      // cráter: anillos de choque, suelo ardiendo y la cámara tiembla mucho
      this.fx.push({ kind: 'crater', x: b.x, y: b.y, r: s.radius, pal: l.pal, t: 0, life: 2.5, seed: Math.random() * 100 });
      for (let i = 0; i < 3; i++) this.fx.push({ kind: 'shockring', x: b.x, y: b.y, r: s.radius * (1.2 + i * 0.35), pal: l.pal, t: -i * 0.08, life: 0.55 });
      this.zones.push({ x: b.x, y: b.y, r: s.radius * 0.6, t: 2.5, life: 2.5, team: b.team, atk: { kind: 'zone', dps: s.dmg * 0.18, heal: 0, type: l.type, puddle: true }, by: b, tickT: 0.3 });
      this.shake = Math.max(this.shake, 26);
    }
  }

  // ---------------------------------------------------------------- súper de legendarios
  // Cada legendario tiene su movimiento característico (LEGEND en roster.js) con una de estas formas.
  // La mecánica corre en el anfitrión; lo que se ve son efectos (fx) que también viajan por la red.
  legendFx(b, s, label) {
    const pal = s.pal || s.type || b.def.atkType;
    // (sin rótulo ni nombre del súper en pantalla: tapaban a los rivales)
    this.fx.push({ kind: 'ultIntro', x: b.x, y: b.y, pal, t: 0, life: 0.9 });
    this.shake = Math.max(this.shake, 10);
    this.events.push({ type: 'legend', b });
  }

  // Daña una vez a cada rival dentro del círculo (hit: Set para no repetir dentro del mismo súper). Devuelve a cuántos.
  hitCircle(b, x, y, r, dmg, type, o, hit) {
    let n = 0;
    for (const e of this.brawlers) {
      if (e.dead || e.team === b.team || (hit && hit.has(e.idx))) continue;
      if (Math.hypot(e.x - x, e.y - y) < r + e.r) {
        if (hit) hit.add(e.idx);
        this.damage(e, dmg, b, type, Object.assign({ kx: e.x - x, ky: e.y - y, big: true }, o));
        n++;
      }
    }
    for (const st of this.structures) if (st.hp > 0 && st.team !== b.team && Math.hypot(st.x - x, st.y - y) < r + st.r) this.damageStructure(st, dmg, b, false, st.x, st.y - 30);
    return n;
  }

  // Igual, pero en una franja de (x1, y1) a (x2, y2) de ancho w
  hitLine(b, x1, y1, x2, y2, w, dmg, type, o, hit) {
    const L2 = (x2 - x1) ** 2 + (y2 - y1) ** 2 || 1;
    const near = (x, y, r) => {
      const t = Math.max(0, Math.min(1, ((x - x1) * (x2 - x1) + (y - y1) * (y2 - y1)) / L2));
      return Math.hypot(x - (x1 + (x2 - x1) * t), y - (y1 + (y2 - y1) * t)) < w / 2 + r;
    };
    let n = 0;
    for (const e of this.brawlers) {
      if (e.dead || e.team === b.team || (hit && hit.has(e.idx)) || !near(e.x, e.y - 10, e.r)) continue;
      if (hit) hit.add(e.idx);
      this.damage(e, dmg, b, type, Object.assign({ kx: x2 - x1, ky: y2 - y1, big: true }, o));
      n++;
    }
    for (const st of this.structures) if (st.hp > 0 && st.team !== b.team && near(st.x, st.y, st.r)) this.damageStructure(st, dmg, b, false, st.x, st.y - 30);
    return n;
  }

  // ¿Está (x, y) dentro del abanico de b (ángulo ang, apertura arc, largo len)?
  inCone(b, x, y, ang, arc, len, r) {
    const d = Math.hypot(x - b.x, y - b.y);
    if (d > len + r) return false;
    const off = Math.abs(((Math.atan2(y - b.y, x - b.x) - ang + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
    return off < arc / 2 || d < r + 20;
  }

  // Punto libre más lejano en línea recta hasta dist (para caer o aparecer sin quedarse dentro de un muro)
  landingSpot(b, ang, dist) {
    let tx = b.x, ty = b.y;
    for (let k = 16; k <= dist; k += 16) {
      const x = b.x + Math.cos(ang) * k, y = b.y + Math.sin(ang) * k;
      if (x < b.r || y < b.r || x > this.world.pixelW - b.r || y > this.world.pixelH - b.r) break;
      if (!this.world.circleSolid(x, y, b.r)) { tx = x; ty = y; }
    }
    return { x: tx, y: ty };
  }

  doLegend(b, s, ang, dist, sT) {
    const pal = s.pal || sT, c = Math.cos(ang), n = Math.sin(ang);
    const later = (t, fn) => this.timers.push({ t, fn });
    this.startAction(b, ang, 'Attack', 0.5);
    switch (s.kind) {
      case 'comet': {
        // Ascenso Draco: sube al cielo y cae como un cometa donde apuntas
        const p = this.landingSpot(b, ang, Math.min(dist, s.range));
        b.leap = { t: 0, T: s.flight, sx: b.x, sy: b.y, tx: p.x, ty: p.y, z: 0, comet: true, type: sT, pal, trail: [] };
        this.fx.push({ kind: 'warn', x: p.x, y: p.y, r: s.radius, pal, t: 0, life: s.flight });
        break;
      }
      case 'fissure': {
        // Filo del Abismo: una fila de pinchos que salen del suelo, uno detrás de otro
        const hit = new Set();
        for (let i = 0; i < s.count; i++) {
          const k = 50 + i * s.step, x = b.x + c * k, y = b.y + n * k;
          if (x < 0 || y < 0 || x > this.world.pixelW || y > this.world.pixelH) break;
          later(i * 0.06, () => {
            this.hitCircle(b, x, y, s.radius, s.dmg, sT, { stun: s.stun, knockback: 220 }, hit);
            if (s.destroysWalls) this.breakWalls(x, y, 36);
            this.fx.push({ kind: 'spikes', x, y, r: s.radius, pal, shape: s.shape, t: 0, life: 1.2, seed: Math.random() * 100 });
            this.shake = Math.max(this.shake, 9);
          });
        }
        break;
      }
      case 'megabeam': {
        // Cañón Dinamax, Aerochorro...: se carga y suelta un rayo enorme que dura un rato
        b.rootT = s.charge + s.dur;
        this.startAction(b, ang, 'Attack', s.charge + s.dur);
        this.fx.push({ kind: 'megaCharge', by: b, ang, pal, t: 0, life: s.charge });
        const ticks = Math.round(s.dur / 0.1);
        later(s.charge, () => {
          if (b.dead) return;
          for (const o of s.twin ? [-s.twin, s.twin] : [0]) this.fx.push({ kind: 'megabeam', by: b, ang, len: s.range, w: s.width, pal, prism: !!s.prism, off: o, t: 0, life: s.dur });
          this.shake = Math.max(this.shake, 16);
        });
        // twin: dos rayos en paralelo separados 2·twin (Hidrobomba de Blastoise)
        const offs = s.twin ? [-s.twin, s.twin] : [0];
        for (let i = 0; i < ticks; i++) later(s.charge + i * 0.1, () => {
          if (b.dead) return;
          for (const o of offs) {
            const x1 = b.x - n * o, y1 = b.y - 18 + c * o;
            const hits = this.hitLine(b, x1, y1, x1 + c * s.range, y1 + n * s.range, s.width, s.dmg / ticks / offs.length, sT, { knockback: s.push || 50, stun: s.stun || 0, quiet: i % 3 !== 0 });
            if (s.drain && hits) b.hp = Math.min(b.maxHp, b.hp + (s.dmg / ticks) * hits * s.drain); // Ala Mortífera: se cura
          }
        });
        break;
      }
      case 'judgment': {
        // Sentencia: lluvia de golpes de luz sobre una zona grande, con aviso en el suelo
        const d = Math.min(dist, s.range), cx = b.x + c * d, cy = b.y + n * d;
        for (let i = 0; i < s.count; i++) {
          const a = Math.random() * Math.PI * 2, r = i ? s.spreadR * Math.sqrt(Math.random()) : 0;
          const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r, at = s.delay + i * s.every;
          this.fx.push({ kind: 'warn', x, y, r: s.radius, pal, t: 0, life: at });
          later(at, () => {
            this.hitCircle(b, x, y, s.radius, s.dmg, sT, { stun: s.stun || 0, knockback: 160 });
            this.fx.push({ kind: 'pillar', x, y, r: s.radius, pal, shape: s.shape, t: 0, life: 0.7, seed: Math.random() * 100 });
            this.shake = Math.max(this.shake, 6);
          });
        }
        break;
      }
      case 'rend': {
        // Corte Vacío, Espada Santa...: tajos gigantes que rasgan el espacio delante
        const cx = b.x + c * s.range, cy = b.y + n * s.range, L = s.len / 2, cuts = [];
        if (s.pattern === 'v') {
          // V de Fuego: dos tajos que se juntan al fondo
          const tx = b.x + c * (s.range + L), ty = b.y + n * (s.range + L);
          for (const side of [-1, 1]) cuts.push([b.x + c * 40 - n * L * side, b.y + n * 40 + c * L * side, tx, ty]);
        } else {
          for (let i = 0; i < s.count; i++) {
            const a = ang + Math.PI / 2 + (s.count > 1 ? (i / (s.count - 1) - 0.5) * 1.6 : 0) * (i % 2 ? 1 : -1);
            const ox = c * (i - (s.count - 1) / 2) * 30, oy = n * (i - (s.count - 1) / 2) * 30;
            cuts.push([cx + ox - Math.cos(a) * L, cy + oy - Math.sin(a) * L, cx + ox + Math.cos(a) * L, cy + oy + Math.sin(a) * L]);
          }
        }
        cuts.forEach(([x1, y1, x2, y2], i) => later(0.12 + i * s.every, () => {
          this.hitLine(b, x1, y1, x2, y2, s.width, s.dmg, sT, { knockback: 260, stun: s.stun || 0 });
          this.fx.push({ kind: 'tear', x: (x1 + x2) / 2, y: (y1 + y2) / 2, x1, y1, x2, y2, w: s.width, pal, t: 0, life: 1, seed: Math.random() * 100 });
          this.shake = Math.max(this.shake, 10);
        }));
        break;
      }
      case 'pulse': {
        // Pulso Primigenio, Onda Mental...: varias ondas enormes que salen del Pokémon
        for (let i = 0; i < s.count; i++) later(i * s.every, () => {
          if (b.dead) return;
          const x = b.x, y = b.y, last = i === s.count - 1;
          this.fx.push({ kind: 'shockring', x, y, r: s.radius, pal, shape: s.shape, t: 0, life: s.radius / s.speed + 0.15, big: true });
          for (const e of this.brawlers) {
            const d = Math.hypot(e.x - x, e.y - y);
            if (e.dead || e.team === b.team || d > s.radius + e.r) continue;
            later(d / s.speed, () => this.damage(e, s.dmg, b, sT, { knockback: s.knockback, kx: e.x - x, ky: e.y - y, stun: last ? s.stun || 0 : 0, big: true }));
          }
          this.shake = Math.max(this.shake, 8);
        });
        break;
      }
      case 'inferno': {
        // Fuego Sagrado, Llama Azul...: un mar de llamas en abanico y el suelo se queda ardiendo
        b.rootT = s.dur;
        this.startAction(b, ang, 'Attack', s.dur);
        this.fx.push({ kind: 'inferno', by: b, ang, len: s.range, arc: s.arc, pal, t: 0, life: s.dur + 0.3, dur: s.dur, sweep: s.sweep || 0 });
        const ticks = Math.round(s.dur / 0.1);
        for (let i = 0; i < ticks; i++) later(i * 0.1, () => {
          if (b.dead) return;
          // (con sweep el abanico barre de lado a lado, como lo dibuja render.js)
          const a2 = s.sweep ? ang + (Math.sin(Math.min(1, (i * 0.1) / s.dur) * Math.PI * 2) * s.sweep) / 2 : ang;
          for (const e of this.brawlers) {
            if (e.dead || e.team === b.team || !this.inCone(b, e.x, e.y, a2, s.arc, s.range, e.r)) continue;
            this.damage(e, s.dmg / ticks, b, sT, { quiet: i % 3 !== 0, knockback: 40, kx: c, ky: n });
          }
        });
        later(s.dur, () => {
          for (let i = 0; i < 3; i++) {
            const a = ang + (i - 1) * s.arc * 0.3, d = s.range * (0.45 + 0.2 * i);
            this.zones.push({ x: b.x + Math.cos(a) * d, y: b.y + Math.sin(a) * d, r: 62, t: 2.5, life: 2.5, team: b.team, atk: { kind: 'zone', dps: s.dmg * 0.12, heal: 0, type: sT, puddle: true }, by: b, tickT: 0.25 });
          }
        });
        break;
      }
      case 'storm': {
        // Trueno, Voltio Cruel...: nubarrón encima y rayos que caen sobre los rivales cercanos
        // Puños Plasma (fists): en vez del nubarrón, puños que flotan encima y caen con cada rayo
        this.fx.push({ kind: s.fists ? 'fistcloud' : 'stormcloud', by: b, r: s.radius, pal, t: 0, life: s.dur + 0.5 });
        const drop = s.fists ? 0.14 : 0; // lo que tarda el puño en caer antes del rayo
        for (let i = 0; i < s.count; i++) later(0.2 + (i * s.dur) / s.count, () => {
          if (b.dead) return;
          const foes = this.brawlers.filter((e) => !e.dead && e.team !== b.team && Math.hypot(e.x - b.x, e.y - b.y) < s.radius);
          let x, y;
          if (foes.length && Math.random() < 0.8) {
            const e = foes[Math.floor(Math.random() * foes.length)];
            x = e.x + (Math.random() - 0.5) * 30;
            y = e.y + (Math.random() - 0.5) * 30;
          } else {
            const a = Math.random() * Math.PI * 2, r = Math.random() * s.radius;
            x = b.x + Math.cos(a) * r;
            y = b.y + Math.sin(a) * r;
          }
          if (drop) this.fx.push({ kind: 'fistfall', x, y, pal, drop, t: 0, life: drop + 0.4, seed: Math.random() * 100 });
          later(drop, () => {
            this.hitCircle(b, x, y, s.hitR, s.dmg, sT, { stun: s.stun || 0 });
            this.fx.push({ kind: 'skybolt', x, y, pal, t: 0, life: 0.4, seed: Math.random() * 100 });
            this.shake = Math.max(this.shake, 7);
          });
        });
        break;
      }
      case 'void': {
        // Brecha Negra, Lluvia Ígnea...: un agujero que se traga a los rivales y luego estalla
        const d = Math.min(dist, s.range), x = b.x + c * d, y = b.y + n * d;
        this.zones.push({ x, y, r: s.radius, t: s.dur, life: s.dur, team: b.team, atk: { kind: 'void', type: sT, dps: s.dps, heal: 0, pull: s.pull, pal }, by: b, tickT: 0 });
        later(s.dur, () => {
          this.hitCircle(b, x, y, s.burstR, s.burst, sT, { stun: s.stun || 0, knockback: 420 });
          for (let i = 0; i < 2; i++) this.fx.push({ kind: 'shockring', x, y, r: s.burstR * (1.2 + i * 0.4), pal, t: -i * 0.1, life: 0.5, big: true });
          this.flash(x, y, s.burstR * 1.4, (PB.VFX.PAL[pal] || PB.VFX.PAL.dark)[4], 0.3);
          this.shake = Math.max(this.shake, 14);
        });
        break;
      }
      case 'frost': {
        // Glaciación, Liofilización...: el suelo se congela hacia fuera y deja a los rivales dentro de un bloque de hielo
        const x = b.x, y = b.y;
        this.fx.push({ kind: 'frostField', x, y, r: s.radius, pal, t: 0, life: s.dur + 1.8, seed: Math.random() * 100, grow: s.dur });
        for (const e of this.brawlers) {
          const d = Math.hypot(e.x - x, e.y - y);
          if (e.dead || e.team === b.team || d > s.radius + e.r) continue;
          later((d / s.radius) * s.dur, () => {
            if (e.dead) return;
            this.damage(e, s.dmg, b, sT, { stun: s.stun, big: true });
            this.fx.push({ kind: 'iceblock', target: e, pal, t: 0, life: s.stun });
          });
        }
        this.shake = Math.max(this.shake, 10);
        break;
      }
      case 'aura': {
        // Geocontrol, Danza Lunar...: columna de luz que cura y potencia a todo tu equipo cercano
        this.fx.push({ kind: 'auraPillar', x: b.x, y: b.y, r: s.radius, pal, t: 0, life: 1.4 });
        for (const a of this.brawlers) {
          if (a.dead || a.team !== b.team || Math.hypot(a.x - b.x, a.y - b.y) > s.radius) continue;
          const heal = a.maxHp * s.heal;
          a.hp = Math.min(a.maxHp, a.hp + heal);
          a.stunT = 0;
          Object.assign(a, { buffT: s.time, buffDmg: s.dmgMul || 1, buffSpeed: s.speedMul || 1, buffPal: pal });
          if (s.reduce) Object.assign(a, { barrierT: s.time, barrierReduce: s.reduce, barrierType: sT });
          if (heal > 0) this.text(a.x, a.y - 96, '+' + Math.round(heal), '#7dff8f', 18);
          this.ring(a.x, a.y - 20, 10, 60, (PB.VFX.PAL[pal] || PB.VFX.PAL.fairy)[3], 0.4, 5);
        }
        break;
      }
      case 'phantom': {
        // Golpe Umbrío, Robasombra...: desaparece y aparece detrás del rival para golpearle
        const d = Math.min(dist, s.range), ax = b.x + c * d, ay = b.y + n * d;
        let best = null, bd = 220;
        for (const e of this.brawlers) {
          if (e.dead || e.team === b.team) continue;
          const de = Math.hypot(e.x - ax, e.y - ay);
          if (de < bd) { bd = de; best = e; }
        }
        let tx = ax, ty = ay;
        if (best) {
          const a2 = Math.atan2(best.y - b.y, best.x - b.x);
          tx = best.x + Math.cos(a2) * 48;
          ty = best.y + Math.sin(a2) * 48;
        }
        // que no aparezca dentro de un muro
        if (this.world.circleSolid(tx, ty, b.r)) {
          const p = this.landingSpot(b, Math.atan2(ty - b.y, tx - b.x), Math.hypot(tx - b.x, ty - b.y));
          tx = p.x;
          ty = p.y;
        }
        b.phase = { t: 0, T: s.hide, tx, ty, type: sT, pal, target: best };
        this.fx.push({ kind: 'portal', x: b.x, y: b.y, pal, t: 0, life: 0.7 });
        this.fx.push({ kind: 'portal', x: tx, y: ty, pal, t: 0, life: s.hide + 0.5, grow: true });
        break;
      }
      case 'bigorb': {
        // Psicoataque, Bola Neblina...: una esfera enorme y lenta que lo atraviesa todo y estalla al final
        this.spawnShot(b, Object.assign({}, s, { look: { shape: s.shape || 'ball', scale: 3.4, trail: 'wisp' } }), ang, true, 1);
        const p = this.projectiles[this.projectiles.length - 1];
        p.pierce = true;
        p.bigorb = { boom: s.boom, boomR: s.boomR, pal };
        break;
      }
    }
  }

  // ---------------------------------------------------------------- súper especiales
  // Pikachu, Charizard, Eevee, Gengar... (SPECIAL en roster.js). Algunos usan una forma de legendario (engine).
  doSpecial(b, s, ang, dist, sT) {
    if (s.tiers) s = Object.assign({}, s, s.tiers[this.superTier(b)]); // cambios según la fase (Látigo Cepa, Shuriken de Agua)
    const pal = s.pal || sT, c = Math.cos(ang), n = Math.sin(ang);
    const later = (t, fn) => this.timers.push({ t, fn });
    const at = (d) => {
      const dd = Math.min(dist, d);
      return { x: b.x + c * dd, y: b.y + n * dd };
    };
    const shot = (a, o) => {
      this.spawnShot(b, Object.assign({ type: sT }, o), a, true, 1);
      return this.projectiles[this.projectiles.length - 1];
    };
    this.startAction(b, ang, 'Attack', 0.45);
    if (s.engine) {
      this.doLegend(b, Object.assign({}, s, { kind: s.engine }), ang, dist, sT);
      if (s.recharge) later(s.charge + s.dur, () => { if (!b.dead) { b.rootT = s.recharge; this.text(b.x, b.y - 100, PB.T('Recargando…'), '#ffd23a', 14); } });
      if (s.frost) later(s.charge + s.dur * 0.5, () => {
        // Rayo Hielo: el suelo se queda helado a lo largo del rayo
        for (let i = 1; i <= 3; i++) this.fx.push({ kind: 'frostField', x: b.x + c * s.range * (i / 3.5), y: b.y + n * s.range * (i / 3.5), r: 70, pal, t: 0, life: 2, seed: Math.random() * 100, grow: 0.2 });
      });
      return;
    }
    switch (s.kind) {
      case 'thunderchain': {
        // Impactrueno: rayo en cadena entre todos los cercanos y otro que cae del cielo sobre cada uno
        this.chainHit(b, s, sT, ang);
        const f = this.fx.filter((x) => x.kind === 'chain').pop();
        if (f) for (const p of f.pts.slice(1)) this.fx.push({ kind: 'skybolt', x: p.x, y: p.y + 20, pal: 'electric', t: 0, life: 0.4, seed: Math.random() * 100 });
        this.shake = Math.max(this.shake, 8);
        break;
      }
      case 'emberfan':
        // Ascuas: abanico de ascuas que hacen eses
        for (let i = 0; i < s.count; i++) shot(ang - s.spread / 2 + (s.spread * i) / (s.count - 1), { speed: s.speed, range: s.range, dmg: s.dmg, r: s.r, sine: s.sine, sineF: s.sineF * (i % 2 ? 1 : -1), look: { shape: 'fire', trail: 'ember', scale: 1.3 } });
        break;
      case 'swift':
        // Rapidez: estrellas que salen abiertas y luego persiguen
        for (let i = 0; i < s.count; i++) shot(ang - s.spread / 2 + (s.spread * i) / (s.count - 1), { speed: s.speed, range: s.range, dmg: s.dmg, r: s.r, homing: s.homing, look: { shape: 'star', trail: 'spark', scale: 1.8, pal } });
        break;
      case 'darkpulse':
        // Pulso Umbrío: medias lunas en todas direcciones y anillos oscuros
        for (let i = 0; i < s.count; i++) shot(ang + (i / s.count) * Math.PI * 2, { speed: s.speed, range: s.range, dmg: s.dmg, r: s.r, pierce: true, look: { shape: 'crescent', trail: 'wisp', scale: 2.2, pal } });
        for (let i = 0; i < 2; i++) this.fx.push({ kind: 'shockring', x: b.x, y: b.y, r: s.range * (0.7 + i * 0.3), pal, t: -i * 0.1, life: 0.6, big: true });
        break;
      case 'moonblast': {
        // Fuerza Lunar: una luna gigante cae del cielo
        const p = at(s.range);
        this.fx.push({ kind: 'warn', x: p.x, y: p.y, r: s.radius, pal, t: 0, life: s.fall });
        this.fx.push({ kind: 'moon', x: p.x, y: p.y, r: s.radius, pal, fall: s.fall, t: 0, life: s.fall + 0.5 });
        later(s.fall, () => {
          this.hitCircle(b, p.x, p.y, s.radius, s.dmg, sT, { knockback: 420 });
          for (let i = 0; i < 2; i++) this.fx.push({ kind: 'shockring', x: p.x, y: p.y, r: s.radius * (1.1 + i * 0.4), pal, t: -i * 0.08, life: 0.5, big: true, shape: 'star' });
          this.flash(p.x, p.y, s.radius * 1.3, '#ffd8f0', 0.3);
          this.shake = Math.max(this.shake, 14);
        });
        break;
      }
      case 'shadowball': {
        // Bola Sombra: bola enorme que al estallar suelta seis pequeñas que persiguen
        const p = shot(ang, { speed: s.speed, range: s.range, dmg: s.dmg, r: s.r, pierce: true, split: s.split, look: { shape: 'shadow', trail: 'wisp', scale: 3.2 } });
        p.bigorb = { boom: s.boom, boomR: s.boomR, pal };
        break;
      }
      case 'aurabarrage':
        // Esfera Aural: tres esferas seguidas que nunca fallan
        for (let i = 0; i < s.count; i++) later(i * s.every, () => {
          if (b.dead) return;
          shot(ang + (i - 1) * 0.15, { speed: s.speed, range: s.range, dmg: s.dmg, r: s.r, homing: s.homing, look: { shape: 'ball', trail: 'spark', scale: 2.4, pal } });
          this.muzzle(b, ang);
        });
        break;
      case 'watergun':
        // Pistola Agua: chorros seguidos que se mueven un poco
        b.rootT = s.count * s.every;
        for (let i = 0; i < s.count; i++) later(i * s.every, () => {
          if (b.dead) return;
          shot(ang + Math.sin(i * 0.9) * 0.08, { speed: s.speed, range: s.range, dmg: s.dmg, r: s.r, knockback: s.knockback, look: { shape: 'drop', trail: 'drip', scale: 1.4 } });
        });
        break;
      case 'splash': {
        // Salpicadura: un saltito en el sitio, una salpicadura... y poco más
        b.leap = { t: 0, T: s.flight, sx: b.x, sy: b.y, tx: b.x, ty: b.y, z: 0, type: sT };
        later(s.flight, () => {
          for (let i = 0; i < 2; i++) this.fx.push({ kind: 'shockring', x: b.x, y: b.y, r: 90 + i * 30, pal: 'water', t: -i * 0.08, life: 0.45, shape: 'drop' });
          this.text(b.x, b.y - 110, PB.T('¡Pero no pasa nada!'), '#8ccaff', 15);
        });
        break;
      }
      case 'shuriken':
        // Shuriken de Agua: cinco shurikens seguidos que rebotan
        for (let i = 0; i < s.count; i++) later(i * s.every, () => {
          if (b.dead) return;
          // en la última fase salen de tres en tres (centro, izquierda, derecha)
          const off = s.count > 5 ? ((i % 3) - 1) * 0.16 : (Math.random() - 0.5) * 0.12;
          shot(ang + off, { speed: s.speed, range: s.range, dmg: s.dmg, r: s.r, bounces: s.bounces, pierce: true, look: { shape: s.shape, trail: 'drip', scale: s.scale } });
        });
        break;
      case 'lullaby':
        // Canto: una zona de música que va con él y duerme a quien entre
        this.zones.push({ x: b.x, y: b.y, r: s.radius, t: s.dur, life: s.dur, team: b.team, atk: { kind: 'song', type: sT, dps: s.dps, heal: 0, sleep: s.sleep, pal }, by: b, tickT: 0, follow: b, slept: {} });
        break;
      case 'telekinesis': {
        // Psíquico: levanta a los cercanos con la mente y los estampa
        this.fx.push({ kind: 'shockring', x: b.x, y: b.y, r: s.radius, pal, t: 0, life: 0.5, big: true, shape: 'ring' });
        for (const e of this.brawlers) {
          if (e.dead || e.team === b.team || Math.hypot(e.x - b.x, e.y - b.y) > s.radius + e.r) continue;
          e.stunT = Math.max(e.stunT, s.lift + 0.2);
          this.fx.push({ kind: 'psylift', target: e, pal, t: 0, life: s.lift });
          later(s.lift, () => {
            if (e.dead) return;
            this.damage(e, s.dmg, b, sT, { knockback: 200, kx: e.x - b.x, ky: e.y - b.y, big: true });
            this.fx.push({ kind: 'shockring', x: e.x, y: e.y, r: 90, pal, t: 0, life: 0.4, big: true });
            this.shake = Math.max(this.shake, 10);
          });
        }
        break;
      }
      case 'crunch': {
        // Triturar: mandíbulas gigantes que se cierran sobre la zona
        const p = at(s.range);
        this.fx.push({ kind: 'jaws', x: p.x, y: p.y, r: s.radius, pal, bite: s.bite, t: 0, life: s.bite + 0.45 });
        later(s.bite, () => {
          this.hitCircle(b, p.x, p.y, s.radius, s.dmg, sT, { stun: s.stun, knockback: 160 });
          this.fx.push({ kind: 'shockring', x: p.x, y: p.y, r: s.radius * 1.2, pal, t: 0, life: 0.4, big: true });
          this.shake = Math.max(this.shake, 14);
        });
        break;
      }
      case 'vinewhip':
        // Látigo Cepa: cuatro látigos a la vez
        for (let i = 0; i < s.count; i++) shot(s.count > 1 ? ang - s.spread / 2 + (s.spread * i) / (s.count - 1) : ang, { kind: 'hook', speed: s.speed, range: s.range, dmg: s.dmg, r: s.r, stun: s.stun, look: { shape: 'leaf', trail: 'leaves', scale: 1.4 } });
        break;
      case 'payday':
        // Día de Pago: lluvia de monedas que rebotan
        this.spawnSpread(b, { count: s.count, spread: s.spread, jitter: 0.05, speedVar: 0.15, speed: s.speed, range: s.range, dmg: s.dmg, r: s.r, bounces: s.bounces, type: sT, look: { shape: 'coin', trail: 'spark', scale: 1.7, pal } }, ang, true, 1);
        break;
      case 'blazekick': {
        // Patada Ígnea: embestida en llamas que deja fuego y explota al final
        this.startAction(b, ang, 'Attack', s.time + 0.1);
        const v = s.range / s.time;
        b.dash = { t: s.time, vx: c * v, vy: n * v, dmg: s.dmg, stun: s.stun, r: 44, hit: new Set(), type: sT };
        for (let i = 1; i <= 3; i++) later((s.time * i) / 3, () => this.zones.push({ x: b.x, y: b.y, r: 55, t: 2, life: 2, team: b.team, atk: { kind: 'zone', dps: 260, heal: 0, type: sT, puddle: true }, by: b, tickT: 0.25 }));
        later(s.time, () => {
          if (b.dead) return;
          this.explode(b, b.x, b.y, 110, s.boom, sT, { knockback: 400, big: true });
          this.fx.push({ kind: 'shockring', x: b.x, y: b.y, r: 140, pal, t: 0, life: 0.45, big: true, shape: 'fire' });
        });
        break;
      }
      case 'dragonclaw': {
        // Garra Dragón: tres zarpazos gigantes seguidos sobre la zona
        const p = at(s.range);
        for (let i = 0; i < s.count; i++) later(0.08 + i * s.every, () => {
          this.hitCircle(b, p.x, p.y, s.radius, s.dmg, sT, { knockback: i === s.count - 1 ? 380 : 120 });
          this.fx.push({ kind: 'clawmark', x: p.x, y: p.y, r: s.radius, pal, ang: -0.7 + i * 0.7 + (Math.random() - 0.5) * 0.3, t: 0, life: 0.6 });
          this.shake = Math.max(this.shake, 9);
        });
        break;
      }
    }
  }

  // Golpe Umbrío y parecidos: invisible e intocable un momento y luego aparece golpeando
  updatePhase(b, dt) {
    const ph = b.phase, s = b.def.super;
    ph.t += dt;
    b.moving = false;
    if (ph.t < ph.T) return;
    b.phase = null;
    b.x = ph.tx;
    b.y = ph.ty;
    if (ph.target && !ph.target.dead) b.facing = Math.atan2(ph.target.y - b.y, ph.target.x - b.x);
    b.action = { anim: 'Attack', t: 0, len: 0.4 };
    this.hitCircle(b, b.x, b.y, s.radius, s.dmg, ph.type, { stun: s.stun || 0, knockback: s.hits ? 120 : 380 });
    for (let i = 1; i < (s.hits || 1); i++) {
      // golpes de más (Carantoña): seguidos y un poco más flojos
      this.timers.push({ t: i * 0.13, fn: () => {
        if (b.dead) return;
        this.hitCircle(b, b.x, b.y, s.radius * 0.8, s.dmg * 0.45, ph.type, { knockback: i === s.hits - 1 ? 380 : 80 });
        const a = Math.random() * Math.PI;
        this.fx.push({ kind: 'tear', x: b.x, y: b.y, x1: b.x - Math.cos(a) * 70, y1: b.y - Math.sin(a) * 50, x2: b.x + Math.cos(a) * 70, y2: b.y + Math.sin(a) * 50, w: 26, pal: ph.pal, t: 0, life: 0.45, seed: Math.random() * 100 });
        this.shake = Math.max(this.shake, 8);
      } });
    }
    for (let i = 0; i < 2; i++) this.fx.push({ kind: 'shockring', x: b.x, y: b.y, r: s.radius * (1 + i * 0.5), pal: ph.pal, t: -i * 0.08, life: 0.45, big: true });
    this.fx.push({ kind: 'tear', x: b.x, y: b.y, x1: b.x - 90, y1: b.y - 60, x2: b.x + 90, y2: b.y + 50, w: 40, pal: ph.pal, t: 0, life: 0.7, seed: Math.random() * 100 });
    this.shake = Math.max(this.shake, 14);
  }

  // Esfera enorme de un legendario: estalla al final de su recorrido o contra un muro
  orbBoom(p) {
    const o = p.bigorb;
    if (!o || !p.owner) return;
    p.bigorb = null;
    this.hitCircle(p.owner, p.x, p.y, o.boomR, o.boom, p.atkType, { knockback: 420 });
    for (let i = 0; i < 3; i++) this.fx.push({ kind: 'shockring', x: p.x, y: p.y, r: o.boomR * (1 + i * 0.35), pal: o.pal, t: -i * 0.07, life: 0.5, big: true });
    this.flash(p.x, p.y, o.boomR * 1.3, (PB.VFX.PAL[o.pal] || PB.VFX.PAL.psychic)[4], 0.3);
    this.shake = Math.max(this.shake, 14);
  }

  // Orbes que giran alrededor (Danza Pétalo, Giro Fuego...): golpean y paran disparos rivales
  orbitPoints(b) {
    const s = b.def.super, o = b.orbit, out = [];
    for (let i = 0; i < s.count; i++) {
      const a = o.ang + (i / s.count) * Math.PI * 2;
      out.push({ x: b.x + Math.cos(a) * s.rad, y: b.y - 14 + Math.sin(a) * s.rad * 0.8, a });
    }
    return out;
  }

  updateOrbit(b, dt) {
    const o = b.orbit, s = b.def.super, T = s.type || b.def.atkType;
    o.t -= dt;
    o.ang += s.spin * dt;
    if (o.t <= 0) { b.orbit = null; return; }
    const pts = this.orbitPoints(b);
    for (const q of pts) {
      for (const e of this.brawlers) {
        if (e.dead || e.team === b.team || e.leap || (o.hitT[e.idx] || 0) > this.time) continue;
        if (Math.hypot(e.x - q.x, e.y - 14 - q.y) < 22 + e.r) {
          o.hitT[e.idx] = this.time + 0.45;
          this.damage(e, s.dmg, b, T, { knockback: 220, kx: e.x - b.x, ky: e.y - b.y, hx: q.x, hy: q.y });
        }
      }
      for (const p of this.projectiles) {
        if (p.lob || p.gone || p.team === b.team || p.isSuper) continue;
        if (Math.hypot(p.x - q.x, p.y - q.y) < p.r + 16) p.gone = true;
      }
    }
  }

  spawnLob(b, atk, ang, dist, isSuper, mul) {
    this.projectiles.push({
      lob: true, sx: b.x, sy: b.y, tx: b.x + Math.cos(ang) * dist, ty: b.y + Math.sin(ang) * dist,
      t: 0, T: atk.flight, x: b.x, y: b.y, z: 0, team: b.team, owner: b, look: atk.look || {}, atkType: atk.type || b.def.atkType,
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
            this.explode(p.owner, p.x, p.y, p.atk.radius, p.atk.dmg * p.mul, p.atkType, { charge: p.charge, stun: p.isSuper ? p.atk.stun : 0 });
            if (p.atk.cluster) this.clusterBlast(p);
            if (p.atk.puddle) {
              // charco (Bomba Fango...): una zona pequeña que daña un rato
              const pu = p.atk.puddle;
              this.zones.push({ x: p.x, y: p.y, r: pu.radius, t: pu.duration, life: pu.duration, team: p.team, atk: { kind: 'zone', dps: pu.dps * p.mul, heal: 0, type: p.atkType, puddle: true }, by: p.owner, tickT: 0.25 });
            }
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
      if (p.gone) { this.puff(p); continue; } // lo ha parado un orbe
      // espejo (Manto Espejo, Contraataque...): el disparo rival vuelve hacia quien lo lanzó
      if (!p.wave) {
        for (const m of this.brawlers) {
          if (m.dead || m.team === p.team || !(m.reflectT > 0)) continue;
          if (Math.hypot(m.x - p.x, m.y - 20 - p.y) > m.def.super.radius + p.r) continue;
          const o = p.owner, sp = Math.hypot(p.vx, p.vy);
          const a = o && !o.dead ? Math.atan2(o.y - 8 - p.y, o.x - p.x) : Math.atan2(-p.vy, -p.vx);
          Object.assign(p, { vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, ang: a, team: m.team, owner: m, hit: new Set(), traveled: 0, charge: false, homing: 0, back: false, boomerang: false, sine: 0 });
          const P = PB.VFX.PAL[m.reflectType] || PB.VFX.PAL.psychic;
          this.ring(p.x, p.y, 4, 30, P[4], 0.2, 3);
          for (let i = 0; i < 5; i++) this.px(p.x, p.y, i % 2 ? '#ffffff' : P[3], { speed: 160, life: 0.25, size: 4 });
          this.events.push({ type: 'reflect', b: m });
          break;
        }
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
      if (p.sine) {
        const sp = Math.hypot(p.vx, p.vy);
        p.ang = p.baseAng + Math.cos(p.t * p.sineF) * p.sine;
        p.vx = Math.cos(p.ang) * sp;
        p.vy = Math.sin(p.ang) * sp;
      }
      if (p.boomerang && p.back) {
        const o = p.owner, dx = o.x - p.x, dy = o.y - 10 - p.y, d = Math.hypot(dx, dy) || 1;
        const sp = Math.hypot(p.vx, p.vy);
        p.vx = (dx / d) * sp;
        p.vy = (dy / d) * sp;
        if (d < 30 || o.dead || p.t > 4) continue;
      }
      const step = Math.hypot(p.vx, p.vy) * dt;
      this._seg = [p.x, p.y]; // tramo recorrido en este paso (los disparos rápidos no se saltan a nadie)
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.traveled += step;
      if (p.traveled >= p.range) {
        if (p.boomerang && !p.back) { p.back = true; p.hit = new Set(); }
        else if (!p.boomerang) {
          // el último tramo también golpea (si no, lo que está justo al final del alcance no recibe)
          for (const e of this.brawlers) {
            if (e.dead || e.leap || e.phase || e.team === p.team || p.hit.has(e.idx) || !this.shotTouches(p, e.x, e.y - 8, e.r)) continue;
            p.hit.add(e.idx);
            this.damage(e, p.dmg, p.owner, p.atkType, { charge: p.charge, knockback: p.knockback, stun: p.stun, kx: p.vx, ky: p.vy, shotId: p.shotId, hx: p.x, hy: p.y, big: p.isSuper || p.powered });
            if (!p.pierce) break;
          }
          this.splitShot(p);
          this.orbBoom(p);
          this.puff(p);
          continue;
        }
      }
      // los que van y vuelven atraviesan los muros, pero las cajas sí las golpean (una vez a la ida y otra a la vuelta)
      if (p.boomerang) {
        const T = PB.TILE, c = Math.floor(p.x / T), r = Math.floor(p.y / T), key = r * this.world.w + c + (p.back ? 0.5 : 0);
        if (this.world.tile(c, r) === 'C' && !(p.crates && p.crates.has(key))) {
          (p.crates = p.crates || new Set()).add(key);
          this.damageCrate(c, r, p.dmg, p.owner, p.charge);
        }
      }
      if (!p.boomerang && (!p.wave || p.waveStops) && this.world.shotBlockedAt(p.x, p.y)) {
        const T = PB.TILE, c = Math.floor(p.x / T), r = Math.floor(p.y / T);
        if (p.bounces > 0) {
          // rebote: vuelve al sitio de antes y cambia la dirección según la cara del muro que ha tocado
          // (si es una caja, también la golpea)
          if (this.world.tile(c, r) === 'C') this.damageCrate(c, r, p.dmg, p.owner, p.charge);
          const px = p.x - p.vx * dt, py = p.y - p.vy * dt;
          const hitX = this.world.shotBlockedAt(p.x, py), hitY = this.world.shotBlockedAt(px, p.y);
          if (hitX || !hitY) p.vx = -p.vx;
          if (hitY || !hitX) p.vy = -p.vy;
          p.x = px;
          p.y = py;
          p.ang = p.baseAng = Math.atan2(p.vy, p.vx);
          p.bounces--;
          p.hit = new Set(); // tras rebotar puede volver a golpear al mismo
          this.puff(p, true);
          this.events.push({ type: 'bounce' });
          keep.push(p);
          continue;
        }
        if (p.destroysWalls && this.breakWalls(p.x, p.y, 40).length) {
          this.shake = Math.max(this.shake, 6);
        } else {
          if (this.world.tile(c, r) === 'C') this.damageCrate(c, r, p.dmg, p.owner, p.charge);
          this.splitShot(p, true);
          this.orbBoom(p);
          this.puff(p, true);
          continue;
        }
      }
      let dead = false;
      for (const st of this.structures) {
        if (st.hp <= 0 || st.team === p.team || p.hit.has('s' + st.id)) continue;
        if (this.shotTouches(p, st.x, st.y - 10, st.r)) {
          p.hit.add('s' + st.id);
          this.damageStructure(st, p.dmg, p.owner, p.charge, p.x, p.y);
          if (!p.pierce) { dead = true; this.splitShot(p); this.puff(p); break; }
        }
      }
      if (dead) continue;
      for (const e of this.brawlers) {
        if (e.dead || e.leap || e.phase || e.team === p.team || p.hit.has(e.idx)) continue;
        if (this.shotTouches(p, e.x, e.y - 8, e.r)) {
          p.hit.add(e.idx);
          this.damage(e, p.dmg, p.owner, p.atkType, {
            charge: p.charge, knockback: p.knockback, stun: p.stun, kx: p.vx, ky: p.vy, shotId: p.shotId, hx: p.wave ? e.x : p.x, hy: p.wave ? e.y - 20 : p.y, big: p.isSuper || p.powered,
          });
          if (p.transform && p.owner && !e.dead) this.transform(p.owner, e);
          if (p.hook && p.owner && !p.owner.dead && !e.dead) {
            // látigo: lo trae hasta delante de quien lo lanzó (el empujón se frena con exp(-8t): recorre k/8)
            const o = p.owner, dx = o.x - e.x, dy = o.y - e.y, d = Math.hypot(dx, dy) || 1;
            const pull = Math.max(0, d - 80) * 8;
            e.kx = (dx / d) * pull;
            e.ky = (dy / d) * pull;
            this.fx.push({ kind: 'tether', by: o, target: e, t: 0, life: 0.4, type: p.atkType });
          }
          if (!p.pierce) { dead = true; this.splitShot(p); break; }
        }
      }
      if (!dead) keep.push(p);
    }
    this._seg = null;
    this.projectiles = keep;
  }

  // Racimo (Tumba Rocas, Tierra Viva): tras el golpe del centro, estallan trozos alrededor
  clusterBlast(p) {
    const c = p.atk.cluster, a0 = Math.random() * Math.PI * 2, o = p.owner, T = p.atkType, mul = p.mul, charge = p.charge;
    for (let i = 0; i < c.count; i++) {
      const a = a0 + (i / c.count) * Math.PI * 2, x = p.x + Math.cos(a) * c.dist, y = p.y + Math.sin(a) * c.dist;
      this.vfx('rock', PB.VFX.PAL[T] ? T : 'rock', p.x, p.y, { vx: Math.cos(a) * c.dist * 7, vy: Math.sin(a) * c.dist * 7, z: 10, vz: 300, scale: 0.8, life: 0.15 * (i + 1), spin: 10 });
      this.timers.push({ t: 0.15 * (i + 1), fn: () => { if (o) this.explode(o, x, y, c.radius, c.dmg * mul, T, { charge }); } });
    }
  }

  // Partículas que deja cada proyectil al volar
  trail(p, dt) {
    const tr = p.look && p.look.trail;
    if (!tr || p.t < 0) return;
    if (p.tier === 2 && Math.random() < 0.5) this.px(p.x + (Math.random() - 0.5) * 20, p.y + (Math.random() - 0.5) * 20, '#ffffff', { speed: 40, life: 0.3, size: 3 });
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
      if (z.follow && !z.follow.dead) {
        // Canto: la zona va con quien canta
        z.x = z.follow.x;
        z.y = z.follow.y;
      }
      if (z.vx || z.vy) {
        // torbellino: avanza (por encima de todo) y se frena un poco al final
        const k = Math.min(1, z.t / 0.6);
        z.x = Math.max(0, Math.min(this.world.pixelW, z.x + z.vx * dt * k));
        z.y = Math.max(0, Math.min(this.world.pixelH, z.y + z.vy * dt * k));
      }
      const tick = z.tickT <= 0;
      if (tick) z.tickT = 0.25;
      for (const b of this.brawlers) {
        if (b.dead || Math.hypot(b.x - z.x, b.y - z.y) > z.r) continue;
        if (b.team !== z.team && z.atk.sleep && !z.slept[b.idx] && !b.leap && !b.phase) {
          // se queda dormido (una vez por canción)
          z.slept[b.idx] = 1;
          b.stunT = Math.max(b.stunT, z.atk.sleep);
          this.fx.push({ kind: 'zzz', target: b, pal: z.atk.pal, t: 0, life: z.atk.sleep });
        }
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
      if (z.atk.kind === 'tornado') {
        // polvo y trozos que giran alrededor del torbellino (el embudo lo dibuja render.js)
        const T = z.atk.type || z.by.def.atkType, P = PB.VFX.PAL[T] || PB.VFX.PAL.flying;
        const a = Math.random() * Math.PI * 2;
        this.px(z.x + Math.cos(a) * z.r * 0.8, z.y + Math.sin(a) * z.r * 0.4, P[2 + Math.floor(Math.random() * 3)], { vx: -Math.sin(a) * 220, vy: Math.cos(a) * 110 - 30, life: 0.4, size: 5 });
      } else if (Math.random() < 0.5) {
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
      if (!this.world.los(b.x, b.y, e.x, e.y)) continue; // no se pega a través de rocas, árboles ni muros
      this.damage(e, atk.dmg * (mul || 1), b, atk.type || b.def.atkType, { charge: true, knockback: 160, kx: Math.cos(ang), ky: Math.sin(ang), big: true });
      hitAny = true;
    }
    for (const st of this.structures) {
      if (st.hp <= 0 || st.team === b.team || Math.hypot(st.x - b.x, st.y - b.y) > atk.range + st.r) continue;
      if (!this.world.los(b.x, b.y, st.x, st.y)) continue;
      this.damageStructure(st, atk.dmg * (mul || 1), b, true, st.x, st.y - 30);
    }
    // cajas (Niebla Tóxica) delante
    const T = PB.TILE;
    for (const k of [0.5, 0.9]) {
      const x = b.x + Math.cos(ang) * atk.range * k, y = b.y + Math.sin(ang) * atk.range * k;
      const c = Math.floor(x / T), r = Math.floor(y / T);
      if (this.world.tile(c, r) === 'C') { this.damageCrate(c, r, atk.dmg * (mul || 1), b, true); break; }
    }
    this.fx.push({ kind: 'slash', x: b.x, y: b.y - 14, ang, r: atk.range, arc: atk.arc, t: 0, life: 0.2, type: atk.type || b.def.atkType });
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
  // mul: solo en el láser del ataque básico (el súper no lleva): carga el súper y empuja menos
  beamHit(b, s, type, ang, mul) {
    const basic = mul !== undefined, dmg = s.dmg * (mul || 1);
    const x1 = b.x, y1 = b.y - 18;
    let x2 = x1 + Math.cos(ang) * s.range, y2 = y1 + Math.sin(ang) * s.range;
    // cajas en la línea: el láser del ataque básico se para en el primer muro o caja (y la daña);
    // el rayo del súper sigue de largo y daña todas las cajas que pilla
    const T = PB.TILE, steps = Math.ceil(s.range / 14), hitC = new Set();
    for (let i = 1; i <= steps; i++) {
      const x = x1 + (x2 - x1) * (i / steps), y = b.y + (y2 - y1) * (i / steps), c = Math.floor(x / T), r = Math.floor(y / T);
      if (!this.world.blocksShotAt(c, r)) continue;
      if (this.world.tile(c, r) === 'C' && !hitC.has(c + ',' + r)) { hitC.add(c + ',' + r); this.damageCrate(c, r, dmg, b, true); }
      if (basic) { x2 = x; y2 = y1 + (y2 - y1) * (i / steps); break; }
    }
    const len = Math.hypot(x2 - x1, y2 - y1) || 1;
    for (const e of this.brawlers) {
      if (e.dead || e.team === b.team) continue;
      const t = Math.max(0, Math.min(1, ((e.x - x1) * (x2 - x1) + (e.y - 10 - y1) * (y2 - y1)) / (len * len)));
      const d = Math.hypot(e.x - (x1 + (x2 - x1) * t), e.y - 10 - (y1 + (y2 - y1) * t));
      if (d < s.width / 2 + e.r) this.damage(e, dmg, b, type, { knockback: basic ? 60 : 240, kx: x2 - x1, ky: y2 - y1, big: !basic, charge: basic });
    }
    for (const st of this.structures) {
      if (st.hp <= 0 || st.team === b.team) continue;
      const t = Math.max(0, Math.min(1, ((st.x - x1) * (x2 - x1) + (st.y - y1) * (y2 - y1)) / (len * len)));
      if (Math.hypot(st.x - (x1 + (x2 - x1) * t), st.y - (y1 + (y2 - y1) * t)) < s.width / 2 + st.r) this.damageStructure(st, dmg, b, basic, st.x, st.y - 30);
    }
    this.fx.push({ kind: 'beam', x1, y1, x2, y2, w: s.width, t: 0, life: basic ? 0.22 : 0.4, type });
    this.shake = Math.max(this.shake, basic ? 2 : 8);
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
    const pal = PB.VFX.PAL[b.def.attack.type || b.def.atkType] || PB.VFX.PAL.normal;
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
    if (target.dead || target.shieldT > 0 || target.spawnT > 0 || target.leap || target.phase) return;
    const eff = atkType ? PB.effectiveness(atkType, target.types || target.def.types) : 1;
    // escudo de súper: reduce el daño
    const shield = (target.barrierT > 0 ? 1 - (target.barrierReduce || 0.5) : 1) * (target.megaT > 0 ? PB.MEGA.taken : 1);
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
        if (source.team !== target.team) this.gainMega(source, PB.MEGA.perHit / source.def.superHits);
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
    if (!opts.quiet && source && source.x != null && amt > 0) {
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
    b.leap = null;
    b.phase = null;
    b.orbit = null;
    b.rageT = 0;
    b.reflectT = 0;
    b.rootT = 0;
    b.buffT = 0;
    if (killer && killer !== b) {
      killer.kills++;
      killer.streak++;
      this.gainXp(killer, PB.EVO.perKO + PB.EVO.perKOStage * (b.stage || 0));
      this.gainMega(killer, PB.MEGA.perKO);
    }
    if (b.megaT > 0) this.megaEnd(b);
    if (b.tfBase) this.untransform(b);
    for (let i = 0; i < b.balls; i++) {
      const a = Math.random() * Math.PI * 2, s = 90 + Math.random() * 140;
      this.balls.push({ kind: 'ball', x: b.x, y: b.y, z: 20, vx: Math.cos(a) * s, vy: Math.sin(a) * s, vz: 300 + Math.random() * 200, delay: 0.5, taken: false, spin: Math.random() * 6 });
    }
    b.balls = 0;
    if (this.mode.onKill) this.mode.onKill(this, b, killer);
    // animación: se debilita y vuelve a su Pokéball con el rayo rojo
    this.fx.push({ kind: 'faint', dex: PB.skinDex(b.dex, b.skin), shiny: b.shiny, x: b.x, y: b.y, facing: b.facing, team: b.team, t: 0, life: 1.5 });
    for (let i = 0; i < 16; i++) this.px(b.x, b.y - 16, i % 2 ? '#ffffff' : b.team === 'blue' ? '#5ab0ff' : '#ff5a5a', { speed: 240, life: 0.5, size: 5 });
    this.feed.push({ killer: killer ? killer.name : '?', kdex: killer && killer.line ? PB.skinDex(killer.dex, killer.skin) : null, victim: b.name, vdex: PB.skinDex(b.dex, b.skin), team: killer ? killer.team : 'red', t: this.time });
    if (this.feed.length > 4) this.feed.shift();
    this.events.push({ type: 'ko', b, killer, streak: killer ? killer.streak : 0 });
    this.shake = Math.max(this.shake, b.isPlayer ? 16 : 6);
  }

  respawn(b) {
    const list = this.world.spawns[b.team] || this.world.spawns.free;
    const sp = (this.mode.respawnAt && this.mode.respawnAt(this, b)) || list[Math.floor(Math.random() * list.length)];
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
