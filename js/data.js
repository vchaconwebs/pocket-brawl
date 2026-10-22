// Datos del juego: mapa, tabla de tipos y luchadores.
window.PB = window.PB || {};

PB.TILE = 64;

// Mitad superior del mapa (equipo rojo arriba). La mitad inferior se genera girando 180º,
// así el mapa es siempre justo para los dos equipos.
//   .  hierba      P  camino (solo decoración)      #  roca (la rompen algunos súper)
//   T  árbol (también se rompe con súper)            b  hierba alta (te esconde)
//   ~  agua (bloquea el paso, no los disparos)       R  base roja    G  plataforma de Pokéballs
//   F  valla (no deja pasar, se dispara por encima)  W  barril (como la roca)   f  flores (decoración)
// Cada mapa puede tener tema: otono, nieve, arena o halloween (cambia suelo, árboles, rocas e hierba alta).
// Los de event: 'halloween' solo salen en esa temporada.
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
  'T.....##..P..##.....T',
  'T.......b.P.b.......T',
  '...bb.....P.....bb...',
  '...bb.#...P...#.bb...',
  '..........G..........', // fila central (debe ser simétrica)
];

// Mapas de cada modo. Los de equipos son la mitad de arriba y se giran 180º.
//   K  Snorlax (Despierta a Snorlax)   O  portería (Voltorbol)   V  saque del Voltorb
//   Z  centro de la zona (Territorio)  C  caja con Caramelo Raro  S  salida libre (Niebla Tóxica)
PB.MAPS = {
  gems: [
    { name: 'Clásico', top: PB.MAP_TOP },
    { name: 'Cruce', theme: 'arena', top: [ // tres carriles y una plaza abierta en el centro
      'TTT..bb.......bb..TTT',
      'T.........R.........T',
      '..f.......P.......f..',
      '..##......P......##..',
      '..#.......P.......#..',
      '....bb...PPP...bb....',
      '....bb..WW.WW..bb....',
      '..........P..........',
      '.##...TT..P..TT...##.',
      '.##.......P.......##.',
      '....bbb..PPP..bbb....',
      '....bbb.......bbb....',
      '..FFF....W.W....FFF..',
      '..#...bb.....bb...#..',
      '......bb.....bb......',
      '~~.......b.b.......~~',
      '...##.....G.....##...',
    ] },
    { name: 'Bosque', theme: 'otono', top: [ // mucha hierba alta para emboscar
      'TTbbbb.........bbbbTT',
      'Tbb.......R.......bbT',
      'b.........P.........b',
      '...T......P......T...',
      '..TT..##..P..##..TT..',
      '......W...P...W......',
      'bbb.......P.......bbb',
      'bbb..bbb.PPP.bbb..bbb',
      '.....bbb..f..bbb.....',
      '..#.....T...T.....#..',
      '..#...............#..',
      '....bb...FFF...bb....',
      '....bb.........bb....',
      '.T......bb.bb......T.',
      '..~~....bb.bb....~~..',
      '.....##.......##.....',
      'bbb.......G.......bbb',
    ] },
    { name: 'Cementerio', theme: 'halloween', event: 'halloween', top: [ // lápidas, calabazas y velas
      'TTT.bb....#....bb.TTT',
      'T.........R.........T',
      '..W.......P.......W..',
      '..#.#.#...P...#.#.#..',
      '..........P..........',
      '..#.#.#..PPP..#.#.#..',
      '....f.....P.....f....',
      '.FFFF.bb..P..bb.FFFF.',
      '......bb.....bb......',
      '..T.......W.......T..',
      '.....#.#.....#.#.....',
      '..bb.............bb..',
      '..bb..W.......W..bb..',
      'T.......f...f.......T',
      '...#.#.........#.#...',
      '......bb.....bb......',
      '..W.......G.......W..',
    ] },
  ],
  heist: [
    { name: 'Clásico', top: [
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
      'T.....WW..P..WW.....T',
      '...bb.....P.....bb...',
      '..........P..........',
    ] },
    { name: 'Fortaleza', theme: 'nieve', top: [ // el Snorlax protegido por muros con entradas a los lados
      'TTbb....T...T....bbTT',
      'Tbb.......R.......bbT',
      'bb........P........bb',
      '.....##...K...##.....',
      '.....#....P....#.....',
      '..bb.....PPP.....bb..',
      '..bb..FF.....FF..bb..',
      '~~.......bbb.......~~',
      '....T....bbb....T....',
      '..WW.............WW..',
      '..#....bb...bb....#..',
      '.......bb...bb.......',
      '...##.....P.....##...',
    ] },
    { name: 'Carriles', theme: 'otono', top: [ // tres caminos separados por muros
      'TTT....bb...bb....TTT',
      'TT........R........TT',
      '..f.......P.......f..',
      '...###....K....###...',
      '..........P..........',
      '.bb..T..#...#..T..bb.',
      '.bb..T..#...#..T..bb.',
      '........#...#........',
      '..FFF...........FFF..',
      '......bbb...bbb......',
      '~~....bbb...bbb....~~',
      '...........T.........',
      '..##.....b.b.....##..',
    ] },
    { name: 'Mansión', theme: 'halloween', event: 'halloween', top: [ // la casa encantada del Snorlax
      'TTTbb...T...T...bbTTT',
      'T.........R.........T',
      '..........P..........',
      '...FFFF...K...FFFF...',
      '...#......P......#...',
      '..W..bb..PPP..bb..W..',
      '.....bb..f.f..bb.....',
      '.#.#.............#.#.',
      '......T..W.W..T......',
      '..bb.............bb..',
      '..bb..#.#...#.#..bb..',
      '.....W.........W.....',
      '...f......P......f...',
    ] },
  ],
  ball: [
    { name: 'Clásico', top: [
      'TTT##.OOOOO.##TTT',
      'b....#OOOOO#....b',
      'b...##.....##...b',
      '.................',
      '.................',
      '..bb....R....bb..',
      '..bb.........bb..',
      '~~.....bbb.....~~',
      '....FF.....FF....',
      '.................',
      '..bbb.......bbb..',
      '.....##...##.....',
      '........V........',
    ] },
    { name: 'Estadio', theme: 'nieve', top: [ // campo abierto: más pases y más goles
      'TTT##.OOOOO.##TTT',
      'T....#OOOOO#....T',
      '.....#.....#.....',
      '.................',
      '..bb.........bb..',
      '..bb....R....bb..',
      '.....bb...bb.....',
      '~~...#.....#...~~',
      '.....#.....#.....',
      '...##.......##...',
      '...bb...b...bb...',
      '...bb.......bb...',
      '#.......V.......#',
    ] },
    { name: 'Laberinto', theme: 'arena', top: [ // muros que hacen pasillos para regatear
      'TTT##.OOOOO.##TTT',
      'bb...#OOOOO#...bb',
      'bb..##.....##..bb',
      '.................',
      '.....##...##.....',
      '..T.....R.....T..',
      '..T...........T..',
      '.....bbb.bbb.....',
      '.##...........##.',
      '.WW...#...#...WW.',
      '......#...#......',
      '..bb.........bb..',
      '..bb....V....bb..',
    ] },
    { name: 'Calabazas', theme: 'halloween', event: 'halloween', top: [ // fútbol entre calabazas
      'TTT##.OOOOO.##TTT',
      'T....#OOOOO#....T',
      '..W..#.....#..W..',
      '.................',
      '..f....bbb....f..',
      '..#.....R.....#..',
      '..#...........#..',
      '.....W.....W.....',
      '~~.............~~',
      '...FF.......FF...',
      '.......bbb.......',
      '..#.T.......T.#..',
      '.W......V......W.',
    ] },
  ],
  zone: [
    { name: 'Clásico', top: [
      'TTbb....#...#....bbTT',
      'Tbb.......R.......bbT',
      'bb........P........bb',
      '....##....P....##....',
      '....#.....P.....#....',
      '......bbb.P.bbb......',
      '~~....bbbPPPbbb....~~',
      '~~.......P.P.......~~',
      '..b..FF..P.P..FF..b..',
      '..b......P.P......b..',
      '..bb.....PPP.....bb..',
      '..bb..#...P...#..bb..',
      'T.....#...P...#.....T',
      'T..bb.....P.....bb..T',
      '...bb...........bb...',
      '.....##.......##.....',
      '..........Z..........',
    ] },
    { name: 'Plaza', theme: 'arena', top: [ // la zona tiene coberturas dentro
      'TTbb....#...#....bbTT',
      'Tbb.......R.......bbT',
      'bb........P........bb',
      '....##....P....##....',
      '..........P..........',
      '...bbb...PPP...bbb...',
      '...bbb..#...#..bbb...',
      '~~......#...#......~~',
      '.....TT.......TT.....',
      '.....T.........T.....',
      '..FF......b......FF..',
      '..#...............#..',
      '......bb.....bb......',
      'T.....bb.....bb.....T',
      '.........WWW.........',
      '...##...........##...',
      '..bb......Z......bb..',
    ] },
    { name: 'Ríos', theme: 'otono', top: [ // un río con tres puentes
      'TTbb....#...#....bbTT',
      'Tbb.......R.......bbT',
      'bb........P........bb',
      '.....#....P....#.....',
      '.....#....P....#.....',
      '..bb......P......bb..',
      '~~~~~~..~~P~~..~~~~~~',
      '...f.....f.....f.....',
      '..TT....bb.bb....TT..',
      '..T.....bb.bb.....T..',
      '.....FF.......FF.....',
      '.....................',
      '..bbb.....#.....bbb..',
      '..bbb...........bbb..',
      '.......##...##.......',
      '.....................',
      '~~........Z........~~',
    ] },
    { name: 'Aquelarre', theme: 'halloween', event: 'halloween', top: [ // la zona rodeada de calabazas
      'TTbb....#...#....bbTT',
      'Tbb.......R.......bbT',
      'bb........P........bb',
      '....#.#...P...#.#....',
      '..........P..........',
      '..W....bbPPPbb....W..',
      '.......bb...bb.......',
      '~~...FF.......FF...~~',
      '.....................',
      '..T....#.....#....T..',
      '..T....#.....#....T..',
      '.....f.........f.....',
      '..bb...W.....W...bb..',
      '..bb.............bb..',
      '......#.......#......',
      '...f.....W.W.....f...',
      '..........Z..........',
    ] },
  ],
  // Niebla Tóxica: cuarto superior izquierdo (la última fila y columna son los ejes)
  showdown: [
    { name: 'Clásico', quad: [
      'TTTbb......bb....',
      'TS....C......b...',
      'T..##.....T......',
      'b..#....bb...C...',
      'b.....C.bb.......',
      '......T.....##...',
      '.bb.........#....',
      '.bb.S...C........',
      '.....WW.....bb...',
      '..C...#.....bb.C.',
      '.........T.......',
      'bb....b......~~..',
      'bb..C.b...S..~~..',
      '.....##..........',
      '..T.........##...',
      '.......bb....#...',
      '.....S..bb.......',
    ] },
    { name: 'Estanques', theme: 'nieve', quad: [ // cuatro estanques alrededor del centro
      'TTTT...bb.....bb.',
      'TS.....bb..C.....',
      'T....##..........',
      '.....#....T...S..',
      '..C......bbb.....',
      '.bb..T...bbb..C..',
      '.bb..............',
      '....##....##.....',
      '.S..#.....#...bb.',
      '.......C......bb.',
      'bb..T............',
      'bb.......C.~~~...',
      '....##.....~~~...',
      '..C.#......~~~.S.',
      '...........C.....',
      '.T....bb.........',
      '.....S.bb......bb',
    ] },
    { name: 'Ruinas', theme: 'arena', quad: [ // muros por todas partes para esconderse
      'TTT..bb....TTT...',
      'TS.........T..C..',
      '...##..C.........',
      '...#.....WW..bb..',
      '.C......##...bb..',
      '....bb.......S...',
      '....bb..C........',
      '.##.......##..C..',
      '.#...S.....#.....',
      '.......bb........',
      'C......bb..##....',
      '.....FF.....#..bb',
      '..S..#..C......bb',
      '..........bb.....',
      '.bb..C....bb..##.',
      '.bb...........#..',
      '....##...S.......',
    ] },
    { name: 'Noche', theme: 'halloween', event: 'halloween', quad: [ // todos contra todos en el cementerio
      'TTTbb.....W..bb..',
      'TS....C.......#..',
      'T..#.#....T......',
      'b......C....f....',
      'b..W.....bb...C..',
      '.........bb......',
      '.FFF..#.#....S...',
      '..C..........#.#.',
      '.S...W....C......',
      '......bb.........',
      '..T...bb...#.#..C',
      '.........W.......',
      'bb..C.......S....',
      'bb.....f.........',
      '...#.#......FF...',
      '..W.....C........',
      '.....S.....bb.f..',
    ] },
  ],
};

