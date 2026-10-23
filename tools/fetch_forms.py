"""Descarga las formas regionales (Alola, Galar, Hisui, Paldea) y las megaevoluciones de PMD SpriteCollab
y genera js/forms-data.js (PB.FORMS y PB.FORM_META, con el mismo formato que PB.SPRITE_META).
Los tipos de las formas regionales (PB.FORMS[k].types) se añadieron después con los datos de PokéAPI.

Solo se bajan las que tienen las animaciones que usa el juego (Idle, Walk y Attack como mínimo).
Uso:  python tools/fetch_forms.py
Licencia de los sprites: CC BY-NC 4.0 (https://github.com/PMDCollab/SpriteCollab)
"""
import json
import os
import concurrent.futures as cf
import urllib.request
import xml.etree.ElementTree as ET

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASE = "https://raw.githubusercontent.com/PMDCollab/SpriteCollab/master"
ANIMS = ["Idle", "Walk", "Attack", "Shoot", "Hurt", "Faint"]
NEED = ("Idle", "Walk", "Attack")
REGIONS = ("alola", "galar", "hisui", "paldea")
REGION_ES = {"alola": "de Alola", "galar": "de Galar", "hisui": "de Hisui", "paldea": "de Paldea"}


def get(url):
    with urllib.request.urlopen(url, timeout=60) as r:
        return r.read()


def forms_from_tracker():
    t = json.loads(get(f"{BASE}/tracker.json"))
    out = []
    for dex, node in t.items():
        for sub, v in (node.get("subgroups") or {}).items():
            name = v.get("name", "")
            low = name.lower()
            if "altcolor" in low or "shadow" in low:
                continue
            files = v.get("sprite_files") or {}
            if not all(a in files for a in NEED):
                continue
            region = next((r for r in REGIONS if low.startswith(r)), None)
            if region:
                if low != region:  # variantes (Ponyta Galar_Alternate, Tauros Paldea_Blaze...): solo la normal
                    continue
                key, kind, label = f"{int(dex)}-{region}", region, f"{node.get('name', '')} {REGION_ES[region]}"
            elif low.startswith("mega"):
                suffix = low.replace("mega", "").strip("_ ")
                key = f"{int(dex)}-mega" + (f"-{suffix}" if suffix else "")
                kind, label = "mega", f"Mega-{node.get('name', '')}" + (f" {suffix.upper()}" if suffix else "")
            else:
                continue
            out.append({"key": key, "dex": int(dex), "path": f"{dex}/{sub}", "kind": kind, "name": label})
    return out


def resolve(anims, name):
    seen = set()
    while name in anims and anims[name].get("copy") and name not in seen:
        seen.add(name)
        name = anims[name]["copy"]
    return name


def fetch_form(f):
    d = os.path.join(ROOT, "assets", "pokemon", f["key"])
    os.makedirs(d, exist_ok=True)
    xml = ET.fromstring(get(f"{BASE}/sprite/{f['path']}/AnimData.xml"))
    anims = {}
    for a in xml.iter("Anim"):
        anims[a.findtext("Name")] = {
            "copy": a.findtext("CopyOf"),
            "w": int(a.findtext("FrameWidth") or 0),
            "h": int(a.findtext("FrameHeight") or 0),
            "d": [int(x.text) for x in a.iter("Duration")],
        }
    meta = {}
    for want in ANIMS:
        real = resolve(anims, want)
        # si le falta alguna, se usa una parecida (disparo = ataque; daño y caída = quieto)
        if real not in anims or not anims[real]["w"]:
            real = resolve(anims, {"Shoot": "Attack", "Hurt": "Idle", "Faint": "Idle"}.get(want, want))
        if real not in anims or not anims[real]["w"]:
            continue
        a = anims[real]
        path = os.path.join(d, f"{want}.png")
        if not os.path.exists(path):
            with open(path, "wb") as fh:
                fh.write(get(f"{BASE}/sprite/{f['path']}/{real}-Anim.png"))
        from PIL import Image
        with Image.open(path) as im:
            rows = max(1, im.height // a["h"])
        meta[want] = {"w": a["w"], "h": a["h"], "n": len(a["d"]), "r": rows, "d": a["d"], "ax": a["w"] / 2 - 0.5, "ay": a["h"] / 2 + 3.5}
    port = os.path.join(d, "p.png")
    if not os.path.exists(port):
        try:
            with open(port, "wb") as fh:
                fh.write(get(f"{BASE}/portrait/{f['path']}/Normal.png"))
        except Exception:
            os.remove(port)
    return f, meta, os.path.exists(port)


def main():
    forms = forms_from_tracker()
    print(len(forms), "formas")
    data, metas = {}, {}
    with cf.ThreadPoolExecutor(8) as ex:
        for f, meta, port in ex.map(fetch_form, forms):
            if not all(a in meta for a in NEED):
                print("  sin animaciones:", f["key"])
                continue
            data[f["key"]] = {"dex": f["dex"], "kind": f["kind"], "name": f["name"], "p": 1 if port else 0}
            metas[f["key"]] = {"a": meta}
            print("  ok", f["key"], f["name"])
    with open(os.path.join(ROOT, "js", "forms-data.js"), "w", encoding="utf-8") as fh:
        fh.write("// Generado por tools/fetch_forms.py, no editar a mano.\n")
        fh.write("// Formas regionales (skins) y megaevoluciones de PMD SpriteCollab (CC BY-NC 4.0).\n")
        fh.write("PB.FORMS = " + json.dumps(data, ensure_ascii=False, indent=0) + ";\n")
        fh.write("PB.FORM_META = " + json.dumps(metas, separators=(",", ":")) + ";\n")
    print("OK", len(data))


if __name__ == "__main__":
    main()
