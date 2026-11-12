# Nuit à Paris · the next walk

Finish the route from Place du Tertre to the bakery entrance. Three layers should read clearly along it: cobblestones and objects next to the heroine, shop windows and warm light at eye level, and roofs and haze above the street. Check the route from the camera's height on a PC and in a portrait phone window.

The next learning step is a notebook of discovered words. After a walk the player sees the words they have already found and can listen to the phrases again. Then add a short task in the bakery where those words are useful in a dialogue. For example, the player hears “Je voudrais une baguette, s’il vous plaît” and picks the baguette in the shop window.

## What to look for in Meshy

| Priority | Model | Search phrase | Words for the scene |
| --- | --- | --- | --- |
| 1 | A separate Parisian door and a window with a balcony railing | `Parisian wooden door stone frame`, `Haussmann window wrought iron balcony` | *la porte*, *la poignée*, *la fenêtre*, *le balcon* |
| 2 | Bakery facade with a shop window and an awning | `Montmartre boulangerie storefront warm light` | *la boulangerie*, *la vitrine*, *l’enseigne*, *le store* |
| 3 | Baguette, croissant and basket as three separate objects | `French baguette`, `butter croissant`, `wicker bread basket` | *la baguette*, *le croissant*, *le panier* |
| 4 | Café terrace set with separate parts | `Paris café bistro chair table espresso cup` | *la chaise*, *la table*, *la tasse*, *la soucoupe* |
| 5 | Geranium pot, bicycle and street litter bin | `Paris geranium window planter`, `vintage city bicycle`, `Paris street litter bin` | *le pot*, *le géranium*, *le vélo*, *la poubelle* |
| 6 | Stone stairway with railings | `Montmartre stone stairway iron railing modular` | *l’escalier*, *la marche*, *la rampe* |

Models with clear silhouettes and matte surfaces work best for this scene. If the door, frame, handle and glass are separate meshes, each one can get its own word. Download models as GLB with textures. After importing, check the size in metres, the position on the ground and how the model looks under night lighting.

When adding an object, record in `src/french-words.js` the word with its article, IPA, approximate pronunciation, Russian translation, a French phrase and its translation. The card key is assigned to the mesh through `userData.word`. For details on the baked facades, the mapping lives in `src/facade-words.js`.
