import * as THREE from 'three';

// Клипы «на месте»: бёдра не уезжают вперёд (смещение за цикл < 1 см), значит движение по маршруту
// не складывается с движением из анимации. Скорость, при которой стопа на земле стоит неподвижно,
// = скорость, с которой опорная стопа едет назад в клипе. Анимацию потом крутим ровно по пройденному пути.
export function gaitSpeed(model, mixer, duration) {
  const toes = [];
  model.traverse((o) => { if (o.isBone && /toe|foot/i.test(o.name) && !/_end/i.test(o.name)) toes.push(o); });
  const N = 72, dt = duration / N, track = toes.map(() => []);
  const v = new THREE.Vector3();
  for (let i = 0; i <= N; i++) {
    mixer.setTime(i * dt);
    model.updateMatrixWorld(true);
    toes.forEach((b, k) => { b.getWorldPosition(v); track[k].push([v.y, v.z]); });
  }
  const speeds = [];
  for (const t of track) {
    const low = Math.min(...t.map(([y]) => y));
    for (let i = 1; i < t.length; i++) {
      if (t[i][0] < low + 0.015 && t[i - 1][0] < low + 0.015) speeds.push(Math.abs(t[i][1] - t[i - 1][1]) / dt);
    }
  }
  speeds.sort((a, b) => a - b);
  const median = speeds[Math.floor(speeds.length / 2)] || 1.2;
  return THREE.MathUtils.clamp(median, 0.5, 2);
}
