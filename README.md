# Pocket Brawl (nombre provisional)

Fangame de combates estilo Brawl Stars con Pokémon, en el navegador.

## Modos

| Modo | Reglas |
|---|---|
| **Atrapa Pokéballs** | 3v3. Consigue 10 Pokéballs de la máquina central y aguanta 15 s. |
| **Niebla Tóxica** | Todos contra todos (10). Rompe cajas para conseguir Caramelos Raros (+10 % vida y daño). La niebla cierra el mapa. Gana el último en pie. |
| **Despierta a Snorlax** | 3v3. Protege a tu Snorlax dormido y despierta (debilita) al rival. Si se acaba el tiempo, gana quien conserve más vida. |
| **Voltorbol** | 3v3. Mete el Voltorb en la portería rival; gana quien marque 2 goles. Si lo llevas más de 10 s, explota. |
| **Territorio** | 3v3. Controla la zona central sin enemigos dentro; gana quien llegue antes al 100 %. |
Hecho como PokéSurvivor: JavaScript puro + Canvas 2D, sin dependencias ni paso de compilación.

**Fangame gratuito y sin ánimo de lucro.** No afiliado a Nintendo, Creatures, GAME FREAK ni
The Pokémon Company. Ver [CREDITS.md](CREDITS.md).

## Progreso (lobby)

- **308 Pokémon** (todas las familias que evolucionan, sin legendarios). Cada uno empieza la partida en su
  primera fase y **evoluciona durante la partida** al ganar EXP (daño, K.O., objetivos y un poco por el tiempo).
  Si un rival va más evolucionado, ganas EXP más rápido. Cada fase da +12 % (o +22 % si solo tiene una evolución).
- Los ataques los decide el **tipo** (todos los de fuego tienen Ascuas y Lanzallamas...) y el **papel** sale de sus
  estadísticas (tanque, asesino, francotirador, luchador o lanzador). Los 6 primeros tienen ataques hechos a mano.
- Al empezar se eligen **3 iniciales**: uno de planta, uno de fuego y uno de agua (de cualquier generación).
- **Monedas**: suben de nivel a los Pokémon (Nv. 1 a 10, +2 % de vida y daño por nivel).
- **Puntos Pokémon**: desbloquean Pokémon nuevos (Común 150, Inicial y Raro 300, Épico 600; provisional).
- **Monedas Arcoíris**: solo sirven para comprar la **skin shiny** de cada Pokémon.
- **Cofres** (Poké Ball, Super Ball, Ultra Ball): dan monedas, Puntos Pokémon, Monedas Arcoíris y, a veces, un Pokémon.
- **Fichas**: se ganan en cada partida; con 100 fichas, una Poké Ball.
- **Copas**: cada Pokémon tiene las suyas; se ganan al ganar y se pierden al perder. El total es la suma.
- **Misiones** diarias (cambian a las 00:00) y semanales (cambian el lunes, más difíciles y con mejores premios).
- **Logros**: 84, con premios según la dificultad.
- **Amigos, clanes (con chat) y ranking**: de momento con un servidor simulado (`js/online.js`).
  Para jugar online de verdad hay que conectar Firebase (cuentas con Google/correo, base de datos y reglas contra trampas).
- Todo se guarda en el navegador (`localStorage`, clave `pb.save.v1`).

## Jugar en local

Abre `index.html` con doble clic, o mejor con un servidor local:

```bash
python -m http.server 8123
```

y entra en http://localhost:8123

## Controles

- **PC:** WASD mover · clic apuntar/disparar · Espacio disparo automático · E (mantén y suelta) o clic derecho súper · Esc menú · M silenciar
- **Móvil:** joystick izquierdo mover · derecho arrastrar para apuntar (toque rápido = automático) · botón amarillo súper

## Estructura

| Archivo | Qué hace |
|---|---|
| `js/data.js` | Mapas, tabla de tipos, los 6 Pokémon hechos a mano y reglas. |
| `js/roster.js` | Genera los 308 luchadores (ataques por tipo, papel por stats) y la evolución. **Aquí se equilibra el juego.** |
| `js/roster-data.js` | Generado: familias, stats de especie y datos de las hojas de sprites. |
| `js/game.js` | Simulación de la partida (no dibuja). Preparada para usarse en un servidor en el futuro. |
| `js/modes.js` | Reglas de cada modo y lo que hacen los bots en cada uno. |
| `js/save.js` | Progreso: monedas, puntos, niveles, cofres, fichas y misiones. **Aquí se ajusta la economía.** |
| `js/lobby.js` | Lobby y todos los menús: Pokémon, ficha, modos, misiones, logros, perfil, amigos, clan, ranking y cofres. |
| `js/settings.js` | Ajustes (sonido, gráficos, controles) guardados en el navegador. |
| `js/pixui.js` | Interfaz pixel art: paneles, barras e iconos dibujados píxel a píxel. |
| `js/online.js` | Amigos, clanes, chat y ranking (ahora simulado; aquí se conectará el servidor). |
| `js/ai.js` | Bots. Generan el mismo tipo de input que un jugador. |
| `js/world.js` | Colisiones, línea de visión y caminos (A*). |
| `js/render.js` | Dibujado en Canvas. |
| `js/vfx.js` | Efectos pixel art de los ataques (adaptado de PokéSurvivor). |
| `js/pokeball.js` | Pokéballs pixel art y plataforma central. |
| `js/tiles.js` | Mapa en pixel art: hierba, caminos, agua, rocas, árboles y hierba alta. |
| `js/input.js` | Teclado, ratón y joysticks táctiles. |
| `js/audio.js` | Sonidos sintetizados (sin archivos). |
| `js/main.js` | Menús y bucle principal. |
| `tools/build_roster.py` | Coge de PokéSurvivor los sprites (normal y shiny) de todas las familias completas y genera `js/roster-data.js` y `CREDITS-SPRITES.md`. |
| `tools/fetch_sprites.py` | Sprites de los Pokémon de los mapas (Snorlax, Voltorb) y `CREDITS.md`. |

### Añadir un Pokémon

Todos los que tienen sprites completos ya están. Si PokéSurvivor añade más, vuelve a generar el roster:

    git clone --depth 1 https://github.com/JPTER78/pokesurvivor.git ../pokesurvivor
    python tools/build_roster.py ../pokesurvivor

Para darle ataques propios a uno, añádelo a `PB.HANDMADE` en `js/data.js` con el mismo `id`.

## Publicar gratis (GitHub Pages, como PokéSurvivor)

1. Crea un repositorio en GitHub y sube esta carpeta.
2. En el repositorio: Settings → Pages → "Deploy from a branch" → `main` / raíz.
3. En unos minutos estará en `https://TU_USUARIO.github.io/NOMBRE_REPO/`.

## Licencias

- Efectos (`js/vfx.js`): adaptados de [PokéSurvivor](https://github.com/JPTER78/pokesurvivor), PolyForm Noncommercial 1.0.0 (`LICENSE-POKESURVIVOR.md`).
  Required Notice: Copyright 2026 JPTER78 (https://github.com/JPTER78/pokesurvivor)
- Fuente: [Jersey 10](https://github.com/scfried/soft-type-jersey), SIL OFL 1.1 (`assets/fonts/OFL.txt`).
- Sprites: [PMD SpriteCollab](https://github.com/PMDCollab/SpriteCollab), CC BY-NC 4.0 (no comercial, con atribución).
- Pokémon es propiedad de sus dueños. Nada de anuncios, pagos ni donaciones ligadas al juego.
