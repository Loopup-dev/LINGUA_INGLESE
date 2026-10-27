// Shadowing: riconoscimento vocale del browser (Web Speech API).
const Riconoscimento = window.SpeechRecognition || window.webkitSpeechRecognition;

export const voceSupportata = !!Riconoscimento;

export function ascolta(lingua = 'en-US') {
  return new Promise((ok, ko) => {
    if (!Riconoscimento) { ko(new Error('Il riconoscimento vocale funziona solo in Chrome o Edge.')); return; }
    const r = new Riconoscimento();
    r.lang = lingua;
    r.interimResults = false;
    r.maxAlternatives = 1;
    r.continuous = false;
    let testo = '';
    r.onresult = e => { testo = Array.from(e.results).map(x => x[0].transcript).join(' '); };
    r.onerror = e => {
      const msg = {
        'not-allowed': 'Il browser non ha il permesso di usare il microfono.',
        'no-speech': 'Non ho sentito niente: riprova parlando vicino al microfono.',
        network: 'Il riconoscimento vocale ha bisogno della connessione.',
        'audio-capture': 'Nessun microfono trovato.',
      }[e.error] || 'Il riconoscimento vocale si è interrotto.';
      ko(new Error(msg));
    };
    r.onend = () => ok(testo);
    r.start();
    ascolta.ferma = () => r.stop();
  });
}
