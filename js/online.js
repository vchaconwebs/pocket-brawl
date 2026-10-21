// Parte online: amigos, clanes (con chat) y ranking.
//
// AHORA MISMO ES UN SERVIDOR SIMULADO: los demás jugadores y clanes son de prueba y todo se
// guarda en este navegador. Sirve para tener las pantallas y la lógica listas.
// Cuando conectemos Firebase (cuentas con Google/correo, base de datos y reglas contra trampas),
// solo hay que sustituir las funciones de este archivo manteniendo la misma "forma" (todas
// devuelven promesas, igual que hará el servidor de verdad).
PB.Online = (() => {
  const KEY = 'pb.online.mock';
  const MAX = () => PB.META.clanMax;
  const wait = (v) => new Promise((r) => setTimeout(() => r(v), 60 + Math.random() * 120));
  const listeners = {};
  const emit = (ev) => (listeners[ev] || []).forEach((f) => f());

  // generador aleatorio con semilla: el "mundo" de prueba es siempre el mismo
  function rng(seed) {
    return () => {
      seed |= 0;
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const NAMES = [
    'PikaPower', 'LunaMega', 'RojoKanto', 'AzulOcéano', 'Charizito', 'BulbaKing', 'SquirtleSquad', 'GengarFan', 'RocaDura',
    'NieblaOscura', 'TrueNoAzul', 'Mewtwolf', 'EeveeLover', 'Ditto99', 'SnorlaxZzz', 'VoltorBoom', 'Jigglypuf', 'Magikarpet',
    'MaestroBrock', 'MistyWaves', 'Arcanine7', 'Lucario_ES', 'Dragonita', 'PsyDuckie', 'Onix_Rex', 'Haunter666', 'Raichu_X',
    'Cubone', 'MachoMan', 'Alakazam', 'Gyarados', 'Laprasito', 'Vulpix', 'Growlithe', 'Pidgeot', 'Abra_Kadabra', 'Rattata',
    'Zubat', 'Meowth_TR', 'Slowpoke', 'Tauros', 'Kangaskhan', 'Scyther', 'Pinsir', 'Jynx', 'Electabuzz', 'Magmar', 'Aerodactyl',
    'Articuno', 'Zapdos', 'Moltres', 'Dratini', 'Mew', 'Togepi', 'Marill', 'Sudowoodo', 'Espeon', 'Umbreon', 'Scizor', 'Heracross',
  ];
  const CLANS = [
    ['Liga Kanto', 'Los mejores entrenadores de Kanto. Activos todos los días.', 'public', '0025'],
    ['Team Charizard', 'Fuego y victorias. Mínimo 100 copas.', 'invite', '0004'],
    ['Los Snorlax', 'Aquí se juega tranquilo y se duerme mucho.', 'public', '0143'],
    ['Rayo Veloz', 'Clan competitivo. Jugamos Voltorbol cada noche.', 'invite', '0100'],
    ['Niebla Púrpura', 'Especialistas en Niebla Tóxica.', 'public', '0092'],
    ['Roca Firme', 'Defensa, defensa y más defensa.', 'public', '0074'],
    ['Hoja Afilada', 'Clan español, buen rollo y ayuda a nuevos.', 'public', '0001'],
    ['Marea Azul', 'Torneos internos cada semana.', 'invite', '0007'],
    ['Pokéamigos', 'Para jugar con amigos sin agobios.', 'public', '0025'],
    ['Élite Cuatro', 'Solo los más fuertes. Pide entrar.', 'invite', '0092'],
    ['Gimnasio Plateado', 'Clan de veteranos.', 'public', '0074'],
    ['Team Rocket ES', 'Preparaos para los problemas...', 'invite', '0092'],
    ['Bayas Frescas', 'Clan nuevo, buscamos gente activa.', 'public', '0001'],
    ['Los Voltorbos', '¡Bum!', 'public', '0100'],
  ];
  const REPLIES = [
    '¡Buenas!', 'jajaja', 'Alguien para Voltorbol?', 'gg', 'Me ha tocado Gastly en una Ultra Ball 😱',
    'Bienvenid@ al clan', 'Hoy subo a Charmander a nivel 5', 'Que alguien me ayude con la misión de Snorlax',
    'Esta noche jugamos?', 'vaya partida acabo de echar', 'Pikachu está rotísimo', '👍', 'Venga, a por las copas',
  ];

  let world = null; // jugadores y clanes de prueba
  let state = null; // lo que cambia: mi clan, amigos, solicitudes, chat, clanes creados

  function build() {
    const r = rng(2026);
    const players = NAMES.map((name, i) => ({
      id: 'p' + i,
      name,
      tag: '#' + Math.floor(r() * 0xffffff).toString(36).toUpperCase().padStart(5, '0').slice(0, 6),
      copas: Math.floor(40 + Math.pow(r(), 1.8) * 2600),
      fav: PB.BRAWLERS[Math.floor(r() * PB.BRAWLERS.length)].id,
      clan: null,
    }));
    const clans = CLANS.map(([name, desc, type, icon], i) => ({ id: 'c' + i, name, desc, type, icon, leader: null, members: [], created: false }));
    // repartir jugadores en clanes
    let pi = 0;
    for (const c of clans) {
      const n = 2 + Math.floor(r() * 6);
      for (let k = 0; k < n && pi < players.length; k++, pi++) {
        c.members.push(players[pi].id);
        players[pi].clan = c.id;
      }
      c.leader = c.members[0];
    }
    world = { players, clans };
  }

  function load() {
    if (!world) build();
    if (state) return;
    try { state = JSON.parse(localStorage.getItem(KEY)); } catch (e) { state = null; }
    if (!state) {
      state = {
        clan: null, // id de mi clan
        created: [], // clanes creados por mí
        joined: {}, // clanId -> true (me uní)
        left: {}, // clanes de los que me fui (para no volver a meterme)
        pending: {}, // solicitudes a clanes por invitación: clanId -> hora
        friends: ['p3', 'p11'],
        requests: ['p20', 'p7'], // solicitudes de amistad recibidas
        sent: {}, // solicitudes enviadas: id -> hora
        chat: {}, // clanId -> mensajes
      };
    }
    // reconstruir clanes creados y mi pertenencia
    for (const c of state.created) if (!world.clans.find((x) => x.id === c.id)) world.clans.push({ ...c, members: c.members.slice() });
    for (const c of world.clans) {
      c.members = c.members.filter((m) => m !== 'me');
      if (state.clan === c.id) c.members.push('me');
    }
    tickPending();
  }

  function save() {
    state.created = world.clans.filter((c) => c.created).map((c) => ({ ...c, members: c.members.filter((m) => m !== 'me') }));
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {}
  }

  // Simulación: las solicitudes se aceptan solas al cabo de unos segundos
  function tickPending() {
    const now = Date.now();
    for (const [cid, t] of Object.entries(state.pending)) {
      if (now - t > 8000 && !state.clan) {
        const c = world.clans.find((x) => x.id === cid);
        delete state.pending[cid];
        if (c && c.members.length < MAX()) joinNow(c);
      }
    }
    for (const [pid, t] of Object.entries(state.sent)) {
      if (now - t > 6000) {
        delete state.sent[pid];
        if (!state.friends.includes(pid)) state.friends.push(pid);
      }
    }
    save();
  }
  setInterval(() => {
    if (!state) return;
    const before = JSON.stringify([state.clan, state.friends]);
    tickPending();
    if (JSON.stringify([state.clan, state.friends]) !== before) emit('change');
  }, 2000);

  // ---------------------------------------------------------------- jugadores
  function me() {
    const d = PB.Save.get();
    return { id: 'me', name: d.name, tag: d.tag, copas: PB.Save.totalCopas(), fav: d.selected, clan: state.clan, me: true };
  }
  const player = (id) => (id === 'me' ? me() : world.players.find((p) => p.id === id));
  // conectado o no (cambia cada pocos minutos, de forma estable por jugador)
  const online = (id) => id === 'me' || (Math.floor(Date.now() / 300000) * 7 + id.length * 13 + parseInt(id.slice(1), 10) * 31) % 5 < 2;
  const withStatus = (p) => ({ ...p, online: online(p.id) });

  function clanCopas(c) {
    return c.members.reduce((s, id) => s + (player(id) ? player(id).copas : 0), 0);
  }
  function clanView(c) {
    return {
      ...c,
      copas: clanCopas(c),
      count: c.members.length,
      leaderName: player(c.leader) ? player(c.leader).name : '-',
      members: c.members.map((id) => withStatus({ ...player(id), role: id === c.leader ? 'Líder' : 'Miembro' })).sort((a, b) => b.copas - a.copas),
    };
  }

  function joinNow(c) {
    state.clan = c.id;
    state.joined[c.id] = true;
    if (!c.members.includes('me')) c.members.push('me');
    const ch = (state.chat[c.id] = state.chat[c.id] || seedChat(c));
    ch.push({ sys: true, text: me().name + ' se ha unido al clan', time: Date.now() });
    save();
  }

  function seedChat(c) {
    const r = rng(c.name.length * 97);
    const out = [];
    const others = c.members.filter((m) => m !== 'me');
    for (let i = 0; i < 4 && others.length; i++) {
      const p = player(others[Math.floor(r() * others.length)]);
      out.push({ from: p.id, name: p.name, text: REPLIES[Math.floor(r() * REPLIES.length)], time: Date.now() - (5 - i) * 600000 });
    }
    return out;
  }

  return {
    // estado de la conexión
    status: () => ({ online: false, mock: true }),
    on(ev, fn) { (listeners[ev] = listeners[ev] || []).push(fn); },

    me: () => (load(), wait(me())),

    // ------------------------------------------------ ranking
    topPlayers() {
      load();
      const list = [...world.players, me()].map(withStatus).sort((a, b) => b.copas - a.copas);
      return wait(list.map((p, i) => ({ ...p, pos: i + 1, clanName: p.clan ? (world.clans.find((c) => c.id === p.clan) || {}).name : '' })));
    },
    topClans() {
      load();
      const list = world.clans.filter((c) => c.members.length).map(clanView).sort((a, b) => b.copas - a.copas);
      return wait(list.map((c, i) => ({ ...c, pos: i + 1 })));
    },

    // ------------------------------------------------ clanes
    searchClans(q) {
      load();
      const s = String(q || '').toLowerCase().trim();
      const list = world.clans.filter((c) => c.members.length && (!s || c.name.toLowerCase().includes(s))).map(clanView);
      return wait(list.sort((a, b) => b.copas - a.copas).map((c) => ({ ...c, pending: !!state.pending[c.id] })));
    },
    getClan(id) {
      load();
      const c = world.clans.find((x) => x.id === id);
      return wait(c ? { ...clanView(c), pending: !!state.pending[c.id], mine: state.clan === c.id } : null);
    },
    myClan() {
      load();
      const c = world.clans.find((x) => x.id === state.clan);
      return wait(c ? clanView(c) : null);
    },
    createClan({ name, desc, type, icon }) {
      load();
      name = String(name || '').trim();
      if (state.clan) return wait({ error: 'Ya estás en un clan.' });
      if (name.length < 3 || name.length > 20) return wait({ error: 'El nombre debe tener entre 3 y 20 letras.' });
      if (world.clans.some((c) => c.members.length && c.name.toLowerCase() === name.toLowerCase())) return wait({ error: 'Ya existe un clan con ese nombre.' });
      if (!PB.Save.spendCoins(PB.META.clanCost)) return wait({ error: 'Necesitas ' + PB.META.clanCost + ' monedas.' });
      const c = { id: 'u' + Date.now(), name, desc: String(desc || '').slice(0, 80), type: type === 'invite' ? 'invite' : 'public', icon: icon || '0025', leader: 'me', members: [], created: true };
      world.clans.push(c);
      state.chat[c.id] = [];
      joinNow(c);
      return wait({ ok: true, clan: clanView(c) });
    },
    joinClan(id) {
      load();
      const c = world.clans.find((x) => x.id === id);
      if (!c) return wait({ error: 'Ese clan ya no existe.' });
      if (state.clan) return wait({ error: 'Primero abandona tu clan.' });
      if (c.members.length >= MAX()) return wait({ error: 'El clan está lleno (' + MAX() + '/' + MAX() + ').' });
      if (c.type === 'invite') {
        state.pending[c.id] = Date.now();
        save();
        return wait({ pending: true });
      }
      joinNow(c);
      return wait({ ok: true });
    },
    leaveClan() {
      load();
      const c = world.clans.find((x) => x.id === state.clan);
      if (!c) return wait({ ok: true });
      c.members = c.members.filter((m) => m !== 'me');
      if (c.leader === 'me') c.leader = c.members.slice().sort((a, b) => player(b).copas - player(a).copas)[0] || null;
      (state.chat[c.id] = state.chat[c.id] || []).push({ sys: true, text: me().name + ' ha abandonado el clan', time: Date.now() });
      state.clan = null;
      state.left[c.id] = true;
      save();
      return wait({ ok: true });
    },

    // ------------------------------------------------ chat del clan
    chat() {
      load();
      if (!state.clan) return wait([]);
      return wait((state.chat[state.clan] || []).slice(-60));
    },
    sendChat(text) {
      load();
      text = String(text || '').trim().slice(0, 140);
      if (!text || !state.clan) return wait({ error: 'No se puede enviar.' });
      const cid = state.clan;
      const ch = (state.chat[cid] = state.chat[cid] || []);
      ch.push({ from: 'me', name: me().name, text, time: Date.now() });
      save();
      // alguien del clan contesta al rato (solo en la simulación)
      const c = world.clans.find((x) => x.id === cid);
      const others = c.members.filter((m) => m !== 'me');
      if (others.length && Math.random() < 0.7) {
        setTimeout(() => {
          if (state.clan !== cid) return;
          const p = player(others[Math.floor(Math.random() * others.length)]);
          ch.push({ from: p.id, name: p.name, text: REPLIES[Math.floor(Math.random() * REPLIES.length)], time: Date.now() });
          save();
          emit('chat');
        }, 1500 + Math.random() * 3000);
      }
      return wait({ ok: true });
    },

    // ------------------------------------------------ amigos
    friends() {
      load();
      return wait(state.friends.map((id) => withStatus(player(id))).filter(Boolean).sort((a, b) => b.online - a.online || b.copas - a.copas));
    },
    requests() {
      load();
      return wait(state.requests.map((id) => player(id)).filter(Boolean));
    },
    searchPlayers(q) {
      load();
      const s = String(q || '').toLowerCase().replace('#', '').trim();
      if (s.length < 2) return wait([]);
      const list = world.players.filter((p) => p.name.toLowerCase().includes(s) || p.tag.toLowerCase().includes(s));
      return wait(list.slice(0, 12).map((p) => ({ ...withStatus(p), friend: state.friends.includes(p.id), sent: !!state.sent[p.id] })));
    },
    addFriend(id) {
      load();
      if (state.friends.includes(id)) return wait({ error: 'Ya sois amigos.' });
      if (state.friends.length >= 100) return wait({ error: 'Has llegado al máximo de amigos.' });
      state.sent[id] = Date.now();
      save();
      return wait({ ok: true });
    },
    answerRequest(id, accept) {
      load();
      state.requests = state.requests.filter((x) => x !== id);
      if (accept && !state.friends.includes(id)) state.friends.push(id);
      save();
      return wait({ ok: true });
    },
    removeFriend(id) {
      load();
      state.friends = state.friends.filter((x) => x !== id);
      save();
      return wait({ ok: true });
    },
  };
})();
