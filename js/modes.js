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
      if ((info.hpF < 0.3 && info.foe && info.fd < 450) || (winning && b.balls > 0) || (b.balls >= 5 && info.hpF < 0.6)) {
        return { goal: safe, retreat: true };
      }
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
    desc: 'Todos contra todos (10). Rompe cajas para conseguir Caramelos Raros. La niebla venenosa cierra el mapa. El último en pie gana.',
    rules: { matchTime: 600 },
    setup(g) {
      const W = g.world;
      const maxR = Math.hypot(W.pixelW, W.pixelH) / 2 + 40;
      g.gas = { x: W.pixelW / 2, y: W.pixelH / 2, r: maxR, maxR, minR: 140, tickT: 0, warn: false };
    },
    update(g, dt) {
      const gas = g.gas;
      // la niebla empieza a cerrarse a los 20 s y llega al mínimo a los 2 min
      const k = Math.max(0, Math.min(1, (g.time - 20) / 100));
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
      if (b.isPlayer && !g.winner) g.end('out');
    },
    botPlan(bot, info) {
      const g = bot.g, b = bot.b, gas = g.gas;
      // fuera (o casi) de la niebla: volver hacia el centro
      if (dist(b, gas) > gas.r - 110) return { goal: { x: gas.x + Math.cos(b.idx) * 80, y: gas.y + Math.sin(b.idx) * 80 }, retreat: !!info.foe && info.hpF < 0.5 };
      const r = retreatPlan(bot, info);
      if (r) return r;
      // caramelos sueltos cerca
      let candy = null, cd = Infinity;
      for (const it of g.balls) {
        const d = dist(it, b);
        if (d < cd && dist(it, gas) < gas.r - 60) { cd = d; candy = it; }
      }
      if (candy && cd < 600 && (!info.foe || info.fd > 350)) return { goal: candy, avoidFight: g.time < 45 };
      // solo va a por otros si va bien de vida y no es más débil (al principio prefiere las cajas)
      const stronger = info.foe && b.power >= (info.foe.power || 0);
      if (info.foe && info.fd < 380 && info.hpF > 0.6 && stronger && (g.time > 25 || b.power >= 2)) return { goal: info.foe };
      // romper la caja más cercana
      const T = PB.TILE, W = g.world;
      let crate = null, crd = Infinity;
      for (const key of W.crateHp.keys()) {
        const c = key % W.w, rr = Math.floor(key / W.w);
        const p = { x: c * T + T / 2, y: rr * T + T / 2 };
        const d = dist(p, b);
        if (d < crd && dist(p, gas) < gas.r - 100) { crd = d; crate = { x: p.x, y: p.y, crate: { c, r: rr } }; }
      }
      if (crate) return { goal: crate, target: crate, avoidFight: g.time < 45 && b.power < 3 };
      return { goal: { x: gas.x, y: gas.y } };
    },
    result(g, me) {
      if (me.rank === 1 || g.winner === me.team) return { title: '¡PRIMER PUESTO!', cls: 'win' };
      return { title: 'PUESTO #' + (me.rank || '?'), cls: me.rank <= 4 ? '' : 'lose' };
    },
  },

  // ------------------------------------------------------------------ Despierta a Snorlax
  heist: {
    id: 'heist', name: 'Despierta a Snorlax', map: 'heist', statName: 'Daño a Snorlax',
    desc: '3 contra 3. Cada equipo protege a su Snorlax dormido. Gana quien despierte (debilite) antes al Snorlax rival.',
    rules: { matchTime: 150 },
    setup(g) {
      let id = 0;
      for (const team of ['red', 'blue']) {
        const p = g.world.snorlax[team];
        g.structures.push({ id: id++, kind: 'snorlax', team, x: p.x, y: p.y, r: 46, hp: 12000, maxHp: 12000, flashT: 0, zT: 0 });
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
    desc: '3 contra 3. Mete el Voltorb en la portería rival: el primero en marcar 2 goles gana. ¡Si lo llevas más de 10 s, explota!',
    rules: { matchTime: 150 },
    setup(g) {
      const s = g.world.ballSpot;
      g.voltorb = { x: s.x, y: s.y, z: 0, vx: 0, vy: 0, vz: 0, carrier: null, lastKicker: null, lastTouch: null, kickCd: 0, holdT: 0, spin: 0 };
      g.score = { blue: 0, red: 0 };
    },
    update(g, dt) {
      const v = g.voltorb, W = g.world;
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
        const f = Math.exp((v.z > 0 ? -0.4 : -1.4) * dt);
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
          if (v.lastTouch && v.lastTouch.team === scorer) v.lastTouch.stat++;
          g.events.push({ type: 'goal', team: scorer, by: v.lastTouch });
          for (let i = 0; i < 30; i++) g.px(v.x, v.y, i % 2 ? '#fff36a' : scorer === 'blue' ? '#5aa8ff' : '#ff5f5f', { speed: 320, life: 0.8, size: 6 });
          g.shake = 14;
          if (g.score[scorer] >= 2) g.end(scorer);
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
      g.end(blue > red ? 'blue' : red > blue ? 'red' : 'draw');
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
      v.vx = Math.cos(ang) * 780;
      v.vy = Math.sin(ang) * 780;
      v.vz = 140;
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
        if ((d < 460 && W.los(b.x, b.y, shootX, goal.y)) || v.holdT > 7.5) {
          const ang = Math.atan2(goal.y - b.y, shootX - b.x);
          return { goal, kick: { dx: Math.cos(ang), dy: Math.sin(ang) } };
        }
        return { goal, avoidFight: true };
      }
      const r = retreatPlan(bot, info);
      if (r && v.carrier !== b) return r;
      if (v.carrier && v.carrier.team === b.team) {
        // escoltar al compañero que lleva el balón
        const c = v.carrier, d = dist(c, goal) || 1;
        return { goal: { x: c.x + ((goal.x - c.x) / d) * 180 + ((b.idx % 3) - 1) * 120, y: c.y + ((goal.y - c.y) / d) * 180 } };
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
        if (!b.dead && dist(b, z) < z.r) { inside[b.team]++; b.stat += dt; }
      }
      const prev = z.owner;
      z.owner = inside.blue && !inside.red ? 'blue' : inside.red && !inside.blue ? 'red' : inside.blue && inside.red ? 'contested' : null;
      if (z.owner === 'blue' || z.owner === 'red') {
        g.progress[z.owner] = Math.min(100, g.progress[z.owner] + 1.6 * dt);
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

PB.MODE_ORDER = ['gems', 'showdown', 'heist', 'ball', 'zone'];
})();
