// Roster completo: un luchador por cada familia evolutiva de js/roster-data.js.
// Cada Pokémon empieza la partida en su primera fase y evoluciona durante ella (ver Game.gainXp).
//
// Para no tener que diseñar 300 Pokémon uno a uno:
//  - el TIPO decide sus ataques (nombre, aspecto y súper): todos los de fuego lanzan Ascuas y Lanzallamas...
//  - sus ESTADÍSTICAS deciden su papel (tanque, asesino, tirador...), que cambia cómo dispara.
// Los 6 primeros (PB.HANDMADE, en data.js) conservan sus ataques hechos a mano.
(function () {
  // ataque básico y súper de cada tipo
  const KIT = {
    normal: { basic: 'Meteoros', sup: 'shot', supName: 'Hiperrayo' },
    fire: { basic: 'Ascuas', sup: 'spread', supName: 'Lanzallamas' },
    water: { basic: 'Pistola Agua', sup: 'shot', supName: 'Hidrobomba' },
    grass: { basic: 'Hoja Afilada', sup: 'heal', supName: 'Drenadoras' },
    electric: { basic: 'Impactrueno', sup: 'dash', supName: 'Placaje Eléctrico' },
    ice: { basic: 'Rayo Hielo', sup: 'freeze', supName: 'Ventisca' },
    fighting: { basic: 'Esfera Aural', sup: 'dash', supName: 'A Bocajarro' },
    poison: { basic: 'Residuos', sup: 'toxic', supName: 'Tóxico' },
    ground: { basic: 'Disparo Lodo', sup: 'slam', supName: 'Terremoto' },
    flying: { basic: 'Tornado', sup: 'dash', supName: 'Pájaro Osado' },
    psychic: { basic: 'Confusión', sup: 'psy', supName: 'Psíquico' },
    bug: { basic: 'Picadura', sup: 'spread', supName: 'Zumbido' },
    rock: { basic: 'Lanzarrocas', sup: 'slam', supName: 'Avalancha' },
    ghost: { basic: 'Bola Sombra', sup: 'stealth', supName: 'Desvanecer' },
    dragon: { basic: 'Dragoaliento', sup: 'draco', supName: 'Cometa Draco' },
    dark: { basic: 'Pulso Umbrío', sup: 'dash', supName: 'Golpe Bajo' },
    steel: { basic: 'Disparo Espejo', sup: 'shot', supName: 'Foco Resplandor' },
    fairy: { basic: 'Viento Feérico', sup: 'heal', supName: 'Campo de Niebla' },
  };
  const TRAIL = {
    fire: 'ember', dragon: 'ember', water: 'drip', ice: 'drip', grass: 'leaves', bug: 'leaves', electric: 'spark', steel: 'spark',
    fairy: 'spark', normal: 'spark', psychic: 'spark', fighting: 'spark', rock: 'dirt', ground: 'dirt', ghost: 'wisp', dark: 'wisp',
    poison: 'bubbles', flying: 'wisp',
  };

  // papeles: cómo dispara (los números están igualados con los 6 Pokémon originales)
  const ROLE = {
    tank: {
      name: 'Tanque', hp: 4550, speed: 142, reload: 1.2, superHits: 8,
      atk: { kind: 'spread', count: 5, spread: 0.6, range: 215, speed: 520, dmg: 330, r: 14, scale: 1 },
      desc: 'Aguanta muchísimo y dispara una ráfaga en abanico a corta distancia.',
    },
    assassin: {
      name: 'Asesino', hp: 3450, speed: 176, reload: 0.85, superHits: 7,
      atk: { kind: 'burst', count: 2, delay: 0.14, range: 305, speed: 820, dmg: 530, r: 13, scale: 1.1 },
      desc: 'Muy rápido: dispara dos ataques seguidos y se escapa.',
    },
    sniper: {
      name: 'Francotirador', hp: 2900, speed: 148, reload: 1.7, superHits: 5,
      atk: { kind: 'spread', count: 1, spread: 0, range: 340, speed: 720, dmg: 820, r: 18, scale: 1.3 },
      desc: 'Un disparo potente de largo alcance. Frágil de cerca.',
    },
    fighter: {
      name: 'Luchador', hp: 3700, speed: 155, reload: 1.35, superHits: 8,
      atk: { kind: 'spread', count: 3, spread: 0.3, range: 290, speed: 600, dmg: 420, r: 13, scale: 1.1 },
      desc: 'Equilibrado: tres disparos a media distancia.',
    },
    thrower: {
      name: 'Lanzador', hp: 4300, speed: 140, reload: 1.8, superHits: 5,
      atk: { kind: 'lob', range: 310, flight: 0.6, radius: 72, dmg: 850, scale: 1.6 },
      desc: 'Lanza sus ataques por encima de los muros.',
    },
  };

  // súper según el tipo
  const SUPER = {
    spread: { kind: 'spread', count: 9, spread: 0.75, range: 290, speed: 600, dmg: 360, r: 18, pierce: true, scale: 1.5, d: 'una gran ola de ataques que atraviesa a todos' },
    shot: { kind: 'spread', count: 1, spread: 0, range: 370, speed: 560, dmg: 1500, r: 34, pierce: true, destroysWalls: true, knockback: 480, scale: 3, d: 'un disparo enorme que empuja y rompe muros' },
    heal: { kind: 'zone', range: 320, flight: 0.55, radius: 140, duration: 4, dps: 550, heal: 500, scale: 1.4, d: 'una zona que daña a los rivales y cura a tu equipo' },
    toxic: { kind: 'zone', range: 320, flight: 0.55, radius: 150, duration: 4, dps: 800, heal: 0, scale: 1.4, d: 'un charco venenoso que hace mucho daño' },
    dash: { kind: 'dash', range: 270, time: 0.22, dmg: 1250, stun: 0.8, r: 40, d: 'una embestida que aturde' },
    slam: { kind: 'slam', radius: 180, dmg: 1500, knockback: 600, stun: 0.5, destroysWalls: true, d: 'un golpe al suelo que aparta y rompe muros' },
    psy: { kind: 'slam', radius: 210, dmg: 1200, knockback: 820, stun: 0.3, d: 'una onda mental que lanza lejos a los rivales' },
    stealth: { kind: 'stealth', time: 3.5, speedMul: 1.3, bonus: 1.5, d: 'le vuelve invisible y potencia su siguiente ataque' },
    freeze: { kind: 'spread', count: 7, spread: 0.6, range: 300, speed: 560, dmg: 340, r: 16, pierce: true, stun: 0.6, scale: 1.4, d: 'una tormenta helada que congela un momento' },
    draco: { kind: 'spread', count: 5, spread: 0.4, range: 330, speed: 620, dmg: 540, r: 20, pierce: true, scale: 1.8, d: 'cinco meteoros dracónicos que lo atraviesan todo' },
  };

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  // tipo con el que ataca: el primero, salvo que sea Normal y tenga otro (Pidgey ataca con Volador)
  const attackType = (types) => (types[0] === 'normal' && types[1] ? types[1] : types[0]);

  function roleOf(fin, atkType) {
    const zSpd = (fin.spd - 110) / 10;
    const zBulk = ((fin.hp - 105) / 8 + (fin.df + fin.sd - 158) / 35) / 2;
    const phys = fin.pa - fin.sa;
    if ((atkType === 'rock' || atkType === 'ground') && zSpd < 0.6) return 'thrower';
    if (zSpd >= 0.8 && phys >= -0.05) return 'assassin';
    if (zBulk >= 0.6 && zSpd < 0.3) return 'tank';
    if (phys < -0.08 && zBulk < 0.5) return 'sniper';
    return 'fighter';
  }

  // Precio y rareza (provisional: la economía se ajusta cuando esté todo metido)
  const RARITY = {
    starter: { name: 'Inicial', color: '#9ad08a', cost: 300 },
    common: { name: 'Común', color: '#c8c8c8', cost: 150 },
    rare: { name: 'Raro', color: '#5aa8ff', cost: 300 },
    epic: { name: 'Épico', color: '#c07aff', cost: 600 },
  };
  PB.RARITY = RARITY;
  const STARTERS = new Set([].concat(PB.STARTER_DEX.grass, PB.STARTER_DEX.fire, PB.STARTER_DEX.water));

  function build(fam) {
    const line = fam.line;
    const base = PB.DEX[line[0]], fin = PB.DEX[line[line.length - 1]];
    const types = base.types.slice();
    const atkType = attackType(types);
    const roleId = roleOf(fin, atkType);
    const R = ROLE[roleId];
    const kit = KIT[atkType] || KIT.normal;
    const look = { shape: PB.VFX.forType(atkType).proj, trail: TRAIL[atkType] || 'spark' };
    // pequeñas diferencias según sus stats (±10 %), compensadas para que nadie sea mejor en todo
    const zBulk = clamp(((fin.hp - 105) / 8 + (fin.df + fin.sd - 158) / 35) / 2, -1.5, 1.5);
    const zSpd = clamp((fin.spd - 110) / 10, -1.5, 1.5);
    const zAtk = clamp((Math.max(fin.pa, fin.sa) - 1.2) / 0.12, -1.5, 1.5);
    const hpMul = 1 + 0.07 * zBulk;
    const dmgMul = (1 + 0.06 * zAtk) / Math.sqrt(hpMul);
    const { scale: as, ...atk } = R.atk;
    const { d: sd, scale: ss, ...sup } = SUPER[kit.sup];
    const rarity = STARTERS.has(line[0]) ? 'starter' : fin.bst > 530 ? 'epic' : fin.bst > 470 ? 'rare' : 'common';
    return {
      id: fam.id, dex: line[0], line, name: base.name, types, atkType, gen: base.gen,
      roleId, role: R.name,
      hp: Math.round((R.hp * hpMul) / 50) * 50,
      speed: Math.round(R.speed + zSpd * 5),
      reload: R.reload, superHits: R.superHits,
      attack: Object.assign({ name: kit.basic }, atk, { dmg: Math.round((atk.dmg * dmgMul) / 10) * 10, look: Object.assign({ scale: as }, look) }),
      super: Object.assign({ name: kit.supName }, sup, sup.dmg ? { dmg: Math.round((sup.dmg * dmgMul) / 10) * 10 } : {}, sup.dps ? { dps: Math.round(sup.dps * dmgMul) } : {}, { look: Object.assign({ scale: ss || 1.4 }, look) }),
      desc: R.desc + ' Su súper, ' + kit.supName + ', es ' + sd + '.',
      rarity,
    };
  }

  const hand = {};
  for (const h of PB.HANDMADE) hand[h.id] = h;
  PB.BRAWLERS = PB.FAMILIES.map((fam) => {
    const b = build(fam);
    const h = hand[fam.id];
    // los originales conservan sus ataques; solo cogen la línea evolutiva y la rareza
    return h ? Object.assign({}, h, { dex: b.dex, line: b.line, gen: b.gen, rarity: h.rarity || b.rarity, roleId: b.roleId }) : b;
  });
  const byId = {};
  for (const b of PB.BRAWLERS) byId[b.id] = b;
  PB.brawlerById = (id) => byId[id];

  // ---------------------------------------------------------------- evolución
  // Fases: las líneas de 3 evolucionan dos veces (+12 % cada vez); las de 2, una vez con un salto mayor (+22 %).
  PB.EVO = {
    xp3: [70, 165], // EXP total para la 2ª y 3ª fase
    xp2: [70], // los de una sola evolución tardan lo mismo que la 1ª evolución de los de tres
    mul3: [1, 1.12, 1.25],
    mul2: [1, 1.22],
    passive: 0.8, // EXP por segundo solo por estar vivo
    perDamage: 0.0015, // EXP por punto de daño a rivales
    perKO: 15, // EXP por debilitar (+8 por cada fase del rival)
    perKOStage: 8,
    catchUp: 1.3, // si vas por detrás en evolución de algún rival, ganas EXP más rápido
  };
  PB.evoSteps = (def) => (def.line.length >= 3 ? PB.EVO.xp3 : PB.EVO.xp2);
  PB.stageMul = (def, stage) => (def.line.length >= 3 ? PB.EVO.mul3 : PB.EVO.mul2)[stage] || 1;
  PB.stageName = (def, stage) => (PB.DEX[def.line[stage]] || PB.DEX[def.line[0]]).name;
  PB.stageTypes = (def, stage) => (PB.DEX[def.line[stage]] || PB.DEX[def.line[0]]).types;
})();
