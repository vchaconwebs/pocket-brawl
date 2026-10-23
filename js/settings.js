// Ajustes del jugador (se guardan en el navegador).

// Página de donaciones voluntarias (Ko-fi). Vacío = el botón sale como "Próximamente".
// Donar no da nada dentro del juego.
PB.DONATE_URL = 'https://ko-fi.com/pokeversus';
PB.Settings = (() => {
  const KEY = 'pb.settings.v1';
  const DEFAULTS = {
    // sonido
    volume: 70, // 0-100
    music: 45, // volumen de la música 0-100
    muted: false,
    vibration: true,
    // gráficos
    quality: 'alta', // alta | baja (menos partículas y brillos: va mejor en móviles lentos)
    shake: true,
    dmgNumbers: true,
    hpNumbers: true,
    fps: false,
    frame: 'dorado', // color del marco de las ventanas (como en Mundo Misterioso)
    // controles
    joySize: 'mediano', // pequeño | mediano | grande
    leftHanded: false, // joystick de ataque a la izquierda
    autoAim: true, // un toque rápido dispara al enemigo más cercano
    aimGuide: true, // mostrar el indicador de apuntado en PC
  };
  let data = null;

  function load() {
    try { data = Object.assign({}, DEFAULTS, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { data = { ...DEFAULTS }; }
    return data;
  }
  const get = (k) => (data || load())[k];
  function set(k, v) {
    (data || load())[k] = v;
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) {}
    apply();
  }
  function reset() {
    data = { ...DEFAULTS };
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) {}
    apply();
  }
  // aplica lo que afecta a otros módulos
  function apply() {
    if (PB.Audio) {
      PB.Audio.setVolume(get('muted') ? 0 : get('volume') / 100);
      PB.Audio.setMusicVolume(get('music') / 100);
    }
    if (PB.PixUI && document.documentElement) PB.PixUI.installSkins();
  }
  return { load, get, set, reset, apply, DEFAULTS };
})();

// Márgenes de la zona segura (isla o notch del móvil en horizontal), en píxeles
PB.safe = () => {
  const cs = getComputedStyle(document.documentElement);
  const v = (k) => parseFloat(cs.getPropertyValue(k)) || 0;
  return { l: v('--sal'), r: v('--sar'), b: v('--sab') };
};

// Vibración respetando el ajuste
PB.vibrate = (ms) => {
  if (!PB.Settings.get('vibration')) return;
  if (navigator.vibrate) navigator.vibrate(ms);
  // mando con vibración
  const gp = navigator.getGamepads ? [...navigator.getGamepads()].find((g) => g && g.connected && g.vibrationActuator) : null;
  if (gp) gp.vibrationActuator.playEffect('dual-rumble', { duration: Math.min(400, ms * 2), strongMagnitude: 0.6, weakMagnitude: 0.4 }).catch(() => {});
};
