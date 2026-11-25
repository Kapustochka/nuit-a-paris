// city.js — which city this page shows. Everything city-specific (map, start, landmark, heroine) lives here,
// the engine stays the same. Paris is the default; London opens at /london/ or with ?city=london.
const query = typeof location === 'undefined' ? null : new URLSearchParams(location.search).get('city');
const wanted = (globalThis.NUIT_CITY || query || 'paris').toLowerCase();

export const CITIES = {
  paris: {
    id: 'paris',
    center: { lat: 48.88655, lon: 2.34065 },              // площадь Тертр
    bbox: [48.8848, 2.3368, 48.8884, 2.3442],             // юг, запад, север, восток
    map: 'assets/montmartre.json',
    cacheKey: 'nuit-a-paris:montmartre:v2',
    terrain: 'assets/terrain.json',
    landmark: { lat: 48.88672, lon: 2.34306 },            // Сакре-Кёр
    maxHeight: 22,
    heroine: null,                                        // героиня Mixamo из assets/mixamo/
    ui: 'ru', learn: 'fr',
    title: 'Nuit à Paris', mapName: 'Montmartre',
    loading: 'Chargement de la carte de Montmartre…',
  },
  london: {
    id: 'london',
    center: { lat: 51.50070, lon: -0.12600 },             // Parliament Square
    bbox: [51.4993, -0.1290, 51.5021, -0.1222],
    map: 'assets/london/map.json',                        // scripts/build-overture-map.py london
    cacheKey: 'night-in-london:westminster:v1',
    terrain: null,                                        // Вестминстер ровный
    landmark: { lat: 51.50073, lon: -0.12463 },           // Elizabeth Tower (Big Ben)
    maxHeight: 100,
    heroine: 'assets/london/heroine.glb',
    ui: 'uk', learn: 'en',                                // интерфейс по-украински, учим английский
    palette: {                                            // ночь у Темзы: сине-бирюзовая, туманнее Парижа
      uKeyCol: [0.46, 0.56, 0.74], uShadeCol: [0.12, 0.18, 0.32], uSkyCol: [0.28, 0.4, 0.6], uFogCol: [0.16, 0.22, 0.32],
      fogDensity: 0.0095,
      uZenith: 0x081a30, uMidSky: 0x163a5c, uHorizon: 0x7a6a72, uCloudColor: 0x4e6a8e,
    },
    title: 'Night in London', mapName: 'Westminster',
    loading: 'Loading the map of Westminster…',
  },
};

export const CITY = CITIES[wanted] || CITIES.paris;
export const isParis = CITY.id === 'paris';
