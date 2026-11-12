# Nuit à Paris

A 3D game for learning French: night-time Paris in an anime style, built with Three.js.

**Play online:** https://kapustochka.github.io/nuit-a-paris/

**Pull request previews:** every open PR is published at `https://kapustochka.github.io/nuit-a-paris/previews/pr-<number>/` (list: https://kapustochka.github.io/nuit-a-paris/previews/). The site is rebuilt on every push to main and every PR update.

## Running locally
Double-click `start.bat` (Windows) — a browser opens at http://localhost:8080.
(Opening `index.html` directly does not work: browsers block loading 3D models from disk.)

On macOS, run `python3 -m http.server 8080 --bind 127.0.0.1` in the game folder and open http://127.0.0.1:8080.

From a phone on the same Wi-Fi network, open `http://<computer IP>:8080` (the IP is shown in the `start.bat` window).
Windows may ask about the firewall — allow access on private networks.

## Controls
- Computer: WASD / arrow keys — walk, Shift — run, Space — jump, F — punch, M — big map, mouse — camera, wheel — zoom.
- Phone: left half of the screen — joystick (push to the edge to run), right half — camera, two fingers — zoom.
- Double-click (or double-tap) an object to open a word card with pronunciation, translation and an example. The word is saved to the notebook in this browser. Close the card with × or Escape.
- About every ten steps a glowing star falls in front of the heroine. Double-click it to get a random French word, phrase, short story or fun fact with a Russian translation and voice-over. The next star falls only after the current one is opened, or once it has dropped out of view.
- Occasionally (at most every fourth star), a star asks you to recall a word from your notebook. Think of its translation, choose **Показать ответ**, then **Вспомнил** or **Пока забыл**. The answer plays aloud. New words wait two minutes before becoming eligible; forgotten words can return after one minute, while successful reviews spread from ten minutes to several days. The notebook and review progress stay in this browser. Closing a card does not count as a successful review. Songs, stories and phrases keep their normal stars.
- **Звук города: вкл / выкл** controls quiet wind, footsteps, nearby café glasses and a distant synthesized accordion-style waltz at Place du Tertre. Sound starts after the first interaction, fades with distance, and becomes quieter during French speech or a song. Hidden tabs are silent. The setting is saved; the word-card pronunciation buttons work independently.

The plan for the next walk and the list of models to look for in Meshy are in [NEXT-STEPS.md](NEXT-STEPS.md).

## Tuning the heroine
Open `http://localhost:8080/?debug` to get sliders for the arms, legs and walking pace.
Copy the values you like into `TUNING` in `src/heroine.js`.
The “Ночное небо” (Night sky) section controls cloud density, star brightness and distant haze.

The heroine has a separate fine silhouette (configured in CSS pixels) and a slightly more neutral fill light. Her original textures render without the world's brush filter or paper grain. Add `?original-hero` for the previous treatment in the same scene; the debugging panel also exposes **контур героини** separately from the world's line width. `tests/hero-outline.html` checks the marker, thinner edges at multiple DPR/render scales and unchanged world pixels.

## Files
- `assets/mixamo/` — the heroine: Mixamo rig (`base.fbx`), animations (idle, walk, run, walk back, jump, punch) and her textures from the original Meshy model
- `src/heroine.js` — loading the heroine, animations, arm/leg adjustments
- `src/world.js` — Montmartre from OpenStreetMap: buildings, street lamps, trees, Sacré-Cœur
- `src/paint/` — the painted-anime look of the whole game (from the `experiments/painted-street.html` prototype):
  - `paint.js` — painterly light: two tones with a brushy edge, violet shadows, lamp light from the night light map, haze, wet cobbles; also repaints any ready-made material (Meshy models, the heroine)
  - `facades.js` — houses on the real OSM footprints: window niches, shutters, balconies, shopfronts with awnings and signs, mansards with dormers and chimneys, stepped on the slope; detailed blocks are built around the heroine as she walks
  - `post.js` — brush strokes (Kuwahara filter), wobbly ink outlines and paper grain over the frame; `?plain` turns it off
  - `builder.js`, `props.js` — geometry helpers, foliage, railings, signs, the painted Sacré-Cœur
- `src/night-sky.js` — procedural night sky
- `src/night-light.js` — one light map for the whole city: lamp light pools, sidewalks and shade at the foot of walls
- `src/terrain.js`, `assets/terrain.json` — the real slopes of the Montmartre hill (4 m height grid), built by `scripts/build-terrain.py`
- `src/stairs.js` — stone stairs with iron railings on every `highway=steps` street from OpenStreetMap (Rue Foyatier and others), fitted to the slope
- `src/viewpoint.js` — the balustrade and telescopes in front of Sacré-Cœur, city lights at the foot of the hill and the mist above them
- `assets/street/` — lightweight in-game copies of Meshy street models
- `assets/people/` — the two walking passers-by (`sporty-walking.glb` near Place du Tertre, `athletic-walk-in-circle.glb` on the terrace in front of Sacré-Cœur), driven by `src/passerby.js`; they may become alternative heroines later
- `assets/voice/` — French voice-over for word cards, [voice source and build](assets/voice/README.md)
- `src/falling-star.js` — the falling star; its color tells what is inside: yellow for a word, green for a phrase, blue for a story, rare violet for a song. The dictionary lives in `src/star-words.js`, the songs in `src/star-songs.js` (traditional French nursery songs, public domain, played as a music box). Voice clips are in `assets/voice/star/`. Add `?star=song` (or `word`, `phrase`, `story`) to the URL to make only that kind of star fall.
- `src/street-props.js` — loading and placing street models
- `src/street-life.js` — the kiosk, bins, bicycles, scooters, flower pots, cats, rats and newspapers along the streets, plus the café terrace chairs
- `scripts/optimize-meshy.mjs` — turns a heavy Meshy GLB into a light in-game copy (simplified mesh, WebP textures, meshopt compression); the settings used for each model are listed at the top of the file
- `src/minimap.js` — minimap and the big map (M)
- `src/controls.js` — keyboard, joystick, camera
- `src/main.js` — game loop
- `src/word-review.js` — notebook-word review scheduling; run `node --test tests/word-review.test.mjs` to check it
- `src/city-audio.js` — bounded Web Audio synthesis for the city (no downloaded recordings or added 3D geometry)

For review debugging, `?star=review` uses any due notebook word when available (an empty notebook falls back to normal stars). The existing `?star=word|phrase|story|song` modes keep their original kinds without review interruptions.

Map data © OpenStreetMap contributors (ODbL). Elevation: AWS Terrain Tiles (Mapzen terrarium; includes SRTM and other public sources).
