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
| `js/data.js` | Mapa, tabla de tipos, luchadores y reglas. **Aquí se equilibra el juego.** |
| `js/game.js` | Simulación de la partida (no dibuja). Preparada para usarse en un servidor en el futuro. |
| `js/modes.js` | Reglas de cada modo y lo que hacen los bots en cada uno. |
| `js/ai.js` | Bots. Generan el mismo tipo de input que un jugador. |
| `js/world.js` | Colisiones, línea de visión y caminos (A*). |
| `js/render.js` | Dibujado en Canvas. |
| `js/vfx.js` | Efectos pixel art de los ataques (adaptado de PokéSurvivor). |
| `js/pokeball.js` | Pokéballs pixel art y plataforma central. |
| `js/tiles.js` | Mapa en pixel art: hierba, caminos, agua, rocas, árboles y hierba alta. |
| `js/input.js` | Teclado, ratón y joysticks táctiles. |
| `js/audio.js` | Sonidos sintetizados (sin archivos). |
| `js/main.js` | Menús y bucle principal. |
| `tools/fetch_sprites.py` | Descarga sprites de SpriteCollab y genera `js/sprite-data.js` y `CREDITS.md`. |

### Añadir un Pokémon

1. Añade su número de Pokédex y nombre a `POKEMON` en `tools/fetch_sprites.py` y ejecútalo: `python tools/fetch_sprites.py`
2. Añade su entrada en `PB.BRAWLERS` (`js/data.js`) con el mismo `dex`.

## Publicar gratis (GitHub Pages, como PokéSurvivor)

1. Crea un repositorio en GitHub y sube esta carpeta.
2. En el repositorio: Settings → Pages → "Deploy from a branch" → `main` / raíz.
3. En unos minutos estará en `https://TU_USUARIO.github.io/NOMBRE_REPO/`.

## Licencias

- Efectos (`js/vfx.js`): adaptados de [PokéSurvivor](https://github.com/JPTER78/pokesurvivor), PolyForm Noncommercial 1.0.0 (`LICENSE-POKESURVIVOR.md`).
  Required Notice: Copyright 2026 JPTER78 (https://github.com/JPTER78/pokesurvivor)
- Fuente: [Pixelify Sans](https://github.com/eifetx/Pixelify-Sans), SIL OFL 1.1 (`assets/fonts/OFL.txt`).
- Sprites: [PMD SpriteCollab](https://github.com/PMDCollab/SpriteCollab), CC BY-NC 4.0 (no comercial, con atribución).
- Pokémon es propiedad de sus dueños. Nada de anuncios, pagos ni donaciones ligadas al juego.
