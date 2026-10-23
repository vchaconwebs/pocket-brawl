// Chats en tiempo real:
//  - Chat general de la lobby (Firebase, js/online.js): todos los que están en línea.
//  - Chat del grupo (Firebase): los de tu sala.
//  - Chat de la partida (por la misma conexión que la partida, js/main.js): los que juegan juntos.
// Aquí están el filtro de palabras, la lista de silenciados y las interfaces.
PB.Chat = (() => {
  const $ = (s) => document.querySelector(s);
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const hm = (t) => { const d = new Date(t || Date.now()); return d.getHours() + ':' + String(d.getMinutes()).padStart(2, '0'); };
  // el creador del juego (Fl3xix) sale con su etiqueta
  const OWNER = 'ULFnTGBapaaIUhxmHKgCh9TIm6G3';

  // ------------------------------------------------------------ filtro
  // Insultos fuertes (es/en): se tapan con asteriscos. Se comparan sin tildes, sin letras
  // repetidas y con los cambios típicos (0 → o, 4 → a, 3 → e...).
  const BAD = ['puta', 'puto', 'putas', 'putos', 'gilipollas', 'gilipoyas', 'cabron', 'cabrona', 'cabrones', 'maricon', 'maricones', 'marica',
    'zorra', 'polla', 'pollas', 'cono', 'follar', 'mierda', 'joder', 'subnormal', 'retrasado', 'retrasada', 'mongolo', 'mongola', 'imbecil',
    'capullo', 'pendejo', 'pendeja', 'verga', 'chingada', 'culero', 'malparido', 'hijueputa', 'nazi', 'nigger', 'nigga', 'negrata',
    'fuck', 'fucking', 'fucker', 'motherfucker', 'shit', 'bitch', 'cunt', 'faggot', 'fag', 'retard', 'whore', 'slut', 'dick', 'pussy', 'porn', 'porno', 'sexo'];
  // raíces que se tapan aunque vayan pegadas a otras palabras (hijodeputa, fuckyou...)
  const ROOTS = ['deputa', 'hijoputa', 'putamadre', 'gilipol', 'maricon', 'nigg', 'fuck', 'faggot', 'cabron', 'motherf'];
  const squash = (w) => w.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/0/g, 'o').replace(/1/g, 'i').replace(/3/g, 'e').replace(/4|@/g, 'a').replace(/5|\$/g, 's').replace(/7/g, 't')
    .replace(/[^a-zñ]/g, '').replace(/(.)\1+/g, '$1');
  const BADS = new Set(BAD.map(squash));
  const SROOTS = ROOTS.map(squash);
  const isBad = (w) => { const s = squash(w); return s.length > 1 && (BADS.has(s) || SROOTS.some((r) => s.includes(r))); };

  // Limpia un mensaje: sin saltos ni caracteres invisibles, sin enlaces y sin insultos.
  function filter(text, max) {
    let t = String(text == null ? '' : text)
      .replace(/[\u0000-\u001f\u007f\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff]/g, ' ')
      .replace(/\s+/g, ' ').trim().slice(0, max || 120);
    // enlaces y direcciones: fuera (evita spam y estafas)
    t = t.replace(/\b(?:https?:\/\/|www\.)\S+/gi, '***').replace(/\b[\w-]+\.(?:com|net|org|es|io|gg|ly|me|xyz|ru|tk|app|link|co)\b\S*/gi, '***');
    t = t.split(/(\s+)/).map((w) => (/\s/.test(w) || !isBad(w) ? w : '*'.repeat(Math.min(6, w.length)))).join('');
    return /[^*\s]/.test(t) ? t : '';
  }

  // ------------------------------------------------------------ silenciados (solo en este navegador)
  let muted = [];
  try { muted = JSON.parse(localStorage.getItem('pb.muted') || '[]'); } catch (e) {}
  const isMuted = (uid) => !!uid && muted.includes(uid);
  function setMuted(uid, on) {
    muted = muted.filter((u) => u !== uid);
    if (on) muted.push(uid);
    try { localStorage.setItem('pb.muted', JSON.stringify(muted.slice(-200))); } catch (e) {}
  }

  // ------------------------------------------------------------ chat general y de grupo (lobby)
  // Dos pestañas: General (todos los que están en línea) y Grupo (los de tu sala).
  let gOpen = false, gStarted = false, lastSend = 0, tab = 'global', menuFor = null;
  const seen = { global: 0, party: 0 };
  try { seen.global = +localStorage.getItem('pb.chatSeen') || 0; } catch (e) {}
  const portrait = (av) => (av && PB.DEX && PB.DEX[+av] ? PB.Sprites.portraitURL(+av) : PB.Sprites.portraitURL(PB.BRAWLERS[0].dex));
  const msgsOf = (t) => (t === 'party' ? PB.Online.partyMsgs() : PB.Online.chatMsgs());
  const inParty = () => { const p = PB.Online.party(); return !!(p && p.members.length > 1); };

  function initLobby() {
    $('#btn-chat').onclick = () => openGlobal();
    $('#gc-close').onclick = closeGlobal;
    $('#gc-send').onclick = sendGlobal;
    $('#gc-q').onkeydown = (e) => { if (e.key === 'Enter') sendGlobal(); if (e.key === 'Escape') closeGlobal(); };
    document.querySelectorAll('#gc-tabs button').forEach((b) => (b.onclick = () => setTab(b.dataset.t)));
    $('#gc-mic').onclick = () => (rec ? stopRec(true) : startRec());
    $('#gc-cancel').onclick = () => stopRec(false);
    PB.Online.on('gchat', () => { if (tab === 'global') renderGlobal(); badge(); });
    PB.Online.on('pchat', (m) => {
      if (tab === 'party') renderGlobal();
      // mensaje nuevo del grupo con el chat cerrado: aviso
      if (m && !m.mine && !gOpen && !isMuted(m.uid) && PB.Lobby.current === 'lobby') PB.Lobby.toast('💬 ' + m.name + ': ' + filter(m.text, 60));
      badge();
    });
    PB.Online.on('party', () => { tabs(); badge(); });
    PB.Online.on('live', () => { if (gOpen) online(); });
  }
  // se empieza a escuchar en cuanto hay sesión (para el contador de mensajes nuevos)
  async function startGlobal() {
    if (gStarted) return;
    gStarted = true;
    if (!(await PB.Online.watchChat())) gStarted = false;
  }
  function online() {
    const n = (PB.Online.live && PB.Online.live.total) || 0;
    $('#gc-online').textContent = n > 1 ? '● ' + PB.T('En directo') : '';
  }
  function tabs() {
    const has = inParty();
    if (!has && tab === 'party') tab = 'global';
    $('#gc-tabs').classList.toggle('hidden', !has);
    document.querySelectorAll('#gc-tabs button').forEach((b) => b.classList.toggle('on', b.dataset.t === tab));
    $('#gc-q').placeholder = PB.T(tab === 'party' ? 'Escribe a tu grupo…' : 'Escribe a todos…');
    // las notas de voz son del chat general
    $('#gc-mic').classList.toggle('hidden', tab === 'party' || !canRecord());
    if (tab === 'party' && rec) stopRec(false);
    $('#gc-title').textContent = PB.T(tab === 'party' ? 'Chat del grupo' : 'Chat general');
    if (gOpen) renderGlobal();
  }
  function setTab(t) {
    PB.Audio.play('ui');
    tab = t;
    menuFor = null;
    $('#gc-log').dataset.ready = '';
    tabs();
  }
  function openGlobal(t) {
    PB.Audio.play('ui');
    gOpen = true;
    if (t) tab = t;
    $('#gc-log').dataset.ready = '';
    startGlobal();
    $('#gchat').classList.remove('hidden');
    online();
    tabs();
    renderGlobal();
    // en el móvil el teclado tapa media pantalla: no se abre solo
    if (!(window.matchMedia && matchMedia('(pointer: coarse)').matches)) setTimeout(() => $('#gc-q').focus(), 60);
  }
  function closeGlobal() {
    if (rec) stopRec(false);
    if (!gOpen) return;
    PB.Audio.play('uiBack');
    gOpen = false;
    menuFor = null;
    $('#gchat').classList.add('hidden');
    $('#gc-q').blur();
  }
  function markSeen() {
    const msgs = msgsOf(tab);
    if (msgs.length) seen[tab] = Math.max(seen[tab], msgs[msgs.length - 1].t || 0);
    if (tab === 'global') try { localStorage.setItem('pb.chatSeen', String(seen.global)); } catch (e) {}
  }
  const unread = (t) => msgsOf(t).filter((m) => m.t > seen[t] && !m.mine && !isMuted(m.uid)).length;
  function badge() {
    if (gOpen) markSeen();
    const set = (el, n) => { if (!el) return; el.textContent = n > 9 ? '9+' : String(n); el.classList.toggle('hidden', !n); };
    const p = inParty() ? unread('party') : 0;
    set($('#chat-badge'), unread('global') + p);
    set($('#gc-pbadge'), tab === 'party' ? 0 : p);
  }

  function renderGlobal() {
    if (!gOpen) return;
    const log = $('#gc-log');
    const atBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 40;
    const admin = PB.Online.isAdmin();
    const msgs = msgsOf(tab).filter((m) => !isMuted(m.uid));
    const p = PB.Online.party();
    log.innerHTML = msgs.map((m) => {
      const own = m.uid === OWNER;
      const inMine = p && p.members.some((x) => x.id === m.uid);
      let menu = '';
      if (menuFor === m.id) {
        menu = '<div class="gc-menu">';
        if (!m.mine) {
          menu += `<button data-prof="${esc(m.uid)}">👤 ${PB.T('Ver perfil')}</button>`;
          if (!PB.Online.isFriend(m.uid)) menu += `<button data-friend="${esc(m.uid)}">➕ ${PB.T('Añadir amigo')}</button>`;
          if (!inMine) menu += `<button data-inv="${esc(m.uid)}">🎮 ${PB.T('Invitar a jugar')}</button>`;
          menu += `<button data-mute="${esc(m.uid)}">🔇 ${PB.T('Silenciar')}</button>`;
          menu += `<button data-rep="${esc(m.id)}">🚩 ${PB.T('Reportar')}</button>`;
        }
        if (m.mine || (admin && tab === 'global')) menu += `<button data-del="${esc(m.id)}">🗑 ${PB.T('Borrar')}</button>`;
        if (admin && !m.mine && tab === 'global') menu += `<button data-ban="${esc(m.uid)}">⛔ ${PB.T('Bloquear')}</button>`;
        menu += '</div>';
      }
      return `<div class="gc-m${m.mine ? ' mine' : ''}${own ? ' owner' : ''}"><img src="${portrait(m.av)}" alt="">` +
        `<div class="gc-b"><button class="gc-n" data-id="${esc(m.id)}">${esc(m.name)}</button>${own ? '<span class="gc-tag">CREADOR</span>' : ''}<small>${hm(m.t)}</small>` +
        (m.au ? `<p><button class="gc-play" data-au="${esc(m.au)}">▶ 🎤 ${m.dur ? m.dur.toFixed(0) + ' s' : ''}</button></p>` : `<p>${esc(filter(m.text, 120) || '***')}</p>`) + `${menu}</div></div>`;
    }).join('') || `<p class="gc-empty">${PB.T(tab === 'party' ? 'Habla con los de tu grupo. Solo lo veis vosotros.' : 'Aún no hay mensajes. ¡Saluda!')}</p>`;
    const act = (sel, fn) => log.querySelectorAll(sel).forEach((b) => (b.onclick = async (e) => {
      e.stopPropagation();
      menuFor = null;
      await fn(b);
      renderGlobal();
    }));
    log.querySelectorAll('.gc-n').forEach((b) => (b.onclick = () => { PB.Audio.play('ui'); menuFor = menuFor === b.dataset.id ? null : b.dataset.id; renderGlobal(); }));
    act('[data-friend]', async (b) => {
      if (PB.Online.isGuest()) return PB.Lobby.toast(PB.T('Crea una cuenta (gratis) para tener amigos.'));
      const r = await PB.Online.addFriend(b.dataset.friend).catch(() => ({ error: PB.T('No se ha podido enviar.') }));
      PB.Lobby.toast(r.error || PB.T('Solicitud de amistad enviada'));
    });
    act('[data-inv]', async (b) => {
      const r = await PB.Online.inviteToPlay(b.dataset.inv).catch(() => ({ error: PB.T('No se ha podido enviar.') }));
      PB.Lobby.toast(r.error || PB.T('¡Invitación enviada! Si acepta, entrará en tu grupo.'));
    });
    log.querySelectorAll('.gc-play').forEach((b) => (b.onclick = () => playVoice(b)));
    act('[data-prof]', (b) => PB.Lobby.showPlayer(b.dataset.prof));
    act('[data-rep]', (b) => {
      const m = msgs.find((x) => x.id === b.dataset.rep);
      if (m) PB.Lobby.report(m.uid, m.name, m.au ? '(nota de voz)' : m.text);
    });
    act('[data-mute]', (b) => { setMuted(b.dataset.mute, true); PB.Lobby.toast(PB.T('No verás más sus mensajes')); });
    act('[data-del]', (b) => PB.Online.deleteChat(b.dataset.del));
    act('[data-ban]', async (b) => { await PB.Online.banChat(b.dataset.ban); PB.Lobby.toast(PB.T('Bloqueado del chat')); });
    if (atBottom || !log.dataset.ready) { log.scrollTop = log.scrollHeight; log.dataset.ready = '1'; }
    markSeen();
    badge();
  }
  async function sendGlobal() {
    const q = $('#gc-q');
    if (!q.value.trim()) return;
    const wait = tab === 'party' ? 1200 : 3000;
    if (Date.now() - lastSend < wait) return PB.Lobby.toast(PB.T('Espera un poco antes de enviar otro mensaje.'));
    const text = filter(q.value, 120);
    if (!text) { q.value = ''; return; }
    lastSend = Date.now();
    $('#gc-send').disabled = true;
    const send = tab === 'party' ? PB.Online.sendPartyChat : PB.Online.sendGlobalChat;
    const r = await send(text).catch(() => ({ error: PB.T('No se ha podido enviar.') }));
    $('#gc-send').disabled = false;
    if (r.error) { PB.Lobby.toast(r.error); return; }
    q.value = '';
    PB.Audio.play('ui');
    const log = $('#gc-log');
    log.scrollTop = log.scrollHeight;
  }

  // ------------------------------------------------------------ notas de voz
  // Se graban como mucho 6 s con el micro (con poca calidad: pesan unos 20 KB) y se mandan solas al parar.
  let rec = null, playing = null;
  const canRecord = () => !!(window.MediaRecorder && navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  async function startRec() {
    if (!canRecord()) return PB.Lobby.toast(PB.T('Tu navegador no puede grabar audio.'));
    if (Date.now() - lastSend < 3000) return PB.Lobby.toast(PB.T('Espera un poco antes de enviar otro mensaje.'));
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); }
    catch (e) { return PB.Lobby.toast(PB.T('Necesitamos permiso para usar el micrófono.')); }
    const mime = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus', 'audio/webm'].find((m) => MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(m)) || '';
    const mr = new MediaRecorder(stream, Object.assign({ audioBitsPerSecond: 24000 }, mime ? { mimeType: mime } : {}));
    const chunks = [];
    rec = { mr, stream, chunks, t0: Date.now(), send: false, iv: null };
    mr.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
    mr.onstop = () => finishRec(rec && rec.mr === mr ? rec : { mr, stream, chunks, send: false });
    mr.start();
    $('#gc-mic').classList.add('rec');
    $('#gc-cancel').classList.remove('hidden');
    $('#gc-q').disabled = true;
    const tick = () => {
      const s = (Date.now() - rec.t0) / 1000;
      $('#gc-q').placeholder = PB.T('Grabando… {s} s · toca 🎤 para enviar', { s: s.toFixed(0) });
      if (s >= 6) stopRec(true);
    };
    tick();
    rec.iv = setInterval(tick, 200);
  }
  function stopRec(send) {
    if (!rec) return;
    rec.send = send;
    rec.dur = (Date.now() - rec.t0) / 1000;
    clearInterval(rec.iv);
    try { rec.mr.stop(); } catch (e) { finishRec(rec); }
  }
  async function finishRec(r) {
    if (!r || r.done) return;
    r.done = true;
    rec = null;
    try { r.stream.getTracks().forEach((t) => t.stop()); } catch (e) {}
    $('#gc-mic').classList.remove('rec');
    $('#gc-cancel').classList.add('hidden');
    $('#gc-q').disabled = false;
    tabs();
    if (!r.send) return;
    if ((r.dur || 0) < 0.6) return PB.Lobby.toast(PB.T('Mantén un poco más para grabar.'));
    const blob = new Blob(r.chunks, { type: r.mr.mimeType || 'audio/webm' });
    const data = await new Promise((ok) => { const fr = new FileReader(); fr.onload = () => ok(String(fr.result).split(',')[1] || ''); fr.onerror = () => ok(''); fr.readAsDataURL(blob); });
    lastSend = Date.now();
    const res = await PB.Online.sendVoice(data, blob.type, Math.min(6, r.dur)).catch(() => ({ error: PB.T('No se ha podido enviar.') }));
    if (res.error) return PB.Lobby.toast(res.error);
    PB.Audio.play('ui');
  }
  async function playVoice(btn) {
    if (playing) { try { playing.pause(); } catch (e) {} playing = null; }
    const old = btn.textContent;
    btn.textContent = '…';
    const v = await PB.Online.getVoice(btn.dataset.au);
    if (!v) { btn.textContent = PB.T('Audio caducado'); btn.disabled = true; return; }
    const a = new Audio('data:' + (v.mime || 'audio/webm') + ';base64,' + v.data);
    playing = a;
    btn.textContent = '🔊 ' + old.replace('▶ ', '');
    a.onended = () => { btn.textContent = old; if (playing === a) playing = null; };
    a.play().catch(() => { btn.textContent = old; PB.Lobby.toast(PB.T('Este audio no se puede reproducir en tu navegador.')); });
  }

  // ------------------------------------------------------------ chat de la partida
  const QUICK = ['¡Bien jugado!', '¡Vamos!', '¡Ayuda!', '¡Ataca!', '¡Atrás!', '¡Gracias!', 'GG', '😂', '👍', '😢'];
  let mSend = null, mOn = false, mBar = false, mMute = false, mLast = 0;
  function initMatch() {
    $('#mchat-quick').innerHTML = QUICK.map((t) => `<button data-q="${esc(t)}">${esc(t)}</button>`).join('');
    $('#mchat-quick').querySelectorAll('button').forEach((b) => (b.onclick = () => { sendMatch(PB.T(b.dataset.q)); toggleBar(false); }));
    $('#btn-mchat').onclick = () => toggleBar();
    $('#mchat-send').onclick = () => { sendMatch($('#mchat-q').value); $('#mchat-q').value = ''; toggleBar(false); };
    $('#mchat-q').onkeydown = (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') $('#mchat-send').click();
      if (e.key === 'Escape') toggleBar(false);
    };
    $('#mchat-q').onkeyup = (e) => e.stopPropagation();
    $('#mchat-mute').onclick = () => {
      mMute = !mMute;
      $('#mchat-mute').textContent = mMute ? PB.T('🔇 Chat silenciado') : PB.T('🔊 Silenciar chat');
      $('#mchat-log').classList.toggle('hidden', mMute);
    };
    // PC: Enter abre el chat durante la partida
    window.addEventListener('keydown', (e) => {
      if (!mOn || e.key !== 'Enter' || mBar || (e.target && /INPUT|TEXTAREA/.test(e.target.tagName))) return;
      e.preventDefault();
      toggleBar(true);
    });
  }
  // la partida tiene más jugadores de verdad: se enseña el botón
  function matchStart(send) {
    mSend = send;
    if (mOn) return;
    mOn = true;
    $('#mchat-log').innerHTML = '';
    $('#btn-mchat').classList.remove('hidden');
    $('#mchat').classList.remove('hidden');
  }
  function matchEnd() {
    mOn = false;
    mSend = null;
    toggleBar(false);
    $('#btn-mchat').classList.add('hidden');
    $('#mchat').classList.add('hidden');
    $('#mchat-log').innerHTML = '';
  }
  function toggleBar(on) {
    mBar = on === undefined ? !mBar : !!on;
    $('#mchat-bar').classList.toggle('hidden', !mBar);
    $('#btn-mchat').classList.toggle('on', mBar);
    if (mBar && !(window.matchMedia && matchMedia('(pointer: coarse)').matches)) setTimeout(() => $('#mchat-q').focus(), 30);
    if (!mBar) $('#mchat-q').blur();
  }
  function sendMatch(text) {
    if (!mSend) return;
    if (Date.now() - mLast < 1000) return;
    const t = filter(text, 80);
    if (!t) return;
    mLast = Date.now();
    mSend(t);
  }
  // llega un mensaje (lo reparte el anfitrión): línea en el registro. Devuelve el texto limpio.
  function matchLine(b, text, rel) {
    const t = filter(text, 80);
    if (!t || !b) return '';
    if (mMute) return '';
    const log = $('#mchat-log');
    const p = document.createElement('p');
    p.className = rel + (b.creator ? ' creator' : '');
    p.innerHTML = `<b>${esc(b.name)}${b.creator ? ' ★' : ''}:</b> ${esc(t)}`;
    log.appendChild(p);
    while (log.children.length > 6) log.firstChild.remove();
    setTimeout(() => p.classList.add('old'), 8000);
    return t;
  }

  return {
    filter, isMuted, setMuted, initLobby, startGlobal, openGlobal, closeGlobal, initMatch, matchStart, matchEnd, matchLine,
    get typing() { return mBar; }, get matchMuted() { return mMute; }, OWNER, QUICK,
  };
})();
