// evening.js — «Ce soir»: бумажный список из четырёх дел на этот вечер.
// Он связывает всё, что уже есть в игре: разговоры с прохожими (talk.js), паспорт Монмартра
// (passport.js), падающие звёзды, новые слова и их повторение, подъём к Сакре-Кёр и, если есть,
// заказ в кафе. Каждое дело — короткая французская фраза с переводом и голосом
// (assets/voice/evening/, scripts/build-evening-voice.py).
// Модули сообщают о сделанном одной строкой: deed('talk'). Новый список — каждый день
// (вечер считается до 5 утра), прогресс хранится в браузере.

// [id, фраза, перевод, сколько раз, что нужно, чтобы дело было в списке]
export const TASKS = [
  ['talk', 'Parler avec deux passants.', 'Поговорить с двумя прохожими.', 2],
  ['place', 'Trouver un nouveau lieu.', 'Найти новое место для паспорта.', 1, 'place'],
  ['star', 'Attraper une étoile filante.', 'Поймать падающую звезду.', 1, 'star'],
  ['word', 'Découvrir trois mots nouveaux.', 'Найти три новых слова.', 3],
  ['review', 'Réviser deux mots.', 'Повторить и вспомнить два слова.', 2, 'review'],
  ['sacre', 'Monter jusqu’au Sacré-Cœur.', 'Подняться к Сакре-Кёр.', 1],
  ['cafe', 'Commander quelque chose au café.', 'Заказать что-нибудь в кафе.', 1, 'cafe'],
];
export const BRAVO = ['Belle soirée ! Tout est fait.', 'Прекрасный вечер! Всё сделано.'];
// Подсказка «как это сделать» — мелко под переводом
export const HOW = {
  talk: 'Двойной клик (на телефоне — касание) по прохожему рядом.',
  place: 'Знаки «?» на большой карте (M или по нажатию на мини-карту).',
  star: 'Иди вперёд — звезда упадёт рядом. Двойной клик (касание) по ней.',
  word: 'Двойной клик (касание) по фонарям, дверям, скамейкам, деревьям…',
  review: 'Каждая четвёртая звезда спрашивает слово из блокнота.',
  sacre: 'Белый купол над крышами. Вверх по лестницам.',
  cafe: 'Подойди к столику кафе.',
};
const KEY = 'nuit-a-paris:evening:v1';
const PER_EVENING = 4;

export const deed = (kind) => dispatchEvent(new CustomEvent('nuit:deed', { detail: { kind } }));

