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
  function paintGrass(P, ox, oy, tx, ty) {
    for (let y = 0; y < A; y++) for (let x = 0; x < A; x++) {
      const gx = tx * A + x, gy = ty * A + y;
      const band = H(gx >> 3, gy >> 3, 11) * 0.7 + H(gx, gy, 12) * 0.5;
      let col = C.grass[Math.min(2, Math.floor((band * 3) / 1.2))];
      const r = H(gx, gy, 13);
      if (r < 0.03) col = C.grassSpeck;
      else if (r > 0.988) col = C.grassLight;
      P.set(ox + x, oy + y, col);
    }
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

  // Pinta el suelo de todo el mapa (a resolución de arte)
  function floor(world) {
    const at = (c, r) => world.tile(c, r);
    const P = Pix(world.w * A, world.h * A);
    for (let r = 0; r < world.h; r++) for (let c = 0; c < world.w; c++) {
      const ox = c * A, oy = r * A, t = at(c, r);
      paintGrass(P, ox, oy, c, r);
      if (t === 'P') paintPath(P, ox, oy, c, r, at);
      else if (t === '~') paintWater(P, ox, oy, c, r, at);
    }
    for (const [list, col, dark] of [[world.spawns.blue, '#5a9cf0', '#3a6cc0'], [world.spawns.red, '#f06a5a', '#c0443a']]) {
      for (const s of list) paintMat(P, Math.floor(s.x / PB.TILE) * A, Math.floor(s.y / PB.TILE) * A, col, dark);
    }
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

  function draw(ctx, cv, x, y) {
    ctx.drawImage(cv, Math.round(x), Math.round(y), cv.width * PX, cv.height * PX);
  }

  return { floor, outsideFloor, rock, tree, tallGrass, draw, H, A, PX };
})();
