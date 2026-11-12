// Редкие фиолетовые звёзды: куплет одной из самых известных французских детских песенок.
// Слова и мелодии народные (XVIII век и старше) — общественное достояние, лицензия не нужна.
// Строка: [французский текст, перевод, мелодия, слоги]. Мелодия — «нота:доли», 1 доля = четверть;
// нота — буква, октава, # для диеза. Слоги (по одному на ноту, записаны «как слышатся») поёт голос:
// scripts/build-star-songs.py собирает из них assets/voice/star/song-N.mp3 — пение вместе со шкатулкой.
export const starSongs = [
  {
    title: ['Frère Jacques', 'Братец Жак'],
    tempo: 112,
    lines: [
      ['Frère Jacques, frère Jacques,', 'Братец Жак, братец Жак,', 'C4:1 D4:1 E4:1 C4:1 C4:1 D4:1 E4:1 C4:1', 'frè reu ja keu frè reu ja keu'],
      ['Dormez-vous ? Dormez-vous ?', 'Ты всё спишь? Ты всё спишь?', 'E4:1 F4:1 G4:2 E4:1 F4:1 G4:2', 'dor mé vou dor mé vou'],
      ['Sonnez les matines ! Sonnez les matines !', 'Звони к утренней службе! Звони к утренней службе!', 'G4:.5 A4:.5 G4:.5 F4:.5 E4:1 C4:1 G4:.5 A4:.5 G4:.5 F4:.5 E4:1 C4:1', 'so né lé ma ti neu so né lé ma ti neu'],
      ['Ding, daing, dong ! Ding, daing, dong !', 'Динь-дань-дон! Динь-дань-дон!', 'C4:1 G3:1 C4:2 C4:1 G3:1 C4:2', 'dine dain don dine dain don'],
    ],
  },
  {
    title: ['Au clair de la lune', 'При свете луны'],
    tempo: 100,
    lines: [
      ['Au clair de la lune, mon ami Pierrot,', 'При свете луны, мой друг Пьеро,', 'C4:1 C4:1 C4:1 D4:1 E4:2 D4:2 C4:1 E4:1 D4:1 D4:1 C4:4', 'o clèr deu la lu neu mon na mi pié ro'],
      ['Prête-moi ta plume pour écrire un mot.', 'Одолжи мне перо, чтобы написать словечко.', 'C4:1 C4:1 C4:1 D4:1 E4:2 D4:2 C4:1 E4:1 D4:1 D4:1 C4:4', 'prè teu moi ta plu meu pour ré kri run mo'],
      ['Ma chandelle est morte, je n’ai plus de feu.', 'Моя свеча погасла, у меня нет больше огня.', 'D4:1 D4:1 D4:1 D4:1 A3:2 A3:2 D4:1 C4:1 B3:1 A3:1 G3:4', 'ma chan dè lè mor teu jeu nè plu deu feu'],
      ['Ouvre-moi ta porte pour l’amour de Dieu.', 'Открой мне дверь, ради всего святого.', 'C4:1 C4:1 C4:1 D4:1 E4:2 D4:2 C4:1 E4:1 D4:1 D4:1 C4:4', 'ou vreu moi ta por teu pour la mour deu dieu'],
    ],
  },
  {
    title: ['Ah ! vous dirai-je, maman', 'Ах, скажу ли я вам, мама'],
    tempo: 108,
    lines: [
      ['Ah ! vous dirai-je, maman,', 'Ах, скажу ли я вам, мама,', 'C4:1 C4:1 G4:1 G4:1 A4:1 A4:1 G4:2', 'a vou di ré jeu ma man'],
      ['Ce qui cause mon tourment ?', 'Что меня так мучает?', 'F4:1 F4:1 E4:1 E4:1 D4:1 D4:1 C4:2', 'seu ki co zeu mon tour man'],
      ['Papa veut que je raisonne', 'Папа хочет, чтобы я рассуждал', 'G4:1 G4:1 F4:1 F4:1 E4:1 E4:1 D4:2', 'pa pa veu keu jeu ré zonn'],
      ['Comme une grande personne.', 'Как взрослый человек.', 'G4:1 G4:1 F4:1 F4:1 E4:1 E4:1 D4:2', 'kom mu neu gran deu pèr sonn'],
      ['Moi, je dis que les bonbons', 'А я говорю, что конфеты', 'C4:1 C4:1 G4:1 G4:1 A4:1 A4:1 G4:2', 'moi jeu di keu lé bon bon'],
      ['Valent mieux que la raison.', 'Лучше, чем рассудок.', 'F4:1 F4:1 E4:1 E4:1 D4:1 D4:1 C4:2', 'va leu mieu keu la ré zon'],
    ],
  },
  {
    title: ['Alouette', 'Жаворонок'],
    tempo: 120,
    lines: [
      ['Alouette, gentille alouette,', 'Жаворонок, милый жаворонок,', 'C4:1 D4:.5 E4:.5 E4:1 D4:.5 C4:.5 D4:.5 E4:.5 C4:1 G3:2', 'a lou è teu jan ti ya lou è teu'],
      ['Alouette, je te plumerai.', 'Жаворонок, я тебя ощиплю.', 'C4:1 D4:.5 E4:.5 E4:1 D4:.5 C4:.5 D4:.5 E4:.5 C4:2', 'a lou è teu jeu teu plu meu ré'],
      ['Je te plumerai la tête,', 'Я ощиплю тебе головку,', 'G3:.5 G3:.5 G3:.5 G3:.5 G3:.5 G3:.5 C4:.5 C4:1.5', 'jeu teu plu meu ré la tè teu'],
      ['Et la tête, et la tête,', 'И головку, и головку,', 'C4:.5 C4:.5 C4:.5 C4:.5 C4:.5 C4:.5 C4:.5 C4:1.5', 'é la tè teu é la tè teu'],
      ['Alouette, alouette, oh !', 'Жаворонок, жаворонок, о!', 'C4:.5 D4:.5 E4:.5 E4:.5 D4:.5 C4:.5 D4:.5 E4:.5 C4:2', 'a lou è teu a lou è teu o'],
    ],
  },
  {
    title: ['Sur le pont d’Avignon', 'На мосту в Авиньоне'],
    tempo: 116,
    lines: [
      ['Sur le pont d’Avignon,', 'На мосту в Авиньоне', 'C4:.5 C4:.5 C4:1 D4:.5 D4:.5 D4:1', 'sur leu pon da vi gnon'],
      ['L’on y danse, l’on y danse,', 'Там танцуют, там танцуют,', 'E4:.5 F4:.5 G4:1 C4:1 B3:.5 C4:.5 D4:1 G3:1', 'lon ni dan seu lon ni dan seu'],
      ['Sur le pont d’Avignon,', 'На мосту в Авиньоне', 'C4:.5 C4:.5 C4:1 D4:.5 D4:.5 D4:1', 'sur leu pon da vi gnon'],
      ['L’on y danse tout en rond.', 'Там танцуют в хороводе.', 'E4:.5 F4:.5 G4:1 C4:.5 D4:.5 B3:.5 C4:1.5', 'lon ni dan seu tou tan ron'],
    ],
  },
];
