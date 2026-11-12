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
  };

  addEventListener('keydown', (e) => {
    if (e.target instanceof Element && e.target.closest('input, select, textarea, [contenteditable]')) return;
    if (e.code === 'Space' && e.target instanceof HTMLButtonElement) return;
    keys.add(e.code);
    if (e.repeat) return;
    if (e.code === 'Space') { state.jump = true; e.preventDefault(); }
    if (e.code === 'KeyF' || e.code === 'KeyJ') state.punch = true;
  });
  for (const [id, key] of [['btn-jump', 'jump'], ['btn-punch', 'punch']]) {
    const el = document.getElementById(id);
    if (el) el.addEventListener('pointerdown', (e) => { state[key] = true; e.preventDefault(); e.stopPropagation(); });
  }
  addEventListener('keyup', (e) => keys.delete(e.code));
  addEventListener('blur', () => keys.clear());
  addEventListener('focusin', (e) => {
    if (e.target instanceof Element && e.target.closest('input, select, textarea, [contenteditable]')) {
      keys.clear();
      state.jump = state.punch = false;
    }
  });

  // ── Джойстик ──────────────────────────────────────────────
  const base = document.getElementById('joy-base');
  const knob = document.getElementById('joy-knob');
  const R = 60; // радиус джойстика в пикселях
  let joyId = null, joyX = 0, joyY = 0, jx = 0, jy = 0;

  // ── Камера ────────────────────────────────────────────────
  let camId = null, lastX = 0, lastY = 0;
  const pinch = new Map(); let pinchDist = 0;

  dom.addEventListener('pointerdown', (e) => {
    dom.setPointerCapture(e.pointerId);
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
      state.camYaw -= (e.clientX - lastX) * 0.006;
      state.camPitch = clamp(state.camPitch + (e.clientY - lastY) * 0.004, -0.22, 1.1);
      lastX = e.clientX; lastY = e.clientY;
    }
  });

  const up = (e) => {
    if (e.pointerId === joyId) { joyId = null; jx = jy = 0; base.style.display = 'none'; }
    if (e.pointerId === camId) camId = null;
    pinch.delete(e.pointerId);
  };
  dom.addEventListener('pointerup', up);
  dom.addEventListener('pointercancel', up);
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
      if (l > 0.15) { x = jx; y = jy; run = l > 0.85; } // дотянул до края — бег
    }
    state.move.x = x; state.move.y = y; state.run = run;
    return state;
  }

  return { state, update };
}

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
