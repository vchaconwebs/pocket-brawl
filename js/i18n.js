// Idiomas. El juego está escrito en español; para los demás idiomas se traduce:
//  - PB.T(texto, {n: 3}) en el código (textos del canvas y frases con datos)
//  - los textos de la página se traducen solos al aparecer (MutationObserver), si están en el diccionario
// Diccionario en js/i18n-data.js (PB.I18N): 'texto en español' -> [en, pt, fr, it, de].
// Una clave puede llevar huecos {n}, {a}... para frases con números o nombres.
(function () {
  PB.LANGS = { es: 'Español', en: 'English', pt: 'Português', fr: 'Français', it: 'Italiano', de: 'Deutsch' };
  const IDX = { en: 0, pt: 1, fr: 2, it: 3, de: 4 };

  // idioma: el elegido en Ajustes o el del navegador (si no lo tenemos, inglés)
  function detect() {
    try {
      const saved = localStorage.getItem('pb.lang');
      if (saved && PB.LANGS[saved]) return saved;
    } catch (e) {}
    for (const l of navigator.languages || [navigator.language || 'en']) {
      const k = String(l).slice(0, 2).toLowerCase();
      if (PB.LANGS[k]) return k;
    }
    return 'en';
  }
  PB.lang = detect();
  PB.setLang = (l) => {
    try { localStorage.setItem('pb.lang', l); } catch (e) {}
    location.reload(); // lo más sencillo y seguro: recargar con el idioma nuevo
  };
  document.documentElement.lang = PB.lang;
  const li = IDX[PB.lang];

  // ---------------------------------------------------------------- diccionario
  const exact = new Map();
  const patterns = [];
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  function compile() {
    if (li == null) return;
    for (const [es, tr] of Object.entries(PB.I18N || {})) {
      const t = tr[li];
      if (!t) continue;
      if (/\{\w+\}/.test(es)) {
        const names = [];
        const rx = new RegExp('^' + esc(es).replace(/\\\{(\w+)\\\}/g, (m, n) => { names.push(n); return '(.+?)'; }) + '$');
        patterns.push({ rx, names, t, lit: es.replace(/\{\w+\}/g, '').length });
      } else exact.set(es, t);
    }
    patterns.sort((a, b) => b.lit - a.lit); // primero las más concretas
  }
  const cache = new Map();
  function lookup(s) {
    if (li == null || !s) return null;
    if (exact.has(s)) return exact.get(s);
    if (cache.has(s)) return cache.get(s);
    let out = null;
    for (const p of patterns) {
      const m = p.rx.exec(s);
      if (!m) continue;
      const vals = {};
      p.names.forEach((n, i) => { const v = m[i + 1]; vals[n] = lookup(v) || v; });
      out = p.t.replace(/\{(\w+)\}/g, (x, n) => (vals[n] != null ? vals[n] : x));
      break;
    }
    if (cache.size > 5000) cache.clear();
    cache.set(s, out);
    return out;
  }
  // T('Te faltan {n} puntos', { n: 5 })
  PB.T = (s, params) => {
    let out = li == null ? s : lookup(s) || s;
    if (params) out = out.replace(/\{(\w+)\}/g, (m, k) => (params[k] != null ? params[k] : m));
    return out;
  };
  // nombre de un movimiento (los nombres del juego son los oficiales en español)
  PB.TM = (name) => {
    if (li == null) return name;
    const m = PB.I18N_MOVES && PB.I18N_MOVES[name];
    return (m && m[li]) || name;
  };

  // nombres oficiales de los Pokémon en el idioma elegido
  if (li != null && PB.I18N_SPECIES && PB.DEX) {
    for (const [dex, names] of Object.entries(PB.I18N_SPECIES)) if (PB.DEX[dex] && names[li]) PB.DEX[dex].name = names[li];
  }

  // ---------------------------------------------------------------- traducir la página
  const SKIP = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'INPUT']);
  function trText(node) {
    const raw = node.data;
    const s = raw.trim();
    if (!s || !/[A-Za-zÁÉÍÓÚáéíóúñÑ¡¿]/.test(s)) return;
    const t = lookup(s.replace(/\s+/g, ' ')); // los saltos de línea del HTML cuentan como un espacio
    if (t && t !== s) node.data = raw.replace(s, t);
  }
  function trAttrs(el) {
    for (const a of ['placeholder', 'title', 'aria-label']) {
      const v = el.getAttribute && el.getAttribute(a);
      if (v) { const t = lookup(v.trim()); if (t) el.setAttribute(a, t); }
    }
  }
  function walk(root) {
    if (root.nodeType === 3) return trText(root);
    if (root.nodeType !== 1 || SKIP.has(root.tagName) || root.closest && root.closest('[data-noi18n]')) return;
    trAttrs(root);
    const tw = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
    let n;
    while ((n = tw.nextNode())) {
      if (n.nodeType === 3) {
        const p = n.parentNode;
        if (p && !SKIP.has(p.nodeName) && !(p.closest && p.closest('[data-noi18n]'))) trText(n);
      } else trAttrs(n);
    }
  }
  compile(); // el diccionario (js/i18n-data.js) ya está cargado
  PB.I18nStart = () => {
    if (li == null) return;
    walk(document.body);
    document.title = PB.T(document.title);
    new MutationObserver((list) => {
      for (const m of list) {
        if (m.type === 'characterData') trText(m.target);
        else if (m.type === 'attributes') trAttrs(m.target);
        else for (const n of m.addedNodes) walk(n);
      }
    }).observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['placeholder', 'title'] });
  };
})();
