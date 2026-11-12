import { entryFor } from './entries.js';
import { createWordReview } from './word-review.js';

const notebookKey = 'nuit-a-paris:words:v1';

// Блокнот найденных слов (квест в булочной убран — позже придумаем другие задания)
export function createLesson(openWord) {
  const notebook = document.querySelector('#notebook');
  const bookButton = document.querySelector('#open-notebook');
  const list = notebook.querySelector('ul');
  const empty = notebook.querySelector('[data-empty]');
  const found = new Set();

  try {
    const saved = JSON.parse(localStorage.getItem(notebookKey) || '[]');
    if (Array.isArray(saved)) saved.filter((key) => entryFor(key)).forEach((key) => found.add(key));
  } catch { /* браузер может запретить хранение */ }
  const review = createWordReview(found);

  function addWord(key) {
    const { term, translation } = entryFor(key);
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

  function inspect(key) {
    if (!found.has(key)) {
      found.add(key);
      review.learn(key);
      addWord(key);
      refreshBook();
      try { localStorage.setItem(notebookKey, JSON.stringify([...found])); } catch { /* нет доступа к записи */ }
    }
  }

  return { inspect, review };
}
