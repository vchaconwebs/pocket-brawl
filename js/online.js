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
  const WAIT = 7; // segundos buscando antes de rellenar con bots
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

  function start() {
    if (ready) return ready;
    ready = (async () => {
      try {
        await loadScript(SDK + 'firebase-app-compat.js');
        await Promise.all(['auth', 'database', 'firestore'].map((m) => loadScript(SDK + 'firebase-' + m + '-compat.js')));
        fb = window.firebase;
        fb.initializeApp(CFG);
        auth = fb.auth();
        rtdb = fb.database();
        fs = fb.firestore();
        user = await new Promise((res) => {
          const off = auth.onAuthStateChanged((u) => { if (u) { off(); res(u); } });
          setTimeout(() => { if (!auth.currentUser) auth.signInAnonymously().catch(() => res(null)); }, 50);
        });
        if (!user) return false;
        uid = user.uid;
        rtdb.ref('.info/serverTimeOffset').on('value', (s) => { offset = s.val() || 0; });
        presence();
        listenInvites();
        await syncProfile(true);
        processAccepted();
        emit('ready');
        return true;
      } catch (e) {
        console.warn('Online no disponible', e);
        return false;
      }
    })();
    return ready;
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

  async function syncProfile(first) {
    if (!uid) return;
    const d = PB.Save.get();
    if (first) {
      const s = await fs.collection('users').doc(uid).get();
      if (s.exists) myDoc = Object.assign({ friends: [] }, s.data());
    }
    const p = { name: myName(), nameLower: myName().toLowerCase(), tag: d.tag, copas: PB.Save.totalCopas(), fav: d.selected, clan: myDoc.clan || null, clanName: myDoc.clanName || '' };
    const key = JSON.stringify(p);
    if (key === lastProfile) return;
    lastProfile = key;
    Object.assign(myDoc, p);
    await fs.collection('users').doc(uid).set(Object.assign({ t: fb.firestore.FieldValue.serverTimestamp() }, p), { merge: true });
  }
  let profT = null;
  const syncSoon = () => { clearTimeout(profT); profT = setTimeout(() => syncProfile().catch(() => {}), 4000); };

  const viewUser = (id, u) => ({
    id, name: clean(u.name, 16), tag: clean(u.tag, 8), copas: u.copas | 0,
    fav: PB.brawlerById(u.fav) ? u.fav : PB.BRAWLERS[0].id, clan: u.clan || null, clanName: clean(u.clanName, 20), me: id === uid,
  });

  async function usersByIds(ids) {
    const out = [];
    for (let i = 0; i < ids.length; i += 10) {
      const part = ids.slice(i, i + 10);
      if (!part.length) break;
      const q = await fs.collection('users').where(fb.firestore.FieldPath.documentId(), 'in', part).get();
      q.forEach((s) => out.push(viewUser(s.id, s.data())));
    }
    return out;
  }

  // ------------------------------------------------------------ copia del progreso en la nube
  let saveT = null;
  function saveCloud(soon) {
    if (!uid || !user || user.isAnonymous) return;
    clearTimeout(saveT);
    saveT = setTimeout(() => {
      fs.collection('users').doc(uid).collection('private').doc('save')
        .set({ json: JSON.stringify(PB.Save.get()), t: Date.now() }).catch(() => {});
    }, soon ? 500 : 30000);
  }

  // Vincular con Google: el progreso de este navegador pasa a esa cuenta.
  // Si la cuenta de Google ya tenía partida guardada, se puede recuperar.
  async function loginGoogle() {
    if (!(await start())) return err('Sin conexión.');
    const prov = new fb.auth.GoogleAuthProvider();
    try {
      const r = await auth.currentUser.linkWithPopup(prov);
      user = r.user;
      saveCloud(true);
      return { ok: true, email: user.email };
    } catch (e) {
      if (e.code === 'auth/credential-already-in-use' && e.credential) {
        const r = await auth.signInWithCredential(e.credential);
        user = r.user;
        uid = user.uid;
        const s = await fs.collection('users').doc(uid).collection('private').doc('save').get();
        return { ok: true, email: user.email, switched: true, save: s.exists ? s.data().json : null };
      }
      if (e.code === 'auth/popup-closed-by-user' || e.code === 'auth/cancelled-popup-request') return { cancelled: true };
      return err('No se ha podido iniciar sesión.');
    }
  }
  async function logout() {
    if (!auth) return;
    await auth.signOut();
    location.reload();
  }
  const account = () => (user ? { anonymous: user.isAnonymous, email: user.email || '', name: user.displayName || '' } : null);

  // ------------------------------------------------------------ amigos
  let friendsCache = null, friendsT = 0;
  async function friends(force) {
    if (!(await start())) return [];
    if (!force && friendsCache && Date.now() - friendsT < 20000) return friendsCache;
    await processAccepted().catch(() => {});
    const ids = (myDoc.friends || []).slice(0, 100);
    const list = await usersByIds(ids);
    await Promise.all(list.map(async (f) => { f.online = await isOnline(f.id); }));
    friendsCache = list.sort((a, b) => b.online - a.online || b.copas - a.copas);
    friendsT = Date.now();
    return friendsCache;
  }

  async function requests() {
    if (!(await start())) return [];
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

  // ------------------------------------------------------------ ranking (se guarda 5 minutos)
  const rankCache = {};
  async function cached(key, fn) {
    const c = rankCache[key];
    if (c && Date.now() - c.t < 300000) return c.v;
    const v = await fn();
    rankCache[key] = { t: Date.now(), v };
    return v;
  }
  async function topPlayers() {
    if (!(await start())) return [];
    await syncProfile().catch(() => {});
    const list = await cached('players', async () => {
      const q = await fs.collection('users').orderBy('copas', 'desc').limit(50).get();
      return q.docs.map((s) => viewUser(s.id, s.data()));
    });
    const out = list.map((p, i) => Object.assign({}, p, { pos: i + 1, me: p.id === uid }));
    if (!out.some((p) => p.me)) out.push(Object.assign(viewUser(uid, myDoc), { me: true, pos: '50+' }));
    return out;
  }
  async function topClans() {
    if (!(await start())) return [];
    const list = await cached('clans', async () => {
      const q = await fs.collection('clans').orderBy('copas', 'desc').limit(50).get();
      return q.docs.map((s) => viewClan(s.id, s.data()));
    });
    return list.map((c, i) => Object.assign({}, c, { pos: i + 1 }));
  }

  // ------------------------------------------------------------ clanes
  const viewClan = (id, c) => ({
    id, name: clean(c.name, 20), desc: clean(c.desc, 80), type: c.type === 'invite' ? 'invite' : 'public',
    icon: /^\d{4}$/.test(c.icon) ? c.icon : '0025', leader: c.leader, copas: c.copas | 0, count: (c.members || []).length, memberIds: c.members || [],
  });

  async function clanFull(id) {
    const s = await fs.collection('clans').doc(id).get();
    if (!s.exists) return null;
    const c = viewClan(id, s.data());
    const members = await usersByIds(c.memberIds);
    await Promise.all(members.map(async (m) => { m.online = m.me || (await isOnline(m.id)); }));
    c.members = members.map((m) => Object.assign(m, { role: m.id === c.leader ? PB.T('Líder') : PB.T('Miembro') })).sort((a, b) => b.copas - a.copas);
    // las copas del clan son la suma de las de sus miembros (las actualiza cualquiera que lo mire)
    const sum = members.reduce((s2, m) => s2 + m.copas, 0);
    if (sum !== c.copas && c.memberIds.includes(uid)) { c.copas = sum; fs.collection('clans').doc(id).update({ copas: sum }).catch(() => {}); }
    else c.copas = sum;
    return c;
  }

  async function setMyClan(id, name) {
    myDoc.clan = id;
    myDoc.clanName = name || '';
    lastProfile = '';
    await syncProfile();
  }

  async function myClan() {
    if (!(await start()) || !myDoc.clan) return null;
    const c = await clanFull(myDoc.clan);
    if (!c || !c.memberIds.includes(uid)) { await setMyClan(null); return null; }
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
  // solicitudes para entrar (clanes solo por invitación): las ve y responde el líder
  async function clanRequests() {
    if (!(await start()) || !myDoc.clan) return [];
    const q = await fs.collection('clans').doc(myDoc.clan).collection('requests').limit(30).get().catch(() => null);
    return q ? q.docs.map((d) => ({ id: d.id, name: clean(d.data().name, 16), copas: d.data().copas | 0, fav: PB.brawlerById(d.data().fav) ? d.data().fav : PB.BRAWLERS[0].id })) : [];
  }
  async function answerClanRequest(id, ok) {
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
        chatOff = fs.collection('clans').doc(chatClan).collection('chat').orderBy('t', 'desc').limit(60).onSnapshot((q) => {
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

  // ------------------------------------------------------------ sala de amigos (Realtime Database)
  // La sala no existe hasta que la creas; al cerrar la página sales de ella.
  let party = null, partyRef = null, partyOff = null;
  const memberInfo = () => {
    const d = PB.Save.get(), id = d.selected;
    return { name: myName(), fav: id, line: PB.Save.lineOf(id), lvl: PB.Save.level(id), shiny: PB.Save.skin(id) === 'shiny', copas: PB.Save.copas(id), t: Date.now() };
  };

  function watchParty(code) {
    if (partyOff) partyOff();
    partyRef = rtdb.ref('parties/' + code);
    partyRef.child('members/' + uid).onDisconnect().remove();
    let prevIds = null;
    const cb = partyRef.on('value', (s) => {
      const v = s.val();
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
          return { id, name: clean(m.name, 16), fav: PB.brawlerById(m.fav) ? m.fav : PB.BRAWLERS[0].id, line: m.line, lvl: m.lvl | 0, shiny: !!m.shiny, copas: m.copas | 0, ready: !!m.ready || id === v.leader, me: id === uid };
        }),
        state: v.state || null,
      };
      for (const id of ids) if (party.invited) delete party.invited[id];
      emit('party', info);
      // el jefe ha encontrado partida: los demás se unen
      if (v.state && v.state.mid && v.leader !== uid && v.state.mid !== lastJoined) { lastJoined = v.state.mid; emit('matchFound', { mid: v.state.mid }); }
      if (v.state && v.state.k === 'search' && v.leader !== uid) emit('partySearch', true);
      if ((!v.state || v.state.k === 'idle') && v.leader !== uid) emit('partySearch', false);
    });
    partyOff = () => partyRef.off('value', cb);
  }
  let lastJoined = null;
  function stopParty() {
    if (partyOff) partyOff();
    partyOff = null;
    if (partyRef) partyRef.child('members/' + uid).onDisconnect().cancel();
    partyRef = null;
    party = null;
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
  function setReady(v) {
    if (!partyRef) return;
    partyRef.child('members/' + uid + '/ready').set(!!v);
  }
  let lastMember = '';
  function updateMe() {
    syncSoon();
    if (uid && rtdb) rtdb.ref('status/' + uid).update({ name: myName(), fav: PB.Save.get().selected }).catch(() => {});
    if (!partyRef) return;
    const m = memberInfo();
    const key = JSON.stringify([m.name, m.fav, m.lvl, m.shiny, m.line]);
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

  // reparte grupos en dos equipos de 3 sin separar a los amigos
  function fitTeams(tickets) {
    const blue = [], red = [];
    let nb = 0, nr = 0;
    const used = [];
    for (const t of tickets) {
      const n = Object.keys(t.uids || {}).length;
      if (nb + n <= 3 && (nb <= nr || nr + n > 3)) { blue.push(t); nb += n; used.push(t); }
      else if (nr + n <= 3) { red.push(t); nr += n; used.push(t); }
    }
    return { blue, red, used, n: nb + nr };
  }

  async function findMatch(mode, onStatus) {
    if (!(await start())) return { local: true };
    if (search) cancelMatch();
    const M = PB.MODES[mode];
    const cap = M.ffa ? M.players || 10 : 6;
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
        if (party && partyRef && party.leader === 'me') partyRef.child('state').set(r.mid ? { k: 'match', mid: r.mid } : { k: 'idle' });
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
          const ft = fitTeams(open.map(([k, t]) => Object.assign({ key: k }, t)));
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

  // El organizador escribe la partida: quién juega, en qué equipo y quién es el anfitrión (al azar)
  async function createMatch(mid, mode, tickets) {
    const M = PB.MODES[mode];
    const players = {};
    let teams = null;
    if (M.ffa) {
      for (const t of tickets) for (const [id, inf] of Object.entries(t.uids || {})) players[id] = inf;
    } else {
      const ft = fitTeams(tickets);
      teams = { blue: [], red: [] };
      for (const side of ['blue', 'red']) for (const t of ft[side]) for (const [id, inf] of Object.entries(t.uids || {})) { players[id] = inf; teams[side].push(id); }
    }
    const ids = Object.keys(players);
    const host = ids[Math.floor(Math.random() * ids.length)];
    await rtdb.ref('matches/' + mid).set({ mode, host, players, teams, t: fb.database.ServerValue.TIMESTAMP });
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

  function makeLink(me) {
    const chans = {};
    const link = {
      me,
      onMessage: null,
      onLeave: null,
      send(to, msg) {
        const s = JSON.stringify(msg);
        const list = to ? [chans[to]] : Object.values(chans);
        for (const c of list) if (c && c.readyState === 'open') { try { c.send(s); } catch (e) {} }
      },
      close() { for (const c of Object.values(chans)) { try { c.close(); } catch (e) {} } for (const p of pcs) { try { p.close(); } catch (e) {} } },
      add(peer, ch, pc) {
        chans[peer] = ch;
        pcs.push(pc);
        ch.onmessage = (e) => { if (link.onMessage) { try { link.onMessage(peer, JSON.parse(e.data)); } catch (er) {} } };
        const gone = () => { if (chans[peer] === ch) { delete chans[peer]; if (link.onLeave) link.onLeave(peer); } };
        ch.onclose = gone;
        pc.addEventListener('connectionstatechange', () => { if (pc.connectionState === 'failed' || pc.connectionState === 'closed') gone(); });
      },
      peers: () => Object.keys(chans),
    };
    const pcs = [];
    return link;
  }

  // anfitrión: abre una conexión con cada jugador; devuelve los que han conectado a tiempo
  async function hostConnect(mid, others, link) {
    const sig = rtdb.ref('signal/' + mid);
    const ok = new Set();
    await Promise.all(others.map(async (peer) => {
      const pc = new RTCPeerConnection({ iceServers: ICE });
      const ch = pc.createDataChannel('g', { ordered: true });
      const opened = new Promise((res) => { ch.onopen = () => res(true); setTimeout(() => res(false), 15000); });
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
      if (!a) { pc.close(); return; }
      await pc.setRemoteDescription(JSON.parse(a));
      if (await opened) { link.add(peer, ch, pc); ok.add(peer); } else pc.close();
    }));
    setTimeout(() => sig.remove().catch(() => {}), 5000);
    return ok;
  }

  // jugador: espera la oferta del anfitrión y contesta
  async function clientConnect(mid, host, link) {
    const sig = rtdb.ref('signal/' + mid);
    const offRef = sig.child(uid + '/' + host + '/offer');
    const offer = await new Promise((res) => {
      const cb = offRef.on('value', (s) => { if (s.val()) { offRef.off('value', cb); res(s.val()); } });
      setTimeout(() => { offRef.off('value', cb); res(null); }, 20000);
    });
    tr('oferta', !!offer);
    if (!offer) return false;
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
      return { role: 'host', link, opts, seats, myIdx };
    }
    const ok = await clientConnect(mid, m.host, link);
    tr('cliente conectado', ok);
    if (!ok) { link.close(); return { local: true, failed: true }; }
    return { role: 'client', link };
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
      for (let i = 0; i < n; i++) slots.push(humans[i] || null);
      opts.ffa = slots.map((u) => (u ? m.players[u].fav : rnd()));
    } else {
      const side = (t) => { const l = (m.teams[t] || []).filter((u) => humans.includes(u)); while (l.length < 3) l.push(null); return l.slice(0, 3); };
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
    const seats = {};
    let myIdx = 0, copas = 0;
    slots.forEach((u, i) => {
      if (!u) return;
      const p = m.players[u];
      opts.humans[i] = { name: clean(p.name, 16), lvl: Math.max(1, Math.min(PB.META.maxLevel, p.lvl | 0 || 1)), shiny: !!p.shiny };
      opts.shiny[i] = !!p.shiny;
      copas += p.copas | 0;
      if (u === uid) myIdx = i; else seats[u] = i;
    });
    opts.copas = Math.round(copas / Math.max(1, humans.length));
    return { opts, seats, myIdx };
  }

  // ------------------------------------------------------------ API
  return {
    start,
    status: () => ({ online: !!uid, uid }),
    on(ev, fn) { (listeners[ev] = listeners[ev] || []).push(fn); },
    account, loginGoogle, logout, saveCloud,
    me: async () => (await start(), viewUser(uid, myDoc)),
    topPlayers, topClans,
    searchClans, getClan, myClan, createClan, joinClan, leaveClan, clanRequests, answerClanRequest,
    chat, sendChat,
    party: () => party, createParty, invite, joinByCode, setReady, updateMe, kick, leaveParty,
    friends, requests, searchPlayers, addFriend, answerRequest, removeFriend,
    findMatch, cancelMatch, joinMatch,
    get searching() { return !!search; },
    trace,
  };
})();
