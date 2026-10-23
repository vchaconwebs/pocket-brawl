// Carga y dibujo de los sprites de PMD SpriteCollab (8 direcciones por hoja).
// Dos fuentes:
//  - PB.SPRITE_META (js/roster-data.js): todos los Pokémon jugables, normal y shiny,
//    hojas en assets/pokemon/{dex}/. Se descargan solo cuando hacen falta (ensure).
//  - window.SPRITE_DATA (js/sprite-data.js): los Pokémon de los mapas (Snorlax, Voltorb),
//    se cargan al empezar (load).
// Skin regional: la fase usa su forma de esa región si existe (Raichu -> Raichu de Alola); si no, la normal
PB.skinDex = (dex, skin) => (skin && PB.FORMS && PB.FORMS[dex + '-' + skin] ? dex + '-' + skin : dex);
// Megaevolución: la "skin" mega de esa fase si tiene sprite (Charizard X/Y: según el luchador); si no, null (solo aura)
PB.megaSkin = (dex, n) => {
  if (!PB.FORMS) return null;
  const opts = ['mega', 'mega-x', 'mega-y'].filter((k) => PB.FORMS[dex + '-' + k]);
  return opts.length ? opts[(n || 0) % opts.length] : null;
};

PB.Sprites = {
  imgs: {},
  ports: {},
  waiting: {},

  load(onDone) {
    const jobs = [];
    for (const [dex, entry] of Object.entries(window.SPRITE_DATA || {})) {
      for (const [name, a] of Object.entries(entry.anims)) jobs.push(['L' + dex + ':' + name, a.file]);
      if (entry.portrait) this.ports[dex] = this.image(entry.portrait);
    }
    Promise.all(jobs.map(([key, src]) => this.fetchImg(key, src))).then(() => onDone());
  },

  image(src) {
    const img = new Image();
    img.src = src;
    return img;
  },

  // Descarga una imagen una sola vez; la promesa se resuelve aunque falle
  fetchImg(key, src) {
    if (this.imgs[key]) return Promise.resolve(this.imgs[key]);
    if (this.waiting[key]) return this.waiting[key];
    return (this.waiting[key] = new Promise((res) => {
      const img = new Image();
      img.onload = () => { this.imgs[key] = img; res(img); };
      img.onerror = () => res(null);
      img.src = src;
    }));
  },

  // Datos de las animaciones de un Pokémon jugable (con la geometría shiny si difiere)
  anims(dex, shiny) {
    const m = this.meta(dex);
    if (!m) return null;
    if (!shiny || !m.sh || !m.sa) return m.a;
    return Object.assign({}, m.a, m.sa);
  },
  meta(dex) {
    return PB.SPRITE_META[dex] || (PB.FORM_META && PB.FORM_META[dex]);
  },
  hasShiny(dex) {
    const m = this.meta(dex);
    return !!(m && m.sh);
  },
  useShiny(dex, anim, shiny) {
    const m = this.meta(dex);
    return !!(shiny && m && m.sh && !(m.sm && m.sm.includes(anim)));
  },
  src(dex, anim, shiny) {
    return `assets/pokemon/${dex}/${this.useShiny(dex, anim, shiny) ? 's/' : ''}${anim}.png`;
  },
  key(dex, anim, shiny) {
    return dex + (this.useShiny(dex, anim, shiny) ? 's' : '') + ':' + anim;
  },

  // Descarga todas las animaciones de estos Pokémon. list = [dex | { dex, shiny }]
  ensure(list) {
    const jobs = [];
    for (const it of list) {
      const dex = typeof it === 'object' ? it.dex : it;
      const shiny = typeof it === 'object' && it.shiny;
      const a = this.anims(dex, shiny);
      if (!a) continue;
      for (const name of Object.keys(a)) jobs.push(this.fetchImg(this.key(dex, name, shiny), this.src(dex, name, shiny)));
    }
    return Promise.all(jobs);
  },
  ready(dex, shiny) {
    return !!this.imgs[this.key(dex, 'Idle', shiny)];
  },

  portraitURL(dex) {
    // formas regionales y megas: assets/pokemon/<dex>-<forma>/
    if (PB.FORMS && PB.FORMS[dex]) return `assets/pokemon/${dex}/${PB.FORMS[dex].p ? 'p' : 'Idle'}.png`;
    const n = +dex;
    if (PB.DEX[n]) return PB.DEX[n].p ? `assets/pokemon/${n}/p.png` : `assets/pokemon/${n}/Idle.png`;
    const e = window.SPRITE_DATA && window.SPRITE_DATA[dex];
    return e ? e.portrait : '';
  },
  // Retrato como imagen para dibujar en el canvas (se descarga la primera vez que se pide)
  portrait(dex) {
    if (dex == null) return null;
    if (!this.ports[dex]) {
      const url = this.portraitURL(dex);
      if (!url) return null;
      this.ports[dex] = this.image(url);
    }
    const img = this.ports[dex];
    return img.complete && img.naturalWidth ? img : null;
  },

  // Ángulo (y hacia abajo) -> fila de la hoja: Down, DownRight, Right, UpRight, Up, UpLeft, Left, DownLeft
  dirRow(angle) {
    const i = ((Math.round(angle / (Math.PI / 4)) % 8) + 8) % 8;
    return [2, 1, 0, 7, 6, 5, 4, 3][i];
  },

  // t en segundos. Si length se indica, la animación se comprime a esa duración (no hace bucle).
  frameIndex(dur, t, length) {
    const total = dur.reduce((s, d) => s + d, 0);
    let tick;
    if (length) tick = Math.min(total - 0.001, (t / length) * total);
    else tick = (t * 60) % total;
    for (let i = 0; i < dur.length; i++) {
      tick -= dur[i];
      if (tick < 0) return i;
    }
    return dur.length - 1;
  },

  // Fotograma que toca: { img, sx, sy, w, h, ax, ay } o null si aún no se ha descargado
  frame(dex, anim, angle, t, length, shiny) {
    const m = this.meta(dex);
    if (m) {
      const A = this.anims(dex, shiny);
      let name = A[anim] ? anim : 'Idle';
      let img = this.imgs[this.key(dex, name, shiny)];
      if (!img && name !== 'Idle') { name = 'Idle'; img = this.imgs[this.key(dex, name, shiny)]; }
      // sin la versión shiny descargada (Ditto shiny transformado en otro): la normal
      if (!img && shiny) return this.frame(dex, anim, angle, t, length, false);
      if (!img) return null;
      // megas y formas sin dibujo shiny: se pintan con los colores del shiny de la forma normal
      if (shiny && !m.sh) img = this.shinyLike(dex, name, img) || img;
      const a = A[name];
      const n = Math.min(a.n, a.d.length);
      const f = Math.min(n - 1, this.frameIndex(a.d.slice(0, n), t, length));
      const row = a.r >= 8 ? this.dirRow(angle) : 0;
      return { img, sx: f * a.w, sy: row * a.h, w: a.w, h: a.h, ax: a.ax, ay: a.ay };
    }
    // Pokémon de los mapas (formato antiguo, centrado)
    const entry = window.SPRITE_DATA && window.SPRITE_DATA[dex];
    if (!entry) return null;
    const name = entry.anims[anim] ? anim : 'Idle';
    const a = entry.anims[name];
    const img = a && this.imgs['L' + dex + ':' + name];
    if (!img) return null;
    const row = img.naturalHeight / a.h >= 8 ? this.dirRow(angle) : 0;
    // el ancla se pone en el centro y 10 px más abajo para que encaje con el dibujo de antes
    return { img, sx: this.frameIndex(a.dur, t, length) * a.w, sy: row * a.h, w: a.w, h: a.h, ax: a.w / 2, ay: a.h / 2 + 5 };
  },

  // Versión shiny "calculada" de una forma (Mega Rayquaza...) a partir de cómo cambian los colores
  // del Pokémon normal a su shiny. Se hace una vez por animación; hasta entonces, null.
  shinyLike(dex, anim, img) {
    const base = parseInt(dex, 10);
    if (String(base) === String(dex) || !this.hasShiny(base)) return null;
    const k = dex + 'R:' + anim;
    if (k in this.imgs) return this.imgs[k];
    const n = this.imgs[base + ':Idle'], s = this.imgs[base + 's:Idle'];
    if (!n || !s) { if (!this._shWait) this._shWait = {}; if (!this._shWait[base]) { this._shWait[base] = 1; this.ensure([base, { dex: base, shiny: true }]); } return null; }
    try {
      const pal = this._shPal || (this._shPal = {});
      if (!pal[base]) {
        // pares color normal -> color shiny en los mismos píxeles (el más repetido)
        const w = Math.min(n.width, s.width), h = Math.min(n.height, s.height);
        const pix = (im) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); x.drawImage(im, 0, 0); return x.getImageData(0, 0, w, h).data; };
        const A = pix(n), B = pix(s), cnt = new Map();
        for (let i = 0; i < A.length; i += 4) {
          if (A[i + 3] < 200 || B[i + 3] < 200) continue;
          const a = (A[i] << 16) | (A[i + 1] << 8) | A[i + 2], b = (B[i] << 16) | (B[i + 1] << 8) | B[i + 2];
          const m = cnt.get(a) || new Map();
          m.set(b, (m.get(b) || 0) + 1);
          cnt.set(a, m);
        }
        pal[base] = [...cnt].map(([a, m]) => [a, [...m].sort((x, y) => y[1] - x[1])[0][0]]).filter(([a, b]) => a !== b);
      }
      const P = pal[base];
      const c = document.createElement('canvas');
      c.width = img.width; c.height = img.height;
      const x = c.getContext('2d');
      x.drawImage(img, 0, 0);
      const d = x.getImageData(0, 0, c.width, c.height), D = d.data, memo = new Map();
      for (let i = 0; i < D.length; i += 4) {
        if (!D[i + 3]) continue;
        const col = (D[i] << 16) | (D[i + 1] << 8) | D[i + 2];
        let out = memo.get(col);
        if (out === undefined) {
          // el color más parecido de la paleta normal y se le aplica el mismo cambio
          let best = null, bd = 2400;
          for (const p of P) {
            const dr = (p[0] >> 16) - D[i], dg = ((p[0] >> 8) & 255) - D[i + 1], db = (p[0] & 255) - D[i + 2], dd = dr * dr + dg * dg + db * db;
            if (dd < bd) { bd = dd; best = p; }
          }
          out = best ? [D[i] + (best[1] >> 16) - (best[0] >> 16), D[i + 1] + ((best[1] >> 8) & 255) - ((best[0] >> 8) & 255), D[i + 2] + (best[1] & 255) - (best[0] & 255)] : null;
          memo.set(col, out);
        }
        if (out) { D[i] = out[0]; D[i + 1] = out[1]; D[i + 2] = out[2]; }
      }
      x.putImageData(d, 0, 0);
      this.imgs[k] = c;
    } catch (e) { this.imgs[k] = null; }
    return this.imgs[k];
  },

  // (x, y) = punto del suelo bajo el Pokémon
  draw(ctx, dex, anim, angle, t, x, y, scale, length, shiny) {
    const fr = this.frame(dex, anim, angle, t, length, shiny);
    if (!fr) return;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(fr.img, fr.sx, fr.sy, fr.w, fr.h, Math.round(x - fr.ax * scale), Math.round(y - fr.ay * scale), fr.w * scale, fr.h * scale);
  },

  // Igual que draw() pero teñido de un color (destello al recibir daño, rayo rojo, etc.)
  drawTint(ctx, dex, anim, angle, t, x, y, scale, length, color, amount, shiny) {
    const fr = this.frame(dex, anim, angle, t, length, shiny);
    if (!fr) return;
    const tmp = this._tmp || (this._tmp = document.createElement('canvas'));
    tmp.width = fr.w;
    tmp.height = fr.h;
    const c = tmp.getContext('2d');
    c.clearRect(0, 0, fr.w, fr.h);
    c.globalCompositeOperation = 'source-over';
    c.drawImage(fr.img, fr.sx, fr.sy, fr.w, fr.h, 0, 0, fr.w, fr.h);
    c.globalCompositeOperation = 'source-atop';
    c.globalAlpha = amount == null ? 1 : amount;
    c.fillStyle = color;
    c.fillRect(0, 0, fr.w, fr.h);
    c.globalAlpha = 1;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(tmp, Math.round(x - fr.ax * scale), Math.round(y - fr.ay * scale), fr.w * scale, fr.h * scale);
  },
};
