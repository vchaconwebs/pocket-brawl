// Datos del juego: mapa, tabla de tipos y luchadores.
window.PB = window.PB || {};

PB.TILE = 64;

// Mitad superior del mapa (equipo rojo arriba). La mitad inferior se genera girando 180º,
// así el mapa es siempre justo para los dos equipos.
//   .  hierba      P  camino (solo decoración)      #  roca (la rompen algunos súper)
//   T  árbol (también se rompe con súper)            b  hierba alta (te esconde)
//   ~  agua (bloquea el paso, no los disparos)       R  base roja    G  plataforma de Pokéballs
PB.MAP_TOP = [
  'TTbb....#...#....bbTT',
  'Tbb.......R.......bbT',
  'bb........P........bb',
  '....##....P....##....',
  '....#.....P.....#....',
  '......bbb.P.bbb......',
  '~~....bbbPPPbbb....~~',
  '~~.......P.P.......~~',
  '.....TT..P.P..TT.....',
  '..b...T..P.P..T...b..',
  '..bb.....PPP.....bb..',
  '..bb....b.P.b....bb..',
  'T......###P###......T',
  'T.......b.P.b.......T',
  '...bb.....P.....bb...',
  '...bb....~P~....bb...',
  '..........G..........', // fila central (debe ser simétrica)
];

// Mapas de cada modo. Los de equipos son la mitad de arriba y se giran 180º.
//   K  Snorlax (Despierta a Snorlax)   O  portería (Voltorbol)   V  saque del Voltorb
//   Z  centro de la zona (Territorio)  C  caja con Caramelo Raro  S  salida libre (Niebla Tóxica)
PB.MAPS = {
  gems: { top: PB.MAP_TOP },
  heist: {
    top: [
      'TTbb....T...T....bbTT',
      'Tbb.......R.......bbT',
      'bb........P........bb',
      '...##.....K.....##...',
      '...#......P......#...',
      '~~...bb..PPP..bb...~~',
      '~~.......P.P.......~~',
      '..b..##..P.P..##..b..',
      '..bb....TPPPT....bb..',
      '..bb.....bPb.....bb..',
      'T.....##..P..##.....T',
      '...bb.....P.....bb...',
      '..........P..........',
    ],
  },
  ball: {
    top: [
      'TTT##.OOOOO.##TTT',
      'b....#OOOOO#....b',
      'b...##.....##...b',
      '.................',
      '.................',
      '..bb....R....bb..',
      '..bb.........bb..',
      '~~.....bbb.....~~',
      '....##.....##....',
      '.................',
      '..bbb.......bbb..',
      '.....##...##.....',
      '........V........',
    ],
  },
  zone: {
    top: [
      'TTbb....#...#....bbTT',
      'Tbb.......R.......bbT',
      'bb........P........bb',
      '....##....P....##....',
      '....#.....P.....#....',
      '......bbb.P.bbb......',
      '~~....bbbPPPbbb....~~',
      '~~.......P.P.......~~',
      '..b..##..P.P..##..b..',
      '..b......P.P......b..',
      '..bb.....PPP.....bb..',
      '..bb..#...P...#..bb..',
      'T.....#...P...#.....T',
      'T..bb.....P.....bb..T',
      '...bb...........bb...',
      '.....##.......##.....',
      '..........Z..........',
    ],
  },
  // Niebla Tóxica: cuarto superior izquierdo (la última fila y columna son los ejes)
  showdown: {
    quad: [
      'TTTbb......bb....',
      'TS....C......b...',
      'T..##.....T......',
      'b..#....bb...C...',
      'b.....C.bb.......',
      '......T.....##...',
      '.bb.........#....',
      '.bb.S...C........',
      '.....##.....bb...',
      '..C...#.....bb.C.',
      '.........T.......',
      'bb....b......~~..',
      'bb..C.b...S..~~..',
      '.....##..........',
      '..T.........##...',
      '.......bb....#...',
      '.....S..bb.......',
    ],
  },
};

