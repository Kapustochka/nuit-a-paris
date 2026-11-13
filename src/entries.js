// Единый вид карточки для слов с улицы и для находок из падающих звёзд.
import { words } from './french-words.js';
import { starWords, starPhrases, starStories } from './star-words.js';
import { starSongs } from './star-songs.js';
import { talks } from './talk-lines.js';
import { PLACES } from './passport.js';

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
  if (group === 'place') {                      // место из «Паспорта Монмартра» (passport.js)
    const place = PLACES.find(([pid]) => pid === id);
    if (!place) return null;
    const [, , term, translation, example, meaning] = place;
    return { kind: 'word', badge: '🏛 Паспорт Монмартра', term, ipa: '', reading: '', translation, example, meaning,
      say: { term: [`place/${id}-name`, term, '▶ Название'], example: [`place/${id}`, example, '▶ Фраза'] } };
  }
  if (group === 'talk') {                       // фраза героини из разговора с прохожим (talk.js)
    const [, talkId, step, choice = '0'] = key.split(':');     // talk:<id>:<шаг>[:<вариант>] — вариант у заказов
    const line = talks[talkId]?.steps[Number(step)]?.choices[Number(choice)];
    if (!line) return null;
    const badge = { cafe: '☕ Из заказа в кафе', bakery: '🥖 Из булочной' }[talks[talkId].place] || '💬 Из разговора';
    return { kind: 'phrase', badge, term: line[0], translation: line[1],
      say: { term: [`talk/${talkId}-p${step}-${choice}`, line[0], '▶ Слушать'] } };
  }
  if (group === 'song' && starSongs[id]) {
    const { title, lines } = starSongs[id];
    return { kind: 'song', badge: '♪ Песенка со звезды', term: title[0], translation: title[1],
      lines: lines.map(([french, russian]) => [french, russian]),
      say: { term: [`song:${id}`, '', '♪ Мелодия'], example: [`star/m-${id}`, lines.map(([french]) => french).join(' '), '▶ Слова'] } };
  }
  return null;
}

export const starKeys = {
  word: Object.keys(starWords).map((id) => `star:${id}`),
  phrase: starPhrases.map((_, index) => `phrase:${index}`),
  story: starStories.map((_, index) => `story:${index}`),
  song: starSongs.map((_, index) => `song:${index}`),
};

// Клипы для сборки озвучки: имя файла без расширения и текст.
export function starClips() {
  const clips = {};
  for (const key of Object.values(starKeys).flat()) {
    for (const [clip, text] of Object.values(entryFor(key).say)) if (!clip.startsWith('song:')) clips[clip] = /[.!?»]$/.test(text) ? text : text + '.';
  }
  return clips;
}
