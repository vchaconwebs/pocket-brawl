// Ajustes del jugador (se guardan en el navegador).
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

// Vibración respetando el ajuste
PB.vibrate = (ms) => {
  if (PB.Settings.get('vibration') && navigator.vibrate) navigator.vibrate(ms);
};
