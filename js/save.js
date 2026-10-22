// Progreso del jugador: monedas, Puntos Pokémon, Pokémon y niveles, copas, cofres, fichas,
// misiones diarias y semanales, logros y estadísticas. Se guarda en el navegador (localStorage).
// Cuando haya cuentas online, esto se guardará en el servidor (ver js/online.js).
PB.META = {
  // al empezar se eligen 3 iniciales: uno de planta, uno de fuego y uno de agua (de cualquier generación)
  // la rareza y el precio de cada Pokémon están en js/roster.js (PB.RARITY)
  maxLevel: 10,
  levelBonus: 0.02, // +2 % de vida y daño por nivel (lo importante es evolucionar en la partida)
  // monedas para pasar del nivel N al N+1 (índice = nivel actual)
  levelCost: [0, 10, 20, 40, 80, 150, 250, 380, 500, 600], // 2.030 monedas del 1 al 10
  tokensPerChest: 100,
  // premio de cada partida (en Niebla Tóxica cuenta como victoria quedar entre los 4 primeros)
  matchReward: {
    win: { coins: 25, points: 24, rainbow: 3 },
    lose: { coins: 10, points: 11, rainbow: 1 },
  },
  bonusWins: 3, // las 3 primeras victorias del día dan el doble de fichas
  // cofres (Pokéballs): tiradas de premio y probabilidad de Pokémon nuevo en cada tirada
  chests: {
    poke: { name: 'Poké Ball', rolls: 2, pokemon: 0.1, color: '#e8331c' },
    great: { name: 'Super Ball', rolls: 4, pokemon: 0.1, color: '#3a7ad8' },
    ultra: { name: 'Ultra Ball', rolls: 8, pokemon: 0.1, guaranteed: true, color: '#f8c030' },
  },
  pityChests: 6, // si abres 6 cofres seguidos sin Pokémon nuevo, el siguiente trae uno seguro
  rainbowChance: { great: 0.6, ultra: 1 },
  // pase de temporada (gratis): una temporada por mes, 30 niveles que se suben jugando
  pass: { levels: 30, xpPerLevel: 300, xpWin: 60, xpLose: 30, xpMission: 50, firstSeason: [2026, 10] },
  clanCost: 300, // monedas para crear un clan
  // skins shiny: se compran con Monedas Arcoíris
  shinyCost: 80,
  clanMax: 30,
};

// Multiplicador de stats para un nivel
PB.levelMul = (lvl) => 1 + PB.META.levelBonus * ((lvl || 1) - 1);

// Estadísticas de un Pokémon a un nivel (para la ficha)
PB.statsAt = (def, lvl) => {
  const k = PB.levelMul(lvl);
  const a = def.attack, s = def.super;
  return {
    hp: Math.round(def.hp * k),
    dmg: Math.round(a.dmg * k),
    shots: a.kind === 'burst' ? a.count : a.count || 1,
    superDmg: s.dmg ? Math.round(s.dmg * k) : s.dps ? Math.round(s.dps * k) : 0,
    speed: def.speed,
    reload: def.reload,
    range: a.range || 0,
  };
};

// Copas que se ganan o pierden según las copas que ya tiene ese Pokémon
PB.copasDelta = (copas, result, rank) => {
  if (rank) {
    // Niebla Tóxica: según el puesto (1 a 10)
    const table = copas < 100 ? [10, 8, 7, 6, 4, 2, 0, -1, -2, -3] : copas < 400 ? [9, 7, 5, 4, 2, 0, -2, -3, -4, -5] : [8, 6, 4, 2, 0, -2, -4, -5, -6, -7];
    return table[Math.max(0, Math.min(9, rank - 1))];
  }
  if (result === 'draw') return 0;
  if (result === 'win') return copas < 100 ? 10 : copas < 400 ? 8 : copas < 800 ? 7 : 6;
  // perder siempre quita algo (nunca se baja de 0)
  return copas < 30 ? -2 : copas < 100 ? -4 : copas < 400 ? -5 : copas < 800 ? -6 : -7;
};

