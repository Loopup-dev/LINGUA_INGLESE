import { html, useEffect, useState } from '../lib.js';
import { dati, modalitaProva } from '../dati.js';
import { inScadenza } from '../ripasso.js';
import { useApp, fmtTempo } from './comuni.js';
import { ultimoVideo } from './studio.js';

export function Home() {
  const { imp, notifica } = useApp();
  const [stato, setStato] = useState(null);

  useEffect(() => {
    (async () => {
      const [carte, video, sessioni] = await Promise.all([dati.carte(), dati.video(), dati.sessioni()]);
      const scadenza = inScadenza(carte).length;
      const ultimoId = ultimoVideo();
      const ultimo = video.find(v => v.youtube_id === ultimoId) || video[0] || null;
      const oggi = new Date().toDateString();
      const oggiSec = sessioni.filter(s => new Date(s.inizio).toDateString() === oggi).reduce((t, s) => t + s.secondi, 0);
      setStato({ scadenza, totali: carte.filter(c => !c.sospesa).length, ultimo, oggiSec, nVideo: video.length });
    })().catch(e => notifica(e.message));
  }, []);

  if (!stato) return html`<p class="tenue centro">Carico…</p>`;
  const breve = Math.min(stato.scadenza, imp.breveCarte);
  return html`<section class="home">
    ${modalitaProva && html`<p class="nota">Modalità prova: i dati restano in questo browser e Gemini non è collegato. Per sincronizzare PC e telefono segui SETUP.md.</p>`}
    <h1>${stato.scadenza ? `${stato.scadenza} ${stato.scadenza === 1 ? 'carta' : 'carte'} da ripassare` : 'Niente da ripassare adesso'}</h1>
    <p class="tenue">${stato.totali} carte nel ripasso${stato.oggiSec ? ` · oggi hai studiato ${fmtTempo(stato.oggiSec)}` : ''}</p>

    <div class="sessioni">
      <a class=${`sessione ${!stato.scadenza ? 'spenta' : ''}`} href=${stato.scadenza ? '#/ripasso/breve' : null}>
        <strong>Sessione breve</strong>
        <span>${breve ? `${breve} ${breve === 1 ? 'carta' : 'carte'}, massimo ${imp.breveMinuti} minuti` : 'Nessuna carta in scadenza'}</span>
      </a>
      <a class="sessione" href="#/ripasso/full">
        <strong>Full immersion</strong>
        <span>Prima tutte le carte in scadenza, poi materiale nuovo. Nessun limite.</span>
      </a>
      <a class="sessione" href=${stato.ultimo ? `#/studio/${stato.ultimo.youtube_id}` : '#/catalogo'}>
        <strong>Solo materiale nuovo</strong>
        <span>${stato.ultimo ? `Riprendi «${stato.ultimo.titolo}»` : 'Scegli un video dal catalogo'}</span>
      </a>
    </div>

    ${!stato.nVideo && html`<p>Per cominciare scegli un video dal <a href="#/catalogo">catalogo</a> o incolla un link YouTube.</p>`}
  </section>`;
}
