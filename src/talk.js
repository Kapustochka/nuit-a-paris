// talk.js — короткий разговор с прохожим: двойной клик по нему (people.js) открывает бумажную
// карточку внизу экрана. Прохожий говорит реплику (голосом и текстом), героиня отвечает одним из
// трёх вариантов. Подходящий ответ ведёт разговор дальше, неподходящий — прохожий переспрашивает.
// В конце удачные ответы попадают в блокнот (lesson.inspect), а пройденные разговоры запоминаются,
// чтобы в следующий раз прохожие начинали другие. Отойдёшь дальше 7 м — разговор закончится.
import { talks, puzzled } from './talk-lines.js';

const DONE_KEY = 'nuit-a-paris:talks-done:v1';
const RU_KEY = 'nuit-a-paris:talk-translation';

export function createTalk({ audio, lesson, player }) {
  const box = document.createElement('aside');
  box.id = 'talk';
  box.lang = 'ru';
  box.hidden = true;
  box.innerHTML = `
    <button type="button" class="talk-close" aria-label="Закончить разговор">×</button>
    <p class="talk-badge"></p>
    <div class="talk-npc"><button type="button" class="talk-say" aria-label="Повторить">▶</button><p lang="fr"></p><small></small></div>
    <ol class="talk-choices"></ol>
    <label class="talk-ru"><input type="checkbox"> перевод</label>`;
  document.body.append(box);
  const badge = box.querySelector('.talk-badge'), npcFr = box.querySelector('.talk-npc p'), npcRu = box.querySelector('.talk-npc small');
  const list = box.querySelector('.talk-choices'), ruBox = box.querySelector('.talk-ru input');
  let done = new Set(), person = null, talk = null, talkId = '', step = 0, said = null;
  try { done = new Set(JSON.parse(localStorage.getItem(DONE_KEY) || '[]')); } catch { /* в памяти */ }
  try { ruBox.checked = localStorage.getItem(RU_KEY) !== '0'; } catch { ruBox.checked = true; }
  const showRu = () => box.classList.toggle('no-ru', !ruBox.checked);
  showRu();
  ruBox.addEventListener('change', () => { showRu(); try { localStorage.setItem(RU_KEY, ruBox.checked ? '1' : '0'); } catch { /* не страшно */ } });

  const voice = (name) => `talk/${name}-${person.woman ? 'f' : 'm'}`;
  function npcSays([fr, ru], clip) {
    npcFr.textContent = fr; npcRu.textContent = ru;
    said = [clip, fr];
    audio.play(clip, fr);
  }
  box.querySelector('.talk-say').addEventListener('click', () => said && audio.play(...said));

  function choose(raining) {
    const pool = Object.keys(talks).filter((id) => !talks[id].rain || raining);
    const fresh = pool.filter((id) => !done.has(id));
    const from = fresh.length ? fresh : pool;
    if (raining && from.includes('pluie') && Math.random() < 0.6) return 'pluie';
    return from[Math.floor(Math.random() * from.length)];
  }

  function showStep() {
    const s = talk.steps[step];
    if (s.npc) npcSays(s.npc, voice(`${talkId}-n${step}`));
    else { npcFr.textContent = 'Начни разговор сама…'; npcRu.textContent = ''; said = null; }
    list.replaceChildren();
    const order = [0, 1, 2].sort(() => Math.random() - 0.5);
    for (const c of order) {
      const [fr, ru] = s.choices[c];
      const li = document.createElement('li'), b = document.createElement('button');
      b.type = 'button';
      b.innerHTML = '<span lang="fr"></span><small></small>';
      b.firstChild.textContent = fr; b.lastChild.textContent = ru;
      b.addEventListener('click', () => answer(c, b));
      li.append(b); list.append(li);
    }
  }

  function answer(c, button) {
    const [fr] = talk.steps[step].choices[c];
    audio.play(`talk/${talkId}-p${step}-${c}`, fr);
    if (c !== 0) {
      button.classList.add('wrong'); button.disabled = true;
      const i = Math.floor(Math.random() * puzzled.length);
      const who = person;
      setTimeout(() => person === who && npcSays(puzzled[i], voice(`huh-${i}`)), 1300);
      return;
    }
    button.classList.add('right');
    list.querySelectorAll('button').forEach((b) => { b.disabled = true; });
    lesson.inspect(`talk:${talkId}:${step}`);
    const who = person;
    setTimeout(() => {
      if (person !== who) return;
      step++;
      if (step < talk.steps.length) showStep();
      else finish();
    }, 1500);
  }

  function finish() {
    npcSays(talk.end, voice(`${talkId}-end`));
    list.replaceChildren();
    const li = document.createElement('li'), b = document.createElement('button');
    b.type = 'button'; b.className = 'talk-done';
    b.textContent = 'Фразы из разговора — в блокноте ✓';
    b.addEventListener('click', () => close(false));
    li.append(b); list.append(li);
    done.add(talkId);
    try { localStorage.setItem(DONE_KEY, JSON.stringify([...done])); } catch { /* не страшно */ }
    const who = person;
    setTimeout(() => person === who && close(false), 4500);
  }

  function close(stopVoice = true) {
    if (!person) return;
    if (stopVoice) audio.stop();
    person.talking = false;
    person.pause = 0.6;
    person = null; talk = null;
    box.hidden = true;
  }
  box.querySelector('.talk-close').addEventListener('click', () => close());
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && person) close(); });

  return {
    get active() { return person !== null; },
    start(p, raining = false) {
      if (person === p) return;
      if (person) close();
      if (Math.hypot(p.root.position.x - player.x, p.root.position.z - player.z) > 7) return false;
      person = p; p.talking = true;
      talkId = choose(raining); talk = talks[talkId]; step = 0;
      badge.textContent = `💬 ${talk.title} · ${p.woman ? 'прохожая' : 'прохожий'}`;
      box.hidden = false;
      showStep();
      return true;
    },
    update() {
      if (person && Math.hypot(person.root.position.x - player.x, person.root.position.z - player.z) > 7) close();
    },
  };
}
