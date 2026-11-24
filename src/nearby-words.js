export const nearbyWords = {
  bakery: ['une boulangerie', '', '', 'пекарня', 'Je voudrais une baguette, s’il vous plaît.', 'Мне, пожалуйста, багет.'],
  cafe: ['un café', '', '', 'кафе', 'Un café, s’il vous plaît.', 'Один кофе, пожалуйста.'],
  restaurant: ['un restaurant', '', '', 'ресторан', 'L’addition, s’il vous plaît.', 'Счёт, пожалуйста.'],
  bar: ['un bar', '', '', 'бар', 'Je voudrais un verre d’eau.', 'Я хотел(а) бы стакан воды.'],
  pub: ['un pub', '', '', 'паб', 'Vous avez une table libre ?', 'У вас есть свободный столик?'],
};

export function createNearbyWords(points, inspector, minimap) {
  const button = document.getElementById('nearby-word');
  const term = button.querySelector('[lang="fr"]');
  const card = document.getElementById('word-card');
  const notebook = document.getElementById('notebook');
  const locations = points.filter(({ k }) => Object.hasOwn(nearbyWords, k));
  let nearby = null;

  function unavailable() {
    return minimap.bigOpen || !card.hidden || !notebook.hidden;
  }

  function open() {
    if (!nearby || button.hidden || unavailable()) return;
    inspector.show(`nearby:${nearby.k}`);
  }

  button.addEventListener('click', open);
  addEventListener('keydown', (event) => {
    if (event.code === 'KeyE' && !event.repeat && !event.ctrlKey && !event.altKey && !event.metaKey) open();
  });

  return function update(x, z) {
    let closest = null;
    let best = 14 ** 2;
    for (const point of locations) {
      const distance = (x - point.x) ** 2 + (z - point.z) ** 2;
      if (distance >= best) continue;
      best = distance;
      closest = point;
    }
    button.hidden = !closest || unavailable();
    if (closest === nearby) return;
    nearby = closest;
    if (closest) term.textContent = nearbyWords[closest.k][0];
  };
}
