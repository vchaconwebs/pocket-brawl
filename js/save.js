// Progreso del jugador: monedas, Puntos Pokémon, Pokémon desbloqueados y sus niveles,
// cofres, fichas y misiones. Se guarda en el navegador (localStorage).
PB.META = {
  // Pokémon con los que se empieza (los tres iniciales)
  starters: ['charmander', 'squirtle', 'bulbasaur'],
  // rareza y precio en Puntos Pokémon para desbloquear
  rarity: {
    charmander: { name: 'Inicial', color: '#9ad08a', cost: 0 },
    squirtle: { name: 'Inicial', color: '#9ad08a', cost: 0 },
    bulbasaur: { name: 'Inicial', color: '#9ad08a', cost: 0 },
    pikachu: { name: 'Raro', color: '#5aa8ff', cost: 300 },
    geodude: { name: 'Raro', color: '#5aa8ff', cost: 300 },
    gastly: { name: 'Épico', color: '#c07aff', cost: 600 },
  },
  maxLevel: 10,
  levelBonus: 0.05, // +5 % de vida y daño por nivel
  // monedas para pasar del nivel N al N+1 (índice = nivel actual)
  levelCost: [0, 20, 35, 75, 140, 290, 480, 800, 1250, 1875],
  tokensPerChest: 100,
  // cofres (Pokéballs): tiradas de premio y probabilidad de Pokémon nuevo en cada tirada
  chests: {
    poke: { name: 'Poké Ball', rolls: 1, pokemon: 0.04, color: '#e8331c' },
    great: { name: 'Super Ball', rolls: 3, pokemon: 0.05, color: '#3a7ad8' },
    ultra: { name: 'Ultra Ball', rolls: 10, pokemon: 0.04, color: '#f8c030' },
  },
};

// Multiplicador de stats para un nivel
PB.levelMul = (lvl) => 1 + PB.META.levelBonus * ((lvl || 1) - 1);

// Estadísticas de un Pokémon a un nivel (para la ficha)
PB.statsAt = (def, lvl) => {
  const k = PB.levelMul(lvl);
  const a = def.attack, s = def.super;
  const atkDmg = a.dmg * (a.count && a.kind !== 'burst' ? 1 : 1) * k;
  return {
    hp: Math.round(def.hp * k),
    dmg: Math.round(atkDmg),
    shots: a.kind === 'burst' ? a.count : a.count || 1,
    superDmg: s.dmg ? Math.round(s.dmg * k) : s.dps ? Math.round(s.dps * k) : 0,
    speed: def.speed,
    reload: def.reload,
    range: a.range || 0,
  };
};

