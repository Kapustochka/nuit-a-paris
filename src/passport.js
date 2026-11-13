// passport.js — «Паспорт Монмартра»: десять настоящих мест, до которых стоит дойти.
// Место находится по данным OSM (название улицы, площади или кафе). Когда героиня подходит
// близко, сверху появляется бумажная карточка со штампом: название, простая фраза о месте
// по-французски с переводом и голосом (assets/voice/place/, scripts/build-place-voice.py).
// Место попадает в блокнот («place:<id>»), а на большой карте (M) найденные отмечены штампом,
// ненайденные — знаком «?». Прогресс хранится в браузере.

// [id, как искать в OSM, название, по-русски, фраза, перевод]
export const PLACES = [
  ['sacre', 'road:Parvis du Sacré-Cœur', 'Le Sacré-Cœur', 'Базилика Сакре-Кёр', 'La basilique est toute blanche, même la nuit.', 'Базилика совсем белая, даже ночью.'],
  ['tertre', 'road:Place du Tertre', 'La place du Tertre', 'Площадь Тертр', 'Ici, les peintres travaillent dehors.', 'Здесь художники работают под открытым небом.'],
  ['maisonRose', 'poi:La Maison Rose', 'La Maison Rose', 'Розовый дом', 'C’est une petite maison rose au coin de la rue.', 'Это маленький розовый дом на углу улицы.'],
  ['galette', 'poi:Moulin de la Galette', 'Le Moulin de la Galette', 'Мельница Галетт', 'Autrefois, il y avait des moulins sur la colline.', 'Когда-то на холме стояли мельницы.'],
  ['foyatier', 'road:Rue Foyatier', 'La rue Foyatier', 'Улица Фуайатье', 'Cette rue, c’est un grand escalier !', 'Эта улица — одна большая лестница!'],
  ['cortot', 'road:Rue Cortot', 'La rue Cortot', 'Улица Корто', 'Renoir a peint dans un jardin de cette rue.', 'Ренуар писал картины в саду на этой улице.'],
  ['bateau', 'road:Place Émile Goudeau', 'Le Bateau-Lavoir', 'Бато-Лавуар', 'Picasso a habité et peint ici.', 'Здесь жил и рисовал Пикассо.'],
  ['muraille', 'road:Place Marcel Aymé', 'Le Passe-Muraille', 'Проходящий сквозь стены', 'Un homme sort du mur : c’est une statue !', 'Из стены выходит человек: это статуя!'],
  ['abreuvoir', 'road:Rue de l\'Abreuvoir', 'La rue de l’Abreuvoir', 'Улица Абрёвуар', 'C’est une des plus jolies rues de Paris.', 'Это одна из самых красивых улиц Парижа.'],
  ['consulat', 'poi:Le Consulat', 'Le Consulat', 'Кафе «Консулат»', 'Les artistes venaient boire un café ici.', 'Художники приходили сюда выпить кофе.'],
];
const KEY = 'nuit-a-paris:places:v1';

// Точка места на карте: кафе — его координаты, улица — середина самого длинного её отрезка
export function locate(data, how) {
  const [kind, name] = [how.slice(0, how.indexOf(':')), how.slice(how.indexOf(':') + 1)];
  if (kind === 'poi') {
    const p = data.pois.find((q) => q.n === name);
    return p ? { x: p.x, z: p.z, r: 11 } : null;
  }
  const ways = data.roads.filter((r) => r.n === name);
  if (!ways.length) return null;
  const way = ways.reduce((a, w) => (w.p.length > a.p.length ? w : a));
  let len = 0;
  for (let i = 0; i + 3 < way.p.length; i += 2) len += Math.hypot(way.p[i + 2] - way.p[i], way.p[i + 3] - way.p[i + 1]);
  let t = len / 2;
  for (let i = 0; i + 3 < way.p.length; i += 2) {
    const d = Math.hypot(way.p[i + 2] - way.p[i], way.p[i + 3] - way.p[i + 1]);
    if (t <= d) { const k = t / (d || 1); return { x: way.p[i] + (way.p[i + 2] - way.p[i]) * k, z: way.p[i + 1] + (way.p[i + 3] - way.p[i + 1]) * k, r: Math.min(16, 8 + len / 6) }; }
    t -= d;
  }
  return { x: way.p[0], z: way.p[1], r: 12 };
}

export function createPassport(data, { audio, lesson, minimap, player }) {
  const places = PLACES.map(([id, how, name, ru, fr, frRu]) => ({ id, name, ru, fr, frRu, at: locate(data, how) })).filter((p) => p.at);
  let found = new Set();
  try { found = new Set(JSON.parse(localStorage.getItem(KEY) || '[]')); } catch { /* в памяти */ }

  const card = document.createElement('aside');
  card.id = 'stamp-card'; card.lang = 'ru'; card.hidden = true;
  card.innerHTML = `<button type="button" class="stamp-close" aria-label="Закрыть">×</button>
    <div class="stamp" aria-hidden="true"><span>Montmartre</span><b></b></div>
    <p class="stamp-badge">Паспорт Монмартра · новое место</p>
    <h2 lang="fr"></h2><p class="stamp-ru"></p>
    <p class="stamp-fr" lang="fr"><button type="button" class="stamp-say" aria-label="Слушать">▶</button><span></span></p>
    <p class="stamp-tr"></p>`;
  document.body.append(card);
  const [h2, ru, frLine, tr, num] = ['h2', '.stamp-ru', '.stamp-fr span', '.stamp-tr', '.stamp b'].map((s) => card.querySelector(s));
  let timer = 0, shown = null;
  const hide = () => { card.hidden = true; card.classList.remove('show'); };
  card.querySelector('.stamp-close').addEventListener('click', hide);
  card.querySelector('.stamp-say').addEventListener('click', () => shown && audio.play(`place/${shown.id}`, shown.fr));

  function show(place) {
    shown = place;
    h2.textContent = place.name; ru.textContent = place.ru; frLine.textContent = place.fr; tr.textContent = place.frRu;
    num.textContent = `${found.size}/${places.length}`;
    card.hidden = false;
    card.classList.remove('show'); void card.offsetWidth; card.classList.add('show');
    clearTimeout(timer); timer = setTimeout(hide, 11000);
    setTimeout(() => audio.play(`place/${place.id}`, place.fr), 700);
  }

  const markers = () => places.map((p) => ({ x: p.at.x, z: p.at.z, found: found.has(p.id), name: p.name }));
  minimap.setPlaces?.(markers(), `${found.size}/${places.length}`);

  let tick = 0;
  return {
    places,
    get found() { return found.size; },
    update(dt) {
      tick -= dt;
      if (tick > 0) return;
      tick = 0.5;
      for (const p of places) {
        if (found.has(p.id) || Math.hypot(player.x - p.at.x, player.z - p.at.z) > p.at.r) continue;
        found.add(p.id);
        try { localStorage.setItem(KEY, JSON.stringify([...found])); } catch { /* не страшно */ }
        lesson.inspect(`place:${p.id}`);
        minimap.setPlaces?.(markers(), `${found.size}/${places.length}`);
        show(p);
        break;
      }
    },
  };
}
