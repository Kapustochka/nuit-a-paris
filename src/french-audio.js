import { starSongs } from './star-songs.js';

// Музыкальная шкатулка для песенок со звёзд: мягкие колокольчики через Web Audio, без файлов
const FREQ = { C: -9, D: -7, E: -5, F: -4, G: -2, A: 0, B: 2 };
const toHz = (note) => {
  const [, letter, sharp, octave] = note.match(/^([A-G])(#?)(\d)$/);
  return 440 * 2 ** ((FREQ[letter] + (sharp ? 1 : 0) + (Number(octave) - 4) * 12) / 12);
};
function createMusicBox() {
  let ctx = null, nodes = [], timers = [], master = null;
  function stop() {
    for (const n of nodes) { try { n.stop(); } catch { /* уже остановлен */ } }
    for (const t of timers) clearTimeout(t);
    master?.disconnect(); master = null;
    nodes = []; timers = [];
    dispatchEvent(new CustomEvent('song-line', { detail: -1 }));
  }
  function play(song, done = () => {}) {
    stop();
    ctx ||= new (window.AudioContext || window.webkitAudioContext)();
    ctx.resume?.();
    const beat = 60 / song.tempo;
    master = ctx.createGain();
    master.gain.value = 0.22; master.connect(ctx.destination);
    let t = ctx.currentTime + 0.08;
    song.lines.forEach(([, , melody], line) => {
      timers.push(setTimeout(() => dispatchEvent(new CustomEvent('song-line', { detail: line })), (t - ctx.currentTime) * 1000));
      for (const step of melody.split(' ')) {
        const [note, beats] = step.split(':'), d = Number(beats) * beat, hz = toHz(note);
        for (const [mult, gain, type] of [[1, 0.9, 'triangle'], [2, 0.25, 'sine'], [3.01, 0.08, 'sine']]) {
          const o = ctx.createOscillator(), g = ctx.createGain();
          o.type = type; o.frequency.value = hz * mult;
          g.gain.setValueAtTime(0, t);
          g.gain.linearRampToValueAtTime(gain, t + 0.012);
          g.gain.exponentialRampToValueAtTime(0.001, t + Math.max(0.5, d * 1.6));
          o.connect(g).connect(master); o.start(t); o.stop(t + Math.max(0.55, d * 1.7));
          o.onended = () => { o.disconnect(); g.disconnect(); };
          nodes.push(o);
        }
        t += d;
      }
      t += beat * 0.5;                                   // вдох между строками
    });
    timers.push(setTimeout(() => { stop(); done(); }, (t - ctx.currentTime + 0.9) * 1000));
  }
  return { play, stop };
}

export function createFrenchAudio({ onActivity = () => {} } = {}) {
  const player = new Audio();
  const box = createMusicBox();
  let revision = 0;

  function stop() {
    revision++;
    player.onended = player.onerror = null;
    player.pause();
    box.stop();
    window.speechSynthesis?.cancel();
    onActivity(false);
  }

  function play(clip, text, report = () => {}) {
    stop();
    const attempt = revision;
    const done = () => { if (attempt === revision) onActivity(false); };
    onActivity(true);
    if (clip.startsWith('song:')) {
      const song = starSongs[Number(clip.slice(5))];
      try {
        if (song) box.play(song, done); else { report('Мелодия недоступна.'); done(); }
      } catch { report('Мелодия недоступна.'); done(); }
      return;
    }
    player.onended = done;
    // Слова с улицы лежат в WAV, находки из звёзд — в сжатом MP3.
    player.src = `assets/voice/${clip}.${clip.startsWith('star/') ? 'mp3' : 'wav'}`;
    let fallingBack = false;
    const fallback = () => {
      if (attempt !== revision) return;
      if (fallingBack) return;
      fallingBack = true;
      const synth = window.speechSynthesis;
      if (!synth || !window.SpeechSynthesisUtterance) { report('Озвучка недоступна.'); done(); return; }
      const voices = synth.getVoices();
      const french = voices.filter(({ lang }) => /^fr(?:[-_]|$)/i.test(lang));
      const preferred = french.find(({ name }) => /audrey|amélie|denise|flo|hortense|marie|sandy|shelley|vivienne/i.test(name));
      if (voices.length && !french.length) { report('Французская озвучка недоступна.'); done(); return; }
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.voice = preferred || french.find(({ lang }) => /^fr[-_]FR$/i.test(lang)) || french[0] || null;
      utterance.lang = utterance.voice?.lang || 'fr-FR';
      utterance.rate = 0.88;
      utterance.onend = done;
      utterance.onerror = ({ error }) => {
        if (attempt === revision && error !== 'canceled' && error !== 'interrupted') report('Озвучка недоступна.');
        done();
      };
      try { synth.speak(utterance); } catch { report('Озвучка недоступна.'); done(); }
    };
    player.onerror = fallback;
    player.play().catch(fallback);
  }
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); });
  return { play, stop };
}
