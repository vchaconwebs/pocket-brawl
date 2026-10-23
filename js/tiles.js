/* Pixel art del mapa, pintado en código a resolución de arte (16 px por casilla)
 * y dibujado ×4 sin suavizado, para que comparta tamaño de píxel con los sprites.
 * Técnica (lienzo de píxeles, hash, contorno, autotiling de orilla) adaptada de
 * PokéSurvivor (js/world/tiles.js), PolyForm Noncommercial 1.0.0.
 * Required Notice: Copyright 2026 JPTER78 (https://github.com/JPTER78/pokesurvivor)
 */
PB.Tiles = (() => {
  const A = 16; // píxeles de arte por casilla
  const PX = PB.TILE / A; // = 4

  // Paleta de "ruta" Pokémon
  const C = {
    grass: ['#78c85a', '#70c052', '#80cf62'],
    grassSpeck: '#58a444',
    grassLight: '#a4de7e',
    flowers: ['#f85c5c', '#f8d038', '#ffffff', '#f892c8'],
    path: ['#e2c48a', '#dabc82', '#e8cc94'],
    pathSpeck: '#c4a26a',
    pathLight: '#f2dcaa',
    pathEdge: '#a8864e',
    liq: '#4a92e8',
    liqDeep: '#3a7ad2',
    liqLight: '#7ab8f6',
    foam: '#dcf2ff',
    shore: '#4c9838',
    tall: ['#1d5c2a', '#2c8238', '#3ea546', '#64c45c', '#96de76'],
    rock: ['#3c424e', '#5c6672', '#7c8894', '#9ca8b4', '#c4ced8'],
    leaf: ['#123c22', '#1f6a32', '#2f8a3e', '#48a850', '#72c860'],
    trunk: ['#4a2e1a', '#6a4428', '#8a5a34'],
    dark: '#2a6a34',
  };

  // Temas: cambian el suelo, los árboles, las rocas y la hierba alta de un mapa
  const THEMES = {
    otono: {
      grass: ['#b8b45a', '#aeaa52', '#c4bc62'], grassSpeck: '#8a8a3c', grassLight: '#e0d07e',
      flowers: ['#f0a030', '#e8642a', '#f8d038', '#ffffff'], shore: '#8a8a3c',
      leaf: ['#4a1c0c', '#8a3010', '#c4561a', '#e8862a', '#f6b84a'],
      tall: { o: '#5a3a10', d: '#8a5a1c', m: '#b07a28', l: '#d09c3c', w: '#ecc260', bg: '#8a5a1c' },
      outside: ['#7a6a2c', '#6e5f26', '#5e5020'],
    },
    nieve: {
      grass: ['#e6eef8', '#dbe6f2', '#f0f6fc'], grassSpeck: '#b4c6dc', grassLight: '#ffffff',
      flowers: ['#9ad4ff', '#ffffff', '#c8e0ff', '#f892c8'], shore: '#b4c6dc',
      path: ['#c8b89a', '#bfae8e', '#d2c4a6'], pathSpeck: '#a8967a', pathLight: '#e2d8c4', pathEdge: '#8c7a5e',
      rock: ['#2e3a52', '#4c5e7e', '#7890b2', '#aec4e0', '#eef6ff'],
      leaf: ['#0c3024', '#165040', '#1f6a52', '#3c8a6c', '#ffffff'], pine: true,
      tall: { o: '#2e4a5a', d: '#46707e', m: '#6c98a6', l: '#a6ccd8', w: '#eef8ff', bg: '#46707e' },
      outside: ['#c4d4e4', '#b4c6da', '#a2b6cc'],
    },
    arena: {
      grass: ['#e6cc8a', '#dec282', '#eed694'], grassSpeck: '#c4a468', grassLight: '#f6e6b4',
      flowers: ['#f85c5c', '#f8d038', '#ffffff', '#f0a030'], shore: '#c4a468',
      path: ['#c89a5c', '#be9054', '#d2a666'], pathSpeck: '#a87a40', pathLight: '#e0b87c', pathEdge: '#8a6230',
      rock: ['#5a3418', '#8a5430', '#b07a48', '#d09c64', '#eec48a'],
      cactus: true,
      tall: { o: '#5a4a1c', d: '#7a6a28', m: '#9a8a38', l: '#c0b050', w: '#e0d078', bg: '#7a6a28' },
      outside: ['#d2b070', '#c8a666', '#b8965a'],
    },
    halloween: {
      grass: ['#3a3450', '#36304a', '#403a58'], grassSpeck: '#2a2440', grassLight: '#5a5078',
      flowers: ['#f8a030', '#ffd060', '#f86a20', '#c890ff'], shore: '#2a2440',
      path: ['#5a4a5a', '#524252', '#62526a'], pathSpeck: '#3e323e', pathLight: '#74647c', pathEdge: '#3a2e3e',
      liq: '#3e7a52', liqDeep: '#2e5e40', liqLight: '#6aae7e', foam: '#bfe8c4',
      spooky: true,
      tall: { o: '#1a1028', d: '#2e1e44', m: '#46306a', l: '#6a4a94', w: '#9a7ac4', bg: '#2e1e44' },
      outside: ['#1e1a2c', '#1a1626', '#16121f'],
    },
  };
  let K = C;
  const pal = (theme) => (THEMES[theme] ? Object.assign({}, C, THEMES[theme]) : C);

  // Hash determinista 2D -> [0, 1)
  const H = (x, y, s = 0) => {
    let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(s | 0, 2246822519);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };

  // Lienzo de píxeles
  function Pix(w, h) {
    const cv = document.createElement('canvas');
    cv.width = w;
    cv.height = h;
    const c = cv.getContext('2d');
    const img = c.createImageData(w, h);
    const d = img.data;
    const cache = {};
    const rgb = (hex) => cache[hex] || (cache[hex] = [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)]);
    return {
      w, h, cv,
      set(x, y, hex) {
        x |= 0; y |= 0;
        if (x < 0 || y < 0 || x >= w || y >= h) return;
        const [r, g, b] = rgb(hex);
        const i = (y * w + x) * 4;
        d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 255;
      },
      has(x, y) { return x >= 0 && y >= 0 && x < w && y < h && d[(y * w + x) * 4 + 3] > 0; },
      done() { c.putImageData(img, 0, 0); return cv; },
    };
  }

  // Contorno de 1 px alrededor de lo opaco
  function outline(P, col) {
    const marks = [];
    for (let y = 0; y < P.h; y++) for (let x = 0; x < P.w; x++) {
      if (P.has(x, y)) continue;
      if (P.has(x + 1, y) || P.has(x - 1, y) || P.has(x, y + 1) || P.has(x, y - 1)) marks.push([x, y]);
    }
    for (const [x, y] of marks) P.set(x, y, col);
  }

  // ------------------------------------------------------------ suelo
  function paintGrass(P, ox, oy, tx, ty, plain) {
    for (let y = 0; y < A; y++) for (let x = 0; x < A; x++) {
      const gx = tx * A + x, gy = ty * A + y;
      const band = H(gx >> 3, gy >> 3, 11) * 0.7 + H(gx, gy, 12) * 0.5;
      let col = K.grass[Math.min(2, Math.floor((band * 3) / 1.2))];
      const r = H(gx, gy, 13);
      if (r < 0.03) col = K.grassSpeck;
      else if (r > 0.988) col = K.grassLight;
      P.set(ox + x, oy + y, col);
    }
    if (plain) return;
    const d = H(tx, ty, 14);
    const dx = ox + 3 + Math.floor(H(tx, ty, 15) * 10), dy = oy + 4 + Math.floor(H(tx, ty, 16) * 9);
    if (d < 0.22) { // matojo
      P.set(dx, dy, K.grassLight); P.set(dx - 1, dy - 1, K.grassLight); P.set(dx + 1, dy - 1, K.grassLight);
      P.set(dx, dy - 2, K.grassLight); P.set(dx, dy + 1, K.grassSpeck);
    } else if (d < 0.36) { // flor
      const fc = K.flowers[Math.floor(H(tx, ty, 17) * K.flowers.length)];
      P.set(dx, dy - 1, fc); P.set(dx - 1, dy, fc); P.set(dx + 1, dy, fc); P.set(dx, dy + 1, fc);
      P.set(dx, dy, '#f8e070');
      if (H(tx, ty, 18) < 0.5) { // segunda flor
        const ex = dx + 4 > ox + 14 ? dx - 5 : dx + 4, ey = dy + 3 > oy + 14 ? dy - 4 : dy + 3;
        P.set(ex, ey - 1, fc); P.set(ex - 1, ey, fc); P.set(ex + 1, ey, fc); P.set(ex, ey + 1, fc); P.set(ex, ey, '#f8e070');
      }
    }
  }

  // Velas (Halloween): tres velas con su llama
  // (con la vista girada del equipo rojo se pintan al revés para que se vean de pie)
  let FLIP = false;
  function paintCandles(P, ox, oy, tx, ty) {
    for (let k = 0; k < 3; k++) {
      const x = ox + 3 + Math.floor(H(tx, ty, 200 + k) * 10), y = oy + 6 + Math.floor(H(tx, ty, 210 + k) * 7);
      const h = 3 + Math.floor(H(tx, ty, 220 + k) * 3);
      const set = FLIP ? (px, py, c) => P.set(2 * x + 1 - px, 2 * y - py, c) : (px, py, c) => P.set(px, py, c);
      for (let i = 0; i < h; i++) { set(x, y - i, '#efe6d2'); set(x + 1, y - i, '#cfc2a8'); }
      set(x, y - h, '#ffd060'); set(x + 1, y - h, '#f8a030'); set(x, y - h - 1, '#fff2a0');
      set(x - 1, y + 1, '#1e1a2c'); set(x + 2, y + 1, '#1e1a2c');
    }
  }

  // Macizo de flores (solo decoración, se puede pisar)
  function paintFlowers(P, ox, oy, tx, ty) {
    if (K.spooky) return paintCandles(P, ox, oy, tx, ty);
    for (let k = 0; k < 7; k++) {
      const dx = ox + 2 + Math.floor(H(tx, ty, 120 + k) * 12), dy = oy + 2 + Math.floor(H(tx, ty, 140 + k) * 12);
      const fc = K.flowers[Math.floor(H(tx, ty, 160 + k) * K.flowers.length)];
      P.set(dx, dy - 1, fc); P.set(dx - 1, dy, fc); P.set(dx + 1, dy, fc); P.set(dx, dy + 1, fc);
      P.set(dx, dy, '#f8e070');
      P.set(dx + 1, dy + 2, K.grassSpeck); P.set(dx - 1, dy + 2, K.grassSpeck);
    }
  }

  function paintPath(P, ox, oy, tx, ty, at) {
    const isP = (x, y) => at(x, y) === 'P';
    const n = isP(tx, ty - 1), s = isP(tx, ty + 1), w = isP(tx - 1, ty), e = isP(tx + 1, ty);
    for (let y = 0; y < A; y++) for (let x = 0; x < A; x++) {
      const gx = tx * A + x, gy = ty * A + y;
      // borde irregular: la hierba invade un poco
      const wob = Math.floor(H(gx >> 1, gy >> 1, 41) * 2);
      const dn = n ? 99 : y - 1 - wob, ds = s ? 99 : A - 2 - y - wob, dw = w ? 99 : x - 1 - wob, de = e ? 99 : A - 2 - x - wob;
      let d = Math.min(dn, ds, dw, de);
      if (d < 0) continue;
      let col = K.path[Math.floor(H(gx >> 2, gy >> 2, 42) * 2.2 + H(gx, gy, 43) * 0.8) % 3];
      const r = H(gx, gy, 44);
      if (r < 0.05) col = K.pathSpeck;
      else if (r > 0.97) col = K.pathLight;
      if (d < 1) col = K.pathEdge;
      P.set(ox + x, oy + y, col);
    }
  }

  function paintWater(P, ox, oy, tx, ty, at) {
    const L = (x, y) => at(x, y) === '~';
    const n = L(tx, ty - 1), s = L(tx, ty + 1), w = L(tx - 1, ty), e = L(tx + 1, ty);
    const nw = L(tx - 1, ty - 1), ne = L(tx + 1, ty - 1), sw = L(tx - 1, ty + 1), se = L(tx + 1, ty + 1);
    const BIG = 99;
    for (let y = 0; y < A; y++) for (let x = 0; x < A; x++) {
      if (!n && !w && x + y < 3) continue;
      if (!n && !e && A - 1 - x + y < 3) continue;
      if (!s && !w && x + (A - 1 - y) < 3) continue;
      if (!s && !e && A - 1 - x + (A - 1 - y) < 3) continue;
      let d = Math.min(n ? BIG : y, s ? BIG : A - 1 - y, w ? BIG : x, e ? BIG : A - 1 - x);
      if (n && w && !nw) d = Math.min(d, Math.hypot(x, y) - 0.5);
      if (n && e && !ne) d = Math.min(d, Math.hypot(A - 1 - x, y) - 0.5);
      if (s && w && !sw) d = Math.min(d, Math.hypot(x, A - 1 - y) - 0.5);
      if (s && e && !se) d = Math.min(d, Math.hypot(A - 1 - x, A - 1 - y) - 0.5);
      const gx = tx * A + x, gy = ty * A + y;
      const r = H(gx, gy, 31);
      let col;
      if (d < 1) col = K.shore;
      else if (d < 2) col = K.foam;
      else if (d < 4) col = K.liqLight;
      else if (d < 6) col = r < 0.5 ? K.liq : K.liqLight;
      else col = d < 8 && r < 0.5 ? K.liq : K.liqDeep;
      if (d >= 3 && H(gx >> 2, gy, 33) < 0.05 && (gx & 3) !== 3) col = K.liqLight;
      P.set(ox + x, oy + y, col);
    }
    // nenúfar
    if (H(tx, ty, 35) < 0.3) {
      const cx = ox + 5 + Math.floor(H(tx, ty, 36) * 6), cy = oy + 5 + Math.floor(H(tx, ty, 37) * 6);
      for (let y = -2; y <= 2; y++) for (let x = -3; x <= 3; x++) {
        if (x * x / 9 + y * y / 4 <= 1 && !(x > 0 && y === 0)) P.set(cx + x, cy + y, y < 0 ? '#5cb84a' : '#3e9a3a');
      }
      if (H(tx, ty, 38) < 0.5) { P.set(cx - 1, cy - 1, '#f892c8'); P.set(cx, cy - 1, '#ffd0e8'); }
    }
  }

  // Plataforma de Pokéballs del centro: una Pokéball gigante incrustada en un anillo de piedra
  function paintPad(P, cx, cy) {
    const R = 12, ROCK = C.rock;
    for (let y = -R - 3; y <= R + 3; y++) for (let x = -R - 3; x <= R + 3; x++) {
      const px = cx + x - 0.5, py = cy + y - 0.5;
      const d = Math.hypot(x + 0.5, y + 0.5);
      if (d > R + 3) continue;
      let col;
      if (d > R + 2.2) col = ROCK[0];
      else if (d > R) { // anillo de piedra con losas
        const a = Math.atan2(y, x);
        const seam = Math.abs(((a / (Math.PI * 2)) * 12 + 12) % 1 - 0.5) > 0.44;
        col = seam ? ROCK[1] : y < 0 ? ROCK[4] : ROCK[3];
      } else if (d > R - 1) col = '#1b1418';
      else if (Math.abs(y + 0.5) <= 1.2) col = '#1b1418'; // banda
      else if (d < 3.2) col = d < 2.2 ? '#f6f4f0' : '#1b1418'; // botón
      else if (d < 4.4) col = '#1b1418';
      else {
        const lit = (-(x + 0.5) * 0.5 - (y + 0.5) * 0.85) / R;
        if (y < 0) col = lit > 0.45 ? '#ff7a58' : lit < -0.1 ? '#a8241a' : '#e2382a';
        else col = lit < -0.3 ? '#a8a4ae' : lit < 0.1 ? '#cfcbd4' : '#f2eff4';
      }
      P.set(px, py, col);
    }
    // brillo
    P.set(cx - 6, cy - 7, '#ffd0c0'); P.set(cx - 5, cy - 7, '#ffd0c0'); P.set(cx - 7, cy - 6, '#ffd0c0');
  }

  // Pinta el suelo de todo el mapa (a resolución de arte)
  function floor(world, flip) {
    K = pal(world.theme);
    FLIP = !!flip;
    const at = (c, r) => world.tile(c, r);
    const P = Pix(world.w * A, world.h * A);
    for (let r = 0; r < world.h; r++) for (let c = 0; c < world.w; c++) {
      const ox = c * A, oy = r * A, t = at(c, r);
      paintGrass(P, ox, oy, c, r, world.goals.red.length > 0);
      if (t === 'P') paintPath(P, ox, oy, c, r, at);
      else if (t === 'f') paintFlowers(P, ox, oy, c, r);
      else if (t === '~') paintWater(P, ox, oy, c, r, at);
    }
    // campo de Voltorbol: césped a franjas, línea de gol, área y semicírculo
    if (world.goals.red.length) {
      const W2 = world.w * A, H2 = world.h * A;
      const LINE = '#f2f6ee';
      // franjas de césped (cada 2 casillas), sin pisar agua ni caminos
      for (let y = 0; y < H2; y++) for (let x = 0; x < W2; x++) {
        const t2 = at(Math.floor(x / A), Math.floor(y / A));
        if (t2 === '~' || t2 === 'P') continue;
        if (Math.floor(y / (A * 2)) % 2 === 0) {
          const gx = x, gy = y;
          const r = H(gx, gy, 91);
          P.set(x, y, K === C ? (r < 0.5 ? '#86d468' : r < 0.95 ? '#80ce62' : '#9ae07a') : r < 0.5 ? K.grassLight : r < 0.95 ? K.grass[2] : K.grassLight);
        }
      }
      const hline = (x0, x1, y) => { for (let x = Math.max(0, x0); x <= Math.min(W2 - 1, x1); x++) P.set(x, y, LINE); };
      const vline = (x, y0, y1) => { for (let y = Math.max(0, y0); y <= Math.min(H2 - 1, y1); y++) P.set(x, y, LINE); };
      for (const team of ['red', 'blue']) {
        const g = world.goals[team];
        const c0 = Math.min(...g.map((q) => q.c)), c1 = Math.max(...g.map((q) => q.c));
        const r0 = Math.min(...g.map((q) => q.r)), r1 = Math.max(...g.map((q) => q.r));
        const top = r0 < world.h / 2;
        const mouth = top ? (r1 + 1) * A : r0 * A - 1;
        hline(0, W2, mouth); // línea de gol
        const bx0 = (c0 - 2) * A, bx1 = (c1 + 3) * A - 1;
        const depth = 3 * A;
        const by = top ? mouth + depth : mouth - depth;
        vline(bx0, Math.min(mouth, by), Math.max(mouth, by));
        vline(bx1, Math.min(mouth, by), Math.max(mouth, by));
        hline(bx0, bx1, by);
        // semicírculo fuera del área
        const cx = (bx0 + bx1) / 2, rad = A * 1.5;
        for (let a = 0; a <= 180; a += 0.5) {
          const rr = (a * Math.PI) / 180;
          const x = cx + Math.cos(rr) * rad;
          const y = by + (top ? 1 : -1) * Math.sin(rr) * rad;
          P.set(Math.round(x), Math.round(y), LINE);
        }
      }
    }
    // círculo central del campo (Voltorbol) y líneas
    if (world.ballSpot) {
      const cx = (world.ballSpot.x / PB.TILE) * A, cy = (world.ballSpot.y / PB.TILE) * A;
      for (let a = 0; a < 360; a += 1) {
        const r = 30;
        P.set(cx + Math.cos((a * Math.PI) / 180) * r, cy + Math.sin((a * Math.PI) / 180) * r, '#eef6e8');
      }
      for (let x = 0; x < world.w * A; x++) if (x % 6 < 4) P.set(x, Math.floor(cy), '#eef6e8');
    }
    if (world.mine && world.hasMine) paintPad(P, (world.mine.x / PB.TILE) * A, (world.mine.y / PB.TILE) * A);
    return P.done();
  }

  // Bosque de fuera del mapa
  function outsideFloor(tx, ty, theme) {
    const key = 'out' + (theme || '') + ((tx & 3) + (ty & 3) * 4);
    if (cache.has(key)) return cache.get(key);
    const P = Pix(A, A);
    const O = (THEMES[theme] || {}).outside || ['#3d8a40', '#367e3a', '#2c6c32'];
    for (let y = 0; y < A; y++) for (let x = 0; x < A; x++) {
      const r = H(x + tx * A, y + ty * A, 51);
      P.set(x, y, r < 0.5 ? O[0] : r < 0.9 ? O[1] : O[2]);
    }
    const cv = P.done();
    cache.set(key, cv);
    return cv;
  }

  // ------------------------------------------------------------ sprites
  const cache = new Map();
  function cached(key, fn) {
    if (!cache.has(key)) cache.set(key, fn());
    return cache.get(key);
  }

  // Roca rompible (16 x 20): ocupa la casilla y sobresale 4 px por arriba
  function rock(v, theme) {
    if (pal(theme).spooky) return tomb(v);
    return cached('rock' + v + (theme || ''), () => {
      const P = Pix(A, 20);
      const R = pal(theme).rock;
      const rad = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => 6.2 + H(i, v, 61) * 1.4);
      const cx = 7.5, cy = 11;
      for (let y = 0; y < 20; y++) for (let x = 0; x < A; x++) {
        const dx = x - cx, dy = (y - cy) * 1.05;
        const a = ((Math.atan2(dy, dx) + Math.PI) / (2 * Math.PI)) * 8;
        const i = Math.floor(a) % 8, t = a - Math.floor(a);
        const Rr = rad[i] * (1 - t) + rad[(i + 1) % 8] * t + 0.6;
        const d = Math.hypot(dx, dy);
        if (d > Rr || y > 18) continue;
        const lit = (-dx * 0.5 - dy * 0.85) / Rr;
        let col = lit > 0.55 ? R[4] : lit > 0.15 ? R[3] : lit > -0.35 ? R[2] : R[1];
        if (y >= 15) col = y >= 17 ? R[1] : R[2] === col ? R[1] : col; // base en sombra
        if (H(x, y, 62 + v) < 0.06) col = R[1];
        P.set(x, y, col);
      }
      // grietas (se puede romper, como con Golpe Roca)
      const crack = [[6, 7], [7, 8], [7, 9], [8, 10], [9, 10], [8, 11], [8, 12]];
      for (const [x, y] of crack) P.set(x + (v % 2), y, R[0]);
      if (v % 3 === 1) for (const [x, y] of [[4, 12], [5, 13], [4, 14]]) P.set(x, y, R[1]);
      outline(P, R[0]);
      return P.done();
    });
  }

  // Árbol de ruta (20 x 32)
  function tree(v, theme) {
    const T2 = pal(theme);
    if (T2.cactus) return cactus(v);
    if (T2.spooky) return deadTree(v);
    if (T2.pine) return pine(v);
    return cached('tree' + v + (theme || ''), () => {
      const P = Pix(20, 32);
      const Lf = T2.leaf, Tr = C.trunk;
      for (let y = 22; y < 31; y++) for (let x = 8; x < 12; x++) P.set(x, y, Tr[x === 8 ? 0 : x === 11 ? 1 : 2]);
      P.set(7, 30, Tr[0]); P.set(12, 30, Tr[0]);
      const blobs = [[10, 18, 7], [5, 15, 4.5], [15, 15, 4.5], [10, 10, 6.5], [7, 6, 4], [13, 6, 4], [10, 3, 3]];
      for (const [bx, by, br] of blobs) {
        for (let y = Math.floor(by - br); y <= Math.ceil(by + br); y++) for (let x = Math.floor(bx - br); x <= Math.ceil(bx + br); x++) {
          if (Math.hypot(x - bx, y - by) > br) continue;
          const lit = ((x - bx) * -0.6 + (y - by) * -0.8) / br;
          let idx = lit > 0.5 ? 4 : lit > 0.1 ? 3 : lit > -0.4 ? 2 : 1;
          if (H(x, y, 71 + v) < 0.12 && idx > 1) idx--;
          P.set(x, y, Lf[idx]);
        }
      }
      // frutos (bayas)
      if (v % 2 === 0) for (const [x, y] of [[6, 12], [13, 9], [11, 17]]) { P.set(x, y, '#f85c5c'); P.set(x + 1, y, '#c83838'); }
      outline(P, Lf[0]);
      return P.done();
    });
  }

  // Lápida (16 x 20)
  function tomb(v) {
    return cached('tomb' + v, () => {
      const P = Pix(A, 20);
      const G = ['#2a2a38', '#4a4a5c', '#6e6e84', '#9494aa', '#bcbcd0'];
      const cross = v % 3 === 2;
      if (cross) {
        for (let y = 2; y < 18; y++) for (let x = 6; x < 10; x++) P.set(x, y, x === 6 ? G[3] : x === 9 ? G[1] : G[2]);
        for (let y = 5; y < 9; y++) for (let x = 2; x < 14; x++) P.set(x, y, y === 5 ? G[3] : y === 8 ? G[1] : G[2]);
      } else {
        for (let y = 3; y < 18; y++) for (let x = 3; x < 13; x++) {
          const dx = x - 7.5, top = y < 7 ? Math.hypot(dx, (y - 7) * 1.3) > 5 : false;
          if (top) continue;
          P.set(x, y, x <= 4 ? G[3] : x >= 11 ? G[1] : G[2]);
        }
        // inscripción
        for (const y of [8, 10, 12]) for (let x = 5; x < 11; x++) if ((x + y + v) % 4) P.set(x, y, G[1]);
        if (v % 2) { P.set(4, 6, '#3e7a52'); P.set(5, 5, '#3e7a52'); P.set(11, 14, '#3e7a52'); }
      }
      // tierra removida
      for (let x = 1; x < 15; x++) { P.set(x, 18, '#3a2e3e'); P.set(x, 19, '#2a2030'); }
      outline(P, G[0]);
      return P.done();
    });
  }

  // Árbol seco de Halloween (20 x 32)
  function deadTree(v) {
    return cached('dead' + v, () => {
      const P = Pix(20, 32);
      const B = ['#1a1218', '#2e2026', '#46323a', '#5e4650'];
      const line = (x0, y0, x1, y1, w) => {
        const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * 2;
        for (let i = 0; i <= n; i++) {
          const x = x0 + ((x1 - x0) * i) / n, y = y0 + ((y1 - y0) * i) / n;
          for (let k = 0; k < w; k++) P.set(Math.round(x) + k, Math.round(y), k === 0 ? B[3] : B[2]);
        }
      };
      line(9, 31, 9, 12, 3);
      line(9, 20, 3, 12, 2); line(3, 12, 1, 7, 1); line(3, 12, 5, 6, 1);
      line(11, 17, 17, 9, 2); line(17, 9, 18, 4, 1); line(15, 11, 13, 5, 1);
      line(10, 12, 9, 3, 2); line(9, 6, 6, 2, 1);
      if (v % 2) for (const [x, y] of [[2, 6], [18, 3]]) P.set(x, y, '#c890ff');
      for (let x = 6; x < 14; x++) P.set(x, 31, B[1]);
      outline(P, B[0]);
      return P.done();
    });
  }

  // Calabaza de Halloween (16 x 18): tapa los disparos y se rompe con las súper
  function pumpkin(v) {
    return cached('pumpkin' + v, () => {
      const P = Pix(A, 18);
      const O = ['#7a2a06', '#b84a0e', '#e2701c', '#f89a3a', '#ffc070'];
      for (let y = 5; y < 17; y++) for (let x = 1; x < 15; x++) {
        const dx = (x - 7.5) / 7, dy = (y - 11) / 6;
        if (dx * dx + dy * dy > 1) continue;
        const rib = Math.abs(((x - 7.5) % 4.5 + 4.5) % 4.5 - 2.25) < 0.6;
        let col = dx < -0.4 ? O[3] : dx < 0.3 ? O[2] : O[1];
        if (rib) col = O[1];
        if (dy < -0.7) col = O[3];
        P.set(x, y, col);
      }
      // tallo
      for (let y = 2; y < 6; y++) { P.set(7, y, '#3e6a1e'); P.set(8, y, '#2a4a14'); }
      P.set(9, 2, '#3e6a1e');
      // cara iluminada
      const glow = '#ffe060', inner = '#ff9a20';
      for (const [x, y] of [[4, 9], [5, 9], [5, 8], [10, 9], [11, 9], [10, 8]]) P.set(x, y, glow);
      for (let x = 4; x < 12; x++) P.set(x, 13, (x + v) % 2 ? glow : inner);
      for (const x of [5, 7, 9]) P.set(x, 12, glow);
      outline(P, O[0]);
      return P.done();
    });
  }

  // Pino nevado (20 x 32)
  function pine(v) {
    return cached('pine' + v, () => {
      const P = Pix(20, 32);
      const G = ['#0c3024', '#165040', '#1f6a52', '#3c8a6c'], Sn = ['#c4d8ee', '#eef6ff', '#ffffff'], Tr = C.trunk;
      for (let y = 26; y < 31; y++) for (let x = 8; x < 12; x++) P.set(x, y, Tr[x === 8 ? 0 : x === 11 ? 1 : 2]);
      // tres pisos de ramas, cada uno más ancho, con nieve encima
      [[4, 9, 5], [11, 17, 7], [18, 26, 9]].forEach(([y0, y1, half], k) => {
        for (let y = y0; y <= y1; y++) {
          const w = Math.round(((y - y0 + 2) / (y1 - y0 + 2)) * half);
          for (let x = 10 - w; x <= 9 + w; x++) {
            const lit = (10 - x) / (half + 1);
            let col = lit > 0.4 ? G[3] : lit > 0 ? G[2] : lit > -0.5 ? G[1] : G[0];
            if (y - y0 < 2 || (y === y1 && (x + v + k) % 3 === 0)) col = (x + y) % 3 ? Sn[1] : Sn[2];
            else if (H(x, y, 81 + v) < 0.08) col = Sn[0];
            P.set(x, y, col);
          }
        }
      });
      P.set(10, 2, Sn[2]); P.set(9, 3, Sn[1]); P.set(10, 3, Sn[2]); P.set(11, 3, Sn[1]);
      outline(P, G[0]);
      return P.done();
    });
  }

  // Cactus (20 x 32)
  function cactus(v) {
    return cached('cactus' + v, () => {
      const P = Pix(20, 32);
      const G = ['#1c4a24', '#2c6a30', '#3e8a3c', '#62b056', '#94d47a'];
      const col = (x, cx, w) => { const t = (x - cx) / w; return t < -0.5 ? G[3] : t < 0 ? G[2] : t < 0.5 ? G[2] : G[1]; };
      // tronco
      for (let y = 6; y < 31; y++) for (let x = 7; x < 13; x++) {
        if (y === 6 && (x === 7 || x === 12)) continue;
        P.set(x, y, x === 8 ? G[4] : col(x, 9.5, 3));
      }
      // brazos
      const armL = 12 + (v % 2) * 3, armR = 9 + ((v >> 1) % 2) * 4;
      for (let y = armL; y < armL + 4; y++) for (let x = 3; x < 7; x++) P.set(x, y, col(x, 4.5, 2));
      for (let y = armL - 6; y < armL; y++) for (let x = 3; x < 6; x++) P.set(x, y, x === 3 ? G[3] : G[2]);
      for (let y = armR; y < armR + 4; y++) for (let x = 13; x < 17; x++) P.set(x, y, col(x, 15, 2));
      for (let y = armR - 5; y < armR; y++) for (let x = 14; x < 17; x++) P.set(x, y, x === 14 ? G[3] : G[1]);
      // pinchos
      for (let y = 8; y < 30; y += 3) { P.set(7 + (y % 2), y, '#f0f0c8'); P.set(11 + (y % 2), y + 1, '#f0f0c8'); }
      if (v % 2 === 0) { P.set(9, 5, '#f85c9a'); P.set(10, 5, '#f85c9a'); P.set(9, 4, '#ff9ac4'); }
      // base de arena
      for (let x = 5; x < 15; x++) P.set(x, 31, '#c4a468');
      outline(P, G[0]);
      return P.done();
    });
  }

  // Valla de madera (16 x 16): se une con las de los lados. No deja pasar, pero se dispara por encima.
  function fence(left, right) {
    return cached('fence' + (left ? 1 : 0) + (right ? 1 : 0), () => {
      const P = Pix(A, A);
      const Wd = ['#4a2a12', '#6e4220', '#8e5a2e', '#b07640', '#cc945a'];
      const x0 = left ? 0 : 2, x1 = right ? 15 : 13;
      for (const ry of [6, 10]) for (let x = x0; x <= x1; x++) { P.set(x, ry, Wd[3]); P.set(x, ry + 1, Wd[1]); }
      for (const px of [2, 13]) for (let y = 3; y < 15; y++) {
        P.set(px, y, y === 3 ? Wd[4] : Wd[2]);
        P.set(px + 1, y, y === 3 ? Wd[3] : Wd[1]);
      }
      outline(P, Wd[0]);
      return P.done();
    });
  }

  // Barril (16 x 20): tapa los disparos y se rompe con las súper
  function barrel(v, theme) {
    if (pal(theme).spooky) return pumpkin(v);
    return cached('barrel' + v, () => {
      const P = Pix(A, 20);
      const Wd = ['#4a2a12', '#6e4220', '#8e5a2e', '#b07640', '#d29a5e'];
      const M = ['#3a3f4a', '#6a7280', '#a4acb8'];
      for (let y = 2; y < 19; y++) {
        const bulge = Math.round(Math.sin(((y - 2) / 16) * Math.PI) * 1.5);
        for (let x = 2 - bulge; x < 14 + bulge; x++) {
          const t = (x - 7.5) / (6 + bulge);
          let col = t < -0.55 ? Wd[4] : t < -0.1 ? Wd[3] : t < 0.45 ? Wd[2] : Wd[1];
          if (y === 5 || y === 15) col = t < -0.3 ? M[2] : M[1];
          if (y === 6 || y === 16) col = M[0];
          P.set(x, y, col);
        }
      }
      // tapa
      for (let x = 3; x < 13; x++) { P.set(x, 2, Wd[4]); P.set(x, 3, Wd[3]); }
      if (v % 2) for (const [x, y] of [[6, 10], [7, 11], [9, 9]]) P.set(x, y, Wd[1]);
      outline(P, Wd[0]);
      return P.done();
    });
  }

  // Hierba alta (16 x 22): sobresale 6 px por arriba. frame: 0/1 balanceo, 2 = sacudida
  // Matas puntiagudas (8 x 9) en filas solapadas, como la hierba alta de los juegos.
  const CLUMP = [
    '...w....',
    '..wl..w.',
    'w.lm.wl.',
    'lwmm.lm.',
    'lmmmwmmw',
    'mmmmlmml',
    'dmmmmmmm',
    'odmmmmmd',
    '.oddddo.',
  ];
  const TALL0 = { o: '#185226', d: '#23733a', m: '#379a46', l: '#58b955', w: '#8ad46e', bg: '#23733a' };
  function tallGrass(frame, theme) {
    const TALL = (THEMES[theme] && THEMES[theme].tall) || TALL0;
    return cached('tall' + frame + (theme || ''), () => {
      const W = A, Hh = 22;
      const P = Pix(W, Hh);
      for (let y = 5; y < Hh; y++) for (let x = 0; x < W; x++) P.set(x, y, TALL.bg);
      [0, 6, 12].forEach((ry, ri) => {
        for (let k = -1; k < 3; k++) {
          const bx = k * 8 + (ri % 2 ? 4 : 0);
          let sway = 0;
          if (frame === 1) sway = 1;
          if (frame === 2) sway = (k + ri) % 2 ? 1 : -1;
          CLUMP.forEach((row, y) => {
            for (let x = 0; x < row.length; x++) {
              const ch = row[x];
              if (ch === '.') continue;
              P.set(bx + x + (y < 3 ? sway : 0), ry + y, TALL[ch]);
            }
          });
        }
      });
      return P.done();
    });
  }

  // Caja de suministros (Niebla Tóxica): se rompe y suelta un Caramelo Raro.
  // 16 x 18: tapa vista desde arriba, cara frontal de tablas, esquinas de metal
  // y una etiqueta con el Caramelo Raro pintado.
  function crate(v) {
    return cached('crate' + v, () => {
      const P = Pix(A, 18);
      const Wd = ['#4a2a12', '#6e4220', '#8e5a2e', '#b07640', '#cc945a', '#e2b07a'];
      const M = ['#3a3f4a', '#6a7280', '#a4acb8', '#d4dae2'];
      // tapa (filas 1-5)
      for (let y = 1; y < 6; y++) for (let x = 1; x < 15; x++) {
        let col = (x % 4 === 0) ? Wd[3] : Wd[4];
        if (y === 1) col = Wd[5];
        if ((x * 7 + y * 3) % 11 === 0) col = Wd[3];
        P.set(x, y, col);
      }
      // cara frontal (filas 6-16): tablas horizontales
      for (let y = 6; y < 17; y++) for (let x = 1; x < 15; x++) {
        let col = Wd[2];
        if (y === 6) col = Wd[1];
        else if (y === 10 || y === 14) col = Wd[1];
        else if (y === 7 || y === 11 || y === 15) col = Wd[3];
        if ((x * 5 + y) % 9 === 0 && col === Wd[2]) col = Wd[1];
        P.set(x, y, col);
      }
      // esquinas y cantos de metal con remaches
      for (const x of [1, 2, 13, 14]) for (let y = 1; y < 17; y++) {
        const edge = x === 1 || x === 14;
        P.set(x, y, y === 6 ? M[0] : edge ? M[1] : M[2]);
      }
      for (const [x, y] of [[2, 3], [13, 3], [2, 9], [13, 9], [2, 14], [13, 14]]) P.set(x, y, M[3]);
      // etiqueta con el Caramelo Raro
      for (let y = 8; y < 15; y++) for (let x = 4; x < 12; x++) {
        const corner = (x === 4 || x === 11) && (y === 8 || y === 14);
        if (!corner) P.set(x, y, y === 14 ? '#c8c2b0' : '#f2ecd8');
      }
      const candy = [
        [5, 11, '#9ad4ff'], [6, 10, '#9ad4ff'], [6, 12, '#9ad4ff'],
        [7, 10, '#5a86ea'], [8, 10, '#5a86ea'], [7, 11, '#3a5cc8'], [8, 11, '#4c78e0'], [7, 12, '#2a48a8'], [8, 12, '#3a5cc8'],
        [9, 10, '#9ad4ff'], [9, 12, '#9ad4ff'], [10, 11, '#9ad4ff'], [7, 10, '#c8e0ff'],
      ];
      for (const [x, y, c] of candy) P.set(x, y, c);
      outline(P, Wd[0]);
      return P.done();
    });
  }

  // Caramelo Raro (18 x 18): caramelo lavanda en diagonal con un lazo de envoltorio
  // en cada punta, brillos blancos y contorno oscuro.
  function candy() {
    return cached('candy', () => {
      const S = 18, cc = (S - 1) / 2;
      const bodyA = 4.2, bodyB = 3.8, neck = 4.4, wrapEnd = 8.2, flare = 2.4;
      const C2 = { d: '#4652b8', m: '#7484e0', l: '#a2b2f4', w: '#e2e8ff' };
      const P = Pix(S, S);
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        const px = x - cc, py = y - cc;
        const u = (px - py) / Math.SQRT2, v = (px + py) / Math.SQRT2; // a lo largo / a lo ancho
        let ch = null;
        if ((u * u) / (bodyA * bodyA) + (v * v) / (bodyB * bodyB) <= 1) {
          const lit = (-px * 0.55 - py * 0.85) / bodyB;
          ch = lit > 0.6 ? 'w' : lit > 0.15 ? 'l' : lit > -0.45 ? 'm' : 'd';
        } else {
          const au = Math.abs(u);
          if (au >= neck && au <= wrapEnd) {
            const k = (au - neck) / (wrapEnd - neck);
            const half = 0.6 + k * flare;
            if (Math.abs(v) <= half && !(au > wrapEnd - 1 && Math.abs(v) < 0.6)) {
              ch = v < -half * 0.3 ? 'w' : v < half * 0.4 ? 'l' : 'm';
              if (k < 0.2) ch = 'd';
            }
          }
        }
        if (ch) P.set(x, y, C2[ch]);
      }
      // brillos
      P.set(7, 7, '#ffffff'); P.set(8, 6, '#ffffff'); P.set(10, 9, '#e2e8ff');
      outline(P, '#141632');
      return P.done();
    });
  }

  // Bandera de Territorio (22 x 36): mástil con pomo dorado, tela ondeando con una
  // Pokéball pintada y base de piedra. color: neutral | blue | red | contested
  const FLAG = {
    neutral: ['#f2f0ea', '#c4c0cc', '#ffffff', '#8e8a96'],
    blue: ['#3a7ad8', '#2456a8', '#7ab4fa', '#163a78'],
    red: ['#e2483a', '#a82e26', '#ff8c7a', '#701a16'],
    contested: ['#f8c030', '#c08a10', '#ffe488', '#7a5408'],
  };
  function flag(color, frame) {
    return cached('flag' + color + frame, () => {
      const P = Pix(22, 36);
      const F = FLAG[color] || FLAG.neutral;
      // tela: cada columna se desplaza para que ondee
      for (let x = 6; x < 21; x++) {
        const k = (x - 6) / 14;
        const off = Math.round(Math.sin(x * 0.55 + frame * 1.6) * 1.6 * k);
        for (let y = 4; y < 15; y++) {
          const yy = y + off;
          let col = F[0];
          if (y === 4) col = F[2];
          else if (y >= 13) col = F[1];
          else if (Math.sin(x * 0.55 + frame * 1.6 - 0.6) * k > 0.45) col = F[1]; // pliegue en sombra
          else if (Math.sin(x * 0.55 + frame * 1.6 + 0.8) * k > 0.6) col = F[2]; // pliegue con luz
          P.set(x, yy, col);
        }
        // Pokéball pintada en el centro de la tela
        if (x >= 10 && x <= 16) {
          for (let y = 6; y <= 12; y++) {
            const d = Math.hypot(x - 13, y - 9);
            if (d > 3.5) continue;
            let c = y < 9 ? (color === 'neutral' ? '#e8331c' : '#ffffff') : '#e8e4ee';
            if (y === 9) c = '#1b1418';
            if (x === 13 && y === 9) c = '#ffffff';
            P.set(x, y + off, c);
          }
        }
      }
      // mástil
      for (let y = 3; y < 33; y++) {
        P.set(4, y, '#e6e2ea');
        P.set(5, y, '#9c98a6');
      }
      // pomo dorado
      for (const [x, y, c] of [[4, 0, '#fff0a0'], [5, 0, '#f8d030'], [3, 1, '#f8d030'], [4, 1, '#fff6c0'], [5, 1, '#f8d030'], [6, 1, '#c89a10'], [4, 2, '#f8d030'], [5, 2, '#c89a10']]) P.set(x, y, c);
      // base de piedra
      for (let y = 31; y < 36; y++) for (let x = 1; x < 9; x++) {
        if ((y === 31 && (x === 1 || x === 8)) ) continue;
        P.set(x, y, y === 31 ? '#c4ced8' : y >= 34 ? '#5c6672' : '#9ca8b4');
      }
      outline(P, F[3] === '#8e8a96' ? '#3c424e' : '#1b1418');
      return P.done();
    });
  }

  function draw(ctx, cv, x, y) {
    ctx.drawImage(cv, Math.round(x), Math.round(y), cv.width * PX, cv.height * PX);
  }

  return { floor, outsideFloor, rock, tree, tallGrass, crate, candy, flag, fence, barrel, draw, H, A, PX };
})();
