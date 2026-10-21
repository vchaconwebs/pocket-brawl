# Pocket Brawl (nombre provisional)

Fangame de combates 3v3 estilo Brawl Stars con Pokémon, en el navegador. Modo actual: **Atrapa Pokéballs**.
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
| `js/ai.js` | Bots. Generan el mismo tipo de input que un jugador. |
| `js/world.js` | Colisiones, línea de visión y caminos (A*). |
| `js/render.js` | Dibujado en Canvas. |
| `js/vfx.js` | Efectos pixel art de los ataques (adaptado de PokéSurvivor). |
| `js/pokeball.js` | Pokéballs pixel art y plataforma central. |
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
- Sprites: [PMD SpriteCollab](https://github.com/PMDCollab/SpriteCollab), CC BY-NC 4.0 (no comercial, con atribución).
- Pokémon es propiedad de sus dueños. Nada de anuncios, pagos ni donaciones ligadas al juego.
