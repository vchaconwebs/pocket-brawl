"""Añade a mano una familia que build_roster.py dejó fuera (p. ej. Munchlax -> Snorlax, que antes solo era
el Snorlax del modo «Despierta a Snorlax»). Descarga sus sprites (normal y shiny) y su retrato de
PMD SpriteCollab y mete la especie en js/roster-data.js (FAMILIES, DEX y SPRITE_META).

Uso:  python tools/add_family.py munchlax 446:Munchlax:normal:135:5:85:40:40:85:390:4 143:Snorlax:normal:160:30:110:65:65:110:540:1
      (dex:nombre:tipos separados por /:ps:velocidad:ataque:at.esp:defensa:def.esp:total:generación, stats base)
Las stats se pasan a la escala del juego igual que el resto (hp = 70 + 0,45·PS, vel = 78 + 0,42·Vel, ataque = 0,7 + 0,0055·At).
Licencia de los sprites: CC BY-NC 4.0 (https://github.com/PMDCollab/SpriteCollab)
"""
import io
import json
import os
import sys
import urllib.request
import xml.etree.ElementTree as ET

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASE = "https://raw.githubusercontent.com/PMDCollab/SpriteCollab/master"
ANIMS = ["Idle", "Walk", "Attack", "Shoot", "Hurt", "Faint"]
FALLBACK = {"Shoot": "Attack", "Hurt": "Idle", "Faint": "Idle"}


def get(url):
    with urllib.request.urlopen(url, timeout=60) as r:
        return r.read()


def anim_meta(path, out_dir):
    """Descarga las hojas de una carpeta de SpriteCollab y devuelve su geometría {anim: {...}}"""
    from PIL import Image
    xml = ET.fromstring(get(f"{BASE}/sprite/{path}/AnimData.xml"))
    anims = {}
    for a in xml.iter("Anim"):
        anims[a.findtext("Name")] = {"copy": a.findtext("CopyOf"), "w": int(a.findtext("FrameWidth") or 0),
                                     "h": int(a.findtext("FrameHeight") or 0), "d": [int(x.text) for x in a.iter("Duration")]}

    def resolve(name):
        seen = set()
        while name in anims and anims[name]["copy"] and name not in seen:
            seen.add(name)
            name = anims[name]["copy"]
        return name

    os.makedirs(out_dir, exist_ok=True)
    meta = {}
    for want in ANIMS:
        real = resolve(want)
        if real not in anims or not anims[real]["w"]:
            real = resolve(FALLBACK.get(want, want))
        if real not in anims or not anims[real]["w"]:
            continue
        a = anims[real]
        png = get(f"{BASE}/sprite/{path}/{real}-Anim.png")
        with open(os.path.join(out_dir, f"{want}.png"), "wb") as fh:
            fh.write(png)
        rows = max(1, Image.open(io.BytesIO(png)).height // a["h"])
        meta[want] = {"w": a["w"], "h": a["h"], "n": len(a["d"]), "r": rows, "d": a["d"], "ax": a["w"] / 2 - 0.5, "ay": a["h"] / 2 + 3.5}
    return meta


def main():
    fam_id, specs = sys.argv[1], sys.argv[2:]
    path = os.path.join(ROOT, "js", "roster-data.js")
    src = open(path, encoding="utf-8").read()
    if f'{{"id":"{fam_id}",' in src:
        sys.exit(f"{fam_id} ya está en el roster")
    line, dex_lines, meta_lines = [], [], []
    for spec in specs:
        dex, name, types, hp, spd, at, sa, df, sd, bst, gen = spec.split(":")
        dex = int(dex)
        line.append(dex)
        folder = os.path.join(ROOT, "assets", "pokemon", str(dex))
        m = {"a": anim_meta(f"{dex:04d}", folder)}
        try:
            sm = anim_meta(f"{dex:04d}/0000/0001", os.path.join(folder, "s"))
            m["sh"] = 1
            diff = {k: v for k, v in sm.items() if m["a"].get(k) != v}
            if diff:
                m["sa"] = diff
            missing = [k for k in m["a"] if k not in sm]
            if missing:
                m["sm"] = missing
        except Exception as e:
            print("  sin shiny:", dex, e)
        p = 0
        try:
            with open(os.path.join(folder, "p.png"), "wb") as fh:
                fh.write(get(f"{BASE}/portrait/{dex:04d}/Normal.png"))
            p = 1
        except Exception:
            pass
        entry = {"name": name, "types": types.split("/"), "hp": round(70 + 0.45 * int(hp)), "spd": round(78 + 0.42 * int(spd)),
                 "pa": round(0.7 + 0.0055 * int(at), 2), "sa": round(0.7 + 0.0055 * int(sa), 2), "df": int(df), "sd": int(sd),
                 "bst": int(bst), "gen": int(gen), "p": p}
        dex_lines.append(f"  {dex}:" + json.dumps(entry, ensure_ascii=False, separators=(",", ":")) + ",\n")
        meta_lines.append(f"  {dex}:" + json.dumps(m, separators=(",", ":")) + ",\n")
        print("  ok", dex, name)
    fam = f'  {{"id":"{fam_id}","line":{json.dumps(line, separators=(",", ":"))}}},\n'
    src = src.replace("PB.FAMILIES = [\n", "PB.FAMILIES = [\n" + fam, 1)
    src = src.replace("PB.DEX = {\n", "PB.DEX = {\n" + "".join(dex_lines), 1)
    src = src.replace("PB.SPRITE_META = {\n", "PB.SPRITE_META = {\n" + "".join(meta_lines), 1)
    open(path, "w", encoding="utf-8").write(src)
    print("OK", fam_id, line)


if __name__ == "__main__":
    main()
