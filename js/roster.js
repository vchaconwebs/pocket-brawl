// Roster completo: un luchador por cada familia evolutiva de js/roster-data.js.
// Cada Pokémon empieza la partida en su primera fase y evoluciona durante ella (ver Game.gainXp).
//
// Para no tener que diseñar 300 Pokémon uno a uno:
//  - el TIPO decide sus ataques (nombre, aspecto y súper): todos los de fuego lanzan Ascuas y Lanzallamas...
//  - sus ESTADÍSTICAS deciden su papel (tanque, asesino, tirador...), que cambia cómo dispara.
// Los 6 primeros (PB.HANDMADE, en data.js) conservan sus ataques hechos a mano.
(function () {
  // ataque básico y dos súper por tipo: [súper normal, súper alternativo (asesinos, tanques y lanzadores)]
  const KIT = {
    normal: { basic: 'Meteoros', sup: [['beam', 'Hiperrayo'], ['nova', 'Vozarrón']] },
    fire: { basic: 'Ascuas', sup: [['spread', 'Lanzallamas'], ['turret', 'Fuego Fatuo']] },
    water: { basic: 'Pistola Agua', sup: [['shot', 'Hidrobomba'], ['vortex', 'Torbellino']] },
    grass: { basic: 'Hoja Afilada', sup: [['heal', 'Drenadoras'], ['boomerang', 'Hoja Aguda']] },
    electric: { basic: 'Impactrueno', sup: [['chain', 'Rayo'], ['dash', 'Placaje Eléctrico']] },
    ice: { basic: 'Rayo Hielo', sup: [['freeze', 'Ventisca'], ['meteor', 'Granizo']] },
    fighting: { basic: 'Esfera Aural', sup: [['dash', 'A Bocajarro'], ['barrier', 'Corpulencia']] },
    poison: { basic: 'Residuos', sup: [['toxic', 'Tóxico'], ['mines', 'Púas Tóxicas']] },
    ground: { basic: 'Disparo Lodo', sup: [['slam', 'Terremoto'], ['boomerang', 'Huesomerang']] },
    flying: { basic: 'Tornado', sup: [['gust', 'Vendaval'], ['dash', 'Pájaro Osado']] },
    psychic: { basic: 'Confusión', sup: [['psy', 'Psíquico'], ['barrier', 'Barrera']] },
    bug: { basic: 'Picadura', sup: [['spread', 'Zumbido'], ['mines', 'Telaraña']] },
    rock: { basic: 'Lanzarrocas', sup: [['meteor', 'Avalancha'], ['mines', 'Trampa Rocas']] },
    ghost: { basic: 'Bola Sombra', sup: [['stealth', 'Desvanecer'], ['vortex', 'Pesadilla']] },
    dragon: { basic: 'Dragoaliento', sup: [['draco', 'Cometa Draco'], ['beam', 'Pulso Dragón']] },
    dark: { basic: 'Pulso Umbrío', sup: [['boomerang', 'Tajo Umbrío'], ['dash', 'Golpe Bajo']] },
    steel: { basic: 'Disparo Espejo', sup: [['shot', 'Foco Resplandor'], ['barrier', 'Defensa Férrea']] },
    fairy: { basic: 'Viento Feérico', sup: [['wish', 'Deseo'], ['nova', 'Brillo Mágico']] },
  };
  const TRAIL = {
    fire: 'ember', dragon: 'ember', water: 'drip', ice: 'drip', grass: 'leaves', bug: 'leaves', electric: 'spark', steel: 'spark',
    fairy: 'spark', normal: 'spark', psychic: 'spark', fighting: 'spark', rock: 'dirt', ground: 'dirt', ghost: 'wisp', dark: 'wisp',
    poison: 'bubbles', flying: 'wisp',
  };

  // papeles: cómo dispara (los números están igualados con los 6 Pokémon originales)
  const ROLE = {
    tank: {
      name: 'Tanque', hp: 5000, speed: 140, reload: 1.25, superHits: 8,
      atk: { kind: 'spread', count: 5, spread: 0.6, range: 215, speed: 520, dmg: 250, r: 14, scale: 1 },
      desc: 'Aguanta muchísimo y dispara una ráfaga en abanico a corta distancia.',
    },
    assassin: {
      name: 'Asesino', hp: 3450, speed: 176, reload: 0.85, superHits: 7,
      atk: { kind: 'burst', count: 2, delay: 0.14, range: 305, speed: 820, dmg: 530, r: 13, scale: 1.1 },
      desc: 'Muy rápido: dispara dos ataques seguidos y se escapa.',
    },
    sniper: {
      name: 'Francotirador', hp: 2800, speed: 148, reload: 1.85, superHits: 5,
      atk: { kind: 'spread', count: 1, spread: 0, range: 365, speed: 780, dmg: 1150, r: 17, scale: 1.4 },
      desc: 'Un disparo potente de largo alcance. Frágil de cerca.',
    },
    fighter: {
      name: 'Luchador', hp: 3700, speed: 155, reload: 1.35, superHits: 8,
      atk: { kind: 'spread', count: 3, spread: 0.3, range: 290, speed: 600, dmg: 400, r: 13, scale: 1.1 },
      desc: 'Equilibrado: tres disparos a media distancia.',
    },
    thrower: {
      name: 'Lanzador', hp: 4750, speed: 142, reload: 1.8, superHits: 5,
      atk: { kind: 'lob', range: 300, flight: 0.75, radius: 54, dmg: 720, scale: 1.5 },
      desc: 'Lanza sus ataques por encima de los muros.',
    },
  };

  // Descripción: rasgo del papel + cómo es su ataque básico de verdad (el estilo cambia la forma)
  const TRAIT = {
    tank: 'Aguanta muchísimo.', assassin: 'Muy rápido y escurridizo.', sniper: 'Frágil, pero pega muy fuerte.',
    fighter: 'Equilibrado.', thrower: 'Resistente y algo lento.',
  };
  const ATK_DESC = {
    tank: 'Dispara una ráfaga en abanico a corta distancia.', assassin: 'Dispara dos ataques seguidos.',
    sniper: 'Un disparo potente de largo alcance.', fighter: 'Lanza tres disparos a media distancia.',
    thrower: 'Lanza sus ataques por encima de los muros.',
    cone: 'Suelta una llamarada corta en abanico.', burst3: 'Dispara una ráfaga rápida de tres ataques.',
    orb: 'Lanza una esfera grande y lenta que atraviesa a los rivales.', homing: 'Sus ataques persiguen al rival más cercano.',
    melee: 'Golpea cuerpo a cuerpo en un arco delante de él.', twin: 'Dispara dos ataques en paralelo.',
    boomer: 'Lanza un ataque que va y vuelve, y golpea a la ida y a la vuelta.',
  };

  // súper según el tipo
  const SUPER = {
    spread: { kind: 'spread', count: 9, spread: 0.75, range: 290, speed: 600, dmg: 360, r: 18, pierce: true, scale: 1.5, d: 'una gran ola de ataques que atraviesa a todos' },
    shot: { kind: 'spread', count: 1, spread: 0, range: 370, speed: 560, dmg: 1500, r: 34, pierce: true, destroysWalls: true, knockback: 480, scale: 3, d: 'un disparo enorme que empuja y rompe muros' },
    heal: { kind: 'zone', range: 320, flight: 0.55, radius: 140, duration: 4, dps: 550, heal: 500, scale: 1.4, d: 'una zona que daña a los rivales y cura a tu equipo' },
    toxic: { kind: 'zone', range: 320, flight: 0.55, radius: 150, duration: 4, dps: 700, heal: 0, scale: 1.4, d: 'un charco venenoso que hace mucho daño' },
    dash: { kind: 'dash', range: 270, time: 0.22, dmg: 1050, stun: 0.8, r: 40, d: 'una embestida que aturde' },
    slam: { kind: 'slam', radius: 200, dmg: 1800, knockback: 600, stun: 0.5, destroysWalls: true, d: 'un golpe al suelo que aparta y rompe muros' },
    psy: { kind: 'slam', radius: 210, dmg: 1400, knockback: 820, stun: 0.3, d: 'una onda mental que lanza lejos a los rivales' },
    stealth: { kind: 'stealth', time: 4, speedMul: 1.35, bonus: 1.85, d: 'le vuelve invisible y potencia su siguiente ataque' },
    freeze: { kind: 'spread', count: 7, spread: 0.6, range: 300, speed: 560, dmg: 340, r: 16, pierce: true, stun: 0.6, scale: 1.4, d: 'una tormenta helada que congela un momento' },
    draco: { kind: 'spread', count: 5, spread: 0.4, range: 330, speed: 620, dmg: 540, r: 20, pierce: true, scale: 1.8, d: 'cinco meteoros dracónicos que lo atraviesan todo' },
    vortex: { kind: 'zone', range: 330, flight: 0.5, radius: 130, duration: 3, dps: 600, heal: 0, pull: 170, scale: 1.4, d: 'un remolino que arrastra a los rivales a su centro y los va dañando' },
    meteor: { kind: 'meteor', range: 330, flight: 0.85, count: 5, spreadR: 85, radius: 54, dmg: 600, scale: 1.6, d: 'una lluvia de golpes que caen sobre la zona elegida' },
    nova: { kind: 'nova', count: 12, range: 280, speed: 540, dmg: 800, r: 16, pierce: true, scale: 1.4, d: 'una explosión de ataques en todas direcciones' },
    boomerang: { kind: 'boomerang', range: 340, speed: 660, dmg: 920, r: 24, scale: 2.4, d: 'un proyectil enorme que va y vuelve, golpeando a la ida y a la vuelta' },
    chain: { kind: 'chain', range: 380, hop: 250, count: 4, dmg: 1000, falloff: 0.85, stun: 0.4, d: 'un rayo que salta de un rival a otro y los aturde' },
    beam: { kind: 'beam', range: 440, width: 62, dmg: 1700, delay: 0.32, d: 'un rayo larguísimo que se carga un instante y lo atraviesa todo' },
    mines: { kind: 'mines', range: 330, count: 3, spreadR: 70, trigger: 44, radius: 90, dmg: 1000, stun: 0.6, life: 14, scale: 1.4, d: 'tres trampas en el suelo que explotan y aturden al pisarlas' },
    turret: { kind: 'turret', place: 160, range: 330, dur: 6, rate: 0.55, dmg: 240, speed: 620, r: 12, scale: 1.2, d: 'deja un orbe que dispara solo a los rivales durante 6 s' },
    barrier: { kind: 'barrier', time: 4.5, reduce: 0.6, radius: 260, d: 'un escudo que reduce mucho el daño a él y a su equipo cercano' },
    wish: { kind: 'wish', radius: 300, heal: 0.33, d: 'cura de golpe a todo su equipo cercano y le quita el aturdimiento' },
    gust: { kind: 'spread', count: 7, spread: 0.7, range: 280, speed: 640, dmg: 340, r: 20, pierce: true, knockback: 520, scale: 1.6, d: 'un vendaval que atraviesa y empuja a todos' },
  };

  // súper propios de legendarios y Pokémon famosos: [forma, nombre, tipo]
  const SIGNATURE = {
    mewtwo: ['psy', 'Onda Mental', 'psychic'], mew: ['meteor', 'Poder Pasado', 'psychic'],
    lugia: ['gust', 'Aerochorro', 'flying'], hooh: ['spread', 'Fuego Sagrado', 'fire'],
    rayquaza: ['dash', 'Ascenso Draco', 'dragon'], kyogre: ['vortex', 'Pulso Primigenio', 'water'],
    groudon: ['slam', 'Filo del Abismo', 'ground'], dialga: ['shot', 'Distorsión', 'dragon'],
    palkia: ['draco', 'Corte Vacío', 'dragon'], giratina: ['stealth', 'Golpe Umbrío', 'ghost'],
    arceus: ['meteor', 'Sentencia', 'normal'], darkrai: ['vortex', 'Brecha Negra', 'dark'],
    reshiram: ['spread', 'Llama Azul', 'fire'], zekrom: ['dash', 'Rayo Fusión', 'electric'],
    kyurem: ['freeze', 'Rayo Gélido', 'ice'], articuno: ['freeze', 'Liofilización', 'ice'],
    zapdos: ['dash', 'Electrocañón', 'electric'], moltres: ['spread', 'Ataque Aéreo', 'fire'],
    raikou: ['dash', 'Voltio Cruel', 'electric'], entei: ['meteor', 'Erupción', 'fire'], suicune: ['vortex', 'Torbellino', 'water'],
    latias: ['psy', 'Bola Neblina', 'psychic'], latios: ['shot', 'Resplandor', 'psychic'],
    zacian: ['dash', 'Embestida Sólida', 'steel'], zamazenta: ['slam', 'Embiste Escudo', 'steel'],
    eternatus: ['shot', 'Cañón Dinamax', 'dragon'], yveltal: ['vortex', 'Ala Mortífera', 'dark'],
    xerneas: ['heal', 'Geocontrol', 'fairy'], necrozma: ['shot', 'Láser Prisma', 'psychic'],
    riolu: ['shot', 'Esfera Aural', 'fighting'], dratini: ['dash', 'Velocidad Extrema', 'normal'],
    larvitar: ['meteor', 'Avalancha', 'rock'], gible: ['dash', 'Garra Dragón', 'dragon'],
    magikarp: ['vortex', 'Cascada', 'water'], lapras: ['heal', 'Canto', 'water'], eevee: ['dash', 'Última Baza', 'normal'],
    abra: ['stealth', 'Teletransporte', 'psychic'], scyther: ['dash', 'Tijera X', 'bug'],
  };

  // Formas del ataque básico. Cada una reparte el mismo daño total que el papel, pero de otra manera.
  // t = daño total de un ataque del papel (balas × daño), r = la plantilla del papel
  const STYLE = {
    cone: (t, r) => ({ kind: 'spread', count: 7, spread: 0.95, range: Math.round(r.range * 1.1), speed: 480, dmg: t / 7 * 0.92, r: 12, scale: 0.9, d: 'Una llamarada corta en abanico.' }),
    burst3: (t, r) => ({ kind: 'burst', count: 3, delay: 0.1, range: r.range, speed: 860, dmg: t / 3, r: 11, scale: 1 }),
    orb: (t, r) => ({ kind: 'spread', count: 1, spread: 0, range: r.range, speed: 540, dmg: t * 1.05, r: 25, pierce: true, scale: 1.8 }),
    homing: (t, r) => ({ kind: 'spread', count: 1, spread: 0, range: Math.round(r.range * 1.05), speed: 560, dmg: t * 0.8, r: 16, homing: 2.8, scale: 1.4 }),
    melee: (t, r) => ({ kind: 'melee', range: r.count > 3 ? 160 : 150, arc: 2.0, dmg: t * 1.32, scale: 1 }),
    twin: (t, r) => ({ kind: 'twin', gap: 13, range: r.range, speed: 720, dmg: t / 2, r: 12, scale: 1.1 }),
    boomer: (t, r) => ({ kind: 'spread', count: 1, spread: 0, range: Math.round(r.range * 0.85), speed: 620, dmg: t * 0.78, r: 18, boomerang: true, pierce: true, scale: 1.6 }),
  };
  // qué forma usa cada tipo según su papel (si no sale aquí, la del papel)
  const STYLE_OF = {
    fire: { tank: ['cone', 'Lanzallamas'] },
    water: { tank: ['cone', 'Burbuja'] },
    electric: { assassin: ['burst3', 'Chispa'], fighter: ['burst3', 'Chispa'] },
    normal: { assassin: ['burst3', 'Ataque Rápido'] },
    ghost: { sniper: ['orb', 'Bola Sombra'], fighter: ['orb', 'Bola Sombra'] },
    poison: { fighter: ['orb', 'Bomba Lodo'] },
    psychic: { sniper: ['homing', 'Psicorrayo'], fighter: ['orb', 'Confusión'] },
    fairy: { sniper: ['homing', 'Beso Drenaje'], fighter: ['homing', 'Viento Feérico'] },
    fighting: { tank: ['melee', 'Golpe Kárate'], assassin: ['melee', 'Puño Certero'] },
    dark: { assassin: ['melee', 'Mordisco'], fighter: ['boomer', 'Finta'] },
    dragon: { tank: ['melee', 'Garra Dragón'], assassin: ['melee', 'Garra Dragón'] },
    bug: { fighter: ['twin', 'Doble Ataque'], assassin: ['twin', 'Pin Misil'] },
    steel: { fighter: ['twin', 'Bala Bala'], sniper: ['twin', 'Disparo Espejo'] },
    grass: { fighter: ['boomer', 'Hoja Mágica'] },
    ground: { fighter: ['boomer', 'Hueso Palo'] },
    ice: { fighter: ['twin', 'Canto Helado'] },
    flying: { assassin: ['twin', 'Picotazo'] },
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
    starter: { name: 'Inicial', color: '#9ad08a', cost: 200 },
    common: { name: 'Común', color: '#c8c8c8', cost: 100 },
    rare: { name: 'Raro', color: '#5aa8ff', cost: 200 },
    epic: { name: 'Épico', color: '#c07aff', cost: 400 },
    legendary: { name: 'Legendario', color: '#ffd23a', cost: 800 },
  };
  PB.RARITY = RARITY;
  for (const r of Object.values(RARITY)) r.name = PB.T(r.name);
  const STARTERS = new Set([].concat(PB.STARTER_DEX.grass, PB.STARTER_DEX.fire, PB.STARTER_DEX.water));

  // typesOverride: para cuando un Pokémon con ramas evoluciona y cambia de tipo (Eevee -> Flareon)
  function build(fam, typesOverride) {
    const line = fam.line;
    const base = PB.DEX[line[0]], fin = PB.DEX[line[line.length - 1]];
    const types = (typesOverride || base.types).slice();
    const atkType = attackType(types);
    const roleId = roleOf(fin, atkType);
    const R = ROLE[roleId];
    const kit = KIT[atkType] || KIT.normal;
    const look = { shape: PB.VFX.forType(atkType).proj, trail: TRAIL[atkType] || 'spark' };
    // súper: si tiene un segundo tipo, usa el súper de ese tipo (Charizard: Volador, Gengar: Veneno...);
    // si no, los asesinos y lanzadores usan el súper alternativo de su tipo
    const second = types.find((t) => t !== atkType && t !== 'normal' && KIT[t]);
    const sig = typesOverride ? null : SIGNATURE[fam.id];
    const supType = sig ? sig[2] : second || atkType;
    const alt = roleId === 'assassin' || roleId === 'thrower' || roleId === 'tank' ? 1 : 0;
    const [supKind, supName] = sig || (second ? KIT[second].sup[alt] : (KIT[atkType] || KIT.normal).sup[alt]);
    const supLook = { shape: PB.VFX.forType(supType).proj, trail: TRAIL[supType] || 'spark' };
    // pequeñas diferencias según sus stats (±10 %), compensadas para que nadie sea mejor en todo
    const zBulk = clamp(((fin.hp - 105) / 8 + (fin.df + fin.sd - 158) / 35) / 2, -1.5, 1.5);
    const zSpd = clamp((fin.spd - 110) / 10, -1.5, 1.5);
    const zAtk = clamp((Math.max(fin.pa, fin.sa) - 1.2) / 0.12, -1.5, 1.5);
    // el que tiene más vida pega menos y el que tiene menos vida pega más (±15 %), con un toque de su ataque
    const hpMul = 1 + 0.1 * zBulk;
    const dmgMul = (1 + 0.03 * zAtk) / hpMul;
    // forma del ataque básico según tipo y papel
    const st = (STYLE_OF[atkType] || {})[roleId];
    const total = R.atk.dmg * (R.atk.count || 1);
    const { scale: as, d: _d, ...atk } = st ? STYLE[st[0]](total, R.atk) : R.atk;
    const basicName = st ? st[1] : kit.basic;
    const { d: sd, scale: ss, ...sup } = SUPER[supKind];
    const rarity = fam.leg ? 'legendary' : STARTERS.has(line[0]) ? 'starter' : fin.bst > 530 ? 'epic' : fin.bst > 470 ? 'rare' : 'common';
    return {
      id: fam.id, dex: line[0], line, name: base.name, types, atkType, gen: base.gen,
      roleId, role: PB.T(R.name),
      hp: Math.round((R.hp * hpMul) / 50) * 50,
      speed: Math.round(R.speed + zSpd * 5),
      reload: R.reload, superHits: R.superHits,
      attack: Object.assign({ name: PB.TM(basicName) }, atk, { dmg: Math.round((atk.dmg * dmgMul) / 10) * 10, look: Object.assign({ scale: as }, look) }),
      super: Object.assign({ name: PB.TM(supName), type: supType }, sup, sup.dmg ? { dmg: Math.round((sup.dmg * dmgMul) / 10) * 10 } : {}, sup.dps ? { dps: Math.round(sup.dps * dmgMul) } : {}, { look: Object.assign({ scale: ss || 1.4 }, supLook) }),
      desc: PB.T(TRAIT[roleId]) + ' ' + PB.T(ATK_DESC[st ? st[0] : roleId]) + ' ' + PB.T('Súper: {name} ({type}), {what}.', { name: PB.TM(supName), type: PB.T(PB.TYPE_INFO[supType].name), what: PB.T(sd) }),
      alts: fam.alts || null,
      rarity,
    };
  }

  const hand = {};
  for (const h of PB.HANDMADE) hand[h.id] = h;
  PB.BRAWLERS = PB.FAMILIES.map((fam) => {
    const b = build(fam);
    const h = hand[fam.id];
    // los originales conservan sus ataques; solo cogen la línea evolutiva y la rareza
    // (sus textos también se traducen)
    return h ? Object.assign({}, h, {
      dex: b.dex, line: b.line, alts: b.alts, gen: b.gen, rarity: h.rarity || b.rarity, roleId: b.roleId,
      role: PB.T(h.role), desc: PB.T(h.desc), name: PB.DEX[b.dex].name,
      attack: Object.assign({}, h.attack, { name: PB.TM(h.attack.name) }),
      super: Object.assign({}, h.super, { name: PB.TM(h.super.name) }),
    }) : b;
  });
  const byId = {};
  for (const b of PB.BRAWLERS) byId[b.id] = b;
  PB.brawlerById = (id) => byId[id];

  // Al evolucionar por una rama que cambia de tipo (Eevee -> Jolteon, Ralts -> Gallade...),
  // sus ataques pasan a ser los de su nuevo tipo y su nuevo papel. La vida no cambia aquí (la sube la evolución).
  PB.retype = (def, line, stage) => {
    const types = PB.DEX[line[stage]].types;
    if (!def.alts || types.join() === PB.DEX[line[0]].types.join()) return def;
    const n = build({ id: def.id, line, alts: def.alts }, types);
    return Object.assign({}, def, {
      atkType: n.atkType, attack: n.attack, super: n.super, roleId: n.roleId, role: n.role,
      speed: n.speed, reload: n.reload, superHits: n.superHits, desc: n.desc,
    });
  };

  // ---------------------------------------------------------------- evolución
  // Fases: las líneas de 3 evolucionan dos veces (+12 % cada vez); las de 2, una vez con un salto mayor (+22 %).
  PB.EVO = {
    xp3: [70, 165], // EXP total para la 2ª y 3ª fase
    xp2: [70], // los de una sola evolución tardan lo mismo que la 1ª evolución de los de tres
    mul3: [1, 1.12, 1.25],
    mul2: [1.05, 1.2], // una evolución: empieza algo más fuerte y acaba algo por debajo de una 3ª fase
    mul1: [1.17], // no evolucionan (y legendarios): fuerza fija, como una 2ª fase
    passive: 0.8, // EXP por segundo solo por estar vivo
    perDamage: 0.0015, // EXP por punto de daño a rivales
    perKO: 15, // EXP por debilitar (+8 por cada fase del rival)
    perKOStage: 8,
    catchUp: 1.3, // si vas por detrás en evolución de algún rival, ganas EXP más rápido
  };
  PB.EVO_ANIM = 0.8; // duración de la animación de evolución (s)
  PB.EVO_REVEAL = 0.3; // cuando quedan estos segundos se ve la forma nueva
  PB.evoSteps = (def) => (def.line.length >= 3 ? PB.EVO.xp3 : def.line.length === 2 ? PB.EVO.xp2 : []);
  PB.stageMul = (def, stage) => (def.line.length >= 3 ? PB.EVO.mul3 : def.line.length === 2 ? PB.EVO.mul2 : PB.EVO.mul1)[stage] || 1;
  // `o` puede ser la ficha (def) o el luchador de la partida (b.line es la rama que eligió: Eevee -> Jolteon...)
  PB.stageName = (o, stage) => (PB.DEX[o.line[stage]] || PB.DEX[o.line[0]]).name;
  PB.stageTypes = (o, stage) => (PB.DEX[o.line[stage]] || PB.DEX[o.line[0]]).types;
})();
