// Versión del juego y notas de parche. Al publicar una actualización con novedades:
// sube PB.VERSION y añade su nota ARRIBA del todo en PB.PATCH_NOTES (la primera es la que se enseña).
// Cada jugador la ve una sola vez al entrar a la lobby (se guarda en localStorage 'pb.seenVersion').
PB.VERSION = '1.1';

PB.PATCH_NOTES = [
  {
    v: '1.1',
    date: '22/10/2026',
    es: {
      title: 'Novedades de la versión 1.1',
      items: [
        ['🗺️', 'Mapas nuevos: ahora cada modo tiene varios mapas y cada partida se juega en uno al azar.'],
        ['🍂', 'Nuevos ambientes: otoño, nieve y desierto, con vallas, barriles, cactus, pinos y flores.'],
        ['🎃', '¡Mapas de Halloween en todos los modos! Solo hasta el 7 de noviembre.'],
        ['🔧', 'Atrapa Pokéballs: el centro del mapa ya no es un embudo, ahora se puede entrar por varios sitios.'],
        ['🎲', 'Modo Aleatorio y contador de jugadores en cada modo, para jugar más con gente real.'],
        ['⚽', 'Los bots se pasan el Voltorb y juegan mejor en Atrapa Pokéballs.'],
        ['✨', 'Golpes, súper y evoluciones con más impacto, y sonidos nuevos.'],
      ],
    },
    en: {
      title: "What's new in version 1.1",
      items: [
        ['🗺️', 'New maps: every mode now has several maps and each match uses a random one.'],
        ['🍂', 'New themes: autumn, snow and desert, with fences, barrels, cacti, pines and flowers.'],
        ['🎃', 'Halloween maps in every mode! Only until November 7th.'],
        ['🔧', 'Catch Pokéballs: the middle of the map is no longer a bottleneck, there are several ways in.'],
        ['🎲', 'Random mode and a player counter on each mode, so you play with real people more often.'],
        ['⚽', 'Bots now pass the Voltorb and play smarter in Catch Pokéballs.'],
        ['✨', 'Hits, supers and evolutions feel stronger, plus new sounds.'],
      ],
    },
  },
];