// Mapa de equipos a partir de la mitad de arriba (girada 180º para el equipo azul)
PB.buildMap = function (top) {
  top = top || PB.MAP_TOP;
  const rows = top.slice();
  const swap = { R: 'A', K: 'k', O: 'o' };
  for (let i = top.length - 2; i >= 0; i--) {
    rows.push(top[i].split('').reverse().map((ch) => swap[ch] || ch).join(''));
  }
  return PB.checkMap(rows);
};

// Mapa de todos contra todos a partir de un cuarto (espejo horizontal y vertical)
PB.buildQuadMap = function (quad) {
  const half = quad.map((r) => r + r.slice(0, -1).split('').reverse().join(''));
  return PB.checkMap(half.concat(half.slice(0, -1).reverse()));
};

PB.checkMap = function (rows) {
  const w = rows[0].length;
  rows.forEach((r, i) => {
    if (r.length !== w) throw new Error('Fila ' + i + ' del mapa mide ' + r.length + ', no ' + w);
  });
  return rows;
};

// Eficacia de tipos (tabla de los juegos, suavizada: x1.3 eficaz, x0.75 poco eficaz, x0.5 inmune).
// Se multiplica por cada tipo del defensor y se limita a [0.5, 1.5].
PB.EFF = {
  normal:   { rock: 0.75, steel: 0.75, ghost: 0.5 },
  fire:     { grass: 1.3, ice: 1.3, bug: 1.3, steel: 1.3, fire: 0.75, water: 0.75, rock: 0.75, dragon: 0.75 },
  water:    { fire: 1.3, ground: 1.3, rock: 1.3, water: 0.75, grass: 0.75, dragon: 0.75 },
  electric: { water: 1.3, flying: 1.3, electric: 0.75, grass: 0.75, dragon: 0.75, ground: 0.5 },
  grass:    { water: 1.3, ground: 1.3, rock: 1.3, fire: 0.75, grass: 0.75, poison: 0.75, flying: 0.75, bug: 0.75, dragon: 0.75, steel: 0.75 },
  ice:      { grass: 1.3, ground: 1.3, flying: 1.3, dragon: 1.3, fire: 0.75, water: 0.75, ice: 0.75, steel: 0.75 },
  fighting: { normal: 1.3, ice: 1.3, rock: 1.3, dark: 1.3, steel: 1.3, poison: 0.75, flying: 0.75, psychic: 0.75, bug: 0.75, fairy: 0.75, ghost: 0.5 },
  poison:   { grass: 1.3, fairy: 1.3, poison: 0.75, ground: 0.75, rock: 0.75, ghost: 0.75, steel: 0.5 },
  ground:   { fire: 1.3, electric: 1.3, poison: 1.3, rock: 1.3, steel: 1.3, grass: 0.75, bug: 0.75, flying: 0.5 },
  flying:   { grass: 1.3, fighting: 1.3, bug: 1.3, electric: 0.75, rock: 0.75, steel: 0.75 },
  psychic:  { fighting: 1.3, poison: 1.3, psychic: 0.75, steel: 0.75, dark: 0.5 },
  bug:      { grass: 1.3, psychic: 1.3, dark: 1.3, fire: 0.75, fighting: 0.75, poison: 0.75, flying: 0.75, ghost: 0.75, steel: 0.75, fairy: 0.75 },
  rock:     { fire: 1.3, ice: 1.3, flying: 1.3, bug: 1.3, fighting: 0.75, ground: 0.75, steel: 0.75 },
  ghost:    { psychic: 1.3, ghost: 1.3, dark: 0.75, normal: 0.5 },
  dragon:   { dragon: 1.3, steel: 0.75, fairy: 0.5 },
  dark:     { psychic: 1.3, ghost: 1.3, fighting: 0.75, dark: 0.75, fairy: 0.75 },
  steel:    { ice: 1.3, rock: 1.3, fairy: 1.3, fire: 0.75, water: 0.75, electric: 0.75, steel: 0.75 },
  fairy:    { fighting: 1.3, dragon: 1.3, dark: 1.3, fire: 0.75, poison: 0.75, steel: 0.75 },
};

