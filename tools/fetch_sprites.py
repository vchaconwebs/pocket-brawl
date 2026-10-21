"""Descarga los sprites de PMD SpriteCollab y genera js/sprite-data.js + CREDITS.md.

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
POKEMON = {
    "0001": "Bulbasaur",
    "0004": "Charmander",
    "0007": "Squirtle",
    "0025": "Pikachu",
    "0074": "Geodude",
    "0092": "Gastly",
}
ANIMS = ["Idle", "Walk", "Shoot", "Attack", "Hurt"]


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

    for dex, name in POKEMON.items():
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
        for want in ANIMS:
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
    ]
    for name, authors in credits.items():
        lines.append(f"- **{name}**: {', '.join(authors) or 'ver SpriteCollab'}")
    lines += [
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
