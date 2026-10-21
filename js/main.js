// Pantallas, bucle principal y unión de todas las piezas.
(function () {
  const $ = (s) => document.querySelector(s);
  const canvas = $('#game');
  const renderer = new PB.Renderer(canvas);
  const input = new PB.Input(canvas);

  let game = null;
  let bots = [];
  let mode = 'menu'; // 'menu' (partida de fondo entre bots) | 'play' | 'end'
  let selected = 'charmander';
  try {
    const saved = localStorage.getItem('pb.brawler');
    if (PB.brawlerById(saved)) selected = saved;
  } catch (e) {}
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
    let blue, red;
    if (playerId) {
      blue = [playerId, ...shuffle(ids.filter((i) => i !== playerId)).slice(0, 2)];
      red = shuffle(ids.slice()).slice(0, 3);
    } else {
      blue = shuffle(ids.slice()).slice(0, 3);
      red = shuffle(ids.slice()).slice(0, 3);
    }
    game = new PB.Game({ blue, red, playerInBlue: !!playerId });
    bots = game.brawlers.filter((b) => !b.isPlayer).map((b) => new PB.Bot(game, b, b.team === 'blue' ? 0.55 : 0.6));
    const f = game.player || game.brawlers[0];
    renderer.cam.x = f.x;
    renderer.cam.y = f.y;
  }

  // ------------------------------------------------------------ menú
  function buildMenu() {
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
        try { localStorage.setItem('pb.brawler', selected); } catch (e) {}
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

  function startMatch() {
    goLandscape();
    PB.Audio.init();
    newGame(selected);
    mode = 'play';
    input.enabled = true;
    showScreen(null);
    $('#help').classList.remove('hidden');
    setTimeout(() => $('#help').classList.add('hidden'), 6000);
  }

  function toMenu() {
    mode = 'menu';
    input.enabled = false;
    newGame(null);
    buildMenu();
    showScreen('menu');
    $('#help').classList.add('hidden');
  }

  function showEnd() {
    mode = 'end';
    input.enabled = false;
    const me = game.player;
    const r = game.winner;
    const won = r === 'blue', draw = r === 'draw';
    $('#result').textContent = draw ? 'EMPATE' : won ? '¡VICTORIA!' : 'DERROTA';
    $('#result').className = draw ? '' : won ? 'win' : 'lose';
    const rows = game.brawlers
      .slice()
      .sort((a, b) => (a.team === b.team ? b.kills - a.kills : a.team === 'blue' ? -1 : 1))
      .map((b) =>
        `<tr class="${b.team}${b.isPlayer ? ' me' : ''}"><td>${b.name}${b.isPlayer ? ' (' + b.def.name + ')' : ''}</td>` +
        `<td>${b.kills}</td><td>${b.deaths}</td><td>${b.gemsTaken}</td><td>${Math.round(b.dmgDone)}</td></tr>`
      )
      .join('');
    $('#scores').innerHTML = `<tr><th></th><th>K.O.</th><th>Muertes</th><th>Gemas</th><th>Daño</th></tr>${rows}`;
    showScreen('end');
    $('#help').classList.add('hidden');
    PB.Audio.play(won ? 'win' : 'lose');
    void me;
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
  function handleEvents() {
    const me = game.player;
    for (const ev of game.events) {
      if (mode !== 'play') continue;
      switch (ev.type) {
        case 'shoot': if (ev.b === me || near(ev.b)) PB.Audio.play('shoot', { fx: ev.fx }); break;
        case 'hit': if (ev.target === me || ev.source === me) PB.Audio.play('hit', { me: ev.target === me }); break;
        case 'gem': if (ev.b === me) PB.Audio.play('gem'); break;
        case 'ko': PB.Audio.play('ko'); break;
        case 'super': if (ev.b === me || near(ev.b)) PB.Audio.play('super'); break;
        case 'boom': PB.Audio.play('boom', { big: ev.big }); break;
        case 'tick': PB.Audio.play('tick'); break;
        case 'end': endTimer = 1.6; break;
      }
    }
    game.events.length = 0;
  }

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
    if (!me) {
      spectate += dt;
      const alive = game.brawlers.filter((b) => !b.dead);
      focus = alive[Math.floor(spectate / 8) % Math.max(1, alive.length)] || game.brawlers[0];
    } else if (me.dead) {
      focus = null;
    }
    renderer.draw(game, {
      focus,
      team: 'blue',
      player: mode === 'play' ? me : null,
      aim: mode === 'play' ? read.aim : null,
      touch: input.touch,
      inputState: input,
    });
    requestAnimationFrame(frame);
  }

  // acceso para depurar desde la consola: PB.debug.game
  PB.debug = { get game() { return game; }, input };

  PB.Sprites.load(() => {
    $('#loading').classList.add('hidden');
    toMenu();
    requestAnimationFrame((t) => {
      last = t;
      frame(t);
    });
  });
})();
