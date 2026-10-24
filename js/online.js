// Parte online con Firebase (plan gratuito Spark):
//  - Cuenta: invitado anónimo al entrar; se puede vincular con Google para no perder el progreso.
//  - Firestore: perfiles, amigos, clanes (con chat), ranking y copia del progreso en la nube.
//  - Realtime Database: quién está conectado, salas de amigos, invitaciones, búsqueda de partida
//    y el "apretón de manos" de WebRTC. Las partidas van directas entre jugadores (js/net.js).
// Si Firebase no carga (sin internet, bloqueado...), el juego sigue funcionando con bots.
PB.Online = (() => {
  const CFG = {
    apiKey: 'AIzaSyA6C_hWt0VOhk1pzsN8NuYeqx_IhP2cRf0',
    authDomain: 'pokeversus-9ed3a.firebaseapp.com',
    databaseURL: 'https://pokeversus-9ed3a-default-rtdb.europe-west1.firebasedatabase.app',
    projectId: 'pokeversus-9ed3a',
    storageBucket: 'pokeversus-9ed3a.firebasestorage.app',
    messagingSenderId: '329495817613',
    appId: '1:329495817613:web:b9e8dcb3387b0dbb0421c4',
  };
  const SDK = 'https://www.gstatic.com/firebasejs/10.14.1/';
  const ICE = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];
  const WAIT = 10; // segundos buscando antes de rellenar con bots
  const MAX = () => PB.META.clanMax;

  const listeners = {};
  // registro de lo que pasa al buscar y conectar (para depurar: PB.Online.trace)
  const trace = [];
  const tr = (...a) => { trace.push(((Date.now() / 1000) % 1000).toFixed(1) + ' ' + a.join(' ')); if (trace.length > 80) trace.shift(); };
  const emit = (ev, data) => (listeners[ev] || []).forEach((f) => f(data));
  // los textos de otros jugadores nunca llevan HTML
  const clean = (s, n) => String(s == null ? '' : s).replace(/[<>&"'`\\]/g, '').trim().slice(0, n || 40);
  const err = (t) => ({ error: PB.T(t) });

  let fb = null, auth = null, rtdb = null, fs = null;
  let uid = null, user = null;
  let ready = null; // promesa: true si hay conexión
  let offset = 0; // diferencia con la hora del servidor
  const now = () => Date.now() + offset;

  // ------------------------------------------------------------ arranque
  function loadScript(src) {
    return new Promise((ok, ko) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = ok;
      s.onerror = ko;
      document.head.appendChild(s);
    });
  }

  // Carga Firebase y mira si ya había sesión. NO crea ninguna cuenta: eso se elige en el inicio
  // (invitado, Google o correo). Devuelve true si hay sesión.
  let inited = null;
  function init() {
    if (inited) return inited;
    inited = (async () => {
      try {
        await loadScript(SDK + 'firebase-app-compat.js');
        await Promise.all(['auth', 'database', 'firestore'].map((m) => loadScript(SDK + 'firebase-' + m + '-compat.js')));
        fb = window.firebase;
        fb.initializeApp(CFG);
        auth = fb.auth();
        rtdb = fb.database();
        fs = fb.firestore();
        countFirestore();
        rtdb.ref('.info/serverTimeOffset').on('value', (s) => { offset = s.val() || 0; });
        countVisit();
        goOnline();
        const u = await new Promise((res) => { const off = auth.onAuthStateChanged((x) => { off(); res(x); }); });
        if (u) await setup(u);
        emit('auth', account());
        return true;
      } catch (e) {
        console.warn('Online no disponible', e);
        return false;
      }
    })();
    return inited;
  }
  // ------------------------------------------------------------ contador (stats.html)
  // Solo números por día: visitas, partidas, jugadores distintos y cuentas nuevas. Nada personal.
  const day = () => new Date(Date.now() + offset).toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' });
  const testing = /^(localhost|127\.0\.0\.1)$/.test(location.hostname); // las pruebas en local no cuentan
  // Cuántas lecturas y escrituras de Firestore hace este navegador (aprox.): se suman cada 2 min en
  // stats/<día>/fs/{r,w} para ver en stats.html si el día se acerca al límite gratis (50.000 / 20.000),
  // y por tipo (según la colección) en stats/<día>/fsr/<tipo> y fsw/<tipo> para ver qué gasta más
  const FS_KIND = (path) => {
    const p = String(path || '').split('/');
    if (p[0] === 'cache') return 'ranking';
    if (p[0] === 'users') return p[2] === 'private' ? 'nube' : p.length >= 2 ? 'perfil' : 'jugadores';
    if (p[0] === 'clans') return p[2] === 'chat' ? 'chatclan' : 'clanes';
    if (p[0] === 'friendReqs') return 'amistad';
    if (p[0] === 'names') return 'nombres';
    if (p[0] === 'gifts') return 'regalos';
    return 'otros';
  };
  function countFirestore() {
    if (testing) return;
    const n = { r: 0, w: 0 }, by = { r: {}, w: {} };
    const add = (kind, path, c) => { n[kind] += c; const k = FS_KIND(path); by[kind][k] = (by[kind][k] || 0) + c; };
    const qPath = (q) => { try { return q._delegate._query.path.canonicalString(); } catch (e) { return ''; } };
    const wrap = (proto, name, kind, cnt, pathOf) => {
      const f = proto && proto[name];
      if (!f || f._pv) return;
      proto[name] = function (...a) {
        const p = f.apply(this, a), path = pathOf(this);
        if (p && p.then) p.then((x) => add(kind, path, cnt ? cnt(x) : 1), () => {});
        return p;
      };
      proto[name]._pv = true;
    };
    const F = fb.firestore, docPath = (d) => d.path;
    wrap(F.DocumentReference.prototype, 'get', 'r', null, docPath);
    wrap(F.Query.prototype, 'get', 'r', (q) => Math.max(1, (q && q.size) || 0), qPath);
    for (const m of ['set', 'update', 'delete']) wrap(F.DocumentReference.prototype, m, 'w', null, docPath);
    wrap(F.CollectionReference && F.CollectionReference.prototype, 'add', 'w', null, qPath);
    // escuchas en directo (chat del clan): cada documento que llega es una lectura
    const os = F.Query.prototype.onSnapshot;
    if (os && !os._pv) {
      F.Query.prototype.onSnapshot = function (...a) {
        const path = qPath(this), i = a.findIndex((x) => typeof x === 'function');
        if (i >= 0) { const next = a[i]; a[i] = (snap) => { try { add('r', path, Math.max(1, snap.docChanges().length)); } catch (e) {} return next(snap); }; }
        return os.apply(this, a);
      };
      F.Query.prototype.onSnapshot._pv = true;
    }
    setInterval(() => {
      for (const k of ['r', 'w']) {
        const v = Math.min(n[k], 2000);
        if (!v) continue;
        n[k] -= v;
        rtdb.ref('stats/' + day() + '/fs/' + k).set(fb.database.ServerValue.increment(v)).catch(() => {});
        for (const t in by[k]) {
          const x = Math.min(by[k][t], 2000);
          if (!x) continue;
          by[k][t] -= x;
          rtdb.ref('stats/' + day() + '/fs' + k + '/' + t).set(fb.database.ServerValue.increment(x)).catch(() => {});
        }
      }
      // descargas de la Realtime Database (en KB, aprox.) por tipo: stats/<día>/dl/<tipo>
      for (const k in dl) {
        const v = Math.min(Math.floor(dl[k] / 1024), 100000);
        if (!v) continue;
        dl[k] -= v * 1024;
        rtdb.ref('stats/' + day() + '/dl/' + k).set(fb.database.ServerValue.increment(v)).catch(() => {});
      }
    }, 120000);
  }
  const dl = {};
  function noteDl(kind, bytes) { dl[kind] = (dl[kind] || 0) + bytes; }

  function bump(path) {
    if (!rtdb || testing) return;
    rtdb.ref('stats/' + day() + '/' + path).set(fb.database.ServerValue.increment(1)).catch(() => {});
  }
  // de dónde viene la visita: ?from=... (itch, minijuegos…) o la web que la ha enlazado
  function visitSource() {
    const from = new URLSearchParams(location.search).get('from');
    if (from && /^[a-z]+$/.test(from)) return from;
    let host = '';
    try { host = document.referrer ? new URL(document.referrer).hostname : ''; } catch (e) {}
    if (!host || host.endsWith('pokeversus.com')) return 'directo';
    const known = [['tiktok', 'tiktok'], ['itch', 'itch'], ['minijuegos', 'minijuegos'], ['miniplay', 'minijuegos'], ['google', 'google'],
      ['youtube', 'youtube'], ['youtu.be', 'youtube'], ['instagram', 'instagram'], ['t.co', 'x'], ['twitter', 'x'], ['x.com', 'x'],
      ['reddit', 'reddit'], ['facebook', 'facebook'], ['bing', 'google'], ['duckduckgo', 'google']];
    const k = known.find(([part]) => host.includes(part));
    return k ? k[1] : 'otros';
  }
  function countVisit() {
    try { if (sessionStorage.getItem('pb.visit')) return; sessionStorage.setItem('pb.visit', '1'); } catch (e) {}
    bump('visits');
    const src = visitSource();
    if (SOURCES.includes(src)) bump('src/' + src);
  }
  const SOURCES = ['directo', 'tiktok', 'itch', 'minijuegos', 'google', 'youtube', 'instagram', 'x', 'reddit', 'facebook', 'otros'];
  // el primer registro del día de cada jugador suma uno a "players" (la lista no se puede leer)
  function countPlayer() {
    if (!rtdb || !uid || testing) return;
    rtdb.ref('statsSeen/' + day() + '/' + uid).set(true).then(() => bump('players')).catch(() => {});
  }
  // gente conectada ahora mismo: una marca por pestaña, sin datos de la cuenta.
  // 'm' = en el menú, 's:<modo>' = buscando partida, 'p:<modo>' = jugando. Se borra sola al cerrar.
  // (las versiones viejas del juego ponen 1 = menú y 2 = jugando)
  //
  // Para saber cuánta gente hay NO se escucha la lista entera (cada cambio le llegaría a todos: con
  // cientos de jugadores eso solo ya se come las descargas del mes). Un solo navegador, el "contador",
  // la escucha y cada pocos segundos deja el resumen en onlineSum = { n, m: { modo: 'jugando,buscando' }, t, by };
  // los demás solo leen ese resumen (y no mientras juegan). Si el contador se va, el primero que vea
  // el resumen viejo (más de 70 s) pasa a serlo.
  let onlineRef = null, onlineState = 'm';
  let live = { total: 0, modes: {} };
  let sid = '', sum = null, sumOff = null, agg = null, aggT = 0, aggKey = '', aggTimer = null, aggWait = null;
  const SUM_OLD = 70000;
  function readSum(v) {
    const modes = {};
    for (const [m, s] of Object.entries((v && v.m) || {})) {
      const [p, q] = String(s).split(',').map((x) => x | 0);
      modes[m] = { play: p, search: q };
    }
    live = { total: (v && v.n) | 0, modes };
    emit('live', live);
  }
  function watchSum(on) {
    if (on && !sumOff) {
      const ref = rtdb.ref('onlineSum');
      const cb = ref.on('value', (s) => {
        sum = s.val();
        noteDl('online', 150);
        if (sum && !agg) readSum(sum);
      }, () => { sum = null; });
      sumOff = () => ref.off('value', cb);
    } else if (!on && sumOff) { sumOff(); sumOff = null; sum = null; }
  }
  // ser el contador: escucho la lista y escribo el resumen (como mucho cada 15 s, y cada 30 s aunque no cambie)
  function startAgg() {
    if (agg) return;
    const ref = rtdb.ref('online');
    const cb = ref.on('value', (s) => {
      const all = Object.values(s.val() || {});
      noteDl('online', 40);
      const modes = {};
      for (const v of all) {
        const m = typeof v === 'string' && /^[ps]:/.test(v) ? v.slice(2) : null;
        if (!m) continue;
        modes[m] = modes[m] || { play: 0, search: 0 };
        modes[m][v[0] === 'p' ? 'play' : 'search']++;
      }
      live = { total: all.length, modes };
      emit('live', live);
      if (!testing) notePeak(all.length);
      writeSum();
    });
    agg = () => ref.off('value', cb);
  }
  function stopAgg() { if (agg) agg(); agg = null; clearTimeout(aggTimer); aggTimer = null; }
  function writeSum(force) {
    if (!agg) return;
    const m = {};
    for (const [k, v] of Object.entries(live.modes)) m[k] = v.play + ',' + v.search;
    const key = JSON.stringify([live.total, m]);
    const wait = 15000 - (Date.now() - aggT);
    if (!force && key === aggKey) return;
    if (wait > 0) { if (!aggTimer) aggTimer = setTimeout(() => { aggTimer = null; writeSum(true); }, wait); return; }
    aggKey = key;
    aggT = Date.now();
    rtdb.ref('onlineSum').set({ n: live.total, m, t: fb.database.ServerValue.TIMESTAMP, by: sid }).catch(() => {});
  }
  function sumTick() {
    const playing = onlineState[0] === 'p' || document.hidden;
    // mientras juegas (o con la pestaña escondida) no hace falta saber cuánta gente hay (y el contador lo deja para otro)
    watchSum(!playing);
    if (playing) { stopAgg(); return; }
    const stale = !sum || now() - (sum.t || 0) > SUM_OLD;
    if (sum && sum.by && sum.by !== sid && !stale) { stopAgg(); readSum(sum); return; }
    if (!agg) {
      // (cada uno espera un rato al azar y lo vuelve a mirar, para que no se pongan todos a la vez)
      if (stale && !aggWait) aggWait = setTimeout(() => {
        aggWait = null;
        if (onlineState[0] !== 'p' && !document.hidden && (!sum || now() - (sum.t || 0) > SUM_OLD)) startAgg();
      }, Math.random() * 20000);
      return;
    }
    if (Date.now() - aggT > 30000) writeSum(true);
  }
  function goOnline() {
    if (!rtdb) return;
    sid = Array.from({ length: 12 }, () => 'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 36)]).join('');
    watchSum(true);
    setInterval(sumTick, 10000);
    document.addEventListener('visibilitychange', sumTick);
    setTimeout(sumTick, 3000);
    if (testing) return;
    // media diaria: cada 2 minutos (hora de Madrid) el contador apunta cuánta gente hay; solo vale la primera foto
    let lastSlot = -1;
    setInterval(() => {
      const [h, m] = new Date(Date.now() + offset).toLocaleTimeString('en-GB', { timeZone: 'Europe/Madrid', hour12: false }).split(':').map(Number);
      const slot = h * 30 + Math.floor(m / 2);
      if (slot === lastSlot || !live.total || !agg) return;
      lastSlot = slot;
      // (las reglas solo dejan escribirla una vez: si ya estaba, falla sin gastar nada)
      rtdb.ref('stats/' + day() + '/online/' + slot).set(live.total).catch(() => {});
    }, 30000);
    onlineRef = rtdb.ref('online/' + sid);
    // al reconectar (móvil que vuelve de segundo plano) se vuelve a apuntar
    rtdb.ref('.info/connected').on('value', (s) => {
      if (!s.val()) return;
      onlineRef.onDisconnect().remove().then(() => onlineRef.set(onlineState)).catch(() => {});
    });
  }
  // récord de jugadores a la vez (de siempre y de cada día): solo se escribe si se supera
  let peakSeen = 0;
  function notePeak(n) {
    if (n <= peakSeen) return;
    peakSeen = n;
    const up = (cur) => (cur == null || n > cur ? n : undefined);
    rtdb.ref('stats/' + day() + '/peak').transaction(up).catch(() => {});
    rtdb.ref('statsPeak').transaction((cur) => (!cur || n > (cur.n || 0) ? { n, t: now() } : undefined)).catch(() => {});
  }
  function setOnline(st) {
    if (st === onlineState) return;
    onlineState = st;
    if (onlineRef) onlineRef.set(st).catch(() => {});
    if (sid) sumTick();
  }
  const setPlaying = (on, mode) => setOnline(on && /^[a-z]+$/.test(mode || '') ? 'p:' + mode : 'm');
  const setSearching = (mode) => setOnline(mode ? 's:' + mode : 'm');

  // Ideas y bugs: se guardan en feedback/ (solo el administrador puede leerlas, en buzon.html)
  async function sendFeedback(kind, text) {
    if (!(await start())) return err('Sin conexión.');
    text = String(text || '').trim().slice(0, 600);
    if (text.length < 5) return err('Escribe un poco más.');
    const d = PB.Save.get();
    await rtdb.ref('feedback').push({
      kind: kind === 'idea' ? 'idea' : 'bug', text, name: clean(d.name || '', 16), uid,
      v: PB.VERSION || '', lang: PB.lang || '', mobile: !!(window.matchMedia && matchMedia('(pointer: coarse)').matches),
      t: fb.database.ServerValue.TIMESTAMP,
    });
    return { ok: true };
  }

  // Reportar a un jugador: llega al mismo buzón (como fallo, con los datos del reportado)
  const reported = new Set();
  async function reportPlayer(target, name, msg) {
    if (!(await start())) return err('Sin conexión.');
    if (reported.has(target)) return { ok: true }; // una vez por jugador y sesión
    reported.add(target);
    const d = PB.Save.get();
    const text = ('🚩 Reporte a ' + clean(name || '?', 16) + (msg ? ': «' + String(msg).slice(0, 200) + '»' : '')).slice(0, 600);
    await rtdb.ref('feedback').push({
      kind: 'bug', text, report: { uid: String(target).slice(0, 64), name: clean(name || '', 16) }, name: clean(d.name || '', 16), uid,
      v: PB.VERSION || '', lang: PB.lang || '', mobile: !!(window.matchMedia && matchMedia('(pointer: coarse)').matches),
      t: fb.database.ServerValue.TIMESTAMP,
    });
    return { ok: true };
  }

  function countMatch(mode) {
    bump('matches');
    if (/^[a-z]+$/.test(mode || '')) bump('modes/' + mode);
    countPlayer();
  }

  async function start() {
    await init();
    if (ready) await ready;
    return !!uid;
  }
  // Regalos del creador: si hay uno para mí, se borra (para no cobrarlo dos veces) y se dan los premios
  async function claimGifts() {
    const ref = fs.collection('gifts').doc(uid);
    const s = await ref.get();
    if (!s.exists) return;
    const g = s.data();
    await ref.delete();
    const got = PB.Save.applyGift(Array.isArray(g.items) ? g.items.slice(0, 20) : []);
    if (got.length) emit('gift', { items: got, msg: clean(g.msg || '', 120) });
  }
  // (solo el creador) mandar un regalo a un jugador: items = [{ kind: 'pokemon', id } | { kind: 'coins'|'points'|'rainbow', n }]
  async function sendGift(toUid, items, msg) {
    if (!(await start())) return err('Sin conexión.');
    await fs.collection('gifts').doc(String(toUid)).set({ items, msg: msg || '', t: Date.now() });
    return { ok: true };
  }

  // con sesión: presencia, invitaciones y perfil
  function setup(u) {
    user = u;
    uid = u.uid;
    ready = (async () => {
      presence();
      listenInvites();
      await syncProfile(true).catch(() => {});
      if (!isGuest()) processAccepted().catch(() => {});
      if (!isGuest()) syncCloud().catch(() => {});
      claimGifts().catch(() => {});
      checkTagBan().catch(() => {});
      checkPoll().catch(() => {});
      emit('ready');
    })();
    return ready;
  }
  // "Jugar como invitado": cuenta anónima (solo si no había ninguna)
  async function guest() {
    if (!(await init())) return false;
    if (uid) return true;
    try {
      const r = await auth.signInAnonymously();
      await setup(r.user);
      bump('guests');
      return true;
    } catch (e) { return false; }
  }
  // Tras entrar en una cuenta que ya existía: si tenía partida guardada se devuelve para cargarla;
  // si no, el progreso de este navegador pasa a esa cuenta. Luego se recarga la página.
  async function enteredExisting(u, extra) {
    user = u;
    uid = u.uid;
    const s = await fs.collection('users').doc(uid).collection('private').doc('save').get();
    if (s.exists) return Object.assign({ ok: true, switched: true, save: s.data().json }, extra);
    await fs.collection('users').doc(uid).collection('private').doc('save').set({ json: JSON.stringify(PB.Save.get()), t: Date.now() });
    return Object.assign({ ok: true, switched: true, save: null }, extra);
  }

  // ------------------------------------------------------------ conectado / desconectado
  function presence() {
    const ref = rtdb.ref('status/' + uid);
    rtdb.ref('.info/connected').on('value', (s) => {
      if (!s.val()) return;
      ref.onDisconnect().remove().then(() => ref.set({ name: myName(), fav: PB.Save.get().selected, t: fb.database.ServerValue.TIMESTAMP }));
    });
  }
  const isOnline = async (id) => (await rtdb.ref('status/' + id).once('value')).exists();

  // ------------------------------------------------------------ perfil
  const myName = () => clean(PB.Save.get().name, 16) || 'Entrenador';
  let lastProfile = '';
  let myDoc = { friends: [], clan: null };

  const isGuest = () => !user || user.isAnonymous;
  // (como mucho una escritura del perfil cada 3 minutos; lo que cambie entre medias va en la siguiente)
  let profWT = 0, profLater = null;
  async function syncProfile(first, force) {
    if (!uid || isGuest()) return;
    const d = PB.Save.get();
    let stored = null;
    if (first) {
      const s = await fs.collection('users').doc(uid).get();
      if (s.exists) myDoc = Object.assign({ friends: [] }, s.data());
      if (s.exists) stored = s.data();
    }
    // los 3 Pokémon con más copas (para el perfil público y el ranking por Pokémon)
    const best = Object.entries(d.copas || {}).filter(([id, c]) => c > 0 && PB.brawlerById(id)).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([id, c]) => ({ id, c }));
    const p = { name: myName(), nameLower: myName().toLowerCase(), tag: d.tag, copas: PB.Save.totalCopas(), fav: d.avatar || d.selected, clan: myDoc.clan || null, clanName: myDoc.clanName || '',
      best, bestCopas: best.length ? best[0].c : 0, pc: Object.fromEntries(Object.entries(d.copas || {}).filter(([id, c]) => c > 0 && PB.brawlerById(id))), played: (d.stats && d.stats.played) || 0, wins: (d.stats && d.stats.wins) || 0, owned: Object.keys(d.owned || {}).length,
      streak: (d.stats && d.stats.streak) || 0, bestStreak: (d.stats && d.stats.bestStreak) || 0, tg: myTag().tg || '', tc: myTag().tc || 0 };
    // (las copas por Pokémon se ordenan para comparar igual que lo que ya hay guardado)
    const keyOf = (o) => JSON.stringify(Object.keys(p).map((k) => (k === 'pc' ? Object.entries(o.pc || {}).sort() : o[k] === undefined ? null : o[k])));
    const key = keyOf(p);
    if (stored && keyOf(stored) === key) lastProfile = key; // al entrar, si el perfil guardado ya está al día no se reescribe
    Object.assign(myDoc, p);
    if (key === lastProfile) return;
    const wait = 180000 - (Date.now() - profWT);
    if (!first && !force && wait > 0) {
      if (!profLater) profLater = setTimeout(() => { profLater = null; syncProfile(false, true).catch(() => {}); }, wait);
      return;
    }
    profWT = Date.now();
    lastProfile = key;
    await fs.collection('users').doc(uid).set(Object.assign({ t: fb.firestore.FieldValue.serverTimestamp() }, p), { merge: true });
  }
  let profT = null;
  const syncSoon = () => { clearTimeout(profT); profT = setTimeout(() => syncProfile().catch(() => {}), 4000); };

  const viewUser = (id, u) => ({
    id, name: clean(u.name, 16), tag: clean(u.tag, 8), copas: u.copas | 0,
    fav: PB.brawlerById(u.fav) ? u.fav : PB.BRAWLERS[0].id, clan: u.clan || null, clanName: clean(u.clanName, 20), me: id === uid,
    best: (Array.isArray(u.best) ? u.best : []).filter((x) => x && PB.brawlerById(x.id)).slice(0, 3).map((x) => ({ id: x.id, c: x.c | 0 })),
    bestCopas: u.bestCopas | 0, played: u.played | 0, wins: u.wins | 0, owned: u.owned | 0, streak: u.streak | 0, bestStreak: u.bestStreak | 0,
    tg: PB.Chat.cleanTag(u.tg), tc: u.tc | 0,
  });

  // Perfiles de otros jugadores (amigos, miembros de un clan...): cada uno es una lectura, así que se
  // guardan 15 minutos (también al recargar) y solo se piden los que falten o estén viejos.
  const USER_TTL = 900000;
  let userCache = {};
  try { userCache = JSON.parse(localStorage.getItem('pb.users') || '{}') || {}; } catch (e) { userCache = {}; }
  let userSaveT = null;
  const saveUserCache = () => {
    clearTimeout(userSaveT);
    userSaveT = setTimeout(() => {
      const keys = Object.keys(userCache).sort((a, b) => userCache[b].t - userCache[a].t).slice(0, 300);
      const keep = {};
      for (const k of keys) keep[k] = userCache[k];
      userCache = keep;
      try { localStorage.setItem('pb.users', JSON.stringify(keep)); } catch (e) {}
    }, 1000);
  };
  async function usersByIds(ids, fresh) {
    const now0 = Date.now(), out = [], need = [];
    for (const id of ids) {
      const c = userCache[id];
      if (!fresh && c && now0 - c.t < USER_TTL) out.push(Object.assign({}, c.v, { me: id === uid }));
      else need.push(id);
    }
    for (let i = 0; i < need.length; i += 10) {
      const part = need.slice(i, i + 10);
      const q = await fs.collection('users').where(fb.firestore.FieldPath.documentId(), 'in', part).get();
      q.forEach((s) => { const v = viewUser(s.id, s.data()); userCache[s.id] = { t: now0, v }; out.push(Object.assign({}, v)); });
    }
    if (need.length) saveUserCache();
    return out;
  }

  // ------------------------------------------------------------ copia del progreso en la nube
  let saveT = null, lastCloud = '';
  function writeCloud() {
    saveT = null;
    if (!uid || !user || user.isAnonymous) return;
    // (si no ha cambiado nada desde la última copia, no se gasta la escritura)
    const json = JSON.stringify(PB.Save.get());
    if (json === lastCloud) return;
    lastCloud = json;
    fs.collection('users').doc(uid).collection('private').doc('save')
      .set({ json, t: Date.now() }).catch(() => { lastCloud = ''; });
  }
  // al cerrar o esconder el juego, lo que faltaba por copiar se copia ya (si no, al entrar desde
  // otro móvil u ordenador faltaba lo de los últimos minutos)
  document.addEventListener('visibilitychange', () => { if (document.hidden && saveT) { clearTimeout(saveT); writeCloud(); } });
  function saveCloud(soon) {
    if (!uid || !user || user.isAnonymous) return;
    clearTimeout(saveT);
    saveT = setTimeout(writeCloud, soon ? 500 : 240000); // (al acabar cada partida se guarda enseguida; si no, cada 4 min como mucho: el plan gratis tiene un límite de escrituras al día)
  }

  // Misma cuenta en varios dispositivos (PC y móvil): al entrar, y al volver al juego tras un rato, se mira
  // la copia de la nube y se queda la más nueva. Antes cada dispositivo seguía con lo suyo y el último en
  // guardar pisaba al otro. (Copias de antes sin hora: gana la que tenga más partidas jugadas.)
  let lastSync = 0;
  async function syncCloud() {
    if (!uid || isGuest()) return;
    lastSync = Date.now();
    const s = await fs.collection('users').doc(uid).collection('private').doc('save').get();
    if (!s.exists) return saveCloud(true);
    const c = s.data() || {}, local = PB.Save.get();
    let cloud = null;
    try { cloud = JSON.parse(c.json || 'null'); } catch (e) { cloud = null; }
    if (!cloud) return;
    const played = (x) => (x && x.stats && x.stats.played) || 0;
    const cloudT = cloud.savedAt || c.t || 0, localT = local.savedAt || 0;
    const cloudNewer = local.savedAt && cloud.savedAt ? cloudT > localT + 2000 : played(cloud) > played(local);
    if (cloudNewer) {
      lastCloud = c.json;
      PB.Save.importJSON(c.json, cloudT);
      emit('cloudLoaded');
    } else if (c.json !== JSON.stringify(local)) saveCloud(true);
  }
  // (volver a la pestaña después de 10 minutos o más: se vuelve a mirar)
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && uid && !isGuest() && Date.now() - lastSync > 600000 && !(PB.Match && PB.Match.busy)) syncCloud().catch(() => {});
  });

  // Vincular con Google: el progreso de este navegador pasa a esa cuenta.
  // Si la cuenta de Google ya tenía partida guardada, se puede recuperar.
  async function loginGoogle() {
    if (!(await init())) return err('Sin conexión.');
    const prov = new fb.auth.GoogleAuthProvider();
    try {
      if (!auth.currentUser) {
        // sin sesión: entrar (o registrarse) directamente con Google
        const r = await auth.signInWithPopup(prov);
        if (r.additionalUserInfo && r.additionalUserInfo.isNewUser) bump('signups');
        return enteredExisting(r.user, { email: r.user.email });
      }
      const r = await auth.currentUser.linkWithPopup(prov);
      user = r.user;
      bump('signups');
      saveCloud(true);
      lastProfile = '';
      await user.getIdToken(true).catch(() => {}); // el permiso de "registrado" va en el token
      syncProfile(true).catch(() => {});
      return { ok: true, email: user.email };
    } catch (e) {
      if (e.code === 'auth/credential-already-in-use' && e.credential) {
        const r = await auth.signInWithCredential(e.credential);
        return enteredExisting(r.user, { email: r.user.email });
      }
      if (e.code === 'auth/popup-closed-by-user' || e.code === 'auth/cancelled-popup-request') return { cancelled: true };
      return err('No se ha podido iniciar sesión.');
    }
  }
  // Correo y contraseña. "Crear cuenta" convierte la cuenta de invitado (se queda el progreso);
  // "Entrar" abre una cuenta que ya existía (y se puede recuperar su progreso de la nube).
  const mailErr = (e) => {
    const c = e && e.code;
    if (c === 'auth/email-already-in-use' || c === 'auth/credential-already-in-use') return err('Ese correo ya tiene cuenta. Pulsa Entrar.');
    if (c === 'auth/invalid-email') return err('Ese correo no es válido.');
    if (c === 'auth/weak-password') return err('La contraseña debe tener al menos 6 caracteres.');
    if (c === 'auth/wrong-password' || c === 'auth/invalid-credential' || c === 'auth/user-not-found' || c === 'auth/invalid-login-credentials') return err('Correo o contraseña incorrectos.');
    if (c === 'auth/too-many-requests') return err('Demasiados intentos. Prueba más tarde.');
    return err('No se ha podido iniciar sesión.');
  };
  async function emailAccount(email, pass, create) {
    if (!(await init())) return err('Sin conexión.');
    email = String(email || '').trim();
    try {
      if (create) {
        if (!auth.currentUser) {
          const r = await auth.createUserWithEmailAndPassword(email, pass);
          bump('signups');
          return enteredExisting(r.user, { email });
        }
        const cred = fb.auth.EmailAuthProvider.credential(email, pass);
        const r = await auth.currentUser.linkWithCredential(cred);
        user = r.user;
        bump('signups');
        saveCloud(true);
        lastProfile = '';
        await user.getIdToken(true).catch(() => {});
        syncProfile(true).catch(() => {});
        return { ok: true, email };
      }
      const r = await auth.signInWithEmailAndPassword(email, pass);
      return enteredExisting(r.user, { email });
    } catch (e) { return mailErr(e); }
  }
  async function resetPassword(email) {
    if (!(await init())) return err('Sin conexión.');
    try {
      auth.languageCode = PB.lang || 'es';
      await auth.sendPasswordResetEmail(String(email || '').trim());
      return { ok: true };
    } catch (e) { return mailErr(e); }
  }

  async function logout() {
    if (!auth) return;
    try { localStorage.removeItem('pb.account'); } catch (e) {}
    // el progreso ya queda en la cuenta; en este navegador se empieza de cero
    if (user && !user.isAnonymous) {
      await fs.collection('users').doc(uid).collection('private').doc('save')
        .set({ json: JSON.stringify(PB.Save.get()), t: Date.now() }).catch(() => {});
    }
    clearTimeout(saveT);
    user = null;
    await auth.signOut();
    try {
      localStorage.removeItem('pb.save.v1');
    } catch (e) {}
    location.reload();
  }
  const account = () => (user ? { anonymous: user.isAnonymous, email: user.email || '', name: user.displayName || '' } : null);

  // ------------------------------------------------------------ nombres únicos
  // names/<nombre en minúsculas> = { uid, name }. Solo las cuentas registradas reservan su nombre;
  // a los invitados solo se les comprueba que no esté cogido.
  const NAME_RE = /^[\p{L}\p{N} _.-]{3,16}$/u;
  async function claimName(name) {
    name = String(name || '').trim().replace(/\s+/g, ' ');
    if (!NAME_RE.test(name)) return err('El nombre debe tener entre 3 y 16 letras o números.');
    if (!(await start())) return { ok: true, name, offline: true };
    const key = name.toLowerCase();
    const ref = fs.collection('names').doc(key);
    const s = await ref.get().catch(() => null);
    if (s && s.exists && s.data().uid !== uid) return err('Ese nombre ya lo tiene otro jugador. Prueba con otro.');
    if (isGuest() || (s && s.exists)) return { ok: true, name };
    try { await ref.set({ uid, name }); } catch (e) { return err('Ese nombre ya lo tiene otro jugador. Prueba con otro.'); }
    // se libera el nombre anterior
    if (myDoc.nameKey && myDoc.nameKey !== key) fs.collection('names').doc(myDoc.nameKey).delete().catch(() => {});
    myDoc.nameKey = key;
    fs.collection('users').doc(uid).set({ nameKey: key }, { merge: true }).catch(() => {});
    return { ok: true, name };
  }

  // ------------------------------------------------------------ amigos
  let friendsCache = null, friendsT = 0;
  async function friends(force) {
    if (!(await start()) || isGuest()) return [];
    if (!force && friendsCache && Date.now() - friendsT < 600000) return friendsCache;
    await processAccepted().catch(() => {});
    const ids = (myDoc.friends || []).slice(0, 100);
    const list = await usersByIds(ids);
    await Promise.all(list.map(async (f) => { f.online = await isOnline(f.id); }));
    friendsCache = list.sort((a, b) => b.online - a.online || b.copas - a.copas);
    friendsT = Date.now();
    return friendsCache;
  }

  // (la lobby lo pide cada vez que se actualiza: se guarda 10 minutos para no gastar lecturas)
  let reqCache = null, reqT = 0;
  async function requests(force) {
    if (!(await start()) || isGuest()) return [];
    if (!force && reqCache && Date.now() - reqT < 600000) return reqCache;
    reqT = Date.now();
    reqCache = await requestsNow().catch(() => reqCache || []);
    return reqCache;
  }
  async function requestsNow() {
    const q = await fs.collection('friendReqs').where('to', '==', uid).where('status', '==', 'pending').limit(30).get();
    const out = [];
    q.forEach((s) => { const d = s.data(); out.push({ id: d.from, name: clean(d.fromName, 16), copas: d.fromCopas | 0, fav: PB.brawlerById(d.fromFav) ? d.fromFav : PB.BRAWLERS[0].id }); });
    return out;
  }

  // solicitudes que yo envié y ya aceptaron: los añado a mi lista
  async function processAccepted() {
    const q = await fs.collection('friendReqs').where('from', '==', uid).where('status', '==', 'accepted').limit(30).get();
    if (q.empty) return;
    const add = [];
    q.forEach((s) => add.push(s.data().to));
    myDoc.friends = [...new Set([...(myDoc.friends || []), ...add])];
    await fs.collection('users').doc(uid).set({ friends: myDoc.friends }, { merge: true });
    await Promise.all(q.docs.map((s) => s.ref.delete()));
    friendsCache = null;
    emit('change');
  }

  async function searchPlayers(q) {
    if (!(await start())) return [];
    const s = clean(q, 16).toLowerCase();
    if (s.length < 2) return [];
    let res;
    if (s.startsWith('#')) res = await fs.collection('users').where('tag', '==', s.toUpperCase()).limit(5).get();
    else res = await fs.collection('users').orderBy('nameLower').startAt(s).endAt(s + '').limit(12).get();
    const sent = await fs.collection('friendReqs').where('from', '==', uid).limit(50).get();
    const sentTo = new Set(sent.docs.map((d) => d.data().to));
    const out = [];
    res.forEach((d) => { if (d.id !== uid) out.push(Object.assign(viewUser(d.id, d.data()), { friend: (myDoc.friends || []).includes(d.id), sent: sentTo.has(d.id) })); });
    await Promise.all(out.map(async (p) => { p.online = await isOnline(p.id); }));
    return out;
  }

  async function addFriend(id) {
    if (!(await start())) return err('Sin conexión.');
    if ((myDoc.friends || []).includes(id)) return err('Ya sois amigos.');
    if ((myDoc.friends || []).length >= 100) return err('Has llegado al máximo de amigos.');
    // si esa persona ya me lo había pedido, se acepta directamente
    const back = await fs.collection('friendReqs').doc(uid + '_' + id).get();
    if (back.exists) return answerRequest(id, true);
    const d = PB.Save.get();
    await fs.collection('friendReqs').doc(id + '_' + uid).set({ from: uid, to: id, fromName: myName(), fromCopas: PB.Save.totalCopas(), fromFav: d.selected, status: 'pending', t: Date.now() });
    return { ok: true };
  }

  async function answerRequest(id, accept) {
    if (!(await start())) return err('Sin conexión.');
    const ref = fs.collection('friendReqs').doc(uid + '_' + id);
    if (accept) {
      myDoc.friends = [...new Set([...(myDoc.friends || []), id])];
      await fs.collection('users').doc(uid).set({ friends: myDoc.friends }, { merge: true });
      await ref.update({ status: 'accepted' });
      friendsCache = null;
    } else await ref.delete();
    return { ok: true };
  }

  async function removeFriend(id) {
    if (!(await start())) return err('Sin conexión.');
    myDoc.friends = (myDoc.friends || []).filter((x) => x !== id);
    await fs.collection('users').doc(uid).set({ friends: myDoc.friends }, { merge: true });
    friendsCache = null;
    return { ok: true };
  }

  // ------------------------------------------------------------ ranking (se guarda 10 minutos, también al recargar:
  // cada vez que se pide son 50 lecturas y el plan gratis tiene un límite al día).
  // Además se comparte entre todos: el primero que lo pide pasado el rato hace la consulta de 50 y deja
  // el resultado en cache/<ranking> (1 documento); los demás leen solo ese documento (1 lectura).
  const rankCache = {};
  const RANK_TTL = 900000, SHARED_TTL = 1800000;
  // (lo que viene del documento compartido lo ha escrito otro jugador: se vuelve a limpiar todo)
  const safeId = (x) => String(x == null ? '' : x).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64);
  const fixUsers = (v) => v.map((p) => Object.assign(viewUser(safeId(p.id), Object.assign({}, p, { clan: p.clan ? safeId(p.clan) : null })), p && p.c != null ? { c: p.c | 0 } : {}));
  const fixClans = (v) => v.map((c) => viewClan(safeId(c.id), Object.assign({}, c, { members: (Array.isArray(c.memberIds) ? c.memberIds : []).map(safeId), officers: (Array.isArray(c.officers) ? c.officers : []).map(safeId), leader: safeId(c.leader) })));
  async function cached(key, fn, fix) {
    let c = rankCache[key];
    if (!c) try { c = JSON.parse(localStorage.getItem('pb.rank.' + key) || 'null'); } catch (e) { c = null; }
    if (c && Date.now() - c.t < RANK_TTL) return c.v;
    let v = null;
    const ref = fs.collection('cache').doc(key);
    const s = await ref.get().catch(() => null);
    const d = s && s.exists ? s.data() : null;
    if (d && typeof d.v === 'string' && now() - (d.t || 0) < SHARED_TTL) try { v = JSON.parse(d.v); v = Array.isArray(v) ? fix(v.filter((x) => x && typeof x === 'object')).slice(0, 50) : null; } catch (e) { v = null; }
    if (!Array.isArray(v)) {
      v = await fn();
      const json = JSON.stringify(v);
      if (json.length < 60000) ref.set({ t: now(), v: json }).catch(() => {});
    }
    rankCache[key] = { t: Date.now(), v };
    try { localStorage.setItem('pb.rank.' + key, JSON.stringify(rankCache[key])); } catch (e) {}
    return v;
  }
  async function topPlayers() {
    if (!(await start())) return [];
    await syncProfile().catch(() => {});
    const list = await cached('players', async () => {
      const q = await fs.collection('users').orderBy('copas', 'desc').limit(50).get();
      return q.docs.map((s) => viewUser(s.id, s.data()));
    }, fixUsers);
    const out = list.map((p, i) => Object.assign({}, p, { pos: i + 1, me: p.id === uid }));
    if (!out.some((p) => p.me)) out.push(Object.assign(viewUser(uid, myDoc), { me: true, pos: '50+' }));
    return out;
  }
  // ranking por Pokémon: los jugadores con más copas en un solo Pokémon
  async function topByPokemon() {
    if (!(await start())) return [];
    await syncProfile().catch(() => {});
    const list = await cached('mons', async () => {
      const q = await fs.collection('users').orderBy('bestCopas', 'desc').limit(50).get();
      return q.docs.map((s) => viewUser(s.id, s.data()));
    }, fixUsers);
    return list.map((p, i) => Object.assign({}, p, { pos: i + 1, me: p.id === uid }));
  }
  // ranking de un Pokémon concreto: quién tiene más copas con él (pc.<id> en el perfil)
  async function topForPokemon(id) {
    if (!(await start()) || !PB.brawlerById(id)) return [];
    await syncProfile().catch(() => {});
    const list = await cached('mon-' + id, async () => {
      const q = await fs.collection('users').orderBy('pc.' + id, 'desc').limit(25).get(); // (de cada Pokémon basta con el top 25)
      return q.docs.map((s) => Object.assign(viewUser(s.id, s.data()), { c: ((s.data().pc || {})[id]) | 0 }));
    }, fixUsers);
    return list.map((p, i) => Object.assign({}, p, { pos: i + 1, me: p.id === uid }));
  }
  // perfil público de un jugador (los invitados no tienen)
  async function getUser(id) {
    if (!(await start()) || !id) return null;
    if (id === uid) { await syncProfile().catch(() => {}); return Object.assign(viewUser(uid, myDoc), { online: true }); }
    // (si se ha visto hace poco, del guardado; si no, una lectura)
    let u = null;
    const c = userCache[id];
    if (c && Date.now() - c.t < USER_TTL) u = Object.assign({}, c.v);
    else {
      const s = await fs.collection('users').doc(id).get().catch(() => null);
      if (!s || !s.exists) return null;
      u = viewUser(id, s.data());
      userCache[id] = { t: Date.now(), v: u };
      saveUserCache();
      u = Object.assign({}, u);
    }
    u.online = await isOnline(id).catch(() => false);
    u.friend = (myDoc.friends || []).includes(id);
    return u;
  }
  async function topClans() {
    if (!(await start())) return [];
    const list = await cached('clans', async () => {
      const q = await fs.collection('clans').orderBy('copas', 'desc').limit(50).get();
      return q.docs.map((s) => viewClan(s.id, s.data()));
    }, fixClans);
    return list.map((c, i) => Object.assign({}, c, { pos: i + 1 }));
  }

  // ------------------------------------------------------------ clanes
  const viewClan = (id, c) => ({
    id, name: clean(c.name, 20), desc: clean(c.desc, 80), type: c.type === 'invite' ? 'invite' : 'public',
    icon: /^\d{4}$/.test(c.icon) ? c.icon : '0025', leader: c.leader, copas: c.copas | 0, count: (c.members || []).length, memberIds: c.members || [],
    officers: (c.officers || []).filter((x) => (c.members || []).includes(x)),
  });

  async function clanFull(id) {
    const s = await fs.collection('clans').doc(id).get();
    if (!s.exists) return null;
    const c = viewClan(id, s.data());
    const members = await usersByIds(c.memberIds);
    await Promise.all(members.map(async (m) => { m.online = m.me || (await isOnline(m.id)); }));
    const rank = (m) => (m.id === c.leader ? 0 : c.officers.includes(m.id) ? 1 : 2);
    c.members = members.map((m) => Object.assign(m, { rank: rank(m), role: PB.T(['Líder', 'Colíder', 'Miembro'][rank(m)]) })).sort((a, b) => a.rank - b.rank || b.copas - a.copas);
    // las copas del clan son la suma de las de sus miembros (las actualiza cualquiera que lo mire)
    const sum = members.reduce((s2, m) => s2 + m.copas, 0);
    if (sum !== c.copas && c.memberIds.includes(uid)) { c.copas = sum; fs.collection('clans').doc(id).update({ copas: sum }).catch(() => {}); }
    else c.copas = sum;
    return c;
  }

  async function setMyClan(id, name) {
    clanC = null;
    myDoc.clan = id;
    myDoc.clanName = name || '';
    lastProfile = '';
    await syncProfile(false, true);
  }

  // (mirar el clan cuesta una lectura por miembro: se guarda 5 minutos; al cambiar algo se vuelve a leer)
  let clanC = null, clanCT = 0;
  async function myClan() {
    if (!(await start()) || isGuest()) return null;
    if (clanC && myDoc.clan === clanC.id && Date.now() - clanCT < 300000) return clanC;
    if (!myDoc.clan) {
      const q = await fs.collection('clans').where('members', 'array-contains', uid).limit(1).get().catch(() => null);
      if (!q || q.empty) return null;
      await setMyClan(q.docs[0].id, clean(q.docs[0].data().name, 20));
    }
    const c = await clanFull(myDoc.clan);
    if (!c || !c.memberIds.includes(uid)) { await setMyClan(null); return null; }
    clanC = c;
    clanCT = Date.now();
    return c;
  }
  async function getClan(id) {
    if (!(await start())) return null;
    const c = await clanFull(id);
    if (!c) return null;
    const req = await fs.collection('clans').doc(id).collection('requests').doc(uid).get();
    return Object.assign(c, { pending: req.exists, mine: c.memberIds.includes(uid) });
  }
  async function searchClans(q) {
    if (!(await start())) return [];
    const s = clean(q, 20).toLowerCase();
    const res = s
      ? await fs.collection('clans').orderBy('nameLower').startAt(s).endAt(s + '').limit(20).get()
      : await fs.collection('clans').orderBy('copas', 'desc').limit(20).get();
    return res.docs.map((d) => viewClan(d.id, d.data())).filter((c) => c.count > 0);
  }
  async function createClan({ name, desc, type, icon }) {
    if (!(await start())) return err('Sin conexión.');
    name = clean(name, 20);
    if (myDoc.clan) return err('Ya estás en un clan.');
    if (name.length < 3) return err('El nombre debe tener entre 3 y 20 letras.');
    const dup = await fs.collection('clans').where('nameLower', '==', name.toLowerCase()).limit(1).get();
    if (!dup.empty) return err('Ya existe un clan con ese nombre.');
    if (PB.Save.get().coins < PB.META.clanCost) return err('Necesitas ' + PB.META.clanCost + ' monedas.');
    const ref = fs.collection('clans').doc();
    await ref.set({ name, nameLower: name.toLowerCase(), desc: clean(desc, 80), type: type === 'invite' ? 'invite' : 'public', icon: /^\d{4}$/.test(icon) ? icon : '0025', leader: uid, members: [uid], copas: PB.Save.totalCopas(), t: Date.now() });
    PB.Save.spendCoins(PB.META.clanCost);
    await setMyClan(ref.id, name);
    sysChat(ref.id, PB.T('{name} ha creado el clan', { name: myName() }));
    return { ok: true };
  }
  async function joinClan(id) {
    if (!(await start())) return err('Sin conexión.');
    if (myDoc.clan) return err('Primero abandona tu clan.');
    const ref = fs.collection('clans').doc(id);
    const s = await ref.get();
    if (!s.exists) return err('Ese clan ya no existe.');
    const c = viewClan(id, s.data());
    if (c.count >= MAX()) return err('El clan está lleno.');
    if (c.type === 'invite') {
      await ref.collection('requests').doc(uid).set({ name: myName(), copas: PB.Save.totalCopas(), fav: PB.Save.get().selected, t: Date.now() });
      return { pending: true };
    }
    await ref.update({ members: fb.firestore.FieldValue.arrayUnion(uid) });
    await setMyClan(id, c.name);
    sysChat(id, PB.T('{name} se ha unido al clan', { name: myName() }));
    return { ok: true };
  }
  async function leaveClan() {
    if (!(await start()) || !myDoc.clan) return { ok: true };
    const id = myDoc.clan, ref = fs.collection('clans').doc(id);
    const s = await ref.get();
    if (s.exists) {
      const c = s.data();
      const rest = (c.members || []).filter((m) => m !== uid);
      sysChat(id, PB.T('{name} ha abandonado el clan', { name: myName() }));
      if (!rest.length) await ref.delete();
      else if (c.leader === uid) {
        // el liderazgo pasa al que más copas tenga
        const ms = await usersByIds(rest);
        ms.sort((a, b) => b.copas - a.copas);
        await ref.update({ members: rest, leader: (ms[0] || { id: rest[0] }).id });
      } else await ref.update({ members: fb.firestore.FieldValue.arrayRemove(uid) });
    }
    await setMyClan(null);
    stopChat();
    return { ok: true };
  }
  // Gestión del clan (solo el líder): expulsar, ascender a colíder, bajar a miembro y pasar el liderazgo
  async function clanAction(act, id) {
    if (!(await start()) || !myDoc.clan) return err('Sin conexión.');
    clanC = null;
    const ref = fs.collection('clans').doc(myDoc.clan);
    const s = await ref.get();
    if (!s.exists) return err('Ese clan ya no existe.');
    const c = s.data();
    if (c.leader !== uid) return err('Solo el líder puede hacer esto.');
    if (id === uid || !(c.members || []).includes(id)) return err('Ese jugador ya no está en el clan.');
    const officers = (c.officers || []).filter((x) => x !== id);
    const who = clean(((await usersByIds([id]))[0] || {}).name || '', 16);
    if (act === 'kick') {
      await ref.update({ members: fb.firestore.FieldValue.arrayRemove(id), officers });
      sysChat(myDoc.clan, PB.T('{name} ha sido expulsado del clan', { name: who }));
    } else if (act === 'promote') {
      await ref.update({ officers: officers.concat([id]) });
      sysChat(myDoc.clan, PB.T('{name} ahora es colíder', { name: who }));
    } else if (act === 'demote') {
      await ref.update({ officers });
    } else if (act === 'leader') {
      await ref.update({ leader: id, officers: officers.concat([uid]) });
      sysChat(myDoc.clan, PB.T('{name} es el nuevo líder del clan', { name: who }));
    }
    return { ok: true };
  }

  // ajustes del clan (solo el líder): descripción, tipo y escudo
  async function editClan({ desc, type, icon }) {
    if (!(await start()) || !myDoc.clan) return err('Sin conexión.');
    clanC = null;
    const ref = fs.collection('clans').doc(myDoc.clan);
    const s = await ref.get();
    if (!s.exists) return err('Ese clan ya no existe.');
    if (s.data().leader !== uid) return err('Solo el líder puede hacer esto.');
    const t = type === 'invite' ? 'invite' : 'public';
    await ref.update({ desc: clean(desc, 80), type: t, icon: /^\d{4}$/.test(icon) ? icon : s.data().icon || '0025' });
    if (t !== s.data().type) sysChat(myDoc.clan, PB.T(t === 'invite' ? 'El clan ahora es solo por invitación' : 'El clan ahora es público'));
    return { ok: true };
  }

  // solicitudes para entrar (clanes solo por invitación): las ve y responde el líder
  async function clanRequests() {
    if (!(await start()) || !myDoc.clan) return [];
    const q = await fs.collection('clans').doc(myDoc.clan).collection('requests').limit(30).get().catch(() => null);
    return q ? q.docs.map((d) => ({ id: d.id, name: clean(d.data().name, 16), copas: d.data().copas | 0, fav: PB.brawlerById(d.data().fav) ? d.data().fav : PB.BRAWLERS[0].id })) : [];
  }
  async function answerClanRequest(id, ok) {
    clanC = null;
    const ref = fs.collection('clans').doc(myDoc.clan);
    if (ok) {
      const s = await ref.get();
      if ((s.data().members || []).length >= MAX()) return err('El clan está lleno.');
      // solo entra si sigue sin clan
      const u = await fs.collection('users').doc(id).get();
      if (u.exists && u.data().clan) { await ref.collection('requests').doc(id).delete(); return err('Ya está en otro clan.'); }
      await ref.update({ members: fb.firestore.FieldValue.arrayUnion(id) });
    }
    await ref.collection('requests').doc(id).delete();
    return { ok: true };
  }

  // ------------------------------------------------------------ chat del clan (en directo)
  let chatMsgs = [], chatOff = null, chatClan = null;
  function sysChat(cid, text) {
    fs.collection('clans').doc(cid).collection('chat').add({ uid, name: '', text: clean(text, 140), sys: true, t: Date.now() }).catch(() => {});
  }
  function stopChat() { if (chatOff) chatOff(); chatOff = null; chatClan = null; chatMsgs = []; }
  async function chat() {
    if (!(await start()) || !myDoc.clan) return [];
    if (chatClan !== myDoc.clan) {
      stopChat();
      chatClan = myDoc.clan;
      await new Promise((res) => {
        chatOff = fs.collection('clans').doc(chatClan).collection('chat').orderBy('t', 'desc').limit(40).onSnapshot((q) => {
          chatMsgs = q.docs.map((d) => d.data()).reverse().map((m) => ({ sys: !!m.sys, from: m.uid === uid ? 'me' : m.uid, name: clean(m.name, 16), text: clean(m.text, 140), time: m.t }));
          res();
          emit('chat');
        }, () => res());
      });
    }
    return chatMsgs;
  }
  async function sendChat(text) {
    text = clean(text, 140);
    if (!text || !myDoc.clan || !(await start())) return err('No se puede enviar.');
    await fs.collection('clans').doc(myDoc.clan).collection('chat').add({ uid, name: myName(), text, t: Date.now() });
    return { ok: true };
  }

  // ------------------------------------------------------------ chat general y chat del grupo (Realtime Database)
  // Solo llegan los mensajes nuevos (child_added): así gasta muy poco aunque haya mucha gente.
  // Cada mensaje: { uid, name, text, t, av }. Las reglas obligan a esperar entre mensajes y
  // dejan borrar los propios, los de más de un día (limpieza) y todos al administrador.
  const ADMIN = 'ULFnTGBapaaIUhxmHKgCh9TIm6G3';
  const DAY = 86400000;
  let gMsgs = [], gWatch = null, banned = false;
  let pMsgs = [], pWatch = null, pCode = null, pSince = 0;
  // tag propio del jugador (si tiene): { tg, tc }
  const myTag = () => { const t = PB.Save.get().title, tg = t && PB.Chat.cleanTag(t.t); return tg && !PB.Chat.tagBanned(tg) ? { tg, tc: Math.max(0, Math.min(7, t.c | 0)) } : {}; };
  const avatar = () => { const d = PB.Save.get(), b = PB.brawlerById(d.selected); return String(d.avatarDex || (b ? b.dex : '')).slice(0, 16); };
  const chatMsg = (key, m) => ({ tg: typeof m.tg === 'string' ? m.tg.slice(0, 12) : '', tc: m.tc | 0, id: key, uid: String(m.uid || ''), name: clean(m.name, 16) || 'Entrenador', text: String(m.text || '').slice(0, 120), t: +m.t || 0, av: String(m.av || ''), au: typeof m.au === 'string' ? m.au.slice(0, 30) : '', dur: Math.max(0, Math.min(9, +m.dur || 0)), mine: m.uid === uid });
  function listen(ref, list, ev, since) {
    // (al volver a abrir el chat solo se bajan los mensajes nuevos)
    const q = since ? ref.orderByChild('t').startAt(since + 1).limitToLast(40) : ref.orderByChild('t').limitToLast(40);
    const add = q.on('child_added', (s) => {
      const m = chatMsg(s.key, s.val() || {});
      noteDl('chat', 150 + m.text.length);
      if (ev === 'pchat' && m.t < pSince) return;
      if (list.some((x) => x.id === m.id)) return;
      list.push(m);
      list.sort((a, b) => a.t - b.t);
      if (list.length > 60) list.shift();
      emit(ev, m);
    });
    const del = q.on('child_removed', (s) => {
      const i = list.findIndex((m) => m.id === s.key);
      if (i >= 0) list.splice(i, 1);
      emit(ev);
    });
    return () => { q.off('child_added', add); q.off('child_removed', del); };
  }
  // El chat general solo se escucha mientras está abierto: cada mensaje le llega a todos los que
  // escuchan, y con mucha gente eso gasta muchísimas descargas. Con el chat cerrado, peekChat()
  // mira de vez en cuando solo el último mensaje (para el aviso de mensajes nuevos).
  let chatInit = false;
  const audioGone = new Set();
  async function watchChat() {
    if (gWatch) return true;
    if (!(await start())) return false;
    const last = gMsgs.length ? gMsgs[gMsgs.length - 1].t : 0;
    gWatch = listen(rtdb.ref('chat'), gMsgs, 'gchat', last);
    if (chatInit) return true;
    chatInit = true;
    rtdb.ref('chatBan/' + uid).on('value', (s) => { banned = !!s.val(); }, () => {});
    // limpieza: los mensajes de hace más de un día se borran (cualquiera puede, poco a poco), con su audio
    rtdb.ref('chat').orderByChild('t').endAt(now() - DAY).limitToFirst(10).once('value')
      .then((s) => s.forEach((c) => { c.ref.remove().catch(() => {}); rtdb.ref('chatAudio/' + c.key).remove().catch(() => {}); })).catch(() => {});
    // los audios duran una hora (se borran sabiendo su id por el mensaje, sin tener que bajarlos)
    setTimeout(() => {
      for (const m of gMsgs) if (m.au && m.t < now() - 3600000 && !audioGone.has(m.au)) { audioGone.add(m.au); rtdb.ref('chatAudio/' + m.au).remove().catch(() => {}); }
    }, 3000);
    return true;
  }
  function unwatchChat() { if (gWatch) gWatch(); gWatch = null; }
  // el último mensaje del chat general (1 mensaje, no la lista)
  async function peekChat() {
    if (!(await start())) return null;
    const s = await rtdb.ref('chat').orderByChild('t').limitToLast(1).once('value').catch(() => null);
    let m = null;
    if (s) s.forEach((c) => { m = chatMsg(c.key, c.val() || {}); });
    noteDl('chat', 200);
    return m;
  }
  async function sendGlobalChat(text) {
    if (!(await start())) return err('Sin conexión.');
    if (banned) return err('No puedes escribir en el chat.');
    text = String(text || '').slice(0, 120);
    if (!text) return err('Escribe algo.');
    const TS = fb.database.ServerValue.TIMESTAMP;
    const key = rtdb.ref('chat').push().key;
    const msg = Object.assign({ uid, name: myName(), text, t: TS, av: avatar() }, myTag());
    try {
      await rtdb.ref().update({ ['chat/' + key]: msg, ['chatLast/' + uid]: TS });
    } catch (e) {
      // (por si las reglas del servidor aún no admiten el tag: se reintenta sin él)
      if (!msg.tg) return err('Espera un poco antes de enviar otro mensaje.');
      try { await rtdb.ref().update({ ['chat/' + key]: { uid, name: myName(), text, t: TS, av: avatar() }, ['chatLast/' + uid]: TS }); } catch (e2) { return err('Espera un poco antes de enviar otro mensaje.'); }
    }
    return { ok: true };
  }
  // nota de voz: el audio va aparte (chatAudio/<id>) y el mensaje lo enlaza; se escriben a la vez
  async function sendVoice(data, mime, dur) {
    if (!(await start())) return err('Sin conexión.');
    if (banned) return err('No puedes escribir en el chat.');
    if (!data || data.length > 60000) return err('El audio es demasiado largo.');
    const TS = fb.database.ServerValue.TIMESTAMP;
    const key = rtdb.ref('chat').push().key;
    try {
      await rtdb.ref().update({
        ['chatAudio/' + key]: { uid, d: data, m: String(mime || '').slice(0, 40), t: TS },
        ['chat/' + key]: { uid, name: myName(), text: '🎤', t: TS, av: avatar(), au: key, dur: Math.round(dur * 10) / 10 },
        ['chatLast/' + uid]: TS,
      });
    } catch (e) { return err('Espera un poco antes de enviar otro mensaje.'); }
    return { ok: true };
  }
  async function getVoice(id) {
    if (!(await start())) return null;
    const s = await rtdb.ref('chatAudio/' + id).once('value').catch(() => null);
    const v = s && s.val();
    return v && typeof v.d === 'string' ? { data: v.d, mime: v.m || '' } : null;
  }
  // borrar un mensaje también borra su audio
  const deleteChat = (id) => { rtdb.ref('chatAudio/' + id).remove().catch(() => {}); return rtdb.ref('chat/' + id).remove().catch(() => {}); };
  const banChat = (id) => rtdb.ref('chatBan/' + id).set(true).catch(() => {});
  // Encuesta de modos: poll = { id, ends, max, modes: 'gems,ball,...' } la abre el creador desde stats.html.
  // Cada jugador vota una sola vez (pollVotes/<id>/<uid> = 'modo,modo'); los resultados solo los ve el creador.
  let poll = null;
  async function checkPoll() {
    const s = await rtdb.ref('poll').once('value').catch(() => null);
    const p = s && s.val();
    if (!p || !p.id || !(p.ends > now())) return;
    let voted = false;
    try { voted = localStorage.getItem('pb.poll') === p.id; } catch (e) {}
    if (voted) return;
    poll = { id: String(p.id).slice(0, 20), ends: +p.ends, max: Math.max(1, Math.min(8, p.max | 0 || 4)), modes: String(p.modes || '').split(',').filter((m) => PB.MODES[m]), q: clean(p.q || '', 120) };
    if (poll.modes.length) emit('poll', poll);
  }
  async function votePoll(modes) {
    if (!poll || !(await start())) return err('Sin conexión.');
    const list = [...new Set(modes)].filter((m) => poll.modes.includes(m)).slice(0, poll.max);
    if (!list.length) return err('Elige al menos un modo.');
    try { await rtdb.ref('pollVotes/' + poll.id + '/' + uid).set(list.join(',')); } catch (e) {
      // (si ya había votado desde otro dispositivo, las reglas no dejan votar otra vez)
      try { localStorage.setItem('pb.poll', poll.id); } catch (e2) {}
      return err('Ya has votado en esta encuesta.');
    }
    try { localStorage.setItem('pb.poll', poll.id); } catch (e) {}
    return { ok: true };
  }

  // (solo el creador) quitarle el tag a alguien: al entrar le sale un aviso y tiene que ponerse otro
  async function removeTag(id, tag) {
    if (!(await start()) || uid !== ADMIN) return err('Solo el creador puede hacer esto.');
    try { await rtdb.ref('tagBan/' + id).set({ t: String(tag || '').slice(0, 12), at: fb.database.ServerValue.TIMESTAMP }); } catch (e) { return err('No se ha podido quitar.'); }
    return { ok: true };
  }
  // al entrar: ¿me han quitado el tag? (se borra el aviso, se apunta para no repetirlo y se avisa)
  async function checkTagBan() {
    const ref = rtdb.ref('tagBan/' + uid);
    const s = await ref.once('value').catch(() => null);
    const v = s && s.val();
    if (!v) return;
    const d = PB.Save.get(), t = String(v.t || '').slice(0, 12);
    d.bannedTags = [...new Set([...(d.bannedTags || []), t])].slice(-20);
    if (d.title && (!t || d.title.t === t)) d.title = { t: '', c: d.title.c | 0 };
    PB.Save.persist();
    ref.remove().catch(() => {});
    lastProfile = '';
    updateMe();
    emit('tagRemoved', t);
  }
  // chat del grupo: se engancha a la sala en la que estés (solo ven los mensajes desde que entraste)
  function watchPartyChat() {
    const code = party ? party.code : null;
    if (code === pCode) return;
    if (pWatch) pWatch();
    pWatch = null;
    pMsgs.length = 0;
    pCode = code;
    if (code) {
      pSince = now() - 2 * 60 * 1000;
      pWatch = listen(rtdb.ref('partyChat/' + code), pMsgs, 'pchat');
    }
    emit('pchat');
  }
  async function sendPartyChat(text) {
    if (!party || !(await start())) return err('No estás en ningún grupo.');
    text = String(text || '').slice(0, 120);
    if (!text) return err('Escribe algo.');
    try {
      await rtdb.ref('partyChat/' + party.code).push({ uid, name: myName(), text, t: fb.database.ServerValue.TIMESTAMP, av: avatar() });
    } catch (e) { return err('No se ha podido enviar.'); }
    return { ok: true };
  }
  // invitar a jugar a alguien del chat: si no tienes sala, se crea
  async function inviteToPlay(id) {
    if (!party) { const r = await createParty(); if (r && r.error) return r; }
    return invite(id);
  }

  // ------------------------------------------------------------ sala de amigos (Realtime Database)
  // La sala no existe hasta que la creas; al cerrar la página sales de ella.
  let party = null, partyRef = null, partyOff = null;
  // Lo bueno que es este dispositivo para hacer de anfitrión: un PC antes que un móvil, y el que vaya más fluido
  const devScore = () => {
    const mobile = !!(window.matchMedia && matchMedia('(pointer: coarse)').matches);
    return (mobile ? 0 : 100) + Math.round(Math.min(60, PB.fps || 40)) + Math.min(16, navigator.hardwareConcurrency || 4);
  };
  const memberInfo = () => {
    // (un jugador que aún no ha elegido iniciales lleva el primero de la lista)
    const d = PB.Save.get(), id = PB.brawlerById(d.selected) ? d.selected : PB.BRAWLERS[0].id;
    const sk = PB.Save.skin(id);
    return Object.assign({ dev: devScore(), name: myName(), fav: id, line: PB.Save.lineOf(id), kit: PB.Save.kit(id), lvl: PB.Save.level(id), shiny: sk === 'shiny', skin: /^(alola|galar|hisui|paldea)$/.test(sk) ? sk : null, copas: PB.Save.copas(id), t: Date.now() }, myTag());
  };

  function watchParty(code) {
    if (partyOff) partyOff();
    partyRef = rtdb.ref('parties/' + code);
    partyRef.child('members/' + uid).onDisconnect().remove();
    let prevIds = null;
    let first = true;
    const cb = partyRef.on('value', (s) => {
      const v = s.val();
      // al entrar en una sala, la partida que tuviera apuntada es vieja: no hay que unirse a ella
      if (first && v && v.state && v.state.mid) lastJoined = v.state.mid;
      first = false;
      if (!v || !v.members || !v.members[uid]) {
        // me han echado o la sala ya no existe
        const was = party;
        stopParty();
        if (was) emit('party', { kicked: true });
        return;
      }
      const ids = Object.keys(v.members);
      // si el jefe se ha ido, el siguiente (por orden) pasa a ser el jefe
      if (!v.members[v.leader] && ids.sort()[0] === uid) partyRef.child('leader').set(uid);
      const info = {};
      if (prevIds) for (const id of ids) if (!prevIds.includes(id) && id !== uid) info.joined = clean(v.members[id].name, 16);
      prevIds = ids;
      party = {
        code, leader: v.leader === uid ? 'me' : v.leader, max: 3, invited: party ? party.invited : {},
        members: ids.map((id) => {
          const m = v.members[id];
          return { id, name: clean(m.name, 16), fav: PB.brawlerById(m.fav) ? m.fav : PB.BRAWLERS[0].id, line: m.line, kit: m.kit, lvl: m.lvl | 0, shiny: !!m.shiny, copas: m.copas | 0, ready: !!m.ready || id === v.leader, me: id === uid };
        }),
        state: v.state || null,
        rematch: v.rematch || null,
      };
      for (const id of ids) if (party.invited) delete party.invited[id];
      watchPartyChat();
      emit('party', info);
      // el jefe ha encontrado partida: los demás se unen
      const fresh = v.state && v.state.mid && (!v.state.t || now() - v.state.t < 30000);
      if (fresh && v.leader !== uid && v.state.mid !== lastJoined) { lastJoined = v.state.mid; emit('matchFound', { mid: v.state.mid }); }
      if (v.state && v.state.k === 'search' && v.leader !== uid && (!v.state.t || now() - v.state.t < 30000)) emit('partySearch', v.state);
      if ((!v.state || v.state.k === 'idle') && v.leader !== uid) emit('partySearch', false);
    });
    partyOff = () => partyRef.off('value', cb);
  }
  let lastJoined = null;
  function stopParty() {
    if (partyOff) partyOff();
    partyOff = null;
    if (partyRef) partyRef.child('members/' + uid).onDisconnect().cancel();
    // si era el último del grupo, se borra su chat
    if (party && party.members.length <= 1) rtdb.ref('partyChat/' + party.code).remove().catch(() => {});
    partyRef = null;
    party = null;
    watchPartyChat();
  }

  async function createParty() {
    if (party) return party;
    if (!(await start())) return err('Sin conexión.');
    const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) code += A[Math.floor(Math.random() * A.length)];
    await rtdb.ref('parties/' + code).set({ leader: uid, t: fb.database.ServerValue.TIMESTAMP, members: { [uid]: memberInfo() } });
    watchParty(code);
    await new Promise((r) => setTimeout(r, 300));
    return party;
  }
  async function joinByCode(code) {
    code = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (code.length !== 6) return err('El código tiene 6 letras o números.');
    if (party && party.code === code) return err('Ya estás en esa sala.');
    if (!(await start())) return err('Sin conexión.');
    const s = await rtdb.ref('parties/' + code).once('value');
    const v = s.val();
    if (!v || !v.members) return err('Esa sala no existe.');
    if (Object.keys(v.members).length >= 3) return err('La sala está llena (máximo 3).');
    if (party) await leaveParty();
    await rtdb.ref('parties/' + code + '/members/' + uid).set(memberInfo());
    watchParty(code);
    emit('party', { joinedRoom: clean((v.members[v.leader] || {}).name, 16) });
    return party || { code };
  }
  async function invite(id) {
    if (!party) return err('Primero crea la sala.');
    if (party.members.length >= 3) return err('La sala está llena (máximo 3).');
    if (party.members.some((m) => m.id === id)) return err('Ya está en tu sala.');
    if (!(await isOnline(id))) return err('No está conectado.');
    await rtdb.ref('invites/' + id + '/' + uid).set({ name: myName(), code: party.code, t: fb.database.ServerValue.TIMESTAMP });
    party.invited = party.invited || {};
    party.invited[id] = true;
    setTimeout(() => { if (party && party.invited) { delete party.invited[id]; emit('party'); } }, 30000);
    emit('party');
    return { ok: true };
  }
  function listenInvites() {
    const ref = rtdb.ref('invites/' + uid);
    ref.on('child_added', (s) => {
      const v = s.val() || {};
      s.ref.remove();
      if (now() - (v.t || 0) > 60000) return; // invitaciones viejas
      emit('invite', { from: s.key, name: clean(v.name, 16), code: clean(v.code, 6) });
    });
  }
  // Revancha en grupo: al acabar, cada uno vota "Volver a jugar". El primer voto abre 10 s;
  // si votan todos, el jefe busca partida. Si alguien vuelve a la sala, se cancela.
  const REMATCH_S = 10;
  function voteRematch() {
    if (!partyRef) return;
    partyRef.child('rematch').transaction((cur) => {
      // alguien acaba de volver a la sala: ya no se puede votar
      if (cur && cur.closed && now() - (cur.t || 0) < 30000) return;
      if (!cur || cur.go || cur.closed || now() - (cur.t || 0) > REMATCH_S * 1000 + 500) return { t: now(), votes: { [uid]: true } };
      cur.votes = cur.votes || {};
      cur.votes[uid] = true;
      return cur;
    }).catch(() => {});
  }
  // leave: vuelves a la sala; queda apuntado para que los demás también vuelvan
  function cancelRematch(leave) {
    if (!partyRef) return;
    if (leave) partyRef.child('rematch').set({ closed: true, by: myName(), t: now() }).catch(() => {});
    else partyRef.child('rematch').remove().catch(() => {});
  }
  // todos han votado: el jefe lo marca (para que los demás vean "buscando") y lo borra al rato
  function rematchGo() {
    if (!partyRef) return;
    const ref = partyRef.child('rematch');
    ref.update({ go: true }).catch(() => {});
    setTimeout(() => ref.remove().catch(() => {}), 20000);
  }
  function rematchLeft() {
    const r = party && party.rematch;
    return r && r.t ? Math.max(0, REMATCH_S - (now() - r.t) / 1000) : 0;
  }

  function setReady(v) {
    if (!partyRef) return;
    partyRef.child('members/' + uid + '/ready').set(!!v);
  }
  let lastMember = '', lastStatus = '';
  function updateMe() {
    syncSoon();
    const st = myName() + '|' + PB.Save.get().selected;
    if (uid && rtdb && st !== lastStatus) { lastStatus = st; rtdb.ref('status/' + uid).update({ name: myName(), fav: PB.Save.get().selected }).catch(() => {}); }
    if (!partyRef) return;
    const m = memberInfo();
    const key = JSON.stringify([m.name, m.fav, m.lvl, m.shiny, m.line, m.tg, m.tc]);
    if (key === lastMember) return;
    lastMember = key;
    partyRef.child('members/' + uid).update(m);
  }
  function kick(id) {
    if (!party || party.leader !== 'me' || !partyRef) return;
    partyRef.child('members/' + id).remove();
  }
  async function leaveParty() {
    if (!partyRef) { party = null; emit('party'); return; }
    const ref = partyRef;
    const alone = party && party.members.length <= 1;
    stopParty();
    if (alone) await ref.remove(); else await ref.child('members/' + uid).remove();
    emit('party');
  }

  // ------------------------------------------------------------ búsqueda de partida
  // Cada grupo (o jugador solo) deja un "ticket" en mm/<modo>. El ticket más antiguo organiza:
  // junta tickets hasta llenar la partida (o hasta que pasen unos segundos) y crea la partida.
  let search = null;

  // reparte grupos en dos equipos (de 3, 2 o 1 según el modo) sin separar a los amigos
  function fitTeams(tickets, size) {
    size = size || 3;
    const blue = [], red = [];
    let nb = 0, nr = 0;
    const used = [];
    for (const t of tickets) {
      const n = Object.keys(t.uids || {}).length;
      if (nb + n <= size && (nb <= nr || nr + n > size)) { blue.push(t); nb += n; used.push(t); }
      else if (nr + n <= size) { red.push(t); nr += n; used.push(t); }
    }
    return { blue, red, used, n: nb + nr };
  }

  async function findMatch(mode, onStatus) {
    if (!(await start())) return { local: true };
    if (search) cancelMatch();
    const M = PB.MODES[mode];
    const cap = M.ffa ? M.players || 10 : PB.teamSize(mode) * 2;
    const members = party ? party.members : [{ id: uid }];
    const uids = {};
    if (party) {
      const s = await partyRef.once('value');
      const ms = (s.val() || {}).members || {};
      for (const id of Object.keys(ms)) uids[id] = Object.assign({}, ms[id], { name: clean(ms[id].name, 16) });
      partyRef.child('state').set({ k: 'search', mode, t: fb.database.ServerValue.TIMESTAMP });
    } else uids[uid] = memberInfo();
    const ref = rtdb.ref('mm/' + mode).push();
    const ticket = { owner: uid, uids, n: members.length, t: fb.database.ServerValue.TIMESTAMP, v: 1 };
    await ref.set(ticket);
    ref.onDisconnect().remove();
    const t0 = Date.now();
    return new Promise((resolve) => {
      let tickets = {};
      const all = rtdb.ref('mm/' + mode);
      const done = (r) => {
        if (!search) return;
        clearInterval(search.iv);
        all.off('value', search.cb);
        ref.onDisconnect().cancel();
        ref.remove().catch(() => {});
        search = null;
        if (party && partyRef && party.leader === 'me') {
          const pr = partyRef;
          pr.child('state').set(r.mid ? { k: 'match', mid: r.mid, t: fb.database.ServerValue.TIMESTAMP } : { k: 'idle' });
          // pasado un rato, la sala vuelve a estar libre (para quien entre después)
          if (r.mid) setTimeout(() => pr.child('state').set({ k: 'idle' }).catch(() => {}), 25000);
        }
        resolve(r);
      };
      const cb = all.on('value', (s) => {
        tickets = s.val() || {};
        const mine = tickets[ref.key];
        // (si soy yo quien organiza, espero a que termine de reclamar los tickets)
        if (mine && mine.mid && !(search && search.busy)) { tr('mi ticket tiene partida', mine.mid); done({ mid: mine.mid }); }
      });
      const tick = async () => {
        if (!search || search.busy) return;
        const waited = (Date.now() - t0) / 1000;
        if (onStatus) onStatus({ waited, players: Object.values(tickets).filter((t) => !t.mid).reduce((a, t) => a + (t.n || 1), 0) });
        // ¿soy yo el que organiza? (el ticket más antiguo sin partida)
        const open = Object.entries(tickets).filter(([, t]) => !t.mid && t.t).sort((a, b) => a[1].t - b[1].t || (a[0] < b[0] ? -1 : 1));
        if (!open.length || open[0][0] !== ref.key) {
          // si el organizador lleva mucho sin hacer nada (se colgó), lo saltamos
          if (open.length && now() - open[0][1].t > 30000) all.child(open[0][0]).remove().catch(() => {});
          return;
        }
        const oldest = (now() - open[0][1].t) / 1000;
        let group;
        if (M.ffa) {
          group = [];
          let n = 0;
          for (const [k, t] of open) { const c = Object.keys(t.uids || {}).length; if (n + c <= cap) { group.push([k, t]); n += c; } }
          group.n = n;
        } else {
          const ft = fitTeams(open.map(([k, t]) => Object.assign({ key: k }, t)), PB.teamSize(mode));
          group = ft.used.map((t) => [t.key, t]);
          group.n = ft.n;
        }
        const full = group.n >= cap;
        tr('organizo', 'tickets', open.length, 'grupo', group.length, 'humanos', group.n, 'espera', oldest.toFixed(1));
        if (!full && oldest < WAIT) return;
        // nadie más: si estoy solo, partida normal con bots (sin anfitrión)
        if (group.length === 1 && group.n === 1) return done({ local: true });
        search.busy = true;
        const mid = rtdb.ref('matches').push().key;
        const chosen = new Set(group.map(([k]) => k));
        // primero se escribe la partida y luego se reclaman los tickets de golpe
        // (si otro ya se los llevó, se borra y se reintenta)
        try { await createMatch(mid, mode, group.map(([, t]) => t)); } catch (e) { console.warn(e); if (search) search.busy = false; return; }
        const res = await all.transaction((cur) => {
          if (!cur) return cur === null ? undefined : cur;
          for (const k of chosen) if (!cur[k] || cur[k].mid) return; // abortar
          for (const k of chosen) cur[k].mid = mid;
          return cur;
        }).catch(() => null);
        if (!res || !res.committed) { rtdb.ref('matches/' + mid).remove().catch(() => {}); if (search) search.busy = false; return; }
        tr('partida creada', mid);
        done({ mid });
      };
      search = { iv: setInterval(tick, 700), cb, ref, done };
    });
  }
  function cancelMatch() {
    if (!search) return;
    const s = search;
    s.done({ cancelled: true });
  }

  // El organizador escribe la partida: quién juega, en qué equipo y quién es el anfitrión
  async function createMatch(mid, mode, tickets) {
    const M = PB.MODES[mode];
    const players = {};
    let teams = null;
    let order = null;
    if (M.ffa) {
      for (const t of tickets) for (const [id, inf] of Object.entries(t.uids || {})) players[id] = inf;
      if (M.duo) {
        // las salas de 2 ocupan una pareja entera; los que van solos se emparejan entre ellos
        order = [];
        const pairs = tickets.filter((t) => Object.keys(t.uids || {}).length >= 2), solos = tickets.filter((t) => Object.keys(t.uids || {}).length < 2);
        for (const t of pairs) order.push(...Object.keys(t.uids).slice(0, 2));
        for (const t of solos) order.push(...Object.keys(t.uids || {}));
      }
    } else {
      const ft = fitTeams(tickets, PB.teamSize(mode));
      teams = { blue: [], red: [] };
      for (const side of ['blue', 'red']) for (const t of ft[side]) for (const [id, inf] of Object.entries(t.uids || {})) { players[id] = inf; teams[side].push(id); }
    }
    // anfitrión: el dispositivo más potente (un PC antes que un móvil); si empatan, al azar
    const ids = Object.keys(players).sort(() => Math.random() - 0.5);
    const host = ids.reduce((best, id) => ((players[id].dev || 0) > (players[best].dev || 0) ? id : best), ids[0]);
    await rtdb.ref('matches/' + mid).set({ mode, host, players, teams, order, t: fb.database.ServerValue.TIMESTAMP });
  }

  // ------------------------------------------------------------ conexión directa (WebRTC)
  // Un canal por cada jugador hacia el anfitrión. Para conectarse se intercambian la "oferta" y
  // la "respuesta" por la base de datos (signal/<partida>/<para>/<de>).
  function waitIce(pc) {
    return new Promise((res) => {
      if (pc.iceGatheringState === 'complete') return res();
      const t = setTimeout(res, 2500);
      pc.addEventListener('icegatheringstatechange', () => { if (pc.iceGatheringState === 'complete') { clearTimeout(t); res(); } });
    });
  }

  // Canal hacia los demás jugadores. Normalmente directo (WebRTC); con quien no se puede conectar
  // directo (routers estrictos, datos móviles...), los mensajes van por la base de datos:
  // relay/<partida>/<para>/<mensaje> = { f: de, d: mensaje }. Se borran al leerlos.
  // Por el relevo cada byte cuenta (el plan gratis tiene 10 GB de descargas al mes): los mensajes
  // van comprimidos ("z:" + base64) con quien también sabe descomprimir (lo dice con z:1 en _relay/_ping)
  const canZip = typeof CompressionStream === 'function' && typeof DecompressionStream === 'function';
  async function zip(s) {
    const buf = new Uint8Array(await new Response(new Blob([s]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer());
    let bin = '';
    for (let i = 0; i < buf.length; i += 8192) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 8192));
    return 'z:' + btoa(bin);
  }
  async function unzip(s) {
    const bin = atob(s.slice(2)), buf = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
    return new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).text();
  }

  function makeLink(me, db) {
    db = db || rtdb;
    const chans = {};
    const relayPeers = new Set(), seen = {}, zipPeers = new Set();
    let relayOff = null, relayMid = null, relayIv = null;
    // (en cola para que lleguen en orden aunque comprimir tarde un poco)
    let sendQ = Promise.resolve(), recvQ = Promise.resolve();
    const relaySend = (peer, s) => {
      if (!relayMid) return;
      const push = (d) => db.ref('relay/' + relayMid + '/' + peer).push({ f: me, d }).catch(() => {});
      if (canZip && zipPeers.has(peer) && s.length > 200) sendQ = sendQ.then(() => zip(s)).then(push, () => push(s));
      else sendQ = sendQ.then(() => push(s));
    };
    const PING = canZip ? '{"k":"_ping","z":1}' : '{"k":"_ping"}';
    const ASK = canZip ? '{"k":"_relay","z":1}' : '{"k":"_relay"}';
    const link = {
      me,
      onMessage: null,
      onLeave: null,
      onRelay: null,
      send(to, msg) {
        const s = JSON.stringify(msg);
        const list = to ? [chans[to]] : Object.values(chans);
        for (const c of list) if (c && c.readyState === 'open') { try { c.send(s); } catch (e) {} }
        for (const p of relayPeers) if ((!to || to === p) && !chans[p]) relaySend(p, s);
      },
      // empieza a escuchar su buzón de relevo para esta partida
      startRelay(mid) {
        if (relayOff) return;
        relayMid = mid;
        const ref = db.ref('relay/' + mid + '/' + me);
        try { ref.onDisconnect().remove(); } catch (e) {}
        const cb = ref.on('child_added', (sn) => {
          const v = sn.val();
          sn.ref.remove().catch(() => {});
          if (!v || typeof v.d !== 'string' || typeof v.f !== 'string') return;
          noteDl('relay', v.d.length + 120);
          const handle = (txt) => {
            let msg;
            try { msg = JSON.parse(txt); } catch (e) { return; }
            seen[v.f] = Date.now();
            if (msg.z) zipPeers.add(v.f);
            if (msg.k === '_relay') { link.addRelay(v.f); if (link.onRelay) link.onRelay(v.f); return; }
            if (msg.k === '_ping' || !relayPeers.has(v.f)) return;
            if (link.onMessage) { try { link.onMessage(v.f, msg); } catch (e) {} }
          };
          recvQ = recvQ.then(() => (v.d.startsWith('z:') ? unzip(v.d) : v.d)).then(handle, () => {});
        });
        // cada 3 s un "sigo aquí"; si alguien lleva 10 s sin dar señales, se ha ido
        relayIv = setInterval(() => {
          for (const p of [...relayPeers]) {
            relaySend(p, PING);
            if (Date.now() - (seen[p] || 0) > 10000) { relayPeers.delete(p); if (link.onLeave) link.onLeave(p); }
          }
        }, 3000);
        relayOff = () => { ref.off('child_added', cb); ref.remove().catch(() => {}); clearInterval(relayIv); };
      },
      addRelay(peer) { relayPeers.add(peer); seen[peer] = Date.now(); },
      // pide a otro jugador que use el relevo conmigo
      askRelay(peer) { link.addRelay(peer); relaySend(peer, ASK); bump('relay'); },
      isRelay: (peer) => relayPeers.has(peer) && !chans[peer],
      close() {
        for (const c of Object.values(chans)) { try { c.close(); } catch (e) {} }
        for (const p of pcs) { try { p.close(); } catch (e) {} }
        if (relayOff) relayOff();
        relayPeers.clear();
      },
      add(peer, ch, pc) {
        chans[peer] = ch;
        pcs.push(pc);
        ch.onmessage = (e) => { if (link.onMessage) { try { link.onMessage(peer, JSON.parse(e.data)); } catch (er) {} } };
        const gone = () => { if (chans[peer] === ch) { delete chans[peer]; if (link.onLeave) link.onLeave(peer); } };
        ch.onclose = gone;
        pc.addEventListener('connectionstatechange', () => { if (pc.connectionState === 'failed' || pc.connectionState === 'closed') gone(); });
      },
      peers: () => [...new Set(Object.keys(chans).concat([...relayPeers]))],
    };
    const pcs = [];
    return link;
  }

  // anfitrión: abre una conexión con cada jugador; devuelve los que han conectado a tiempo
  async function hostConnect(mid, others, link, onPeer) {
    const sig = rtdb.ref('signal/' + mid);
    const ok = new Set();
    link.startRelay(mid);
    // con quien no conecte directo, se juega por relevo (no se queda nadie fuera)
    const relay = (peer) => { tr('relevo con', peer.slice(0, 5)); link.askRelay(peer); ok.add(peer); if (onPeer) onPeer(peer); };
    await Promise.all(others.map(async (peer) => {
      const pc = new RTCPeerConnection({ iceServers: ICE });
      const ch = pc.createDataChannel('g', { ordered: true });
      // (si en 9 s no se abre la conexión directa, se pasa al relevo)
      const opened = new Promise((res) => { ch.onopen = () => res(true); setTimeout(() => res(false), 9000); });
      await pc.setLocalDescription(await pc.createOffer());
      await waitIce(pc);
      await sig.child(peer + '/' + uid).set({ offer: JSON.stringify(pc.localDescription) });
      const ans = sig.child(uid + '/' + peer + '/answer');
      const got = new Promise((res) => {
        const cb = ans.on('value', (s) => { if (s.val()) { ans.off('value', cb); res(s.val()); } });
        setTimeout(() => { ans.off('value', cb); res(null); }, 15000);
      });
      const a = await got;
      tr('respuesta de', peer.slice(0, 5), !!a);
      if (!a) { pc.close(); return relay(peer); }
      await pc.setRemoteDescription(JSON.parse(a));
      if (await opened) { link.add(peer, ch, pc); ok.add(peer); if (onPeer) onPeer(peer); } else { pc.close(); relay(peer); }
    }));
    setTimeout(() => sig.remove().catch(() => {}), 5000);
    return ok;
  }

  // jugador: espera la oferta del anfitrión y contesta
  async function clientConnect(mid, host, link) {
    link.startRelay(mid);
    let relayed = false;
    const relayP = new Promise((res) => { link.onRelay = (p) => { if (p === host) { relayed = true; res(true); } }; setTimeout(() => res(false), 45000); });
    const direct = clientDirect(mid, host, link);
    // lo primero que funcione: directo o relevo (si lo directo falla, se espera al relevo).
    // Si el anfitrión ni siquiera ha mandado su oferta, es que ya no está: no se le espera más
    const ok = await Promise.race([direct.then((d) => (d === 'nooffer' ? Promise.race([relayP, new Promise((r) => setTimeout(() => r(false), 3000))]) : d || relayP)), relayP]);
    link.onRelay = null;
    tr(ok ? (relayed ? 'conectado por relevo' : 'conectado directo') : 'sin conexión');
    return ok;
  }
  async function clientDirect(mid, host, link) {
    const sig = rtdb.ref('signal/' + mid);
    const offRef = sig.child(uid + '/' + host + '/offer');
    const offer = await new Promise((res) => {
      const cb = offRef.on('value', (s) => { if (s.val()) { offRef.off('value', cb); res(s.val()); } });
      setTimeout(() => { offRef.off('value', cb); res(null); }, 15000);
    });
    tr('oferta', !!offer);
    if (!offer) return 'nooffer';
    const pc = new RTCPeerConnection({ iceServers: ICE });
    const chP = new Promise((res) => { pc.ondatachannel = (e) => res(e.channel); setTimeout(() => res(null), 15000); });
    await pc.setRemoteDescription(JSON.parse(offer));
    await pc.setLocalDescription(await pc.createAnswer());
    await waitIce(pc);
    await sig.child(host + '/' + uid + '/answer').set(JSON.stringify(pc.localDescription));
    const ch = await chP;
    if (!ch) { pc.close(); return false; }
    if (ch.readyState !== 'open') await new Promise((res) => { ch.onopen = res; setTimeout(res, 10000); });
    if (ch.readyState !== 'open') { pc.close(); return false; }
    link.add(host, ch, pc);
    return true;
  }

  // Une a este jugador a la partida "mid". Devuelve lo que necesita main.js para empezar
  // ({ role, link, opts, seats, myIdx }) o { local: true } si no se ha podido conectar.
  async function joinMatch(mid, onStatus) {
    let m = null;
    for (let i = 0; i < 6 && !m; i++) {
      m = await rtdb.ref('matches/' + mid).once('value').then((s) => s.val()).catch(() => null);
      if (!m) await new Promise((r) => setTimeout(r, 700));
    }
    tr('leo partida', mid, m ? 'host=' + (m.host === uid ? 'yo' : 'otro') + ' jugadores=' + Object.keys(m.players || {}).length : 'NO EXISTE');
    if (!m || !m.players || !m.players[uid]) return { local: true };
    const link = makeLink(uid);
    const others = Object.keys(m.players).filter((id) => id !== uid);
    if (onStatus) onStatus({ connecting: true });
    if (m.host === uid) {
      const ok = await hostConnect(mid, others, link);
      tr('conectados', ok.size, 'de', others.length);
      setTimeout(() => rtdb.ref('matches/' + mid).remove().catch(() => {}), 20000);
      // los que no han podido conectar juegan su partida con bots; en esta, su sitio es un bot
      const humans = [uid, ...others.filter((id) => ok.has(id))];
      const { opts, seats, myIdx } = buildOpts(m, humans);
      if (!Object.keys(seats).length) { link.close(); return { local: true }; }
      return { role: 'host', link, opts, seats, myIdx, mid };
    }
    const ok = await clientConnect(mid, m.host, link);
    tr('cliente conectado', ok);
    if (!ok) { link.close(); return { local: true, failed: true }; }
    return { role: 'client', link, mid };
  }

  // Anfitrión de reserva: si el anfitrión se va, el que va primero en la lista pasa a serlo
  // y los demás se conectan a él (una "ronda" nueva de conexiones para esa partida).
  // nuevo anfitrión: target = lista de los demás; jugador: target = el nuevo anfitrión
  async function migrate(mid, round, amHost, target, onPeer) {
    const link = makeLink(uid);
    const sid = mid + '_m' + round;
    tr('migración', round, amHost ? 'soy el nuevo anfitrión' : 'me conecto al nuevo');
    if (amHost) {
      // la partida sigue ya; cada jugador vuelve en cuanto conecta (onPeer)
      const done = (target.length ? hostConnect(sid, target, link, onPeer) : Promise.resolve(new Set()))
        .then((ok) => { tr('reconectados', ok.size, 'de', target.length); return ok; });
      return { link, done };
    }
    const ok = await clientConnect(sid, target, link);
    tr('reconectado', ok);
    if (!ok) { link.close(); return null; }
    return { link };
  }

  // Monta la partida (como plan() en main.js) con los humanos en sus sitios
  function buildOpts(m, humans) {
    const ids = PB.BRAWLERS.map((b) => b.id);
    const rnd = () => ids[Math.floor(Math.random() * ids.length)];
    const M = PB.MODES[m.mode];
    const opts = { mode: m.mode, humans: {}, shiny: [] };
    const slots = []; // uid o null (bot) por posición
    if (M.ffa) {
      const n = M.players || 10;
      if (M.duo && Array.isArray(m.order)) for (let i = 0; i < n; i++) slots.push(m.order[i] && humans.includes(m.order[i]) ? m.order[i] : null);
      else for (let i = 0; i < n; i++) slots.push(humans[i] || null);
      opts.ffa = slots.map((u) => (u ? m.players[u].fav : rnd()));
    } else {
      const size = PB.teamSize(m.mode);
      const side = (t) => { const l = (m.teams[t] || []).filter((u) => humans.includes(u)); while (l.length < size) l.push(null); return l.slice(0, size); };
      const b = side('blue'), r = side('red');
      slots.push(...b, ...r);
      opts.blue = b.map((u) => (u ? m.players[u].fav : rnd()));
      opts.red = r.map((u) => (u ? m.players[u].fav : rnd()));
    }
    const all = [].concat(opts.ffa || [], opts.blue || [], opts.red || []);
    opts.lines = all.map((id, i) => {
      const u = slots[i], def = PB.brawlerById(id);
      if (u && Array.isArray(m.players[u].line)) return m.players[u].line;
      return def.alts ? def.alts[Math.floor(Math.random() * def.alts.length)] : def.line;
    });
    // set de movimientos: el de cada persona; los bots, al azar
    opts.kits = all.map((id, i) => (slots[i] ? PB.validKit(id, m.players[slots[i]].kit) : PB.randomKit(id)));
    const seats = {};
    let myIdx = 0, copas = 0;
    slots.forEach((u, i) => {
      if (!u) return;
      const p = m.players[u];
      const skin = /^(alola|galar|hisui|paldea)$/.test(p.skin || '') ? p.skin : null;
      opts.humans[i] = { name: clean(p.name, 16), lvl: Math.max(1, Math.min(PB.META.maxLevel, p.lvl | 0 || 1)), shiny: !!p.shiny, skin, uid: u, mt: PB.masteryOf(p.copas), tg: PB.Chat.cleanTag(p.tg), tc: p.tc | 0 };
      opts.shiny[i] = !!p.shiny;
      (opts.skins = opts.skins || [])[i] = skin;
      copas += p.copas | 0;
      if (u === uid) myIdx = i; else seats[u] = i;
    });
    opts.copas = Math.round(copas / Math.max(1, humans.length));
    return { opts, seats, myIdx };
  }

  // ------------------------------------------------------------ API
  return {
    start, init, guest, isGuest: () => isGuest(), claimName,
    isFriend: (id) => (myDoc.friends || []).includes(id),
    status: () => ({ online: !!uid, uid }),
    on(ev, fn) { (listeners[ev] = listeners[ev] || []).push(fn); },
    account, loginGoogle, emailAccount, resetPassword, logout, saveCloud,
    me: async () => (await start(), viewUser(uid, myDoc)),
    topPlayers, topClans, topByPokemon, topForPokemon, getUser,
    searchClans, getClan, myClan, createClan, joinClan, leaveClan, clanRequests, answerClanRequest,
    chat, sendChat,
    watchChat, unwatchChat, peekChat, sendGlobalChat, deleteChat, banChat, removeTag, votePoll, get poll() { return poll; }, sendPartyChat, inviteToPlay, sendVoice, getVoice,
    chatMsgs: () => gMsgs, partyMsgs: () => pMsgs, isAdmin: () => uid === ADMIN, get myUid() { return uid; },
    party: () => party, createParty, invite, joinByCode, setReady, updateMe, kick, leaveParty,
    voteRematch, cancelRematch, rematchGo, rematchLeft,
    friends, requests, searchPlayers, addFriend, answerRequest, removeFriend,
    findMatch, cancelMatch, joinMatch, migrate, clanAction, editClan, sendGift,
    get searching() { return !!search; },
    countMatch, setPlaying, setSearching, sendFeedback, reportPlayer,
    get live() { return live; },
    now: () => now(),
    trace,
    _testLink: (me, db) => makeLink(me, db), // para las pruebas del relevo
  };
})();
