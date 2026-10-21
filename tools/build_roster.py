"""Genera el roster completo de Pocket Brawl a partir de PokéSurvivor.

Coge cada familia evolutiva (sin legendarios ni singulares) cuyos sprites
estén completos en PokéSurvivor, copia sus hojas de sprites (normal y shiny)
y escribe js/roster-data.js con los datos de cada especie y de sus sprites.

Uso:
    git clone --depth 1 https://github.com/JPTER78/pokesurvivor.git /ruta/ps
    python tools/build_roster.py /ruta/ps

Fuentes:
  - Sprites: PMD SpriteCollab (CC BY-NC 4.0), ya optimizados por PokéSurvivor.
  - Datos de especie (stats, tipos): js/data/pokedex.js de PokéSurvivor
    (PolyForm Noncommercial 1.0.0, ver LICENSE-POKESURVIVOR.md).
  - Evoluciones: PokéAPI (https://pokeapi.co).
  - Retratos: PMD SpriteCollab.
"""
import json
import os
import re
import shutil
import sys
import urllib.request
from concurrent.futures import ThreadPoolExecutor

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_ASSETS = os.path.join(ROOT, 'assets', 'pokemon')
CACHE = os.path.join(ROOT, 'tools', 'cache')
RAW = 'https://raw.githubusercontent.com/PMDCollab/SpriteCollab/master'

# animaciones que usa el juego (Charge no se usa)
ANIMS = ['Idle', 'Walk', 'Attack', 'Shoot', 'Hurt', 'Faint']
REQUIRED = {'Idle', 'Walk', 'Attack'}
# Pokémon que ya son objetos de los mapas (Snorlax en "Despierta a Snorlax", Voltorb en "Voltorbol")
EXCLUDE_ROOTS = {'munchlax', 'snorlax', 'voltorb'}
# los 27 iniciales de las 9 generaciones (planta, fuego, agua)
STARTERS = {
    'grass': [1, 152, 252, 387, 495, 650, 722, 810, 906],
    'fire': [4, 155, 255, 390, 498, 653, 725, 813, 909],
    'water': [7, 158, 258, 393, 501, 656, 728, 816, 912],
}


def fetch(url, data=None, headers=None):
    req = urllib.request.Request(url, data=data, headers=headers or {})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()


def load_species():
    path = os.path.join(CACHE, 'species.json')
    if not os.path.exists(path):
        q = '{ s: pokemon_v2_pokemonspecies(order_by:{id:asc}) { id name evolves_from_species_id is_baby is_legendary is_mythical } }'
        raw = fetch('https://beta.pokeapi.co/graphql/v1beta', json.dumps({'query': q}).encode(),
                    {'Content-Type': 'application/json'})
        with open(path, 'wb') as f:
            f.write(raw)
    return json.load(open(path, encoding='utf-8'))['data']['s']


