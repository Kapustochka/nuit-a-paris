// controls.js — клавиатура (WASD/стрелки + Shift) и экранный джойстик для телефона,
// плюс вращение камеры: мышью/пальцем по правой части экрана, колесо/щипок — приближение.

export function createControls(dom) {
  const keys = new Set();
  const state = {
    move: { x: 0, y: 0 },  // x — вправо, y — вперёд, длина 0..1
    run: false,
    camYaw: 0,             // поворот камеры вокруг героини
    camPitch: 0.01,        // наклон камеры
    camDist: 4.2,          // расстояние
    jump: false,           // нажали прыжок (сбрасывается после чтения)
    punch: false,          // нажали удар
    dance: null,           // which dance to start: 'dance' or 'rumba'
  };

  addEventListener('keydown', (e) => {
    if (e.code === 'Space' && e.target instanceof HTMLButtonElement) return;
    keys.add(e.code);
    if (e.repeat) return;
    if (e.code === 'Space') { state.jump = true; e.preventDefault(); }
    if (e.code === 'KeyF' || e.code === 'KeyJ') state.punch = true;
    if (e.code === 'Digit1') state.dance = 'dance';
    if (e.code === 'Digit2') state.dance = 'rumba';
  });
  for (const [id, key] of [['btn-jump', 'jump'], ['btn-punch', 'punch']]) {
    const el = document.getElementById(id);
    if (el) el.addEventListener('pointerdown', (e) => { state[key] = true; e.preventDefault(); e.stopPropagation(); });
  }
  // One button cycles the dances on a phone
  let nextDance = 0;
  const danceBtn = document.getElementById('btn-dance');
  if (danceBtn) danceBtn.addEventListener('pointerdown', (e) => {
    state.dance = ['dance', 'rumba'][nextDance++ % 2]; e.preventDefault(); e.stopPropagation();
  });
  addEventListener('keyup', (e) => {
    keys.delete(e.code);
    // Пока зажат Cmd/Win, браузер не присылает отпускание других клавиш — сбрасываем всё
    if (e.key === 'Meta' || e.key === 'OS') keys.clear();
  });
  // «Залипание»: отпускание клавиши может потеряться (ушёл фокус, контекстное меню,
  // автопрокрутка средней кнопкой, Alt на Windows). Тогда героиня шла бы сама — сбрасываем.
  const releaseAll = () => { keys.clear(); dropJoy(); camId = null; pinch.clear(); };
  addEventListener('blur', releaseAll);
  document.addEventListener('visibilitychange', () => { if (document.hidden) releaseAll(); });
  addEventListener('contextmenu', (e) => { keys.clear(); if (e.target === dom) e.preventDefault(); });
  addEventListener('keydown', (e) => { if (e.key === 'Alt' || e.key === 'Meta') keys.clear(); }, true);

  // ── Джойстик ──────────────────────────────────────────────
  const base = document.getElementById('joy-base');
  const knob = document.getElementById('joy-knob');
  const R = 60; // радиус джойстика в пикселях
  let joyId = null, joyX = 0, joyY = 0, jx = 0, jy = 0;

  // ── Камера ────────────────────────────────────────────────
  let camId = null, lastX = 0, lastY = 0;
  const pinch = new Map(); let pinchDist = 0;

  function dropJoy() {
    joyId = null; jx = jy = 0; joyRun = false;
    if (base) base.style.display = 'none';
  }
  let joyRun = false;

  dom.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse') e.preventDefault();   // без выделения, перетаскивания и автопрокрутки
    try { dom.setPointerCapture(e.pointerId); } catch { /* не страшно */ }
    const leftHalf = e.clientX < innerWidth / 2;
    if (e.pointerType === 'touch' && leftHalf && joyId === null) {
      joyId = e.pointerId; joyX = e.clientX; joyY = e.clientY; jx = jy = 0;
      base.style.display = 'block';
      base.style.left = joyX + 'px'; base.style.top = joyY + 'px';
      knob.style.transform = 'translate(-50%, -50%)';
      return;
    }
    if (e.pointerType === 'touch') {
      pinch.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinch.size === 2) { pinchDist = spread(); camId = null; return; }
    }
    if (camId === null) { camId = e.pointerId; lastX = e.clientX; lastY = e.clientY; }
  });

  dom.addEventListener('pointermove', (e) => {
    if (e.pointerId === joyId) {
      let dx = e.clientX - joyX, dy = e.clientY - joyY;
      const len = Math.hypot(dx, dy);
      if (len > R) { dx *= R / len; dy *= R / len; }
      jx = dx / R; jy = -dy / R;
      knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
      return;
    }
    if (pinch.has(e.pointerId)) {
      pinch.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinch.size === 2) {
        const d = spread();
        state.camDist = clamp(state.camDist * (pinchDist / d), 2.2, 9);
        pinchDist = d; return;
      }
    }
    if (e.pointerId === camId) {
      if (e.pointerType === 'mouse' && e.buttons === 0) { camId = null; return; }   // кнопку отпустили за окном
      state.camYaw -= (e.clientX - lastX) * 0.006;
      state.camPitch = clamp(state.camPitch + (e.clientY - lastY) * 0.004, -0.22, 1.1);
      lastX = e.clientX; lastY = e.clientY;
    }
  });

  const up = (e) => {
    if (e.pointerId === joyId) dropJoy();
    if (e.pointerId === camId) camId = null;
    pinch.delete(e.pointerId);
  };
  dom.addEventListener('pointerup', up);
  dom.addEventListener('pointercancel', up);
  dom.addEventListener('lostpointercapture', up);
  dom.addEventListener('wheel', (e) => {
    state.camDist = clamp(state.camDist * (1 + Math.sign(e.deltaY) * 0.1), 2.2, 9);
  }, { passive: true });

  function spread() {
    const [a, b] = [...pinch.values()];
    return Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
  }

  function update() {
    let x = 0, y = 0;
    if (keys.has('KeyW') || keys.has('ArrowUp')) y += 1;
    if (keys.has('KeyS') || keys.has('ArrowDown')) y -= 1;
    if (keys.has('KeyD') || keys.has('ArrowRight')) x += 1;
    if (keys.has('KeyA') || keys.has('ArrowLeft')) x -= 1;
    let run = keys.has('ShiftLeft') || keys.has('ShiftRight');
    if (x || y) { const l = Math.hypot(x, y); x /= l; y /= l; }
    if (joyId !== null) {
      const l = Math.hypot(jx, jy);
      // мёртвая зона в центре, дальше скорость плавно растёт; у края — бег (с запасом, чтобы не дёргалось)
      joyRun = joyRun ? l > 0.78 : l > 0.9;
      if (l > 0.12) { const k = Math.min(1, (l - 0.12) / 0.7) / l; x = jx * k; y = jy * k; run = joyRun; }
    }
    state.move.x = x; state.move.y = y; state.run = run;
    return state;
  }

  return { state, update };
}

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