PB.Save = (() => {
  const KEY = 'pb.save.v1';
  let data = null;

  const MISSIONS = [
    { type: 'play', n: 3, text: 'Juega 3 partidas' },
    { type: 'play', n: 5, text: 'Juega 5 partidas' },
    { type: 'win', n: 2, text: 'Gana 2 partidas' },
    { type: 'win', n: 4, text: 'Gana 4 partidas' },
    { type: 'ko', n: 8, text: 'Debilita a 8 Pokémon' },
    { type: 'ko', n: 15, text: 'Debilita a 15 Pokémon' },
    { type: 'balls', n: 15, text: 'Recoge 15 Pokéballs en Atrapa Pokéballs' },
    { type: 'candy', n: 6, text: 'Recoge 6 Caramelos Raros en Niebla Tóxica' },
    { type: 'snorlax', n: 15000, text: 'Haz 15.000 de daño a Snorlax' },
    { type: 'goals', n: 2, text: 'Marca 2 goles en Voltorbol' },
    { type: 'zone', n: 60, text: 'Pasa 60 s en la zona de Territorio' },
    { type: 'damage', n: 30000, text: 'Haz 30.000 de daño en total' },
  ];

  function fresh() {
    const owned = {};
    for (const id of PB.META.starters) owned[id] = 1;
    return {
      coins: 50,
      points: 0,
      tokens: 0,
      owned, // id -> nivel
      selected: 'charmander',
      chests: ['great'], // regalo de bienvenida
      missions: [],
      stats: { played: 0, wins: 0 },
    };
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      data = raw ? Object.assign(fresh(), JSON.parse(raw)) : fresh();
    } catch (e) {
      data = fresh();
    }
    if (!data.owned[data.selected]) data.selected = Object.keys(data.owned)[0];
    migrate(data);
    while (data.missions.length < 3) data.missions.push(newMission());
    persist();
    return data;
  }

  function persist() {
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) {}
  }

  // dificultad aproximada de cada misión (1 = fácil, 3 = difícil) para escalar el premio
  const HARD = { play: 0.5, win: 1, ko: 0.12, balls: 0.1, candy: 0.25, snorlax: 0.0001, goals: 1, zone: 0.03, damage: 0.00006 };

  function newMission() {
    const taken = new Set(data ? data.missions.map((m) => m.text) : []);
    const pool = MISSIONS.filter((m) => !taken.has(m.text));
    const m = pool[Math.floor(Math.random() * pool.length)] || MISSIONS[0];
    const diff = Math.max(1, Math.min(3, m.n * (HARD[m.type] || 0.5)));
    const r = Math.random();
    let reward;
    if (r < 0.33) reward = { kind: 'coins', amount: Math.round((30 + diff * 25) / 5) * 5 };
    else if (r < 0.6) reward = { kind: 'points', amount: Math.round((20 + diff * 20) / 5) * 5 };
    else if (r < 0.86 || diff < 1.5) reward = { kind: 'great' };
    else reward = { kind: 'ultra' };
    return { ...m, progress: 0, reward };
  }

  // misiones guardadas con el formato antiguo (reward: 'poke' | 'great')
  function migrate(d) {
    for (const m of d.missions) {
      if (typeof m.reward === 'string') m.reward = m.reward === 'poke' ? { kind: 'coins', amount: 50 } : { kind: m.reward };
    }
  }

  const get = () => data || load();

  // ---------------------------------------------------------------- Pokémon
  function owned(id) {
    return !!get().owned[id];
  }
  function level(id) {
    return get().owned[id] || 0;
  }
  function select(id) {
    if (!owned(id)) return false;
    get().selected = id;
    persist();
    return true;
  }
  function upgradeCost(id) {
    const l = level(id);
    return l >= PB.META.maxLevel ? null : PB.META.levelCost[l];
  }
  function upgrade(id) {
    const c = upgradeCost(id);
    if (c == null || get().coins < c) return false;
    data.coins -= c;
    data.owned[id]++;
    persist();
    return true;
  }
  function unlockCost(id) {
    return PB.META.rarity[id] ? PB.META.rarity[id].cost : 500;
  }
  function unlock(id) {
    if (owned(id)) return false;
    const c = unlockCost(id);
    if (get().points < c) return false;
    data.points -= c;
    data.owned[id] = 1;
    persist();
    return true;
  }

  // ---------------------------------------------------------------- cofres
  // Abre el primer cofre de la lista y devuelve los premios
  function openChest(index) {
    const d = get();
    const kind = d.chests.splice(index || 0, 1)[0];
    if (!kind) return null;
    const C = PB.META.chests[kind];
    const res = { kind, coins: 0, points: 0, pokemon: [] };
    for (let i = 0; i < C.rolls; i++) {
      const locked = PB.BRAWLERS.map((b) => b.id).filter((id) => !d.owned[id] && !res.pokemon.includes(id));
      if (locked.length && Math.random() < C.pokemon) {
        // los raros salen más que los épicos
        const weighted = locked.flatMap((id) => (unlockCost(id) > 400 ? [id] : [id, id, id]));
        res.pokemon.push(weighted[Math.floor(Math.random() * weighted.length)]);
        continue;
      }
      if (Math.random() < 0.55) res.coins += 20 + Math.floor(Math.random() * 26);
      else res.points += 15 + Math.floor(Math.random() * 26);
    }
    if (!res.coins && !res.points && !res.pokemon.length) res.coins = 20;
    d.coins += res.coins;
    d.points += res.points;
    for (const id of res.pokemon) d.owned[id] = 1;
    persist();
    return res;
  }

  // ---------------------------------------------------------------- partidas y misiones
  // Recompensas al terminar una partida. r = { win, draw, rank, mode, me, game }
  function applyMatch(r) {
    const d = get();
    let tokens;
    if (r.mode === 'showdown') tokens = [0, 50, 40, 40, 30, 30, 20, 20, 15, 10, 10][r.rank || 10] || 10;
    else tokens = r.win ? 40 : r.draw ? 25 : 15;
    d.stats.played++;
    if (r.win) d.stats.wins++;
    d.tokens += tokens;
    const newChests = [];
    while (d.tokens >= PB.META.tokensPerChest) {
      d.tokens -= PB.META.tokensPerChest;
      d.chests.push('poke');
      newChests.push('poke');
    }
    // progreso de misiones
    const me = r.me;
    const add = { play: 1, win: r.win ? 1 : 0, ko: me.kills, damage: me.dmgDone };
    if (r.mode === 'gems') add.balls = me.ballsTaken;
    if (r.mode === 'showdown') add.candy = me.stat;
    if (r.mode === 'heist') add.snorlax = me.stat;
    if (r.mode === 'ball') add.goals = me.stat;
    if (r.mode === 'zone') add.zone = me.stat;
    for (const m of d.missions) m.progress = Math.min(m.n, m.progress + (add[m.type] || 0));
    persist();
    return { tokens, newChests };
  }

  function claimMission(i) {
    const d = get();
    const m = d.missions[i];
    if (!m || m.progress < m.n) return null;
    const r = m.reward;
    if (r.kind === 'coins') d.coins += r.amount;
    else if (r.kind === 'points') d.points += r.amount;
    else d.chests.push(r.kind);
    d.missions[i] = newMission();
    persist();
    return r;
  }

  // Índice del mejor cofre para abrir primero (Ultra > Super > Poké)
  function nextChest() {
    const d = get();
    for (const k of ['ultra', 'great', 'poke']) {
      const i = d.chests.indexOf(k);
      if (i >= 0) return i;
    }
    return -1;
  }

  function reset() {
    data = fresh();
    while (data.missions.length < 3) data.missions.push(newMission());
    persist();
  }

  return { load, get, persist, owned, level, select, upgradeCost, upgrade, unlockCost, unlock, openChest, nextChest, applyMatch, claimMission, reset };
})();
