// Interfaz en pixel art: paneles, barras e iconos dibujados píxel a píxel.
// Se usa en el HUD de la partida (canvas) y en los menús (los iconos se convierten en imágenes).
PB.PixUI = (() => {
  // ------------------------------------------------------------------ iconos (12 x 12)
  // o contorno · el resto de letras son colores de la paleta de cada icono
  const ICONS = {
    heart: {
      pal: { o: '#3a0a10', r: '#e8304a', R: '#a01830', W: '#ffd0d8' },
      art: [
        '............',
        '..oo...oo...',
        '.orro.orro..',
        'orWrrorrrRo.',
        'orWrrrrrrRo.',
        'orrrrrrrrRo.',
        '.orrrrrrRo..',
        '..orrrrRo...',
        '...orrRo....',
        '....oRo.....',
        '.....o......',
        '............',
      ],
    },
    sword: {
      pal: { o: '#20242c', s: '#e8eef6', S: '#8a96a8', h: '#7a4a10', g: '#f8c830' },
      art: [
        '.........oo.',
        '........osSo',
        '.......osSo.',
        '......osSo..',
        '.....osSo...',
        '.o..osSo....',
        '.ogoSSo.....',
        '..oggo......',
        '..ohgo......',
        '.ohoogo.....',
        'oho..o......',
        '.o..........',
      ],
    },
    star: {
      pal: { o: '#5a3a00', y: '#f8c830', W: '#fff4b0' },
      art: [
        '.....oo.....',
        '....oyyo....',
        '....oyyo....',
        'ooooyWyyoooo',
        'oyyyWyyyyyyo',
        '.oyyyyyyyyo.',
        '..oyyyyyyo..',
        '..oyyyyyyo..',
        '.oyyyooyyyo.',
        '.oyyo..oyyo.',
        'oyoo....ooyo',
        'oo........oo',
      ],
    },
    hourglass: {
      pal: { o: '#3a2410', w: '#f4e2b4', s: '#f8c830' },
      art: [
        'oooooooooooo',
        '.owwwwwwwwo.',
        '..owsssswo..',
        '...owsswo...',
        '....owso....',
        '.....oo.....',
        '.....oo.....',
        '....owwo....',
        '...owwswo...',
        '..owsssswo..',
        '.owssssssso.',
        'oooooooooooo',
      ],
    },
    target: {
      pal: { o: '#5a0a0a', r: '#e2483a', W: '#ffffff' },
      art: [
        '....oooo....',
        '..oorrrroo..',
        '.orrWWWWrro.',
        '.orWWrrWWro.',
        'orrWrrrrWrro',
        'orWrroorrWro',
        'orWrroorrWro',
        'orrWrrrrWrro',
        '.orWWrrWWro.',
        '.orrWWWWrro.',
        '..oorrrroo..',
        '....oooo....',
      ],
    },
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
    // doble marco celeste, como las ventanas de Mundo Misterioso
    if (o.ring !== false && w > p * 8 && h > p * 8) {
      ctx.fillStyle = o.ringColor || (FRAMES[PB.Settings.get('frame')] || '#e8b838');
      const i = p * 2, t = Math.max(1, Math.round(p / 2));
      ctx.fillRect(x + i + p, y + i, w - (i + p) * 2, t);
      ctx.fillRect(x + i + p, y + h - i - t, w - (i + p) * 2, t);
      ctx.fillRect(x + i, y + i + p, t, h - (i + p) * 2);
      ctx.fillRect(x + w - i - t, y + i + p, t, h - (i + p) * 2);
    }
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

  // ------------------------------------------------------------------ marcos de botones y ventanas (9-slice)
  // Cada "piel" es una imagen pequeña con esquinas redondeadas por escalones, contorno, borde
  // interior, brillo arriba y franja oscura abajo (como los botones de Pokémon Platino).
  // Se usa en CSS con border-image, a 3 px de pantalla por píxel de arte.
  const SKIN_ART = [
    '..ooooo..',
    '.owwwwwo.',
    'owlllllwo',
    'owfffffwo',
    'owfffffwo',
    'owfffffwo',
    'owdddddwo',
    '.owwwwwo.',
    '..ooooo..',
  ];
  // Variante de ventana (Mundo Misterioso): contorno negro, línea de color y relleno oscuro
  const WIN_ART = [
    '..ooooo..',
    '.okkkkko.',
    'okfffffko',
    'okfffffko',
    'okfffffko',
    'okfffffko',
    'okfffffko',
    '.okkkkko.',
    '..ooooo..',
  ];
  function skinURL(c, art) {
    const P = 3, N = 9;
    const cv = document.createElement('canvas');
    cv.width = N * P;
    cv.height = N * P;
    const g = cv.getContext('2d');
    (art || SKIN_ART).forEach((row, y) => [...row].forEach((ch, x) => {
      if (ch === '.') return;
      g.fillStyle = c[ch];
      g.fillRect(x * P, y * P, P, P);
    }));
    return cv.toDataURL();
  }
  // colores: o contorno, w borde claro, l brillo, f relleno, d sombra
  const SKINS = {
    red: { o: '#2a0c08', w: '#ffd0c8', l: '#ff7a64', f: '#e8402c', d: '#b02818' },
    green: { o: '#0c2a10', w: '#d0ffc8', l: '#78e070', f: '#48b048', d: '#2e8a30' },
    yellow: { o: '#3a2400', w: '#fff8d0', l: '#ffe680', f: '#f8c030', d: '#d09010' },
    orange: { o: '#3a1600', w: '#ffe0c0', l: '#ffa860', f: '#f07c28', d: '#c05a14' },
    pink: { o: '#3a0c2a', w: '#ffd8f0', l: '#f890d0', f: '#d860b0', d: '#a83e88' },
    blue: { o: '#0a1838', w: '#d0e4ff', l: '#70a8ff', f: '#3a78e0', d: '#2456b0' },
    teal: { o: '#062a2e', w: '#c8fff8', l: '#60dcd0', f: '#28b0b0', d: '#18868a' },
    gray: { o: '#141824', w: '#c8d0e0', l: '#8a96b0', f: '#5e6a88', d: '#46506c' },
    white: { o: '#3a4a64', w: '#a8c8e8', l: '#ffffff', f: '#fafaf6', d: '#e4e4dc' },
  };
  // marco de ventana elegido en Ajustes
  const FRAMES = { dorado: '#e8b838', verde: '#78d070', celeste: '#8ccaff', rosa: '#f890c8' };

  function installSkins() {
    const root = document.documentElement.style;
    for (const [k, c] of Object.entries(SKINS)) root.setProperty('--sk-' + k, 'url("' + skinURL(c) + '")');
    const fr = FRAMES[PB.Settings.get('frame')] || FRAMES.dorado;
    root.setProperty('--frame', fr);
    root.setProperty('--sk-win', 'url("' + skinURL({ o: '#020308', k: fr, f: '#10183a' }, WIN_ART) + '")');
    root.setProperty('--sk-win2', 'url("' + skinURL({ o: '#020308', k: fr, f: '#18234e' }, WIN_ART) + '")');
    root.setProperty('--sk-row', 'url("' + skinURL({ o: '#020308', k: 'rgba(255,255,255,0.18)', f: '#18234e' }, WIN_ART) + '")');
  }

  return { iconCanvas, iconURL, panel, bar, icon, ring, installSkins, FRAMES };
})();
