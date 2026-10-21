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
      let col = C.grass[Math.min(2, Math.floor((band * 3) / 1.2))];
      const r = H(gx, gy, 13);
      if (r < 0.03) col = C.grassSpeck;
      else if (r > 0.988) col = C.grassLight;
      P.set(ox + x, oy + y, col);
    }
    if (plain) return;
    const d = H(tx, ty, 14);
    const dx = ox + 3 + Math.floor(H(tx, ty, 15) * 10), dy = oy + 4 + Math.floor(H(tx, ty, 16) * 9);
    if (d < 0.22) { // matojo
      P.set(dx, dy, C.grassLight); P.set(dx - 1, dy - 1, C.grassLight); P.set(dx + 1, dy - 1, C.grassLight);
      P.set(dx, dy - 2, C.grassLight); P.set(dx, dy + 1, C.grassSpeck);
    } else if (d < 0.36) { // flor
      const fc = C.flowers[Math.floor(H(tx, ty, 17) * C.flowers.length)];
      P.set(dx, dy - 1, fc); P.set(dx - 1, dy, fc); P.set(dx + 1, dy, fc); P.set(dx, dy + 1, fc);
      P.set(dx, dy, '#f8e070');
      if (H(tx, ty, 18) < 0.5) { // segunda flor
        const ex = dx + 4 > ox + 14 ? dx - 5 : dx + 4, ey = dy + 3 > oy + 14 ? dy - 4 : dy + 3;
        P.set(ex, ey - 1, fc); P.set(ex - 1, ey, fc); P.set(ex + 1, ey, fc); P.set(ex, ey + 1, fc); P.set(ex, ey, '#f8e070');
      }
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
      let col = C.path[Math.floor(H(gx >> 2, gy >> 2, 42) * 2.2 + H(gx, gy, 43) * 0.8) % 3];
      const r = H(gx, gy, 44);
      if (r < 0.05) col = C.pathSpeck;
      else if (r > 0.97) col = C.pathLight;
      if (d < 1) col = C.pathEdge;
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
      if (d < 1) col = C.shore;
      else if (d < 2) col = C.foam;
      else if (d < 4) col = C.liqLight;
      else if (d < 6) col = r < 0.5 ? C.liq : C.liqLight;
      else col = d < 8 && r < 0.5 ? C.liq : C.liqDeep;
      if (d >= 3 && H(gx >> 2, gy, 33) < 0.05 && (gx & 3) !== 3) col = C.liqLight;
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

  // Alfombra de la base de cada equipo
  function paintMat(P, ox, oy, col, dark) {
    for (let y = 1; y < A - 1; y++) for (let x = 1; x < A - 1; x++) {
      const edge = x === 1 || y === 1 || x === A - 2 || y === A - 2;
      P.set(ox + x, oy + y, edge ? dark : (x + y) % 4 === 0 ? dark : col);
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
  function floor(world) {
    const at = (c, r) => world.tile(c, r);
    const P = Pix(world.w * A, world.h * A);
    for (let r = 0; r < world.h; r++) for (let c = 0; c < world.w; c++) {
      const ox = c * A, oy = r * A, t = at(c, r);
      paintGrass(P, ox, oy, c, r, world.goals.red.length > 0);
      if (t === 'P') paintPath(P, ox, oy, c, r, at);
      else if (t === '~') paintWater(P, ox, oy, c, r, at);
    }
    for (const [list, col, dark] of [[world.spawns.blue, '#5a9cf0', '#3a6cc0'], [world.spawns.red, '#f06a5a', '#c0443a']]) {
      for (const s of list) paintMat(P, Math.floor(s.x / PB.TILE) * A, Math.floor(s.y / PB.TILE) * A, col, dark);
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
          P.set(x, y, r < 0.5 ? '#86d468' : r < 0.95 ? '#80ce62' : '#9ae07a');
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
  function outsideFloor(tx, ty) {
    const key = 'out' + ((tx & 3) + (ty & 3) * 4);
    if (cache.has(key)) return cache.get(key);
    const P = Pix(A, A);
    for (let y = 0; y < A; y++) for (let x = 0; x < A; x++) {
      const r = H(x + tx * A, y + ty * A, 51);
      P.set(x, y, r < 0.5 ? '#3d8a40' : r < 0.9 ? '#367e3a' : '#2c6c32');
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
  function rock(v) {
    return cached('rock' + v, () => {
      const P = Pix(A, 20);
      const R = C.rock;
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
  function tree(v) {
    return cached('tree' + v, () => {
      const P = Pix(20, 32);
      const Lf = C.leaf, Tr = C.trunk;
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
  const TALL = { o: '#185226', d: '#23733a', m: '#379a46', l: '#58b955', w: '#8ad46e', bg: '#23733a' };
  function tallGrass(frame) {
    return cached('tall' + frame, () => {
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

  return { floor, outsideFloor, rock, tree, tallGrass, crate, candy, flag, draw, H, A, PX };
})();
