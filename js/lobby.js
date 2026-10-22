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
  // Moneda Arcoíris (skins shiny): moneda con franjas de colores
  const rainbowIcon = () => pixIcon('rainbow', 14, (c) => {
    const bands = ['#ff4a4a', '#ff9a2a', '#ffe23a', '#5ad85a', '#4aa8ff', '#9a6aff'];
    for (let y = 0; y < 14; y++) for (let x = 0; x < 14; x++) {
      const d = Math.hypot(x - 6.5, y - 6.5);
      if (d > 6.4) continue;
      let col = d > 5.4 ? '#3a2a5a' : bands[Math.min(5, Math.floor(((x + y) / 26) * 6))];
      if (d <= 5.4 && (x - 6.5) * -0.6 + (y - 6.5) * -0.8 > 3) col = '#ffffff';
      px(c, x, y, col);
    }
    for (const [x, y] of [[6, 4], [7, 5], [6, 6], [7, 7], [6, 8], [7, 9]]) px(c, x, y, '#ffffff');
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
    if (id === 'random') return pixIcon('mode-random', 40, (c) => {
      // dado: cuatro colores de los modos y una interrogación
      c.imageSmoothingEnabled = false;
      [['#3a7a3a', 0, 0], ['#5a2a78', 20, 0], ['#b8561a', 0, 20], ['#2a4a8a', 20, 20]].forEach(([col, x, y]) => { c.fillStyle = col; c.fillRect(x, y, 20, 20); });
      c.font = '34px "Jersey 10", monospace';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillStyle = '#10131c';
      c.fillText('?', 22, 23);
      c.fillStyle = '#ffd84a';
      c.fillText('?', 20, 21);
    });
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
  PB.Icons = { coin: coinIcon, star: starIcon, ball: ballIcon, candy: candyIcon, mode: modeIcon, cup: cupIcon, rainbow: rainbowIcon };

  const money = (n, ico) => `<span class="money"><img src="${ico()}" alt="">${n}</span>`;
  const portrait = (b) => PB.Sprites.portraitURL(b.dex);
  const rarityOf = (b) => PB.RARITY[b.rarity] || PB.RARITY.common;
  const typeTags = (b, types) => (types || b.types).map((ty) => `<i style="background:${PB.TYPE_INFO[ty].color}">${PB.TYPE_INFO[ty].name}</i>`).join('');

  // ------------------------------------------------------------------ pantallas
  // El inicio sale nada más entrar si no tienes cuenta (Google o correo): ahí eliges invitado,
  // Google o correo. Con cuenta se pasa directo a la lobby.
  let chosen = false;
  const welcomed = () => chosen;
  function setWelcomed() { chosen = true; }
  function show(id) {
    if (id === 'lobby' && !welcomed()) id = 'welcome';
    // jugador nuevo: primero el nombre y luego los iniciales
    if (id === 'lobby' && PB.Save.needsStarters() && !PB.Save.get().named) id = 'naming';
    if (id === 'naming') { $('#nm-input').value = ''; $('#nm-err').textContent = ''; setTimeout(() => $('#nm-input').focus(), 50); }
    if (id === 'lobby' && PB.Save.needsStarters()) id = 'starters';
    if (id === 'starters') renderStarters();
    current = id;
    for (const s of document.querySelectorAll('.screen')) s.classList.toggle('hidden', s.id !== id);
    if (id === 'lobby') { refreshLobby(); setTimeout(checkPatchNotes, 400); }
  }

  // ------------------------------------------------------------------ aviso de versión nueva
  // Cada 2 minutos (y al volver a la pestaña) mira si la página publicada carga una versión
  // más nueva de los scripts que la que tenemos. Si es así, avisa en la lobby con un botón para recargar.
  const loadedV = (() => { const m = /main\.js\?v=(\d+)/.exec([...document.scripts].map((x) => x.src).join(' ')); return m ? +m[1] : 0; })();
  let newVersion = false;
  async function checkUpdate() {
    if (newVersion || !loadedV || /^(localhost|127\.0\.0\.1)$/.test(location.hostname)) return;
    try {
      const html = await (await fetch(location.pathname + '?check=' + Date.now(), { cache: 'no-store' })).text();
      const m = /main\.js\?v=(\d+)/.exec(html);
      if (m && +m[1] > loadedV) { newVersion = true; $('#update-bar').classList.remove('hidden'); }
    } catch (e) {}
  }
  setInterval(checkUpdate, 120000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) checkUpdate(); });
  setTimeout(checkUpdate, 15000);

  // ------------------------------------------------------------------ notas de parche
  // La nota de la versión nueva sale una sola vez al entrar a la lobby.
  // Los jugadores nuevos no la ven (no tienen nada con qué comparar).
  const SEEN = 'pb.seenVersion';
  function checkPatchNotes() {
    if (current !== 'lobby' || !PB.PATCH_NOTES || !PB.PATCH_NOTES.length) return;
    let seen = null;
    try { seen = localStorage.getItem(SEEN); } catch (e) { return; }
    if (seen === PB.VERSION) return;
    const d = PB.Save.get();
    if (!seen && !(d.stats && d.stats.played)) { try { localStorage.setItem(SEEN, PB.VERSION); } catch (e) {} return; }
    showPatchNotes();
  }
  function showPatchNotes() {
    const n = PB.PATCH_NOTES[0];
    const t = n[PB.lang === 'es' ? 'es' : 'en'] || n.es;
    $('#patch-ver').textContent = 'v' + n.v;
    $('#patch-title').textContent = t.title;
    $('#patch-date').textContent = n.date;
    $('#patch-list').innerHTML = '';
    for (const [ico, txt] of t.items) {
      const li = document.createElement('li');
      const i = document.createElement('i');
      i.textContent = ico;
      li.appendChild(i);
      li.appendChild(document.createTextNode(txt));
      $('#patch-list').appendChild(li);
    }
    $('#patch').classList.remove('hidden');
    PB.Audio.play('ready');
  }

  function refreshLobby() {
    const d = PB.Save.get();
    $('#coins').textContent = d.coins;
    $('#points').textContent = d.points;
    $('#rainbow').textContent = d.rainbow || 0;
    const b = PB.brawlerById(d.selected);
    if (!b) return;
    $('#hero-name').textContent = b.name;
    $('#hero-lvl').textContent = 'Nv. ' + PB.Save.level(b.id);
    const M = PB.MODES[api.getMode()];
    const rnd = api.isRandom && api.isRandom();
    $('#mode-ico').src = modeIcon(rnd ? 'random' : M.id);
    $('#mode-name').textContent = rnd ? PB.T('Aleatorio') : M.name;
    renderModeLive();
    $('#pf-name').textContent = d.name;
    $('#pf-copas').textContent = PB.Save.totalCopas();
    $('#pf-avatar').src = PB.Sprites.portraitURL(d.avatarDex || b.dex);
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
    setBadge('#pass-badge', pend.pass);
    PB.Online.updateMe();
    renderPartySlots();
    // misiones de hoy (panel que solo se ve en PC)
    $('#lq-reset').textContent = timeLeft(PB.Save.nextReset('daily'));
    $('#lq-list').innerHTML = PB.Save.missions('daily').map((m) => {
      const k = Math.min(1, m.progress / m.n);
      return `<span class="lq-row${m.claimed ? ' claimed' : k >= 1 ? ' done' : ''}"><small>${m.text}</small><span class="bar"><i style="width:${Math.round(k * 100)}%"></i></span></span>`;
    }).join('');
    const ps = PB.Save.pass();
    $('#pass-season').textContent = 'Temporada ' + ps.season;
    $('#pass-lv').textContent = ps.level;
    $('#pass-fill').style.width = Math.round(ps.progress * 100) + '%';
    $('#btn-pass').classList.toggle('ready', pend.pass > 0);
    setBadge('#ach-badge', pend.achievements);
    if (!PB.Online.isGuest()) PB.Online.requests().then((r) => setBadge('#fr-badge', r.length));
  }

  function setBadge(sel, n) {
    const e = $(sel);
    e.textContent = n;
    e.classList.toggle('hidden', !n);
  }

  // ------------------------------------------------------------------ colección
  const colFilter = { q: '', type: '', gen: '', rar: '', own: 'all' };

  function showCollection() {
    // filtros: tipo y generación (se rellenan una vez)
    const ts = $('#col-type');
    if (!ts.options.length) {
      ts.innerHTML = '<option value="">Todos los tipos</option>' +
        Object.entries(PB.TYPE_INFO).map(([k, v]) => `<option value="${k}">${v.name}</option>`).join('');
      const gens = [...new Set(PB.BRAWLERS.map((b) => b.gen))].sort((x, y) => x - y);
      $('#col-gen').innerHTML = '<option value="">Todas las gen.</option>' + gens.map((g) => `<option value="${g}">Generación ${g}</option>`).join('');
      ts.onchange = () => { colFilter.type = ts.value; renderCollection(); };
      $('#col-rar').innerHTML = '<option value="">Todas las rarezas</option>' +
        Object.entries({ starter: 'Iniciales', common: 'Comunes', rare: 'Raros', epic: 'Épicos', legendary: 'Legendarios' }).map(([k, v]) => `<option value="${k}">${v}</option>`).join('');
      $('#col-rar').onchange = () => { colFilter.rar = $('#col-rar').value; renderCollection(); };
      $('#col-gen').onchange = () => { colFilter.gen = $('#col-gen').value; renderCollection(); };
      $('#col-q').oninput = () => { colFilter.q = $('#col-q').value.trim().toLowerCase(); renderCollection(); };
      document.querySelectorAll('#col-own button').forEach((bt) => (bt.onclick = () => {
        colFilter.own = bt.dataset.own;
        document.querySelectorAll('#col-own button').forEach((x) => x.classList.toggle('sel', x === bt));
        renderCollection();
      }));
    }
    renderCollection();
    show('collection');
  }

  function renderCollection() {
    const d = PB.Save.get();
    const grid = $('#col-grid');
    const F = colFilter;
    const names = (b) => [].concat(...(b.alts || [b.line])).map((dex) => PB.DEX[dex].name.toLowerCase()).join(' ');
    const list = PB.BRAWLERS.filter((b) => {
      const own = PB.Save.owned(b.id);
      if (F.own === 'mine' && !own) return false;
      if (F.own === 'locked' && own) return false;
      if (F.gen && b.gen !== +F.gen) return false;
      // el filtro de tipo mira toda la línea (Charmander sale en Volador por Charizard)
      if (F.type && ![].concat(...(b.alts || [b.line])).some((dex) => PB.DEX[dex].types.includes(F.type))) return false;
      if (F.rar && b.rarity !== F.rar) return false;
      if (F.q && !names(b).includes(F.q)) return false;
      return true;
    }).sort((x, y) => (PB.Save.owned(y.id) ? 1 : 0) - (PB.Save.owned(x.id) ? 1 : 0) || x.dex - y.dex);
    grid.innerHTML = list.map((b) => {
      const own = PB.Save.owned(b.id);
      const r = rarityOf(b);
      const shiny = own && PB.Save.skin(b.id) === 'shiny';
      return `<button class="card${own ? '' : ' locked'}${b.id === d.selected ? ' sel' : ''}" data-id="${b.id}" style="--rar:${r.color}">` +
        `<img class="pt" src="${portrait(b)}" alt="" loading="lazy">` +
        (shiny ? '<span class="shiny-tag">✦</span>' : '') +
        `<span class="nm">${b.name}</span>` +
        `<span class="tdots">${b.types.map((ty) => `<i style="background:${PB.TYPE_INFO[ty].color}"></i>`).join('')}</span>` +
        (own
          ? `<span class="lv">Nv. ${PB.Save.level(b.id)} · <img class="cup" src="${cupIcon()}" alt="">${PB.Save.copas(b.id)}</span>`
          : `<span class="lock">🔒</span><span class="cost">${money(PB.Save.unlockCost(b.id), starIcon)}</span>`) +
        `<span class="rar">${r.name}</span></button>`;
    }).join('');
    grid.querySelectorAll('.card').forEach((el) => (el.onclick = () => showDetail(el.dataset.id)));
    $('#col-empty').classList.toggle('hidden', list.length > 0);
    $('#col-count').textContent = Object.keys(d.owned).length + '/' + PB.BRAWLERS.length;
  }

  // ------------------------------------------------------------------ ficha
  let dtStage = 0; // fase que se ve en la ficha

  function showDetail(id) {
    detailId = id;
    dtStage = 0;
    renderDetail();
    show('detail');
  }

  function renderDetail() {
    const id = detailId;
    const b = PB.brawlerById(id);
    const d = PB.Save.get();
    const own = PB.Save.owned(id);
    const lvl = own ? PB.Save.level(id) : 1;
    const r = rarityOf(b);
    const L = { line: PB.Save.lineOf(id) }; // línea con la rama elegida
    const sm = PB.stageMul(b, dtStage);
    const scaleStats = (st) => Object.assign({}, st, { hp: Math.round(st.hp * sm), dmg: Math.round(st.dmg * sm), superDmg: Math.round(st.superDmg * sm) });
    const now = scaleStats(PB.statsAt(b, lvl));
    const next = lvl < PB.META.maxLevel ? scaleStats(PB.statsAt(b, lvl + 1)) : null;
    const plus = (k) => (next && own && next[k] !== now[k] ? ` <em>+${next[k] - now[k]}</em>` : '');
    $('#dt-name').textContent = PB.stageName(L, dtStage);
    const sdef = dtStage > 0 ? PB.retype(b, L.line, dtStage) : b;
    $('#dt-role').textContent = sdef.role + ' · Generación ' + b.gen;
    $('#dt-rar').textContent = r.name;
    $('#dt-rar').style.background = r.color;
    $('#dt-types').innerHTML = typeTags(b, PB.stageTypes(L, dtStage));
    $('#dt-desc').textContent = sdef.desc;
    // línea evolutiva: se puede tocar cada fase para verla
    const steps = PB.evoSteps(b);
    const branchPick = b.alts
      ? '<div class="evo-branch"><small>Evoluciona a:</small>' + b.alts.map((l, i) => {
        const fin = l[l.length - 1];
        return `<button class="evo-br${i === PB.Save.branch(id) ? ' sel' : ''}" data-br="${i}" title="${PB.DEX[fin].name}"><img src="${PB.Sprites.portraitURL(fin)}" alt=""></button>`;
      }).join('') + '</div>'
      : '';
    $('#dt-evo').innerHTML = branchPick + '<div class="evo-row">' + L.line.map((dex, i) =>
      (i ? '<span class="evo-arrow"></span>' : '') +
      `<button class="evo-st${i === dtStage ? ' sel' : ''}" data-st="${i}"><img src="${PB.Sprites.portraitURL(dex)}" alt=""><b>${PB.DEX[dex].name}</b>` +
      `<small>${i ? '+' + Math.round((PB.stageMul(b, i) - 1) * 100) + ' %' : 'Empieza así'}</small></button>`).join('') + '</div>' +
      '<p class="evo-note">Evoluciona en mitad de la partida al ganar EXP: haciendo daño, debilitando y con los objetivos del modo.</p>';
    document.querySelectorAll('#dt-evo .evo-st').forEach((e) => (e.onclick = () => { dtStage = +e.dataset.st; PB.Audio.play('tick'); renderDetail(); }));
    document.querySelectorAll('#dt-evo .evo-br').forEach((e) => (e.onclick = () => {
      PB.Save.setBranch(id, +e.dataset.br);
      dtStage = L.line.length - 1;
      PB.Audio.play('ball');
      renderDetail();
    }));
    let bar = '';
    for (let i = 1; i <= PB.META.maxLevel; i++) bar += `<i class="${i <= lvl && own ? 'on' : ''}"></i>`;
    $('#dt-level').innerHTML = `<b>Nivel ${own ? lvl : '-'}</b><span class="lvbar">${bar}</span>`;
    const shots = now.shots > 1 ? ` × ${now.shots}` : '';
    const si = (n) => `<img class="sti" src="${PB.PixUI.iconURL(n, 2)}" alt="">`;
    $('#dt-stats').innerHTML =
      (own ? `<tr><td><img class="sti" src="${cupIcon()}" alt="">Copas</td><td>${PB.Save.copas(id)}</td></tr>` : '') +
      `<tr><td>${si('heart')}Vida</td><td>${now.hp}${plus('hp')}</td></tr>` +
      `<tr><td>${si('sword')}Daño</td><td>${now.dmg}${shots}${plus('dmg')}</td></tr>` +
      (now.superDmg ? `<tr><td>${si('star')}Súper</td><td>${now.superDmg}${b.super.dps ? '/s' : ''}${plus('superDmg')}</td></tr>` : '') +
      `<tr><td>${si('bolt')}Velocidad</td><td>${now.speed}</td></tr>` +
      `<tr><td>${si('hourglass')}Recarga</td><td>${now.reload} s</td></tr>` +
      `<tr><td>${si('target')}Alcance</td><td>${Math.round((now.range || b.super.radius || 0) / PB.TILE * 10) / 10} casillas</td></tr>`;
    $('#dt-moves').innerHTML =
      `<div class="move"><b>Ataque · ${b.attack.name}</b><span>${moveText(b.attack, false)}</span></div>` +
      `<div class="move super"><b>Súper · ${b.super.name}</b><span>${moveText(b.super, true)}</span></div>` +
      (() => {
        // rama que cambia de tipo: al evolucionar cambian los ataques
        const last = L.line.length - 1;
        const nd = last > 0 ? PB.retype(b, L.line, last) : b;
        return nd === b ? '' : `<div class="move evo"><b>Al evolucionar a ${PB.DEX[L.line[last]].name}</b><span>${nd.role}: ${nd.attack.name} y súper ${nd.super.name}.</span></div>`;
      })();
    // skins: normal y shiny (se compra con Monedas Arcoíris)
    const sk = $('#dt-skins');
    if (PB.Save.shinyAvailable(id)) {
      const has = PB.Save.hasShiny(id), cur = PB.Save.skin(id);
      sk.innerHTML = `<b>Skin</b><div class="px-seg">` +
        `<button data-sk="normal" class="${cur === 'normal' ? 'sel' : ''}">Normal</button>` +
        `<button data-sk="shiny" class="${cur === 'shiny' ? 'sel' : ''}">✦ Shiny${has ? '' : ' · ' + money(PB.META.shinyCost, rainbowIcon)}</button></div>`;
      sk.querySelectorAll('[data-sk]').forEach((e) => (e.onclick = async () => {
        if (e.dataset.sk === 'normal') { PB.Save.setSkin(id, 'normal'); PB.Audio.play('tick'); return renderDetail(); }
        if (PB.Save.hasShiny(id)) { PB.Save.setSkin(id, 'shiny'); PB.Audio.play('ball'); return renderDetail(); }
        if (!own) return modal('Primero tienes que conseguir a este Pokémon.');
        if ((d.rainbow || 0) < PB.META.shinyCost) return modal(`Te faltan ${PB.META.shinyCost - (d.rainbow || 0)} Monedas Arcoíris. Salen en las Super Ball y sobre todo en las Ultra Ball.`);
        if (!(await modal(`¿Comprar la skin shiny de ${b.name} por ${PB.META.shinyCost} Monedas Arcoíris?`, true))) return;
        if (PB.Save.buyShiny(id)) { PB.Audio.play('win'); renderDetail(); flashIn('#dt-hero'); }
      }));
    } else sk.innerHTML = '';
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
      case 'spread': {
        // frase por partes (cada una se traduce)
        const T = PB.T;
        const extra = [m.pierce && !m.boomerang ? T('Atraviesa') : '', m.destroysWalls ? T('Rompe muros') : '', m.knockback ? T('Empuja') : '', m.stun ? T('Congela un momento') : ''].filter(Boolean);
        const main = m.count > 1 ? T('{n} proyectiles en abanico', { n: m.count }) : m.boomerang ? T('Un proyectil que va y vuelve') : m.homing ? T('Un proyectil teledirigido que persigue al rival') : T('Un proyectil');
        return main + '.' + (extra.length ? ' ' + extra.join('. ') + '.' : '');
      }
      case 'burst': return `Ráfaga de ${m.count} disparos rápidos.`;
      case 'melee': return 'Golpe cuerpo a cuerpo que barre a todos los que tiene delante.';
      case 'twin': return 'Dos disparos a la vez, en paralelo.';
      case 'lob': return 'Lanza por encima de los muros y explota al caer.';
      case 'zone': return m.heal ? 'Crea una zona que daña a los rivales y cura a tu equipo.' : 'Deja un charco venenoso que hace mucho daño a los rivales.';
      case 'dash': return 'Embestida rápida que daña y aturde.';
      case 'slam': return m.destroysWalls ? 'Golpe al suelo alrededor: daña, empuja y rompe muros.' : 'Onda alrededor que daña y lanza lejos a los rivales.';
      case 'stealth': return 'Te vuelves invisible y tu siguiente ataque hace más daño.';
      case 'nova': return `${m.count} ataques en todas direcciones que atraviesan.`;
      case 'boomerang': return 'Un proyectil enorme que va y vuelve: golpea a la ida y a la vuelta.';
      case 'chain': return `Un rayo que salta hasta ${m.count} rivales y los aturde.`;
      case 'beam': return 'Se carga un instante y sale un rayo larguísimo que atraviesa a todos.';
      case 'mines': return `${m.count} trampas en el suelo que explotan y aturden al pisarlas.`;
      case 'turret': return `Deja un orbe que dispara solo a los rivales durante ${m.dur} s.`;
      case 'barrier': return 'Escudo para ti y tu equipo cercano: recibís mucho menos daño.';
      case 'wish': return 'Cura de golpe a todo tu equipo cercano y le quita el aturdimiento.';
      case 'meteor': return 'Una lluvia de golpes cae sobre la zona que elijas.';
    }
    return isSuper ? 'Ataque especial.' : '';
  }

  // ------------------------------------------------------------------ elegir iniciales
  const spPick = { grass: null, fire: null, water: null };
  function renderStarters() {
    const cols = [['grass', 'Planta'], ['fire', 'Fuego'], ['water', 'Agua']];
    $('#sp-cols').innerHTML = cols.map(([ty, nm]) =>
      `<div class="sp-col" style="--tc:${PB.TYPE_INFO[ty].color}"><h3>${nm}</h3><div class="sp-grid">` +
      PB.STARTER_DEX[ty].map((dex) => {
        const b = PB.BRAWLERS.find((x) => x.dex === dex);
        return b ? `<button class="sp-mon${spPick[ty] === b.id ? ' sel' : ''}" data-ty="${ty}" data-id="${b.id}" title="${b.name}"><img src="${portrait(b)}" alt=""><small>${b.name}</small></button>` : '';
      }).join('') + '</div></div>').join('');
    document.querySelectorAll('.sp-mon').forEach((e) => (e.onclick = () => {
      spPick[e.dataset.ty] = e.dataset.id;
      PB.Audio.init();
      PB.Audio.play('ball');
      renderStarters();
    }));
    const picked = Object.values(spPick).filter(Boolean);
    $('#sp-pick').textContent = picked.length + '/3 elegidos' + (picked.length ? ': ' + picked.map((id) => PB.brawlerById(id).name).join(', ') : '');
    $('#sp-go').disabled = picked.length < 3;
  }

  function flashIn(sel) {
    const e = $(sel);
    e.classList.remove('pop');
    void e.offsetWidth;
    e.classList.add('pop');
  }

  // ------------------------------------------------------------------ modos
  // cuánta gente hay en cada modo ahora mismo (jugando / buscando)
  const liveTxt = (id) => {
    const L = PB.Online.live || { modes: {} };
    if (id === 'random') {
      // si hay gente buscando en algún modo, Aleatorio te lleva ahí
      const s = PB.MODE_ORDER.slice().sort((a, b) => ((L.modes[b] || {}).search || 0) - ((L.modes[a] || {}).search || 0))[0];
      const n = L.total || 0;
      if ((L.modes[s] || {}).search) return PB.T('Ahora: {m}', { m: PB.MODES[s].name }) + ' · ' + PB.T('{n} buscando', { n: L.modes[s].search });
      return n > 1 ? PB.T('{n} en línea', { n }) : '';
    }
    const m = L.modes[id] || {};
    const parts = [];
    if (m.play) parts.push(PB.T('{n} jugando', { n: m.play }));
    if (m.search) parts.push(PB.T('{n} buscando', { n: m.search }));
    return parts.join(' · ');
  };
  function renderModeLive() {
    const rnd = api.isRandom && api.isRandom();
    const t = liveTxt(rnd ? 'random' : api.getMode());
    const el = $('#mode-live');
    if (el) { el.textContent = t; el.classList.toggle('hidden', !t); }
  }
  function showModes() {
    const grid = $('#mp-grid');
    grid.innerHTML = '';
    const rnd = api.isRandom && api.isRandom();
    for (const id of ['random'].concat(PB.MODE_ORDER)) {
      const M = id === 'random' ? { name: PB.T('Aleatorio'), desc: PB.T('Te mete en el modo donde más gente está buscando partida ahora mismo.') } : PB.MODES[id];
      const el = document.createElement('button');
      el.className = 'mode-card2' + ((id === 'random' ? rnd : !rnd && id === api.getMode()) ? ' sel' : '') + (id === 'random' ? ' rnd' : '');
      el.dataset.mode = id;
      el.innerHTML = `<img src="${modeIcon(id)}" alt=""><b>${M.name}</b><span>${M.desc}</span><em class="mc-live"></em>`;
      el.onclick = () => { PB.Audio.play('ui'); api.setMode(id); showModes(); };
      grid.appendChild(el);
    }
    renderModesLive();
    show('modepick');
  }
  function renderModesLive() {
    for (const el of document.querySelectorAll('#mp-grid .mode-card2')) {
      const t = liveTxt(el.dataset.mode);
      const em = el.querySelector('.mc-live');
      em.textContent = t ? '● ' + t : '';
      em.classList.toggle('on', !!t);
    }
  }

  // Icono y texto de un premio de misión
  function rewardInfo(r) {
    if (r.kind === 'coins') return { icon: coinIcon(), label: '+' + r.amount };
    if (r.kind === 'points') return { icon: starIcon(), label: '+' + r.amount };
    if (r.kind === 'rainbow') return { icon: rainbowIcon(), label: '+' + r.amount };
    return { icon: ballIcon(r.kind, 2), label: PB.META.chests[r.kind].name };
  }

  // ------------------------------------------------------------------ jugar con amigos (sala)
  let toastT = null;
  function toast(text) {
    const e = $('#toast');
    e.textContent = text;
    e.classList.remove('hidden');
    clearTimeout(toastT);
    toastT = setTimeout(() => e.classList.add('hidden'), 2600);
  }

  const partyOthers = (p) => p.members.filter((m) => !m.me);
  const memberPortrait = (m) => {
    const b = PB.brawlerById(m.fav) || PB.BRAWLERS[0];
    return PB.Sprites.portraitURL(b.dex);
  };

  // los dos huecos al lado de tu Pokémon en el lobby
  function renderPartySlots() {
    const p = PB.Online.party();
    const others = p ? partyOthers(p) : [];
    let html = '';
    for (let i = 0; i < 2; i++) {
      const m = others[i];
      const side = i === 0 ? 'left' : 'right';
      if (m) {
        // su Pokémon se dibuja en el canvas; aquí solo va su nombre y si está listo
        html += `<button class="pslot ${side} filled${m.ready ? ' ready' : ''}" data-i="${i}">` +
          `<span class="ptag">${p.leader === m.id ? '<i class="crown">★</i>' : ''}<b>${m.name}</b><small>${m.ready ? '✓ ¡Listo!' : 'Esperando…'}</small></span></button>`;
      } else {
        html += `<button class="pslot ${side}" data-i="${i}"><span class="plus">+</span><small>Invitar</small></button>`;
      }
    }
    $('#party-slots').innerHTML = html;
    $('#party-slots').querySelectorAll('.pslot').forEach((e) => (e.onclick = showParty));
    // botón de jugar: el jefe juega; los demás marcan "listo"
    const play = $('#play');
    if (p && p.leader !== 'me') {
      const meM = p.members.find((m) => m.me);
      play.textContent = meM.ready ? 'CANCELAR' : '¡LISTO!';
      play.classList.toggle('waiting', !!meM.ready);
    } else {
      play.textContent = '¡JUGAR!';
      play.classList.toggle('waiting', !!p && !p.members.every((m) => m.ready));
    }
  }

  async function showParty() {
    show('party');
    renderParty();
    const fl = $('#pt-friends');
    fl.innerHTML = '<p class="sub">Cargando…</p>';
    const friends = await PB.Online.friends();
    renderFriendsInvite(friends);
  }

  function renderParty() {
    const p = PB.Online.party();
    const box = $('#pt-room');
    if (!p) {
      box.innerHTML = '<p class="pt-hint">La sala se crea cuando la necesitas: al invitar a alguien o al pedir tu código.</p>' +
        '<button class="act gold" id="pt-create">Crear sala</button>';
      $('#pt-create').onclick = async () => { await PB.Online.createParty(); PB.Audio.play('ball'); renderParty(); };
      return;
    }
    const lead = p.leader === 'me';
    box.innerHTML =
      `<div class="pt-code"><small>Código</small><b>${p.code}</b>` +
      `<button class="act blue" id="pt-copy">Copiar</button><button class="act blue" id="pt-share">Enviar</button></div>` +
      '<div class="pt-members">' + p.members.map((m) =>
        `<div class="pt-mem${m.me ? ' me' : ''}"><img src="${memberPortrait(m)}" alt=""><span><b>${m.me ? 'Tú' : m.name}${p.leader === m.id ? ' <i>★ jefe</i>' : ''}</b>` +
        `<small>${(PB.brawlerById(m.fav) || {}).name || ''} · ${m.ready ? '¡Listo!' : 'Esperando…'}</small></span>` +
        (!m.me && !PB.Online.isGuest() && !PB.Online.isFriend(m.id) ? `<button class="mini ok" data-addf="${m.id}" title="Añadir amigo">＋ Amigo</button>` : '') +
        (lead && !m.me ? `<button class="mini" data-kick="${m.id}">Echar</button>` : '') + '</div>').join('') +
      Object.keys(p.invited || {}).map(() => '<div class="pt-mem invited"><span><small>Invitación enviada…</small></span></div>').join('') +
      `</div><button class="act red" id="pt-leave">Salir de la sala</button>`;
    const link = location.origin + location.pathname + '?sala=' + p.code;
    $('#pt-copy').onclick = () => { navigator.clipboard && navigator.clipboard.writeText(link); toast('Enlace copiado: ' + p.code); };
    $('#pt-share').onclick = () => {
      if (navigator.share) navigator.share({ title: 'PokéVersus', text: PB.T('¡Únete a mi sala en PokéVersus! Código {code}', { code: p.code }), url: link }).catch(() => {});
      else { navigator.clipboard && navigator.clipboard.writeText(link); toast('Enlace copiado: ' + p.code); }
    };
    box.querySelectorAll('[data-kick]').forEach((e) => (e.onclick = () => PB.Online.kick(e.dataset.kick)));
    box.querySelectorAll('[data-addf]').forEach((e) => (e.onclick = async () => {
      const r = await PB.Online.addFriend(e.dataset.addf);
      if (r.error) return toast(r.error);
      PB.Audio.play('ball');
      e.replaceWith(Object.assign(document.createElement('span'), { className: 'tagok', textContent: PB.T('Solicitud enviada') }));
    }));
    $('#pt-leave').onclick = () => { PB.Online.leaveParty(); PB.Audio.play('tick'); };
  }

  function renderFriendsInvite(friends) {
    const p = PB.Online.party();
    const fl = $('#pt-friends');
    if (!friends.length) { fl.innerHTML = '<p class="sub">Aún no tienes amigos. Añádelos desde el menú Amigos.</p>'; return; }
    fl.innerHTML = friends.map((f) => {
      const inParty = p && p.members.some((m) => m.id === f.id);
      const invited = p && p.invited && p.invited[f.id];
      const btn = !f.online ? '<span class="pt-off">Desconectado</span>'
        : inParty ? '<span class="pt-on">En tu sala</span>'
        : invited ? '<span class="pt-on">Invitado…</span>'
        : `<button class="act gold" data-inv="${f.id}">Invitar</button>`;
      return `<div class="pt-friend${f.online ? '' : ' off'}"><img src="${memberPortrait(f)}" alt=""><span><b>${f.name}</b><small>${f.online ? '● Conectado' : 'Desconectado'} · ${f.copas} copas</small></span>${btn}</div>`;
    }).join('');
    fl.querySelectorAll('[data-inv]').forEach((e) => (e.onclick = async () => {
      if (!PB.Online.party()) await PB.Online.createParty();
      const r = await PB.Online.invite(e.dataset.inv);
      if (r.error) toast(r.error); else { PB.Audio.play('ball'); toast('Invitación enviada'); }
      renderParty();
      renderFriendsInvite(await PB.Online.friends());
    }));
  }

  // ¿Se puede empezar? (si estás en una sala de otro, el botón es "¡Listo!")
  function playPressed() {
    const p = PB.Online.party();
    if (!p) return true;
    const meM = p.members.find((m) => m.me);
    if (p.leader !== 'me') {
      PB.Online.setReady(!meM.ready);
      PB.Audio.play(meM.ready ? 'tick' : 'ready');
      return false;
    }
    if (!(api.isRandom && api.isRandom()) && PB.MODES[api.getMode()].ffa && p.members.length > 1) {
      modal('Niebla Tóxica es todos contra todos: no se puede jugar en grupo. Cambia de modo o sal de la sala.');
      return false;
    }
    if (!p.members.every((m) => m.ready)) { toast('Esperando a que todos estén listos'); return false; }
    return true;
  }

  // ------------------------------------------------------------------ pase de temporada
  function showPass() {
    const p = PB.Save.pass();
    const M = PB.META.pass;
    $('#ps-title').textContent = 'Temporada ' + p.season;
    $('#ps-level').textContent = p.level;
    $('#ps-fill').style.width = Math.round(p.progress * 100) + '%';
    $('#ps-xp').textContent = p.level >= p.max ? '¡Completado!' : Math.floor(p.xp % M.xpPerLevel) + ' / ' + M.xpPerLevel + ' EXP';
    $('#ps-how').innerHTML = `<span>Victoria <b>+${M.xpWin}</b></span><span>Derrota <b>+${M.xpLose}</b></span><span>Misión <b>+${M.xpMission}</b></span>`;
    $('#ps-ends').textContent = timeLeft(p.endsIn);
    const ready = p.rewards.filter((r) => r.ready && !r.claimed).length + p.extra;
    $('#ps-all').disabled = !ready;
    $('#ps-all').textContent = ready ? '¡Reclamar ' + ready + '!' : 'Todo reclamado';
    // color de la tarjeta según el premio principal
    const tone = (it) => (it.kind === 'ultra' ? 'ultra' : it.kind === 'great' ? 'great' : it.kind === 'poke' ? 'poke' : it.kind === 'rainbow' ? 'rainbow' : it.kind === 'coins' ? 'coins' : 'points');
    const icon = (it) => (['poke', 'great', 'ultra'].includes(it.kind) ? ballIcon(it.kind, 3) : rewardInfo(it).icon);
    const label = (it) => (['poke', 'great', 'ultra'].includes(it.kind) ? PB.META.chests[it.kind].name : rewardInfo(it).label);
    // la barra entre el punto N y el N+1 está hecha de la mitad derecha de la columna N y la
    // mitad izquierda de la N+1 (la primera columna solo tiene mitad derecha y la última solo izquierda)
    const L = p.level, prog = L >= p.max ? 1 : p.progress;
    const railFill = (lvl) => {
      const first = lvl === 1, last = lvl === p.max && !(L >= p.max);
      if (lvl < L || (lvl === L && L >= p.max)) return 1;
      if (lvl === L) return first ? Math.min(1, prog * 2) : 0.5 + Math.min(prog, 0.5);
      if (lvl === L + 1 && L > 0) { const k = Math.max(0, prog - 0.5); return last ? k * 2 : k; }
      return 0;
    };
    const cols = p.rewards.map((r) => {
      const st = r.claimed ? 'claimed' : r.ready ? 'ready' : 'locked';
      const main = r.items[0];
      const fill = railFill(r.lvl);
      const kind = r.lvl === p.max ? ' final' : r.lvl % 5 === 0 ? ' milestone' : '';
      return `<div class="ps-col ${st}${kind}" style="--fill:${fill}">` +
        (r.lvl === p.max ? '<span class="ps-ribbon">¡Premio final!</span>' : r.lvl % 5 === 0 ? '<span class="ps-ribbon small">Hito</span>' : '') +
        `<button class="ps-card t-${tone(main)}" data-lvl="${r.lvl}" ${st === 'ready' ? '' : 'disabled'}>` +
        r.items.map((it, i) => `<span class="ps-item${i ? ' sub' : ''}"><img src="${icon(it)}" alt=""><b>${label(it)}</b></span>`).join('') +
        `<span class="ps-state">${r.claimed ? '✓' : r.ready ? '¡Reclamar!' : ''}</span>` +
        `</button>` +
        `<div class="ps-rail"><i></i></div>` +
        `<span class="ps-dot">${r.lvl}</span>` +
        `</div>`;
    }).join('');
    const extra = p.level >= p.max
      ? `<div class="ps-col ${p.extra ? 'ready' : 'locked'} bonus" style="--fill:${p.progress}"><span class="ps-ribbon small">Extra</span>` +
        `<button class="ps-card t-poke" data-lvl="extra" ${p.extra ? '' : 'disabled'}><span class="ps-item"><img src="${ballIcon('poke', 3)}" alt=""><b>${p.extra ? '× ' + p.extra : 'Cada nivel'}</b></span>` +
        `<span class="ps-state">${p.extra ? '¡Reclamar!' : ''}</span></button><div class="ps-rail"><i></i></div><span class="ps-dot">+</span></div>`
      : '';
    const track = $('#ps-track');
    track.innerHTML = cols + extra;
    track.querySelectorAll('.ps-col.ready .ps-card').forEach((e) => (e.onclick = () => claimPassNode(e.dataset.lvl)));
    show('passscreen');
    // centra el siguiente nivel a conseguir (por dónde vas), de golpe y ya con la pantalla dibujada
    const cur = track.children[Math.min(p.level, track.children.length - 1)];
    const center = () => {
      if (!cur) return;
      const a = cur.getBoundingClientRect(), r = track.getBoundingClientRect();
      track.style.scrollBehavior = 'auto';
      track.scrollLeft += a.left - r.left - (r.width - a.width) / 2;
      track.style.scrollBehavior = '';
    };
    center();
    requestAnimationFrame(center);
  }

  function claimPassNode(lvl) {
    const items = lvl === 'extra' ? PB.Save.claimPassExtra() : PB.Save.claimPass(+lvl);
    if (!items) return;
    PB.Audio.play('ready');
    if (!openClaimedChest(items, 'pass')) showPass();
  }

  function claimAllPass() {
    const p = PB.Save.pass();
    let got = [];
    for (const r of p.rewards) if (r.ready && !r.claimed) got = got.concat(PB.Save.claimPass(r.lvl) || []);
    for (let i = 0; i < p.extra; i++) got = got.concat(PB.Save.claimPassExtra() || []);
    if (!got.length) return;
    PB.Audio.play('win');
    if (!openClaimedChest(got, 'pass')) showPass();
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
      btn.onclick = () => {
        const r = PB.Save.claimMission(msTab, i);
        PB.Audio.play('ready');
        if (!openClaimedChest([r], 'missions')) showMissions();
      };
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
        btn.onclick = () => {
          const r = PB.Save.claimAchievement(a.id);
          PB.Audio.play('win');
          if (!openClaimedChest(r || [], 'achievements')) showAchievements();
        };
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
      $('#modal-ok').textContent = withCancel ? 'SÍ' : 'VALE';
      $('#modal').classList.remove('hidden');
      $('#modal-ok').onclick = () => { $('#modal').classList.add('hidden'); resolve(true); };
      $('#modal-cancel').onclick = () => { $('#modal').classList.add('hidden'); resolve(false); };
    });
  }

  // ------------------------------------------------------------------ perfil
  function showProfile() {
    const d = PB.Save.get();
    const b = PB.brawlerById(d.selected);
    $('#pf-big').src = PB.Sprites.portraitURL(d.avatarDex || b.dex);
    $('#pf-input').value = d.name;
    $('#pf-tag').textContent = PB.T('Código de amigo: {tag}', { tag: d.tag });
    $('#pf-avatars').classList.add('hidden');
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
    renderAccount();
    show('profile');
  }

  // foto de perfil: cualquier fase de los Pokémon que tienes
  function renderAvatars() {
    const d = PB.Save.get();
    const dexes = [];
    for (const id of Object.keys(d.owned)) {
      const b = PB.brawlerById(id);
      if (b) for (const dex of PB.Save.lineOf(id)) if (!dexes.includes(String(dex))) dexes.push(String(dex));
    }
    $('#pf-av-grid').innerHTML = dexes.map((dex) => `<button class="${dex === d.avatarDex ? 'sel' : ''}" data-av="${dex}"><img src="${PB.Sprites.portraitURL(dex)}" alt="" loading="lazy"></button>`).join('');
    $('#pf-av-grid').querySelectorAll('[data-av]').forEach((e) => (e.onclick = () => {
      const dd = PB.Save.get();
      dd.avatarDex = e.dataset.av;
      // para el perfil público: el Pokémon (familia) de esa foto
      dd.avatar = (PB.BRAWLERS.find((x) => [].concat(...(x.alts || [x.line])).some((dx) => String(dx) === e.dataset.av)) || {}).id || dd.selected;
      PB.Save.persist();
      PB.Online.updateMe();
      PB.Audio.play('ready');
      showProfile();
      refreshLobby();
    }));
  }

  // cuenta: invitado o Google
  function renderAccount() {
    const a = PB.Online.account();
    const g = a && !a.anonymous;
    $('#pf-acc-text').textContent = !a ? PB.T('Sin conexión: tu progreso se guarda en este navegador.')
      : g ? PB.T('Has entrado como {email}. Tu progreso se guarda en la nube.', { email: a.email })
      : PB.T('Juegas como invitado: tu progreso se guarda en este navegador. Entra con Google para guardarlo en la nube y no perderlo.');
    $('#pf-google').classList.toggle('hidden', !!g);
    $('#pf-mail').classList.toggle('hidden', !!g);
    $('#pf-mail-form').classList.add('hidden');
    $('#pf-logout').classList.toggle('hidden', !g);
  }
  // pre = 'pf' (perfil) o 'wl' (pantalla de inicio)
  async function googleLogin(pre) {
    afterLogin(await PB.Online.loginGoogle(), pre);
  }
  async function mailLogin(create, pre) {
    const email = $('#' + pre + '-mail-email').value, pass = $('#' + pre + '-mail-pass').value;
    if (!email || !pass) return modal(PB.T('Escribe tu correo y tu contraseña.'));
    afterLogin(await PB.Online.emailAccount(email, pass, create), pre);
  }
  function showNaming(msg) {
    show('naming');
    $('#nm-err').textContent = msg || '';
  }
  async function afterLogin(r, pre) {
    if (r.cancelled) return;
    if (r.error) return modal(r.error);
    if (r.switched) {
      // otra cuenta: desde el inicio se carga directamente; desde el perfil se pregunta
      if (r.save && (pre === 'wl' || (await modal(PB.T('Esa cuenta ya tiene una partida guardada. ¿Cargarla? (sustituye a la de este navegador)'), true)))) PB.Save.importJSON(r.save);
      location.reload();
      return;
    }
    PB.Audio.play('win');
    toast(PB.T('Progreso guardado en tu cuenta'));
    const c = await PB.Online.claimName(PB.Save.get().name);
    if (c.error) {
      PB.Save.get().named = false;
      PB.Save.persist();
      setWelcomed();
      showNaming(PB.T('Ese nombre ya lo tiene otro jugador. Elige otro.'));
      return;
    }
    if (pre === 'wl') { setWelcomed(); show('lobby'); } else renderAccount();
  }
  function mailForm(pre) {
    $('#' + pre + '-mail').onclick = () => { $('#' + pre + '-mail-form').classList.toggle('hidden'); $('#' + pre + '-mail-email').focus(); };
    $('#' + pre + '-mail-login').onclick = () => mailLogin(false, pre);
    $('#' + pre + '-mail-create').onclick = () => mailLogin(true, pre);
    $('#' + pre + '-mail-pass').onkeydown = (e) => { if (e.key === 'Enter') mailLogin(false, pre); };
    $('#' + pre + '-mail-forgot').onclick = async () => {
      const email = $('#' + pre + '-mail-email').value;
      if (!email) return modal(PB.T('Escribe tu correo y te mandamos un enlace para cambiar la contraseña.'));
      const r = await PB.Online.resetPassword(email);
      modal(r.error || PB.T('Te hemos enviado un correo para cambiar la contraseña.'));
    };
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
  const clanIcon = (c) => PB.Sprites.portraitURL(c.icon) || portrait(PB.BRAWLERS[0]);
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
      `<div class="clan-head"><img class="av avbig" src="${clanIcon(c)}" alt=""><div><p>${c.desc || ''}</p><small>${c.count}/${PB.META.clanMax} miembros · ${c.type === 'invite' ? '🔒 Solo invitación' : '🌐 Público'} · <img class="cup" src="${cupIcon()}" alt="">${c.copas.toLocaleString('es-ES')}</small></div></div>` +
      `<div class="row left"><button class="act gray with-arrow" id="cl-back">Volver</button><button class="act gold" id="cl-join" ${c.pending || full ? 'disabled' : ''}>${btnTxt}</button></div>` +
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
      `<label>Escudo<div class="icons" id="cc-icons">${icons.map((d, i) => `<button data-ic="${d}" class="${i ? '' : 'sel'}"><img src="${PB.Sprites.portraitURL(d)}" alt=""></button>`).join('')}</div></label>` +
      `<div class="row left"><button class="act gray with-arrow" id="cc-back">Volver</button><button class="act gold" id="cc-ok">Crear · ${money(PB.META.clanCost, coinIcon)}</button></div>` +
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
      `<div class="clan-head"><img class="av avbig" src="${clanIcon(c)}" alt=""><div><p>${c.desc || ''}</p><small>${c.count}/${PB.META.clanMax} miembros · ${c.type === 'invite' ? '🔒 Solo invitación' : '🌐 Público'} · <img class="cup" src="${cupIcon()}" alt="">${c.copas.toLocaleString('es-ES')}</small></div><button class="act gray" id="cl-leave">Abandonar</button></div>` +
      `<div class="clan-grid"><div class="plist">${c.members.map((m, i) => prow({ ...m, pos: i + 1, sub: m.role + (m.me ? '' : m.online ? ' · <span class="on">●</span>' : ' · <span class="off">●</span>') })).join('')}</div>` +
      `<div class="chat"><div id="chat-log"></div><div class="chat-in"><input id="chat-q" maxlength="140" placeholder="Escribe al clan…"><button class="act blue" id="chat-send">Enviar</button></div></div></div>` +
      '<div id="cl-reqs"></div>';
    const meLead = c.members.some((m) => m.me && m.id === c.leader);
    if (meLead) {
      PB.Online.clanRequests().then((reqs) => {
        const box = $('#cl-reqs');
        if (!box || !reqs.length) return;
        box.innerHTML = `<h3>${PB.T('Quieren entrar')}</h3><div class="plist">` + reqs.map((p) => prow({ ...p, sub: PB.T('Solicitud para unirse') }, `<button class="mini ok" data-cy="${p.id}">✓</button><button class="mini" data-cn="${p.id}">✕</button>`)).join('') + '</div>';
        box.querySelectorAll('[data-cy]').forEach((e) => (e.onclick = async () => { const r = await PB.Online.answerClanRequest(e.dataset.cy, true); if (r.error) toast(r.error); showClan(); }));
        box.querySelectorAll('[data-cn]').forEach((e) => (e.onclick = async () => { await PB.Online.answerClanRequest(e.dataset.cn, false); showClan(); }));
      });
    }
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
      box.innerHTML = top.map((p) => prow({ ...p, sub: p.clanName || 'Sin clan' })).join('') + (mine && (mine.pos === '50+' || mine.pos > 50) ? '<p class="sep">…</p>' + prow({ ...mine, sub: 'Tú' }) : '');
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

  // Si el premio que se acaba de reclamar es un cofre, se abre en ese momento
  function openClaimedChest(rewards, from) {
    const kinds = ['ultra', 'great', 'poke'];
    const got = rewards.filter((r) => r && kinds.includes(r.kind)).sort((x, y) => kinds.indexOf(x.kind) - kinds.indexOf(y.kind));
    if (!got.length) return false;
    const i = PB.Save.get().chests.lastIndexOf(got[0].kind);
    if (i < 0) return false;
    openChestScreen(i, from);
    return true;
  }

  function openNextChest() {
    const i = PB.Save.nextChest();
    if (i >= 0) openChestScreen(i);
  }

  let chestReturn = 'lobby';
  function openChestScreen(index, from) {
    const kind = PB.Save.get().chests[index];
    if (!kind) return;
    if (from !== undefined) chestReturn = from || 'lobby';
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
    return `<div class="reward ${it.cls || ''} ${big ? 'large' : ''}"><img src="${it.icon}" alt=""><b>${it.title}</b><span>${it.sub}</span></div>`;
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
    if (res.rainbow) items.push({ icon: rainbowIcon(), title: '+' + res.rainbow, sub: 'Monedas Arcoíris' });
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
    // vuelve a donde estabas (misiones o logros si el cofre venía de ahí)
    const back = chestReturn;
    chestReturn = 'lobby';
    if (back === 'missions') showMissions();
    else if (back === 'pass') showPass();
    else if (back === 'achievements') showAchievements();
    else show('lobby');
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
  // Lobby: tu Pokémon en el centro y los de tu sala a los lados (como en Brawl Stars)
  function drawLobbyTeam(cv) {
    const c = cv.getContext('2d');
    const w = cv.width, h = cv.height;
    c.clearRect(0, 0, w, h);
    c.imageSmoothingEnabled = false;
    const p = PB.Online.party();
    const others = p ? p.members.filter((m) => !m.me) : [];
    const pedestal = (x, y, rx, glow) => {
      c.fillStyle = 'rgba(0,0,0,0.35)';
      c.beginPath();
      c.ellipse(x, y, rx, rx * 0.28, 0, 0, Math.PI * 2);
      c.fill();
      if (glow) {
        c.strokeStyle = glow;
        c.lineWidth = 4;
        c.beginPath();
        c.ellipse(x, y, rx + 4, rx * 0.28 + 3, 0, 0, Math.PI * 2);
        c.stroke();
      }
    };
    // amigos (detrás, un poco más pequeños)
    others.slice(0, 2).forEach((m, i) => {
      const b = PB.brawlerById(m.fav);
      if (!b) return;
      const x = i === 0 ? w * 0.15 : w * 0.85, y = h * 0.74;
      pedestal(x, y, 46, m.ready ? 'rgba(125,255,143,0.7)' : 'rgba(150,180,255,0.5)');
      if (!PB.Sprites.ready(b.dex)) PB.Sprites.ensure([b.dex]);
      PB.Sprites.draw(c, b.dex, 'Idle', Math.PI / 2, t + i * 0.7, x, y + 6, 3.6, 0);
    });
    // tú
    const me = PB.brawlerById(PB.Save.get().selected);
    if (!me) return;
    const shiny = PB.Save.skin(me.id) === 'shiny';
    pedestal(w / 2, h * 0.82, 70, 'rgba(255,210,60,' + (0.5 + Math.sin(t * 3) * 0.25) + ')');
    if (!PB.Sprites.ready(me.dex, shiny)) PB.Sprites.ensure([{ dex: me.dex, shiny }]);
    PB.Sprites.draw(c, me.dex, 'Idle', Math.PI / 2, t, w / 2, h * 0.82 + 10, 5, 0, shiny);
  }

  function drawHero(cv, dex, scale, glow, shiny) {
    if (!PB.Sprites.ready(dex, shiny)) PB.Sprites.ensure([{ dex, shiny }]);
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
    PB.Sprites.draw(c, dex, 'Idle', Math.PI / 2, t, w / 2, h * 0.8 + scale * 2, scale, 0, shiny);
  }

  function tick(dt) {
    t += dt;
    if (current === 'lobby') {
      drawLobbyTeam($('#hero-cv'));
    } else if (current === 'detail' && detailId) {
      const b = PB.brawlerById(detailId);
      drawHero($('#dt-cv'), PB.Save.lineOf(detailId)[dtStage] || b.dex, 4, PB.Save.owned(detailId), PB.Save.skin(detailId) === 'shiny');
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
        `<div class="st-row"><div><b>Idioma · Language</b><small>Se detecta solo; puedes cambiarlo aquí</small></div>` +
        `<select class="px-select" id="st-lang">${Object.entries(PB.LANGS).map(([k, v]) => `<option value="${k}" ${k === PB.lang ? 'selected' : ''}>${v}</option>`).join('')}</select></div>` +
        `<div class="st-row"><div><b>Volumen</b><small id="vol-txt">${S.get('volume')} %</small></div>` +
        `<input type="range" class="px-range" id="st-vol" min="0" max="100" step="5" value="${S.get('volume')}"></div>` +
        `<div class="st-row"><div><b>Música</b><small id="mus-txt">${S.get('music')} %</small></div>` +
        `<input type="range" class="px-range" id="st-mus" min="0" max="100" step="5" value="${S.get('music')}"></div>` +
        toggle('muted', 'Silenciar todo') +
        toggle('vibration', 'Vibración', 'Al recibir golpes fuertes, súper listo y cofres (en móviles que lo permitan)') +
        `<div class="st-row"><div><b>Probar sonido</b></div><button class="act blue" id="st-test">Probar</button></div>`;
    } else if (stTab === 'graphics') {
      html =
        choice('quality', 'Calidad de efectos', [['alta', 'Alta'], ['baja', 'Baja']], 'Baja: menos partículas y brillos, va mejor en móviles lentos') +
        choice('frame', 'Marco de las ventanas', [['dorado', 'Dorado'], ['verde', 'Verde'], ['celeste', 'Celeste'], ['rosa', 'Rosa']], 'Como en Pokémon Mundo Misterioso') +
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
        `<div class="st-row"><div><b>Apoyar el juego</b><small>Donación voluntaria para pagar servidores y dominio. No da nada dentro del juego.</small></div>` +
        (PB.DONATE_URL ? `<a class="act gold" href="${PB.DONATE_URL}" target="_blank" rel="noopener">Donar</a>` : `<button class="act gray" disabled>Próximamente</button>`) + `</div>` +
        `<div class="st-row"><div><b>Créditos y licencias</b><small>Sprites, efectos, fuente y avisos legales</small></div><a class="act blue" href="CREDITS.md" target="_blank" rel="noopener">Ver</a></div>` +
        `<div class="st-row"><div><b>Restablecer ajustes</b></div><button class="act gray" id="st-reset">Restablecer</button></div>` +
        `<div class="st-row danger"><div><b>Borrar progreso</b><small>Pierdes Pokémon, niveles, copas, monedas y logros de este navegador</small></div><button class="act red" id="st-wipe">Borrar</button></div>` +
        `<p class="sub">PokéVersus · fangame gratuito y sin ánimo de lucro.</p>`;
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
    const lang = $('#st-lang');
    if (lang) lang.onchange = () => PB.setLang(lang.value);
    const mus = $('#st-mus');
    if (mus) mus.oninput = () => { S.set('music', +mus.value); $('#mus-txt').textContent = mus.value + ' %'; PB.Audio.init(); };
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
    $('#ico-rainbow').src = rainbowIcon();
    $('#sp-go').onclick = () => {
      const ids = [spPick.grass, spPick.fire, spPick.water];
      if (ids.some((x) => !x) || !PB.Save.chooseStarters(ids)) return;
      PB.Audio.play('win');
      show('lobby');
    };
    $('#lb-hero').onclick = showCollection;
    $('#btn-pokemon').onclick = showCollection;
    $('#btn-missions').onclick = () => showMissions();
    $('#btn-mode').onclick = showModes;
    $('#btn-pass').onclick = showPass;
    // en pantallas bajas (móvil en horizontal) los iconos pequeños suben a la barra de arriba
    const icons = document.querySelector('.lb-icons'), menu = document.querySelector('.lb-menu'), top = $('#lb-top-icons');
    const mq = window.matchMedia('(max-height: 520px)');
    const placeIcons = () => (mq.matches ? top.appendChild(icons) : menu.appendChild(icons));
    placeIcons();
    if (mq.addEventListener) mq.addEventListener('change', placeIcons); else mq.addListener(placeIcons);
    // donar: abre Ko-fi en otra pestaña (no da nada dentro del juego)
    $('#btn-donate').onclick = () => { if (PB.DONATE_URL) window.open(PB.DONATE_URL, '_blank', 'noopener'); };
    $('#lb-quests').onclick = () => showMissions('daily');
    $('#pt-go').onclick = async () => {
      const r = await PB.Online.joinByCode($('#pt-code').value);
      if (r.error) return toast(r.error);
      PB.Audio.play('ready');
      $('#pt-code').value = '';
      show('lobby');
    };
    $('#pt-code').onkeydown = (e) => { if (e.key === 'Enter') $('#pt-go').click(); };
    PB.Online.on('party', (info) => {
      if (info && info.joined) toast('¡' + info.joined + ' se ha unido a tu sala!');
      if (info && info.declined) toast(info.declined + ' no puede jugar ahora');
      if (info && info.joinedRoom) toast('Te has unido a la sala de ' + info.joinedRoom);
      if (current === 'lobby') renderPartySlots();
      if (current === 'party') { renderParty(); PB.Online.friends().then(renderFriendsInvite); }
    });
    PB.Online.on('invite', async (inv) => {
      if (PB.Match && PB.Match.busy) return;
      PB.Audio.play('ready');
      if (await modal(PB.T('{name} te invita a su sala. ¿Quieres unirte?', { name: inv.name }), true)) {
        const r = await PB.Online.joinByCode(inv.code);
        if (r.error) toast(r.error); else show('lobby');
      }
    });
    PB.Online.on('party', (info) => { if (info && info.kicked) toast(PB.T('Has salido de la sala')); });
    $('#pf-google').onclick = () => googleLogin('pf');
    $('#pf-av-btn').onclick = () => { renderAvatars(); $('#pf-avatars').classList.toggle('hidden'); PB.Audio.play('tick'); };
    $('#pf-copy').onclick = () => {
      const tag = PB.Save.get().tag;
      if (navigator.clipboard) navigator.clipboard.writeText(tag).catch(() => {});
      toast(PB.T('Código copiado: {tag}. Tus amigos pueden buscarte con él.', { tag }));
    };
    mailForm('pf');
    $('#wl-google').onclick = () => googleLogin('wl');
    mailForm('wl');
    $('#wl-guest').onclick = async () => {
      PB.Audio.play('ready');
      $('#wl-guest').disabled = true;
      await PB.Online.guest(); // sin internet se juega igual (solo con bots)
      $('#wl-guest').disabled = false;
      setWelcomed();
      show('lobby');
    };
    // con sesión de Google o correo ya abierta, directo a la lobby
    PB.Online.on('auth', (a) => {
      if (a && !a.anonymous) { setWelcomed(); if (current === 'welcome') show('lobby'); }
    });
    $('#pf-logout').onclick = async () => { if (await modal(PB.T('¿Cerrar sesión? En este navegador volverás a jugar como invitado.'), true)) PB.Online.logout(); };
    // enlace de invitación: ?sala=CODIGO
    const sala = new URLSearchParams(location.search).get('sala');
    if (sala) PB.Online.joinByCode(sala).then((r) => { if (r.error) toast(r.error); history.replaceState(null, '', location.pathname); });
    $('#ps-all').onclick = claimAllPass;
    fillIcons();
    // la Pokéball como imagen para el CSS (cabeceras, botón de jugar, tarjetas)
    document.documentElement.style.setProperty('--ico-ball', 'url("' + ballIcon('poke', 2) + '")');
    document.documentElement.style.setProperty('--ico-ball-great', 'url("' + ballIcon('great', 2) + '")');
    // flechas pixel para volver, cursores de menú y la línea evolutiva
    for (const [v, n] of [['--ico-arrow-l', 'arrowL'], ['--ico-arrow-lw', 'arrowLw'], ['--ico-arrow-r', 'arrowR'], ['--ico-arrow-rd', 'arrowRd']]) {
      document.documentElement.style.setProperty(v, 'url("' + PB.PixUI.iconURL(n, 3) + '")');
    }
    $('#btn-settings').onclick = () => openSettings('lobby');
    $('#game-ver').textContent = PB.VERSION;
    $('#update-go').onclick = () => { PB.Audio.play('ui'); location.reload(); };
    $('#btn-news').onclick = () => { PB.Audio.play('ui'); showPatchNotes(); };
    $('#patch-ok').onclick = () => {
      PB.Audio.play('ui');
      $('#patch').classList.add('hidden');
      try { localStorage.setItem(SEEN, PB.VERSION); } catch (e) {}
    };
    $('#st-back').onclick = () => (stReturn === 'pause' ? api.backToPause() : show('lobby'));
    document.querySelectorAll('#st-tabs button').forEach((b) => (b.onclick = () => showSettings(b.dataset.tab)));
    $('#ico-cup').src = cupIcon();
    $('#btn-profile').onclick = showProfile;
    $('#btn-achievements').onclick = () => showAchievements();
    // amigos, clanes y ranking son para cuentas registradas (los invitados pueden jugar online igual)
    const needAccount = (fn) => () => {
      if (!PB.Online.isGuest()) return fn();
      PB.Audio.play('tick');
      $('#wl-note').classList.remove('hidden');
      $('#wl-guest').textContent = PB.T('Seguir como invitado');
      show('welcome');
    };
    $('#btn-friends').onclick = needAccount(() => showFriends());
    $('#btn-clan').onclick = needAccount(showClan);
    $('#btn-ranking').onclick = needAccount(() => showRanking());
    for (const [sel, fn] of [['#ms-tabs', showMissions], ['#ach-tabs', showAchievements], ['#fr-tabs', showFriends], ['#rk-tabs', showRanking]]) {
      document.querySelectorAll(sel + ' button').forEach((b) => (b.onclick = () => fn(b.dataset.tab)));
    }
    $('#fr-go').onclick = searchFriends;
    $('#fr-q').onkeydown = (e) => { if (e.key === 'Enter') searchFriends(); };
    $('#pf-save').onclick = async () => {
      const name = $('#pf-input').value.trim();
      if (name === PB.Save.get().name) return;
      const r = await PB.Online.claimName(name);
      if (r.error) return modal(r.error);
      PB.Save.setName(r.name);
      PB.Online.updateMe();
      PB.Audio.play('ready');
      showProfile();
    };
    // elegir nombre (jugador nuevo)
    const pickName = async () => {
      const btn = $('#nm-go');
      btn.disabled = true;
      const r = await PB.Online.claimName($('#nm-input').value);
      btn.disabled = false;
      if (r.error) { $('#nm-err').textContent = r.error; PB.Audio.play('tick'); return; }
      PB.Save.setName(r.name);
      PB.Save.get().named = true;
      PB.Save.persist();
      PB.Online.updateMe();
      PB.Audio.play('ready');
      show('lobby');
    };
    $('#nm-go').onclick = pickName;
    $('#nm-input').onkeydown = (e) => { if (e.key === 'Enter') pickName(); };
    PB.Online.on('chat', () => { if (current === 'clan') renderChat(); });
    PB.Online.on('live', () => { if (current === 'modepick') renderModesLive(); if (current === 'lobby') renderModeLive(); });
    PB.Online.on('change', () => { if (current === 'clan') showClan(); if (current === 'friends') showFriends(); });
    for (const e of document.querySelectorAll('[data-back]')) e.onclick = () => show(e.dataset.back);
    $('#dt-back').onclick = showCollection;
    $('#chestopen').onclick = chestTap;
    $('#chest-widget').onclick = () => {
      chestReturn = 'lobby';
      if (PB.Save.get().chests.length) openNextChest();
      else { flashIn('#chest-widget'); PB.Audio.play('tick'); }
    };
    $('#chest-again').onclick = (e) => { e.stopPropagation(); openNextChest(); };
    $('#chest-close').onclick = (e) => { e.stopPropagation(); closeChest(); };
    window.addEventListener('resize', () => { if (current === 'chestopen') resizeFx(); });
  }

  return { init, show, tick, openSettings, toast, refresh: refreshLobby, playPressed, get current() { return current; } };
})();
