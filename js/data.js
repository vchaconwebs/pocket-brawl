// Datos del juego: mapa, tabla de tipos y luchadores.
window.PB = window.PB || {};

PB.TILE = 64;

// Mitad superior del mapa (equipo rojo arriba). La mitad inferior se genera girando 180º,
// así el mapa es siempre justo para los dos equipos.
//   .  suelo      #  muro (lo rompen algunos súper)      b  arbusto (te esconde)
//   ~  agua (bloquea el paso, no los disparos)           R  base roja    G  mina de gemas
PB.MAP_TOP = [
  'bbbb....#...#....bbbb',
  'bbb.......R.......bbb',
  'bb.................bb',
  '....###.......###....',
  '....#...........#....',
  '......bbb...bbb......',
  '~~....bbb...bbb....~~',
  '~~.................~~',
  '.....##.......##.....',
  '..b...#.......#...b..',
  '..bb.............bb..',
  '..bb....b...b....bb..',
  '#......###.###......#',
  '#.......b...b.......#',
  '...bb...........bb...',
  '...bb....~.~....bb...',
  '..........G..........', // fila central (debe ser simétrica)
];

PB.buildMap = function () {
  const top = PB.MAP_TOP;
  const rows = top.slice();
  for (let i = top.length - 2; i >= 0; i--) {
    rows.push(top[i].split('').reverse().join('').replace(/R/g, 'A'));
  }
  const w = rows[0].length;
  rows.forEach((r, i) => {
    if (r.length !== w) throw new Error('Fila ' + i + ' del mapa mide ' + r.length + ', no ' + w);
  });
  return rows;
};

// Eficacia de tipos (simplificada). Se multiplica por cada tipo del defensor y se limita a [0.5, 1.5].
PB.EFF = {
  fire:     { grass: 1.3, water: 0.75, rock: 0.75, fire: 0.75 },
  water:    { fire: 1.3, rock: 1.3, ground: 1.3, grass: 0.75, water: 0.75 },
  grass:    { water: 1.3, rock: 1.3, ground: 1.3, fire: 0.75, grass: 0.75, poison: 0.75 },
  electric: { water: 1.3, ground: 0.5, grass: 0.75, electric: 0.75 },
  rock:     { fire: 1.3, ground: 0.75 },
  ghost:    { ghost: 1.3 },
};

PB.effectiveness = function (atkType, defTypes) {
  const row = PB.EFF[atkType] || {};
  let m = 1;
  for (const t of defTypes) m *= row[t] || 1;
  return Math.max(0.5, Math.min(1.5, m));
};

PB.TYPE_INFO = {
  fire: { name: 'Fuego', color: '#ff7a2f' },
  water: { name: 'Agua', color: '#3a9bff' },
  grass: { name: 'Planta', color: '#4fc14a' },
  electric: { name: 'Eléctrico', color: '#f5cf2a' },
  rock: { name: 'Roca', color: '#b39a62' },
  ground: { name: 'Tierra', color: '#d8a957' },
  ghost: { name: 'Fantasma', color: '#7b5bc4' },
  poison: { name: 'Veneno', color: '#a24bc4' },
};

