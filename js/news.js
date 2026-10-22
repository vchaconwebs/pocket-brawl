// Versión del juego y notas de parche. Al publicar una actualización con novedades:
// sube PB.VERSION y añade su nota ARRIBA del todo en PB.PATCH_NOTES (la primera es la que se enseña).
// Cada jugador la ve una sola vez al entrar a la lobby (se guarda en localStorage 'pb.seenVersion').
PB.VERSION = '1.2';

PB.PATCH_NOTES = [
  {
    v: '1.2',
    date: '22/10/2026',
    es: {
      title: 'Novedades de la versión 1.2',
      items: [
        ['💬', '¡Chat general en la lobby! Habla en tiempo real con todos los que están en línea.'],
        ['👥', 'Chat de grupo: habla solo con los de tu sala mientras preparáis la partida.'],
        ['🤝', 'Toca el nombre de alguien en el chat para añadirle como amigo o invitarle a jugar contigo.'],
        ['🗨️', 'Chat dentro de las partidas, con mensajes rápidos (¡GG!, ¡Ayuda!...) y bocadillos encima de los Pokémon.'],
        ['⚽', 'Voltorbol: si acaba en empate, ¡gol de oro! Se rompe todo el campo y quien marque gana.'],
        ['🌈', 'Muchas más Monedas Arcoíris: ahora también se ganan al jugar, aunque pierdas.'],
        ['🔧', 'Hemos arreglado un montón de bugs: súper que a veces no salían, golpes que se perdían, líneas de apuntado que no marcaban bien el alcance, la bandera del revés en el equipo rojo y mucho más.'],
      ],
    },
    en: {
      title: "What's new in version 1.2",
      items: [
        ['💬', 'Global chat in the lobby! Talk in real time with everyone online.'],
        ['👥', 'Group chat: talk only with your party while you get ready.'],
        ['🤝', 'Tap someone’s name in the chat to add them as a friend or invite them to play.'],
        ['🗨️', 'In-match chat with quick messages (GG!, Help!...) and speech bubbles over the Pokémon.'],
        ['⚽', 'Voltorb Ball: a tie now goes to golden goal! The field breaks open and the next goal wins.'],
        ['🌈', 'Way more Rainbow Coins: you now earn them by playing, even when you lose.'],
        ['🔧', 'We fixed loads of bugs: supers that sometimes didn’t fire, lost hits, aim lines that showed the wrong range, the upside-down flag on the red team and much more.'],
      ],
    },
  },
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
