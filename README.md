# Nuit à Paris

A 3D game for learning French: night-time Paris in an anime style, built with Three.js.

**Play online:** https://kapustochka.github.io/nuit-a-paris/

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
- The “Булочная” (Bakery) button opens the map with a gold marker. Walk up to the counter, press “Послушать заказ” (Listen to the order) and double-tap the right pastry.

The plan for the next walk and the list of models to look for in Meshy are in [NEXT-STEPS.md](NEXT-STEPS.md).

## Tuning the heroine
Open `http://localhost:8080/?debug` to get sliders for the arms, legs and walking pace.
Copy the values you like into `TUNING` in `src/heroine.js`.
The “Ночное небо” (Night sky) section controls cloud density, star brightness and distant haze.

## Files
- `assets/mixamo/` — the heroine: Mixamo rig (`base.fbx`), animations (idle, walk, run, walk back, jump, punch) and her textures from the original Meshy model
- `src/heroine.js` — loading the heroine, animations, arm/leg adjustments
- `src/world.js` — Montmartre from OpenStreetMap: buildings, street lamps, trees, Sacré-Cœur
- `assets/city/` — building facades and Sacré-Cœur baked from Meshy models
- `src/night-sky.js` — procedural night sky
- `assets/street/` — lightweight in-game copies of Meshy street models
- `assets/people/` — lightweight copies of passer-by models
- `assets/voice/` — French voice-over for word cards and the bakery order, [voice source and build](assets/voice/README.md)
- `src/street-props.js` — loading and placing street models
- `src/street-life.js` — the kiosk, bins, bicycles, scooters, flower pots, cats, rats and newspapers along the streets, plus the café terrace chairs
- `scripts/optimize-meshy.mjs` — turns a heavy Meshy GLB into a light in-game copy (simplified mesh, WebP textures, meshopt compression); the settings used for each model are listed at the top of the file
- `src/minimap.js` — minimap and the big map (M)
- `src/controls.js` — keyboard, joystick, camera
- `src/main.js` — game loop

Map data © OpenStreetMap contributors (ODbL).