def load_js_entries(path, pattern):
    out = {}
    for line in open(path, encoding='utf-8'):
        m = re.match(pattern, line)
        if m:
            obj = json.loads(m.group(2) if m.lastindex >= 2 else m.group(1))
            key = int(m.group(1)) if m.lastindex >= 2 else obj['dex']
            out[key] = obj
    return out


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    ps = sys.argv[1]
    os.makedirs(CACHE, exist_ok=True)
    species = load_species()
    by = {s['id']: s for s in species}
    dex = load_js_entries(os.path.join(ps, 'js', 'data', 'pokedex.js'), r'^\s*(\{"dex".*\}),?\s*$')
    meta = load_js_entries(os.path.join(ps, 'js', 'data', 'sprites-meta.js'), r'^\s*(\d+):\s*(\{.*\}),?\s*$')

    def ok(i):
        m = meta.get(i)
        return i in dex and m and REQUIRED <= set(m['a'])

    children = {}
    for s in species:
        if s['evolves_from_species_id']:
            children.setdefault(s['evolves_from_species_id'], []).append(s['id'])

    def root(s):
        while s['evolves_from_species_id']:
            s = by[s['evolves_from_species_id']]
        return s

    def family(r):
        out, todo = [], [r['id']]
        while todo:
            i = todo.pop()
            out.append(by[i])
            todo += children.get(i, [])
        return out

    def best_line(start):
        """Línea más larga desde `start` con sprites completos (en empate, la de menor número)."""
        best = [start]
        for c in sorted(children.get(start, [])):
            if not ok(c):
                continue
            sub = [start] + best_line(c)
            if len(sub) > len(best):
                best = sub
        return best

    families, seen = [], set()
    for s in species:
        r = root(s)
        if r['id'] in seen:
            continue
        seen.add(r['id'])
        fam = family(r)
        if len(fam) < 2 or any(x['is_legendary'] or x['is_mythical'] for x in fam):
            continue
        if any(x['name'] in EXCLUDE_ROOTS for x in fam):
            continue
        start = r['id']
        # el bebé (Pichu, Igglybuff...) no cuenta, salvo que sin él no quede evolución (Riolu)
        if r['is_baby']:
            grown = [c for c in children.get(start, []) if ok(c) and children.get(c)]
            if grown:
                start = min(grown)
        if not ok(start):
            continue
        line = best_line(start)
        if len(line) < 2:
            continue
        # si a la familia le faltan sprites de la fase final, se queda fuera (no se mete "a medias")
        full_depth = len(best_line_any(start, children))
        if len(line) < full_depth:
            continue
        families.append(line[:3])

    print('familias completas:', len(families))
    used = sorted({i for line in families for i in line})
    print('especies:', len(used))

    # ---- copiar sprites
    total = 0
    for i in used:
        src = os.path.join(ps, 'assets', 'pokemon', str(i))
        dst = os.path.join(OUT_ASSETS, str(i))
        for sub in ['', 's']:
            sd = os.path.join(src, sub)
            if not os.path.isdir(sd):
                continue
            dd = os.path.join(dst, sub)
            os.makedirs(dd, exist_ok=True)
            for a in ANIMS:
                f = os.path.join(sd, a + '.png')
                if os.path.exists(f):
                    shutil.copyfile(f, os.path.join(dd, a + '.png'))
                    total += os.path.getsize(f)
    print('sprites copiados: %.1f MB' % (total / 1e6))

    # ---- retratos (cara estilo Mundo Misterioso) para menús y el registro de K.O.
    def portrait(i):
        p = os.path.join(OUT_ASSETS, str(i), 'p.png')
        if os.path.exists(p):
            return i, True
        try:
            png = fetch(f'{RAW}/portrait/{i:04d}/Normal.png')
        except Exception:
            return i, False
        with open(p, 'wb') as f:
            f.write(png)
        return i, True

    with ThreadPoolExecutor(12) as ex:
        have_portrait = {i for i, okp in ex.map(portrait, used) if okp}
    print('retratos:', len(have_portrait), '/', len(used))

    # ---- datos para el juego
    out_dex, out_meta = {}, {}
    for i in used:
        d = dex[i]
        out_dex[i] = {k: d[k] for k in ('name', 'types', 'hp', 'spd', 'pa', 'sa', 'df', 'sd', 'bst', 'gen') if k in d}
        if i in have_portrait:
            out_dex[i]['p'] = 1
        m = meta[i]
        mm = {'a': {a: m['a'][a] for a in ANIMS if a in m['a']}}
        if m.get('sh'):
            mm['sh'] = 1
            if m.get('sa'):
                mm['sa'] = {a: v for a, v in m['sa'].items() if a in ANIMS}
            if m.get('sm'):
                mm['sm'] = [a for a in m['sm'] if a in ANIMS]
        if m.get('hv'):
            mm['hv'] = 1
        out_meta[i] = mm
    fams = [{'id': re.sub(r'[^a-z0-9]', '', by[line[0]]['name']), 'line': line} for line in families]
    starters = {t: [i for i in ids if any(f['line'][0] == i for f in fams)] for t, ids in STARTERS.items()}

    with open(os.path.join(ROOT, 'js', 'roster-data.js'), 'w', encoding='utf-8') as f:
        f.write('// Generado por tools/build_roster.py, no editar a mano.\n')
        f.write('// Stats de especie y metadatos de sprites: PokéSurvivor (PolyForm Noncommercial 1.0.0).\n')
        f.write('// Required Notice: Copyright 2026 JPTER78 (https://github.com/JPTER78/pokesurvivor)\n')
        f.write('// Sprites: PMD SpriteCollab (CC BY-NC 4.0).\n')
        f.write('// Filas de cada hoja: 0 abajo, 1 abajo-dcha, 2 dcha, 3 arriba-dcha, 4 arriba, 5 arriba-izda, 6 izda, 7 abajo-izda\n')
        f.write('PB.FAMILIES = [\n')
        for fm in fams:
            f.write('  ' + json.dumps(fm, separators=(',', ':')) + ',\n')
        f.write('];\n')
        f.write('PB.STARTER_DEX = ' + json.dumps(starters, separators=(',', ':')) + ';\n')
        f.write('PB.DEX = {\n')
        for i in used:
            f.write(f'  {i}:' + json.dumps(out_dex[i], separators=(',', ':'), ensure_ascii=False) + ',\n')
        f.write('};\n')
        f.write('PB.SPRITE_META = {\n')
        for i in used:
            f.write(f'  {i}:' + json.dumps(out_meta[i], separators=(',', ':')) + ',\n')
        f.write('};\n')

    # ---- créditos de los sprites usados (sacados de los de PokéSurvivor, que salen de SpriteCollab)
    rows = []
    usedset = set(used)
    for line in open(os.path.join(ps, 'CREDITS.md'), encoding='utf-8'):
        m = re.match(r'^\| (.+?) \| (.*?) \| ([\d, ]+) \|\s*$', line)
        if not m:
            continue
        nums = [int(x) for x in m.group(3).split(',') if x.strip()]
        mine = [n for n in nums if n in usedset]
        if mine:
            rows.append(f'| {m.group(1)} | {m.group(2)} | {", ".join(map(str, mine))} |')
    with open(os.path.join(ROOT, 'CREDITS-SPRITES.md'), 'w', encoding='utf-8') as f:
        f.write('# Créditos de los sprites\n\n')
        f.write('Sprites estilo *Pokémon Mundo Misterioso* de [PMD SpriteCollab](https://github.com/PMDCollab/SpriteCollab),\n')
        f.write('bajo licencia [CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/): uso no comercial y con atribución.\n')
        f.write('Hojas optimizadas por [PokéSurvivor](https://github.com/JPTER78/pokesurvivor).\n\n')
        f.write('| Artista | Contacto | Sprites (nº de Pokédex) |\n|---|---|---|\n')
        f.write('\n'.join(rows) + '\n')
    print('ok')


def best_line_any(start, children):
    """Línea más larga desde `start` sin mirar si hay sprites (para saber si falta alguna fase)."""
    best = [start]
    for c in children.get(start, []):
        sub = [start] + best_line_any(c, children)
        if len(sub) > len(best):
            best = sub
    return best


if __name__ == '__main__':
    main()
