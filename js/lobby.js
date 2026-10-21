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
  // Copa dorada (copas del ranking)
  const cupIcon = () => pixIcon('cup', 14, (c) => {
    const rows = [
      '..oooooooooo..',
      'oo.oyyyyyyWo.oo',
      'o.oyyyyyyyyo.o',
      'o.oyyyyyyyyo.o',
      '.ooyyyyyyyyoo.',
      '...oyyyyyyo...',
      '....oyyyyo....',
      '.....oyyo.....',
      '.....oyyo.....',
      '....oyyyyo....',
      '...oddddddo...',
      '...oooooooo...',
    ];
    const col = { o: '#5a3a00', y: '#f8c830', W: '#fff4b0', d: '#b07810' };
    rows.forEach((r, y) => [...r].forEach((ch, x) => { if (col[ch]) px(c, x, y + 1, col[ch]); }));
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
  PB.Icons = { coin: coinIcon, star: starIcon, ball: ballIcon, candy: candyIcon, mode: modeIcon, cup: cupIcon };

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
    $('#pf-name').textContent = d.name;
    $('#pf-copas').textContent = PB.Save.totalCopas();
    $('#pf-avatar').src = portrait(b);
    // botón del cofre: la Pokéball, la barra de fichas y cuántos cofres hay para abrir
    const k = d.tokens / PB.META.tokensPerChest;
    $('#tok-fill').style.width = Math.round(k * 100) + '%';
    $('#tok-txt').textContent = d.tokens + '/' + PB.META.tokensPerChest + ' fichas';
    const ni = PB.Save.nextChest();
    const kind = ni >= 0 ? d.chests[ni] : 'poke';
    $('#cw-img').src = ballIcon(kind, 4);
    $('#cw-label').textContent = d.chests.length ? '¡Abrir ' + PB.META.chests[kind].name + '!' : 'Próxima Poké Ball';
    const cnt = $('#cw-count');
    cnt.textContent = d.chests.length;
    cnt.classList.toggle('hidden', !d.chests.length);
    $('#chest-widget').classList.toggle('ready', d.chests.length > 0);
    // avisos rojos: misiones, logros y solicitudes de amistad
    const pend = PB.Save.pending();
    setBadge('#mis-badge', pend.missions);
    setBadge('#ach-badge', pend.achievements);
    PB.Online.requests().then((r) => setBadge('#fr-badge', r.length));
  }

  function setBadge(sel, n) {
    const e = $(sel);
    e.textContent = n;
    e.classList.toggle('hidden', !n);
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
          ? `<span class="lv">Nv. ${PB.Save.level(b.id)} · <img class="cup" src="${cupIcon()}" alt="">${PB.Save.copas(b.id)}</span>`
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
      (own ? `<tr><td><img class="cup" src="${cupIcon()}" alt=""> Copas</td><td>${PB.Save.copas(id)}</td></tr>` : '') +
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
    show('modepick');
  }

  // Icono y texto de un premio de misión
  function rewardInfo(r) {
    if (r.kind === 'coins') return { icon: coinIcon(), label: '+' + r.amount };
    if (r.kind === 'points') return { icon: starIcon(), label: '+' + r.amount };
    return { icon: ballIcon(r.kind, 2), label: PB.META.chests[r.kind].name };
  }

  // ------------------------------------------------------------------ misiones
  let msTab = 'daily';
  const timeLeft = (ms) => {
    const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000);
    return h >= 24 ? Math.floor(h / 24) + ' d ' + (h % 24) + ' h' : h + ' h ' + m + ' min';
  };

  function showMissions(tab) {
    if (tab) msTab = tab;
    setTab('#ms-tabs', msTab);
    const list = $('#ms-list');
    list.innerHTML = '';
    $('#ms-reset').textContent = (msTab === 'daily' ? 'Nuevas misiones en ' : 'Nuevas misiones semanales en ') + timeLeft(PB.Save.nextReset(msTab));
    PB.Save.missions(msTab).forEach((m, i) => {
      const done = m.progress >= m.n;
      const el = document.createElement('div');
      el.className = 'mission' + (m.claimed ? ' claimed' : done ? ' done' : '');
      const pct = Math.round((100 * m.progress) / m.n);
      const rw = rewardInfo(m.reward);
      el.innerHTML =
        `<div class="ms-body"><b>${m.text}</b><span class="bar"><i style="width:${pct}%"></i></span><small>${Math.floor(m.progress).toLocaleString('es-ES')} / ${m.n.toLocaleString('es-ES')}</small></div>` +
        `<div class="ms-reward"><img src="${rw.icon}" alt=""><span>${rw.label}</span></div>`;
      const btn = document.createElement('button');
      btn.className = 'act ' + (m.claimed ? 'gray' : done ? 'gold' : 'gray');
      btn.textContent = m.claimed ? 'Hecha ✓' : done ? 'Reclamar' : 'En curso';
      btn.disabled = m.claimed || !done;
      btn.onclick = () => { PB.Save.claimMission(msTab, i); PB.Audio.play('ready'); showMissions(); };
      el.appendChild(btn);
      list.appendChild(el);
    });
    show('missions');
  }

  function setTab(sel, tab) {
    for (const b of document.querySelectorAll(sel + ' button')) b.classList.toggle('sel', b.dataset.tab === tab);
  }

  // ------------------------------------------------------------------ logros
  let achTab = 'todo';
  function rewardsHtml(list) {
    return list.map((r) => { const i = rewardInfo(r); return `<span class="rw"><img src="${i.icon}" alt="">${i.label}</span>`; }).join('');
  }
  function showAchievements(tab) {
    if (tab) achTab = tab;
    setTab('#ach-tabs', achTab);
    const all = PB.Save.achievements();
    $('#ach-count').textContent = all.filter((a) => a.claimed).length + '/' + all.length;
    // por conseguir: primero los que se pueden reclamar, luego los más avanzados
    let list = all.filter((a) => (achTab === 'done' ? a.claimed : !a.claimed));
    if (achTab === 'todo') {
      // de cada logro, solo el siguiente nivel pendiente
      const seen = new Set();
      list = list.filter((a) => (seen.has(a.stat) ? false : (seen.add(a.stat), true)));
      list.sort((x, y) => (y.progress >= y.n) - (x.progress >= x.n) || y.progress / y.n - x.progress / x.n);
    }
    const box = $('#ach-list');
    box.innerHTML = list.length ? '' : `<p class="empty">${achTab === 'done' ? 'Aún no has conseguido ningún logro.' : '¡Lo tienes todo!'}</p>`;
    for (const a of list) {
      const done = a.progress >= a.n;
      const el = document.createElement('div');
      el.className = 'mission ach t' + a.tier + (a.claimed ? ' claimed' : done ? ' done' : '');
      const pct = Math.round((100 * a.progress) / a.n);
      el.innerHTML =
        `<div class="ach-medal">🏅<small>${['I', 'II', 'III', 'IV', 'V', 'VI'][a.tier]}</small></div>` +
        `<div class="ms-body"><b>${a.name}</b><small>${a.desc}</small>` +
        (a.claimed ? '' : `<span class="bar"><i style="width:${pct}%"></i></span><small>${Math.floor(a.progress).toLocaleString('es-ES')} / ${a.n.toLocaleString('es-ES')}</small>`) +
        `</div><div class="ach-rw">${rewardsHtml(a.reward)}</div>`;
      if (!a.claimed) {
        const btn = document.createElement('button');
        btn.className = 'act ' + (done ? 'gold' : 'gray');
        btn.textContent = done ? 'Reclamar' : 'En curso';
        btn.disabled = !done;
        btn.onclick = () => { PB.Save.claimAchievement(a.id); PB.Audio.play('win'); showAchievements(); };
        el.appendChild(btn);
      }
      box.appendChild(el);
    }
    show('achievements');
  }

  // ------------------------------------------------------------------ aviso / confirmación
  function modal(text, withCancel) {
    return new Promise((resolve) => {
      $('#modal-text').textContent = text;
      $('#modal-cancel').classList.toggle('hidden', !withCancel);
      $('#modal').classList.remove('hidden');
      $('#modal-ok').onclick = () => { $('#modal').classList.add('hidden'); resolve(true); };
      $('#modal-cancel').onclick = () => { $('#modal').classList.add('hidden'); resolve(false); };
    });
  }

  // ------------------------------------------------------------------ perfil
  function showProfile() {
    const d = PB.Save.get();
    const b = PB.brawlerById(d.selected);
    $('#pf-big').src = portrait(b);
    $('#pf-input').value = d.name;
    $('#pf-tag').textContent = 'Código de amigo: ' + d.tag;
    PB.Online.myClan().then((c) => { $('#pf-clan').textContent = c ? 'Clan: ' + c.name : 'Sin clan'; });
    const st = d.stats;
    const rows = [
      ['Copas totales', PB.Save.totalCopas()],
      ['Partidas', st.played || 0],
      ['Victorias', st.wins || 0],
      ['K.O.', st.kills || 0],
      ['Mejor racha', st.bestStreak || 0],
      ['Pokémon', Object.keys(d.owned).length + '/' + PB.BRAWLERS.length],
      ['Cofres abiertos', st.chests || 0],
      ['Logros', PB.Save.achievements().filter((a) => a.claimed).length],
    ];
    $('#pf-stats').innerHTML = rows.map(([k, v]) => `<div><small>${k}</small><b>${typeof v === 'number' ? v.toLocaleString('es-ES') : v}</b></div>`).join('');
    show('profile');
  }

  // ------------------------------------------------------------------ amigos
  let frTab = 'list';
  const avatar = (p) => portrait(PB.brawlerById(p.fav) || PB.BRAWLERS[0]);
  const prow = (p, extra) =>
    `<div class="prow${p.me ? ' me' : ''}">` +
    (p.pos ? `<span class="pos">${p.pos}</span>` : '') +
    `<img class="av" src="${p.avatar || avatar(p)}" alt="">` +
    `<div class="pinfo"><b>${p.name}</b><small>${p.sub || ''}</small></div>` +
    `<span class="pcopas"><img class="cup" src="${cupIcon()}" alt="">${(p.copas || 0).toLocaleString('es-ES')}</span>` +
    (extra || '') + '</div>';

  async function showFriends(tab) {
    if (tab) frTab = tab;
    setTab('#fr-tabs', frTab);
    $('#fr-search').classList.toggle('hidden', frTab !== 'search');
    const box = $('#fr-list');
    const reqs = await PB.Online.requests();
    $('#fr-req-n').textContent = reqs.length ? '(' + reqs.length + ')' : '';
    if (frTab === 'list') {
      const list = await PB.Online.friends();
      box.innerHTML = list.length ? list.map((p) => prow({ ...p, sub: p.online ? '<span class="on">● En línea</span>' : '<span class="off">● Desconectado</span>' }, `<button class="mini" data-rm="${p.id}">✕</button>`)).join('') : '<p class="empty">Aún no tienes amigos. Añádelos con su nombre o código.</p>';
      box.querySelectorAll('[data-rm]').forEach((e) => (e.onclick = async () => {
        if (await modal('¿Quitar a este amigo?', true)) { await PB.Online.removeFriend(e.dataset.rm); showFriends(); }
      }));
    } else if (frTab === 'requests') {
      box.innerHTML = reqs.length ? reqs.map((p) => prow({ ...p, sub: 'Quiere ser tu amigo' }, `<button class="mini ok" data-yes="${p.id}">✓</button><button class="mini" data-no="${p.id}">✕</button>`)).join('') : '<p class="empty">No tienes solicitudes.</p>';
      box.querySelectorAll('[data-yes]').forEach((e) => (e.onclick = async () => { await PB.Online.answerRequest(e.dataset.yes, true); PB.Audio.play('ready'); showFriends(); refreshLobby(); }));
      box.querySelectorAll('[data-no]').forEach((e) => (e.onclick = async () => { await PB.Online.answerRequest(e.dataset.no, false); showFriends(); refreshLobby(); }));
    } else {
      box.innerHTML = `<p class="empty">Tu código de amigo es <b>${PB.Save.get().tag}</b>. Busca a otros por su nombre o código.</p>`;
    }
    show('friends');
  }

  async function searchFriends() {
    const q = $('#fr-q').value;
    const list = await PB.Online.searchPlayers(q);
    const box = $('#fr-list');
    box.innerHTML = list.length ? list.map((p) => prow({ ...p, sub: p.tag }, p.friend ? '<span class="tagok">Amigo</span>' : p.sent ? '<span class="tagok">Enviada</span>' : `<button class="mini ok" data-add="${p.id}">＋</button>`)).join('') : '<p class="empty">No se ha encontrado a nadie.</p>';
    box.querySelectorAll('[data-add]').forEach((e) => (e.onclick = async () => { await PB.Online.addFriend(e.dataset.add); PB.Audio.play('ball'); searchFriends(); }));
  }

  // ------------------------------------------------------------------ clan
  const clanIcon = (c) => window.SPRITE_DATA[c.icon] ? window.SPRITE_DATA[c.icon].portrait : portrait(PB.BRAWLERS[0]);
  let chatTimer = null;

  async function showClan() {
    const c = await PB.Online.myClan();
    if (c) return showMyClan(c);
    $('#cl-title').textContent = 'Clanes';
    $('#cl-body').innerHTML =
      `<div class="search"><input id="cl-q" placeholder="Buscar clan por nombre"><button class="act blue" id="cl-go">Buscar</button><button class="act gold" id="cl-new">Crear clan · ${money(PB.META.clanCost, coinIcon)}</button></div>` +
      `<div id="cl-list" class="plist"></div>`;
    $('#cl-go').onclick = () => searchClans($('#cl-q').value);
    $('#cl-q').onkeydown = (e) => { if (e.key === 'Enter') searchClans($('#cl-q').value); };
    $('#cl-new').onclick = showCreateClan;
    show('clan');
    searchClans('');
  }

  async function searchClans(q) {
    const list = await PB.Online.searchClans(q);
    const box = $('#cl-list');
    if (!box) return;
    box.innerHTML = list.length ? '' : '<p class="empty">No hay clanes con ese nombre.</p>';
    for (const c of list) {
      const el = document.createElement('div');
      el.className = 'prow clanrow';
      el.innerHTML =
        `<img class="av" src="${clanIcon(c)}" alt="">` +
        `<div class="pinfo"><b>${c.name}</b><small>${c.count}/${PB.META.clanMax} · ${c.type === 'invite' ? '🔒 Solo invitación' : '🌐 Público'}</small></div>` +
        `<span class="pcopas"><img class="cup" src="${cupIcon()}" alt="">${c.copas.toLocaleString('es-ES')}</span>`;
      el.onclick = () => showOtherClan(c.id);
      box.appendChild(el);
    }
  }

  async function showOtherClan(id) {
    const c = await PB.Online.getClan(id);
    if (!c) return;
    $('#cl-title').textContent = c.name;
    const full = c.count >= PB.META.clanMax;
    const btnTxt = c.pending ? 'Solicitud enviada' : full ? 'Clan lleno' : c.type === 'invite' ? 'Pedir unirse' : 'Unirse';
    $('#cl-body').innerHTML =
      `<div class="clan-head"><img class="av big" src="${clanIcon(c)}" alt=""><div><p>${c.desc || ''}</p><small>${c.count}/${PB.META.clanMax} miembros · ${c.type === 'invite' ? '🔒 Solo invitación' : '🌐 Público'} · <img class="cup" src="${cupIcon()}" alt="">${c.copas.toLocaleString('es-ES')}</small></div></div>` +
      `<div class="row left"><button class="act gray" id="cl-back">← Volver</button><button class="act gold" id="cl-join" ${c.pending || full ? 'disabled' : ''}>${btnTxt}</button></div>` +
      `<div class="plist">${c.members.map((m, i) => prow({ ...m, pos: i + 1, sub: m.role })).join('')}</div>`;
    $('#cl-back').onclick = showClan;
    $('#cl-join').onclick = async () => {
      const r = await PB.Online.joinClan(c.id);
      if (r.error) return modal(r.error);
      if (r.pending) { PB.Audio.play('ball'); await modal('Solicitud enviada. Cuando el líder la acepte, entrarás en el clan.'); return showOtherClan(c.id); }
      PB.Audio.play('win');
      showClan();
    };
    show('clan');
  }

  function showCreateClan() {
    $('#cl-title').textContent = 'Crear clan';
    const icons = ['0025', '0004', '0007', '0001', '0074', '0092', '0143', '0100'];
    $('#cl-body').innerHTML =
      `<div class="form">` +
      `<label>Nombre<input id="cc-name" maxlength="20" placeholder="Nombre del clan"></label>` +
      `<label>Descripción<input id="cc-desc" maxlength="80" placeholder="¿Cómo es tu clan?"></label>` +
      `<label>Tipo<select id="cc-type"><option value="public">🌐 Público (cualquiera puede entrar)</option><option value="invite">🔒 Solo invitación</option></select></label>` +
      `<label>Escudo<div class="icons" id="cc-icons">${icons.map((d, i) => `<button data-ic="${d}" class="${i ? '' : 'sel'}"><img src="${window.SPRITE_DATA[d].portrait}" alt=""></button>`).join('')}</div></label>` +
      `<div class="row left"><button class="act gray" id="cc-back">← Volver</button><button class="act gold" id="cc-ok">Crear · ${money(PB.META.clanCost, coinIcon)}</button></div>` +
      `<p class="sub">Tienes ${PB.Save.get().coins} monedas. Máximo ${PB.META.clanMax} miembros por clan.</p></div>`;
    let icon = icons[0];
    $('#cc-icons').querySelectorAll('button').forEach((b) => (b.onclick = () => {
      icon = b.dataset.ic;
      $('#cc-icons').querySelectorAll('button').forEach((x) => x.classList.toggle('sel', x === b));
    }));
    $('#cc-back').onclick = showClan;
    $('#cc-ok').onclick = async () => {
      const r = await PB.Online.createClan({ name: $('#cc-name').value, desc: $('#cc-desc').value, type: $('#cc-type').value, icon });
      if (r.error) return modal(r.error);
      PB.Audio.play('win');
      showClan();
    };
    show('clan');
  }

  async function showMyClan(c) {
    $('#cl-title').textContent = c.name;
    $('#cl-body').innerHTML =
      `<div class="clan-head"><img class="av big" src="${clanIcon(c)}" alt=""><div><p>${c.desc || ''}</p><small>${c.count}/${PB.META.clanMax} miembros · ${c.type === 'invite' ? '🔒 Solo invitación' : '🌐 Público'} · <img class="cup" src="${cupIcon()}" alt="">${c.copas.toLocaleString('es-ES')}</small></div><button class="act gray" id="cl-leave">Abandonar</button></div>` +
      `<div class="clan-grid"><div class="plist">${c.members.map((m, i) => prow({ ...m, pos: i + 1, sub: m.role + (m.me ? '' : m.online ? ' · <span class="on">●</span>' : ' · <span class="off">●</span>') })).join('')}</div>` +
      `<div class="chat"><div id="chat-log"></div><div class="chat-in"><input id="chat-q" maxlength="140" placeholder="Escribe al clan…"><button class="act blue" id="chat-send">Enviar</button></div></div></div>`;
    $('#cl-leave').onclick = async () => {
      if (!(await modal('¿Seguro que quieres abandonar el clan?', true))) return;
      await PB.Online.leaveClan();
      showClan();
    };
    const send = async () => {
      const q = $('#chat-q');
      if (!q.value.trim()) return;
      await PB.Online.sendChat(q.value);
      q.value = '';
      renderChat();
    };
    $('#chat-send').onclick = send;
    $('#chat-q').onkeydown = (e) => { if (e.key === 'Enter') send(); };
    show('clan');
    renderChat();
  }

  async function renderChat() {
    const log = $('#chat-log');
    if (!log) return;
    const msgs = await PB.Online.chat();
    const hm = (t) => { const d = new Date(t); return d.getHours() + ':' + String(d.getMinutes()).padStart(2, '0'); };
    const esc = (t) => String(t).replace(/[&<>]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[ch]));
    log.innerHTML = msgs.map((m) => m.sys ? `<p class="sys">${esc(m.text)}</p>` : `<p class="${m.from === 'me' ? 'mine' : ''}"><b>${esc(m.name)}</b> ${esc(m.text)} <small>${hm(m.time)}</small></p>`).join('') || '<p class="sys">Aún no hay mensajes. ¡Saluda!</p>';
    log.scrollTop = log.scrollHeight;
  }

  // ------------------------------------------------------------------ ranking
  let rkTab = 'players';
  async function showRanking(tab) {
    if (tab) rkTab = tab;
    setTab('#rk-tabs', rkTab);
    const box = $('#rk-list');
    box.innerHTML = '<p class="empty">Cargando…</p>';
    show('ranking');
    if (rkTab === 'players') {
      const list = await PB.Online.topPlayers();
      const mine = list.find((p) => p.me);
      const top = list.slice(0, 50);
      box.innerHTML = top.map((p) => prow({ ...p, sub: p.clanName || 'Sin clan' })).join('') + (mine && mine.pos > 50 ? '<p class="sep">…</p>' + prow({ ...mine, sub: 'Tú' }) : '');
    } else {
      const list = await PB.Online.topClans();
      const my = await PB.Online.myClan();
      box.innerHTML = list.slice(0, 50).map((c) => prow({ name: c.name, copas: c.copas, pos: c.pos, avatar: clanIcon(c), sub: c.count + '/' + PB.META.clanMax + ' miembros', me: my && my.id === c.id })).join('');
    }
  }

  // ------------------------------------------------------------------ cofres
  // Fases: idle (flota) -> shake (tiembla al tocar) -> burst (revienta) -> reward (premios uno a uno) -> summary
  const CHEST_COL = { poke: [255, 90, 60], great: [80, 150, 255], ultra: [255, 210, 60] };
  let fx = []; // partículas de la apertura

  function openNextChest() {
    const i = PB.Save.nextChest();
    if (i >= 0) openChestScreen(i);
  }

  function openChestScreen(index) {
    const kind = PB.Save.get().chests[index];
    if (!kind) return;
    chest = { kind, index, state: 'idle', res: null, t: 0, items: [], cur: -1 };
    fx = [];
    $('#chest-name').textContent = PB.META.chests[kind].name;
    $('#chest-reward').innerHTML = '';
    $('#chest-summary').innerHTML = '';
    $('#chest-buttons').classList.add('hidden');
    $('#chest-hint').textContent = 'Toca para abrir';
    show('chestopen');
    resizeFx();
  }

  function resizeFx() {
    const cv = $('#chest-fx');
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = Math.round(window.innerWidth * dpr);
    cv.height = Math.round(window.innerHeight * dpr);
    cv.style.width = window.innerWidth + 'px';
    cv.style.height = window.innerHeight + 'px';
  }

  function rewardCard(it, big) {
    return `<div class="reward ${it.cls || ''} ${big ? 'big' : ''}"><img src="${it.icon}" alt=""><b>${it.title}</b><span>${it.sub}</span></div>`;
  }

  function chestTap(e) {
    if (!chest || (e && e.target.closest('button'))) return;
    if (chest.state === 'idle') {
      chest.state = 'shake';
      chest.t = 0;
      $('#chest-hint').textContent = '';
      PB.Audio.play('tick');
    } else if (chest.state === 'reward') {
      nextReward();
    } else if (chest.state === 'summary' && !PB.Save.get().chests.length) {
      closeChest();
    }
  }

  function burst() {
    chest.state = 'burst';
    chest.t = 0;
    chest.res = PB.Save.openChest(chest.index);
    const res = chest.res;
    const items = [];
    if (res.coins) items.push({ icon: coinIcon(), title: '+' + res.coins, sub: 'monedas' });
    if (res.points) items.push({ icon: starIcon(), title: '+' + res.points, sub: 'Puntos Pokémon' });
    for (const id of res.pokemon) {
      const b = PB.brawlerById(id);
      items.push({ icon: portrait(b), title: '¡' + b.name + '!', sub: 'Nuevo Pokémon', cls: 'new', pokemon: true });
    }
    chest.items = items;
    chest.cur = -1;
    PB.Audio.play('boom', { big: true });
    PB.Audio.play('release');
    PB.vibrate(60);
    // chispas y estrellas
    const W = window.innerWidth, H = window.innerHeight;
    const [r, g, bb] = CHEST_COL[chest.kind];
    for (let i = 0; i < 70; i++) {
      const a = Math.random() * Math.PI * 2, sp = 150 + Math.random() * 520;
      fx.push({ x: W / 2, y: H * 0.42, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 120, t: 0, life: 0.8 + Math.random() * 0.9, size: 4 + Math.random() * 7, col: i % 3 ? `rgb(${r},${g},${bb})` : '#ffffff', star: i % 4 === 0 });
    }
  }

  function nextReward() {
    chest.cur++;
    if (chest.cur < chest.items.length) {
      const it = chest.items[chest.cur];
      $('#chest-reward').innerHTML = rewardCard(it, true);
      $('#chest-hint').textContent = chest.cur < chest.items.length - 1 ? 'Toca para el siguiente premio' : 'Toca para continuar';
      PB.Audio.play(it.pokemon ? 'win' : 'candy');
      const W = window.innerWidth, H = window.innerHeight;
      for (let i = 0; i < (it.pokemon ? 40 : 16); i++) {
        const a = Math.random() * Math.PI * 2, sp = 80 + Math.random() * 260;
        fx.push({ x: W / 2, y: H * 0.42, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, t: 0, life: 0.7 + Math.random() * 0.5, size: 3 + Math.random() * 5, col: it.pokemon ? '#ffd23a' : '#ffffff', star: true });
      }
    } else {
      // resumen de todo lo que ha salido
      chest.state = 'summary';
      $('#chest-reward').innerHTML = '<div class="sum"><h3>Has conseguido</h3><div class="sum-items">' + chest.items.map((it) => rewardCard(it, false)).join('') + '</div></div>';
      const left = PB.Save.get().chests.length;
      $('#chest-buttons').classList.toggle('hidden', !left);
      if (left) {
        const nk = PB.Save.get().chests[PB.Save.nextChest()];
        $('#chest-again').textContent = 'Abrir ' + PB.META.chests[nk].name + ' (' + left + ')';
        $('#chest-hint').textContent = '';
      } else $('#chest-hint').textContent = 'Toca para volver';
    }
  }

  function closeChest() {
    chest = null;
    fx = [];
    show('lobby');
  }

  // Dibuja la apertura: rayos de luz, la Pokéball y las partículas
  function drawChest(dt) {
    const cv = $('#chest-fx'), c = cv.getContext('2d');
    const dpr = cv.width / window.innerWidth;
    const W = window.innerWidth, H = window.innerHeight;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, W, H);
    c.imageSmoothingEnabled = false;
    const cx = W / 2, cy = H * 0.42;
    const [r, g, bb] = CHEST_COL[chest.kind];
    const px = Math.max(6, Math.min(12, Math.min(W, H) / 40));
    chest.t += dt;
    const st = chest.state;

    // rayos de luz girando detrás
    const power = st === 'idle' ? 0.35 : st === 'shake' ? 0.35 + chest.t : st === 'burst' ? 1 : 0.55;
    c.save();
    c.translate(cx, cy);
    c.rotate(t * 0.4);
    for (let i = 0; i < 12; i++) {
      c.rotate((Math.PI * 2) / 12);
      const grd = c.createLinearGradient(0, 0, 0, -Math.max(W, H));
      grd.addColorStop(0, `rgba(${r},${g},${bb},${0.35 * power})`);
      grd.addColorStop(1, `rgba(${r},${g},${bb},0)`);
      c.fillStyle = grd;
      c.beginPath();
      c.moveTo(0, 0);
      c.lineTo(-40, -Math.max(W, H));
      c.lineTo(40, -Math.max(W, H));
      c.closePath();
      c.fill();
    }
    c.restore();
    // halo
    const halo = c.createRadialGradient(cx, cy, 0, cx, cy, px * 20);
    halo.addColorStop(0, `rgba(255,255,255,${0.25 + 0.3 * power})`);
    halo.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = halo;
    c.fillRect(cx - px * 20, cy - px * 20, px * 40, px * 40);

    const S = PB.Pokeball.SIZE * px;
    if (st === 'idle' || st === 'shake') {
      let ang = 0, oy = Math.sin(t * 2.5) * px * 1.2, ox = 0;
      if (st === 'idle') {
        const w = (t % 2) < 0.5 ? Math.sin((t % 2) * 25) * 0.18 : 0; // se balancea de vez en cuando
        ang = w;
      } else {
        const k = Math.min(1, chest.t / 0.8);
        ang = Math.sin(chest.t * 45) * (0.1 + k * 0.3);
        ox = Math.sin(chest.t * 60) * px * k;
        if (Math.floor(chest.t * 10) !== Math.floor((chest.t - dt) * 10)) PB.Audio.play('tick');
        if (chest.t > 0.8) burst();
      }
      // sombra
      c.fillStyle = 'rgba(0,0,0,0.35)';
      c.beginPath();
      c.ellipse(cx, cy + S * 0.62, S * 0.4, S * 0.08, 0, 0, Math.PI * 2);
      c.fill();
      PB.Pokeball.draw(c, cx + ox, cy + oy, px, { kind: chest.kind, angle: ang, variant: st === 'shake' && Math.floor(chest.t * 12) % 2 ? 'glow' : undefined });
    } else {
      // las dos mitades salen volando y se desvanecen
      const k = Math.min(1, chest.t / 0.6);
      if (k < 1) {
        const sp = PB.Pokeball.sprite('closed', chest.kind);
        const half = sp.height / 2;
        c.globalAlpha = 1 - k;
        c.save();
        c.translate(cx - k * px * 6, cy - k * px * 18);
        c.rotate(-k * 0.8);
        c.drawImage(sp, 0, 0, sp.width, half, -S / 2, -S / 2, S, S / 2);
        c.restore();
        c.save();
        c.translate(cx + k * px * 6, cy + k * px * 14);
        c.rotate(k * 0.6);
        c.drawImage(sp, 0, half, sp.width, half, -S / 2, 0, S, S / 2);
        c.restore();
        c.globalAlpha = 1;
      }
      // destello blanco
      if (st === 'burst') {
        c.fillStyle = `rgba(255,255,255,${Math.max(0, 0.9 - chest.t * 2)})`;
        c.fillRect(0, 0, W, H);
        if (chest.t > 0.45) { chest.state = 'reward'; nextReward(); }
      }
    }
    // partículas
    for (const f of fx) {
      f.t += dt;
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      f.vy += 260 * dt;
      f.vx *= 0.98;
      const a = Math.max(0, 1 - f.t / f.life);
      c.globalAlpha = a;
      c.fillStyle = f.col;
      if (f.star) {
        c.fillRect(f.x - f.size / 2, f.y - 1, f.size, 2);
        c.fillRect(f.x - 1, f.y - f.size / 2, 2, f.size);
      } else c.fillRect(f.x - f.size / 2, f.y - f.size / 2, f.size, f.size);
    }
    c.globalAlpha = 1;
    fx = fx.filter((f) => f.t < f.life);
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
      drawChest(dt);
    }
  }

  // ------------------------------------------------------------------ ajustes
  let stTab = 'sound';
  let stReturn = 'lobby';

  function openSettings(from) {
    stReturn = from || 'lobby';
    showSettings('sound');
  }

  function showSettings(tab) {
    if (tab) stTab = tab;
    setTab('#st-tabs', stTab);
    const S = PB.Settings;
    const body = $('#st-body');
    const toggle = (key, label, hint) =>
      `<div class="st-row"><div><b>${label}</b>${hint ? `<small>${hint}</small>` : ''}</div>` +
      `<button class="px-toggle ${S.get(key) ? 'on' : ''}" data-toggle="${key}"><i></i></button></div>`;
    const choice = (key, label, opts, hint) =>
      `<div class="st-row"><div><b>${label}</b>${hint ? `<small>${hint}</small>` : ''}</div><div class="px-seg">` +
      opts.map(([v, t]) => `<button data-choice="${key}" data-val="${v}" class="${S.get(key) === v ? 'sel' : ''}">${t}</button>`).join('') +
      '</div></div>';
    let html = '';
    if (stTab === 'sound') {
      html =
        `<div class="st-row"><div><b>Volumen</b><small id="vol-txt">${S.get('volume')} %</small></div>` +
        `<input type="range" class="px-range" id="st-vol" min="0" max="100" step="5" value="${S.get('volume')}"></div>` +
        toggle('muted', 'Silenciar todo') +
        toggle('vibration', 'Vibración', 'Al recibir golpes fuertes, súper listo y cofres (en móviles que lo permitan)') +
        `<div class="st-row"><div><b>Probar sonido</b></div><button class="act blue" id="st-test">▶ Probar</button></div>`;
    } else if (stTab === 'graphics') {
      html =
        choice('quality', 'Calidad de efectos', [['alta', 'Alta'], ['baja', 'Baja']], 'Baja: menos partículas y brillos, va mejor en móviles lentos') +
        toggle('shake', 'Temblor de pantalla', 'En explosiones, golpes y súper') +
        toggle('dmgNumbers', 'Números de daño') +
        toggle('hpNumbers', 'Vida en números', 'Encima de la barra de vida') +
        toggle('fps', 'Mostrar FPS');
    } else if (stTab === 'controls') {
      html =
        choice('joySize', 'Tamaño de los joysticks', [['pequeño', 'Pequeño'], ['mediano', 'Mediano'], ['grande', 'Grande']], 'Móvil') +
        toggle('leftHanded', 'Modo zurdo', 'El ataque y el súper pasan a la izquierda (móvil)') +
        toggle('autoAim', 'Disparo automático al tocar', 'Un toque rápido dispara al enemigo más cercano. Si lo quitas, dispara hacia donde miras') +
        toggle('aimGuide', 'Guía de apuntado en PC', 'Muestra siempre hacia dónde apuntas con el ratón') +
        `<div class="keys"><b>Teclas en PC</b><span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> mover</span><span><kbd>Clic</kbd> disparar</span>` +
        `<span><kbd>Espacio</kbd> disparo automático</span><span><kbd>E</kbd> / <kbd>Clic der.</kbd> súper</span><span><kbd>Q</kbd> súper automático</span><span><kbd>Esc</kbd> pausa</span><span><kbd>M</kbd> silenciar</span></div>`;
    } else {
      const d = PB.Save.get();
      html =
        `<div class="st-row"><div><b>${d.name}</b><small>Código de amigo: ${d.tag}</small></div><button class="act blue" id="st-profile">Perfil</button></div>` +
        `<div class="st-row"><div><b>Cuenta online</b><small>Pronto podrás entrar con Google o con tu correo para guardar el progreso en la nube.</small></div><button class="act gray" disabled>Próximamente</button></div>` +
        `<div class="st-row"><div><b>Créditos y licencias</b><small>Sprites, efectos, fuente y avisos legales</small></div><a class="act blue" href="CREDITS.md" target="_blank" rel="noopener">Ver</a></div>` +
        `<div class="st-row"><div><b>Restablecer ajustes</b></div><button class="act gray" id="st-reset">Restablecer</button></div>` +
        `<div class="st-row danger"><div><b>Borrar progreso</b><small>Pierdes Pokémon, niveles, copas, monedas y logros de este navegador</small></div><button class="act red" id="st-wipe">Borrar</button></div>` +
        `<p class="sub">Pocket Brawl · fangame gratuito y sin ánimo de lucro.</p>`;
    }
    body.innerHTML = html;
    body.querySelectorAll('[data-toggle]').forEach((b) => (b.onclick = () => {
      S.set(b.dataset.toggle, !S.get(b.dataset.toggle));
      PB.Audio.play('tick');
      showSettings();
    }));
    body.querySelectorAll('[data-choice]').forEach((b) => (b.onclick = () => {
      S.set(b.dataset.choice, b.dataset.val);
      PB.Audio.play('tick');
      showSettings();
    }));
    const vol = $('#st-vol');
    if (vol) {
      vol.oninput = () => { S.set('volume', +vol.value); $('#vol-txt').textContent = vol.value + ' %'; };
      vol.onchange = () => { PB.Audio.init(); PB.Audio.play('ball'); };
    }
    const test = $('#st-test');
    if (test) test.onclick = () => { PB.Audio.init(); PB.Audio.play('win'); PB.vibrate(40); };
    const prof = $('#st-profile');
    if (prof) prof.onclick = showProfile;
    const rs = $('#st-reset');
    if (rs) rs.onclick = async () => { if (await modal('¿Volver a los ajustes de fábrica?', true)) { S.reset(); showSettings(); } };
    const wipe = $('#st-wipe');
    if (wipe) wipe.onclick = async () => {
      if (!(await modal('¿Seguro? Se borrará TODO tu progreso de este navegador.', true))) return;
      if (!(await modal('Última confirmación: no se puede deshacer.', true))) return;
      PB.Save.reset();
      try { localStorage.removeItem('pb.online.mock'); } catch (e) {}
      location.reload();
    };
    show('settings');
  }

  // Rellena todas las imágenes de iconos pixel (data-icon) de la página
  function fillIcons() {
    for (const img of document.querySelectorAll('img.pxi[data-icon]')) {
      const n = img.dataset.icon;
      img.src = n === 'pokeball' ? ballIcon('poke', 2) : n === 'cup' ? cupIcon() : PB.PixUI.iconURL(n, 3);
    }
  }

  // ------------------------------------------------------------------ inicio
  function init(a) {
    api = a;
    PB.Save.load();
    $('#ico-coin').src = coinIcon();
    $('#ico-star').src = starIcon();
    $('#lb-hero').onclick = showCollection;
    $('#btn-pokemon').onclick = showCollection;
    $('#btn-missions').onclick = () => showMissions();
    $('#btn-mode').onclick = showModes;
    fillIcons();
    $('#btn-settings').onclick = () => openSettings('lobby');
    $('#st-back').onclick = () => (stReturn === 'pause' ? api.backToPause() : show('lobby'));
    document.querySelectorAll('#st-tabs button').forEach((b) => (b.onclick = () => showSettings(b.dataset.tab)));
    $('#ico-cup').src = cupIcon();
    $('#btn-profile').onclick = showProfile;
    $('#btn-achievements').onclick = () => showAchievements();
    $('#btn-friends').onclick = () => showFriends();
    $('#btn-clan').onclick = showClan;
    $('#btn-ranking').onclick = () => showRanking();
    for (const [sel, fn] of [['#ms-tabs', showMissions], ['#ach-tabs', showAchievements], ['#fr-tabs', showFriends], ['#rk-tabs', showRanking]]) {
      document.querySelectorAll(sel + ' button').forEach((b) => (b.onclick = () => fn(b.dataset.tab)));
    }
    $('#fr-go').onclick = searchFriends;
    $('#fr-q').onkeydown = (e) => { if (e.key === 'Enter') searchFriends(); };
    $('#pf-save').onclick = async () => {
      if (PB.Save.setName($('#pf-input').value)) { PB.Audio.play('ready'); showProfile(); }
      else modal('El nombre debe tener entre 3 y 16 caracteres.');
    };
    PB.Online.on('chat', () => { if (current === 'clan') renderChat(); });
    PB.Online.on('change', () => { if (current === 'clan') showClan(); if (current === 'friends') showFriends(); });
    for (const e of document.querySelectorAll('[data-back]')) e.onclick = () => show(e.dataset.back);
    $('#dt-back').onclick = showCollection;
    $('#chestopen').onclick = chestTap;
    $('#chest-widget').onclick = () => {
      if (PB.Save.get().chests.length) openNextChest();
      else { flashIn('#chest-widget'); PB.Audio.play('tick'); }
    };
    $('#chest-again').onclick = (e) => { e.stopPropagation(); openNextChest(); };
    $('#chest-close').onclick = (e) => { e.stopPropagation(); closeChest(); };
    window.addEventListener('resize', () => { if (current === 'chestopen') resizeFx(); });
  }

  return { init, show, tick, openSettings, refresh: refreshLobby, get current() { return current; } };
})();