PB.effectiveness = function (atkType, defTypes) {
  const row = PB.EFF[atkType] || {};
  let m = 1;
  for (const t of defTypes) m *= row[t] || 1;
  return Math.max(0.5, Math.min(1.5, m));
};

PB.TYPE_INFO = {
  normal: { name: 'Normal', color: '#a8a39a' },
  fire: { name: 'Fuego', color: '#ff7a2f' },
  water: { name: 'Agua', color: '#3a9bff' },
  grass: { name: 'Planta', color: '#4fc14a' },
  electric: { name: 'Eléctrico', color: '#f5cf2a' },
  ice: { name: 'Hielo', color: '#62d2ea' },
  fighting: { name: 'Lucha', color: '#d0452c' },
  poison: { name: 'Veneno', color: '#a24bc4' },
  ground: { name: 'Tierra', color: '#d8a957' },
  flying: { name: 'Volador', color: '#93b2ff' },
  psychic: { name: 'Psíquico', color: '#ff4f9a' },
  bug: { name: 'Bicho', color: '#90b82a' },
  rock: { name: 'Roca', color: '#b39a62' },
  ghost: { name: 'Fantasma', color: '#7b5bc4' },
  dragon: { name: 'Dragón', color: '#6a4cff' },
  dark: { name: 'Siniestro', color: '#6e5a50' },
  steel: { name: 'Acero', color: '#9aaabb' },
  fairy: { name: 'Hada', color: '#ff8acb' },
};

// kind de ataque: spread (abanico), burst (ráfaga), lob (parábola que salta muros)
// kind de súper: spread, zone, dash, slam, stealth
// look: cómo se dibuja (forma de PB.VFX, estela y tamaño). La paleta es la del tipo del ataque.
// Velocidades en píxeles/segundo (una casilla son 64 px).
// Los 6 primeros Pokémon, con ataques hechos a mano. El resto los genera js/roster.js.
PB.HANDMADE = [
  {
    id: 'charmander', name: 'Charmander', types: ['fire'], atkType: 'fire',
    role: 'Cuerpo a cuerpo', hp: 4400, speed: 165, reload: 1.15, superHits: 8,
    attack: { name: 'Ascuas', kind: 'spread', count: 5, spread: 0.55, range: 220, speed: 520, dmg: 380, r: 14, look: { shape: 'fire', trail: 'ember', scale: 1 } },
    super: { name: 'Lanzallamas', kind: 'spread', count: 9, spread: 0.75, range: 290, speed: 600, dmg: 380, r: 18, pierce: true, look: { shape: 'fire', trail: 'ember', scale: 1.5 } },
    desc: 'Abanico de llamas a corta distancia. Su súper atraviesa a todos.',
  },
  {
    id: 'squirtle', name: 'Squirtle', types: ['water'], atkType: 'water',
    role: 'Francotirador', hp: 2900, speed: 145, reload: 1.7, superHits: 5,
    attack: { name: 'Pistola Agua', kind: 'spread', count: 1, spread: 0, range: 340, speed: 720, dmg: 840, r: 18, look: { shape: 'drop', trail: 'drip', scale: 1.2 } },
    super: { name: 'Hidrobomba', kind: 'spread', count: 1, spread: 0, range: 370, speed: 560, dmg: 1600, r: 34, pierce: true, destroysWalls: true, knockback: 520, look: { shape: 'bubble', trail: 'bubbles', scale: 3.2 } },
    desc: 'Un chorro largo y potente. Su súper empuja y rompe muros.',
  },
  {
    id: 'bulbasaur', name: 'Bulbasaur', types: ['grass', 'poison'], atkType: 'grass',
    role: 'Apoyo', hp: 3600, speed: 145, reload: 1.4, superHits: 9,
    attack: { name: 'Hoja Afilada', kind: 'spread', count: 3, spread: 0.3, range: 300, speed: 600, dmg: 420, r: 12, look: { shape: 'leaf', trail: 'leaves', scale: 1.1 } },
    super: { name: 'Drenadoras', kind: 'zone', range: 320, flight: 0.55, radius: 140, duration: 4, dps: 600, heal: 500, look: { shape: 'blob', scale: 1.4 } },
    desc: 'Tres hojas a media distancia. Su súper planta una zona que daña enemigos y cura aliados.',
  },
  {
    id: 'pikachu', name: 'Pikachu', types: ['electric'], atkType: 'electric',
    role: 'Asesino', hp: 3400, speed: 178, reload: 0.85, superHits: 7,
    attack: { name: 'Impactrueno', kind: 'burst', count: 2, delay: 0.14, range: 320, speed: 820, dmg: 520, r: 13, look: { shape: 'bolt', trail: 'spark', scale: 1.1 } },
    super: { name: 'Placaje Eléctrico', kind: 'dash', range: 270, time: 0.22, dmg: 1300, stun: 0.9, r: 40, look: { shape: 'bolt' } },
    desc: 'Rápido y con ráfagas de rayos. Su súper es una embestida que aturde.',
  },
  {
    id: 'geodude', name: 'Geodude', types: ['rock', 'ground'], atkType: 'rock',
    role: 'Tanque', hp: 4300, speed: 138, reload: 2.1, superHits: 5,
    attack: { name: 'Lanzarrocas', kind: 'lob', range: 290, flight: 0.75, radius: 52, dmg: 680, look: { shape: 'rock', trail: 'dirt', scale: 1.6 } },
    super: { name: 'Magnitud', kind: 'slam', radius: 180, dmg: 1600, knockback: 600, stun: 0.5, destroysWalls: true, look: { shape: 'rock' } },
    desc: 'Lanza rocas por encima de los muros. Su súper sacude el suelo y rompe muros.',
  },
  {
    id: 'gastly', name: 'Gastly', types: ['ghost', 'poison'], atkType: 'ghost',
    role: 'Sigilo', hp: 2600, speed: 168, reload: 1.2, superHits: 5,
    attack: { name: 'Bola Sombra', kind: 'spread', count: 1, spread: 0, range: 290, speed: 420, dmg: 1200, r: 22, pierce: true, look: { shape: 'shadow', trail: 'wisp', scale: 1.8 } },
    super: { name: 'Desvanecer', kind: 'stealth', time: 3.5, speedMul: 1.3, bonus: 1.5 },
    desc: 'Bolas sombra que atraviesan. Su súper lo vuelve invisible y potencia su siguiente ataque.',
  },
];

