import { bakeryOrder, words } from './french-words.js';

const notebookKey = 'nuit-a-paris:words:v1';
const questKey = 'nuit-a-paris:bakery:v1';
const orderTranslation = 'Я хотел бы багет, пожалуйста.';

export function createLesson(bakery, player, audio, minimap, openWord) {
  const notebook = document.querySelector('#notebook');
  const bookButton = document.querySelector('#open-notebook');
  const list = notebook.querySelector('ul');
  const empty = notebook.querySelector('[data-empty]');
  const quest = document.querySelector('#bakery-quest');
  const questButton = quest.querySelector('button');
  const status = quest.querySelector('[role="status"]');
  const progress = quest.querySelector('[data-bakery-progress]');
  progress.querySelector('[lang="fr"]').textContent = bakeryOrder;
  progress.querySelector('[lang="ru"]').textContent = orderTranslation;
  const found = new Set();
  let state = 'travel';
  let closeEnough = false;

  try {
    const saved = JSON.parse(localStorage.getItem(notebookKey) || '[]');
    if (Array.isArray(saved)) saved.filter((key) => Object.hasOwn(words, key)).forEach((key) => found.add(key));
    if (localStorage.getItem(questKey) === 'done') state = 'done';
  } catch { /* браузер может запретить хранение */ }

  function addWord(key) {
    const [term, , , translation] = words[key];
    const item = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    const french = document.createElement('span');
    french.lang = 'fr';
    french.textContent = term;
    const meaning = document.createElement('span');
    meaning.textContent = translation;
    button.append(french, meaning);
    button.addEventListener('click', () => { toggleNotebook(false); openWord(key); });
    item.append(button);
    list.prepend(item);
  }

  function refreshBook() {
    bookButton.textContent = `Блокнот · ${found.size}`;
    empty.hidden = found.size > 0;
  }

  function toggleNotebook(open) {
    notebook.hidden = !open;
    bookButton.setAttribute('aria-expanded', String(open));
  }

  found.forEach(addWord);
  refreshBook();
  bookButton.hidden = false;
  bookButton.addEventListener('click', () => toggleNotebook(notebook.hidden));
  notebook.querySelector('[data-close]').addEventListener('click', () => {
    toggleNotebook(false);
    bookButton.focus();
  });
  addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !notebook.hidden) toggleNotebook(false);
  });

  function inspect(key, object) {
    if (!found.has(key)) {
      found.add(key);
      addWord(key);
      refreshBook();
      try { localStorage.setItem(notebookKey, JSON.stringify([...found])); } catch { /* нет доступа к записи */ }
    }
    if (state !== 'choosing' || !closeEnough || !object?.userData.bakeryChoice) return;
    if (key !== 'baguette') {
      status.textContent = 'Посмотри название на карточке и попробуй ещё раз.';
      return;
    }
    state = 'done';
    status.textContent = 'Très bien ! Ты выбрал багет.';
    minimap.setGoal(null);
    try { localStorage.setItem(questKey, 'done'); } catch { /* нет доступа к записи */ }
    update();
  }

  if (bakery) {
    quest.hidden = false;
    if (state !== 'done') minimap.setGoal(bakery);
    questButton.addEventListener('click', () => {
      if (!closeEnough) {
        minimap.toggleBig(true);
        return;
      }
      if (state === 'travel') {
        state = 'choosing';
        status.textContent = 'Послушай заказ и дважды нажми на нужную выпечку.';
        update();
      }
      audio.play('bakery-order', bakeryOrder, (message) => {
        status.textContent = message + ' ' + orderTranslation;
      });
    });
  }

  function update() {
    if (!bakery) return;
    const distance = Math.hypot(bakery.x - player.x, bakery.z - player.z);
    closeEnough = distance <= 4.2;
    const label = state === 'done' ? '✓ Заказ выполнен' : !closeEnough ? `Булочная · ${Math.ceil(distance)} м`
      : state === 'choosing' ? '▶ Повторить заказ' : '▶ Послушать заказ';
    if (questButton.textContent !== label) questButton.textContent = label;
    questButton.disabled = state === 'done';
    progress.hidden = state !== 'choosing' || !closeEnough;
  }

  update();
  return { inspect, update };
}
