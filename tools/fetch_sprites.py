"""Descarga los sprites de los Pokémon de los mapas (Snorlax, Voltorb) y genera js/sprite-data.js + CREDITS.md.

Uso:  python tools/fetch_sprites.py
Licencia de los sprites: CC BY-NC 4.0 (https://github.com/PMDCollab/SpriteCollab)
"""
import json
import os
import urllib.request
import xml.etree.ElementTree as ET

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASE = "https://raw.githubusercontent.com/PMDCollab/SpriteCollab/master"

# dex -> nombre (deben coincidir con BRAWLERS en js/data.js)
POKEMON = {}  # los jugables los genera tools/build_roster.py
ANIMS = ["Idle", "Walk", "Shoot", "Attack", "Hurt", "Faint"]

# Pokémon que aparecen en los modos pero no son luchadores (dex -> (nombre, animaciones))
EXTRA = {
    "0143": ("Snorlax", ["Sleep", "Idle", "Hurt"]),
    "0100": ("Voltorb", ["Idle", "Walk", "Hurt", "Rotate"]),
}


def get(url):
    with urllib.request.urlopen(url, timeout=30) as r:
        return r.read()


def resolve(anims, name):
    """Sigue CopyOf hasta la animación real."""
    seen = set()
    while name in anims and anims[name].get("copy") and name not in seen:
        seen.add(name)
        name = anims[name]["copy"]
    return name


def main():
    out_dir = os.path.join(ROOT, "assets", "sprites")
    data, credits = {}, {}
    try:
        names_raw = get(f"{BASE}/credit_names.txt").decode("utf-8", "replace")
        names = {}
        for line in names_raw.splitlines()[1:]:
            parts = line.split("\t")
            if len(parts) >= 2:
                names[parts[1]] = parts[0]
    except Exception:
        names = {}

    todo = [(dex, name, ANIMS) for dex, name in POKEMON.items()]
    todo += [(dex, name, anims) for dex, (name, anims) in EXTRA.items()]
    for dex, name, anim_list in todo:
        print("->", dex, name)
        d = os.path.join(out_dir, dex)
        os.makedirs(d, exist_ok=True)
        xml = ET.fromstring(get(f"{BASE}/sprite/{dex}/AnimData.xml"))
        anims = {}
        for a in xml.iter("Anim"):
            n = a.findtext("Name")
            anims[n] = {
                "copy": a.findtext("CopyOf"),
                "w": int(a.findtext("FrameWidth") or 0),
                "h": int(a.findtext("FrameHeight") or 0),
                "dur": [int(x.text) for x in a.iter("Duration")],
                "hit": int(a.findtext("HitFrame") or -1),
            }
        entry = {"name": name, "anims": {}}
        for want in anim_list:
            real = resolve(anims, want)
            if real not in anims or not anims[real]["w"]:
                continue
            fname = f"{real}-Anim.png"
            path = os.path.join(d, fname)
            if not os.path.exists(path):
                with open(path, "wb") as f:
                    f.write(get(f"{BASE}/sprite/{dex}/{fname}"))
            a = anims[real]
            entry["anims"][want] = {"file": f"assets/sprites/{dex}/{fname}",
                                    "w": a["w"], "h": a["h"], "dur": a["dur"], "hit": a["hit"]}
        try:
            with open(os.path.join(d, "portrait.png"), "wb") as f:
                f.write(get(f"{BASE}/portrait/{dex}/Normal.png"))
            entry["portrait"] = f"assets/sprites/{dex}/portrait.png"
        except Exception:
            pass
        data[dex] = entry
        authors = set()
        for kind in ("sprite", "portrait"):
            try:
                txt = get(f"{BASE}/{kind}/{dex}/credits.txt").decode("utf-8", "replace")
                for line in txt.splitlines():
                    parts = line.split("\t")
                    if len(parts) >= 2:
                        authors.add(names.get(parts[1], parts[1]))
            except Exception:
                pass
        credits[name] = sorted(authors)

    with open(os.path.join(ROOT, "js", "sprite-data.js"), "w", encoding="utf-8") as f:
        f.write("// Generado por tools/fetch_sprites.py, no editar a mano.\n")
        f.write("window.SPRITE_DATA = " + json.dumps(data, indent=1) + ";\n")

    lines = [
        "# Créditos",
        "",
        "## Sprites",
        "Sprites y retratos de [PMD SpriteCollab](https://github.com/PMDCollab/SpriteCollab),",
        "bajo licencia [CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/).",
        "Algunos sprites base proceden de Pokémon Mundo Misterioso (CHUNSOFT).",
        "",
        "Los sprites de los Pokémon jugables (normales y shiny) vienen ya optimizados de",
        "[PokéSurvivor](https://github.com/JPTER78/pokesurvivor). La lista completa de artistas",
        "está en [CREDITS-SPRITES.md](CREDITS-SPRITES.md).",
        "",
        "Pokémon de los mapas:",
        "",
    ]
    for name, authors in credits.items():
        lines.append(f"- **{name}**: {', '.join(authors) or 'ver SpriteCollab'}")
    lines += [
        "",
        "## Efectos de los ataques",
        "Generador de efectos pixel art adaptado de [PokéSurvivor](https://github.com/JPTER78/pokesurvivor)",
        "(`js/vfx.js`), bajo PolyForm Noncommercial 1.0.0 (ver `LICENSE-POKESURVIVOR.md`).",
        "",
        "Required Notice: Copyright 2026 JPTER78 (https://github.com/JPTER78/pokesurvivor)",
        "",
        "## Datos de los Pokémon",
        "Estadísticas de especie y metadatos de las hojas de sprites (`js/roster-data.js`) sacados de",
        "PokéSurvivor (misma licencia y aviso que los efectos). Líneas evolutivas de [PokéAPI](https://pokeapi.co).",
        "",
        "## Fuente",
        "[Jersey 10](https://github.com/scfried/soft-type-jersey) (Sarah Cadigan-Fried), SIL Open Font License 1.1 (`assets/fonts/OFL.txt`).",
        "",
        "## Mapa",
        "Tiles pixel art generados en `js/tiles.js` con la técnica de PokéSurvivor (misma licencia y aviso que los efectos).",
        "",
        "## Pokémon",
        "Pokémon y sus nombres son propiedad de Nintendo, Creatures Inc., GAME FREAK y",
        "The Pokémon Company. Este es un fangame gratuito, sin ánimo de lucro y no afiliado.",
        "",
    ]
    with open(os.path.join(ROOT, "CREDITS.md"), "w", encoding="utf-8") as f:
        f.write("\n".join(lines))
    print("OK")


if __name__ == "__main__":
    main()