// Вечер — это день, сдвинутый на 5 часов: в час ночи ещё тот же вечер
export function eveningKey(now = new Date()) {
  const d = new Date(now.getTime() - 5 * 3600e3);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Четыре дела на вечер: одинаковые весь вечер, разговор всегда есть, остальное — по жребию дня
export function planEvening(key, available) {
  let seed = 0;
  for (const ch of key) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
  const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
  const pool = TASKS.filter(([id, , , , needs]) => id !== 'talk' && (!needs || available.has(needs))).map(([id]) => id);
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  return ['talk', ...pool.slice(0, PER_EVENING - 1)];
}

export function createEvening({ audio, player, available, sacre, storage = () => localStorage, now = () => new Date() }) {
  const byId = Object.fromEntries(TASKS.map(([id, fr, ru, n]) => [id, { id, fr, ru, n }]));
  let state = null;
  function load() {
    const key = eveningKey(now());
    if (state?.key === key) return;
    try { state = JSON.parse(storage().getItem(KEY) || 'null'); } catch { state = null; }
    if (state?.key !== key || !Array.isArray(state.plan)) state = { key, plan: planEvening(key, available), done: {}, bravo: false };
    state.plan = state.plan.filter((id) => byId[id]);
  }
  const save = () => { try { storage().setItem(KEY, JSON.stringify(state)); } catch { /* в памяти */ } };
  const count = (id) => Math.min(state.done[id] || 0, byId[id].n);
  const finished = () => state.plan.filter((id) => count(id) >= byId[id].n).length;
  load();

  const button = document.createElement('button');
  button.id = 'open-evening'; button.type = 'button'; button.className = 'lesson-button'; button.lang = 'fr';
  button.setAttribute('aria-controls', 'evening'); button.setAttribute('aria-expanded', 'false');
  const panel = document.createElement('aside');
  panel.id = 'evening'; panel.lang = 'ru'; panel.hidden = true; panel.setAttribute('aria-label', 'Дела на этот вечер');
  panel.innerHTML = `<button type="button" data-close aria-label="Закрыть">×</button>
    <h2 lang="fr">Ce soir…</h2><p class="evening-sub">Дела на этот вечер. Завтра будет новый список.</p><ul></ul>
    <p class="evening-bravo" lang="fr" hidden></p>`;
  const toast = document.createElement('div');
  toast.id = 'evening-toast'; toast.hidden = true; toast.setAttribute('role', 'status');
  document.body.append(button, panel, toast);
  const list = panel.querySelector('ul'), bravoLine = panel.querySelector('.evening-bravo');

  function draw() {
    const total = state.plan.length, ok = finished();
    button.textContent = ok === total ? 'Ce soir ✓' : `Ce soir · ${ok}/${total}`;
    button.classList.toggle('all-done', ok === total);
    list.replaceChildren(...state.plan.map((id) => {
      const t = byId[id], c = count(id), done = c >= t.n;
      const li = document.createElement('li');
      li.className = done ? 'done' : '';
      li.innerHTML = `<span class="evening-tick" aria-hidden="true"></span>
        <span class="evening-text"><span class="evening-fr" lang="fr"></span><span class="evening-ru"></span><span class="evening-how"></span></span>
        <span class="evening-count"></span><button type="button" class="evening-say" aria-label="Слушать">▶</button>`;
      li.querySelector('.evening-fr').textContent = t.fr;
      li.querySelector('.evening-ru').textContent = t.ru;
      li.querySelector('.evening-how').textContent = done ? '' : HOW[id] || '';
      li.querySelector('.evening-count').textContent = t.n > 1 ? `${c}/${t.n}` : '';
      li.querySelector('.evening-say').addEventListener('click', () => audio.play(`evening/${id}`, t.fr));
      return li;
    }));
    bravoLine.hidden = ok !== total;
    bravoLine.textContent = `✦ ${BRAVO[0]}`;
  }
  draw();

  let toastTimer = 0;
  function tell(text, sub, big = false) {
    toast.replaceChildren();
    const b = document.createElement('b'); b.lang = 'fr'; b.textContent = text;
    const s = document.createElement('span'); s.textContent = sub;
    toast.append(b, s);
    toast.classList.toggle('big', big);
    toast.hidden = false; toast.classList.remove('show'); void toast.offsetWidth; toast.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { toast.hidden = true; }, big ? 7000 : 4200);
  }

  function mark(kind) {
    load();
    const t = byId[kind];
    if (!t || !state.plan.includes(kind) || count(kind) >= t.n) return;
    state.done[kind] = count(kind) + 1;
    const nowDone = count(kind) >= t.n;
    if (finished() === state.plan.length && !state.bravo) {
      state.bravo = true;
      tell(BRAVO[0], BRAVO[1], true);
      setTimeout(() => audio.play('evening/bravo', BRAVO[0]), 900);
    } else if (nowDone) tell(`✓ ${t.fr}`, `${t.ru} Осталось дел: ${state.plan.length - finished()}.`);
    save(); draw();
  }
  addEventListener('nuit:deed', (e) => mark(e.detail?.kind));

  const toggle = (open) => { panel.hidden = !open; button.setAttribute('aria-expanded', String(open)); if (open) { load(); draw(); } };
  button.addEventListener('click', () => toggle(panel.hidden));
  panel.querySelector('[data-close]').addEventListener('click', () => toggle(false));
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && !panel.hidden) toggle(false); });

  // Раз в вечер листок сам приоткрывается через несколько секунд после входа — чтобы о нём узнали
  if (!state.shown) {
    state.shown = true; save();
    setTimeout(() => { if (panel.hidden) { toggle(true); setTimeout(() => toggle(false), 9000); } }, 6000);
  }

  let tick = 0;
  return {
    get plan() { return state.plan.map((id) => ({ ...byId[id], count: count(id) })); },
    mark,
    update(dt) {
      tick -= dt;
      if (tick > 0) return;
      tick = 1;
      if (sacre && Math.hypot(player.x - sacre[0], player.z - sacre[1]) < 30) mark('sacre');
    },
  };
}
