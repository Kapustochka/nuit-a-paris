export function createFrenchAudio() {
  const player = new Audio();
  let revision = 0;

  function stop() {
    revision++;
    player.pause();
    window.speechSynthesis?.cancel();
  }

  function play(clip, text, report = () => {}) {
    stop();
    const attempt = revision;
    // Слова с улицы лежат в WAV, находки из звёзд — в сжатом MP3.
    player.src = `assets/voice/${clip}.${clip.startsWith('star/') ? 'mp3' : 'wav'}`;
    player.play().catch(() => {
      if (attempt !== revision) return;
      const synth = window.speechSynthesis;
      if (!synth || !window.SpeechSynthesisUtterance) { report('Озвучка недоступна.'); return; }
      const voices = synth.getVoices();
      const french = voices.filter(({ lang }) => /^fr(?:[-_]|$)/i.test(lang));
      const preferred = french.find(({ name }) => /audrey|amélie|denise|flo|hortense|marie|sandy|shelley|vivienne/i.test(name));
      if (voices.length && !french.length) { report('Французская озвучка недоступна.'); return; }
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.voice = preferred || french.find(({ lang }) => /^fr[-_]FR$/i.test(lang)) || french[0] || null;
      utterance.lang = utterance.voice?.lang || 'fr-FR';
      utterance.rate = 0.88;
      utterance.onerror = ({ error }) => {
        if (attempt === revision && error !== 'canceled' && error !== 'interrupted') report('Озвучка недоступна.');
      };
      synth.speak(utterance);
    });
  }
  return { play, stop };
}