PB.Save = (() => {
  const KEY = 'pb.save.v1';
  let data = null;

  // ---------------------------------------------------------------- misiones
  // n = objetivo diario. Las semanales usan el mismo tipo con objetivo ×5 y mejor premio.
  const MISSIONS = [
    { type: 'play', n: 3, text: 'Juega {n} partidas' },
    { type: 'win', n: 2, text: 'Gana {n} partidas' },
    { type: 'ko', n: 10, text: 'Debilita a {n} Pokémon' },
    { type: 'balls', n: 15, text: 'Recoge {n} Pokéballs en Atrapa Pokéballs' },
    { type: 'candy', n: 6, text: 'Recoge {n} Caramelos Raros en Niebla Tóxica' },
    { type: 'snorlax', n: 15000, text: 'Haz {n} de daño a Snorlax' },
    { type: 'goals', n: 2, text: 'Marca {n} goles en Voltorbol' },
    { type: 'zone', n: 60, text: 'Pasa {n} s en la zona de Territorio' },
    { type: 'damage', n: 30000, text: 'Haz {n} de daño en total' },
    { type: 'supers', n: 5, text: 'Usa {n} veces el súper' },
    { type: 'copas', n: 20, text: 'Gana {n} copas' },
  ];
  // dificultad aproximada (1 = fácil, 3 = difícil) para escalar el premio
  const HARD = { play: 0.5, win: 1, ko: 0.12, balls: 0.1, candy: 0.25, snorlax: 0.0001, goals: 1, zone: 0.03, damage: 0.00006, supers: 0.3, copas: 0.08 };
  const fmt = (n) => n.toLocaleString('es-ES');

  function makeMission(group, taken) {
    const pool = MISSIONS.filter((m) => !taken.has(m.type));
    const m = pool[Math.floor(Math.random() * pool.length)] || MISSIONS[0];
    const weekly = group === 'weekly';
    const n = weekly ? m.n * 5 : m.n;
    const diff = Math.max(1, Math.min(3, m.n * (HARD[m.type] || 0.5)));
    const r = Math.random();
    let reward;
    if (weekly) {
      if (r < 0.3) reward = { kind: 'coins', amount: Math.round((150 + diff * 80) / 10) * 10 };
      else if (r < 0.55) reward = { kind: 'points', amount: Math.round((120 + diff * 60) / 10) * 10 };
      else if (r < 0.75) reward = { kind: 'great' };
      else reward = { kind: 'ultra' };
    } else {
      if (r < 0.4) reward = { kind: 'coins', amount: Math.round((25 + diff * 20) / 5) * 5 };
      else if (r < 0.75) reward = { kind: 'points', amount: Math.round((20 + diff * 15) / 5) * 5 };
      else reward = { kind: 'great' };
    }
    return { type: m.type, n, text: m.text.replace('{n}', fmt(n)), progress: 0, reward, claimed: false };
  }

  function makeMissions(group) {
    const taken = new Set();
    const out = [];
    for (let i = 0; i < 3; i++) {
      const m = makeMission(group, taken);
      taken.add(m.type);
      out.push(m);
    }
    return out;
  }

  // Claves de día y semana (las diarias cambian a las 00:00 y las semanales el lunes)
  const dayKey = (d = new Date()) => d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
  const weekKey = (d = new Date()) => {
    const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const dow = (x.getDay() + 6) % 7; // lunes = 0
    x.setDate(x.getDate() - dow);
    return dayKey(x);
  };
  function nextReset(group) {
    const now = new Date();
    const x = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    if (group === 'weekly') {
      const dow = (now.getDay() + 6) % 7;
      x.setDate(now.getDate() + (7 - dow));
    }
    return x.getTime() - now.getTime();
  }

  function checkResets() {
    const d = get();
    if (!d.daily || d.daily.key !== dayKey()) d.daily = { key: dayKey(), list: makeMissions('daily') };
    if (!d.weekly || d.weekly.key !== weekKey()) d.weekly = { key: weekKey(), list: makeMissions('weekly') };
  }

  // ---------------------------------------------------------------- logros
  // Cada estadística tiene varios niveles; los premios suben con la dificultad.
  const ACH_DEFS = [
    { stat: 'played', name: 'Entrenador', desc: 'Juega {n} partidas', tiers: [5, 25, 100, 300, 1000] },
    { stat: 'wins', name: 'Ganador', desc: 'Gana {n} partidas', tiers: [1, 10, 50, 150, 500] },
    { stat: 'kills', name: 'Cazador', desc: 'Debilita a {n} Pokémon', tiers: [10, 100, 500, 2000, 5000] },
    { stat: 'damage', name: 'Pegada', desc: 'Haz {n} de daño', tiers: [20000, 200000, 1000000, 5000000, 20000000] },
    { stat: 'supers', name: 'Supermovimiento', desc: 'Usa el súper {n} veces', tiers: [10, 100, 500, 2000] },
    { stat: 'copas', name: 'Copa Pokémon', desc: 'Llega a {n} copas en total', tiers: [50, 200, 500, 1000, 2500, 5000] },
    { stat: 'balls', name: 'Coleccionista', desc: 'Recoge {n} Pokéballs', tiers: [10, 100, 500, 2000] },
    { stat: 'winsGems', name: 'Maestro Pokéball', desc: 'Gana {n} partidas de Atrapa Pokéballs', tiers: [1, 10, 50, 200] },
    { stat: 'candies', name: 'Goloso', desc: 'Recoge {n} Caramelos Raros', tiers: [10, 100, 500, 1500] },
    { stat: 'winsShowdown', name: 'Superviviente', desc: 'Queda primero {n} veces en Niebla Tóxica', tiers: [1, 10, 50, 150] },
    { stat: 'snorlax', name: 'Despertador', desc: 'Haz {n} de daño a Snorlax', tiers: [10000, 100000, 500000, 2000000] },
    { stat: 'winsHeist', name: 'Ladrón de siestas', desc: 'Gana {n} partidas de Despierta a Snorlax', tiers: [1, 10, 50, 200] },
    { stat: 'goals', name: 'Goleador', desc: 'Marca {n} goles', tiers: [1, 10, 50, 200] },
    { stat: 'winsBall', name: 'Crack del Voltorbol', desc: 'Gana {n} partidas de Voltorbol', tiers: [1, 10, 50, 200] },
    { stat: 'zone', name: 'Guardián', desc: 'Pasa {n} s en la zona de Territorio', tiers: [60, 600, 3000, 10000] },
    { stat: 'winsZone', name: 'Conquistador', desc: 'Gana {n} partidas de Territorio', tiers: [1, 10, 50, 200] },
    { stat: 'chests', name: 'Abrecofres', desc: 'Abre {n} cofres', tiers: [1, 10, 50, 200] },
    { stat: 'unlocked', name: 'Pokédex', desc: 'Consigue {n} Pokémon', tiers: [5, 15, 40, 80, 150, 300] },
    { stat: 'maxLevel', name: 'Entrenamiento', desc: 'Sube un Pokémon a nivel {n}', tiers: [2, 5, 7, 10] },
    { stat: 'streak', name: 'Racha', desc: 'Gana {n} partidas seguidas', tiers: [3, 5, 10] },
  ];
  const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI'];
  // premio de un logro según su nivel (0 = fácil) y cuántos niveles tiene
  function achReward(t, count) {
    const k = count <= 3 ? t + 1 : t; // logros cortos dan un poco más
    if (k <= 0) return [{ kind: 'coins', amount: 30 }];
    if (k === 1) return [{ kind: 'coins', amount: 80 }, { kind: 'points', amount: 30 }];
    if (k === 2) return [{ kind: 'great' }, { kind: 'points', amount: 60 }];
    if (k === 3) return [{ kind: 'ultra' }];
    return [{ kind: 'ultra' }, { kind: 'points', amount: 300 }, { kind: 'coins', amount: 500 }];
  }
  const ACHIEVEMENTS = [];
  for (const def of ACH_DEFS) {
    def.tiers.forEach((n, t) => {
      ACHIEVEMENTS.push({
        id: def.stat + '-' + t,
        stat: def.stat,
        name: def.name + ' ' + ROMAN[t],
        desc: def.desc.replace('{n}', fmt(n)),
        n,
        tier: t,
        reward: achReward(t, def.tiers.length),
      });
    });
  }

  function statValue(stat) {
    const d = get();
    if (stat === 'copas') return totalCopas();
    if (stat === 'unlocked') return Object.keys(d.owned).length;
    if (stat === 'maxLevel') return Math.max(0, ...Object.values(d.owned));
    if (stat === 'streak') return d.stats.bestStreak || 0;
    return d.stats[stat] || 0;
  }

  function achievements() {
    const d = get();
    return ACHIEVEMENTS.map((a) => ({ ...a, progress: Math.min(a.n, statValue(a.stat)), claimed: !!d.ach[a.id] }));
  }

  function claimAchievement(id) {
    const a = achievements().find((x) => x.id === id);
    if (!a || a.claimed || a.progress < a.n) return null;
    get().ach[id] = true;
    for (const r of a.reward) giveReward(r);
    persist();
    return a.reward;
  }

  // ---------------------------------------------------------------- guardado
  function fresh() {
    return {
      name: 'Entrenador' + Math.floor(1000 + Math.random() * 9000),
      tag: '#' + Math.random().toString(36).slice(2, 8).toUpperCase(),
      coins: 50,
      points: 0,
      tokens: 0,
      rainbow: 0, // Monedas Arcoíris (solo para skins shiny)
      owned: {}, // id -> nivel (vacío hasta elegir los iniciales)
      shinies: {}, // id -> true si tiene la skin shiny
      skins: {}, // id -> 'shiny' si la lleva puesta
      copas: {}, // id -> copas
      selected: null,
      chests: ['great'], // regalo de bienvenida
      daily: null,
      weekly: null,
      ach: {},
      stats: { played: 0, wins: 0, streak: 0, bestStreak: 0 },
    };
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      data = raw ? Object.assign(fresh(), JSON.parse(raw)) : fresh();
    } catch (e) {
      data = fresh();
    }
    // partidas guardadas de antes: los Pokémon que ya no existen se quitan
    for (const id of Object.keys(data.owned)) if (!PB.brawlerById(id)) delete data.owned[id];
    if (!data.owned[data.selected]) data.selected = Object.keys(data.owned)[0] || null;
    delete data.missions; // formato antiguo
    checkResets();
    persist();
    return data;
  }

  function persist() {
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) {}
    if (PB.Online && PB.Online.saveCloud) PB.Online.saveCloud();
  }

  const get = () => data || load();

  function giveReward(r) {
    const d = get();
    if (r.kind === 'coins') d.coins += r.amount;
    else if (r.kind === 'points') d.points += r.amount;
    else if (r.kind === 'rainbow') d.rainbow += r.amount;
    else d.chests.push(r.kind);
  }

  // ---------------------------------------------------------------- perfil
  function setName(name) {
    const n = String(name || '').trim().slice(0, 16);
    if (n.length < 3) return false;
    get().name = n;
    persist();
    return true;
  }

  // ---------------------------------------------------------------- Pokémon
  const owned = (id) => !!get().owned[id];
  const level = (id) => get().owned[id] || 0;
  const copas = (id) => get().copas[id] || 0;
  const totalCopas = () => Object.values(get().copas).reduce((a, b) => a + b, 0);
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
  const unlockCost = (id) => {
    const b = PB.brawlerById(id);
    return b && PB.RARITY[b.rarity] ? PB.RARITY[b.rarity].cost : 500;
  };
  // ¿hay que elegir los iniciales? (partida nueva)
  const needsStarters = () => !Object.keys(get().owned).length;
  function chooseStarters(ids) {
    const d = get();
    if (!needsStarters() || ids.length !== 3) return false;
    for (const id of ids) d.owned[id] = 1;
    d.selected = ids[0];
    persist();
    return true;
  }
  // skins shiny (todas las fases tienen que tener sprite shiny)
  const shinyAvailable = (id) => {
    const b = PB.brawlerById(id);
    return !!b && (b.alts || [b.line]).every((l) => l.every((dex) => PB.Sprites.hasShiny(dex)));
  };
  const hasShiny = (id) => !!get().shinies[id];
  const skin = (id) => (id && get().skins[id] === 'shiny' && hasShiny(id) ? 'shiny' : 'normal');
  function buyShiny(id) {
    const d = get();
    if (!owned(id) || hasShiny(id) || !shinyAvailable(id) || d.rainbow < PB.META.shinyCost) return false;
    d.rainbow -= PB.META.shinyCost;
    d.shinies[id] = true;
    d.skins[id] = 'shiny';
    persist();
    return true;
  }
  // rama de evolución elegida (Eevee -> Vaporeon / Jolteon / ...)
  const branch = (id) => {
    const b = PB.brawlerById(id);
    const i = (get().branches || {})[id] || 0;
    return b && b.alts && b.alts[i] ? i : 0;
  };
  const lineOf = (id) => {
    const b = PB.brawlerById(id);
    return b.alts ? b.alts[branch(id)] : b.line;
  };
  function setBranch(id, i) {
    const d = get();
    d.branches = d.branches || {};
    d.branches[id] = i;
    persist();
  }
  function setSkin(id, sk) {
    if (sk === 'shiny' && !hasShiny(id)) return false;
    get().skins[id] = sk;
    persist();
    return true;
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
  function spendCoins(n) {
    if (get().coins < n) return false;
    data.coins -= n;
    persist();
    return true;
  }

  // ---------------------------------------------------------------- cofres
  function openChest(index) {
    const d = get();
    const kind = d.chests.splice(index || 0, 1)[0];
    if (!kind) return null;
    const C = PB.META.chests[kind];
    const res = { kind, coins: 0, points: 0, pokemon: [] };
    for (let i = 0; i < C.rolls; i++) {
      const locked = PB.BRAWLERS.map((b) => b.id).filter((id) => !d.owned[id] && !res.pokemon.includes(id));
      // la Ultra Ball trae siempre uno; y tras muchos cofres sin ninguno, sale seguro
      const sure = (C.guaranteed && i === 0) || (d.pity || 0) >= PB.META.pityChests;
      if (locked.length && (sure || Math.random() < C.pokemon)) {
        d.pity = 0;
        // los comunes salen más que los raros, y los raros más que los épicos
        const W = { common: 3, starter: 2, rare: 2, epic: 1, legendary: 0.4 };
        let total = 0;
        for (const id of locked) total += W[PB.brawlerById(id).rarity] || 1;
        let r = Math.random() * total;
        let pick = locked[0];
        for (const id of locked) { r -= W[PB.brawlerById(id).rarity] || 1; if (r <= 0) { pick = id; break; } }
        res.pokemon.push(pick);
        continue;
      }
      if (Math.random() < 0.55) res.coins += 20 + Math.floor(Math.random() * 26);
      else res.points += 25 + Math.floor(Math.random() * 36);
    }
    if (!res.coins && !res.points && !res.pokemon.length) res.coins = 20;
    if (!res.pokemon.length) d.pity = (d.pity || 0) + 1;
    // Monedas Arcoíris: muchas veces en Super Ball y siempre en Ultra Ball
    res.rainbow = 0;
    if (kind === 'great' && Math.random() < PB.META.rainbowChance.great) res.rainbow = 4 + Math.floor(Math.random() * 5);
    if (kind === 'ultra' && Math.random() < PB.META.rainbowChance.ultra) res.rainbow = 10 + Math.floor(Math.random() * 11);
    d.coins += res.coins;
    d.points += res.points;
    d.rainbow = (d.rainbow || 0) + res.rainbow;
    for (const id of res.pokemon) d.owned[id] = 1;
    d.stats.chests = (d.stats.chests || 0) + 1;
    persist();
    return res;
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

  // ---------------------------------------------------------------- partidas
  // r = { win, draw, rank, mode, me }
  function applyMatch(r) {
    const d = get();
    checkResets();
    const me = r.me, id = me.def.id;
    // copas
    const before = copas(id);
    const delta = PB.copasDelta(before, r.win ? 'win' : r.draw ? 'draw' : 'lose', r.mode === 'showdown' ? r.rank || 10 : 0);
    d.copas[id] = Math.max(0, before + delta);
    // fichas y cofres
    let tokens;
    if (r.mode === 'showdown') tokens = [0, 50, 40, 40, 30, 30, 20, 20, 15, 10, 10][r.rank || 10] || 10;
    else tokens = r.win ? 40 : r.draw ? 25 : 15;
    // las primeras victorias del día dan fichas dobles
    const won = r.mode === 'showdown' ? (r.rank || 10) <= 4 : r.win;
    const today = new Date().toDateString();
    if (d.bonusDay !== today) { d.bonusDay = today; d.bonusLeft = PB.META.bonusWins; }
    let bonus = false;
    if (won && d.bonusLeft > 0) { d.bonusLeft--; tokens *= 2; bonus = true; }
    d.tokens += tokens;
    // monedas, Puntos Pokémon y Monedas Arcoíris de la partida
    const MR = PB.META.matchReward[won ? 'win' : 'lose'];
    d.coins += MR.coins;
    d.points += MR.points;
    d.rainbow = (d.rainbow || 0) + (MR.rainbow || 0);
    const passXp = won ? PB.META.pass.xpWin : PB.META.pass.xpLose;
    const passBefore = pass().level;
    addPassXp(passXp);
    const passUp = pass().level > passBefore;
    const newChests = [];
    while (d.tokens >= PB.META.tokensPerChest) {
      d.tokens -= PB.META.tokensPerChest;
      d.chests.push('poke');
      newChests.push('poke');
    }
    // estadísticas
    const s = d.stats;
    const inc = (k, v) => { s[k] = (s[k] || 0) + (v || 0); };
    inc('played', 1);
    inc('wins', r.win ? 1 : 0);
    inc('kills', me.kills);
    inc('damage', Math.round(me.dmgDone));
    inc('supers', me.supersUsed || 0);
    s.streak = r.win ? (s.streak || 0) + 1 : 0;
    s.bestStreak = Math.max(s.bestStreak || 0, s.streak);
    const winKey = { gems: 'winsGems', showdown: 'winsShowdown', heist: 'winsHeist', ball: 'winsBall', zone: 'winsZone' }[r.mode];
    if (r.mode === 'showdown' ? r.rank === 1 : r.win) inc(winKey, 1);
    const add = { play: 1, win: r.win ? 1 : 0, ko: me.kills, damage: me.dmgDone, supers: me.supersUsed || 0, copas: Math.max(0, delta) };
    if (r.mode === 'gems') { add.balls = me.ballsTaken; inc('balls', me.ballsTaken); }
    if (r.mode === 'showdown') { add.candy = me.stat; inc('candies', me.stat); }
    if (r.mode === 'heist') { add.snorlax = me.stat; inc('snorlax', Math.round(me.stat)); }
    if (r.mode === 'ball') { add.goals = me.stat; inc('goals', me.stat); }
    if (r.mode === 'zone') { add.zone = me.stat; inc('zone', Math.round(me.stat)); }
    // misiones
    for (const m of [...d.daily.list, ...d.weekly.list]) {
      if (!m.claimed) m.progress = Math.min(m.n, m.progress + (add[m.type] || 0));
    }
    persist();
    return { tokens, newChests, copas: delta, copasNow: d.copas[id], coins: MR.coins, points: MR.points, rainbow: MR.rainbow || 0, bonus, bonusLeft: d.bonusLeft, passXp, passUp };
  }

  // Abandonar una partida en red (cerrar la página o perder la conexión y no volver):
  // cuenta como derrota en copas. Varios abandonos seguidos dan un rato sin poder buscar partida.
  function applyAbandon(info) {
    const d = get();
    const id = info.id;
    if (d.copas[id] !== undefined) d.copas[id] = Math.max(0, copas(id) + PB.copasDelta(copas(id), 'lose', info.mode === 'showdown' ? 10 : 0));
    const now = Date.now();
    d.abandons = (d.abandons || []).filter((t) => now - t < 60 * 60 * 1000);
    d.abandons.push(now);
    d.stats.played = (d.stats.played || 0) + 1;
    persist();
  }
  // segundos que faltan para poder jugar online otra vez (0 = ya puedes)
  function abandonWait() {
    const list = (get().abandons || []).filter((t) => Date.now() - t < 60 * 60 * 1000);
    if (list.length < 3) return 0;
    return Math.max(0, Math.ceil((list[list.length - 1] + 5 * 60 * 1000 * (list.length - 2) - Date.now()) / 1000));
  }

  function missions(group) {
    checkResets();
    return get()[group].list;
  }

  function claimMission(group, i) {
    const m = missions(group)[i];
    if (!m || m.claimed || m.progress < m.n) return null;
    m.claimed = true;
    giveReward(m.reward);
    addPassXp(PB.META.pass.xpMission);
    persist();
    return m.reward;
  }

  // ---------------------------------------------------------------- pase de temporada
  const seasonKey = (dt = new Date()) => dt.getFullYear() + '-' + (dt.getMonth() + 1);
  const seasonNumber = (dt = new Date()) => {
    const [y, m] = PB.META.pass.firstSeason;
    return Math.max(1, (dt.getFullYear() - y) * 12 + (dt.getMonth() + 1 - m) + 1);
  };
  // premio de cada nivel (el 30 es el gordo)
  function passReward(lvl) {
    if (lvl === 30) return [{ kind: 'ultra' }, { kind: 'rainbow', amount: 30 }];
    if (lvl % 10 === 0) return [{ kind: 'ultra' }];
    if (lvl % 5 === 0) return [{ kind: 'great' }, { kind: 'rainbow', amount: 8 }];
    const cycle = [{ kind: 'coins', amount: 120 }, { kind: 'points', amount: 90 }, { kind: 'poke' }, { kind: 'points', amount: 90 }];
    return [cycle[lvl % 4]];
  }
  function passState() {
    const d = get();
    if (!d.pass || d.pass.season !== seasonKey()) d.pass = { season: seasonKey(), xp: 0, claimed: [] };
    return d.pass;
  }
  function pass() {
    const P = passState(), M = PB.META.pass;
    const level = Math.min(M.levels, Math.floor(P.xp / M.xpPerLevel));
    const now = new Date();
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const rewards = [];
    for (let l = 1; l <= M.levels; l++) rewards.push({ lvl: l, items: passReward(l), claimed: P.claimed.includes(l), ready: l <= level });
    return {
      season: seasonNumber(), xp: P.xp, level, max: M.levels,
      progress: level >= M.levels ? 1 : (P.xp % M.xpPerLevel) / M.xpPerLevel,
      // pasado el nivel 30, cada nivel de más da una Poké Ball
      extra: Math.max(0, Math.floor(P.xp / M.xpPerLevel) - M.levels) - (P.extraClaimed || 0),
      endsIn: end - now, rewards,
    };
  }
  function addPassXp(n) {
    passState().xp += n;
  }
  function claimPass(lvl) {
    const p = pass(), P = passState();
    const r = p.rewards[lvl - 1];
    if (!r || r.claimed || !r.ready) return null;
    P.claimed.push(lvl);
    for (const it of r.items) giveReward(it);
    persist();
    return r.items;
  }
  function claimPassExtra() {
    const p = pass(), P = passState();
    if (p.extra <= 0) return null;
    P.extraClaimed = (P.extraClaimed || 0) + 1;
    giveReward({ kind: 'poke' });
    persist();
    return [{ kind: 'poke' }];
  }

  // cuántas cosas hay listas para reclamar (para los avisos rojos)
  function pending() {
    checkResets();
    const d = get();
    const mis = [...d.daily.list, ...d.weekly.list].filter((m) => !m.claimed && m.progress >= m.n).length;
    const ach = achievements().filter((a) => !a.claimed && a.progress >= a.n).length;
    const p = pass();
    const ps = p.rewards.filter((r) => r.ready && !r.claimed).length + p.extra;
    return { missions: mis, achievements: ach, pass: ps };
  }

  // progreso traído de la nube (al entrar con una cuenta de Google que ya jugaba)
  function importJSON(json) {
    try {
      data = Object.assign(fresh(), JSON.parse(json));
      persist();
      return true;
    } catch (e) { return false; }
  }

  function reset() {
    data = fresh();
    checkResets();
    persist();
  }

  return {
    load, get, persist, setName, owned, level, copas, totalCopas, select, upgradeCost, upgrade, unlockCost, unlock, spendCoins,
    pass, claimPass, claimPassExtra,
    needsStarters, chooseStarters, shinyAvailable, hasShiny, skin, buyShiny, setSkin, branch, lineOf, setBranch,
    importJSON, openChest, nextChest, applyMatch, applyAbandon, abandonWait, missions, claimMission, nextReset, achievements, claimAchievement, pending, giveReward, reset,
  };
})();
