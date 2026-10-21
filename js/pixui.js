// Interfaz en pixel art: paneles, barras e iconos dibujados píxel a píxel.
// Se usa en el HUD de la partida (canvas) y en los menús (los iconos se convierten en imágenes).
PB.PixUI = (() => {
  // ------------------------------------------------------------------ iconos (12 x 12)
  // o contorno · el resto de letras son colores de la paleta de cada icono
  const ICONS = {
    scroll: {
      pal: { o: '#3a2410', W: '#fff4d8', w: '#e8d2a0', y: '#f4e2b4', k: '#9a7a4a' },
      art: [
        '..oooooooo..',
        '.oWWWWWWWWo.',
        'oWwwwwwwwwWo',
        '.oyyyyyyyyo.',
        '.oykkkkkkyo.',
        '.oyyyyyyyyo.',
        '.oykkkkkyyo.',
        '.oyyyyyyyyo.',
        '.oykkkkyyyo.',
        'oWwwwwwwwwWo',
        '.oWWWWWWWWo.',
        '..oooooooo..',
      ],
    },
    medal: {
      pal: { o: '#3a2400', r: '#e2483a', R: '#a82e26', y: '#f8c830', W: '#fff4b0', d: '#c08a10' },
      art: [
        '.oro....oro.',
        '.oRro..orRo.',
        '..oRro.oRo..',
        '...oRrrRo...',
        '....oooo....',
        '...oyyyyo...',
        '..oyWyyyyo..',
        '.oyWyyyyydo.',
        '.oyyyyyyddo.',
        '..oyyyddddo.',
        '...oddddo...',
        '....oooo....',
      ],
    },
    friends: {
      pal: { o: '#141632', s: '#ffd8b0', S: '#e8b088', b: '#5a9cf0', B: '#3a6cc0', g: '#5ad07a', G: '#2e9a4a' },
      art: [
        '...oo.......',
        '..osso..oo..',
        '..oSso.osso.',
        '...oo..oSso.',
        '.obbbo..oo..',
        'obbbbbooggo.',
        'obBbbBoggggo',
        'obbbbboggGgo',
        'obbbbbogGggo',
        'ooooooogggGo',
        '.......ooooo',
        '............',
      ],
    },
    pause: {
      pal: { o: '#141632', w: '#ffffff', g: '#c8d0e8' },
      art: [
        '............',
        '..oooo.oooo.',
        '..owgo.owgo.',
        '..owgo.owgo.',
        '..owgo.owgo.',
        '..owgo.owgo.',
        '..owgo.owgo.',
        '..owgo.owgo.',
        '..owgo.owgo.',
        '..owgo.owgo.',
        '..oooo.oooo.',
        '............',
      ],
    },
    sound: {
      pal: { o: '#141632', w: '#ffffff', g: '#c8d0e8', y: '#ffd23a' },
      art: [
        '.....o......',
        '....owo...y.',
        '...owwo.y..y',
        'ooowwwo..y.y',
        'owwwwwo.y.y.',
        'owwwwwo.y.y.',
        'owwwwwo.y.y.',
        'oggwwwo..y.y',
        'ooogwwo.y..y',
        '...oggo...y.',
        '....ogo.....',
        '.....o......',
      ],
    },
    mute: {
      pal: { o: '#141632', w: '#ffffff', g: '#c8d0e8', r: '#ff4d4d' },
      art: [
        '.....o......',
        '....owo.....',
        '...owwo.....',
        'ooowwwo.r..r',
        'owwwwwo..rr.',
        'owwwwwo..rr.',
        'owwwwwo.r..r',
        'oggwwwo.....',
        'ooogwwo.....',
        '...oggo.....',
        '....ogo.....',
        '.....o......',
      ],
    },
    home: {
      pal: { o: '#141632', r: '#e2483a', R: '#a82e26', w: '#f2ecd8', d: '#7a4a24' },
      art: [
        '.....oo.....',
        '....orro....',
        '...orrrro...',
        '..orrRRrro..',
        '.orrRooRrro.',
        'oooowwwwoooo',
        '...owwwwo...',
        '...owoowo...',
        '...owoowo...',
        '...owddwo...',
        '...owddwo...',
        '...oooooo...',
      ],
    },
    play: {
      pal: { o: '#141632', w: '#ffffff', g: '#c8d0e8' },
      art: [
        '..oo........',
        '..owo.......',
        '..owwo......',
        '..owwwo.....',
        '..owwwwo....',
        '..owwwwwo...',
        '..owwwwwgo..',
        '..owwwwgo...',
        '..owwwgo....',
        '..owwgo.....',
        '..owgo......',
        '..ooo.......',
      ],
    },
  };

  // Iconos hechos por código (formas redondas)
  function genIcon(name) {
    const S = 12, g = [];
    for (let y = 0; y < S; y++) { g.push([]); for (let x = 0; x < S; x++) g[y].push(null); }
    const cx = 5.5, cy = 5.5;
    if (name === 'gear') {
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        const dx = x - cx, dy = y - cy, d = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
        const teeth = Math.cos(a * 8) > 0.25;
        if (d < 1.9) continue;
        if (d < (teeth ? 5.9 : 4.4)) g[y][x] = dx + dy < -1 ? 'w' : d < 3.2 ? 'g' : 'G';
      }
      return { g, pal: { w: '#e8ecf4', g: '#b8c0d0', G: '#8a94a8', o: '#141632' } };
    }
    if (name === 'shield') {
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        const half = y < 6 ? 5 : 5 - (y - 5) * 0.95;
        if (Math.abs(x - cx) > half || y > 11) continue;
        const d = Math.hypot(x - cx, y - 5);
        let c = x < cx ? 'b' : 'r';
        if (d < 2.6) c = d < 1.2 ? 'w' : y < 5 ? 'w' : y === 5 ? 'k' : 'W';
        if (y === 0) c = x < cx ? 'B' : 'R';
        g[y][x] = c;
      }
      return { g, pal: { b: '#3a7ad8', B: '#7ab4fa', r: '#e2483a', R: '#ff8c7a', w: '#ffffff', W: '#e8e4ee', k: '#141632', o: '#141632' } };
    }
    if (name === 'bolt') {
      const pts = [[7, 0], [3, 6], [6, 6], [4, 11], [9, 4], [6, 4], [8, 0]];
      const inside = (px, py) => {
        let k = false;
        for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
          const [xi, yi] = pts[i], [xj, yj] = pts[j];
          if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) k = !k;
        }
        return k;
      };
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (inside(x + 0.5, y + 0.5)) g[y][x] = x < 6 ? 'w' : 'y';
      return { g, pal: { w: '#fff6a8', y: '#f8c830', o: '#5a3a00' } };
    }
    return null;
  }

  const cache = new Map();
  // Devuelve un canvas con el icono (con contorno) a escala 1
  function iconCanvas(name) {
    if (cache.has(name)) return cache.get(name);
    let grid, pal;
    if (ICONS[name]) {
      pal = ICONS[name].pal;
      grid = ICONS[name].art.map((r) => [...r].map((ch) => (ch === '.' ? null : ch)));
    } else {
      const gi = genIcon(name);
      if (!gi) return null;
      grid = gi.g;
      pal = gi.pal;
      // contorno automático
      const out = grid.map((r) => r.slice());
      for (let y = 0; y < 12; y++) for (let x = 0; x < 12; x++) {
        if (grid[y][x]) continue;
        if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => grid[y + b] && grid[y + b][x + a])) out[y][x] = 'o';
      }
      grid = out;
    }
    const cv = document.createElement('canvas');
    cv.width = grid[0].length;
    cv.height = grid.length;
    const c = cv.getContext('2d');
    grid.forEach((row, y) => row.forEach((ch, x) => { if (ch && pal[ch]) { c.fillStyle = pal[ch]; c.fillRect(x, y, 1, 1); } }));
    cache.set(name, cv);
    return cv;
  }
  const urls = {};
  function iconURL(name, scale) {
    const k = name + (scale || 3);
    if (urls[k]) return urls[k];
    const src = iconCanvas(name);
    const s = scale || 3;
    const cv = document.createElement('canvas');
    cv.width = src.width * s;
    cv.height = src.height * s;
    const c = cv.getContext('2d');
    c.imageSmoothingEnabled = false;
    c.drawImage(src, 0, 0, cv.width, cv.height);
    urls[k] = cv.toDataURL();
    return urls[k];
  }

  // ------------------------------------------------------------------ dibujo en canvas
  const snap = (v, p) => Math.round(v / p) * p;

  // Panel con esquinas recortadas, contorno, brillo arriba y sombra abajo
  function panel(ctx, x, y, w, h, o) {
    o = o || {};
    const p = o.p || 3;
    x = snap(x, 1); y = snap(y, 1); w = snap(w, p); h = snap(h, p);
    const fill = o.fill || 'rgba(16,24,56,0.86)';
    const line = o.line || '#0c1020';
    // sombra
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(x + p, y + h, w - p * 2, p);
    // contorno (esquinas recortadas)
    ctx.fillStyle = line;
    ctx.fillRect(x + p, y, w - p * 2, h);
    ctx.fillRect(x, y + p, w, h - p * 2);
    // relleno
    ctx.fillStyle = fill;
    ctx.fillRect(x + p, y + p, w - p * 2, h - p * 2);
    // brillo y sombra interior
    ctx.fillStyle = o.light || 'rgba(255,255,255,0.16)';
    ctx.fillRect(x + p, y + p, w - p * 2, p);
    ctx.fillStyle = o.dark || 'rgba(0,0,0,0.25)';
    ctx.fillRect(x + p, y + h - p * 2, w - p * 2, p);
  }

  // Barra pixel: contorno, fondo, relleno con brillo y marcas cada "seg"
  function bar(ctx, x, y, w, h, frac, col, o) {
    o = o || {};
    const p = o.p || 2;
    x = Math.round(x); y = Math.round(y);
    ctx.fillStyle = o.line || '#0c1020';
    ctx.fillRect(x + p, y, w - p * 2, h);
    ctx.fillRect(x, y + p, w, h - p * 2);
    ctx.fillStyle = o.bg || '#2a2f45';
    ctx.fillRect(x + p, y + p, w - p * 2, h - p * 2);
    const iw = w - p * 2;
    const fw = Math.max(0, Math.min(iw, Math.round((iw * frac) / p) * p));
    if (fw > 0) {
      ctx.fillStyle = col;
      ctx.fillRect(x + p, y + p, fw, h - p * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.fillRect(x + p, y + p, fw, p);
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.fillRect(x + p, y + h - p * 2, fw, p);
    }
    if (o.seg && o.segCount > 1) {
      ctx.fillStyle = o.line || '#0c1020';
      for (let i = 1; i < o.segCount; i++) ctx.fillRect(x + p + Math.round((iw * i) / o.segCount) - Math.floor(p / 2), y + p, p, h - p * 2);
    }
  }

  // Icono escalado en el canvas
  function icon(ctx, name, x, y, scale) {
    const cv = iconCanvas(name);
    if (!cv) return;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(cv, Math.round(x), Math.round(y), cv.width * scale, cv.height * scale);
  }

  // Círculo pixel (anillo) cacheado: para joysticks y botones redondos
  const ringCache = new Map();
  function ring(radius, thick, col, fill) {
    const k = radius + '|' + thick + '|' + col + '|' + fill;
    if (ringCache.has(k)) return ringCache.get(k);
    const p = 3, R = Math.ceil(radius / p), S = R * 2 + 2;
    const cv = document.createElement('canvas');
    cv.width = S * p;
    cv.height = S * p;
    const c = cv.getContext('2d');
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const d = Math.hypot(x + 0.5 - S / 2, y + 0.5 - S / 2);
      if (d > R) continue;
      if (d > R - 1) c.fillStyle = '#0c1020';
      else if (d > R - 1 - thick / p) c.fillStyle = col;
      else if (fill) c.fillStyle = fill;
      else continue;
      c.fillRect(x * p, y * p, p, p);
    }
    ringCache.set(k, cv);
    return cv;
  }

  return { iconCanvas, iconURL, panel, bar, icon, ring };
})();
