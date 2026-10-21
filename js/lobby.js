// Menús fuera de la partida: lobby, colección de Pokémon, ficha, modos, misiones y cofres.
// main.js le pasa unas funciones (api) para empezar partida y cambiar el fondo.
PB.Lobby = (() => {
  const $ = (s) => document.querySelector(s);
  let api = null;
  let current = 'lobby';
  let detailId = null;
  let chest = null; // { kind, index, state: 'idle'|'open', res, t, shown }
  const anims = []; // canvas con sprites animados: { cv, dex, scale, getVisible }
  let t = 0;

  // ------------------------------------------------------------------ iconos pixel art
  const icons = {};
  function pixIcon(key, size, fn) {
    if (icons[key]) return icons[key];
    const cv = document.createElement('canvas');
    cv.width = size;
    cv.height = size;
    const c = cv.getContext('2d');
    fn(c, size);
    icons[key] = cv.toDataURL();
    return icons[key];
  }
  const px = (c, x, y, col) => { c.fillStyle = col; c.fillRect(x, y, 1, 1); };

  // Moneda dorada
  const coinIcon = () => pixIcon('coin', 14, (c) => {
    for (let y = 0; y < 14; y++) for (let x = 0; x < 14; x++) {
      const d = Math.hypot(x - 6.5, y - 6.5);
      if (d > 6.4) continue;
      let col = d > 5.4 ? '#8a5a08' : d > 4.4 ? '#d89a18' : '#f8c830';
      if (d <= 4.4 && (x - 6.5) * -0.6 + (y - 6.5) * -0.8 > 2) col = '#fff0a0';
      px(c, x, y, col);
    }
    // marca central
    for (const [x, y] of [[6, 4], [7, 4], [5, 5], [5, 6], [5, 7], [6, 8], [7, 8], [8, 5], [8, 7]]) px(c, x, y, '#b07810');
  });
  // Puntos Pokémon: estrella morada
  const starIcon = () => pixIcon('star', 14, (c) => {
    const pts = [];
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 ? 2.8 : 6.6;
      pts.push([6.5 + Math.cos(a) * r, 7 + Math.sin(a) * r]);
    }
    const inside = (x, y) => {
      let k = false;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const [xi, yi] = pts[i], [xj, yj] = pts[j];
        if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) k = !k;
      }
      return k;
    };
    for (let y = 0; y < 14; y++) for (let x = 0; x < 14; x++) {
      if (!inside(x + 0.5, y + 0.5)) continue;
      const edge = !inside(x + 1.5, y + 0.5) || !inside(x - 0.5, y + 0.5) || !inside(x + 0.5, y + 1.5) || !inside(x + 0.5, y - 0.5);
      px(c, x, y, edge ? '#3a1f8a' : y < 6 ? '#c8b0ff' : '#8a64f0');
    }
  });
  const ballIcon = (kind, size) => pixIcon('ball-' + kind + (size || ''), 15 * (size || 1), (c, s) => {
    c.imageSmoothingEnabled = false;
    PB.Pokeball.draw(c, s / 2, s / 2, size || 1, { kind });
  });
  const candyIcon = () => pixIcon('candy', 18, (c) => c.drawImage(PB.Tiles.candy(), 0, 0));
  const modeIcon = (id) => {
    if (id === 'heist') return window.SPRITE_DATA['0143'].portrait;
    if (id === 'ball') return window.SPRITE_DATA['0100'].portrait;
    return pixIcon('mode-' + id, 40, (c) => {
      c.imageSmoothingEnabled = false;
      c.fillStyle = { gems: '#3a7a3a', showdown: '#5a2a78', zone: '#2a4a8a' }[id] || '#333';
      c.fillRect(0, 0, 40, 40);
      if (id === 'gems') PB.Pokeball.draw(c, 20, 20, 2, {});
      else if (id === 'showdown') c.drawImage(PB.Tiles.candy(), 2, 2, 36, 36);
      else c.drawImage(PB.Tiles.flag('blue', 0), 6, 0, 26, 42);
    });
  };
  PB.Icons = { coin: coinIcon, star: starIcon, ball: ballIcon, candy: candyIcon, mode: modeIcon };

  const money = (n, ico) => `<span class="money"><img src="${ico()}" alt="">${n}</span>`;
  const portrait = (b) => window.SPRITE_DATA[b.dex] && window.SPRITE_DATA[b.dex].portrait;
  const typeTags = (b) => b.types.map((ty) => `<i style="background:${PB.TYPE_INFO[ty].color}">${PB.TYPE_INFO[ty].name}</i>`).join('');

  // ------------------------------------------------------------------ pantallas
  function show(id) {
    current = id;
    for (const s of document.querySelectorAll('.screen')) s.classList.toggle('hidden', s.id !== id);
    if (id === 'lobby') refreshLobby();
  }

  function refreshLobby() {
    const d = PB.Save.get();
    $('#coins').textContent = d.coins;
    $('#points').textContent = d.points;
    const b = PB.brawlerById(d.selected);
    $('#hero-name').textContent = b.name;
    $('#hero-lvl').textContent = 'Nv. ' + PB.Save.level(b.id);
    const M = PB.MODES[api.getMode()];
    $('#mode-ico').src = modeIcon(M.id);
    $('#mode-name').textContent = M.name;
    $('#mode-diff').textContent = 'Bots: ' + PB.DIFFICULTY[api.getDifficulty()].name;
    // fichas
    const k = d.tokens / PB.META.tokensPerChest;
    $('#tok-fill').style.width = Math.round(k * 100) + '%';
    $('#tok-txt').textContent = d.tokens + '/' + PB.META.tokensPerChest;
    // cofres
    const cz = $('#chests');
    cz.innerHTML = '';
    if (!d.chests.length) cz.innerHTML = '<p class="empty">Sin cofres. ¡Juega para conseguir fichas!</p>';
    d.chests.slice(0, 6).forEach((kind, i) => {
      const el = document.createElement('button');
      el.className = 'chest-btn chest-' + kind;
      el.innerHTML = `<img src="${ballIcon(kind, 3)}" alt=""><span>${PB.META.chests[kind].name}</span>`;
      el.onclick = () => openChestScreen(i);
      cz.appendChild(el);
    });
    if (d.chests.length > 6) cz.insertAdjacentHTML('beforeend', `<p class="empty">+${d.chests.length - 6} más</p>`);
    // misiones listas para reclamar
    const ready = d.missions.filter((m) => m.progress >= m.n).length;
    const badge = $('#mis-badge');
    badge.textContent = ready;
    badge.classList.toggle('hidden', !ready);
  }

  // ------------------------------------------------------------------ colección
  function showCollection() {
    const d = PB.Save.get();
    const grid = $('#col-grid');
    grid.innerHTML = '';
    const list = PB.BRAWLERS.slice().sort((a, b) => (PB.Save.owned(b.id) ? 1 : 0) - (PB.Save.owned(a.id) ? 1 : 0));
    for (const b of list) {
      const own = PB.Save.owned(b.id);
      const r = PB.META.rarity[b.id];
      const el = document.createElement('button');
      el.className = 'card' + (own ? '' : ' locked') + (b.id === d.selected ? ' sel' : '');
      el.style.setProperty('--rar', r.color);
      el.innerHTML =
        `<img class="pt" src="${portrait(b)}" alt="">` +
        `<span class="nm">${b.name}</span>` +
        (own
          ? `<span class="lv">Nv. ${PB.Save.level(b.id)}</span>`
          : `<span class="lock">🔒</span><span class="cost">${money(PB.Save.unlockCost(b.id), starIcon)}</span>`) +
        `<span class="rar">${r.name}</span>`;
      el.onclick = () => showDetail(b.id);
      grid.appendChild(el);
    }
    $('#col-count').textContent = Object.keys(d.owned).length + '/' + PB.BRAWLERS.length;
    show('collection');
  }

  // ------------------------------------------------------------------ ficha
  function showDetail(id) {
    detailId = id;
    renderDetail();
    show('detail');
  }

  function renderDetail() {
    const id = detailId;
    const b = PB.brawlerById(id);
    const d = PB.Save.get();
    const own = PB.Save.owned(id);
    const lvl = own ? PB.Save.level(id) : 1;
    const r = PB.META.rarity[id];
    const now = PB.statsAt(b, lvl);
    const next = lvl < PB.META.maxLevel ? PB.statsAt(b, lvl + 1) : null;
    const plus = (k) => (next && own && next[k] !== now[k] ? ` <em>+${next[k] - now[k]}</em>` : '');
    $('#dt-name').textContent = b.name;
    $('#dt-role').textContent = b.role;
    $('#dt-rar').textContent = r.name;
    $('#dt-rar').style.background = r.color;
    $('#dt-types').innerHTML = typeTags(b);
    $('#dt-desc').textContent = b.desc;
    let bar = '';
    for (let i = 1; i <= PB.META.maxLevel; i++) bar += `<i class="${i <= lvl && own ? 'on' : ''}"></i>`;
    $('#dt-level').innerHTML = `<b>Nivel ${own ? lvl : '-'}</b><span class="lvbar">${bar}</span>`;
    const shots = now.shots > 1 ? ` × ${now.shots}` : '';
    $('#dt-stats').innerHTML =
      `<tr><td>❤ Vida</td><td>${now.hp}${plus('hp')}</td></tr>` +
      `<tr><td>⚔ Daño</td><td>${now.dmg}${shots}${plus('dmg')}</td></tr>` +
      (now.superDmg ? `<tr><td>★ Súper</td><td>${now.superDmg}${b.super.dps ? '/s' : ''}${plus('superDmg')}</td></tr>` : '') +
      `<tr><td>⚡ Velocidad</td><td>${now.speed}</td></tr>` +
      `<tr><td>🔄 Recarga</td><td>${now.reload} s</td></tr>` +
      `<tr><td>🎯 Alcance</td><td>${Math.round((now.range || b.super.radius || 0) / PB.TILE * 10) / 10} casillas</td></tr>`;
    $('#dt-moves').innerHTML =
      `<div class="move"><b>Ataque · ${b.attack.name}</b><span>${moveText(b.attack, false)}</span></div>` +
      `<div class="move super"><b>Súper · ${b.super.name}</b><span>${moveText(b.super, true)}</span></div>`;
    const acts = $('#dt-actions');
    acts.innerHTML = '';
    const btn = (label, cls, enabled, fn) => {
      const e = document.createElement('button');
      e.className = cls;
      e.innerHTML = label;
      e.disabled = !enabled;
      e.onclick = fn;
      acts.appendChild(e);
    };
    if (own) {
      const cost = PB.Save.upgradeCost(id);
      if (cost == null) btn('Nivel máximo', 'act gray', false);
      else btn(`Subir a Nv. ${lvl + 1} · ${money(cost, coinIcon)}`, 'act gold', d.coins >= cost, () => {
        if (PB.Save.upgrade(id)) { PB.Audio.play('candy'); renderDetail(); flashIn('#dt-level'); }
      });
      if (d.selected === id) btn('Elegido ✓', 'act gray', false);
      else btn('Elegir', 'act blue', true, () => { PB.Save.select(id); PB.Audio.play('ball'); renderDetail(); });
    } else {
      const cost = PB.Save.unlockCost(id);
      btn(`Desbloquear · ${money(cost, starIcon)}`, 'act gold', d.points >= cost, () => {
        if (PB.Save.unlock(id)) { PB.Audio.play('win'); renderDetail(); flashIn('#dt-hero'); }
      });
      if (d.points < cost) acts.insertAdjacentHTML('beforeend', `<p class="need">Te faltan ${cost - d.points} Puntos Pokémon. Se consiguen en los cofres.</p>`);
    }
    $('#dt-hero').classList.toggle('locked', !own);
  }

  function moveText(m, isSuper) {
    switch (m.kind) {
      case 'spread': return (m.count > 1 ? `${m.count} proyectiles en abanico` : 'Un proyectil') + (m.pierce ? ' que atraviesan' : '') + (m.destroysWalls ? ', rompe muros' : '') + (m.knockback ? ' y empuja' : '') + '.';
      case 'burst': return `Ráfaga de ${m.count} disparos rápidos.`;
      case 'lob': return 'Lanza por encima de los muros y explota al caer.';
      case 'zone': return 'Crea una zona que daña a los rivales y cura a tu equipo.';
      case 'dash': return 'Embestida rápida que daña y aturde.';
      case 'slam': return 'Golpe al suelo alrededor: daña, empuja y rompe muros.';
      case 'stealth': return 'Te vuelves invisible y tu siguiente ataque hace más daño.';
    }
    return isSuper ? 'Ataque especial.' : '';
  }

  function flashIn(sel) {
    const e = $(sel);
    e.classList.remove('pop');
    void e.offsetWidth;
    e.classList.add('pop');
  }

  // ------------------------------------------------------------------ modos
  function showModes() {
    const grid = $('#mp-grid');
    grid.innerHTML = '';
    for (const id of PB.MODE_ORDER) {
      const M = PB.MODES[id];
      const el = document.createElement('button');
      el.className = 'mode-card2' + (id === api.getMode() ? ' sel' : '');
      el.innerHTML = `<img src="${modeIcon(id)}" alt=""><b>${M.name}</b><span>${M.desc}</span>`;
      el.onclick = () => { api.setMode(id); showModes(); };
      grid.appendChild(el);
    }
    const dz = $('#mp-diff');
    dz.innerHTML = '<span>Bots:</span>';
    for (const [id, dd] of Object.entries(PB.DIFFICULTY)) {
      const el = document.createElement('button');
      el.className = 'diff' + (id === api.getDifficulty() ? ' sel' : '');
      el.textContent = dd.name;
      el.onclick = () => { api.setDifficulty(id); showModes(); };
      dz.appendChild(el);
    }
    show('modepick');
  }

  // ------------------------------------------------------------------ misiones
  function showMissions() {
    const d = PB.Save.get();
    const list = $('#ms-list');
    list.innerHTML = '';
    d.missions.forEach((m, i) => {
      const done = m.progress >= m.n;
      const el = document.createElement('div');
      el.className = 'mission' + (done ? ' done' : '');
      const pct = Math.round((100 * m.progress) / m.n);
      el.innerHTML =
        `<img src="${ballIcon(m.reward, 2)}" alt="">` +
        `<div class="ms-body"><b>${m.text}</b><span class="bar"><i style="width:${pct}%"></i></span><small>${Math.floor(m.progress)} / ${m.n}</small></div>`;
      const btn = document.createElement('button');
      btn.className = 'act ' + (done ? 'gold' : 'gray');
      btn.textContent = done ? 'Reclamar' : PB.META.chests[m.reward].name;
      btn.disabled = !done;
      btn.onclick = () => { PB.Save.claimMission(i); PB.Audio.play('ready'); showMissions(); };
      el.appendChild(btn);
      list.appendChild(el);
    });
    show('missions');
  }

  // ------------------------------------------------------------------ cofres
  function openChestScreen(index) {
    const kind = PB.Save.get().chests[index];
    if (!kind) return;
    chest = { kind, index, state: 'idle', res: null, t: 0, shown: 0 };
    $('#chest-name').textContent = PB.META.chests[kind].name;
    $('#chest-rewards').innerHTML = '';
    $('#chest-hint').textContent = 'Toca para abrir';
    show('chestopen');
  }

  function chestTap() {
    if (!chest) return;
    if (chest.state === 'idle') {
      chest.res = PB.Save.openChest(chest.index);
      chest.state = 'open';
      chest.t = 0;
      PB.Audio.play('release');
      const items = [];
      if (chest.res.coins) items.push(`<div class="reward"><img src="${coinIcon()}"><b>+${chest.res.coins}</b><span>monedas</span></div>`);
      if (chest.res.points) items.push(`<div class="reward"><img src="${starIcon()}"><b>+${chest.res.points}</b><span>Puntos Pokémon</span></div>`);
      for (const id of chest.res.pokemon) {
        const b = PB.brawlerById(id);
        items.push(`<div class="reward new"><img src="${portrait(b)}"><b>¡${b.name}!</b><span>Nuevo Pokémon</span></div>`);
      }
      chest.items = items;
      $('#chest-hint').textContent = 'Toca para continuar';
    } else if (chest.shown < chest.items.length) {
      revealNext();
    } else {
      chest = null;
      show('lobby');
    }
  }

  function revealNext() {
    const html = chest.items[chest.shown++];
    $('#chest-rewards').insertAdjacentHTML('beforeend', html);
    PB.Audio.play(html.includes('new') ? 'win' : 'candy');
  }

  // ------------------------------------------------------------------ animación de los canvas
  function drawHero(cv, dex, scale, glow) {
    const c = cv.getContext('2d');
    const w = cv.width, h = cv.height;
    c.clearRect(0, 0, w, h);
    c.imageSmoothingEnabled = false;
    // pedestal
    c.fillStyle = 'rgba(0,0,0,0.35)';
    c.beginPath();
    c.ellipse(w / 2, h * 0.8, w * 0.3, h * 0.08, 0, 0, Math.PI * 2);
    c.fill();
    if (glow) {
      c.strokeStyle = 'rgba(255,210,60,' + (0.5 + Math.sin(t * 3) * 0.25) + ')';
      c.lineWidth = 4;
      c.beginPath();
      c.ellipse(w / 2, h * 0.8, w * 0.32, h * 0.09, 0, 0, Math.PI * 2);
      c.stroke();
    }
    PB.Sprites.draw(c, dex, 'Idle', Math.PI / 2, t, w / 2, h * 0.8 - 10 * scale + 10, scale, 0);
  }

  function tick(dt) {
    t += dt;
    if (current === 'lobby') {
      const b = PB.brawlerById(PB.Save.get().selected);
      drawHero($('#hero-cv'), b.dex, 5, true);
    } else if (current === 'detail' && detailId) {
      drawHero($('#dt-cv'), PB.brawlerById(detailId).dex, 4, PB.Save.owned(detailId));
    } else if (current === 'chestopen' && chest) {
      chest.t += dt;
      const cv = $('#chest-cv'), c = cv.getContext('2d');
      c.clearRect(0, 0, cv.width, cv.height);
      c.imageSmoothingEnabled = false;
      const cx = cv.width / 2, cy = cv.height / 2;
      if (chest.state === 'idle') {
        const shake = Math.sin(t * 18) * 0.12 * (Math.sin(t * 2) > 0 ? 1 : 0.2);
        PB.Pokeball.draw(c, cx, cy + Math.sin(t * 3) * 6, 10, { kind: chest.kind, angle: shake });
      } else {
        const k = Math.min(1, chest.t / 0.5);
        const g = c.createRadialGradient(cx, cy, 0, cx, cy, 160);
        g.addColorStop(0, `rgba(255,255,255,${0.9 * (1 - k * 0.6)})`);
        g.addColorStop(1, 'rgba(255,255,255,0)');
        c.fillStyle = g;
        c.fillRect(0, 0, cv.width, cv.height);
        PB.Pokeball.draw(c, cx, cy, 10, { kind: chest.kind, variant: 'open' });
        // los premios van saliendo solos
        if (chest.shown < chest.items.length && chest.t > 0.45 + chest.shown * 0.45) revealNext();
      }
    }
  }

  // ------------------------------------------------------------------ inicio
  function init(a) {
    api = a;
    PB.Save.load();
    $('#ico-coin').src = coinIcon();
    $('#ico-star').src = starIcon();
    $('#ico-tok').src = ballIcon('poke', 2);
    $('#lb-hero').onclick = showCollection;
    $('#btn-pokemon').onclick = showCollection;
    $('#btn-missions').onclick = showMissions;
    $('#btn-mode').onclick = showModes;
    for (const e of document.querySelectorAll('[data-back]')) e.onclick = () => show(e.dataset.back);
    $('#dt-back').onclick = showCollection;
    $('#chestopen').onclick = chestTap;
  }

  return { init, show, tick, refresh: refreshLobby, get current() { return current; } };
})();
