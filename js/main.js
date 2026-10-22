// Pantallas, bucle principal y unión de todas las piezas.
(function () {
  const $ = (s) => document.querySelector(s);
  const canvas = $('#game');
  const renderer = new PB.Renderer(canvas);
  const input = new PB.Input(canvas);

  let game = null;
  let bots = [];
  let mode = 'menu'; // 'menu' (partida de fondo entre bots) | 'play' | 'end'
  const load = (key, ok, def) => {
    try {
      const v = localStorage.getItem(key);
      return ok(v) ? v : def;
    } catch (e) {
      return def;
    }
  };
  const save = (key, v) => {
    try { localStorage.setItem(key, v); } catch (e) {}
  };
  let gameMode = load('pb.mode', (v) => PB.MODES[v], 'gems');
  // "Aleatorio": al pulsar jugar se elige el modo donde hay más gente buscando (o jugando)
  // (los jugadores nuevos empiezan en Aleatorio: así la mayoría coincide en el mismo modo)
  let randomMode = load('pb.modeRandom', (v) => v === '1' || v === '0', '1') === '1';
  let endTimer = 0;
  let heartT = 0;
  let spectate = 0;
  // Partida en red (null = partida normal en este navegador):
  // { role: 'host'|'client', link, seats: { peerId: idx }, myIdx, host|client, remotes, sendT, inT, lastIn }
  let net = null;

  const shuffle = (a) => {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  // Elige quién juega (sin crear todavía la partida)
  function plan(playerId) {
    const ids = PB.BRAWLERS.map((b) => b.id);
    const M = PB.MODES[gameMode];
    const opts = { mode: gameMode, playerInBlue: !!playerId, noCountdown: !playerId, mapIdx: PB.pickMap(PB.MODES[gameMode].map) };
    if (M.ffa) {
      const n = M.players || 10;
      const list = [];
      for (let i = 0; i < n; i++) list.push(ids[Math.floor(Math.random() * ids.length)]);
      if (playerId) list[0] = playerId;
      opts.ffa = list;
    } else if (playerId) {
      // los de tu sala juegan contigo; los huecos que falten, bots
      const party = PB.Online.party();
      const mates = party ? party.members.filter((m) => !m.me).map((m) => m.fav).filter((id) => PB.brawlerById(id)) : [];
      opts.partyNames = party ? party.members.filter((m) => !m.me).map((m) => m.name) : [];
      opts.blue = [playerId, ...mates, ...shuffle(ids.filter((i) => i !== playerId)).slice(0, 2 - mates.length)];
      opts.red = shuffle(ids.slice()).slice(0, 3);
    } else {
      opts.blue = shuffle(ids.slice()).slice(0, 3);
      opts.red = shuffle(ids.slice()).slice(0, 3);
    }
    // rama de evolución de cada uno: la que eligió el jugador; los bots, una al azar
    const all = [].concat(opts.ffa || [], opts.blue || [], opts.red || []);
    opts.lines = all.map((id, i) => {
      const b = PB.brawlerById(id);
      if (playerId && i === 0) return PB.Save.lineOf(id);
      return b.alts ? b.alts[Math.floor(Math.random() * b.alts.length)] : b.line;
    });
    return opts;
  }

  // Sprites que necesita una partida: todas las fases de cada Pokémon (y el shiny del jugador)
  function spritesFor(opts, playerId) {
    const list = [];
    const all = [].concat(opts.ffa || [], opts.blue || [], opts.red || []);
    all.forEach((id, i) => {
      const shiny = opts.shiny ? !!opts.shiny[i] : !!playerId && i === 0 && PB.Save.skin(id) === 'shiny';
      for (const dex of opts.lines[i] || PB.brawlerById(id).line) list.push({ dex, shiny });
    });
    return list;
  }

  function newGame(playerId, opts, myIdx) {
    opts = opts || plan(playerId);
    PB.Sprites.ensure(spritesFor(opts, playerId));
    game = new PB.Game(opts);
    if (opts.humans) return setupNetGame(opts, myIdx);
    if (game.player) game.player.shiny = PB.Save.skin(playerId) === 'shiny';
    // nombre del entrenador de cada uno (para la pantalla final)
    const names = shuffle(PB.TRAINER_NAMES.slice());
    game.brawlers.forEach((b, i) => {
      const friend = !game.mode.ffa && opts.partyNames && b.team === (game.player || {}).team && i >= 1 && i <= opts.partyNames.length;
      b.trainer = b.isPlayer ? PB.Save.get().name : friend ? opts.partyNames[i - 1] : names[i % names.length];
      b.friend = !!friend;
      b.isBot = !b.isPlayer && !friend; // los que rellenan la partida
      b.name = b.trainer; // encima de cada Pokémon sale el nombre del jugador
    });
    // niveles: el jugador usa el suyo; los bots, uno parecido para que sea justo
    const myLvl = playerId ? PB.Save.level(playerId) : 1;
    for (const b of game.brawlers) {
      const lvl = b.isPlayer ? myLvl : Math.max(1, Math.min(PB.META.maxLevel, myLvl + Math.floor(Math.random() * 3) - 1));
      const k = PB.levelMul(lvl);
      b.lvl = lvl;
      b.lvlMul = k;
      b.maxHp = b.hp = Math.round(b.def.hp * k);
    }
    // Bots de nivel normal tirando a alto; se vuelven algo mejores con tus copas
    // (como el emparejamiento: cuantas más copas, rivales más duros)
    const copas = playerId ? PB.Save.copas(playerId) : 0;
    const foeSkill = Math.min(0.85, 0.6 + copas / 4000);
    const allySkill = Math.min(0.75, 0.52 + copas / 5000);
    bots = game.brawlers
      .filter((b) => !b.isPlayer)
      .map((b) => new PB.Bot(game, b, playerId ? (b.team === game.player.team ? allySkill : foeSkill) : 0.5));
    const f = game.player || game.brawlers[0];
    renderer.cam.x = f.x;
    renderer.cam.y = f.y;
    spectate = 0;
  }

  // Partida en red: opts.humans[idx] = { name, lvl, shiny } de cada persona; el resto, bots.
  function setupNetGame(opts, myIdx) {
    const names = opts.names || shuffle(PB.TRAINER_NAMES.slice());
    const humanLvls = Object.values(opts.humans).map((h) => h.lvl || 1);
    const avg = Math.round(humanLvls.reduce((a, b) => a + b, 0) / humanLvls.length);
    game.brawlers.forEach((b, i) => {
      const h = opts.humans[i];
      b.isPlayer = i === myIdx;
      b.isBot = !h;
      b.trainer = b.name = h ? h.name : names[i % names.length];
      b.shiny = !!(h && h.shiny);
      const lvl = h ? h.lvl || 1 : opts.botLvls ? opts.botLvls[i] : Math.max(1, Math.min(PB.META.maxLevel, avg + Math.floor(Math.random() * 3) - 1));
      b.lvl = lvl;
      b.lvlMul = PB.levelMul(lvl);
      b.maxHp = b.hp = Math.round(b.def.hp * b.lvlMul);
    });
    const me = game.brawlers[myIdx];
    game.brawlers.forEach((b, i) => { b.friend = !!opts.humans[i] && i !== myIdx && !game.mode.ffa && b.team === me.team; });
    // los bots solo piensan en el anfitrión (los demás ven lo que él les manda)
    const skill = Math.min(0.85, 0.6 + (opts.copas || 0) / 4000);
    bots = net && net.role === 'host' ? game.brawlers.filter((b) => !opts.humans[b.idx]).map((b) => new PB.Bot(game, b, skill)) : [];
    renderer.cam.x = me.x;
    renderer.cam.y = me.y;
    spectate = 0;
  }

  // Empieza una partida en red. link = canal hacia los demás (lo crea js/online.js):
  //   link.send(peerId | null, msg), link.onMessage = (peerId, msg) => ..., link.onLeave = (peerId) => ..., link.close()
  // host: opts.humans[idx] y seats (peerId -> idx) ya decididos; client: espera el mensaje 'start' del anfitrión.
  async function startNetMatch({ role, link, opts, seats, myIdx, mid }) {
    net = { role, link, seats: seats || {}, myIdx, mid, round: 0, humans: {}, remotes: {}, sendT: 0, inT: 0, lastIn: '', fullT: 0, gone: false };
    if (bgTimer) bgTimer.postMessage(role === 'host');
    link.onMessage = (peer, m) => onNetMessage(peer, m);
    link.onLeave = (peer) => onNetLeave(peer);
    if (role === 'host') {
      for (const [peer, idx] of Object.entries(net.seats)) net.remotes[idx] = new PB.Net.Remote();
      // nombres y niveles de los bots: los decide el anfitrión para que todos vean lo mismo
      const n = [].concat(opts.ffa || [], opts.blue || [], opts.red || []).length;
      const lv = Object.values(opts.humans).map((h) => h.lvl || 1);
      const avg = Math.round(lv.reduce((a, b) => a + b, 0) / lv.length);
      opts.names = shuffle(PB.TRAINER_NAMES.slice());
      if (opts.mapIdx == null) opts.mapIdx = PB.pickMap(PB.MODES[opts.mode].map);
      opts.botLvls = Array.from({ length: n }, () => Math.max(1, Math.min(PB.META.maxLevel, avg + Math.floor(Math.random() * 3) - 1)));
      net.humans = Object.assign({}, net.seats, { [link.me]: myIdx });
      link.send(null, { k: 'start', opts, seats: net.seats, hostIdx: myIdx });
      await beginMatch(opts, myIdx);
    }
  }

  async function beginMatch(opts, myIdx) {
    goLandscape();
    PB.Audio.init();
    PB.Settings.apply();
    gameMode = opts.mode;
    $('#loading h1').textContent = PB.T('Preparando a los Pokémon…');
    showScreen('loading');
    await PB.Sprites.ensure(spritesFor(opts, null));
    newGame(null, opts, myIdx);
    PB.Online.countMatch(opts.mode);
    PB.Online.setPlaying(true, opts.mode);
    if (net.role === 'host') net.host = new PB.Net.Host(game);
    else { net.client = new PB.Net.Client(game, myIdx); net.link.send(net.hostPeer, { k: 'hello' }); }
    // en red, la partida no se para aunque abras el menú
    try { localStorage.setItem('pb.netMatch', JSON.stringify({ t: Date.now(), mode: opts.mode, id: game.brawlers[myIdx].def.id })); } catch (e) {}
    PB.Audio.music(SONG_OF[gameMode] || 'battle');
    mode = 'play';
    paused = false;
    input.enabled = true;
    endTimer = 0;
    hideScreens();
    $('#btn-pause').classList.remove('hidden');
  }

  function onNetMessage(peer, m) {
    if (!net) return;
    if (net.role === 'host') {
      const idx = net.seats[peer];
      if (idx === undefined) return;
      if (m.k === 'i') net.remotes[idx] && net.remotes[idx].push(m);
      else if (m.k === 'hello' && net.host) net.link.send(peer, Object.assign({ k: 's', ack: 0 }, net.host.snapshot(true)));
      else if (m.k === 'bye') onNetLeave(peer);
    } else {
      if (m.k === 'start' && !game_isNet()) {
        net.hostPeer = peer;
        net.seats = m.seats;
        net.humans = Object.assign({}, m.seats, { [peer]: m.hostIdx });
        net.myIdx = m.seats[net.link.me];
        beginMatch(m.opts, net.myIdx);
      }
      else if (m.k === 's' && net.client) net.client.apply(m);
      else if (m.k === 'left') { const i = net.humans[m.u]; delete net.humans[m.u]; if (game.brawlers[i]) game.brawlers[i].isBot = true; }
      else if (m.k === 'bye') onNetLeave(peer);
    }
  }
  const game_isNet = () => !!(net && (net.host || net.client));

  // alguien se va: en el anfitrión, su Pokémon pasa a ser un bot; si se va el anfitrión, la partida no cuenta
  function onNetLeave(peer) {
    if (!net) return;
    if (net.role === 'host') {
      const idx = net.seats[peer];
      if (idx === undefined) return;
      delete net.seats[peer];
      delete net.remotes[idx];
      delete net.humans[peer];
      net.link.send(null, { k: 'left', u: peer });
      const b = game.brawlers[idx];
      if (b && !game.winner) {
        b.isBot = true;
        bots.push(new PB.Bot(game, b, 0.6));
        game.feed.push({ killer: b.name, kdex: null, victim: PB.T('se ha desconectado'), vdex: null, team: b.team, t: game.time, info: true });
      }
    } else if (peer === net.hostPeer && mode === 'play' && !game.winner && !net.migrating) {
      migrateHost();
    }
  }

  // Se ha ido el anfitrión: el primero de los que quedan (por orden) toma el relevo con la
  // partida tal y como iba. Si solo quedas tú, sigues contra los bots y la partida cuenta.
  async function migrateHost() {
    const old = net.hostPeer, me = net.link.me;
    delete net.humans[old];
    const left = Object.keys(net.humans).sort();
    const newHost = left[0];
    net.migrating = true;
    net.round++;
    const oldIdx = game.brawlers.findIndex((b) => !b.isBot && b !== game.player && !Object.values(net.humans).includes(b.idx));
    const oldB = game.brawlers[oldIdx];
    if (oldB) game.feed.push({ killer: oldB.name, kdex: null, victim: PB.T('se ha desconectado'), vdex: null, team: oldB.team, t: game.time, info: true });
    renderer.announce(PB.T('Cambiando de anfitrión…'), '#ffe066', '', 2.5);
    try { net.link.close(); } catch (e) {}
    const cur = net;
    let r = null;
    const onPeer = (u) => {
      // un jugador ha vuelto a conectar con el nuevo anfitrión
      if (!net || net.humans[u] === undefined) return;
      net.seats[u] = net.humans[u];
      net.remotes[net.humans[u]] = new PB.Net.Remote();
    };
    try { r = await PB.Online.migrate(net.mid, net.round, newHost === me, newHost === me ? left.filter((u) => u !== me) : newHost, onPeer); } catch (e) { r = null; }
    if (net !== cur || mode !== 'play') return;
    if (!r) {
      // no ha habido manera: la partida no cuenta
      endNet();
      try { localStorage.removeItem('pb.netMatch'); } catch (e) {}
      PB.Lobby.toast(PB.T('El anfitrión se ha desconectado. Esta partida no cuenta.'));
      toMenu();
      return;
    }
    net.link = r.link;
    r.link.onMessage = (peer, m) => onNetMessage(peer, m);
    r.link.onLeave = (peer) => onNetLeave(peer);
    if (newHost === me) {
      becomeHost();
      // los que no vuelven en unos segundos pasan a ser bots
      r.done.then((ok) => {
        if (!net || net !== cur) return;
        for (const u of Object.keys(net.humans)) {
          if (u === me || ok.has(u)) continue;
          const b = game.brawlers[net.humans[u]];
          delete net.humans[u];
          if (b) { b.isBot = true; bots.push(new PB.Bot(game, b, 0.65)); }
        }
      });
    } else {
      net.hostPeer = newHost;
      net.client = new PB.Net.Client(game, net.myIdx);
      r.link.send(newHost, { k: 'hello' });
    }
    net.migrating = false;
  }

  // Pasa de jugador a anfitrión: la partida ya la tengo (por las fotos); faltan los bots
  function becomeHost() {
    const c = net.client;
    game.brawlers.forEach((b, i) => {
      if (c && c.target[i] && i !== net.myIdx) { b.x = c.target[i].x; b.y = c.target[i].y; }
      if (b.dash && !b.dash.hit) b.dash.hit = new Set();
    });
    for (const p of game.projectiles) if (!p.hit) p.hit = new Set();
    game.timers = [];
    game.nextShotId = 100000 + Math.floor(Math.random() * 100000);
    game.events.length = 0;
    net.role = 'host';
    net.client = null;
    // (los jugadores que van volviendo se añaden en onPeer)
    for (const u of Object.keys(net.seats)) if (!net.remotes[net.seats[u]]) delete net.seats[u];
    const humanIdx = new Set(Object.values(net.humans));
    const skill = 0.65;
    bots = [];
    for (const b of game.brawlers) {
      if (humanIdx.has(b.idx)) continue;
      b.isBot = true;
      bots.push(new PB.Bot(game, b, skill));
    }
    net.host = new PB.Net.Host(game);
    net.sendT = 0;
    net.fullT = 0;
    if (bgTimer) bgTimer.postMessage(true);
  }

  function endNet() {
    if (!net) return;
    if (bgTimer) bgTimer.postMessage(false);
    try { net.link.send(null, { k: 'bye' }); } catch (e) {}
    try { net.link.close(); } catch (e) {}
    net = null;
  }

  // Cada fotograma en red: el anfitrión manda fotos; los demás, sus controles
  function netStep(dt, read) {
    if (net.role === 'host') {
      net.host.takeEvents(game.events);
      net.sendT -= dt;
      net.fullT -= dt;
      if (net.sendT <= 0) {
        net.sendT = 0.05;
        const full = net.fullT <= 0;
        if (full) net.fullT = 4;
        const snap = net.host.snapshot(full);
        for (const [peer, idx] of Object.entries(net.seats)) net.link.send(peer, Object.assign({ k: 's', ack: net.remotes[idx] ? net.remotes[idx].ack : 0 }, snap));
      }
    } else if (net.client) {
      const inp = read && mode === 'play' && !paused ? read.input : {};
      net.inT -= dt;
      const key = Math.round((inp.mx || 0) * 10) + ',' + Math.round((inp.my || 0) * 10);
      if (inp.attack || inp.super || key !== net.lastIn || net.inT <= 0) {
        net.inT = 0.1;
        net.lastIn = key;
        net.link.send(net.hostPeer, Object.assign({ k: 'i' }, net.client.input(inp)));
      }
      net.client.step(dt, inp);
    }
  }

  function showScreen(id) {
    for (const s of document.querySelectorAll('.screen')) s.classList.toggle('hidden', s.id !== id);
  }

  const isTouch = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
  const portraitMq = window.matchMedia && window.matchMedia('(pointer: coarse) and (orientation: portrait)');
  const mustRotate = () => !!(portraitMq && portraitMq.matches);

  // En móvil: pantalla completa y bloqueo en horizontal (funciona en Android; iPhone no lo permite).
  function goLandscape() {
    if (!isTouch) return;
    const el = document.documentElement;
    const fs = el.requestFullscreen || el.webkitRequestFullscreen;
    try {
      const p = fs && !document.fullscreenElement ? fs.call(el) : null;
      Promise.resolve(p)
        .then(() => screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape'))
        .catch(() => {});
    } catch (e) {}
  }

  const help = () => $('#help');

  function hideScreens() {
    for (const sc of document.querySelectorAll('.screen')) sc.classList.add('hidden');
  }

  let starting = false;
  async function startMatch() {
    if (starting) return;
    starting = true;
    goLandscape();
    PB.Audio.init();
    PB.Settings.apply();
    // descarga los sprites de los 6 Pokémon (con sus evoluciones) antes de empezar
    const id = PB.Save.get().selected;
    const opts = plan(id);
    const wait = PB.Sprites.ensure(spritesFor(opts, id));
    const slow = setTimeout(() => {
      $('#loading h1').textContent = PB.T('Preparando a los Pokémon…');
      showScreen('loading');
    }, 120);
    await wait;
    clearTimeout(slow);
    starting = false;
    newGame(id, opts);
    PB.Online.countMatch(gameMode);
    PB.Online.setPlaying(true, gameMode);
    PB.Audio.music(SONG_OF[gameMode] || 'battle');
    mode = 'play';
    paused = false;
    input.enabled = true;
    endTimer = 0;
    hideScreens();
    $('#btn-pause').classList.remove('hidden');
    help().classList.remove('hidden');
    setTimeout(() => help().classList.add('hidden'), 6000);
  }

  // música de cada modo
  const SONG_OF = { gems: 'battle', heist: 'battle', showdown: 'showdown', ball: 'arena', zone: 'arena' };

  function toMenu() {
    // salir a mitad de una partida en red cuenta como abandono (derrota)
    if (net && mode === 'play' && game && !game.winner && (net.client || net.host)) {
      try { PB.Save.applyAbandon(JSON.parse(localStorage.getItem('pb.netMatch'))); } catch (e) {}
    }
    endNet();
    try { localStorage.removeItem('pb.netMatch'); } catch (e) {}
    PB.Online.setPlaying(false);
    PB.Audio.music('menu');
    mode = 'menu';
    paused = false;
    input.enabled = false;
    newGame(null);
    PB.Lobby.show('lobby');
    $('#btn-pause').classList.add('hidden');
    help().classList.add('hidden');
  }

  // ------------------------------------------------------------ pausa
  let paused = false;
  function pause() {
    if (mode !== 'play' || game.winner) return;
    if (net) { input.enabled = false; showScreen('pause'); return; } // en red el juego sigue
    paused = true;
    input.enabled = false;
    showScreen('pause');
  }
  function resume() {
    paused = false;
    input.enabled = mode === 'play';
    hideScreens();
  }
  $('#btn-pause').onclick = pause;
  $('#pz-resume').onclick = resume;
  $('#pz-settings').onclick = () => PB.Lobby.openSettings('pause');
  $('#pz-quit').onclick = toMenu;

  function showEnd() {
    try { localStorage.removeItem('pb.netMatch'); } catch (e) {}
    PB.Online.setPlaying(false);
    PB.Audio.music(null);
    mode = 'end';
    input.enabled = false;
    $('#btn-pause').classList.add('hidden');
    const me = game.player;
    const M = game.mode;
    const res = M.result(game, me);
    $('#result').textContent = res.title;
    $('#result').className = res.cls;
    const statTxt = (b) => (M.id === 'zone' ? Math.round(b.stat) + ' s' : M.id === 'heist' ? short(b.stat) : Math.round(b.stat));
    const short = (n) => (n >= 1000 ? (Math.round(n / 100) / 10).toString().replace('.', ',') + 'k' : String(Math.round(n)));
    // el mejor de la partida (MVP): más K.O. y daño
    const score = (b) => b.kills * 2500 + b.dmgDone + (b.stat || 0) * (M.id === 'heist' ? 0.5 : M.id === 'zone' ? 40 : 800);
    const top = game.brawlers.reduce((x, y) => (score(y) > score(x) ? y : x));
    const mvp = score(top) > 0 ? top : null;
    const row = (b) => {
      const dex = b.line[b.stage] || b.dex;
      const lvl = b.lvl ? ' · Nv. ' + b.lvl : '';
      return `<div class="end-row${b.isPlayer ? ' me' : ''}">` +
        (M.ffa ? `<span class="er-rank">#${b.rank || '-'}</span>` : '') +
        `<span class="er-pt"><img src="${PB.Sprites.portraitURL(dex)}" alt="">${b === mvp ? '<i class="er-mvp">MVP</i>' : ''}</span>` +
        `<span class="er-name"><b>${b.trainer || b.name}${b.isBot ? '<i class="bot-tag">BOT</i>' : b.friend ? '<i class="bot-tag friend">AMIGO</i>' : ''}</b><small>${PB.stageName(b, b.stage)}${lvl}</small></span>` +
        `<span class="er-st"><b>${b.kills}</b><small>K.O.</small></span>` +
        `<span class="er-st"><b>${b.deaths}</b><small>Caídas</small></span>` +
        `<span class="er-st"><b>${statTxt(b)}</b><small>${M.statName}</small></span>` +
        `<span class="er-st"><b>${short(b.dmgDone)}</b><small>Daño</small></span></div>`;
    };
    if (M.ffa) {
      const list = game.brawlers.slice().sort((a2, b2) => (a2.rank || 99) - (b2.rank || 99) || b2.kills - a2.kills);
      $('#end-teams').innerHTML = `<div class="end-team ffa"><div class="et-rows">${list.map(row).join('')}</div></div>`;
    } else {
      const team = (t, title) => {
        const list = game.brawlers.filter((b) => b.team === t).sort((a2, b2) => (b2.isPlayer ? 1 : 0) - (a2.isPlayer ? 1 : 0) || b2.kills - a2.kills);
        const won = game.winner === t;
        return `<div class="end-team ${t === me.team ? 'blue' : 'red'}"><h3>${title}${won ? ' · <em>Victoria</em>' : ''}</h3><div class="et-rows">${list.map(row).join('')}</div></div>`;
      };
      $('#end-teams').innerHTML = team(me.team, 'Tu equipo') + team(me.team === 'blue' ? 'red' : 'blue', 'Rivales');
    }
    $('#end-mode').textContent = M.name;
    // recompensas: fichas, cofres nuevos y misiones
    const win = M.ffa ? (me.rank || 99) <= 4 : game.winner === me.team;
    const reward = PB.Save.applyMatch({ win, draw: game.winner === 'draw', rank: me.rank, mode: M.id, me });
    const d = PB.Save.get();
    const pct = Math.round((100 * d.tokens) / PB.META.tokensPerChest);
    const pend = PB.Save.pending();
    const dc = reward.copas;
    $('#end-rewards').innerHTML =
      `<div class="copas-change ${dc > 0 ? 'up' : dc < 0 ? 'down' : ''}"><img src="${PB.Icons.cup()}" alt=""><b>${dc > 0 ? '+' : ''}${dc}</b><small>${me.def.name}: ${reward.copasNow} copas</small></div>` +
      `<div class="pill pay"><img src="${PB.Icons.coin()}" alt=""><b>+${reward.coins}</b><img src="${PB.Icons.star()}" alt=""><b>+${reward.points}</b>` +
      (reward.rainbow ? `<img src="${PB.Icons.rainbow()}" alt=""><b>+${reward.rainbow}</b>` : '') + `</div>` +
      `<div class="tokens"><img src="${PB.Icons.ball('poke', 2)}" alt=""><div class="tok-info"><small>${PB.T('+{n} fichas', { n: reward.tokens })}${reward.bonus ? ' ' + PB.T('(¡dobles!)') : ''} · ${PB.T('+{n} EXP de pase', { n: reward.passXp })}${reward.passUp ? ' ' + PB.T('¡Sube de nivel!') : ''}</small><span class="bar"><i style="width:${pct}%"></i></span></div><b>${d.tokens}/${PB.META.tokensPerChest}</b></div>` +
      `<p class="got">${[
        reward.newChests.length ? (reward.newChests.length > 1 ? PB.T('¡{n} Poké Balls nuevas!', { n: reward.newChests.length }) : PB.T('¡Poké Ball nueva!')) : '',
        pend.missions ? (pend.missions > 1 ? PB.T('{n} misiones para reclamar', { n: pend.missions }) : PB.T('1 misión para reclamar')) : '',
        pend.achievements ? (pend.achievements > 1 ? PB.T('{n} logros nuevos', { n: pend.achievements }) : PB.T('1 logro nuevo')) : '',
      ].filter(Boolean).join(' · ')}</p>`;
    setupEndButtons();
    showScreen('end');
    // las recompensas suben contando
    for (const el of document.querySelectorAll('#end-rewards b')) {
      const m = /^([+-]?)(\d+)(.*)$/.exec(el.textContent);
      if (!m || +m[2] < 2) continue;
      const to = +m[2], t0 = performance.now();
      const stepN = () => {
        const k = Math.min(1, (performance.now() - t0) / 700);
        el.textContent = m[1] + Math.round(to * (1 - Math.pow(1 - k, 3))) + m[3];
        if (k < 1) requestAnimationFrame(stepN);
      };
      stepN();
    }
    help().classList.add('hidden');
    PB.Online.saveCloud(true);
    PB.Online.updateMe();
    PB.Audio.play(res.cls === 'win' ? 'win' : 'lose');
  }

  // ------------------------------------------------------------ fin de partida: otra / revancha en grupo
  // Solo: "Buscar otra". En una sala con amigos: "Volver a jugar" es una votación de 10 s;
  // cuando votan todos, el jefe busca partida; si alguien vuelve a la sala, se cancela.
  let rematchSeen = null, rematchMsg = '', rematchStarting = false, voteIv = null;
  const inGroup = () => { const p = PB.Online.party(); return p && p.members.length > 1 ? p : null; };
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  function setupEndButtons() {
    rematchSeen = null;
    rematchMsg = '';
    rematchStarting = false;
    const again = $('#again'), back = $('#back');
    again.disabled = false;
    again.classList.remove('voted');
    if (inGroup()) {
      back.textContent = PB.T('Volver a la sala');
      again.onclick = () => { PB.Audio.play('ready'); PB.Online.voteRematch(); };
      back.onclick = () => { PB.Online.cancelRematch(); toMenu(); };
    } else {
      again.textContent = PB.T('Buscar otra');
      back.textContent = PB.T('Volver al lobby');
      again.onclick = () => play();
      back.onclick = toMenu;
    }
    clearInterval(voteIv);
    voteIv = setInterval(() => { if (mode !== 'end') { clearInterval(voteIv); return; } checkRematch(); renderVote(); }, 250);
    renderVote();
  }
  function checkRematch() {
    const p = inGroup();
    if (!p) return;
    const r = p.rematch && !p.rematch.go && PB.Online.rematchLeft() > 0 ? p.rematch : null;
    // había votación y ya no está (sin haber empezado): alguien ha vuelto a la sala o se acabó el tiempo
    if (rematchSeen && !p.rematch) rematchMsg = PB.T('Votación cancelada');
    rematchSeen = p.rematch || null;
    if (!r) {
      // se acabó el tiempo sin que votaran todos: el jefe la quita
      if (p.rematch && !p.rematch.go && p.leader === 'me') { rematchMsg = PB.T('No han votado todos a tiempo'); PB.Online.cancelRematch(); }
      return;
    }
    const votes = r.votes || {};
    if (p.leader === 'me' && !rematchStarting && p.members.every((m) => votes[m.id])) {
      rematchStarting = true;
      PB.Online.rematchGo();
      play();
    }
  }
  function renderVote() {
    const box = $('#end-vote'), again = $('#again');
    const p = mode === 'end' ? inGroup() : null;
    if (!p) { box.classList.add('hidden'); return; }
    box.classList.remove('hidden');
    const r = p.rematch, votes = (r && r.votes) || {};
    if (r && r.go) {
      again.disabled = true;
      box.textContent = PB.T('¡Todos listos! Buscando partida…');
      return;
    }
    const live = r && PB.Online.rematchLeft() > 0;
    const n = live ? p.members.filter((m) => votes[m.id]).length : 0;
    const mine = live && p.members.some((m) => m.me && votes[m.id]);
    again.textContent = PB.T('Volver a jugar') + (live ? ` (${n}/${p.members.length})` : '');
    again.classList.toggle('voted', !!mine);
    if (!live) {
      box.textContent = rematchMsg || PB.T('Si todos pulsáis «Volver a jugar», buscáis otra partida juntos.');
      return;
    }
    box.innerHTML = `<b>${Math.ceil(PB.Online.rematchLeft())} s</b> · ` +
      p.members.map((m) => `<span class="${votes[m.id] ? 'ok' : ''}">${votes[m.id] ? '✔ ' : ''}${esc(m.me ? PB.T('Tú') : m.name)}</span>`).join(' ');
  }
  PB.Online.on('party', () => { if (mode === 'end') { checkRematch(); renderVote(); } });

  // ------------------------------------------------------------ buscar partida online
  // Si hay más gente buscando el mismo modo, partida en red; si no, en unos segundos, con bots.
  let searching = false;
  function searchScreen(title, sub, cancel) {
    $('#loading h1').textContent = PB.T(title);
    $('#ld-sub').textContent = sub || '';
    $('#ld-cancel').classList.toggle('hidden', !cancel);
    showScreen('loading');
  }
  async function play() {
    if (searching || starting) return;
    const wait = PB.Save.abandonWait();
    if (wait > 0) { PB.Lobby.toast(PB.T('Has abandonado varias partidas. Podrás jugar online en {n} s', { n: wait })); return; }
    searching = true;
    goLandscape();
    PB.Audio.init();
    if (randomMode) gameMode = pickRandomMode();
    searchScreen('Buscando partida…', randomMode ? PB.MODES[gameMode].name : '', true);
    $('#ld-cancel').onclick = () => { PB.Online.cancelMatch(); };
    let r = { local: true };
    try {
      if (await PB.Online.start()) {
        PB.Online.setSearching(gameMode);
        r = await PB.Online.findMatch(gameMode, (st) => {
          $('#ld-sub').textContent = (randomMode ? PB.MODES[gameMode].name + ' · ' : '') + PB.T('{n} jugadores buscando · {s} s', { n: Math.max(1, st.players), s: Math.floor(st.waited) });
        });
      }
    } catch (e) { r = { local: true }; }
    PB.Online.setSearching(null);
    searching = false;
    if (r.cancelled) { PB.Lobby.show('lobby'); return; }
    if (r.mid) return joinAndStart(r.mid);
    startMatch();
  }
  // Aleatorio: si hay alguien buscando partida en algún modo, a ese (el que más gente busca);
  // si no busca nadie, uno al azar. En grupo no vale Niebla Tóxica, que es todos contra todos.
  function pickRandomMode() {
    const p = PB.Online.party();
    const ids = PB.MODE_ORDER.filter((id) => !(p && p.members.length > 1 && PB.MODES[id].ffa));
    const L = PB.Online.live.modes || {};
    const s = ids.slice().sort((a, b) => ((L[b] || {}).search || 0) - ((L[a] || {}).search || 0))[0];
    if ((L[s] || {}).search) return s;
    return ids[Math.floor(Math.random() * ids.length)];
  }
  async function joinAndStart(mid, fromParty) {
    if (mode === 'play') return;
    searchScreen('¡Partida encontrada!', PB.T('Conectando con los demás jugadores…'), false);
    let j = { local: true };
    try { j = await PB.Online.joinMatch(mid); } catch (e) { j = { local: true, failed: true }; }
    if (j.local) {
      // los de una sala que no consiguen entrar a la partida del jefe vuelven a la lobby
      if (fromParty) { PB.Lobby.toast(PB.T('No se ha podido entrar en la partida de tu grupo.')); PB.Lobby.show('lobby'); return; }
      if (j.failed) PB.Lobby.toast(PB.T('No se ha podido conectar. Juegas con bots.'));
      return startMatch();
    }
    if (j.role === 'client') {
      // si el anfitrión no empieza en unos segundos, partida con bots
      setTimeout(() => { if (net && net.role === 'client' && !net.client) { endNet(); PB.Lobby.toast(PB.T('No se ha podido conectar. Juegas con bots.')); startMatch(); } }, 15000);
    }
    startNetMatch(j);
  }
  // los de tu sala: el jefe ha encontrado partida
  PB.Online.on('matchFound', ({ mid }) => { if (mode !== 'play') joinAndStart(mid, true); });
  PB.Online.on('partySearch', (on) => { if (on) PB.Lobby.toast(PB.T('Tu grupo está buscando partida…')); });

  $('#play').onclick = () => { if (PB.Lobby.playPressed()) play(); };

  window.addEventListener('keydown', (e) => {
    if (e.target && e.target.tagName === 'INPUT') return;
    if (e.key === 'Escape' && mode === 'play') (paused ? resume() : pause());
    if (e.key === 'Enter' && mode !== 'play' && PB.Lobby.current === 'lobby' && PB.Lobby.playPressed()) play();
    if (e.key.toLowerCase() === 'm') PB.Settings.set('muted', !PB.Settings.get('muted'));
  });
  // si la pestaña se oculta en mitad de la partida, pausar
  document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });

  // ------------------------------------------------------------ bucle

  function handleEvents() {
    const me = game.player;
    const myTeam = me ? me.team : 'blue';
    const tc = (t) => (t === myTeam ? '#5aa8ff' : '#ff5f5f');
    for (const ev of game.events) {
      if (mode !== 'play') continue;
      switch (ev.type) {
        case 'count': if (ev.n > 0) PB.Audio.play('count'); break;
        case 'go': PB.Audio.play('go'); renderer.announce('¡A luchar!', '#ffcf2e', '', 1); break;
        case 'shoot': if (ev.b === me || near(ev.b)) PB.Audio.play('shoot', { type: ev.atkType, me: ev.b === me }); break;
        case 'hit': if (ev.target === me || ev.source === me) PB.Audio.play('hit', { me: ev.target === me }); break;
        case 'ball': if (ev.b === me) PB.Audio.play('ball'); break;
        case 'candy': if (ev.b === me) PB.Audio.play('candy'); break;
        case 'ballspawn': PB.Audio.play('ballspawn'); break;
        case 'ko':
          // los K.O. ya salen en el registro de arriba a la derecha: aquí solo suena
          if (ev.killer === me) PB.Audio.play('ko', { mine: true });
          else if (ev.b === me) PB.Audio.play('ko', { me: true });
          else if (near(ev.b)) PB.Audio.play('ko');
          break;
        case 'evolve':
          // empieza la evolución: brillo que sube; el aviso sale al verse la forma nueva
          if (ev.b === me) { PB.Audio.play('evolve'); ev.b.evoMsg = PB.T('¡{a} ha evolucionado a {b}!', { a: ev.from, b: ev.to }); }
          else if (near(ev.b)) PB.Audio.play('evolve', { far: true });
          break;
        case 'evolved':
          if (ev.b === me) {
            PB.Audio.play('evolved');
            PB.vibrate(60);
            renderer.announce(ev.b.evoMsg || PB.T('¡Evoluciona!'), '#ffe066', '', 1.8);
          } else if (near(ev.b)) PB.Audio.play('evolved', { far: true });
          break;
        case 'super':
          if (ev.b === me || near(ev.b)) {
            const st = ev.b.def.super.type || ev.b.def.atkType;
            PB.Audio.play('super', { type: st, me: ev.b === me });
            renderer.superFx(st, ev.b === me);
          }
          break;
        case 'superReady': if (ev.b === me) { PB.Audio.play('ready'); PB.vibrate(30); } break;
        case 'boom': PB.Audio.play('boom', { big: ev.big }); break;
        case 'wall': PB.Audio.play('wall'); break;
        case 'respawn': if (ev.b === me) PB.Audio.play('release'); break;
        case 'countdown': PB.Audio.play(ev.team === myTeam ? 'ready' : 'alarm'); break; // la cuenta atrás se ve arriba
        case 'tick': PB.Audio.play('tick'); break;
        case 'gas': PB.Audio.play('gas'); renderer.announce('¡La niebla avanza!', '#d58cff', '', 1.6); break;
        case 'structHit': if (ev.st.team === myTeam) PB.Audio.play('thump'); break;
        case 'snorlaxDown': break;
        case 'kick': if (ev.b === me || near(ev.b)) PB.Audio.play('kick'); break;
        case 'pickBall': if (ev.b === me) PB.Audio.play('ball'); break;
        case 'voltorbBoom': break;
        case 'goal':
          PB.Audio.play('goal');
          renderer.announce(PB.T('¡Gol! {a} - {b}', { a: game.score[myTeam], b: game.score[otherOf(myTeam)] }), tc(ev.team), '', 1.6);
          break;
        case 'zoneTaken': if (ev.team === myTeam) PB.Audio.play('ready'); break;
        case 'end': endTimer = game.mode.ffa && game.winner === 'out' ? 1.2 : 1.8; break;
      }
    }
    game.events.length = 0;
  }
  const otherOf = (t) => (t === 'blue' ? 'red' : 'blue');

  function near(b) {
    const c = renderer.cam;
    return Math.abs(b.x - c.x) < 700 && Math.abs(b.y - c.y) < 500;
  }

  let last = performance.now();
  function frame(now, bg) {
    const dt = Math.min(1 / 30, (now - last) / 1000);
    last = now;
    if (bg) {
      // en segundo plano: solo simular y mandar, sin dibujar
      if (net && net.host && !game.winner) {
        const inputs = {};
        for (const bot of bots) inputs[bot.b.idx] = bot.think(dt);
        if (game.player) inputs[game.player.idx] = {};
        for (const idx in net.remotes) inputs[idx] = net.remotes[idx].take();
        game.update(dt, inputs);
        netStep(dt, null);
        game.events.length = 0;
      }
      return;
    }
    lastDraw = now;

    // móvil en vertical durante la partida: pausa hasta que se gire
    if (mode === 'play' && mustRotate()) {
      input.read(game, renderer);
      requestAnimationFrame(frame);
      return;
    }

    const read = input.read(game, renderer);
    const me = game.player;
    if (net && net.client) {
      netStep(dt, read);
      handleEvents();
    } else if (!paused || net) {
      const inputs = {};
      for (const bot of bots) inputs[bot.b.idx] = bot.think(dt);
      if (me) inputs[me.idx] = input.enabled ? read.input : {};
      if (net && net.host) for (const idx in net.remotes) inputs[idx] = net.remotes[idx].take();
      game.update(dt, inputs);
      if (net && net.host) netStep(dt, read);
      handleEvents();
    }

    // con poca vida se oye el latido
    if (mode === 'play' && me && !me.dead && !game.winner && me.hp < me.maxHp * 0.3) {
      heartT -= dt;
      if (heartT <= 0) { heartT = 0.85; PB.Audio.play('heart'); }
    } else heartT = 0;

    if (endTimer > 0) {
      endTimer -= dt;
      if (endTimer <= 0 && mode === 'play') showEnd();
    }
    if (mode === 'menu' && game.winner) newGame(null);
    if (mode === 'menu') PB.Lobby.tick(dt);

    // a quién sigue la cámara
    let focus = me;
    if (!me || mode === 'menu') {
      spectate += dt;
      const alive = game.brawlers.filter((b) => !b.dead);
      focus = alive[Math.floor(spectate / 8) % Math.max(1, alive.length)] || game.brawlers[0];
    } else if (me.dead) {
      focus = null;
    }
    renderer.draw(game, {
      flip: !!(me && mode !== 'menu' && !game.mode.ffa && me.team === 'red'),
      focus,
      team: me ? me.team : focus ? focus.team : 'blue',
      player: mode === 'play' ? me : null,
      aim: mode === 'play' ? read.aim : null,
      touch: input.touch,
      inputState: input,
      hud: mode !== 'menu',
    });
    requestAnimationFrame(frame);
  }

  // Si la pestaña del anfitrión se oculta, el navegador para requestAnimationFrame:
  // un temporizador en un Worker (que no se frena) mantiene la partida viva para los demás.
  let bgTimer = null;
  try {
    const src = 'let t=null;onmessage=(e)=>{clearInterval(t);if(e.data)t=setInterval(()=>postMessage(0),33)}';
    bgTimer = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
    // si hace rato que no se dibuja (pestaña oculta o frenada), avanza la partida desde aquí
    bgTimer.onmessage = () => { if (net && net.host && performance.now() - lastDraw > 150) frame(performance.now(), true); };
  } catch (e) {}
  let lastDraw = 0;

  // acceso para depurar desde la consola: PB.debug.game
  PB.debug = { get game() { return game; }, get net() { return net; }, input, renderer };
  PB.Match = { startNet: (o) => startNetMatch(o), get busy() { return mode === 'play'; } };

  // Esperar a la fuente pixel (si tarda más de 2 s, se sigue igualmente)
  const fontReady = document.fonts && document.fonts.load
    ? Promise.race([document.fonts.load('16px "Jersey 10"'), new Promise((r) => setTimeout(r, 2000))]).catch(() => {})
    : Promise.resolve();

  PB.Settings.apply();
  PB.I18nStart(); // traduce la página (si el idioma no es español)
  PB.Lobby.init({
    backToPause: () => showScreen('pause'),
    getMode: () => gameMode,
    isRandom: () => randomMode,
    start: () => play(),
    startNet: (o) => startNetMatch(o),
    setMode: (id) => {
      randomMode = id === 'random';
      save('pb.modeRandom', randomMode ? '1' : '0');
      if (randomMode) return;
      gameMode = id;
      save('pb.mode', id);
      newGame(null);
    },
  });

  try {
    const left = JSON.parse(localStorage.getItem('pb.netMatch') || 'null');
    localStorage.removeItem('pb.netMatch');
    if (left && Date.now() - left.t < 15 * 60 * 1000 && PB.Save.applyAbandon) PB.Save.applyAbandon(left);
  } catch (e) {}

  PB.Online.start();

  PB.Sprites.load(() => fontReady.then(() => {
    $('#loading').classList.add('hidden');
    toMenu();
    requestAnimationFrame((t) => {
      last = t;
      frame(t);
    });
  }));
})();
