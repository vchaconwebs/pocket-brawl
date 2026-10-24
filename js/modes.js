// Modos de juego. Cada modo define sus reglas sobre la simulación común (PB.Game):
//   setup(g)            prepara el modo al crear la partida
//   update(g, dt)       reglas que se comprueban cada fotograma
//   timeUp(g)           qué pasa cuando se acaba el tiempo
//   onKill(g, b, k)     cuando b cae (lo debilita k)
//   onAttack(g, b, aim) si devuelve true, el modo se encarga del ataque (p. ej. chutar)
//   botPlan(bot, info)  a dónde va un bot y qué ataca: { goal, target, retreat, kick }
//   result(g, me)       título de la pantalla final
(() => {
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const otherTeam = (t) => (t === 'blue' ? 'red' : 'blue');

// Retirada genérica: si tiene poca vida y un enemigo cerca, vuelve a su base
function retreatPlan(bot, info) {
  const b = bot.b, W = bot.g.world;
  if (info.hpF < 0.3 && info.foe && info.fd < 450) {
    const home = (W.spawns[b.team] && W.spawns[b.team][1]) || null;
    if (home) return { goal: home, retreat: true };
    // sin base (todos contra todos): alejarse del enemigo
    const dx = b.x - info.foe.x, dy = b.y - info.foe.y, d = Math.hypot(dx, dy) || 1;
    return { goal: { x: b.x + (dx / d) * 300, y: b.y + (dy / d) * 300 }, retreat: true };
  }
  return null;
}

// "Atacante" ficticio para la explosión del Voltorb
const VOLTORB = { team: '__voltorb', name: 'Voltorb', power: 0, def: { name: 'Voltorb', atkType: 'electric', superHits: 1 }, kills: 0, streak: 0, dmgDone: 0, stat: 0, superCharge: 0 };

function teamResult(g, me) {
  if (g.winner === 'draw') return { title: 'EMPATE', cls: '' };
  return g.winner === me.team ? { title: '¡VICTORIA!', cls: 'win' } : { title: 'DERROTA', cls: 'lose' };
}

// arbusto de su lado del mapa donde esconderse (ni pegado a la máquina ni en la base)
function hideSpot(g, b, home) {
  const W = g.world, T = PB.TILE;
  if (!W._bushes) {
    W._bushes = [];
    for (let r = 0; r < W.h; r++) for (let c = 0; c < W.w; c++) if (W.tile(c, r) === 'b') W._bushes.push({ x: (c + 0.5) * T, y: (r + 0.5) * T });
  }
  const dm = dist(home, W.mine);
  let best = null, bs = Infinity;
  for (const p of W._bushes) {
    const fromMine = dist(p, W.mine), fromHome = dist(p, home);
    if (fromHome > dm * 0.85 || fromMine < 200 || fromHome < 220) continue; // en su mitad, sin irse a casa
    const sc = dist(p, b) + Math.abs(fromMine - dm * 0.5) * 0.5;
    if (sc < bs) { bs = sc; best = p; }
  }
  return best;
}

// Niebla venenosa que va cerrando el mapa (Niebla Tóxica y Dúo)
function gasUpdate(g, dt) {
  const gas = g.gas;
  // la niebla empieza a cerrarse a los 15 s y llega al mínimo a los 1:15
  const k = Math.max(0, Math.min(1, (g.time - 15) / 60));
  gas.r = gas.maxR + (gas.minR - gas.maxR) * k;
  if (k > 0 && !gas.warn) { gas.warn = true; g.events.push({ type: 'gas' }); }
  gas.tickT -= dt;
  const tick = gas.tickT <= 0;
  if (tick) gas.tickT = 0.5;
  for (const b of g.brawlers) {
    if (b.dead || dist(b, gas) < gas.r) continue;
    b.lastCombat = g.time; // en la niebla no se regenera vida
    if (tick) g.damage(b, 280 + 60 * Math.floor(g.time / 30), null, null, { quiet: true });
  }
  // burbujas de veneno en el borde
  for (let i = 0; i < 3; i++) {
    const a = Math.random() * Math.PI * 2;
    const x = gas.x + Math.cos(a) * (gas.r + Math.random() * 60), y = gas.y + Math.sin(a) * (gas.r + Math.random() * 60);
    if (x > -50 && y > -50 && x < g.world.pixelW + 50 && y < g.world.pixelH + 50) {
      g.vfx('bubble', 'poison', x, y, { vy: -30, life: 0.8, scale: 0.6 + Math.random() * 0.6, fade: true });
    }
  }
}

// chut del Voltorb: velocidad de salida y hasta dónde llega rodando (lo que marca la línea de apuntado)
PB.KICK = { speed: 600, reach: 326 };

PB.MODES = {
  // ------------------------------------------------------------------ Atrapa Pokéballs
  gems: {
    id: 'gems', name: 'Atrapa Pokéballs', map: 'gems', statName: 'Pokéballs',
    desc: '3 contra 3. Consigue 10 Pokéballs de la máquina central y aguanta 15 segundos.',
    rules: { matchTime: 180 },
    setup(g) {
      g.ballT = 3;
    },
    update(g, dt) {
      const R = g.rules;
      g.ballT -= dt;
      if (g.ballT <= 0) {
        g.ballT = R.ballEvery;
        const a = Math.random() * Math.PI * 2, s = 70 + Math.random() * 80;
        const m = g.world.mine;
        g.balls.push({ kind: 'ball', x: m.x, y: m.y, z: 10, vx: Math.cos(a) * s, vy: Math.sin(a) * s, vz: 560, delay: 0.3, taken: false, spin: 0 });
        g.padGlow = 0.6;
        g.ring(m.x, m.y, 10, 70, '#ffffff', 0.4, 5);
        for (let i = 0; i < 10; i++) g.px(m.x, m.y - 10, i % 2 ? '#fff6a8' : '#ffffff', { speed: 160, vy: -60, life: 0.5, size: 4 });
        g.events.push({ type: 'ballspawn' });
      }
      const blue = g.teamBalls('blue'), red = g.teamBalls('red');
      let leader = null;
      if (blue >= R.ballsToWin && blue > red) leader = 'blue';
      else if (red >= R.ballsToWin && red > blue) leader = 'red';
      if (leader) {
        if (!g.countdown || g.countdown.team !== leader) {
          g.countdown = { team: leader, t: R.countdown };
          g.events.push({ type: 'countdown', team: leader });
        }
        const before = Math.ceil(g.countdown.t);
        g.countdown.t -= dt;
        if (Math.ceil(g.countdown.t) !== before) g.events.push({ type: 'tick', team: leader });
        if (g.countdown.t <= 0) g.end(leader);
      } else if (g.countdown) {
        g.countdown = null;
        g.events.push({ type: 'countdownStop' });
      }
    },
    timeUp(g) {
      const blue = g.teamBalls('blue'), red = g.teamBalls('red');
      g.end(blue > red ? 'blue' : red > blue ? 'red' : 'draw');
    },
    botPlan(bot, info) {
      const g = bot.g, b = bot.b, W = g.world;
      const foeTeam = otherTeam(b.team);
      const winning = g.countdown && g.countdown.team === b.team;
      const losing = g.countdown && g.countdown.team === foeTeam;
      const home = W.spawns[b.team][1];
      const safe = { x: home.x + (W.mine.x - home.x) * 0.3, y: home.y + (W.mine.y - home.y) * 0.3 };
      // el otro equipo tiene la cuenta atrás: hay que ir a por quien lleva las Pokéballs, sin miedo
      if (losing) {
        let carrier = null, most = 0;
        for (const e of g.brawlers) if (e.team === foeTeam && !e.dead && e.balls > most) { most = e.balls; carrier = e; }
        if (carrier) return { goal: carrier, aggressive: true, hunt: carrier };
        if (info.foe) return { goal: info.foe, aggressive: true };
      }
      // sitio "con cuidado": en su lado, cerca del centro (no en la base), cada uno en un hueco distinto
      const toHome = Math.atan2(home.y - W.mine.y, home.x - W.mine.x) + ((b.idx % 3) - 1) * 0.7;
      const guard = { x: W.mine.x + Math.cos(toHome) * 260, y: W.mine.y + Math.sin(toHome) * 260 };
      const teamBalls = g.teamBalls(b.team);
      // muy tocado y con un rival encima: se aparta a cubierto (a medio camino, no hasta casa)
      if (info.hpF < 0.25 && info.foe && info.fd < 400) {
        return { goal: b.balls >= 4 ? safe : guard, retreat: true };
      }
      // su equipo ya tiene las 10 (cuenta atrás): los que llevan Pokéballs se esconden en un arbusto
      // de su lado y se echan atrás; los demás defienden en su lado del centro
      if (winning) {
        if (b.balls > 0) {
          if (!bot.hide || bot.hideFor !== g.countdown) { bot.hide = hideSpot(g, b, home); bot.hideFor = g.countdown; }
          return { goal: bot.hide || safe, retreat: true };
        }
        return { goal: guard };
      }
      bot.hide = null;
      // con muchas Pokéballs: juega tranquilo en el centro, coge las que caen cerca
      // si nadie las tiene más a mano y se defiende sin perseguir
      if ((b.balls >= 5 && info.hpF < 0.6) || (teamBalls >= g.rules.ballsToWin - 2 && b.balls >= 3)) {
        let near = null, nd = 340;
        for (const gm of g.balls) {
          const d = dist(gm, b);
          if (d < nd && !g.enemiesOf(b).some((e) => !e.dead && dist(e, gm) < d - 40)) { nd = d; near = gm; }
        }
        if (near) return { goal: near };
        return { goal: guard };
      }
      // con pocas Pokéballs: a por todas (se pelea más y persigue)
      if (info.foe && b.balls <= 2 && info.fd < 750 && info.hpF > 0.4) return { goal: info.foe, aggressive: true };
      if (info.foe && (losing || (info.fd < 700 && info.hpF > 0.45))) return { goal: info.foe };
      let best = null, bd = Infinity;
      for (const gm of g.balls) {
        const d = dist(gm, b);
        if (d < bd) { bd = d; best = gm; }
      }
      if (best && bd < 900) return { goal: best };
      if (dist(W.mine, b) < 40) return { goal: { x: W.mine.x + Math.cos(b.idx) * 90, y: W.mine.y + Math.sin(b.idx) * 90 } };
      return { goal: W.mine };
    },
    result: teamResult,
  },

  // ------------------------------------------------------------------ Niebla Tóxica
  showdown: {
    id: 'showdown', name: 'Niebla Tóxica', map: 'showdown', ffa: true, players: 10, statName: 'Caramelos',
    desc: 'Todos contra todos (10). Rompe cajas para conseguir Caramelos Raros y hacerte más fuerte. La niebla venenosa cierra el mapa. El último en pie gana.',
    rules: { matchTime: 600 },
    setup(g) {
      const W = g.world;
      const maxR = Math.hypot(W.pixelW, W.pixelH) / 2 + 40;
      g.gas = { x: W.pixelW / 2, y: W.pixelH / 2, r: maxR, maxR, minR: 140, tickT: 0, warn: false };
    },
    update(g, dt) {
      gasUpdate(g, dt);
      const alive = g.brawlers.filter((b) => !b.dead);
      if (alive.length <= 1 && !g.winner) {
        if (alive[0]) alive[0].rank = 1;
        g.end(alive[0] ? alive[0].team : 'draw');
      }
    },
    timeUp() {},

    onKill(g, b) {
      b.out = true;
      b.rank = g.brawlers.filter((o) => !o.dead).length + 1;
      g.dropCandy(b.x, b.y, Math.max(1, b.power));
      if (b.isPlayer && !g.winner && !g.online) g.end('out');
    },
    botPlan(bot, info) {
      const g = bot.g, b = bot.b, gas = g.gas;
      // fuera (o casi) de la niebla: volver hacia dentro (el margen depende de lo grande que sea la zona:
      // al final queda muy poca y si no, se creerían siempre fuera y no pelearían)
      const edge = Math.min(110, gas.r * 0.35), off = Math.min(80, gas.r * 0.3);
      if (dist(b, gas) > gas.r - edge) return { goal: { x: gas.x + Math.cos(b.idx) * off, y: gas.y + Math.sin(b.idx) * off }, retreat: !!info.foe && info.hpF < 0.5 };
      const r = retreatPlan(bot, info);
      if (r) return r;
      // caramelos sueltos cerca
      let candy = null, cd = Infinity;
      for (const it of g.balls) {
        const d = dist(it, b);
        if (d < cd && dist(it, gas) < gas.r - 60) { cd = d; candy = it; }
      }
      if (candy && cd < 600 && (!info.foe || info.fd > 350)) return { goal: candy, avoidFight: g.time < 80 };
      // solo va a por otros si va bien de vida y no es más débil (al principio prefiere las cajas)
      const stronger = info.foe && b.power >= (info.foe.power || 0);
      if (info.foe && info.fd < 380 && info.hpF > 0.6 && stronger && (g.time > 60 || b.power >= 3)) return { goal: info.foe };
      // al final (zona pequeña o quedan pocos) se pelea siempre con el que tenga cerca
      if (info.foe && info.fd < 500 && (gas.r < 400 || g.brawlers.filter((o) => !o.dead).length <= 3)) return { goal: info.foe };
      // romper la caja más cercana
      const T = PB.TILE, W = g.world;
      let crate = null, crd = Infinity;
      for (const key of W.crateHp.keys()) {
        const c = key % W.w, rr = Math.floor(key / W.w);
        const p = { x: c * T + T / 2, y: rr * T + T / 2 };
        const d = dist(p, b);
        if (d < crd && dist(p, gas) < gas.r - 100) { crd = d; crate = { x: p.x, y: p.y, crate: { c, r: rr } }; }
      }
      if (crate) return { goal: crate, target: crate, avoidFight: g.time < 80 && b.power < 4 };
      return { goal: { x: gas.x, y: gas.y } };
    },
    result(g, me) {
      if (me.rank === 1 || g.winner === me.team) return { title: '¡PRIMER PUESTO!', cls: 'win' };
      return { title: 'PUESTO #' + (me.rank || '?'), cls: me.rank <= 3 ? '' : 'lose' };
    },
  },

  // ------------------------------------------------------------------ Despierta a Snorlax
  heist: {
    id: 'heist', name: 'Despierta a Snorlax', map: 'heist', statName: 'Daño a Snorlax',
    desc: '3 contra 3. Cada equipo protege a su Snorlax dormido. Gana quien despierte (debilite) antes al Snorlax rival.',
    rules: { matchTime: 180 },
    setup(g) {
      let id = 0;
      for (const team of ['red', 'blue']) {
        const p = g.world.snorlax[team];
        g.structures.push({ id: id++, kind: 'snorlax', team, x: p.x, y: p.y, r: 46, hp: 50000, maxHp: 50000, flashT: 0, zT: 0 });
        g.world.blockCircle(p.x, p.y, 40);
      }
    },
    update(g) {
      for (const s of g.structures) {
        if (s.hp <= 0 && !g.winner) {
          g.events.push({ type: 'snorlaxDown', team: s.team });
          g.shake = 20;
          g.end(otherTeam(s.team));
        }
      }
    },
    timeUp(g) {
      const f = (t) => { const s = g.structures.find((x) => x.team === t); return s.hp / s.maxHp; };
      const blue = f('blue'), red = f('red');
      g.end(Math.abs(blue - red) < 0.001 ? 'draw' : blue > red ? 'blue' : 'red');
    },
    botPlan(bot, info) {
      const g = bot.g, b = bot.b;
      const mine = g.structures.find((s) => s.team === b.team);
      const theirs = g.structures.find((s) => s.team !== b.team);
      const r = retreatPlan(bot, info);
      if (r) return r;
      // amenaza a nuestro Snorlax
      const threat = g.enemiesOf(b).find((e) => g.visibleTo(e, b.team) && dist(e, mine) < 450);
      const defender = b.idx % 3 === 0;
      if (threat && (defender || mine.hp / mine.maxHp < theirs.hp / theirs.maxHp - 0.1)) return { goal: threat };
      if (defender) {
        const W = g.world;
        const cx = W.pixelW / 2, cy = W.pixelH / 2;
        const d = dist(mine, { x: cx, y: cy }) || 1;
        return { goal: { x: mine.x + ((cx - mine.x) / d) * 220 + Math.sin(g.time * 0.5) * 80, y: mine.y + ((cy - mine.y) / d) * 220 } };
      }
      return { goal: theirs, target: { x: theirs.x, y: theirs.y, struct: theirs }, focus: true };
    },
    result: teamResult,
  },

  // ------------------------------------------------------------------ Voltorbol
  ball: {
    id: 'ball', name: 'Voltorbol', map: 'ball', statName: 'Goles',
    noLevels: true, // aquí lo importante es la pelota: los niveles no cuentan (más justo para los nuevos)
    desc: '3 contra 3. Mete el Voltorb en la portería rival: el primero en marcar 2 goles gana. ¡Si lo llevas más de 10 s, explota!',
    rules: { matchTime: 150 },
    setup(g) {
      const s = g.world.ballSpot;
      g.voltorb = { x: s.x, y: s.y, z: 0, vx: 0, vy: 0, vz: 0, carrier: null, lastKicker: null, lastTouch: null, kickCd: 0, holdT: 0, spin: 0 };
      g.score = { blue: 0, red: 0 };
    },
    update(g, dt) {
      const v = g.voltorb, W = g.world;
      // nadie puede meterse en su propia portería (no vale ponerse de portero dentro)
      for (const b of g.brawlers) {
        if (b.dead) continue;
        const R = W.goalRect(b.team);
        if (!R || b.x < R.x0 - b.r || b.x > R.x1 + b.r) continue;
        if (R.y0 < W.pixelH / 2) { if (b.y < R.y1 + b.r) b.y = R.y1 + b.r; } // portería de arriba
        else if (b.y > R.y0 - b.r) b.y = R.y0 - b.r; // portería de abajo
      }
      v.kickCd -= dt;
      if (v.carrier) {
        const c = v.carrier;
        if (c.dead) {
          v.carrier = null;
          v.vz = 260;
        } else {
          v.x = c.x + Math.cos(c.facing) * 26;
          v.y = c.y + Math.sin(c.facing) * 18 + 4;
          v.z = 0;
          v.holdT += dt;
          v.spin += (Math.hypot(c.vx, c.vy) / 20) * dt;
          if (v.holdT > 10) {
            // ¡el Voltorb explota!
            v.carrier = null;
            g.explode(VOLTORB, v.x, v.y, 90, 1400, 'electric', { big: true });
            g.events.push({ type: 'voltorbBoom' });
            const a = Math.random() * Math.PI * 2;
            v.vx = Math.cos(a) * 300; v.vy = Math.sin(a) * 300; v.vz = 300;
            v.lastKicker = c; v.kickCd = 1;
          }
        }
      }
      if (!v.carrier) {
        v.holdT = 0;
        v.vz -= 1500 * dt;
        v.z += v.vz * dt;
        if (v.z <= 0) {
          v.z = 0;
          v.vz = Math.abs(v.vz) > 150 ? -v.vz * 0.45 : 0;
        }
        // rodar y rebotar en los muros
        const nx = v.x + v.vx * dt;
        if (W.circleSolid(nx, v.y, 12)) v.vx = -v.vx * 0.7; else v.x = nx;
        const ny = v.y + v.vy * dt;
        if (W.circleSolid(v.x, ny, 12)) v.vy = -v.vy * 0.7; else v.y = ny;
        const f = Math.exp((v.z > 0 ? -0.8 : -2.2) * dt);
        v.vx *= f; v.vy *= f;
        v.spin += (Math.hypot(v.vx, v.vy) / 20) * dt;
        // recoger
        if (v.z < 24) {
          for (const b of g.brawlers) {
            if (b.dead || b.stunT > 0 || b.spawnT > 0) continue;
            if (b === v.lastKicker && v.kickCd > 0) continue;
            if (Math.hypot(b.x - v.x, b.y - v.y) < b.r + 16) {
              v.carrier = b; v.lastTouch = b; v.vx = v.vy = 0;
              g.events.push({ type: 'pickBall', b });
              break;
            }
          }
        }
      }
      // ¿gol?
      for (const team of ['red', 'blue']) {
        const R = W.goalRect(team);
        if (R && v.x > R.x0 && v.x < R.x1 && v.y > R.y0 - 6 && v.y < R.y1 + 6) {
          const scorer = otherTeam(team);
          g.score[scorer]++;
          if (v.lastTouch && v.lastTouch.team === scorer) { v.lastTouch.stat++; g.gainXp(v.lastTouch, 20); }
          g.events.push({ type: 'goal', team: scorer, by: v.lastTouch });
          for (let i = 0; i < 30; i++) g.px(v.x, v.y, i % 2 ? '#fff36a' : scorer === 'blue' ? '#5aa8ff' : '#ff5f5f', { speed: 320, life: 0.8, size: 6 });
          g.shake = 14;
          if (g.score[scorer] >= 2 || g.overtime) g.end(scorer);
          else this.kickoff(g);
          break;
        }
      }
    },
    kickoff(g) {
      const v = g.voltorb, s = g.world.ballSpot;
      Object.assign(v, { x: s.x, y: s.y, z: 0, vx: 0, vy: 0, vz: 0, carrier: null, lastKicker: null, kickCd: 0, holdT: 0 });
      g.projectiles = [];
      g.zones = [];
      const count = { blue: 0, red: 0 };
      for (const b of g.brawlers) {
        const sp = g.world.spawns[b.team][count[b.team]++ % 3];
        Object.assign(b, { x: sp.x, y: sp.y, dead: false, hp: b.maxHp, ammo: g.rules.maxAmmo, kx: 0, ky: 0, stunT: 0, dash: null, burst: null, action: null, stealthT: 0 });
      }
      g.startT = 3;
    },
    timeUp(g) {
      const { blue, red } = g.score;
      if (blue !== red || g.overtime) return g.end(blue > red ? 'blue' : red > blue ? 'red' : 'draw');
      // empate: gol de oro. Se rompe todo menos las porterías y quien marque gana;
      // si en 1 minuto nadie marca, empate
      g.overtime = true;
      g.overtimeEnd = g.time + 60;
      const W = g.world, T = PB.TILE, goals = W.goals.red.concat(W.goals.blue);
      const nearGoal = (c, r) => goals.some((t) => Math.abs(t.c - c) <= 2 && Math.abs(t.r - r) <= 2);
      for (let r = 0; r < W.h; r++) for (let c = 0; c < W.w; c++) {
        if ('#TCFW'.includes(W.tile(c, r)) && !nearGoal(c, r)) g.breakWalls(c * T + T / 2, r * T + T / 2, 1);
      }
      // un solo sonido para todo (no uno por muro)
      for (let i = g.events.length - 1; i >= 0; i--) if (g.events[i].type === 'wall') g.events.splice(i, 1);
      g.shake = 16;
      g.events.push({ type: 'goldenGoal' });
    },
    // usar el súper con el Voltorb en las manos lo suelta ahí mismo: si no, con una embestida o un salto
    // se cruzaba medio campo con él y era gol seguro
    onSuper(g, b) {
      const v = g.voltorb;
      if (!v || v.carrier !== b) return;
      v.carrier = null;
      v.vx = v.vy = 0;
      v.vz = 220;
      v.lastKicker = b;
      v.kickCd = 0.8; // (no lo vuelve a coger nada más soltarlo)
    },
    onAttack(g, b, aim) {
      const v = g.voltorb;
      if (v.carrier !== b) return false;
      if (b.shotCd > 0) return true;
      let ang;
      if (aim.auto) {
        const R = g.world.goalRect(otherTeam(b.team));
        ang = Math.atan2(R.cy - b.y, R.cx - b.x);
      } else ang = Math.atan2(aim.dy, aim.dx);
      v.carrier = null;
      v.vx = Math.cos(ang) * PB.KICK.speed;
      v.vy = Math.sin(ang) * PB.KICK.speed;
      v.vz = 120;
      v.lastKicker = b;
      v.lastTouch = b;
      v.kickCd = 0.35;
      b.shotCd = 0.4;
      g.startAction(b, ang, 'Attack', 0.3);
      g.events.push({ type: 'kick', b });
      for (let i = 0; i < 6; i++) g.px(v.x, v.y, '#ffffff', { speed: 120, life: 0.25, size: 4 });
      return true;
    },
    botPlan(bot, info) {
      const g = bot.g, b = bot.b, v = g.voltorb, W = g.world;
      const goalR = W.goalRect(otherTeam(b.team)), ownR = W.goalRect(b.team);
      const goal = { x: goalR.cx, y: goalR.cy };
      if (v.carrier === b) {
        const d = dist(b, goal);
        const shootX = goalR.x0 + 30 + Math.random() * (goalR.x1 - goalR.x0 - 60);
        // el chute llega a unos 320 px: desde más lejos se queda corto, mejor acercarse o pasarla
        if ((d < 290 && W.los(b.x, b.y, shootX, goal.y)) || v.holdT > 7.5) {
          const ang = Math.atan2(goal.y - b.y, shootX - b.x);
          return { goal, kick: { dx: Math.cos(ang), dy: Math.sin(ang) } };
        }
        // pase: si me agobian, no veo la portería o llevo un rato con el balón,
        // se lo paso a un compañero que esté más adelantado y con el camino libre
        const foes = g.enemiesOf(b).filter((e) => !e.dead);
        const pressed = foes.some((e) => dist(e, b) < 230);
        if ((pressed || v.holdT > 1.5 || !W.los(b.x, b.y, goal.x, goal.y)) && !(bot.passT > g.time)) {
          const blocked = (o) => foes.some((e) => {
            // ¿hay un rival cerca de la línea del pase?
            const lx = o.x - b.x, ly = o.y - b.y, l2 = lx * lx + ly * ly || 1;
            const k = Math.max(0, Math.min(1, ((e.x - b.x) * lx + (e.y - b.y) * ly) / l2));
            return Math.hypot(b.x + lx * k - e.x, b.y + ly * k - e.y) < 42;
          });
          let best = null;
          for (const o of g.brawlers) {
            if (o === b || o.team !== b.team || o.dead || o.spawnT > 0) continue;
            const od = dist(o, b), gd = dist(o, goal);
            if (od < 90 || od > 300 || gd > d - (pressed ? 0 : 60) || !W.los(b.x, b.y, o.x, o.y) || blocked(o)) continue;
            if (!best || gd < best.gd) best = { o, gd };
          }
          if (best) {
            bot.passT = g.time + 1.2;
            // un poco por delante de hacia donde corre el compañero
            const tx = best.o.x + (best.o.vx || 0) * 0.25, ty = best.o.y + (best.o.vy || 0) * 0.25;
            const ang = Math.atan2(ty - b.y, tx - b.x);
            return { goal, kick: { dx: Math.cos(ang), dy: Math.sin(ang) } };
          }
        }
        return { goal, avoidFight: true };
      }
      const r = retreatPlan(bot, info);
      if (r && v.carrier !== b) return r;
      if (v.carrier && v.carrier.team === b.team) {
        // escoltar al compañero que lleva el balón
        const c = v.carrier, d = dist(c, goal) || 1;
        const side = (b.idx % 2 ? 1 : -1) * 150;
        return { goal: { x: c.x + ((goal.x - c.x) / d) * 220 - ((goal.y - c.y) / d) * side, y: c.y + ((goal.y - c.y) / d) * 220 + ((goal.x - c.x) / d) * side } };
      }
      if (v.carrier) return { goal: v.carrier }; // quitárselo al rival
      // balón suelto: los dos más cercanos van a por él, el otro defiende
      const mates = g.brawlers.filter((o) => o.team === b.team && !o.dead).sort((p, q) => dist(p, v) - dist(q, v));
      if (mates.indexOf(b) < 2) return { goal: v };
      return { goal: { x: (v.x + ownR.cx) / 2, y: (v.y + ownR.cy) / 2 } };
    },
    result: teamResult,
  },

  // ------------------------------------------------------------------ Territorio
  zone: {
    id: 'zone', name: 'Territorio', map: 'zone', statName: 'Seg. en zona',
    desc: '3 contra 3. Quédate en la zona del centro sin enemigos dentro para ir ganando terreno. Gana el primero en llegar al 100 %.',
    rules: { matchTime: 150 },
    setup(g) {
      const s = g.world.zoneSpot;
      g.zone = { x: s.x, y: s.y, r: 170, owner: null };
      g.progress = { blue: 0, red: 0 };
    },
    update(g, dt) {
      const z = g.zone;
      const inside = { blue: 0, red: 0 };
      for (const b of g.brawlers) {
        if (!b.dead && dist(b, z) < z.r) { inside[b.team]++; b.stat += dt; g.gainXp(b, 0.6 * dt); }
      }
      const prev = z.owner;
      z.owner = inside.blue && !inside.red ? 'blue' : inside.red && !inside.blue ? 'red' : inside.blue && inside.red ? 'contested' : null;
      if (z.owner === 'blue' || z.owner === 'red') {
        g.progress[z.owner] = Math.min(100, g.progress[z.owner] + 1.9 * dt);
        if (g.progress[z.owner] >= 100) g.end(z.owner);
      }
      if (prev !== z.owner && (z.owner === 'blue' || z.owner === 'red')) g.events.push({ type: 'zoneTaken', team: z.owner });
    },
    timeUp(g) {
      const { blue, red } = g.progress;
      g.end(blue > red ? 'blue' : red > blue ? 'red' : 'draw');
    },
    botPlan(bot, info) {
      const g = bot.g, b = bot.b, z = g.zone;
      const r = retreatPlan(bot, info);
      if (r) return r;
      const a = b.idx * 2.1 + g.time * 0.15;
      return { goal: { x: z.x + Math.cos(a) * z.r * 0.45, y: z.y + Math.sin(a) * z.r * 0.45 } };
    },
    result: teamResult,
  },
};


// ------------------------------------------------------------------ comunes de los modos nuevos
// Todos vuelven a su base con la vida llena (nueva ronda de Eliminación)
function resetRound(g) {
  g.projectiles = [];
  g.zones = [];
  g.mines = [];
  g.turrets = [];
  const count = {};
  for (const b of g.brawlers) {
    const list = g.world.spawns[b.team];
    const sp = list[(count[b.team] = (count[b.team] || 0) + 1) % 3];
    if (b.megaT > 0) g.megaEnd(b);
    if (b.tfBase) g.untransform(b);
    Object.assign(b, { x: sp.x, y: sp.y, dead: false, out: false, hp: b.maxHp, ammo: g.rules.maxAmmo, kx: 0, ky: 0, stunT: 0, dash: null, burst: null, action: null, stealthT: 0, respawnT: 0, shieldT: 0, barrierT: 0 });
  }
  g.startT = 3;
}
// Bot que va a por el rival más cercano sin separarse mucho de los suyos
function fightPlan(bot, info) {
  const g = bot.g, b = bot.b;
  const r = retreatPlan(bot, info);
  if (r) return r;
  const foes = g.enemiesOf(b).filter((e) => !e.dead);
  const mates = g.brawlers.filter((o) => o !== b && o.team === b.team && !o.dead);
  if (!foes.length) return { goal: mates[0] || { x: g.world.pixelW / 2, y: g.world.pixelH / 2 } };
  const near = foes.sort((p, q) => dist(p, b) - dist(q, b))[0];
  // si un compañero está lejos y en apuros, a ayudarle
  const help = mates.find((m) => m.hp < m.maxHp * 0.5 && dist(m, b) > 300);
  if (help && dist(near, b) > 260) return { goal: help };
  return { goal: near };
}

// ------------------------------------------------------------------ Niebla Tóxica Dúo
// Como Niebla Tóxica, pero por parejas: 5 equipos de 2. Gana la última pareja en pie.
PB.MODES.duo = Object.assign({}, PB.MODES.showdown, {
  id: 'duo', name: 'Niebla Tóxica Dúo', duo: true, places: 5,
  desc: 'Por parejas: 5 equipos de 2. Rompe cajas: los Caramelos que coge uno cuentan para los dos. Si cae tu pareja, vuelve a los 12 s (sin Caramelos) mientras tú sigas en pie. Gana la última pareja en pie.',
  revive: 12, // segundos hasta que vuelve el que cae, si su pareja sigue viva
  update(g, dt) {
    gasUpdate(g, dt);
    if (g.winner) return;
    const teams = [...new Set(g.brawlers.filter((b) => !b.dead).map((b) => b.team))];
    if (teams.length <= 1) {
      for (const b of g.brawlers) if (teams[0] && b.team === teams[0]) b.rank = 1;
      g.end(teams[0] || 'draw');
    }
  },
  onKill(g, b) {
    const mates = g.brawlers.filter((o) => o.team === b.team);
    // si su pareja sigue en pie, vuelve al rato a su lado, pero sin Caramelos (los suyos caen al suelo).
    // Los Caramelos que coja cualquiera de los dos después cuentan para los dos (game.js)
    if (mates.some((o) => o !== b && !o.dead)) {
      const lost = b.power || 0;
      if (lost) g.dropCandy(b.x, b.y, lost);
      b.maxHp -= lost * b.def.hp * 0.1; // (cada Caramelo daba +10 % de vida)
      b.power = 0;
      b.stat = 0;
      b.respawnT = this.revive;
      return;
    }
    // cae la pareja entera: ese equipo queda fuera, en el puesto que toque
    g.dropCandy(b.x, b.y, Math.max(1, b.power));
    for (const o of mates) o.out = true;
    const left = new Set(g.brawlers.filter((o) => !o.dead).map((o) => o.team)).size;
    for (const o of mates) o.rank = left + 1;
    if (mates.some((o) => o.isPlayer) && !g.winner && !g.online) g.end('out');
  },
  // el que vuelve sale junto a su pareja
  respawnAt(g, b) {
    const mate = g.brawlers.find((o) => o !== b && o.team === b.team && !o.dead);
    if (!mate) return null;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2, x = mate.x + Math.cos(a) * 70, y = mate.y + Math.sin(a) * 70;
      if (g.world.walkable(mate.x, mate.y, x, y, 18)) return { x, y };
    }
    return { x: mate.x, y: mate.y };
  },
  botPlan(bot, info) {
    const g = bot.g, b = bot.b;
    // no se aleja mucho de su pareja
    const mate = g.brawlers.find((o) => o !== b && o.team === b.team && !o.dead);
    if (mate && dist(mate, b) > 380 && !(info.foe && info.fd < 250)) return { goal: mate };
    return PB.MODES.showdown.botPlan(bot, info);
  },
  result(g, me) {
    if (me.rank === 1 || g.winner === me.team) return { title: '¡PRIMER PUESTO!', cls: 'win' };
    return { title: 'PUESTO #' + (me.rank || '?'), cls: me.rank <= 2 ? '' : 'lose' };
  },
});

// ------------------------------------------------------------------ Duelo de Equipos
// 3 contra 3 a K.O. durante 2:30: se reaparece y gana el equipo con más K.O.
// Si empatan, K.O. de oro: el siguiente K.O. gana (si en 1 minuto no hay ninguno, empate)
PB.MODES.brawl = {
  id: 'brawl', name: 'Duelo de Equipos', map: 'brawl', statName: 'K.O.', teamSize: 3, koLimit: 30,
  desc: '3 contra 3 a lo bestia durante dos minutos y medio: cada rival debilitado es un punto y gana el equipo con más K.O. (o el primero en llegar a 30).',
  rules: { matchTime: 150 },
  setup(g) { g.kos = { blue: 0, red: 0 }; },
  onKill(g, b) {
    const t = otherTeam(b.team);
    g.kos[t]++;
    // gana el primero en llegar al límite de K.O. (o el siguiente K.O. en el K.O. de oro)
    if ((g.overtime || g.kos[t] >= this.koLimit) && !g.winner) g.end(t);
  },
  timeUp(g) {
    const { blue, red } = g.kos;
    if (blue !== red || g.overtime) return g.end(blue > red ? 'blue' : red > blue ? 'red' : 'draw');
    g.overtime = true;
    g.overtimeEnd = g.time + 60;
    g.events.push({ type: 'goldenGoal', ko: true });
  },
  botPlan: fightPlan,
  result: teamResult,
};

// Duelo de Equipos 2 contra 2 y 1 contra 1: lo mismo en mapas más pequeños, más cortos y con menos K.O. para ganar
PB.MODES.pair = Object.assign({}, PB.MODES.brawl, {
  id: 'pair', name: 'Duelo 2 contra 2', map: 'pair', teamSize: 2, koLimit: 15,
  desc: '2 contra 2 en un mapa pequeño durante dos minutos: gana la pareja con más K.O. (o la primera en llegar a 15).',
  rules: { matchTime: 120 },
});
PB.MODES.duel = Object.assign({}, PB.MODES.brawl, {
  id: 'duel', name: 'Duelo 1 contra 1', map: 'duel', teamSize: 1, koLimit: 10,
  desc: 'Tú contra otro en el mapa más pequeño durante minuto y medio: gana quien haga más K.O. (o el primero en llegar a 10).',
  rules: { matchTime: 90 },
});

// ------------------------------------------------------------------ Entrenamiento (botón «Probar» de cada Pokémon)
// Tú solo contra 3 dianas quietas que vuelven enseguida. Sin tiempo, sin premios: para ver ataques, súper y evoluciones.
PB.MODES.practice = {
  id: 'practice', name: 'Entrenamiento', map: 'practice', statName: 'K.O.', practice: true,
  desc: 'Prueba un Pokémon contra maniquíes.',
  rules: { matchTime: 99999, respawn: 1.2 },
  setup(g) { g.kos = { blue: 0, red: 0 }; },
  onKill(g, b) { if (b.team === 'red') g.kos.blue++; },
  // los maniquíes vuelven a su sitio y, si llevan un rato sin recibir golpes, recuperan toda la vida
  update(g) {
    for (const b of g.brawlers) {
      if (b.team !== 'red' || b.dead || !b.home) continue;
      if (g.time - b.lastCombat > 2.5) {
        b.hp = b.maxHp;
        if (Math.hypot(b.x - b.home.x, b.y - b.home.y) > 4) { b.x += (b.home.x - b.x) * 0.1; b.y += (b.home.y - b.y) * 0.1; }
      }
    }
  },
  respawnAt(g, b) { return b.home || null; },
  botPlan: fightPlan,
  result: teamResult,
};

// ------------------------------------------------------------------ Eliminación
// 3 contra 3 sin reaparecer: gana la ronda el equipo que debilite a los 3 rivales.
// Al mejor de 3 rondas. Si una ronda dura más de 60 s, la gana quien tenga más Pokémon en pie.
PB.MODES.knockout = {
  id: 'knockout', name: 'Eliminación', map: 'knockout', statName: 'K.O.', noRespawn: true, roundTime: 60,
  desc: '3 contra 3 sin reaparecer: gana la ronda el equipo que debilite a los 3 rivales. Al mejor de 3 rondas.',
  rules: { matchTime: 9999 },
  setup(g) {
    g.rounds = { blue: 0, red: 0 };
    g.round = 1;
    g.roundT = 0;
    g.roundEnd = null;
  },
  update(g, dt) {
    if (g.roundEnd) {
      g.roundEnd.t -= dt;
      if (g.roundEnd.t <= 0) {
        g.roundEnd = null;
        g.round++;
        g.roundT = 0;
        resetRound(g);
        g.events.push({ type: 'round', n: g.round });
      }
      return;
    }
    g.roundT += dt;
    const alive = (t) => g.brawlers.filter((b) => b.team === t && !b.dead);
    const ab = alive('blue'), ar = alive('red');
    if (!ab.length || !ar.length) return this.roundWin(g, ab.length ? 'blue' : ar.length ? 'red' : null);
    if (g.roundT >= this.roundTime) {
      // se acabó el tiempo: más Pokémon en pie y, si empatan, más vida
      const hp = (l) => l.reduce((a, b) => a + b.hp / b.maxHp, 0);
      const w = ab.length !== ar.length ? (ab.length > ar.length ? 'blue' : 'red') : Math.abs(hp(ab) - hp(ar)) < 0.05 ? null : hp(ab) > hp(ar) ? 'blue' : 'red';
      this.roundWin(g, w);
    }
  },
  roundWin(g, team) {
    if (team) g.rounds[team]++;
    g.events.push({ type: 'roundWin', team, rounds: Object.assign({}, g.rounds) });
    if (team && g.rounds[team] >= 2) return g.end(team);
    // tras 5 rondas sin ganador (empates), gana quien lleve más
    if (g.round >= 5) return g.end(g.rounds.blue > g.rounds.red ? 'blue' : g.rounds.red > g.rounds.blue ? 'red' : 'draw');
    g.roundEnd = { t: 2.5, team };
  },
  onKill(g, b) {
    b.out = true; // no reaparece hasta la siguiente ronda
  },
  timeUp() {},
  botPlan: fightPlan,
  result: teamResult,
};

PB.MODE_ORDER = ['gems', 'showdown', 'duo', 'heist', 'ball', 'zone', 'brawl', 'pair', 'duel', 'knockout'];
// jugadores por equipo de cada modo (los que no lo dicen son de 3)
PB.teamSize = (mode) => ((PB.MODES[mode] || {}).teamSize || 3);
})();
