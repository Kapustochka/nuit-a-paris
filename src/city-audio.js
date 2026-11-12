// Тихая ночная улица: синтез, без скачивания записей и без новых объектов в 3D.
// Один контекст, один шумовой буфер; короткие источники отсоединяются после проигрывания.
const SOUND_KEY = 'nuit-a-paris:city-sound:v1';
const WALTZ = [64, 67, 72, 71, 67, 62, 65, 69, 74, 72, 69, 65, 64, 67, 71, 69, 65, 62, 60, 64, 67, 64, 62, 60];

export function createCityAudio(cafes = [], square = { x: 0, z: 0 }) {
  const button = document.querySelector('#city-sound');
  let ctx, master, wind, noise, reed, rain, rainLevel = 0, nextDrip = 0, enabled = true, ducked = false, disposed = false;
  let lastX, lastZ, walked = 0, elapsed = 0, nextGlass = 5, nextNote = 0, note = 0;
  let cafeLevel = 0, musicLevel = 0, steps = 0, glasses = 0;
  const sources = new Set();
  try { enabled = localStorage.getItem(SOUND_KEY) !== '0'; } catch { /* в памяти */ }

  function refresh() {
    button.setAttribute('aria-pressed', String(enabled));
    button.textContent = `Звук города: ${enabled ? 'вкл' : 'выкл'}`;
  }
  function mix() {
    if (!ctx) return;
    master.gain.setTargetAtTime(enabled && !document.hidden ? (ducked ? 0.07 : 0.35) : 0, ctx.currentTime, 0.12);
  }
  function track(source, ...nodes) {
    sources.add(source);
    source.onended = () => { sources.delete(source); source.disconnect(); nodes.forEach((n) => n.disconnect()); };
    return source;
  }
  function start() {
    if (!enabled || document.hidden || disposed) return;
    try {
      if (!ctx) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) { button.disabled = true; button.textContent = 'Звук недоступен'; return; }
        ctx = new AudioCtx();
        master = ctx.createGain(); master.gain.value = 0; master.connect(ctx.destination);
        noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
        const data = noise.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
        const filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 420;
        wind = ctx.createGain(); wind.gain.value = 0.12;
        const air = track(ctx.createBufferSource(), filter, wind);
        air.buffer = noise; air.loop = true; air.connect(filter).connect(wind).connect(master); air.start();
        // Дождь: тот же шум, только шипящий; громкость задаёт rain.js через setRain()
        const hiss = ctx.createBiquadFilter(), soft = ctx.createBiquadFilter();
        hiss.type = 'highpass'; hiss.frequency.value = 900; soft.type = 'lowpass'; soft.frequency.value = 3200;
        rain = ctx.createGain(); rain.gain.value = 0;
        const shower = track(ctx.createBufferSource(), hiss, soft, rain);
        shower.buffer = noise; shower.loop = true; shower.playbackRate.value = 0.93;
        shower.connect(hiss).connect(soft).connect(rain).connect(master); shower.start(0, 0.7);
        // Мягкий язычковый тембр. Мелодия вальса — собственная короткая последовательность.
        reed = ctx.createPeriodicWave(new Float32Array(7), new Float32Array([0, 1, 0.35, 0.22, 0.12, 0.08, 0.04]));
      }
      ctx.resume().then(mix).catch(() => {});
      mix();
    } catch { /* звук необязателен, игра продолжает работать */ }
  }
  function burst(level, frequency, duration, pan) {
    const source = ctx.createBufferSource(), filter = ctx.createBiquadFilter();
    const gain = ctx.createGain(), stereo = ctx.createStereoPanner(), t = ctx.currentTime;
    source.buffer = noise; filter.type = 'bandpass'; filter.frequency.value = frequency; filter.Q.value = 0.65;
    stereo.pan.value = pan;
    gain.gain.setValueAtTime(0, t); gain.gain.linearRampToValueAtTime(level, t + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    source.connect(filter).connect(gain).connect(stereo).connect(master);
    track(source, filter, gain, stereo).start(t, Math.random()); source.stop(t + duration + 0.02);
  }
  function tone(hz, level, duration, pan, accordion = false) {
    const source = ctx.createOscillator(), gain = ctx.createGain(), stereo = ctx.createStereoPanner(), t = ctx.currentTime;
    if (accordion) source.setPeriodicWave(reed); else source.type = 'sine';
    source.frequency.value = hz; stereo.pan.value = pan;
    gain.gain.setValueAtTime(0, t); gain.gain.linearRampToValueAtTime(level, t + (accordion ? 0.08 : 0.003));
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    source.connect(gain).connect(stereo).connect(master);
    track(source, gain, stereo).start(t); source.stop(t + duration + 0.02);
  }
  function spatial(spot, x, z, yaw, radius) {
    const dx = spot.x - x, dz = spot.z - z, distance = Math.hypot(dx, dz);
    return { level: Math.max(0, 1 - distance / radius) ** 2,
      pan: Math.max(-0.85, Math.min(0.85, (dx * Math.cos(yaw) - dz * Math.sin(yaw)) / Math.max(distance, 1))) };
  }
  function update(dt, x, z, yaw, grounded = true) {
    const distance = lastX === undefined ? 0 : Math.hypot(x - lastX, z - lastZ);
    lastX = x; lastZ = z;
    if (!ctx || ctx.state !== 'running' || !enabled || document.hidden || disposed) { walked = 0; return; }
    elapsed += dt;
    wind.gain.setTargetAtTime(0.1 + Math.sin(elapsed * 0.18) * 0.025, ctx.currentTime, 1);
    if (grounded && distance < 1 && distance > 0.001) {
      walked += distance;
      const stride = distance / Math.max(dt, 0.001) > 2.5 ? 0.95 : 0.65;
      if (walked >= stride) {
        walked %= stride; steps++;
        burst(0.14, 850 + Math.random() * 500, 0.085, steps % 2 ? -0.13 : 0.13);
        tone(125 + Math.random() * 30, 0.06, 0.07, 0);
      }
    } else walked = 0;

    // Бокалы слышны только у ближайшего настоящего кафе, без суммирования десятков источников.
    let nearest = { level: 0, pan: 0 };
    for (const spot of cafes) {
      const at = spatial(spot, x, z, yaw, 16);
      if (at.level > nearest.level) nearest = at;
    }
    cafeLevel = nearest.level;
    if (elapsed >= nextGlass) {
      nextGlass = elapsed + 5 + Math.random() * 8;
      if (cafeLevel > 0.03) {
        glasses++;
        tone(2300 + Math.random() * 350, 0.08 * cafeLevel, 0.55, nearest.pan);
        tone(3650, 0.025 * cafeLevel, 0.25, nearest.pan);
      }
    }
    rain.gain.setTargetAtTime(rainLevel * 0.09, ctx.currentTime, 0.8);
    if (rainLevel > 0.05 && elapsed >= nextDrip) {                // капли по навесам и подоконникам
      nextDrip = elapsed + (0.4 + Math.random() * 1.6) / rainLevel;
      burst(0.02 * rainLevel, 2600 + Math.random() * 2400, 0.04, Math.random() * 1.6 - 0.8);
    }
    const at = spatial(square, x, z, yaw, 42);
    musicLevel = at.level;
    if (elapsed >= nextNote) {
      nextNote = elapsed + 0.56;
      const pitch = WALTZ[note++ % WALTZ.length], hz = 440 * 2 ** ((pitch - 69) / 12);
      if (musicLevel > 0.015) {
        tone(hz, 0.035 * musicLevel, 0.5, at.pan, true);
        tone(hz * 1.003, 0.018 * musicLevel, 0.5, at.pan, true);
      }
    }
  }
  function setEnabled(on) {
    enabled = Boolean(on); refresh();
    try { localStorage.setItem(SOUND_KEY, enabled ? '1' : '0'); } catch { /* в памяти */ }
    if (enabled) start(); else { mix(); ctx?.suspend().catch(() => {}); }
  }
  function visibility() {
    if (document.hidden) { mix(); ctx?.suspend().catch(() => {}); }
    else start();
  }
  const toggle = () => { setEnabled(!enabled); button.blur(); };
  button.addEventListener('click', toggle);
  addEventListener('pointerdown', start, { passive: true });
  addEventListener('keydown', start);
  document.addEventListener('visibilitychange', visibility);
  refresh();
  function dispose() {
    disposed = true;
    removeEventListener('pointerdown', start); removeEventListener('keydown', start);
    document.removeEventListener('visibilitychange', visibility); button.removeEventListener('click', toggle);
    for (const source of sources) { try { source.stop(); } catch { /* уже остановлен */ } }
    ctx?.close().catch(() => {});
  }
  return { update, setEnabled, dispose, setDucked(on) { ducked = Boolean(on); mix(); }, setRain(level) { rainLevel = level; },
    get status() { return { enabled, ducked, state: ctx?.state || 'locked', sources: sources.size,
      cafeLevel, musicLevel, steps, glasses, bufferBytes: noise ? noise.length * 4 : 0 }; } };
}
