// Pokéballs en pixel art, generadas por código (mismo estilo que los sprites de PMD:
// píxel grande y contorno oscuro). Se cachean en canvas pequeños.
PB.Pokeball = (() => {
  const COL = {
    o: '#1b1418', // contorno y banda
    R: '#9e1c12', // rojo sombra
    r: '#e8331c', // rojo
    h: '#ff8a62', // rojo brillo
    w: '#f6f4f0', // blanco
    g: '#c3bfc6', // blanco sombra
    G: '#8e8994', // gris oscuro
    c: '#ffffff', // botón
    k: '#d9d4dc', // botón sombra
    y: '#fff6a8', // destello
  };
  const SIZE = 15;
  const cache = new Map();

  // variant: 'closed' | 'open' (mitades separadas) | 'glow' (botón encendido)
  function grid(variant) {
    const g = [];
    const c = 7, R = 7.1;
    for (let y = 0; y < SIZE; y++) {
      const row = [];
      for (let x = 0; x < SIZE; x++) {
        let yy = y;
        if (variant === 'open') yy = y < c ? y + 1.5 : y - 1.5; // separar mitades
        const dx = x - c, dy = yy - c, d = Math.hypot(dx, dy);
        let ch = null;
        if (variant === 'open' && Math.abs(y - c) <= 1) ch = null;
        else if (d <= R) {
          const band = Math.abs(dy) <= 0.9;
          if (d > R - 1) ch = 'o';
          else if (Math.hypot(dx, dy) < 1.5 && variant !== 'open') ch = variant === 'glow' ? 'y' : 'c';
          else if (Math.hypot(dx, dy) < 2.6 && variant !== 'open') ch = 'o';
          else if (band) ch = 'o';
          else {
            const lit = (-dx * 0.55 - dy * 0.85) / R;
            if (dy < 0) ch = lit > 0.55 ? 'h' : lit < -0.15 ? 'R' : 'r';
            else ch = lit < -0.35 ? 'G' : lit < 0.05 ? 'g' : 'w';
          }
        }
        row.push(ch);
      }
      g.push(row);
    }
    // brillo especular
    if (variant !== 'open') {
      g[3][4] = 'w';
      g[3][5] = 'w';
      g[4][4] = 'w';
    }
    return g;
  }

  function sprite(variant) {
    const key = variant || 'closed';
    if (cache.has(key)) return cache.get(key);
    const g = grid(key);
    const cv = document.createElement('canvas');
    cv.width = SIZE;
    cv.height = SIZE;
    const ctx = cv.getContext('2d');
    for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
      const ch = g[y][x];
      if (!ch) continue;
      ctx.fillStyle = COL[ch];
      ctx.fillRect(x, y, 1, 1);
    }
    cache.set(key, cv);
    return cv;
  }

  // Dibuja centrada en (x, y). px = tamaño de cada píxel de arte.
  function draw(ctx, x, y, px, opts) {
    const o = opts || {};
    const cv = sprite(o.variant);
    const s = SIZE * px;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    if (o.alpha != null) ctx.globalAlpha *= o.alpha;
    ctx.translate(Math.round(x), Math.round(y));
    if (o.angle) ctx.rotate(o.angle);
    ctx.drawImage(cv, -s / 2, -s / 2, s, s);
    ctx.restore();
  }

  // Pokéball gris (hueco vacío en el marcador)
  function slot() {
    if (cache.has('slot')) return cache.get('slot');
    const src = sprite('closed');
    const cv = document.createElement('canvas');
    cv.width = SIZE;
    cv.height = SIZE;
    const ctx = cv.getContext('2d');
    ctx.drawImage(src, 0, 0);
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = 'rgba(30,30,50,0.75)';
    ctx.fillRect(0, 0, SIZE, SIZE);
    cache.set('slot', cv);
    return cv;
  }

  function drawSlot(ctx, x, y, px) {
    const s = SIZE * px;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(slot(), Math.round(x - s / 2), Math.round(y - s / 2), s, s);
  }

  // Plataforma del centro del mapa: el símbolo de la Pokéball pintado en el suelo.
  function drawPad(ctx, x, y, r) {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(0, 6, r + 10, r + 8, 0, 0, Math.PI * 2);
    ctx.fill();
    // borde metálico
    ctx.fillStyle = '#4a4552';
    ctx.beginPath();
    ctx.arc(0, 0, r + 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#8f8a99';
    ctx.beginPath();
    ctx.arc(0, 0, r + 4, 0, Math.PI * 2);
    ctx.fill();
    // mitad roja / blanca
    ctx.fillStyle = '#d23a2a';
    ctx.beginPath();
    ctx.arc(0, 0, r, Math.PI, 0);
    ctx.fill();
    ctx.fillStyle = '#ece8ee';
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI);
    ctx.fill();
    // banda y botón
    ctx.fillStyle = '#1b1418';
    ctx.fillRect(-r, -6, r * 2, 12);
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.36, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f6f4f0';
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.24, 0, Math.PI * 2);
    ctx.fill();
    // remaches
    ctx.fillStyle = '#c9c4d2';
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
      ctx.fillRect(Math.cos(a) * (r + 4) - 2, Math.sin(a) * (r + 4) - 2, 4, 4);
    }
    ctx.restore();
  }

  return { draw, drawSlot, drawPad, sprite, SIZE };
})();
