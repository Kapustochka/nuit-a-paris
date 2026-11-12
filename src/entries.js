// Единый вид карточки для слов с улицы и для находок из падающих звёзд.
import { words } from './french-words.js';
import { starWords, starPhrases, starStories } from './star-words.js';

const word = (entry, clip, badge) => {
  const [term, ipa, reading, translation, example, meaning] = entry;
  return { kind: 'word', badge, term, ipa, reading, translation, example, meaning,
    say: { term: [`${clip}-term`, term, '▶ Слово'], example: [`${clip}-example`, example, '▶ Фраза'] } };
};

export function entryFor(key) {
  if (typeof key !== 'string') return null;
  if (Object.hasOwn(words, key)) return word(words[key], key, '');
  const [group, id] = key.split(':');
  if (group === 'star' && Object.hasOwn(starWords, id)) return word(starWords[id], `star/w-${id}`, '✦ Слово со звезды');
  if (group === 'phrase' && starPhrases[id]) {
    const [term, translation] = starPhrases[id];
    return { kind: 'phrase', badge: '✦ Фраза со звезды', term, translation,
      say: { term: [`star/p-${id}`, term, '▶ Слушать'] } };
  }
  if (group === 'story' && starStories[id]) {
    const { kind, title, lines } = starStories[id];
    return { kind: 'story', badge: kind === 'fact' ? '✦ Интересный факт' : '✦ Маленькая история',
      term: title[0], translation: title[1], lines,
      say: { term: [`star/s-${id}`, lines.map(([french]) => french).join(' '), '▶ Слушать'] } };
  }
  return null;
}

export const starKeys = {
  word: Object.keys(starWords).map((id) => `star:${id}`),
  phrase: starPhrases.map((_, index) => `phrase:${index}`),
  story: starStories.map((_, index) => `story:${index}`),
};

// Клипы для сборки озвучки: имя файла без расширения и текст.
export function starClips() {
  const clips = {};
  for (const key of Object.values(starKeys).flat()) {
    for (const [clip, text] of Object.values(entryFor(key).say)) clips[clip] = /[.!?»]$/.test(text) ? text : text + '.';
  }
  return clips;
}
