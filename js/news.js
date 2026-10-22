// Versión del juego y notas de parche. Al publicar una actualización con novedades:
// sube PB.VERSION y añade su nota ARRIBA del todo en PB.PATCH_NOTES (la primera es la que se enseña).
// Cada jugador la ve una sola vez al entrar a la lobby (se guarda en localStorage 'pb.seenVersion').
PB.VERSION = '1.3';

PB.PATCH_NOTES = [
  {
    v: '1.3',
    date: '23/10/2026',
    es: {
      title: 'Novedades de la versión 1.3',
      items: [
        ['👯', '¡Nuevo modo Niebla Tóxica Dúo! 5 parejas, la niebla cierra el mapa y gana la última pareja en pie. Puedes jugarlo con un amigo de tu sala.'],
        ['⚔️', '¡Nuevo modo Duelo de Equipos! 3 contra 3 a lo bestia: gana el primer equipo en llegar a 15 K.O.'],
        ['☠️', '¡Nuevo modo Eliminación! 3 contra 3 sin reaparecer, al mejor de 3 rondas.'],
        ['🎤', 'Notas de voz en el chat general: graba hasta 6 segundos y mándalo a todos.'],
        ['🎁', 'Las Pokéballs cambian de color con cada toque según lo raro que sea el Pokémon que traen.'],
        ['⚖️', 'Súper más equilibradas, más Puntos Pokémon, y perder ya quita copas.'],
        ['📜', 'En «Novedades» ahora puedes ver las notas de todas las versiones.'],
        ['🔧', 'Si alguien de tu grupo vuelve a la sala al acabar, volvéis todos juntos.'],
      ],
    },
    en: {
      title: "What's new in version 1.3",
      items: [
        ['👯', 'New mode: Toxic Fog Duo! 5 pairs, the fog closes in and the last pair standing wins. Play it with a friend from your room.'],
        ['⚔️', 'New mode: Team Duel! All-out 3v3: first team to 15 KOs wins.'],
        ['☠️', 'New mode: Knockout! 3v3 with no respawns, best of 3 rounds.'],
        ['🎤', 'Voice notes in the global chat: record up to 6 seconds and send it to everyone.'],
        ['🎁', 'Pokéballs change color with every tap depending on how rare the Pokémon inside is.'],
        ['⚖️', 'More balanced supers, more Pokémon Points, and losing now costs trophies.'],
        ['📜', 'In «What’s new» you can now read the notes of every version.'],
        ['🔧', 'If someone in your group goes back to the room after a match, everyone goes back together.'],
      ],
    },
  },
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
  {
    v: '1.0',
    date: '21/10/2026',
    es: {
      title: '¡Lanzamiento de PokéVersus!',
      items: [
        ['🎉', 'Combates 3 contra 3 con Pokémon, gratis en el navegador, en PC y en móvil.'],
        ['🎮', 'Cinco modos: Atrapa Pokéballs, Niebla Tóxica, Despierta a Snorlax, Voltorbol y Territorio.'],
        ['⭐', 'Casi 500 Pokémon que evolucionan durante la partida, con niveles, copas y skins shiny.'],
        ['🌐', 'Partidas online con gente real, salas con amigos, clanes y ranking.'],
        ['🎁', 'Pokéballs con premios, misiones diarias y un pase de temporada gratis.'],
      ],
    },
    en: {
      title: 'PokéVersus is out!',
      items: [
        ['🎉', '3v3 Pokémon battles, free in your browser, on PC and mobile.'],
        ['🎮', 'Five modes: Catch Pokéballs, Toxic Fog, Wake Snorlax, Voltorb Ball and Territory.'],
        ['⭐', 'Almost 500 Pokémon that evolve during the match, with levels, trophies and shiny skins.'],
        ['🌐', 'Online matches with real people, rooms with friends, clans and rankings.'],
        ['🎁', 'Pokéball rewards, daily missions and a free season pass.'],
      ],
    },
  },
];
