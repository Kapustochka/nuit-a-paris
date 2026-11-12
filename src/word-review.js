import { entryFor } from './entries.js';

const STORAGE_KEY = 'nuit-a-paris:review:v1';
const MINUTE = 60_000, DAY = 24 * 60 * MINUTE;
const INTERVALS = [10 * MINUTE, DAY, 3 * DAY, 7 * DAY, 14 * DAY, 30 * DAY];

// Только уже найденные слова. Старые блокноты подхватываются без потери находок.
export function createWordReview(found, { now = Date.now, storage = () => localStorage } = {}) {
  const records = new Map();
  try {
    const saved = JSON.parse(storage().getItem(STORAGE_KEY) || '{}');
    for (const [key, value] of Object.entries(saved || {})) {
      if (entryFor(key)?.kind !== 'word' || !value || !Number.isFinite(value.due) ||
          !Number.isInteger(value.streak) || value.streak < 0 || value.streak > INTERVALS.length) continue;
      records.set(key, { due: value.due, streak: value.streak, again: value.again === true });
    }
  } catch { /* недоступное или повреждённое хранилище: работаем в памяти */ }
  const save = () => {
    try { storage().setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(records))); } catch { /* необязательно */ }
  };
  const eligible = (key) => found.has(key) && entryFor(key)?.kind === 'word';

  function learn(key) {
    if (!eligible(key) || records.has(key)) return;
    // Не спрашиваем слово сразу после того, как игрок прочитал перевод.
    records.set(key, { due: now() + 2 * MINUTE, streak: 0, again: false });
    save();
  }
  function pick() {
    const time = now();
    const due = [...found].filter((key) => eligible(key) && (records.get(key)?.due || 0) <= time);
    // Ошибки важнее старых ещё не проверенных находок. Пропуск не меняет расписание.
    due.sort((a, b) => Number(records.get(b)?.again || false) - Number(records.get(a)?.again || false) ||
      (records.get(a)?.due || 0) - (records.get(b)?.due || 0));
    return due[0] || null;
  }
  function rate(key, remembered) {
    if (!eligible(key)) return null;
    const streak = records.get(key)?.streak || 0;
    const delay = remembered ? INTERVALS[Math.min(streak, INTERVALS.length - 1)] : MINUTE;
    records.set(key, { due: now() + delay, streak: remembered ? Math.min(streak + 1, INTERVALS.length) : 0, again: !remembered });
    save();
    return delay;
  }
  return { learn, pick, rate };
}
