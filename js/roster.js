// Roster completo: un luchador por cada familia evolutiva de js/roster-data.js.
// Cada Pokémon empieza la partida en su primera fase y evoluciona durante ella (ver Game.gainXp).
//
// Para no tener que diseñar 300 Pokémon uno a uno:
//  - el TIPO decide sus ataques (nombre, aspecto y súper): todos los de fuego lanzan Ascuas y Lanzallamas...
//  - sus ESTADÍSTICAS deciden su papel (tanque, asesino, tirador...), que cambia cómo dispara.
// Los 6 primeros (PB.HANDMADE, en data.js) conservan sus ataques hechos a mano.
(function () {
  // ataque básico y varios súper por tipo: [forma, nombre, cambios opcionales sobre la forma].
  // Cada Pokémon coge uno según su id (pickSuper), así los del mismo tipo no son todos iguales
  // y añadir Pokémon nuevos no cambia el súper de los que ya están.
  const KIT = {
    normal: { basic: 'Meteoros', sup: [['beam', 'Hiperrayo'], ['nova', 'Vozarrón'], ['rage', 'Danza Espada'], ['leap', 'Golpe Cuerpo']] },
    fire: { basic: 'Ascuas', sup: [['spread', 'Lanzallamas'], ['turret', 'Fuego Fatuo'], ['wave', 'Onda Ígnea'], ['orbit', 'Giro Fuego']] },
    water: { basic: 'Pistola Agua', sup: [['shot', 'Hidrobomba'], ['vortex', 'Torbellino'], ['wave', 'Surf'], ['heal', 'Acua Aro', { dps: 350, heal: 750, d: 'un anillo de agua que cura mucho a tu equipo y daña algo a los rivales' }], ['ricochet', 'Rayo Burbuja']] },
    grass: { basic: 'Hoja Afilada', sup: [['heal', 'Drenadoras'], ['boomerang', 'Hoja Aguda'], ['orbit', 'Danza Pétalo'], ['hook', 'Látigo Cepa'], ['beam', 'Rayo Solar', { delay: 0.5, dmg: 1900, d: 'se carga un poco más que otros rayos, pero pega más fuerte' }]] },
    electric: { basic: 'Impactrueno', sup: [['chain', 'Rayo'], ['dash', 'Placaje Eléctrico'], ['ricochet', 'Bola Voltio'], ['meteor', 'Trueno', { count: 4, flight: 0.45, stun: 0.5, d: 'rayos que caen del cielo sobre la zona elegida y aturden' }]] },
    ice: { basic: 'Rayo Hielo', sup: [['freeze', 'Ventisca'], ['meteor', 'Granizo'], ['wave', 'Viento Hielo', { dmg: 780, knockback: 260, stun: 0.7, d: 'una ola helada que pasa por encima de los muros y congela un momento' }], ['ricochet', 'Bola Hielo']] },
    fighting: { basic: 'Esfera Aural', sup: [['dash', 'A Bocajarro'], ['barrier', 'Corpulencia'], ['reflect', 'Contraataque'], ['leap', 'Patada Salto Alta']] },
    poison: { basic: 'Residuos', sup: [['toxic', 'Tóxico'], ['mines', 'Púas Tóxicas'], ['tornado', 'Gas Venenoso', { pull: 0, speed: 110, dps: 950, radius: 105, d: 'una nube venenosa que avanza despacio y hace mucho daño a quien se quede dentro' }]] },
    ground: { basic: 'Disparo Lodo', sup: [['slam', 'Terremoto'], ['boomerang', 'Huesomerang'], ['leap', 'Excavar', { burrow: true, d: 'se mete bajo tierra y sale de golpe en la zona elegida' }], ['tornado', 'Bucle Arena']] },
    flying: { basic: 'Tornado', sup: [['gust', 'Vendaval'], ['dash', 'Pájaro Osado'], ['leap', 'Vuelo'], ['tornado', 'Huracán']] },
    psychic: { basic: 'Confusión', sup: [['psy', 'Psíquico'], ['barrier', 'Barrera'], ['reflect', 'Manto Espejo'], ['hook', 'Telequinesis']] },
    bug: { basic: 'Picadura', sup: [['spread', 'Zumbido'], ['mines', 'Telaraña'], ['rage', 'Danza Aleteo'], ['hook', 'Disparo Demora']] },
    rock: { basic: 'Lanzarrocas', sup: [['meteor', 'Avalancha'], ['mines', 'Trampa Rocas'], ['ricochet', 'Rodar', { r: 24, speed: 600 }], ['orbit', 'Poder Pasado', { count: 3, rad: 64 }]] },
    ghost: { basic: 'Bola Sombra', sup: [['stealth', 'Desvanecer'], ['vortex', 'Pesadilla'], ['hook', 'Lengüetazo'], ['wave', 'Viento Aciago']] },
    dragon: { basic: 'Dragoaliento', sup: [['draco', 'Cometa Draco'], ['beam', 'Pulso Dragón'], ['rage', 'Danza Dragón'], ['leap', 'Carga Dragón']] },
    dark: { basic: 'Pulso Umbrío', sup: [['boomerang', 'Tajo Umbrío'], ['dash', 'Golpe Bajo'], ['rage', 'Maquinación'], ['hook', 'Desarme']] },
    steel: { basic: 'Disparo Espejo', sup: [['shot', 'Foco Resplandor'], ['barrier', 'Defensa Férrea'], ['ricochet', 'Giro Bola'], ['reflect', 'Escudo Real']] },
    fairy: { basic: 'Viento Feérico', sup: [['wish', 'Deseo'], ['nova', 'Brillo Mágico'], ['orbit', 'Fuerza Lunar'], ['leap', 'Carantoña']] },
  };
  // número fijo a partir del id (el mismo en todos los navegadores)
  const hashId = (s) => {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
    return h >>> 0;
  };
  // avoid: nombre del súper clásico; si toca el mismo, se coge el siguiente (así el set nuevo siempre es distinto)
  const pickSuper = (type, id, avoid) => {
    const pool = (KIT[type] || KIT.normal).sup;
    let i = hashId(id + ':' + type) % pool.length;
    if (pool[i][1] === avoid && pool.length > 1) i = (i + 1) % pool.length;
    return pool[i];
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
    spray: 'Suelta una rociada de muchos disparos pequeños a corta distancia.', lance: 'Un disparo finísimo y rapidísimo que atraviesa a los rivales.',
    split: 'Lanza un disparo que se parte en tres al chocar o al llegar al final.', bounce: 'Un disparo que rebota una vez en los muros.',
    sine: 'Un disparo que avanza haciendo eses: difícil de esquivar.', ripple: 'Una onda corta y ancha que atraviesa y empuja un poco.',
    spin: 'Gira sobre sí mismo y golpea a todos los que tiene alrededor.', laser: 'Un láser instantáneo y estrecho: golpea a todo lo que haya en la línea.',
    cluster: 'Lanza por encima de los muros un ataque que estalla en varios trozos.', puddle: 'Lanza por encima de los muros un ataque que deja un charco que daña.',
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
    // Ditto: si el rayo da a un rival, se convierte en él unos segundos (su aspecto, tipo, ataque y súper)
    transform: { kind: 'spread', count: 1, spread: 0, range: 380, speed: 760, dmg: 400, r: 22, transform: true, scale: 1.5, d: 'un rayo que, si da a un rival, te convierte en él durante 8 s con sus ataques' },
    vortex: { kind: 'zone', range: 330, flight: 0.5, radius: 130, duration: 3, dps: 520, heal: 0, pull: 130, scale: 1.4, d: 'un remolino que arrastra a los rivales a su centro y los va dañando' },
    meteor: { kind: 'meteor', range: 330, flight: 0.85, count: 5, spreadR: 85, radius: 54, dmg: 600, scale: 1.6, d: 'una lluvia de golpes que caen sobre la zona elegida' },
    nova: { kind: 'nova', count: 12, range: 280, speed: 540, dmg: 800, r: 16, pierce: true, scale: 1.4, d: 'una explosión de ataques en todas direcciones' },
    boomerang: { kind: 'boomerang', range: 340, speed: 660, dmg: 920, r: 24, scale: 2.4, d: 'un proyectil enorme que va y vuelve, golpeando a la ida y a la vuelta' },
    chain: { kind: 'chain', range: 380, hop: 250, count: 4, dmg: 1000, falloff: 0.85, stun: 0.4, d: 'un rayo que salta de un rival a otro y los aturde' },
    beam: { kind: 'beam', range: 440, width: 62, dmg: 1700, delay: 0.32, d: 'un rayo larguísimo que se carga un instante y lo atraviesa todo' },
    mines: { kind: 'mines', range: 330, count: 3, spreadR: 70, trigger: 44, radius: 90, dmg: 850, stun: 0.4, life: 14, scale: 1.4, d: 'tres trampas en el suelo que explotan y aturden al pisarlas' },
    turret: { kind: 'turret', place: 160, range: 330, dur: 6, rate: 0.55, dmg: 240, speed: 620, r: 12, scale: 1.2, d: 'deja un orbe que dispara solo a los rivales durante 6 s' },
    barrier: { kind: 'barrier', time: 4.5, reduce: 0.6, radius: 260, d: 'un escudo que reduce mucho el daño a él y a su equipo cercano' },
    wish: { kind: 'wish', radius: 300, heal: 0.33, d: 'cura de golpe a todo su equipo cercano y le quita el aturdimiento' },
    gust: { kind: 'spread', count: 7, spread: 0.7, range: 280, speed: 640, dmg: 300, r: 20, pierce: true, knockback: 520, scale: 1.6, d: 'un vendaval que atraviesa y empuja a todos' },
    // --- formas nuevas (v1.3) ---
    wave: { kind: 'wave', width: 170, range: 380, speed: 460, dmg: 950, r: 22, knockback: 560, scale: 1.6, d: 'una ola enorme que pasa por encima de los muros y arrastra a los rivales' },
    tornado: { kind: 'tornado', range: 460, speed: 150, radius: 95, duration: 3.2, dps: 700, pull: 260, scale: 1.4, d: 'un torbellino que avanza despacio, atrapa a los rivales y los arrastra con él' },
    orbit: { kind: 'orbit', count: 4, rad: 72, duration: 6, dmg: 520, spin: 4.2, scale: 1.4, d: 'orbes que giran a su alrededor: golpean a quien se acerque y paran disparos' },
    leap: { kind: 'leap', range: 340, flight: 0.6, radius: 150, dmg: 1400, knockback: 520, stun: 0.3, d: 'salta por encima de todo y cae sobre la zona elegida' },
    hook: { kind: 'hook', range: 380, speed: 950, r: 16, dmg: 700, stun: 0.7, scale: 1.3, d: 'atrapa al primer rival que toca y lo trae hasta él' },
    reflect: { kind: 'reflect', time: 3, radius: 52, d: 'un espejo que devuelve los disparos rivales durante 3 s' },
    rage: { kind: 'rage', time: 5, dmgMul: 1.35, speedMul: 1.3, reloadMul: 1.7, d: 'durante 5 s corre más, recarga antes y pega más fuerte' },
    ricochet: { kind: 'ricochet', range: 900, speed: 720, r: 18, dmg: 1000, bounces: 4, pierce: true, scale: 1.8, d: 'un disparo que rebota en los muros hasta 4 veces' },
  };

  // Súper del set "Clásico" de los Pokémon con súper propio. Con dos tipos, es del tipo que NO usa el súper
  // nuevo (cada set, un tipo), con un movimiento que ese Pokémon aprende en los juegos: [forma, nombre, tipo]
  // súper nuevos puestos a mano (el resto los elige pickSuper): [forma, nombre, tipo]
  const SUPER_NEW = { scyther: ['dash', 'Tijera X', 'bug'], ditto: ['transform', 'Transformación', 'normal'], munchlax: ['leap', 'Golpe Cuerpo', 'normal'], mimejr: ['reflect', 'Reflejo', 'psychic'] };
  const SIGNATURE = {
    ditto: ['transform', 'Transformación', 'normal'],
    munchlax: ['slam', 'Golpe Cuerpo', 'normal'],
    mewtwo: ['psy', 'Onda Mental', 'psychic'], mew: ['meteor', 'Poder Pasado', 'psychic'],
    lugia: ['psy', 'Psíquico', 'psychic'], hooh: ['dash', 'Pájaro Osado', 'flying'],
    rayquaza: ['dash', 'Carga Dragón', 'dragon'], kyogre: ['vortex', 'Pulso Primigenio', 'water'],
    groudon: ['slam', 'Filo del Abismo', 'ground'], dialga: ['shot', 'Foco Resplandor', 'steel'],
    palkia: ['shot', 'Hidrobomba', 'water'], giratina: ['dash', 'Garra Dragón', 'dragon'],
    arceus: ['meteor', 'Sentencia', 'normal'], darkrai: ['vortex', 'Brecha Negra', 'dark'],
    reshiram: ['beam', 'Pulso Dragón', 'dragon'], zekrom: ['dash', 'Garra Dragón', 'dragon'],
    kyurem: ['beam', 'Pulso Dragón', 'dragon'], articuno: ['gust', 'Vendaval', 'flying'],
    zapdos: ['dash', 'Pico Taladro', 'flying'], moltres: ['spread', 'Llamarada', 'fire'],
    raikou: ['dash', 'Voltio Cruel', 'electric'], entei: ['meteor', 'Erupción', 'fire'], suicune: ['vortex', 'Torbellino', 'water'],
    latias: ['beam', 'Pulso Dragón', 'dragon'], latios: ['dash', 'Garra Dragón', 'dragon'],
    zacian: ['dash', 'Embestida Sólida', 'steel'], zamazenta: ['slam', 'Embiste Escudo', 'steel'],
    eternatus: ['toxic', 'Bomba Lodo', 'poison'], yveltal: ['vortex', 'Pulso Umbrío', 'dark'],
    xerneas: ['heal', 'Geocontrol', 'fairy'], necrozma: ['shot', 'Láser Prisma', 'psychic'],
    celebi: ['psy', 'Psíquico', 'psychic'], victini: ['dash', 'Cabezazo Zen', 'psychic'],
    zygarde: ['dash', 'Enfado', 'dragon'], volcanion: ['spread', 'Llamarada', 'fire'],
    tapufini: ['shot', 'Hidrobomba', 'water'], magearna: ['shot', 'Foco Resplandor', 'steel'],
    marshadow: ['dash', 'A Bocajarro', 'fighting'], calyrex: ['psy', 'Psíquico', 'psychic'],
    chiyu: ['nova', 'Pulso Umbrío', 'dark'], fezandipiti: ['toxic', 'Tóxico', 'poison'],
    riolu: ['shot', 'Esfera Aural', 'fighting'], dratini: ['dash', 'Velocidad Extrema', 'normal'],
    larvitar: ['meteor', 'Avalancha', 'rock'], gible: ['slam', 'Terremoto', 'ground'],
    magikarp: ['vortex', 'Cascada', 'water'], lapras: ['heal', 'Canto', 'water'], eevee: ['dash', 'Última Baza', 'normal'],
    abra: ['stealth', 'Teletransporte', 'psychic'], scyther: ['dash', 'Golpe Aéreo', 'flying'],
    mimikyu: ['dash', 'Sombra Vil', 'ghost'], bulbasaur: ['toxic', 'Bomba Lodo', 'poison'], gastly: ['toxic', 'Tóxico', 'poison'],
  };

  // Súper de legendarios (v1.3): su movimiento característico, con una forma propia más espectacular
  // y sus colores (pal: paleta de vfx.js). [forma, nombre, tipo, cambios sobre la forma]
  const LEGEND_KIND = {
    comet: { kind: 'comet', range: 420, flight: 1.15, radius: 190, dmg: 1500, knockback: 650, stun: 0.5, d: 'sube al cielo y cae como un cometa sobre la zona elegida; mientras tanto no le pueden tocar' },
    fissure: { kind: 'fissure', range: 420, count: 8, step: 52, radius: 72, dmg: 1500, stun: 0.6, destroysWalls: true, d: 'una fila de pinchos gigantes sale del suelo hacia delante, aturde y rompe muros' },
    megabeam: { kind: 'megabeam', range: 540, width: 96, charge: 0.55, dur: 0.8, dmg: 1750, d: 'se carga y suelta un rayo enorme durante casi un segundo (mientras, no se mueve)' },
    judgment: { kind: 'judgment', range: 380, count: 9, spreadR: 220, radius: 62, dmg: 480, every: 0.08, delay: 0.45, d: 'una lluvia de golpes del cielo sobre una zona grande, con aviso en el suelo' },
    rend: { kind: 'rend', range: 190, count: 3, len: 400, width: 56, dmg: 1000, every: 0.15, d: 'tajos gigantes que rasgan el espacio delante de él' },
    pulse: { kind: 'pulse', count: 3, radius: 290, every: 0.3, speed: 560, dmg: 540, knockback: 420, d: 'ondas enormes que salen de él y empujan a todos' },
    inferno: { kind: 'inferno', range: 330, arc: 1.15, dur: 0.9, dmg: 1900, d: 'un mar de llamas en abanico que deja el suelo ardiendo (mientras, no se mueve)' },
    storm: { kind: 'storm', radius: 400, count: 6, dur: 1.5, dmg: 390, hitR: 70, stun: 0.2, d: 'un nubarrón encima y rayos que caen sobre los rivales cercanos' },
    void: { kind: 'void', range: 360, radius: 170, dur: 1.6, pull: 330, dps: 320, burst: 750, burstR: 140, d: 'un agujero que se traga a los rivales y luego estalla' },
    frost: { kind: 'frost', radius: 240, dur: 0.6, dmg: 850, stun: 0.9, d: 'congela el suelo a su alrededor y deja a los rivales atrapados en hielo' },
    aura: { kind: 'aura', radius: 330, heal: 0.15, time: 3.5, dmgMul: 1.12, speedMul: 1.1, d: 'una columna de luz que cura y potencia a todo su equipo cercano' },
    phantom: { kind: 'phantom', range: 460, hide: 0.6, radius: 130, dmg: 1450, stun: 0.3, d: 'desaparece y aparece junto al rival para golpearle por sorpresa' },
    bigorb: { kind: 'bigorb', range: 460, speed: 330, r: 42, dmg: 650, boom: 1000, boomR: 160, d: 'una esfera enorme y lenta que lo atraviesa todo y estalla al final' },
  };
  const LEGEND = {
    articuno: ['frost', 'Liofilización', 'ice', { pal: 'aurora' }],
    zapdos: ['storm', 'Trueno', 'electric', {}],
    moltres: ['comet', 'Ataque Aéreo', 'flying', { pal: 'sun' }],
    mewtwo: ['pulse', 'Onda Mental', 'psychic', { count: 2, dmg: 900, knockback: 620, shape: 'ring' }],
    mew: ['judgment', 'Poder Pasado', 'psychic', { shape: 'rock' }],
    raikou: ['storm', 'Voltio Cruel', 'electric', { count: 7, dmg: 560, pal: 'gold' }],
    entei: ['judgment', 'Erupción', 'fire', { shape: 'fire', pal: 'magma', count: 9, radius: 70 }],
    suicune: ['megabeam', 'Rayo Aurora', 'ice', { pal: 'aurora', stun: 0.15 }],
    lugia: ['megabeam', 'Aerochorro', 'flying', { pal: 'silver' }],
    hooh: ['inferno', 'Fuego Sagrado', 'fire', { pal: 'rainbow' }],
    celebi: ['pulse', 'Lluevehojas', 'grass', { shape: 'leaf' }],
    regirock: ['fissure', 'Roca Afilada', 'rock', { shape: 'rock' }],
    regice: ['frost', 'Ventisca', 'ice', {}],
    registeel: ['aura', 'Defensa Férrea', 'steel', { reduce: 0.3, dmgMul: 1, speedMul: 1, heal: 0.1, d: 'un escudo de acero para todo su equipo cercano: reciben bastante menos daño' }],
    latias: ['bigorb', 'Bola Neblina', 'psychic', { pal: 'space', shape: 'bubble' }],
    latios: ['megabeam', 'Resplandor', 'psychic', { pal: 'time' }],
    kyogre: ['pulse', 'Pulso Primigenio', 'water', { shape: 'drop', radius: 330 }],
    groudon: ['fissure', 'Filo del Abismo', 'ground', { pal: 'magma', shape: 'rock' }],
    rayquaza: ['comet', 'Ascenso Draco', 'flying', { pal: 'rayquaza' }],
    jirachi: ['judgment', 'Deseo Oculto', 'steel', { pal: 'gold', shape: 'star', delay: 0.9 }],
    deoxys: ['bigorb', 'Psicoataque', 'psychic', { pal: 'cosmic', shape: 'ring' }],
    uxie: ['judgment', 'Premonición', 'psychic', { pal: 'gold', shape: 'ring', count: 7, radius: 80, dmg: 700 }],
    mesprit: ['aura', 'Deseo Cura', 'psychic', { pal: 'space', heal: 0.5, dmgMul: 1.1 }],
    azelf: ['pulse', 'Explosión', 'psychic', { count: 1, radius: 260, dmg: 1700, knockback: 700, pal: 'cosmic', d: 'una explosión enorme a su alrededor' }],
    dialga: ['megabeam', 'Distorsión', 'dragon', { pal: 'time', stun: 0.2, d: 'un rayo enorme que detiene el tiempo: deja quietos a los que toca' }],
    palkia: ['rend', 'Corte Vacío', 'dragon', { pal: 'space' }],
    heatran: ['void', 'Lluvia Ígnea', 'fire', { pal: 'magma', dps: 520, burst: 600, pull: 240, d: 'un remolino de magma que atrapa a los rivales y luego estalla' }],
    regigigas: ['comet', 'Gigaimpacto', 'normal', { pal: 'gold' }],
    giratina: ['phantom', 'Golpe Umbrío', 'ghost', { pal: 'void' }],
    cresselia: ['aura', 'Danza Lunar', 'psychic', { pal: 'moon', heal: 0.32 }],
    phione: ['pulse', 'Hidropulso', 'water', { count: 2, dmg: 700, shape: 'bubble' }],
    manaphy: ['aura', 'Acua Aro', 'water', { heal: 0.3, dmgMul: 1.1 }],
    darkrai: ['void', 'Brecha Negra', 'dark', { pal: 'void', stun: 1.6, burst: 500, d: 'un agujero negro que se traga a los rivales y los deja dormidos' }],
    shaymin: ['pulse', 'Fogonazo', 'grass', { count: 1, radius: 300, dmg: 1500, shape: 'leaf' }],
    arceus: ['judgment', 'Sentencia', 'normal', { pal: 'gold', shape: 'star', count: 13, radius: 66 }],
    victini: ['rend', 'V de Fuego', 'fire', { pattern: 'v', dmg: 1250, width: 64, pal: 'sun' }],
    cobalion: ['rend', 'Espada Santa', 'steel', { count: 1, len: 420, dmg: 1500, width: 70 }],
    terrakion: ['rend', 'Espada Santa', 'rock', { count: 1, len: 420, dmg: 1500, width: 70 }],
    virizion: ['rend', 'Espada Santa', 'grass', { count: 1, len: 420, dmg: 1500, width: 70 }],
    tornadus: ['void', 'Vendaval', 'flying', { pal: 'silver', pull: 420, dps: 300, burst: 700 }],
    thundurus: ['storm', 'Trueno', 'electric', { pal: 'space', count: 11, dmg: 400 }],
    reshiram: ['inferno', 'Llama Azul', 'fire', { pal: 'blueflame' }],
    zekrom: ['comet', 'Rayo Fusión', 'electric', { pal: 'zekrom' }],
    landorus: ['judgment', 'Tierra Viva', 'ground', { shape: 'rock', pal: 'magma' }],
    kyurem: ['frost', 'Mundo Gélido', 'ice', { radius: 280, pal: 'aurora' }],
    keldeo: ['rend', 'Sable Místico', 'water', { count: 2 }],
    meloetta: ['pulse', 'Canto Arcaico', 'normal', { shape: 'note', stun: 1.2, pal: 'gold', d: 'ondas de música que empujan y, la última, duerme a los rivales' }],
    genesect: ['megabeam', 'Tecno Shock', 'normal', { pal: 'cosmic' }],
    xerneas: ['aura', 'Geocontrol', 'fairy', { pal: 'rainbow', dmgMul: 1.3, speedMul: 1.2 }],
    yveltal: ['megabeam', 'Ala Mortífera', 'flying', { pal: 'blood', drain: 0.5, d: 'un rayo enorme que le cura con el daño que hace' }],
    zygarde: ['judgment', 'Mil Flechas', 'ground', { shape: 'needle', pal: 'grass', count: 14, radius: 54, dmg: 460 }],
    diancie: ['judgment', 'Tormenta de Diamantes', 'rock', { shape: 'shard', pal: 'diamond' }],
    hoopa: ['phantom', 'Paso Dimensional', 'psychic', { pal: 'cosmic' }],
    volcanion: ['megabeam', 'Chorro de Vapor', 'water', { pal: 'silver', width: 120 }],
    typenull: ['rend', 'Multiataque', 'normal', {}],
    tapukoko: ['storm', 'Campo Eléctrico', 'electric', { pal: 'gold' }],
    tapulele: ['pulse', 'Campo Psíquico', 'psychic', { pal: 'space' }],
    tapubulu: ['aura', 'Campo de Hierba', 'grass', { heal: 0.3 }],
    tapufini: ['aura', 'Campo de Niebla', 'fairy', { reduce: 0.35, heal: 0.15, dmgMul: 1, speedMul: 1, d: 'una niebla que cura algo y protege a su equipo: reciben mucho menos daño' }],
    cosmog: ['comet', 'Asalto Estelar', 'steel', { pal: 'sun' }],
    necrozma: ['megabeam', 'Láser Prisma', 'psychic', { pal: 'rainbow', prism: true }],
    magearna: ['megabeam', 'Cañón Floral', 'fairy', { pal: 'diamond' }],
    marshadow: ['phantom', 'Robasombra', 'ghost', { pal: 'void' }],
    zeraora: ['storm', 'Puños Plasma', 'electric', { radius: 300, count: 8, dmg: 520, fists: true, d: 'puños eléctricos flotan encima de él y caen con rayos sobre los rivales cercanos' }],
    meltan: ['comet', 'Puño Meteoro', 'steel', { pal: 'silver' }],
    zacian: ['rend', 'Embestida Sólida', 'fairy', { count: 1, len: 480, width: 90, dmg: 1800, pal: 'time' }],
    zamazenta: ['pulse', 'Embiste Escudo', 'fighting', { count: 1, radius: 240, dmg: 1500, knockback: 800, pal: 'blood' }],
    eternatus: ['megabeam', 'Cañón Dinamax', 'dragon', { pal: 'blood', width: 120 }],
    kubfu: ['rend', 'Azote Torrencial', 'fighting', { count: 5, every: 0.08, dmg: 420, len: 260 }],
    regieleki: ['storm', 'Electrojaula', 'electric', { radius: 340, count: 12, dur: 1.2, dmg: 380 }],
    regidrago: ['megabeam', 'Dracoenergía', 'dragon', {}],
    glastrier: ['judgment', 'Lanza Glacial', 'ice', { shape: 'shard', pal: 'aurora' }],
    spectrier: ['pulse', 'Orbes Espectro', 'ghost', { pal: 'void', shape: 'shadow' }],
    calyrex: ['aura', 'Gigadrenado', 'grass', { pal: 'gold', heal: 0.35 }],
    enamorus: ['void', 'Ciclón Primaveral', 'fairy', { pal: 'diamond', pull: 380, dps: 330 }],
    chiyu: ['inferno', 'Sofoco', 'fire', { arc: 1.4, range: 280 }],
    koraidon: ['phantom', 'Colisión Final', 'fighting', { pal: 'blood' }],
    munkidori: ['rend', 'Cadena Virulenta', 'poison', { count: 2 }],
    fezandipiti: ['pulse', 'Brillo Mágico', 'fairy', { pal: 'diamond', shape: 'star' }],
    ogerpon: ['rend', 'Garrote Liana', 'grass', { count: 1, len: 380, dmg: 1450, width: 80 }],
    terapagos: ['judgment', 'Teraexplosión', 'normal', { pal: 'rainbow', shape: 'shard' }],
  };

  // Súper especiales (v1.3) de Pokémon famosos. Cada movimiento tiene su propia mecánica (game.js, doSpecial);
  // algunos reutilizan una forma de los legendarios (engine) con sus propios números y colores.
  const SPECIAL = {
    'Impactrueno': { kind: 'thunderchain', type: 'electric', range: 380, hop: 300, count: 6, dmg: 760, falloff: 0.9, stun: 0.5, d: 'un rayo que salta entre todos los rivales cercanos y les cae otro del cielo' },
    'Ascuas': { kind: 'emberfan', type: 'fire', count: 11, spread: 1.4, range: 300, speed: 520, dmg: 230, r: 12, sine: 0.5, sineF: 16, d: 'un abanico de once ascuas que avanzan haciendo eses' },
    'Lanzallamas': { kind: 'flamestream', engine: 'inferno', type: 'fire', pal: 'fire', range: 340, arc: 0.55, sweep: 1.5, dur: 1.1, dmg: 1800, d: 'un chorro de fuego que barre de lado a lado y deja el suelo ardiendo' },
    'Rapidez': { kind: 'swift', type: 'normal', pal: 'gold', count: 7, spread: 2.2, range: 440, speed: 480, dmg: 300, r: 14, homing: 5, d: 'siete estrellas que nunca fallan: persiguen a los rivales' },
    'Pulso Umbrío': { kind: 'darkpulse', type: 'dark', pal: 'moon', count: 16, range: 320, speed: 520, dmg: 480, r: 18, d: 'una onda oscura de medias lunas en todas direcciones' },
    'Fuerza Lunar': { kind: 'moonblast', type: 'fairy', pal: 'diamond', range: 360, radius: 160, fall: 0.75, dmg: 1500, d: 'una luna gigante cae sobre la zona elegida' },
    'Bola Sombra': { kind: 'shadowball', type: 'ghost', pal: 'void', range: 380, speed: 360, r: 34, dmg: 700, boom: 600, boomR: 120, split: { count: 6, spread: 5.6, dmg: 230, range: 260, speed: 420, r: 12, homing: 3.5 }, d: 'una bola de sombra que al estallar suelta seis más pequeñas que persiguen' },
    'Esfera Aural': { kind: 'aurabarrage', type: 'fighting', pal: 'aura', count: 3, every: 0.16, range: 480, speed: 560, dmg: 520, r: 20, homing: 4, d: 'tres esferas aurales seguidas que nunca fallan' },
    'Hiperrayo': { kind: 'hyperbeam', engine: 'megabeam', type: 'normal', pal: 'sun', range: 560, width: 100, charge: 0.6, dur: 0.8, dmg: 2200, recharge: 0.8, d: 'un rayo enorme; después tiene que recargar un momento sin moverse' },
    'Hidrobomba': { kind: 'hydrocannon', engine: 'megabeam', type: 'water', pal: 'water', range: 460, width: 64, twin: 22, push: 260, charge: 0.4, dur: 0.8, dmg: 1700, d: 'dos chorros de agua a presión que arrastran a los rivales' },
    'Pistola Agua': { kind: 'watergun', type: 'water', count: 14, every: 0.07, range: 380, speed: 820, dmg: 120, r: 11, knockback: 120, d: 'una ráfaga de catorce chorros de agua seguidos' },
    'Salpicadura': { kind: 'splash', type: 'water', radius: 90, dmg: 120, knockback: 260, stun: 0, flight: 0.5, d: 'salta y salpica... y poco más' },
    // tiers: cambios según la fase (1ª, 2ª, última); los shurikens crecen y salen más, sin pasar del tamaño de un Pokémon
    'Shuriken de Agua': { kind: 'shuriken', type: 'water', every: 0.1, range: 600, speed: 700, bounces: 2, d: 'shurikens de agua que rebotan en los muros: más y más grandes en cada fase',
      tiers: [{ count: 3, dmg: 300, r: 10, shape: 'shurikenS', scale: 1 }, { count: 5, dmg: 280, r: 12, shape: 'shuriken', scale: 0.6 }, { count: 9, every: 0.06, dmg: 240, r: 15, shape: 'shuriken', scale: 0.85 }] },
    'Canto': { kind: 'lullaby', type: 'normal', pal: 'diamond', radius: 200, dur: 2.4, dps: 80, sleep: 1.8, d: 'canta y duerme a los rivales que se acerquen' },
    'Psíquico': { kind: 'telekinesis', type: 'psychic', pal: 'psychic', radius: 300, lift: 0.9, dmg: 1100, d: 'levanta con la mente a los rivales cercanos y los estampa contra el suelo' },
    'Triturar': { kind: 'crunch', type: 'dark', pal: 'void', range: 260, radius: 75, bite: 0.35, dmg: 1800, stun: 0.6, d: 'unas mandíbulas muerden con fuerza en el punto elegido' },
    'Látigo Cepa': { kind: 'vinewhip', type: 'grass', range: 360, speed: 950, r: 16, d: 'látigos que atrapan y traen a los rivales: uno, dos o tres según la fase',
      tiers: [{ count: 1, spread: 0, dmg: 620, stun: 0.6 }, { count: 2, spread: 0.45, dmg: 520, stun: 0.55 }, { count: 3, spread: 0.7, dmg: 450, stun: 0.5 }] },
    'Carantoña': { kind: 'disguise', engine: 'phantom', type: 'fairy', pal: 'gold', range: 460, hide: 0.5, radius: 120, dmg: 900, stun: 0.3, hits: 3, d: 'se esconde bajo su disfraz, aparece junto al rival y le da tres golpes' },
    'Rayo Hielo': { kind: 'icebeam', engine: 'megabeam', type: 'ice', pal: 'aurora', range: 520, width: 70, charge: 0.4, dur: 0.7, dmg: 1600, stun: 0.25, frost: true, d: 'un rayo de hielo que congela lo que toca y deja el suelo helado' },
    'Día de Pago': { kind: 'payday', type: 'normal', pal: 'gold', count: 10, spread: 1.1, range: 340, speed: 600, dmg: 240, r: 12, bounces: 1, d: 'una lluvia de monedas que rebotan en los muros' },
    'Patada Ígnea': { kind: 'blazekick', type: 'fire', pal: 'sun', range: 320, time: 0.26, dmg: 1300, stun: 0.6, boom: 500, d: 'una patada en llamas que cruza la zona, deja fuego y explota al final' },
    'Garra Dragón': { kind: 'dragonclaw', type: 'dragon', pal: 'dragon', range: 220, radius: 110, count: 3, every: 0.16, dmg: 600, d: 'tres zarpazos gigantes de dragón seguidos' },
  };
  // qué especie usa cada uno (número de Pokédex: así no depende del idioma)
  const SPECIAL_DEX = {
    25: 'Impactrueno', 4: 'Ascuas', 6: 'Lanzallamas', 59: 'Lanzallamas', 133: 'Rapidez', 197: 'Pulso Umbrío', 700: 'Fuerza Lunar',
    94: 'Bola Sombra', 448: 'Esfera Aural', 149: 'Hiperrayo', 7: 'Pistola Agua', 9: 'Hidrobomba', 129: 'Salpicadura', 130: 'Hidrobomba',
    658: 'Shuriken de Agua', 39: 'Canto', 282: 'Psíquico', 248: 'Triturar', 1: 'Látigo Cepa', 778: 'Carantoña', 131: 'Rayo Hielo',
    52: 'Día de Pago', 257: 'Patada Ígnea', 445: 'Garra Dragón',
  };
  const specialCache = {};
  function makeSpecial(name) {
    if (specialCache[name]) return specialCache[name];
    const { d, ...sp } = SPECIAL[name];
    const look = { shape: PB.VFX.forType(sp.type).proj, trail: TRAIL[sp.type] || 'spark', scale: 1.6 };
    return (specialCache[name] = Object.assign({ name: PB.TM(name), special: true, desc: PB.T(d) }, sp, { look }));
  }
  // Súper especial de una fase: el de esa especie o el de la fase anterior más cercana que lo tenga;
  // si ninguna lo tiene, el primero de la familia (en cualquier rama), para que la familia entera lo use
  function specialFor(line, stage, alts) {
    for (let s = Math.min(stage, line.length - 1); s >= 0; s--) if (SPECIAL_DEX[line[s]]) return makeSpecial(SPECIAL_DEX[line[s]]);
    for (const l of alts || [line]) for (const d of l) if (SPECIAL_DEX[d]) return makeSpecial(SPECIAL_DEX[d]);
    return null;
  }

  // Formas del ataque básico. Cada una reparte el mismo daño total que el papel, pero de otra manera.
  // t = daño total de un ataque del papel (balas × daño), r = la plantilla del papel
  const STYLE = {
    cone: (t, r) => ({ kind: 'spread', count: 7, spread: 0.95, range: Math.round(r.range * 1.1), speed: 480, dmg: t / 7 * 0.92, r: 12, scale: 0.9, d: 'Una llamarada corta en abanico.' }),
    burst3: (t, r) => ({ kind: 'burst', count: 3, delay: 0.1, range: r.range, speed: 860, dmg: t / 3, r: 11, scale: 1 }),
    orb: (t, r) => ({ kind: 'spread', count: 1, spread: 0, range: r.range, speed: 540, dmg: t * 1.05, r: 25, pierce: true, scale: 1.8 }),
    homing: (t, r) => ({ kind: 'spread', count: 1, spread: 0, range: Math.round(r.range * 1.05), speed: 560, dmg: t * 0.72, r: 16, homing: 2.8, scale: 1.4 }),
    melee: (t, r) => ({ kind: 'melee', range: r.count > 3 ? 160 : 150, arc: 2.0, dmg: t * 1.32, scale: 1 }),
    twin: (t, r) => ({ kind: 'twin', gap: 13, range: r.range, speed: 720, dmg: t / 2, r: 12, scale: 1.1 }),
    boomer: (t, r) => ({ kind: 'spread', count: 1, spread: 0, range: Math.round(r.range * 0.85), speed: 620, dmg: t * (r.count > 3 ? 0.68 : 0.78), r: 18, boomerang: true, pierce: true, scale: 1.6 }),
    // --- formas nuevas (v1.3) ---
    // rociada: muchos perdigones algo desordenados (de cerca entran casi todos)
    spray: (t, r) => ({ kind: 'spread', count: 9, spread: 0.75, jitter: 0.12, speedVar: 0.25, range: Math.round(r.range * 0.8), speed: 640, dmg: t / 9, r: 8, scale: 0.75 }),
    // lanza: fina, muy rápida y atraviesa
    lance: (t, r) => ({ kind: 'spread', count: 1, spread: 0, range: Math.round(r.range * 1.1), speed: 1150, dmg: t * 0.95, r: 13, pierce: true, scale: 1.2, shape: 'needle' }),
    // se parte en tres al chocar o al acabar su recorrido
    split: (t, r) => ({ kind: 'spread', count: 1, spread: 0, range: Math.round(r.range * 0.85), speed: 640, dmg: t * 0.68, r: 18, scale: 1.5, split: { count: 3, spread: 0.7, dmg: t * 0.3, range: Math.round(r.range * 0.5), speed: 680, r: 12 } }),
    // rebota una vez en los muros
    bounce: (t, r) => ({ kind: 'spread', count: 1, spread: 0, range: Math.round(r.range * 1.25), speed: 760, dmg: t * 0.9, r: 14, bounces: 1, scale: 1.3 }),
    // avanza haciendo eses
    sine: (t, r) => ({ kind: 'spread', count: 1, spread: 0, range: r.range, speed: 560, dmg: t * 0.95, r: 20, sine: 0.45, sineF: 13, scale: 1.5 }),
    // onda corta y ancha (como la ola del súper, pero pequeña y se para en los muros)
    ripple: (t, r) => ({ kind: 'spread', count: 1, spread: 0, ripple: 90, range: Math.round(r.range * 0.8), speed: 520, dmg: t * 0.85, r: 14, pierce: true, knockback: 120, scale: 1 }),
    // golpe que da la vuelta entera
    spin: (t, r) => ({ kind: 'melee', range: 145, arc: Math.PI * 2, dmg: t * 1.08, scale: 1 }),
    // láser instantáneo y estrecho
    laser: (t, r) => ({ kind: 'laser', range: Math.round(r.range * 1.05), width: 20, delay: 0.12, dmg: t * 0.84 }),
    // lanzadores: estalla en el centro y luego en tres trozos alrededor
    cluster: (t, r) => ({ kind: 'lob', range: r.range, flight: r.flight, radius: 46, dmg: t * 0.7, cluster: { count: 3, dist: 72, radius: 42, dmg: t * 0.3 }, scale: 1.3 }),
    // lanzadores: menos golpe, pero deja un charco que daña un rato
    puddle: (t, r) => ({ kind: 'lob', range: r.range, flight: r.flight, radius: r.radius, dmg: t * 0.7, puddle: { radius: 70, duration: 2.5, dps: t * 0.22 }, scale: 1.4 }),
  };
  // qué papeles pueden usar cada forma (un tanque no dispara con lanza, un francotirador no gira...)
  const STYLE_ROLES = {
    cone: ['tank', 'fighter'], burst3: ['assassin', 'fighter', 'sniper'], orb: ['sniper', 'fighter', 'tank'],
    homing: ['sniper', 'fighter'], melee: ['tank', 'assassin', 'fighter'], twin: ['fighter', 'assassin', 'sniper'],
    boomer: ['fighter', 'assassin', 'tank'], spray: ['tank', 'fighter'], lance: ['sniper', 'assassin'],
    split: ['fighter', 'sniper', 'tank'], bounce: ['fighter', 'sniper', 'assassin'], sine: ['fighter', 'sniper'],
    ripple: ['tank', 'fighter'], spin: ['tank', 'fighter', 'assassin'], laser: ['sniper', 'fighter'],
    cluster: ['thrower'], puddle: ['thrower'],
  };
  // ataques básicos de cada tipo: [forma, nombre]. Cada Pokémon coge, según su id, uno de los que valen
  // para su papel o el disparo normal de su papel con el nombre básico del tipo (como los súper).
  const STYLE_OF = {
    normal: [['burst3', 'Ataque Rápido'], ['spin', 'Giro Rápido'], ['twin', 'Doble Bofetón'], ['ripple', 'Eco Voz'], ['split', 'Bomba Huevo']],
    fire: [['cone', 'Lanzallamas'], ['melee', 'Puño Fuego'], ['spin', 'Rueda Fuego'], ['split', 'Pirotecnia'], ['orb', 'Llamarada']],
    water: [['cone', 'Burbuja'], ['ripple', 'Hidropulso'], ['melee', 'Acua Cola'], ['spray', 'Escaldar'], ['lance', 'Shuriken de Agua']],
    grass: [['boomer', 'Hoja Mágica'], ['spray', 'Semilladora'], ['split', 'Bomba Germen'], ['orb', 'Energibola']],
    electric: [['burst3', 'Chispa'], ['laser', 'Rayo Carga'], ['melee', 'Puño Trueno'], ['sine', 'Chispazo']],
    ice: [['twin', 'Canto Helado'], ['lance', 'Carámbano'], ['spray', 'Nieve Polvo'], ['melee', 'Colmillo Hielo'], ['laser', 'Rayo Aurora']],
    fighting: [['melee', 'Golpe Kárate'], ['spin', 'Patada Giro'], ['lance', 'Onda Vacío'], ['burst3', 'Ultrapuño']],
    poison: [['orb', 'Bomba Lodo'], ['spray', 'Ácido'], ['split', 'Bomba Ácida'], ['melee', 'Puya Nociva']],
    ground: [['boomer', 'Hueso Palo'], ['ripple', 'Terratemblor'], ['spray', 'Ataque Arena'], ['cluster', 'Tierra Viva'], ['puddle', 'Bomba Fango']],
    flying: [['twin', 'Picotazo'], ['ripple', 'Viento Cortante'], ['lance', 'Tajo Aéreo'], ['melee', 'Ataque Ala'], ['homing', 'Golpe Aéreo']],
    psychic: [['homing', 'Psicorrayo'], ['orb', 'Confusión'], ['sine', 'Paranormal'], ['lance', 'Psicocorte']],
    bug: [['twin', 'Doble Ataque'], ['spray', 'Pin Misil'], ['melee', 'Megacuerno'], ['boomer', 'Ida y Vuelta'], ['sine', 'Doble Rayo']],
    rock: [['cluster', 'Tumba Rocas'], ['lance', 'Joya de Luz'], ['split', 'Roca Afilada'], ['melee', 'Testarazo']],
    ghost: [['orb', 'Bola Sombra'], ['melee', 'Garra Umbría'], ['sine', 'Infortunio'], ['lance', 'Sombra Vil']],
    dragon: [['melee', 'Garra Dragón'], ['spin', 'Ciclón'], ['twin', 'Dracoflechas'], ['cone', 'Furia Dragón']],
    dark: [['melee', 'Mordisco'], ['homing', 'Finta'], ['spray', 'Alarido'], ['sine', 'Juego Sucio']],
    steel: [['twin', 'Bala Bala'], ['bounce', 'Disparo Espejo'], ['melee', 'Cola Férrea'], ['burst3', 'Puño Bala']],
    fairy: [['homing', 'Beso Drenaje'], ['ripple', 'Voz Cautivadora'], ['sine', 'Viento Feérico'], ['bounce', 'Brillo Mágico']],
  };
  // Set "Clásico": ataques básicos de la v1.2 (qué forma usaba cada tipo según su papel). El súper clásico es
  // uno de los dos primeros de KIT (los de la v1.2) según el papel, o su súper propio de SIGNATURE.
  const CLASSIC_STYLE_OF = {
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

  // ataques básicos nuevos puestos a mano: [forma, nombre, tipo] (movimientos que ese Pokémon aprende en los juegos)
  const BASIC_NEW = { zeraora: ['melee', 'Cuchillada', 'normal'], slakoth: ['melee', 'Golpe Cuerpo', 'normal'] };
  // -> [forma (null = la del papel), nombre]
  const pickBasic = (type, roleId, id, avoid) => {
    const kit = KIT[type] || KIT.normal;
    const opts = [[null, kit.basic]].concat((STYLE_OF[type] || []).filter(([st]) => STYLE_ROLES[st].includes(roleId)));
    let i = hashId(id + ':basic:' + type) % opts.length;
    if (opts[i][1] === avoid && opts.length > 1) i = (i + 1) % opts.length; // no repetir el clásico
    return opts[i];
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

  // Ajustes de equilibrio a mano (set nuevo). kind: solo si el movimiento es de esa forma; dmg: multiplica el daño
  const TUNE = {
    deoxys: { atk: { kind: 'spread', range: 280, dmg: 0.92 } }, // Psicocorte llegaba demasiado lejos
    zapdos: { sup: { kind: 'storm', radius: 320 } },
    zeraora: { atk: { kind: 'melee', dmg: 0.88 }, sup: { kind: 'storm', count: 6 } },
    rayquaza: { sup: { kind: 'comet', range: 330 } },
    snivy: { atk: { dmg: 0.9 }, sup: { kind: 'orbit', dmg: 0.85 } },
    hoopa: { atk: { dmg: 0.9 }, sup: { kind: 'phantom', range: 380, dmg: 0.87 } },
  };
  function tune(id, which, mv) {
    const t = TUNE[id] && TUNE[id][which];
    if (!t || (t.kind && t.kind !== mv.kind)) return mv;
    const o = Object.assign({}, mv);
    for (const k in t) if (k !== 'kind' && k !== 'dmg') o[k] = t[k];
    if (t.dmg && o.dmg) o.dmg = Math.round((o.dmg * t.dmg) / 10) * 10;
    return o;
  }

  // typesOverride: para cuando un Pokémon con ramas evoluciona y cambia de tipo (Eevee -> Flareon)
  // classic: el set de movimientos de la v1.2 (sin súper de legendarios ni especiales, ataques de CLASSIC_STYLE_OF)
  function build(fam, typesOverride, classic) {
    const line = fam.line;
    const base = PB.DEX[line[0]], fin = PB.DEX[line[line.length - 1]];
    const types = (typesOverride || base.types).slice();
    const atkType = attackType(types);
    const roleId = roleOf(fin, atkType);
    const R = ROLE[roleId];
    // Tipo de cada movimiento (es el que cuenta para la eficacia). Con dos tipos, cada set lleva uno distinto:
    //  - ataque básico: el clásico es del tipo de ataque; el nuevo, del otro tipo (Rayquaza: Garra Dragón / uno Volador)
    //  - súper: el clásico es del segundo tipo (como en la v1.2); el nuevo, del otro
    const other = types.find((t) => t !== atkType); // el otro tipo, también Normal (Pidgey: Volador y Normal)
    const fixed = !classic && BASIC_NEW[fam.id];
    const basicType = classic ? atkType : fixed ? fixed[2] : other || atkType;
    const look = { shape: PB.VFX.forType(basicType).proj, trail: TRAIL[basicType] || 'spark' };
    const second = types.find((t) => t !== atkType && t !== 'normal' && KIT[t]);
    const leg = typesOverride || classic ? null : LEGEND[fam.id];
    const sig = leg || (typesOverride || !classic ? null : SIGNATURE[fam.id]);
    const classicSupType = second || atkType;
    const supType = sig ? sig[2] : !classic && !typesOverride && SUPER_NEW[fam.id] ? SUPER_NEW[fam.id][2] : classic ? classicSupType : classicSupType === atkType ? other || atkType : atkType;
    const classicSup = () => (KIT[supType] || KIT.normal).sup[roleId === 'assassin' || roleId === 'thrower' || roleId === 'tank' ? 1 : 0];
    const sNew = !classic && !typesOverride && SUPER_NEW[fam.id];
    const sigC = typesOverride ? null : SIGNATURE[fam.id]; // súper del set clásico, si es propio (para no repetirlo en el nuevo)
    const [supKind, supName, supTweak] = sig ? [sig[0], sig[1], leg ? Object.assign({ legend: true }, sig[3]) : null] : sNew ? sNew.slice(0, 2) : classic ? classicSup() : pickSuper(supType, fam.id, sigC ? sigC[1] : supType === classicSupType ? classicSup()[1] : null);
    const supLook = { shape: PB.VFX.forType(supType).proj, trail: TRAIL[supType] || 'spark' };
    // pequeñas diferencias según sus stats (±10 %), compensadas para que nadie sea mejor en todo
    const zBulk = clamp(((fin.hp - 105) / 8 + (fin.df + fin.sd - 158) / 35) / 2, -1.5, 1.5);
    const zSpd = clamp((fin.spd - 110) / 10, -1.5, 1.5);
    const zAtk = clamp((Math.max(fin.pa, fin.sa) - 1.2) / 0.12, -1.5, 1.5);
    // el que tiene más vida pega menos y el que tiene menos vida pega más (±15 %), con un toque de su ataque
    const hpMul = 1 + 0.1 * zBulk;
    const dmgMul = (1 + 0.03 * zAtk) / hpMul;
    // forma del ataque básico según tipo y papel
    const classicPk = (CLASSIC_STYLE_OF[atkType] || {})[roleId] || [null, (KIT[atkType] || KIT.normal).basic];
    const pk = classic ? classicPk : fixed ? [fixed[0], fixed[1]] : pickBasic(basicType, roleId, fam.id, classicPk[1]);
    const st = pk[0] ? pk : null;
    const total = R.atk.dmg * (R.atk.count || 1);
    const { scale: as, d: _d, shape: ashape, ...atk } = st ? STYLE[st[0]](total, R.atk) : R.atk;
    const basicName = pk[1];
    const { d: sd, scale: ss, ...sup } = Object.assign({}, leg ? LEGEND_KIND[supKind] : SUPER[supKind], supTweak);
    const rarity = fam.leg ? 'legendary' : STARTERS.has(line[0]) ? 'starter' : fin.bst > 530 ? 'epic' : fin.bst > 470 ? 'rare' : 'common';
    // los de corto alcance (cuerpo a cuerpo y llamaradas en abanico) tienen que acercarse: algo más de vida y velocidad;
    // los cuerpo a cuerpo, además, cargan antes el súper
    const close = atk.kind === 'melee' ? 2 : (atk.range || 999) < 250 ? 1 : 0;
    const closeHp = [1, 1.08, 1.14][close], closeSpd = [0, 6, 12][close];
    return {
      id: fam.id, dex: line[0], line, name: base.name, types, atkType, gen: base.gen,
      roleId, role: PB.T(R.name),
      hp: Math.round((R.hp * hpMul * closeHp) / 50) * 50,
      speed: Math.round(R.speed + zSpd * 5 + closeSpd),
      reload: R.reload, superHits: R.superHits - (close === 2 ? 1 : 0),
      attack: (classic ? (x) => x : (x) => tune(fam.id, 'atk', x))(Object.assign({ name: PB.TM(basicName), style: st ? st[0] : roleId, type: basicType }, atk, { dmg: Math.round((atk.dmg * dmgMul) / 10) * 10, look: Object.assign({ scale: as }, look, ashape ? { shape: ashape } : {}) })),
      super: (classic ? (x) => x : (x) => tune(fam.id, 'sup', x))(Object.assign({ name: PB.TM(supName), type: supType }, sup, sup.dmg ? { dmg: Math.round((sup.dmg * dmgMul) / 10) * 10 } : {}, sup.dps ? { dps: Math.round(sup.dps * dmgMul) } : {}, { look: Object.assign({ scale: ss || 1.4 }, supLook), desc: PB.T(sd) })),
      descBase: PB.T(TRAIT[roleId]) + ' ' + PB.T(ATK_DESC[st ? st[0] : roleId]), // sin el súper (la ficha lo explica aparte)
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
      role: PB.T(h.role), desc: PB.T(h.desc), descBase: PB.T(h.desc).split('. ')[0].replace(/\.?$/, '.'), name: PB.DEX[b.dex].name,
      // con dos tipos, el ataque nuevo es del otro tipo (Bulbasaur: uno de Veneno); el de la v1.2 queda como clásico
      attack: b.types.length > 1 ? b.attack : Object.assign({}, h.attack, { name: PB.TM(h.attack.name) }),
      // con dos tipos y sin súper clásico propio, el súper nuevo es del otro tipo (Geodude: Roca; el clásico, Magnitud de Tierra)
      super: b.types.length > 1 && !SIGNATURE[fam.id] ? b.super : Object.assign({}, h.super, { name: PB.TM(h.super.name) }),
    }) : b;
  }).map((def) => {
    // súper especial de su primera fase (Pikachu, Charmander, Eevee...)
    const sp = specialFor(def.line, 0, def.alts);
    if (!sp) return def;
    const what = sp.desc;
    const head = def.desc.split(PB.T('Súper:'))[0];
    return Object.assign({}, def, { super: sp, desc: head.trimEnd() + ' ' + PB.T('Súper: {name} ({type}), {what}.', { name: sp.name, type: PB.T(PB.TYPE_INFO[sp.type].name), what }) });
  });
  // Sets de movimientos: cada Pokémon puede llevar su ataque y su súper "nuevos" (v1.3) o los "clásicos" (v1.2).
  // kit = { atk: 'nuevo' | 'clasico', sup: 'nuevo' | 'clasico' }. Solo hay elección si son distintos.
  // movimientos clásicos de una fase (los 6 hechos a mano tienen los suyos en todas las fases)
  function classicMoves(id, line, stage, alts) {
    const h = hand[id];
    if (h) {
      const sig = SIGNATURE[id] ? build({ id, line, alts }, null, true).super : null; // súper clásico de otro tipo (Bulbasaur, Gastly)
      return { attack: Object.assign({}, h.attack, { name: PB.TM(h.attack.name) }), super: sig || Object.assign({}, h.super, { name: PB.TM(h.super.name) }) };
    }
    const types = PB.DEX[line[stage]].types, base = PB.DEX[line[0]].types;
    const c = build({ id, line, alts }, alts && types.join() !== base.join() ? types : null, true);
    return { attack: c.attack, super: c.super };
  }
  const sameMove = (a, b) => a.name === b.name && a.kind === b.kind && (a.style || '') === (b.style || '') && (a.count || 1) === (b.count || 1);
  for (const def of PB.BRAWLERS) {
    const c = classicMoves(def.id, def.line, 0, def.alts);
    def.classic = c; // para la ficha y para saber si hay elección
    def.kitChoice = { atk: !sameMove(c.attack, def.attack), sup: !sameMove(c.super, def.super) };
  }
  PB.KIT_DEFAULT = { atk: 'nuevo', sup: 'nuevo' };
  // Skins regionales: el Pokémon con esa forma tiene sus tipos regionales y puede elegir ataque y súper de ellos
  // (tercera opción del set: 'region'). Tipos de la forma de esa fase o, si esa fase no tiene, de la primera que la tenga.
  PB.REGIONS = ['alola', 'galar', 'hisui', 'paldea'];
  PB.regionTypes = (line, stage, reg) => {
    if (!reg || !PB.FORMS || !PB.REGIONS.includes(reg)) return null;
    const f = PB.FORMS[line[stage] + '-' + reg] || line.map((dx) => PB.FORMS[dx + '-' + reg]).find((x) => x && x.types);
    return f && f.types ? f.types : null;
  };
  const regionCache = {};
  PB.regionMoves = (def, line, stage, reg) => {
    const types = PB.regionTypes(line, stage, reg);
    if (!types) return null;
    const key = def.id + ':' + line.join('-') + ':' + stage + ':' + reg;
    if (!regionCache[key]) {
      const nb = build({ id: def.id, line, alts: def.alts }, types);
      regionCache[key] = { attack: nb.attack, super: nb.super, types };
    }
    return regionCache[key];
  };
  // kit de confianza (llega de la red o del guardado): 'nuevo', 'clasico' o 'region' (+ reg: la región de la skin)
  PB.validKit = (id, k) => {
    const v = (x) => (x === 'clasico' || x === 'region' ? x : 'nuevo');
    const out = { atk: k ? v(k.atk) : 'nuevo', sup: k ? v(k.sup) : 'nuevo' };
    if (out.atk === 'region' || out.sup === 'region') {
      if (k && PB.REGIONS.includes(k.reg)) out.reg = k.reg;
      else { if (out.atk === 'region') out.atk = 'nuevo'; if (out.sup === 'region') out.sup = 'nuevo'; }
    }
    return out;
  };
  // los bots eligen al azar entre los dos sets, así hay Pokémon iguales con movimientos distintos
  PB.randomKit = (id) => {
    const d = PB.brawlerById(id);
    return { atk: d && d.kitChoice.atk && Math.random() < 0.5 ? 'clasico' : 'nuevo', sup: d && d.kitChoice.sup && Math.random() < 0.5 ? 'clasico' : 'nuevo' };
  };

  const byId = {};
  for (const b of PB.BRAWLERS) byId[b.id] = b;
  PB.brawlerById = (id) => byId[id];

  // Al evolucionar por una rama que cambia de tipo (Eevee -> Jolteon, Ralts -> Gallade...),
  // sus ataques pasan a ser los de su nuevo tipo y su nuevo papel. La vida no cambia aquí (la sube la evolución).
  // También cambia el súper si esa fase tiene un súper especial distinto (Charmeleon -> Charizard: Ascuas -> Lanzallamas).
  PB.retype = (def, line, stage, kit) => {
    const types = PB.DEX[line[stage]].types;
    let n = def;
    if (def.alts && types.join() !== PB.DEX[line[0]].types.join()) {
      const nb = build({ id: def.id, line, alts: def.alts }, types);
      n = Object.assign({}, def, {
        atkType: nb.atkType, attack: nb.attack, super: nb.super, roleId: nb.roleId, role: nb.role,
        speed: nb.speed, reload: nb.reload, superHits: nb.superHits, desc: nb.desc, descBase: nb.descBase,
      });
    }
    let sp = specialFor(line, stage, def.alts);
    // rama que cambia de tipo sin súper especial propio (Eevee -> Vaporeon): usa un súper de su nuevo tipo, no el heredado
    if (sp && n !== def && !SPECIAL_DEX[line[stage]]) sp = null;
    if (sp && sp.name !== n.super.name) n = Object.assign({}, n, { super: sp });
    // set de movimientos elegido (kit): el clásico cambia el ataque y/o el súper por los de la v1.2
    if (kit && (kit.atk === 'clasico' || kit.sup === 'clasico')) {
      const c = classicMoves(def.id, line, stage, def.alts);
      n = Object.assign({}, n, kit.atk === 'clasico' && def.kitChoice && def.kitChoice.atk ? { attack: c.attack } : {}, kit.sup === 'clasico' && def.kitChoice && def.kitChoice.sup ? { super: c.super } : {});
    }
    // ataque y/o súper del tipo de su forma regional (con la skin puesta)
    if (kit && kit.reg && (kit.atk === 'region' || kit.sup === 'region')) {
      const r = PB.regionMoves(def, line, stage, kit.reg);
      if (r) n = Object.assign({}, n, kit.atk === 'region' ? { attack: r.attack } : {}, kit.sup === 'region' ? { super: r.super } : {});
    }
    return n;
  };

  // ---------------------------------------------------------------- evolución
  // Fases: las líneas de 3 evolucionan dos veces (+12 % cada vez); las de 2, una vez con un salto mayor (+22 %).
  PB.EVO = {
    xp3: [55, 125], // EXP total para la 2ª y 3ª fase (antes 70/165: la mitad no llegaba a la última fase)
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
  // Megaevolución: una barra aparte que se llena desde el principio (haciendo daño y K.O.) pero solo se puede usar
  // en la última fase: así los que evolucionan más veces no van por detrás de los que no evolucionan.
  // Al usarla, unos segundos más fuerte; los que tienen sprite de mega cambian de forma, los demás llevan un aura.
  PB.MEGA = {
    time: 7, // segundos que dura
    perHit: 0.8, // por cada golpe que carga el súper, dividido entre los golpes que necesita (= algo más de 1 súper)
    perKO: 0.25,
    passive: 0.008, // por segundo
    // y aun así la primera les cuesta más a los que tienen menos evoluciones (1, 2 o 3 fases)
    first: [1.8, 1.5, 1],
    dmg: 1.25, // daño que haces
    taken: 0.8, // daño que recibes
    speed: 1.12,
  };
  PB.TF_TIME = 8; // segundos que dura la Transformación de Ditto
  // Ficha de un Pokémon transformado (Ditto): ataques, súper, velocidad y tipo del rival, pero su propia línea
  // (para la fuerza por fase) y su vida
  PB.tfDef = (base, tf) => {
    const t = PB.retype(PB.brawlerById(tf.id), tf.line, tf.stage, tf.kit); // (con el set de movimientos del rival)
    return Object.assign({}, t, { id: base.id, line: base.line, alts: base.alts, name: base.name, rarity: base.rarity, hp: base.hp, superHits: t.superHits });
  };
  PB.EVO_ANIM = 0.8; // duración de la animación de evolución (s)
  PB.EVO_REVEAL = 0.3; // cuando quedan estos segundos se ve la forma nueva
  PB.evoSteps = (def) => (def.line.length >= 3 ? PB.EVO.xp3 : def.line.length === 2 ? PB.EVO.xp2 : []);
  PB.stageMul = (def, stage) => (def.line.length >= 3 ? PB.EVO.mul3 : def.line.length === 2 ? PB.EVO.mul2 : PB.EVO.mul1)[stage] || 1;
  // `o` puede ser la ficha (def) o el luchador de la partida (b.line es la rama que eligió: Eevee -> Jolteon...)
  PB.stageName = (o, stage) => (PB.DEX[o.line[stage]] || PB.DEX[o.line[0]]).name;
  PB.stageTypes = (o, stage) => (PB.DEX[o.line[stage]] || PB.DEX[o.line[0]]).types;
})();