// kind de ataque: spread (abanico), burst (ráfaga), lob (parábola que salta muros)
// kind de súper: spread, zone, dash, slam, stealth
PB.BRAWLERS = [
  {
    id: 'charmander', dex: '0004', name: 'Charmander', types: ['fire'], atkType: 'fire',
    role: 'Cuerpo a cuerpo', hp: 4400, speed: 250, reload: 1.1, superHits: 8,
    attack: { name: 'Ascuas', kind: 'spread', count: 5, spread: 0.5, range: 330, speed: 700, dmg: 380, r: 14, fx: 'fire' },
    super: { name: 'Lanzallamas', kind: 'spread', count: 9, spread: 0.7, range: 420, speed: 760, dmg: 380, r: 18, pierce: true, fx: 'fire' },
    desc: 'Abanico de llamas a corta distancia. Su súper atraviesa a todos.',
  },
  {
    id: 'squirtle', dex: '0007', name: 'Squirtle', types: ['water'], atkType: 'water',
    role: 'Francotirador', hp: 2800, speed: 215, reload: 1.7, superHits: 5,
    attack: { name: 'Pistola Agua', kind: 'spread', count: 1, spread: 0, range: 560, speed: 950, dmg: 760, r: 14, fx: 'water' },
    super: { name: 'Hidrobomba', kind: 'spread', count: 1, spread: 0, range: 700, speed: 900, dmg: 1600, r: 34, pierce: true, destroysWalls: true, knockback: 520, fx: 'water' },
    desc: 'Un chorro largo y potente. Su súper empuja y rompe muros.',
  },
  {
    id: 'bulbasaur', dex: '0001', name: 'Bulbasaur', types: ['grass', 'poison'], atkType: 'grass',
    role: 'Apoyo', hp: 3800, speed: 215, reload: 1.4, superHits: 9,
    attack: { name: 'Hoja Afilada', kind: 'spread', count: 3, spread: 0.28, range: 480, speed: 850, dmg: 420, r: 12, fx: 'leaf' },
    super: { name: 'Drenadoras', kind: 'zone', range: 500, flight: 0.55, radius: 170, duration: 4, dps: 600, heal: 500, fx: 'leaf' },
    desc: 'Tres hojas a media distancia. Su súper planta una zona que daña enemigos y cura aliados.',
  },
  {
    id: 'pikachu', dex: '0025', name: 'Pikachu', types: ['electric'], atkType: 'electric',
    role: 'Asesino', hp: 2600, speed: 255, reload: 1.0, superHits: 7,
    attack: { name: 'Impactrueno', kind: 'burst', count: 2, delay: 0.12, range: 540, speed: 1200, dmg: 380, r: 10, fx: 'electric' },
    super: { name: 'Placaje Eléctrico', kind: 'dash', range: 360, time: 0.22, dmg: 1300, stun: 0.8, r: 40, fx: 'electric' },
    desc: 'Rápido y con ráfagas de rayos. Su súper es una embestida que aturde.',
  },
  {
    id: 'geodude', dex: '0074', name: 'Geodude', types: ['rock', 'ground'], atkType: 'rock',
    role: 'Tanque', hp: 4800, speed: 200, reload: 1.8, superHits: 5,
    attack: { name: 'Lanzarrocas', kind: 'lob', range: 460, flight: 0.65, radius: 70, dmg: 820, fx: 'rock' },
    super: { name: 'Magnitud', kind: 'slam', radius: 230, dmg: 1600, knockback: 600, stun: 0.4, destroysWalls: true, fx: 'rock' },
    desc: 'Lanza rocas por encima de los muros. Su súper sacude el suelo y rompe muros.',
  },
  {
    id: 'gastly', dex: '0092', name: 'Gastly', types: ['ghost', 'poison'], atkType: 'ghost',
    role: 'Sigilo', hp: 2500, speed: 250, reload: 1.2, superHits: 5,
    attack: { name: 'Bola Sombra', kind: 'spread', count: 1, spread: 0, range: 440, speed: 600, dmg: 1200, r: 22, pierce: true, fx: 'ghost' },
    super: { name: 'Desvanecer', kind: 'stealth', time: 3.5, speedMul: 1.3, bonus: 1.5 },
    desc: 'Bolas sombra que atraviesan. Su súper lo vuelve invisible y potencia su siguiente ataque.',
  },
];

PB.brawlerById = function (id) {
  return PB.BRAWLERS.find((b) => b.id === id);
};

PB.RULES = {
  gemsToWin: 10,
  countdown: 15,
  gemEvery: 7,
  respawn: 4,
  spawnShield: 1.5,
  regenDelay: 3,
  regenRate: 0.13,
  matchTime: 180,
  maxAmmo: 3,
};
