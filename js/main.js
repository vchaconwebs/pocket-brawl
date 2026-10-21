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
  let selected = load('pb.brawler', (v) => PB.brawlerById(v), 'charmander');
  let difficulty = load('pb.difficulty', (v) => PB.DIFFICULTY[v], 'normal');
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
    const diff = PB.DIFFICULTY[difficulty];
    bots = game.brawlers
      .filter((b) => !b.isPlayer)
      .map((b) => new PB.Bot(game, b, playerId ? (b.team === 'blue' ? diff.ally : diff.foe) : 0.45));
    const f = game.player || game.brawlers[0];
    renderer.cam.x = f.x;
    renderer.cam.y = f.y;
    spectate = 0;
  }

  // ------------------------------------------------------------ menú
  // Iconos de los modos (pixel art pintado al vuelo)
  const modeIcon = (id) => {
    if (id === 'heist') return window.SPRITE_DATA['0143'].portrait;
    if (id === 'ball') return window.SPRITE_DATA['0100'].portrait;
    const cv = document.createElement('canvas');
    cv.width = 40;
    cv.height = 40;
    const c = cv.getContext('2d');
    c.imageSmoothingEnabled = false;
    c.fillStyle = { gems: '#3a7a3a', showdown: '#5a2a78', zone: '#2a4a8a' }[id] || '#333';
    c.fillRect(0, 0, 40, 40);
    if (id === 'gems') PB.Pokeball.draw(c, 20, 20, 2, {});
    else if (id === 'showdown') c.drawImage(PB.Tiles.candy(), 2, 2, 36, 36);
    else {
      c.fillStyle = '#4a3420';
      c.fillRect(12, 6, 3, 30);
      c.fillStyle = '#ffd23a';
      c.fillRect(15, 6, 16, 10);
      c.fillStyle = '#e8a010';
      c.fillRect(15, 13, 16, 3);
    }
    return cv.toDataURL();
  };

  function buildMenu() {
    // modos
    const mz = $('#modes');
    mz.innerHTML = '';
    for (const id of PB.MODE_ORDER) {
      const M = PB.MODES[id];
      const el = document.createElement('button');
      el.className = 'mode-btn' + (id === gameMode ? ' sel' : '');
      el.innerHTML = `<img src="${modeIcon(id)}" alt=""><span>${M.name}</span>`;
      el.onclick = () => {
        gameMode = id;
        save('pb.mode', id);
        newGame(null);
        buildMenu();
      };
      mz.appendChild(el);
    }
    $('#mode-desc').textContent = PB.MODES[gameMode].desc;

    // luchadores
    const grid = $('#roster');
    grid.innerHTML = '';
    for (const b of PB.BRAWLERS) {
      const el = document.createElement('button');
      el.className = 'card' + (b.id === selected ? ' sel' : '');
      const portrait = window.SPRITE_DATA[b.dex] && window.SPRITE_DATA[b.dex].portrait;
      el.innerHTML =
        `<img src="${portrait}" alt="">` +
        `<span class="nm">${b.name}</span>` +
        `<span class="types">${b.types.map((t) => `<i style="background:${PB.TYPE_INFO[t].color}">${PB.TYPE_INFO[t].name}</i>`).join('')}</span>`;
      el.onclick = () => {
        selected = b.id;
        save('pb.brawler', selected);
        buildMenu();
      };
      grid.appendChild(el);
    }
    const b = PB.brawlerById(selected);
    $('#info').innerHTML =
      `<h3>${b.name} <small>${b.role}</small></h3>` +
      `<p>${b.desc}</p>` +
      `<div class="stats"><span>❤ ${b.hp}</span><span>⚡ Vel. ${b.speed}</span><span>🔄 Recarga ${b.reload}s</span></div>` +
      `<p class="moves"><b>Ataque:</b> ${b.attack.name} &nbsp; <b>Súper:</b> ${b.super.name}</p>`;

    // dificultad
    const dz = $('#difficulty');
    dz.innerHTML = '<span>Bots:</span>';
    for (const [id, d] of Object.entries(PB.DIFFICULTY)) {
      const el = document.createElement('button');
      el.className = 'diff' + (id === difficulty ? ' sel' : '');
      el.textContent = d.name;
      el.onclick = () => {
        difficulty = id;
        save('pb.difficulty', id);
        buildMenu();
      };
      dz.appendChild(el);
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

  function startMatch() {
    goLandscape();
    PB.Audio.init();
    newGame(selected);
    mode = 'play';
    input.enabled = true;
    endTimer = 0;
    showScreen(null);
    help().classList.remove('hidden');
    setTimeout(() => help().classList.add('hidden'), 6000);
  }

  function toMenu() {
    mode = 'menu';
    input.enabled = false;
    newGame(null);
    buildMenu();
    showScreen('menu');
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
    if (e.key === 'Enter' && mode !== 'play') startMatch();
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
    });
    requestAnimationFrame(frame);
  }

  // acceso para depurar desde la consola: PB.debug.game
  PB.debug = { get game() { return game; }, input, renderer };

  // Esperar a la fuente pixel (si tarda más de 2 s, se sigue igualmente)
  const fontReady = document.fonts && document.fonts.load
    ? Promise.race([document.fonts.load('16px "Pixelify Sans"'), new Promise((r) => setTimeout(r, 2000))]).catch(() => {})
    : Promise.resolve();

  PB.Sprites.load(() => fontReady.then(() => {
    $('#loading').classList.add('hidden');
    toMenu();
    requestAnimationFrame((t) => {
      last = t;
      frame(t);
    });
  }));
})();
