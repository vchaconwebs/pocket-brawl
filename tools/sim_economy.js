// Simulador de la economía: cuántos días tarda un jugador en conseguir Pokémon, subirlos y comprar shinies.
// Uso:  node tools/sim_economy.js
// Carga los datos reales del juego (roster, precios, cofres, misiones) y simula jugadores
// que juegan N partidas al día, ganan la mitad y gastan los Puntos Pokémon en el Pokémon más barato que les falte.
global.window = {};
global.PB = {};
global.document = undefined;
global.localStorage = undefined;
require('../js/sprite-data.js');
require('../js/data.js');
require('../js/roster-data.js');
PB.VFX = { forType: () => ({ proj: 'ball' }) };
PB.Sprites = { hasShiny: () => true };
require('../js/roster.js');
require('../js/save.js');

const M = PB.META;
const rnd = Math.random;

function simulate(perDay, days) {
  const owned = new Set(PB.STARTER_DEX.grass.slice(0, 1).concat(PB.STARTER_DEX.fire.slice(0, 1), PB.STARTER_DEX.water.slice(0, 1))
    .map((dex) => PB.BRAWLERS.find((b) => b.dex === dex).id));
  let coins = 50, points = 0, rainbow = 0, tokens = 0, pity = 0, shinies = 0, levelsBought = 0;
  const chests = ['great'];
  const marks = {};
  const locked = () => PB.BRAWLERS.filter((b) => !owned.has(b.id));
  const cost = (b) => PB.RARITY[b.rarity].cost;
  const openChest = (kind) => {
    const C = M.chests[kind];
    let got = 0;
    for (let i = 0; i < C.rolls; i++) {
      const L = locked();
      const guaranteed = (C.guaranteed && i === 0) || pity >= M.pityChests;
      if (L.length && (guaranteed || rnd() < C.pokemon)) {
        owned.add(L[Math.floor(rnd() * L.length)].id);
        got++;
        pity = 0;
        continue;
      }
      if (rnd() < 0.55) coins += 20 + Math.floor(rnd() * 26);
      else points += 15 + Math.floor(rnd() * 26);
    }
    if (!got) pity++;
    if (kind === 'great' && rnd() < M.rainbowChance.great) rainbow += 3 + Math.floor(rnd() * 4);
    if (kind === 'ultra' && rnd() < M.rainbowChance.ultra) rainbow += 8 + Math.floor(rnd() * 8);
  };
  const reward = (r) => {
    if (r.kind === 'coins') coins += r.amount;
    else if (r.kind === 'points') points += r.amount;
    else chests.push(r.kind);
  };
  const mission = (weekly) => {
    const r = rnd();
    if (weekly) {
      if (r < 0.3) return { kind: 'coins', amount: 280 };
      if (r < 0.55) return { kind: 'points', amount: 220 };
      if (r < 0.75) return { kind: 'great' };
      return { kind: 'ultra' };
    }
    if (r < 0.4) return { kind: 'coins', amount: 55 };
    if (r < 0.75) return { kind: 'points', amount: 45 };
    return { kind: 'great' };
  };
  for (let day = 1; day <= days; day++) {
    let winsToday = 0;
    for (let m = 0; m < perDay; m++) {
      const win = rnd() < 0.5;
      const R = win ? M.matchReward.win : M.matchReward.lose;
      coins += R.coins;
      points += R.points;
      rainbow += R.rainbow || 0;
      let tk = win ? 40 : 15;
      if (win && winsToday < M.bonusWins) tk *= 2;
      if (win) winsToday++;
      tokens += tk;
      while (tokens >= M.tokensPerChest) { tokens -= M.tokensPerChest; chests.push('poke'); }
    }
    if (perDay >= 3) for (let i = 0; i < 3; i++) reward(mission(false));
    if (day % 7 === 0 && perDay >= 4) for (let i = 0; i < 3; i++) reward(mission(true));
    while (chests.length) openChest(chests.shift());
    // gasta: primero desbloquear (el más barato), luego subir de nivel, luego shiny
    for (;;) {
      const L = locked().sort((a, b) => cost(a) - cost(b));
      if (L.length && points >= cost(L[0])) { points -= cost(L[0]); owned.add(L[0].id); } else break;
    }
    while (rainbow >= M.shinyCost) { rainbow -= M.shinyCost; shinies++; }
    const n = owned.size;
    for (const [k, v] of [['10', 10], ['25', 25], ['50', 50], ['100', 100], ['200', 200], ['todos sin legendarios', PB.BRAWLERS.filter((b) => b.rarity !== 'legendary').length], ['todos', PB.BRAWLERS.length]]) {
      if (n >= v && !marks[k]) marks[k] = day;
    }
    if (shinies >= 1 && !marks['1er shiny']) marks['1er shiny'] = day;
    if (!marks['1 Pokémon a nivel 10'] && coins >= M.levelCost.reduce((a, b) => a + b, 0)) marks['1 Pokémon a nivel 10'] = day;
    levelsBought = coins; // (las monedas se guardan para medir cuándo se llega a maxear uno)
  }
  return marks;
}

const median = (arr) => arr.sort((a, b) => a - b)[arr.length >> 1];
console.log('Pokémon:', PB.BRAWLERS.length, '· coste de desbloquearlos todos:',
  PB.BRAWLERS.reduce((s, b) => s + PB.RARITY[b.rarity].cost, 0), 'Puntos Pokémon');
for (const perDay of [4, 10, 25]) {
  const runs = Array.from({ length: 30 }, () => simulate(perDay, 720));
  const keys = [...new Set(runs.flatMap((r) => Object.keys(r)))];
  const out = {};
  for (const k of keys) out[k] = runs.every((r) => r[k]) ? median(runs.map((r) => r[k])) + ' días' : '> 2 años';
  console.log(`\n${perDay} partidas al día:`);
  console.table(out);
}
