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
  let endTimer = 0;
  let spectate = 0;

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
    const opts = { mode: gameMode, playerInBlue: !!playerId, noCountdown: !playerId };
    if (M.ffa) {
      const n = M.players || 10;
      const list = [];
      for (let i = 0; i < n; i++) list.push(ids[Math.floor(Math.random() * ids.length)]);
      if (playerId) list[0] = playerId;
      opts.ffa = list;
    } else if (playerId) {
      opts.blue = [playerId, ...shuffle(ids.filter((i) => i !== playerId)).slice(0, 2)];
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
      const shiny = !!playerId && i === 0 && PB.Save.skin(id) === 'shiny';
      for (const dex of opts.lines[i] || PB.brawlerById(id).line) list.push({ dex, shiny });
    });
    return list;
  }

  function newGame(playerId, opts) {
    opts = opts || plan(playerId);
    PB.Sprites.ensure(spritesFor(opts, playerId));
    game = new PB.Game(opts);
    if (game.player) game.player.shiny = PB.Save.skin(playerId) === 'shiny';
    // nombre del entrenador de cada uno (para la pantalla final)
    const names = shuffle(PB.TRAINER_NAMES.slice());
    game.brawlers.forEach((b, i) => { b.trainer = b.isPlayer ? PB.Save.get().name : names[i % names.length]; });
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
      $('#loading h1').textContent = 'Preparando a los Pokémon…';
      showScreen('loading');
    }, 120);
    await wait;
    clearTimeout(slow);
    starting = false;
    newGame(id, opts);
    mode = 'play';
    paused = false;
    input.enabled = true;
    endTimer = 0;
    hideScreens();
    $('#btn-pause').classList.remove('hidden');
    help().classList.remove('hidden');
    setTimeout(() => help().classList.add('hidden'), 6000);
  }

  function toMenu() {
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
    paused = true;
    input.enabled = false;
    showScreen('pause');
  }
  function resume() {
    paused = false;
    input.enabled = true;
    hideScreens();
  }
  $('#btn-pause').onclick = pause;
  $('#pz-resume').onclick = resume;
  $('#pz-settings').onclick = () => PB.Lobby.openSettings('pause');
  $('#pz-quit').onclick = toMenu;

  function showEnd() {
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
        `<span class="er-name"><b>${b.trainer || b.name}</b><small>${PB.stageName(b, b.stage)}${lvl}</small></span>` +
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
      `<div class="tokens"><img src="${PB.Icons.ball('poke', 2)}" alt=""><div class="tok-info"><small>+${reward.tokens} fichas${reward.bonus ? ' (¡dobles!)' : ''}</small><span class="bar"><i style="width:${pct}%"></i></span></div><b>${d.tokens}/${PB.META.tokensPerChest}</b></div>` +
      `<p class="got">${[
        reward.newChests.length ? '¡' + (reward.newChests.length > 1 ? reward.newChests.length + ' Poké Balls' : 'Poké Ball') + ' nueva!' : '',
        pend.missions ? pend.missions + ' misión' + (pend.missions > 1 ? 'es' : '') + ' para reclamar' : '',
        pend.achievements ? pend.achievements + ' logro' + (pend.achievements > 1 ? 's' : '') + ' nuevo' + (pend.achievements > 1 ? 's' : '') : '',
      ].filter(Boolean).join(' · ')}</p>`;
    showScreen('end');
    help().classList.add('hidden');
    PB.Audio.play(res.cls === 'win' ? 'win' : 'lose');
  }

  $('#play').onclick = startMatch;
  $('#again').onclick = startMatch;
  $('#back').onclick = toMenu;
  window.addEventListener('keydown', (e) => {
    if (e.target && e.target.tagName === 'INPUT') return;
    if (e.key === 'Escape' && mode === 'play') (paused ? resume() : pause());
    if (e.key === 'Enter' && mode !== 'play' && PB.Lobby.current === 'lobby') startMatch();
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
          PB.Audio.play('ko');
          break;
        case 'evolve':
          if (ev.b === me) {
            PB.Audio.play('evolve');
            PB.vibrate(60);
            renderer.announce('¡' + ev.from + ' ha evolucionado a ' + ev.to + '!', '#ffe066', '', 1.6);
          } else if (near(ev.b)) PB.Audio.play('ready');
          break;
        case 'super': if (ev.b === me || near(ev.b)) PB.Audio.play('super'); break;
        case 'superReady': if (ev.b === me) { PB.Audio.play('ready'); PB.vibrate(30); } break;
        case 'boom': PB.Audio.play('boom', { big: ev.big }); break;
        case 'wall': PB.Audio.play('wall'); break;
        case 'respawn': if (ev.b === me) PB.Audio.play('release'); break;
        case 'countdown': break; // la cuenta atrás ya se ve en el marcador de arriba
        case 'tick': PB.Audio.play('tick'); break;
        case 'gas': PB.Audio.play('gas'); renderer.announce('¡La niebla avanza!', '#d58cff', '', 1.6); break;
        case 'structHit': if (ev.st.team === myTeam) PB.Audio.play('thump'); break;
        case 'snorlaxDown': break;
        case 'kick': if (ev.b === me || near(ev.b)) PB.Audio.play('kick'); break;
        case 'pickBall': if (ev.b === me) PB.Audio.play('ball'); break;
        case 'voltorbBoom': break;
        case 'goal':
          PB.Audio.play('goal');
          renderer.announce('¡Gol! ' + game.score[myTeam] + ' - ' + game.score[otherOf(myTeam)], tc(ev.team), '', 1.6);
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
  function frame(now) {
    const dt = Math.min(1 / 30, (now - last) / 1000);
    last = now;

    // móvil en vertical durante la partida: pausa hasta que se gire
    if (mode === 'play' && mustRotate()) {
      input.read(game, renderer);
      requestAnimationFrame(frame);
      return;
    }

    const read = input.read(game, renderer);
    const me = game.player;
    if (!paused) {
      const inputs = {};
      for (const bot of bots) inputs[bot.b.idx] = bot.think(dt);
      if (me) inputs[me.idx] = read.input;
      game.update(dt, inputs);
      handleEvents();
    }

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

  // acceso para depurar desde la consola: PB.debug.game
  PB.debug = { get game() { return game; }, input, renderer };

  // Esperar a la fuente pixel (si tarda más de 2 s, se sigue igualmente)
  const fontReady = document.fonts && document.fonts.load
    ? Promise.race([document.fonts.load('16px "Jersey 10"'), new Promise((r) => setTimeout(r, 2000))]).catch(() => {})
    : Promise.resolve();

  PB.Settings.apply();
  PB.Lobby.init({
    backToPause: () => showScreen('pause'),
    getMode: () => gameMode,
    setMode: (id) => { gameMode = id; save('pb.mode', id); newGame(null); },
  });

  PB.Sprites.load(() => fontReady.then(() => {
    $('#loading').classList.add('hidden');
    toMenu();
    requestAnimationFrame((t) => {
      last = t;
      frame(t);
    });
  }));
})();