// Dificultad de los bots (0 = torpe, 1 = perfecto)
PB.DIFFICULTY = {
  facil: { name: 'Fácil', foe: 0.2, ally: 0.45 },
  normal: { name: 'Normal', foe: 0.42, ally: 0.45 },
  dificil: { name: 'Difícil', foe: 0.7, ally: 0.55 },
};

// Nombres de entrenador para los bots (inventados)
PB.TRAINER_NAMES = [
  'Lucía_7', 'MarcosGG', 'NerePlay', 'ElRayo23', 'Sandrix', 'Pablito99', 'Alba.exe', 'ToniPro', 'Irene_09', 'Dani3l',
  'KaiZen', 'Mireia', 'XavierRB', 'Hugo_SP', 'Valen', 'Juls', 'Rocío22', 'Mateo_x', 'Iker10', 'Noa',
  'Carla.b', 'Guille', 'SaraMoon', 'Unai', 'Leo_fire', 'Martina', 'Adri_G', 'PokeNico', 'Ainhoa', 'Bruno7',
  'Elena', 'Gonzo', 'Paula_ss', 'Rubén', 'Zoe', 'Jaime_88', 'Clara', 'Óscar', 'Lola', 'Íñigo',
];

PB.RULES = {
  ballsToWin: 10,
  countdown: 15,
  ballEvery: 7,
  respawn: 4,
  startCountdown: 3,
  spawnShield: 1.5,
  regenDelay: 3,
  regenRate: 0.13,
  matchTime: 180,
  maxAmmo: 3,
};