// Mapas de un modo (cada modo puede tener varios; se elige uno al azar en cada partida)
PB.mapsOf = (id) => {
  const m = PB.MAPS[id] || PB.MAPS.gems;
  return Array.isArray(m) ? m : [m];
};
// mapas de temporada: Halloween sale del 1 de octubre al 7 de noviembre
PB.eventOn = (ev) => {
  if (ev !== 'halloween') return false;
  const d = new Date(), m = d.getMonth() + 1, day = d.getDate();
  return m === 10 || (m === 11 && day <= 7);
};
// mapa al azar para una partida (en pruebas locales, ?mapa=N fuerza uno)
PB.pickMap = (id) => {
  const maps = PB.mapsOf(id);
  const forced = new URLSearchParams(location.search).get('mapa');
  if (forced !== null && /^\d+$/.test(forced)) return Math.min(maps.length - 1, +forced);
  const ok = maps.map((m, i) => i).filter((i) => !maps[i].event || PB.eventOn(maps[i].event));
  return ok[Math.floor(Math.random() * ok.length)];
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
    role: 'Cuerpo a cuerpo', hp: 4100, speed: 160, reload: 1.15, superHits: 8,
    attack: { name: 'Ascuas', kind: 'spread', count: 5, spread: 0.55, range: 220, speed: 520, dmg: 330, r: 14, look: { shape: 'fire', trail: 'ember', scale: 1 } },
    super: { name: 'Lanzallamas', kind: 'spread', count: 9, spread: 0.75, range: 290, speed: 600, dmg: 380, r: 18, pierce: true, look: { shape: 'fire', trail: 'ember', scale: 1.5 } },
    desc: 'Abanico de llamas a corta distancia. Su súper atraviesa a todos.',
  },
  {
    id: 'squirtle', name: 'Squirtle', types: ['water'], atkType: 'water',
    role: 'Francotirador', hp: 2900, speed: 145, reload: 1.7, superHits: 5,
    attack: { name: 'Pistola Agua', kind: 'spread', count: 1, spread: 0, range: 355, speed: 760, dmg: 1000, r: 18, look: { shape: 'drop', trail: 'drip', scale: 1.2 } },
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
PB.TRAINER_NAMES = (() => {
  // nombres de entrenador para los bots: base + estilo (sale una lista larga y variada)
  const base = [
    'Lucía', 'Marcos', 'Nerea', 'Rayo', 'Sandra', 'Pablo', 'Alba', 'Toni', 'Irene', 'Daniel', 'Kai', 'Mireia', 'Xavi', 'Hugo', 'Valen',
    'Julia', 'Rocío', 'Mateo', 'Iker', 'Noa', 'Carla', 'Guille', 'Sara', 'Unai', 'Leo', 'Martina', 'Adri', 'Nico', 'Ainhoa', 'Bruno',
    'Elena', 'Gonzo', 'Paula', 'Rubén', 'Zoe', 'Jaime', 'Clara', 'Óscar', 'Lola', 'Íñigo', 'Marta', 'Álex', 'Laura', 'Sergio', 'Nora',
    'Diego', 'Vega', 'Izan', 'Abril', 'Thiago', 'Emma', 'Liam', 'Mía', 'Gael', 'Alma', 'Enzo', 'Olivia', 'Bosco', 'Candela', 'Marco',
    'Aitana', 'Teo', 'Lara', 'Samu', 'Jimena', 'Pol', 'Aroa', 'Biel', 'Carmen', 'Raúl', 'Inés', 'Hector', 'Erik', 'Lía', 'Gabi',
    'Fran', 'Judith', 'Mario', 'Noelia', 'Rafa', 'Silvia', 'Tomás', 'Vera', 'Yago', 'Ana', 'Berta', 'César', 'Dani', 'Eva', 'Félix',
    'Gema', 'Hugo', 'Iris', 'Joan', 'Kira', 'Luna', 'Miguel', 'Nil', 'Oriol', 'Pau', 'Quim', 'Rosa', 'Saúl', 'Tania', 'Uxue',
    'Víctor', 'Wendy', 'Yeray', 'Zaira', 'Cris', 'Jorge', 'Pilar', 'Ivan', 'Lucas', 'Bea', 'Joel', 'Mara', 'Neo', 'Ona', 'Rita',
  ];
  const tags = [
    'Trainer', 'Master', 'Pro', 'GG', 'Play', 'Gamer', 'Poke', 'Kid', 'Star', 'King', 'Queen', 'Fire', 'Wave', 'Leaf', 'Bolt',
    'Shadow', 'Storm', 'Ace', 'Crack', 'Max', 'Neo', 'Ultra', 'Mega', 'Giga', 'Zen', 'Fox', 'Wolf', 'Drake', 'Nova', 'Pixel',
  ];
  const H = (i) => { let h = (i + 1) * 2654435761; h ^= h >>> 13; h = Math.imul(h, 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  const out = new Set();
  base.forEach((n, i) => {
    out.add(n);
    const t = tags[Math.floor(H(i) * tags.length)], num = 1 + Math.floor(H(i + 500) * 99);
    const styles = [n + '_' + num, n + t, t + n, n + '.' + t.toLowerCase(), n.toLowerCase() + num, 'xX' + n + 'Xx', n + '_' + t, 'El' + n];
    styles.forEach((s, k) => { if (H(i * 13 + k) < 0.45) out.add(s.slice(0, 16)); });
  });
  return [...out];
})();

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
