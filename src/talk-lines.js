// Короткие разговоры с прохожими (talk.js). Уровень A1: каждая реплика прохожего — на французском
// с переводом, ответ выбираешь из трёх; подходит один, остальные смешные или не к месту.
// npc: [французский, русский] или null, если разговор начинает героиня; у заказов реплика может зависеть
//   от выбора героини: { by: [шаги], lines: { 'выбор-выбор': [fr, ru] } }.
// choices: первый вариант — правильный (на экране варианты перемешиваются); ok: N — подходят первые N,
//   а третий элемент варианта — что именно выбрали (café, чай…), от этого зависят следующие реплики.
// place: где начинается разговор — по умолчанию с прохожим на улице, 'cafe' — с официантом (cafe.js),
//   'bakery' — с продавцом булочной. serve: на этом шаге заказ появляется на столике.
// Голос: assets/voice/talk/<id>-n<шаг>-f|m.mp3 (прохожие), <id>-p<шаг>-<вариант>.mp3 (героиня),
// собирает scripts/build-talk-voice.py. Удачные ответы героини попадают в блокнот как «talk:<id>:<шаг>».
export const talks = {
  chemin: {
    title: 'Спросить дорогу',
    steps: [
      { npc: ['Bonsoir ! Je peux vous aider ?', 'Добрый вечер! Вам помочь?'],
        choices: [['Oui, merci ! Où est le Sacré-Cœur ?', 'Да, спасибо! Где Сакре-Кёр?'],
          ['Non, je suis une baguette.', 'Нет, я багет.'], ['Bon appétit !', 'Приятного аппетита!']] },
      { npc: ['C’est en haut de la colline. Montez l’escalier, tout droit.', 'Наверху холма. Поднимитесь по лестнице, прямо.'],
        choices: [['C’est loin ?', 'Это далеко?'], ['J’ai vingt ans.', 'Мне двадцать лет.'], ['Il est minuit.', 'Сейчас полночь.']] },
      { npc: ['Non, cinq minutes à pied.', 'Нет, пять минут пешком.'],
        choices: [['Merci beaucoup, bonne soirée !', 'Большое спасибо, хорошего вечера!'],
          ['Je voudrais un croissant.', 'Я бы хотела круассан.'], ['Au revoir, la lune !', 'До свидания, луна!']] },
    ],
    end: ['De rien ! Bonne promenade !', 'Не за что! Приятной прогулки!'],
  },
  heure: {
    title: 'Который час?',
    steps: [
      { npc: null,
        choices: [['Excusez-moi, vous avez l’heure ?', 'Простите, не подскажете, который час?'],
          ['Excusez-moi, vous avez un chat ?', 'Простите, у вас есть кот?'], ['Bonne nuit, la lune !', 'Спокойной ночи, луна!']] },
      { npc: ['Oui, il est dix heures et quart.', 'Да, сейчас четверть одиннадцатого.'],
        choices: [['Déjà ? Merci !', 'Уже? Спасибо!'], ['Je m’appelle dix heures.', 'Меня зовут десять часов.'],
          ['Il pleut des chats.', 'Идёт дождь из котов.']] },
    ],
    end: ['Je vous en prie. Bonsoir !', 'Пожалуйста. Добрый вечер!'],
  },
  cafe: {
    title: 'Где кафе?',
    steps: [
      { npc: ['Bonsoir ! Vous cherchez quelque chose ?', 'Добрый вечер! Вы что-то ищете?'],
        choices: [['Oui, je cherche un café ouvert.', 'Да, я ищу открытое кафе.'],
          ['Oui, j’ai trois frères.', 'Да, у меня три брата.'], ['Non, je suis un pigeon.', 'Нет, я голубь.']] },
      { npc: ['Il y a un petit café sur la place du Tertre. Il est ouvert jusqu’à minuit.', 'На площади Тертр есть маленькое кафе. Оно открыто до полуночи.'],
        choices: [['Super ! Le café est bon ?', 'Отлично! Кофе там хороший?'],
          ['Minuit, c’est un nom de chat ?', 'Полночь — это кличка кота?'], ['Je ne bois pas de place.', 'Я не пью площадь.']] },
      { npc: ['Oui, et les croissants sont délicieux !', 'Да, а круассаны восхитительные!'],
        choices: [['Merci pour le conseil !', 'Спасибо за совет!'], ['Je suis un croissant.', 'Я круассан.'],
          ['Il fait chaud en hiver.', 'Зимой жарко.']] },
    ],
    end: ['Avec plaisir. Bonne soirée !', 'С удовольствием. Хорошего вечера!'],
  },
  rencontre: {
    title: 'Знакомство',
    steps: [
      { npc: ['Salut ! Tu n’es pas d’ici, non ?', 'Привет! Ты ведь не местная?'],
        choices: [['Non, je suis étrangère. Je visite Paris.', 'Нет, я иностранка. Я приехала посмотреть Париж.'],
          ['Oui, je suis la tour Eiffel.', 'Да, я Эйфелева башня.'], ['Non merci, je n’ai pas faim.', 'Нет, спасибо, я не голодна.']] },
      { npc: ['Bienvenue à Montmartre ! Moi, c’est Camille.', 'Добро пожаловать на Монмартр! Я Камий.'],
        choices: [['Enchantée, Camille !', 'Очень приятно, Камий!'], ['J’ai dix-neuf euros.', 'У меня девятнадцать евро.'],
          ['Il est huit heures.', 'Сейчас восемь часов.']] },
      { npc: ['Profite bien de Paris !', 'Хорошо тебе провести время в Париже!'],
        choices: [['Merci, à bientôt !', 'Спасибо, до встречи!'], ['Bon anniversaire !', 'С днём рождения!'],
          ['Je n’aime pas Paris.', 'Я не люблю Париж.']] },
    ],
    end: ['Salut !', 'Пока!'],
  },
  lune: {
    title: 'Прекрасный вечер',
    steps: [
      { npc: ['Quelle belle soirée, n’est-ce pas ?', 'Какой чудесный вечер, правда?'],
        choices: [['Oui, c’est magnifique ! J’adore Paris la nuit.', 'Да, великолепно! Обожаю Париж ночью.'],
          ['Non, c’est une baguette.', 'Нет, это багет.'], ['Oui, j’ai froid aux dents.', 'Да, у меня мёрзнут зубы.']] },
      { npc: ['Vous avez vu la lune ? Elle est énorme ce soir.', 'Вы видели луну? Сегодня она огромная.'],
        choices: [['Oui, elle est très belle au-dessus des toits.', 'Да, она очень красивая над крышами.'],
          ['Non, je n’aime pas le fromage.', 'Нет, я не люблю сыр.'], ['La lune est dans mon sac.', 'Луна у меня в сумке.']] },
    ],
    end: ['Bonne nuit, et profitez bien !', 'Спокойной ночи, и наслаждайтесь!'],
  },
  pluie: {
    title: 'Под дождём',
    rain: true,
    steps: [
      { npc: ['Quel temps ! Vous n’avez pas de parapluie ?', 'Ну и погода! У вас нет зонта?'],
        choices: [['Non, je l’ai oublié à l’hôtel.', 'Нет, я забыла его в отеле.'],
          ['Oui, je suis un parapluie.', 'Да, я зонт.'], ['Il fait très beau aujourd’hui.', 'Сегодня отличная погода.']] },
      { npc: ['Attention, les pavés sont glissants !', 'Осторожно, брусчатка скользкая!'],
        choices: [['Merci, je fais attention !', 'Спасибо, я осторожно!'], ['Les pavés sont délicieux.', 'Брусчатка очень вкусная.'],
          ['J’habite dans la pluie.', 'Я живу в дожде.']] },
    ],
    end: ['Bonne soirée, et rentrez vite !', 'Хорошего вечера, и скорее домой!'],
  },
  commande: {
    title: 'Заказ в кафе',
    place: 'cafe',
    steps: [
      { npc: ['Bonsoir, mademoiselle ! Vous êtes combien ?', 'Добрый вечер! Сколько вас?'],
        choices: [['Je suis seule. En terrasse, s’il vous plaît.', 'Я одна. На террасе, пожалуйста.'],
          ['Je suis trois croissants.', 'Я три круассана.'], ['Merci, au revoir !', 'Спасибо, до свидания!']] },
      { npc: ['Installez-vous. Qu’est-ce que je vous sers ?', 'Присаживайтесь. Что вам принести?'],
        ok: 3,
        choices: [['Un café, s’il vous plaît.', 'Кофе, пожалуйста.', 'cafe'],
          ['Un chocolat chaud, s’il vous plaît.', 'Горячий шоколад, пожалуйста.', 'choco'],
          ['Un thé, s’il vous plaît.', 'Чай, пожалуйста.', 'the'],
          ['Une chaise avec du sucre, s’il vous plaît.', 'Стул с сахаром, пожалуйста.']] },
      { npc: ['Très bien. Et avec ceci ?', 'Хорошо. Что-нибудь ещё?'],
        ok: 2,
        choices: [['Un croissant, s’il vous plaît.', 'Круассан, пожалуйста.', 'croissant'],
          ['Non merci, c’est tout.', 'Нет, спасибо, это всё.', 'rien'],
          ['Oui, j’ai vingt-trois ans.', 'Да, мне двадцать три года.']] },
      { npc: { by: [1], lines: {
        cafe: ['Et voilà votre café !', 'А вот и ваш кофе!'],
        choco: ['Et voilà votre chocolat chaud !', 'А вот и ваш горячий шоколад!'],
        the: ['Et voilà votre thé !', 'А вот и ваш чай!'] } },
        serve: true,
        choices: [['Merci beaucoup ! L’addition, s’il vous plaît.', 'Большое спасибо! Счёт, пожалуйста.'],
          ['L’addition, c’est moi.', 'Счёт — это я.'], ['Bonjour, je m’appelle Café.', 'Здравствуйте, меня зовут Кофе.']] },
      { npc: { by: [1, 2], lines: {
        'cafe-rien': ['Ça fait deux euros cinquante.', 'С вас два евро пятьдесят.'],
        'cafe-croissant': ['Ça fait quatre euros.', 'С вас четыре евро.'],
        'choco-rien': ['Ça fait quatre euros.', 'С вас четыре евро.'],
        'choco-croissant': ['Ça fait cinq euros cinquante.', 'С вас пять евро пятьдесят.'],
        'the-rien': ['Ça fait trois euros.', 'С вас три евро.'],
        'the-croissant': ['Ça fait quatre euros cinquante.', 'С вас четыре евро пятьдесят.'] } },
        choices: [['Voilà. Gardez la monnaie !', 'Вот, пожалуйста. Сдачи не надо!'],
          ['Ça fait mal ?', 'Это больно?'], ['Je paie avec une chanson.', 'Я заплачу песней.']] },
    ],
    end: ['Merci, mademoiselle ! Bonne soirée !', 'Спасибо! Хорошего вечера!'],
  },
  boulangerie: {
    title: 'В булочной',
    place: 'bakery',
    steps: [
      { npc: ['Bonsoir ! Qu’est-ce qu’il vous faut ?', 'Добрый вечер! Что вам нужно?'],
        ok: 3,
        choices: [['Une baguette, s’il vous plaît.', 'Багет, пожалуйста.', 'baguette'],
          ['Deux croissants, s’il vous plaît.', 'Два круассана, пожалуйста.', 'croissants'],
          ['Un pain au chocolat, s’il vous plaît.', 'Пен-о-шоколя (булочку с шоколадом), пожалуйста.', 'painchoc'],
          ['Un pigeon bien cuit, s’il vous plaît.', 'Хорошо прожаренного голубя, пожалуйста.']] },
      { npc: { by: [0], lines: {
        baguette: ['Une baguette, voilà. Ça fait un euro trente.', 'Вот ваш багет. С вас один евро тридцать.'],
        croissants: ['Deux croissants, voilà. Ça fait deux euros quarante.', 'Вот два круассана. С вас два евро сорок.'],
        painchoc: ['Un pain au chocolat, voilà. Ça fait un euro quatre-vingts.', 'Вот пен-о-шоколя. С вас один евро восемьдесят.'] } },
        serve: true,
        choices: [['Voilà. Je peux payer par carte ?', 'Вот. Можно заплатить картой?'],
          ['Ça fait mal ?', 'Это больно?'], ['Je paie en chansons.', 'Я плачу песнями.']] },
      { npc: ['Bien sûr ! Et voilà votre ticket.', 'Конечно! А вот ваш чек.'],
        choices: [['Merci, bonne soirée !', 'Спасибо, хорошего вечера!'],
          ['Je mange le ticket.', 'Я съем чек.'], ['Bon appétit, le ticket !', 'Приятного аппетита, чек!']] },
    ],
    end: ['Merci à vous, à demain !', 'Спасибо вам, до завтра!'],
  },
};

// Что прохожий говорит на неподходящий ответ (голос: talk/huh-<n>-f|m.mp3)
export const puzzled = [
  ['Pardon ? Je ne comprends pas.', 'Простите? Я не понимаю.'],
  ['Euh… comment ?', 'Э-э… что-что?'],
  ['Hein ? Vous êtes sûre ?', 'А? Вы уверены?'],
];
