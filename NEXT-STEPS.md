# Nuit à Paris · the next walk

Finish the route from Place du Tertre to the bakery entrance. Three layers should read clearly along it: cobblestones and objects next to the heroine, shop windows and warm light at eye level, and roofs and haze above the street. Check the route from the camera's height on a PC and in a portrait phone window.

The notebook of discovered words is done. The first bakery quest (hear an order, pick the baguette) was removed on 2026-11-12 because it felt random. New quests still need to be designed.

## What to look for in Meshy

| Priority | Model | Search phrase | Words for the scene |
| --- | --- | --- | --- |
| 1 | A separate Parisian door and a window with a balcony railing | `Parisian wooden door stone frame`, `Haussmann window wrought iron balcony` | *la porte*, *la poignée*, *la fenêtre*, *le balcon* |
| 2 | Bakery facade with a shop window and an awning | `Montmartre boulangerie storefront warm light` | *la boulangerie*, *la vitrine*, *l’enseigne*, *le store* |
| 3 | Baguette and basket as separate objects (the croissant is done) | `French baguette`, `wicker bread basket` | *la baguette*, *le panier* |
| 4 | Espresso cup and saucer for the café tables (chairs and marble tables are done) | `Paris café espresso cup saucer` | *la tasse*, *la soucoupe* |
| 5 | Geranium window planter (bicycles, bins and flower pots are done) | `Paris geranium window planter` | *la jardinière*, *le géranium* |
| 6 | Stone stairway with railings | `Montmartre stone stairway iron railing modular` | *l’escalier*, *la marche*, *la rampe* |

Models with clear silhouettes and matte surfaces work best for this scene. If the door, frame, handle and glass are separate meshes, each one can get its own word. Download models as GLB with textures. After importing, check the size in metres, the position on the ground and how the model looks under night lighting.

When adding an object, record in `src/french-words.js` the word with its article, IPA, approximate pronunciation, Russian translation, a French phrase and its translation. The card key is assigned to the mesh through `userData.word`. For details on the baked facades, the mapping lives in `src/facade-words.js`.
