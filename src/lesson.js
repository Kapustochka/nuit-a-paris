import { entryFor } from './entries.js';
import { createWordReview } from './word-review.js';

const notebookKey = 'nuit-a-paris:words:v1';

// Блокнот найденных слов (квест в булочной убран — позже придумаем другие задания)
export function createLesson(openWord) {
  const notebook = document.querySelector('#notebook');
  const bookButton = document.querySelector('#open-notebook');
  const list = notebook.querySelector('ul');
  const empty = notebook.querySelector('[data-empty]');
  const search = notebook.querySelector('#notebook-search');
  const kind = notebook.querySelector('#notebook-kind');
  const results = notebook.querySelector('[data-results]');
  const normalize = (text) => text.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase();
  const items = [];
  const found = new Set();

  try {
    const saved = JSON.parse(localStorage.getItem(notebookKey) || '[]');
    if (Array.isArray(saved)) saved.filter((key) => entryFor(key)).forEach((key) => found.add(key));
  } catch { /* браузер может запретить хранение */ }
  const review = createWordReview(found);

  function addWord(key) {
    const entry = entryFor(key);
    const { term, translation } = entry;
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
    items.push({ item, kind: entry.kind, text: normalize([
      term, translation, entry.example, entry.meaning,
      ...(entry.lines || []).flat(),
    ].filter(Boolean).join(' ')) });
  }

  function filterBook() {
    const query = normalize(search.value.trim());
    let count = 0;
    for (const record of items) {
      record.item.hidden = (kind.value && record.kind !== kind.value) || !record.text.includes(query);
      if (!record.item.hidden) count++;
    }
    results.textContent = found.size === 0 ? '' : count === 0
      ? 'Ничего не найдено. Попробуй другой запрос или тип.'
      : `Показано ${count} из ${found.size}`;
  }
  search.addEventListener('input', filterBook);
  kind.addEventListener('change', filterBook);

  function refreshBook() {
    bookButton.textContent = `Блокнот · ${found.size}`;
    empty.hidden = found.size > 0;
    filterBook();
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
