import * as THREE from 'three';
import { entryFor } from './entries.js';

export function installWordInspector(canvas, scene, camera, moonDirection, audio, onInspect) {
  const card = document.querySelector('#word-card');
  const fields = Object.fromEntries(Array.from(card.querySelectorAll('[data-field]'),
    (element) => [element.dataset.field, element]));
  const marker = document.querySelector('#word-marker');
  const targets = [];
  scene.traverse((object) => { if (object.userData.word) targets.push(object); });
  const ray = new THREE.Raycaster();
  ray.far = camera.far;
  const pointer = new THREE.Vector2();
  const sample = document.createElement('canvas');
  sample.width = sample.height = 1;
  const pixels = sample.getContext('2d', { willReadFrequently: true });
  const uv = new THREE.Vector2();
  const sayButtons = Array.from(card.querySelectorAll('[data-say]'));
  let gesture, lastTap, markerTimer, selected;

  function visibleAt({ object, uv: at }) {
    const { map, alphaTest, transparent } = object.material;
    if (!map?.image || !at || (!alphaTest && !transparent)) return true;
    const image = map.image;
    const w = image.naturalWidth || image.width, h = image.naturalHeight || image.height;
    map.transformUv(uv.copy(at));
    const x = Math.min(w - 1, Math.max(0, Math.floor(uv.x * w)));
    const y = Math.min(h - 1, Math.max(0, Math.floor(uv.y * h)));
    pixels.clearRect(0, 0, 1, 1);
    pixels.drawImage(image, x, y, 1, 1, 0, 0, 1, 1);
    return pixels.getImageData(0, 0, 1, 1).data[3] >= (alphaTest || 0.25) * 255;
  }

  function inspect(x, y) {
    const bounds = canvas.getBoundingClientRect();
    pointer.set((x - bounds.left) / bounds.width * 2 - 1, 1 - (y - bounds.top) / bounds.height * 2);
    ray.setFromCamera(pointer, camera);
    const hit = ray.intersectObjects(targets, false).find(visibleAt);
    if (!hit) {
      if (ray.ray.direction.y < 0) return;
      show(ray.ray.direction.dot(moonDirection) >= Math.sqrt(1 - 0.021 ** 2) ? 'moon' : 'sky', x, y);
      return;
    }
    const tag = hit.object.userData.word;
    if (hit.object.userData.onInspect) { hit.object.userData.onInspect(x, y); return; }
    show(typeof tag === 'function' ? tag(hit) : tag, x, y, hit.object);
  }

  function show(word, x, y, object) {
    const entry = entryFor(word);
    if (!entry) return;
    audio.stop();
    selected = entry;
    card.dataset.kind = entry.kind;
    fields.badge.textContent = entry.badge;
    fields.term.textContent = entry.term;
    fields.ipa.textContent = entry.ipa ? `/${entry.ipa}/` : '';
    fields.reading.textContent = entry.reading || '';
    fields.translation.textContent = entry.translation;
    fields.example.textContent = entry.example || '';
    fields.meaning.textContent = entry.meaning || '';
    fields.lines.replaceChildren(...(entry.lines || []).map(([french, russian]) => {
      const item = document.createElement('li');
      const original = document.createElement('p');
      original.lang = 'fr';
      original.textContent = french;
      const meaning = document.createElement('p');
      meaning.textContent = russian;
      item.append(original, meaning);
      return item;
    }));
    for (const button of sayButtons) {
      const line = entry.say[button.dataset.say];
      button.hidden = !line;
      if (line) button.textContent = line[2];
    }
    fields.status.textContent = '';
    card.scrollTop = 0;
    card.hidden = false;
    onInspect(word, object);
    if (x === undefined) return;
    marker.style.left = `${x}px`;
    marker.style.top = `${y}px`;
    marker.hidden = false;
    clearTimeout(markerTimer);
    markerTimer = setTimeout(() => { marker.hidden = true; }, 550);
  }

  canvas.addEventListener('pointerdown', (event) => {
    if (!event.isPrimary || event.button !== 0) { gesture = lastTap = null; return; }
    gesture = { id: event.pointerId, x: event.clientX, y: event.clientY, time: event.timeStamp };
  });
  canvas.addEventListener('pointermove', (event) => {
    if (gesture?.id !== event.pointerId) return;
    if (Math.hypot(gesture.x - event.clientX, gesture.y - event.clientY) > 6) gesture = lastTap = null;
  });
  canvas.addEventListener('pointercancel', () => { gesture = lastTap = null; });
  canvas.addEventListener('pointerup', (event) => {
    const start = gesture;
    gesture = null;
    if (start?.id !== event.pointerId || event.timeStamp - start.time > 320 ||
        Math.hypot(start.x - event.clientX, start.y - event.clientY) > 6) {
      lastTap = null;
      return;
    }
    const tap = { x: event.clientX, y: event.clientY, time: event.timeStamp, type: event.pointerType };
    const radius = tap.type === 'touch' ? 25 : 12;
    if (lastTap?.type === tap.type && tap.time - lastTap.time <= 450 &&
        Math.hypot(tap.x - lastTap.x, tap.y - lastTap.y) <= radius) {
      lastTap = null;
      inspect(tap.x, tap.y);
    } else {
      lastTap = tap;
    }
  });

  function close() {
    card.hidden = true;
    marker.hidden = true;
    audio.stop();
  }
  card.querySelector('[data-close]').addEventListener('click', close);
  addEventListener('keydown', (event) => { if (event.key === 'Escape' && !card.hidden) close(); });
  // Песенка: строка, которую сейчас играет шкатулка, подсвечивается
  addEventListener('song-line', ({ detail }) => {
    [...fields.lines.children].forEach((item, i) => item.classList.toggle('singing', i === detail));
  });
  for (const button of sayButtons) {
    button.addEventListener('click', () => {
      const [clip, text] = selected.say[button.dataset.say];
      fields.status.textContent = '';
      audio.play(clip, text, (status) => { fields.status.textContent = status; });
    });
  }
  // Предметы, которые появляются уже во время прогулки (например, упавшая звезда).
  const addTarget = (object) => { targets.push(object); };
  const removeTarget = (object) => {
    const index = targets.indexOf(object);
    if (index >= 0) targets.splice(index, 1);
  };
  return { show, close, addTarget, removeTarget };
}
