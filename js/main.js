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

  function newGame(playerId) {
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
    game = new PB.Game(opts);
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

  function startMatch() {
    goLandscape();
    PB.Audio.init();
    newGame(PB.Save.get().selected);
    mode = 'play';
    input.enabled = true;
    endTimer = 0;
    for (const sc of document.querySelectorAll('.screen')) sc.classList.add('hidden');
    help().classList.remove('hidden');
    setTimeout(() => help().classList.add('hidden'), 6000);
  }

  function toMenu() {
    mode = 'menu';
    input.enabled = false;
    newGame(null);
    PB.Lobby.show('lobby');
    help().classList.add('hidden');
  }

  function showEnd() {
    mode = 'end';
    input.enabled = false;
    const me = game.player;
    const M = game.mode;
    const res = M.result(game, me);
    $('#result').textContent = res.title;
    $('#result').className = res.cls;
    const statTxt = (b) => (M.id === 'zone' ? Math.round(b.stat) + ' s' : Math.round(b.stat));
    let list = game.brawlers.slice();
    if (M.ffa) list.sort((a, b) => (a.rank || 99) - (b.rank || 99) || b.kills - a.kills);
    else list.sort((a, b) => (a.team === b.team ? b.kills - a.kills : a.team === me.team ? -1 : 1));
    const rows = list
      .map((b) => {
        const cls = M.ffa ? (b.isPlayer ? 'blue me' : 'red') : b.team + (b.isPlayer ? ' me' : '');
        const name = (M.ffa && b.rank ? '#' + b.rank + ' ' : '') + b.name + (b.isPlayer ? ' (' + b.def.name + ')' : '');
        return `<tr class="${cls}"><td>${name}</td><td>${b.kills}</td><td>${b.deaths}</td><td>${statTxt(b)}</td><td>${Math.round(b.dmgDone)}</td></tr>`;
      })
      .join('');
    $('#scores').innerHTML = `<tr><th></th><th>K.O.</th><th>Caídas</th><th>${M.statName}</th><th>Daño</th></tr>${rows}`;
    // recompensas: fichas, cofres nuevos y misiones
    const win = M.ffa ? (me.rank || 99) <= 4 : game.winner === me.team;
    const reward = PB.Save.applyMatch({ win, draw: game.winner === 'draw', rank: me.rank, mode: M.id, me });
    const d = PB.Save.get();
    const pct = Math.round((100 * d.tokens) / PB.META.tokensPerChest);
    const pend = PB.Save.pending();
    const dc = reward.copas;
    $('#end-rewards').innerHTML =
      `<div class="copas-change ${dc > 0 ? 'up' : dc < 0 ? 'down' : ''}"><img src="${PB.Icons.cup()}" alt=""><b>${dc > 0 ? '+' : ''}${dc}</b><small>${me.def.name}: ${reward.copasNow} copas · Total: ${PB.Save.totalCopas()}</small></div>` +
      `<div class="tokens"><img src="${PB.Icons.ball('poke', 2)}" alt=""><div class="tok-info"><small>+${reward.tokens} fichas</small><span class="bar"><i style="width:${pct}%"></i></span></div><b>${d.tokens}/${PB.META.tokensPerChest}</b></div>` +
      (reward.newChests.length ? `<p class="got">¡Has conseguido ${reward.newChests.length > 1 ? reward.newChests.length + ' Poké Balls' : 'una Poké Ball'}! Ábrela en el lobby.</p>` : '') +
      (pend.missions ? `<p class="got">Tienes ${pend.missions} misión${pend.missions > 1 ? 'es' : ''} para reclamar.</p>` : '') +
      (pend.achievements ? `<p class="got">¡Tienes ${pend.achievements} logro${pend.achievements > 1 ? 's' : ''} nuevo${pend.achievements > 1 ? 's' : ''}!</p>` : '');
    showScreen('end');
    help().classList.add('hidden');
    PB.Audio.play(res.cls === 'win' ? 'win' : 'lose');
  }

  $('#play').onclick = startMatch;
  $('#again').onclick = startMatch;
  $('#back').onclick = toMenu;
  $('#mute').onclick = () => {
    PB.Audio.muted = !PB.Audio.muted;
    $('#mute').textContent = PB.Audio.muted ? '🔇' : '🔊';
  };
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && mode === 'play') toMenu();
    if (e.key === 'Enter' && mode !== 'play' && PB.Lobby.current === 'lobby') startMatch();
    if (e.key.toLowerCase() === 'm') $('#mute').click();
  });

  // ------------------------------------------------------------ bucle
  const STREAK = ['', '¡K.O.!', '¡DOBLE K.O.!', '¡TRIPLE K.O.!', '¡IMPARABLE!'];

  function handleEvents() {
    const me = game.player;
    const myTeam = me ? me.team : 'blue';
    const tc = (t) => (t === myTeam ? '#5aa8ff' : '#ff5f5f');
    for (const ev of game.events) {
      if (mode !== 'play') continue;
      switch (ev.type) {
        case 'count': if (ev.n > 0) PB.Audio.play('count'); break;
        case 'go': PB.Audio.play('go'); renderer.announce('¡A LUCHAR!', '#ffcf2e', '', 1.1); break;
        case 'shoot': if (ev.b === me || near(ev.b)) PB.Audio.play('shoot', { type: ev.atkType, me: ev.b === me }); break;
        case 'hit': if (ev.target === me || ev.source === me) PB.Audio.play('hit', { me: ev.target === me }); break;
        case 'ball': if (ev.b === me) PB.Audio.play('ball'); break;
        case 'candy': if (ev.b === me) PB.Audio.play('candy'); break;
        case 'ballspawn': PB.Audio.play('ballspawn'); break;
        case 'ko':
          PB.Audio.play('ko');
          if (ev.b === me) {
            const sub = ev.killer && ev.killer.def ? 'Te ha vencido ' + ev.killer.def.name : '';
            renderer.announce(game.mode.ffa ? '¡Eliminado!' : '¡Debilitado!', '#ff6b6b', sub, 1.4);
          } else if (ev.killer === me) renderer.announce(STREAK[Math.min(ev.streak, 4)] || '¡K.O.!', '#ffcf2e', ev.b.def.name + ' debilitado', 1.3);
          break;
        case 'super': if (ev.b === me || near(ev.b)) PB.Audio.play('super'); break;
        case 'superReady': if (ev.b === me) { PB.Audio.play('ready'); if (navigator.vibrate) navigator.vibrate(30); } break;
        case 'boom': PB.Audio.play('boom', { big: ev.big }); break;
        case 'wall': PB.Audio.play('wall'); break;
        case 'respawn': if (ev.b === me) PB.Audio.play('release'); break;
        case 'countdown':
          renderer.announce(ev.team === myTeam ? '¡Tenéis 10 Pokéballs!' : '¡Tienen 10 Pokéballs!', tc(ev.team), ev.team === myTeam ? 'Aguantad 15 segundos' : 'Quitádselas antes de que acabe la cuenta', 1.8);
          break;
        case 'tick': PB.Audio.play('tick'); break;
        case 'gas': PB.Audio.play('gas'); renderer.announce('¡La niebla avanza!', '#d58cff', 'Quédate dentro del círculo', 1.8); break;
        case 'structHit': if (ev.st.team === myTeam) PB.Audio.play('thump'); break;
        case 'snorlaxDown': renderer.announce(ev.team === myTeam ? '¡Han despertado a vuestro Snorlax!' : '¡Snorlax despierta!', tc(otherOf(ev.team)), '', 1.8); break;
        case 'kick': if (ev.b === me || near(ev.b)) PB.Audio.play('kick'); break;
        case 'pickBall': if (ev.b === me) PB.Audio.play('ball'); break;
        case 'voltorbBoom': renderer.announce('¡BOOM!', '#ff6b4a', 'El Voltorb ha explotado', 1.2); break;
        case 'goal':
          PB.Audio.play('goal');
          renderer.announce('¡GOOOL!', tc(ev.team), (ev.by ? ev.by.name : '') + ' · ' + game.score[myTeam] + ' - ' + game.score[otherOf(myTeam)], 2);
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
    const inputs = {};
    for (const bot of bots) inputs[bot.b.idx] = bot.think(dt);
    const me = game.player;
    if (me) inputs[me.idx] = read.input;
    game.update(dt, inputs);
    handleEvents();

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
    ? Promise.race([document.fonts.load('16px "Pixelify Sans"'), new Promise((r) => setTimeout(r, 2000))]).catch(() => {})
    : Promise.resolve();

  PB.Lobby.init({
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
