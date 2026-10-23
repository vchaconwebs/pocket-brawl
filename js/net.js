// Partidas en red: un jugador hace de anfitrión (simula la partida de verdad, con los bots)
// y los demás reciben "fotos" del estado unas 20 veces por segundo y le mandan sus controles.
//
// Este archivo no sabe nada de Firebase ni de WebRTC: solo convierte la partida en mensajes
// y al revés. El canal por el que viajan lo pone js/online.js (WebRTC o, para probar en local,
// BroadcastChannel entre pestañas).
PB.Net = (() => {
  const SKIP_GAME = new Set(['mode', 'rules', 'world', 'fx', 'events', 'timers', 'brawlers', 'nextShotId']);
  // campos de cada luchador que no se copian: cada uno sabe quién es él
  const SKIP_B = new Set(['def', 'isPlayer', 'friend', 'idx', 'hit', 'animT', 'dustT', 'trainer', 'name', 'isBot', 'shiny', 'superQ', 'atkQ', 'ai', 'evoMsg', 'say']);
  const r1 = (n) => Math.round(n * 10) / 10;

  // ------------------------------------------------------------ convertir a datos
  // Los luchadores se mandan como { $b: idx }; funciones y Set no viajan.
  function pack(v, game, depth) {
    if (v === null || v === undefined) return v;
    const t = typeof v;
    if (t === 'number') return Number.isInteger(v) ? v : r1(v);
    if (t === 'string' || t === 'boolean') return v;
    if (t === 'function' || depth > 6) return undefined;
    if (v instanceof Set) return undefined;
    if (v instanceof Map) return { $m: [...v.entries()].map((e) => pack(e, game, depth + 1)) };
    if (Array.isArray(v)) return v.map((x) => pack(x, game, depth + 1));
    if (game.brawlers[v.idx] === v) return { $b: v.idx };
    const o = {};
    for (const k in v) {
      if (k === 'by' || k === 'owner' || k === 'carrier' || k === 'lastKicker' || k === 'lastTouch' || k === 'b' || k === 'source' || k === 'target') {
        const x = v[k];
        o[k] = x && game.brawlers[x.idx] === x ? { $b: x.idx } : pack(x, game, depth + 1);
        continue;
      }
      const p = pack(v[k], game, depth + 1);
      if (p !== undefined) o[k] = p;
    }
    return o;
  }

  function unpack(v, game) {
    if (v === null || typeof v !== 'object') return v;
    if (Array.isArray(v)) return v.map((x) => unpack(x, game));
    if ('$b' in v) return game.brawlers[v.$b] || null;
    if ('$m' in v) return new Map(v.$m.map((e) => unpack(e, game)));
    const o = {};
    for (const k in v) o[k] = unpack(v[k], game);
    if (o.hit === undefined && ('pierce' in o || 'dash' in o)) o.hit = new Set();
    return o;
  }

  // ------------------------------------------------------------ anfitrión
  // Guarda lo último que mandó para enviar solo lo que cambia.
  class Host {
    constructor(game) {
      this.game = game;
      this.last = { g: {}, b: game.brawlers.map(() => ({})) };
      this.worldV = -1;
      this.crates = '';
      this.events = [];
    }

    // eventos de este fotograma (sonidos, K.O., goles...): se guardan antes de que main.js los borre
    takeEvents(list) {
      for (const ev of list) this.events.push(pack(ev, this.game, 0));
    }

    // full: foto completa (al entrar alguien o cada pocos segundos por si acaso)
    snapshot(full) {
      const g = this.game, out = { t: r1(g.clock) };
      // partida
      const gs = {};
      for (const k in g) {
        if (SKIP_GAME.has(k)) continue;
        const p = JSON.stringify(pack(g[k], g, 0));
        if (full || this.last.g[k] !== p) { gs[k] = p; this.last.g[k] = p; }
      }
      out.g = gs;
      // luchadores
      out.b = g.brawlers.map((b, i) => {
        const prev = this.last.b[i], d = {};
        for (const k in b) {
          if (SKIP_B.has(k)) continue;
          // la súper y la munición se redondean hacia abajo: si no, con 0,95 ya se vería la súper lista
          const p = k === 'superCharge' || k === 'ammo' ? Math.floor(b[k] * 100) / 100 : pack(b[k], g, 1);
          const s = typeof p === 'object' && p !== null ? JSON.stringify(p) : p;
          if (full || prev[k] !== s) { d[k] = p === undefined ? null : p; prev[k] = s; }
        }
        // ficha (cambia al evolucionar por una rama de otro tipo)
        const defKey = b.def.id + ':' + b.stage;
        if (full || prev.$def !== defKey) { d.$def = 1; prev.$def = defKey; }
        return d;
      });
      // muros rotos y cajas
      const W = g.world;
      if (full || W.version !== this.worldV) { out.tiles = W.tiles.map((r) => r.join('')); this.worldV = W.version; }
      const cr = JSON.stringify([...W.crateHp.entries()].map(([k, v]) => [k, Math.round(v)]));
      if (full || cr !== this.crates) { out.crates = JSON.parse(cr); this.crates = cr; }
      // efectos nuevos (partículas, rayos...) para que se vean igual en todas las pantallas
      const fx = [];
      for (const f of g.fx) {
        if (f._s) continue;
        f._s = 1;
        if (f.kind === 'px' && fx.length > 140) continue;
        fx.push(pack(f, g, 0));
      }
      if (fx.length) out.fx = fx;
      if (this.events.length) { out.ev = this.events; this.events = []; }
      return out;
    }
  }

  // ------------------------------------------------------------ jugador (no anfitrión)
  // Aplica las fotos sobre su copia de la partida y suaviza el movimiento de los demás.
  class Client {
    constructor(game, meIdx) {
      this.game = game;
      this.meIdx = meIdx;
      this.target = game.brawlers.map((b) => ({ x: b.x, y: b.y }));
      this.events = [];
      this.seq = 0;
      this.pending = []; // controles enviados que el anfitrión aún no ha aplicado (predicción)
    }

    apply(s) {
      const g = this.game;
      for (const k in s.g || {}) g[k] = unpack(JSON.parse(s.g[k]), g);
      (s.b || []).forEach((d, i) => {
        const b = g.brawlers[i];
        if (!b) return;
        for (const k in d) {
          if (k === '$def') continue;
          if (k === 'x' || k === 'y') { this.target[i][k] = d[k]; continue; }
          b[k] = unpack(d[k], g);
        }
        if (d.$def) b.def = PB.retype(PB.brawlerById(b.def.id), b.line, b.stage, b.kit);
        if (b.dash && !b.dash.hit) b.dash.hit = new Set();
      });
      if (s.tiles) {
        g.world.tiles = s.tiles.map((r) => r.split(''));
        g.world.version++;
      }
      if (s.crates) g.world.crateHp = new Map(s.crates);
      if (s.fx) for (const f of s.fx) { const o = unpack(f, g); o._s = 1; g.fx.push(o); }
      if (s.ev) for (const e of s.ev) this.events.push(unpack(e, g));
      // controles que el anfitrión ya ha aplicado
      if (s.ack !== undefined) this.pending = this.pending.filter((p) => p.seq > s.ack);
    }

    // Avanza lo que no depende del anfitrión: efectos, animaciones y el movimiento suavizado.
    // El propio jugador se mueve al instante (predicción) y se corrige poco a poco.
    step(dt, myInput) {
      const g = this.game;
      g.clock += dt;
      if (g.startT > 0) g.startT -= dt;
      g.updateFx(dt);
      const k = 1 - Math.exp(-14 * dt);
      g.brawlers.forEach((b, i) => {
        b.animT += dt;
        if (b.orbit) b.orbit.ang += b.def.super.spin * dt; // los orbes giran suaves entre foto y foto
        const t = this.target[i];
        if (i === this.meIdx && !b.dead && !b.dash && !b.leap && !b.phase && !(b.rootT > 0) && b.stunT <= 0 && g.started && !g.winner) {
          // predicción: me muevo ya con mis controles; si el anfitrión me ve muy lejos, salto ahí
          let mx = myInput.mx || 0, my = myInput.my || 0;
          const len = Math.hypot(mx, my);
          if (len > 1) { mx /= len; my /= len; }
          const sp = g.speedOf(b);
          g.world.moveCircle(b, mx * sp * dt, my * sp * dt);
          b.moving = len > 0.15;
          if (b.moving && !b.action) b.facing = Math.atan2(my, mx);
          const lag = this.pending.length ? 0.04 : 0.12; // si no hay nada pendiente, acércate más rápido a la posición buena
          const dx = t.x - b.x, dy = t.y - b.y, d = Math.hypot(dx, dy);
          if (d > 140) { b.x = t.x; b.y = t.y; } else if (d > 2 && !b.moving) { b.x += dx * lag * 4; b.y += dy * lag * 4; } else if (d > 40) { b.x += dx * lag; b.y += dy * lag; }
        } else {
          const dx = t.x - b.x, dy = t.y - b.y;
          if (Math.hypot(dx, dy) > 200) { b.x = t.x; b.y = t.y; } else { b.x += dx * k; b.y += dy * k; }
        }
      });
      // los disparos siguen avanzando entre foto y foto
      for (const p of g.projectiles) {
        if (p.lob) {
          p.t += dt;
          const q = Math.max(0, Math.min(1, p.t / p.T));
          p.x = p.sx + (p.tx - p.sx) * q;
          p.y = p.sy + (p.ty - p.sy) * q;
          p.z = Math.sin(q * Math.PI) * (60 + Math.hypot(p.tx - p.sx, p.ty - p.sy) * 0.18);
        } else if (p.vx !== undefined) {
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.t = (p.t || 0) + dt;
        }
        g.trail(p, dt);
      }
      for (const z of g.zones) {
        z.t -= dt;
        if (z.vx || z.vy) { z.x += z.vx * dt; z.y += z.vy * dt; } // torbellino
      }
      g.events.push(...this.events);
      this.events = [];
    }

    // controles para el anfitrión: el movimiento siempre; ataque y súper solo cuando se pulsan
    input(inp) {
      const m = { seq: ++this.seq, mx: r1(inp.mx || 0), my: r1(inp.my || 0) };
      // (toque rápido: al enemigo más cercano o hacia donde mira, según los ajustes)
      const aimMsg = (a) => (a.auto ? { auto: true } : a.facing ? { facing: true } : { dx: r1(a.dx), dy: r1(a.dy), dist: r1(a.dist || 0) });
      if (inp.attack) m.attack = Object.assign(aimMsg(inp.attack), inp.attack.held ? { held: 1 } : {});
      if (inp.super) m.super = aimMsg(inp.super);
      this.pending.push(m);
      if (this.pending.length > 60) this.pending.shift();
      return m;
    }
  }

  // Controles de los jugadores remotos en el anfitrión: el último movimiento y el último botón
  // pulsado desde el fotograma anterior (si mantiene el ratón, llega uno en cada mensaje)
  class Remote {
    constructor() { this.mx = 0; this.my = 0; this.attack = null; this.super = null; this.ack = 0; }
    push(m) {
      this.mx = m.mx || 0;
      this.my = m.my || 0;
      this.ack = m.seq;
      // un clic (pulsación) no se pisa con el "sigue mantenido" que llega justo detrás
      if (m.attack && !(m.attack.held && this.attack && !this.attack.held)) this.attack = m.attack;
      if (m.super) this.super = m.super;
    }
    take() {
      const out = { mx: this.mx, my: this.my, attack: this.attack, super: this.super };
      this.attack = this.super = null;
      return out;
    }
  }

  // Canal de prueba entre pestañas del mismo navegador (sin internet): sirve para probar
  // las partidas en red en local. El de verdad (WebRTC) tiene la misma forma.
  function localLink(room, me) {
    const ch = new BroadcastChannel('pv-net-' + room);
    const link = {
      me,
      onMessage: null,
      onLeave: null,
      send(to, msg) { ch.postMessage({ from: me, to, msg }); },
      close() { ch.postMessage({ from: me, to: null, msg: { k: 'bye' } }); ch.close(); },
    };
    ch.onmessage = (e) => {
      const { from, to, msg } = e.data;
      if (from === me || (to && to !== me)) return;
      if (link.onMessage) link.onMessage(from, msg);
    };
    return link;
  }

  return { Host, Client, Remote, pack, unpack, localLink };
})();
