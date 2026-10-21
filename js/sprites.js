// Carga y dibujo de los sprites de PMD SpriteCollab (8 direcciones por hoja).
PB.Sprites = {
  imgs: {},
  portraits: {},

  load(onDone) {
    const jobs = [];
    for (const [dex, entry] of Object.entries(window.SPRITE_DATA || {})) {
      for (const [name, a] of Object.entries(entry.anims)) {
        jobs.push([dex + ':' + name, a.file, this.imgs]);
      }
      if (entry.portrait) jobs.push([dex, entry.portrait, this.portraits]);
    }
    let left = jobs.length;
    if (!left) return onDone();
    for (const [key, src, store] of jobs) {
      const img = new Image();
      img.onload = img.onerror = () => {
        if (img.naturalWidth) store[key] = img;
        if (--left === 0) onDone();
      };
      img.src = src;
    }
  },

  // Ángulo (y hacia abajo) -> fila de la hoja: Down, DownRight, Right, UpRight, Up, UpLeft, Left, DownLeft
  dirRow(angle) {
    const i = ((Math.round(angle / (Math.PI / 4)) % 8) + 8) % 8;
    return [2, 1, 0, 7, 6, 5, 4, 3][i];
  },

  // t en segundos. Si length se indica, la animación se comprime a esa duración (no hace bucle).
  frameIndex(a, t, length) {
    const total = a.dur.reduce((s, d) => s + d, 0);
    let tick;
    if (length) tick = Math.min(total - 0.001, (t / length) * total);
    else tick = (t * 60) % total;
    for (let i = 0; i < a.dur.length; i++) {
      tick -= a.dur[i];
      if (tick < 0) return i;
    }
    return a.dur.length - 1;
  },

  // Igual que draw() pero teñido de un color (destello al recibir daño, rayo rojo, etc.)
  drawTint(ctx, dex, anim, angle, t, x, y, scale, length, color, amount) {
    const entry = window.SPRITE_DATA && window.SPRITE_DATA[dex];
    const name = entry && entry.anims[anim] ? anim : 'Idle';
    const a = entry && entry.anims[name];
    const img = a && this.imgs[dex + ':' + name];
    if (!img) return;
    const tmp = this._tmp || (this._tmp = document.createElement('canvas'));
    tmp.width = a.w;
    tmp.height = a.h;
    const c = tmp.getContext('2d');
    c.clearRect(0, 0, a.w, a.h);
    c.globalCompositeOperation = 'source-over';
    c.drawImage(img, this.frameIndex(a, t, length) * a.w, this.dirRow(angle) * a.h, a.w, a.h, 0, 0, a.w, a.h);
    c.globalCompositeOperation = 'source-atop';
    c.globalAlpha = amount == null ? 1 : amount;
    c.fillStyle = color;
    c.fillRect(0, 0, a.w, a.h);
    c.globalAlpha = 1;
    const w = a.w * scale, h = a.h * scale;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(tmp, Math.round(x - w / 2), Math.round(y - h / 2 - 10), w, h);
  },

  draw(ctx, dex, anim, angle, t, x, y, scale, length) {
    const entry = window.SPRITE_DATA && window.SPRITE_DATA[dex];
    const a = entry && (entry.anims[anim] || entry.anims.Idle);
    const img = a && (this.imgs[dex + ':' + anim] || this.imgs[dex + ':Idle']);
    if (!img) {
      ctx.fillStyle = '#ccc';
      ctx.beginPath();
      ctx.arc(x, y - 16, 20, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    const f = this.frameIndex(a, t, length);
    const row = this.dirRow(angle);
    const w = a.w * scale;
    const h = a.h * scale;
    ctx.drawImage(img, f * a.w, row * a.h, a.w, a.h, Math.round(x - w / 2), Math.round(y - h / 2 - 10), w, h);
  },
};
