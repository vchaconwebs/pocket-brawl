// Mapa en cuadrícula: colisiones, línea de visión y búsqueda de caminos (A*).
PB.World = class {
  constructor(rows) {
    const T = PB.TILE;
    this.h = rows.length;
    this.w = rows[0].length;
    this.tiles = rows.map((r) => r.split(''));
    this.spawns = { red: [], blue: [] };
    this.mine = { x: 0, y: 0 };
    for (let r = 0; r < this.h; r++) {
      for (let c = 0; c < this.w; c++) {
        const ch = this.tiles[r][c];
        const cx = c * T + T / 2;
        const cy = r * T + T / 2;
        if (ch === 'R' || ch === 'A') {
          const list = ch === 'R' ? this.spawns.red : this.spawns.blue;
          for (const dx of [-1.5, 0, 1.5]) list.push({ x: cx + dx * T, y: cy });
          this.tiles[r][c] = '.';
        } else if (ch === 'G') {
          this.mine = { x: cx, y: cy };
          this.tiles[r][c] = '.';
        }
      }
    }
    this.pixelW = this.w * T;
    this.pixelH = this.h * T;
    this.version = 0; // sube cada vez que se rompe un muro
  }

  tile(c, r) {
    if (c < 0 || r < 0 || c >= this.w || r >= this.h) return 'X';
    return this.tiles[r][c];
  }

  solidAt(c, r) {
    const t = this.tile(c, r);
    return t === '#' || t === 'X' || t === '~';
  }

  blocksShotAt(c, r) {
    const t = this.tile(c, r);
    return t === '#' || t === 'X';
  }

  isBushAt(x, y) {
    return this.tile(Math.floor(x / PB.TILE), Math.floor(y / PB.TILE)) === 'b';
  }

  shotBlockedAt(x, y) {
    return this.blocksShotAt(Math.floor(x / PB.TILE), Math.floor(y / PB.TILE));
  }

  // Rompe muros '#' dentro de un radio. Devuelve los centros de los muros rotos.
  destroyAround(x, y, radius) {
    const T = PB.TILE;
    const broken = [];
    const c0 = Math.floor((x - radius) / T), c1 = Math.floor((x + radius) / T);
    const r0 = Math.floor((y - radius) / T), r1 = Math.floor((y + radius) / T);
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        if (this.tile(c, r) !== '#') continue;
        const cx = c * T + T / 2, cy = r * T + T / 2;
        if (Math.hypot(cx - x, cy - y) <= radius + T * 0.35) {
          this.tiles[r][c] = '.';
          broken.push({ x: cx, y: cy });
        }
      }
    }
    if (broken.length) this.version++;
    return broken;
  }

  // Mueve un círculo y lo saca de los bloques sólidos (desliza por las paredes).
  moveCircle(e, dx, dy) {
    const T = PB.TILE;
    e.x += dx;
    e.y += dy;
    for (let iter = 0; iter < 3; iter++) {
      let pushed = false;
      const c0 = Math.floor((e.x - e.r) / T), c1 = Math.floor((e.x + e.r) / T);
      const r0 = Math.floor((e.y - e.r) / T), r1 = Math.floor((e.y + e.r) / T);
      for (let r = r0; r <= r1; r++) {
        for (let c = c0; c <= c1; c++) {
          if (!this.solidAt(c, r)) continue;
          const rx = c * T, ry = r * T;
          const px = Math.max(rx, Math.min(e.x, rx + T));
          const py = Math.max(ry, Math.min(e.y, ry + T));
          let vx = e.x - px, vy = e.y - py;
          let d = Math.hypot(vx, vy);
          if (d >= e.r) continue;
          if (d < 0.0001) {
            // centro dentro del bloque: salir por el lado más cercano
            const opts = [[e.x - rx, -1, 0], [rx + T - e.x, 1, 0], [e.y - ry, 0, -1], [ry + T - e.y, 0, 1]];
            opts.sort((a, b) => a[0] - b[0]);
            e.x += opts[0][1] * (opts[0][0] + e.r);
            e.y += opts[0][2] * (opts[0][0] + e.r);
          } else {
            const k = (e.r - d) / d;
            e.x += vx * k;
            e.y += vy * k;
          }
          pushed = true;
        }
      }
      if (!pushed) break;
    }
  }

  // ¿Puede un disparo ir en línea recta de A a B?
  los(x1, y1, x2, y2) {
    const d = Math.hypot(x2 - x1, y2 - y1);
    const steps = Math.ceil(d / 14);
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      if (this.shotBlockedAt(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t)) return false;
    }
    return true;
  }

  // ¿Puede un círculo de radio r caminar en línea recta de A a B?
  walkable(x1, y1, x2, y2, r) {
    const T = PB.TILE;
    const d = Math.hypot(x2 - x1, y2 - y1);
    const steps = Math.ceil(d / 16);
    for (let i = 0; i <= steps; i++) {
      const t = steps ? i / steps : 0;
      const x = x1 + (x2 - x1) * t, y = y1 + (y2 - y1) * t;
      for (const [ox, oy] of [[-r, -r], [r, -r], [-r, r], [r, r]]) {
        if (this.solidAt(Math.floor((x + ox) / T), Math.floor((y + oy) / T))) return false;
      }
    }
    return true;
  }

  // A* en la cuadrícula. Devuelve una lista de puntos del mundo (sin el inicio).
  findPath(sx, sy, tx, ty) {
    const T = PB.TILE, W = this.w, H = this.h;
    const sc = Math.floor(sx / T), sr = Math.floor(sy / T);
    let tc = Math.floor(tx / T), tr = Math.floor(ty / T);
    if (this.solidAt(tc, tr)) {
      // objetivo dentro de un muro: buscar la casilla libre más cercana
      let best = null, bd = Infinity;
      for (let r = tr - 2; r <= tr + 2; r++) for (let c = tc - 2; c <= tc + 2; c++) {
        if (!this.solidAt(c, r)) {
          const d = Math.abs(c - tc) + Math.abs(r - tr);
          if (d < bd) { bd = d; best = [c, r]; }
        }
      }
      if (!best) return [];
      [tc, tr] = best;
    }
    const key = (c, r) => r * W + c;
    const g = new Map([[key(sc, sr), 0]]);
    const came = new Map();
    const open = [[0, sc, sr]];
    const closed = new Set();
    const hfn = (c, r) => {
      const dx = Math.abs(c - tc), dy = Math.abs(r - tr);
      return dx + dy + (Math.SQRT2 - 2) * Math.min(dx, dy);
    };
    let found = false, guard = 0;
    while (open.length && guard++ < 4000) {
      let bi = 0;
      for (let i = 1; i < open.length; i++) if (open[i][0] < open[bi][0]) bi = i;
      const [, c, r] = open.splice(bi, 1)[0];
      const k = key(c, r);
      if (closed.has(k)) continue;
      closed.add(k);
      if (c === tc && r === tr) { found = true; break; }
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        if (!dc && !dr) continue;
        const nc = c + dc, nr = r + dr;
        if (nc < 0 || nr < 0 || nc >= W || nr >= H || this.solidAt(nc, nr)) continue;
        if (dc && dr && (this.solidAt(c + dc, r) || this.solidAt(c, r + dr))) continue;
        const nk = key(nc, nr);
        const ng = g.get(k) + (dc && dr ? Math.SQRT2 : 1);
        if (ng < (g.has(nk) ? g.get(nk) : Infinity)) {
          g.set(nk, ng);
          came.set(nk, k);
          open.push([ng + hfn(nc, nr), nc, nr]);
        }
      }
    }
    if (!found) return [];
    const path = [];
    let k = key(tc, tr);
    while (k !== key(sc, sr)) {
      const c = k % W, r = Math.floor(k / W);
      path.push({ x: c * T + T / 2, y: r * T + T / 2 });
      k = came.get(k);
      if (k === undefined) break;
    }
    path.reverse();
    if (path.length && !this.solidAt(Math.floor(tx / T), Math.floor(ty / T))) path[path.length - 1] = { x: tx, y: ty };
    return path;
  }
};
