// Ripasso: sessione breve o full immersion sulle carte in scadenza (FSRS).
import { html, useEffect, useRef, useState } from '../lib.js';
import { dati } from '../dati.js';
import { applicaVoto, inScadenza, ordinaPerRischio, votoProposto, NOMI_VOTO, Rating } from '../ripasso.js';
import { normalizza, paroleVisibili } from '../testo.js';
import { useApp, Icona, fmtTempo } from './comuni.js';
import { Dettato, Buchi, Legenda } from './esercizi.js';
import { useLettore, useCronometro, ultimoVideo } from './studio.js';

function indiciEspressione(testo, espressione) {
  const parole = paroleVisibili(testo).map(p => normalizza(p));
  const ep = paroleVisibili(espressione).map(p => normalizza(p));
  for (let i = 0; i + ep.length <= parole.length; i++) {
    if (ep.every((w, k) => parole[i + k] === w)) return ep.map((_, k) => i + k);
  }
  return null;
}

export function Ripassa({ tipo }) {
  const { imp, notifica, vai } = useApp();
  const [coda, setCoda] = useState(null);
  const [pos, setPos] = useState(0);
  const [esito, setEsito] = useState(null);
  const [avviata, setAvviata] = useState(false);
  const [fatte, setFatte] = useState(0);
  const tocco = useRef(false);
  const secondi = useCronometro(tipo === 'full' ? 'full immersion' : 'ripasso breve');
  const carta = coda?.[pos];
  const { contenitore, lettore, errore } = useLettore(coda?.[0]?.youtube_id || null);

  useEffect(() => {
    dati.carte().then(tutte => {
      let c = ordinaPerRischio(inScadenza(tutte), imp.retention);
      if (tipo === 'breve') c = c.slice(0, imp.breveCarte);
      setCoda(c);
    }).catch(e => notifica(e.message));
  }, []);

  // Cambio carta: il player passa al video giusto. Dopo il primo tocco si parte da soli.
  useEffect(() => {
    if (!carta || !lettore) return;
    setEsito(null);
    setAvviata(false);
    lettore.cambiaVideo(carta.youtube_id, carta.inizio).then(() => { if (tocco.current) setAvviata(true); });
  }, [pos, lettore, coda]);

  // Il tetto di tempo della sessione breve si controlla dopo ogni voto, mai a metà carta.
  const finita = coda && pos >= coda.length;

  const avvia = () => {
    tocco.current = true;
    setAvviata(true);
    lettore.riproduciSegmento(carta.inizio, carta.fine, { prima: imp.margineInizio, dopo: imp.margineFine });
  };

  const vota = async voto => {
    const fsrs = applicaVoto(carta.fsrs, voto, imp.retention);
    try {
      await dati.aggiornaCarta(carta.id, { fsrs });
      await dati.aggiungiRipasso({ carta_id: carta.id, voto, accuratezza: esito.accuratezzaPrimo });
      if (carta.tipo === 'segmento') {
        dati.aggiungiTentativo({ video_id: carta.video_id, segmento_id: carta.segmento_id, modalita: 'ripasso', accuratezza: esito.accuratezzaPrimo, scritto: esito.scritto, errori: esito.errori }).catch(() => {});
      }
    } catch (e) { notifica(e.message); }
    setFatte(f => f + 1);
    if (tipo === 'breve' && secondi >= imp.breveMinuti * 60) { setPos(coda.length); return; }
    setPos(p => p + 1);
  };

  const togli = async () => {
    await dati.aggiornaCarta(carta.id, { sospesa: true }).catch(e => notifica(e.message));
    notifica('Carta tolta dal ripasso.');
    setPos(p => p + 1);
  };

  if (!coda) return html`<p class="tenue centro">Preparo il ripasso…</p>`;

  if (!coda.length || finita) {
    const vuota = !coda.length;
    const ultimo = ultimoVideo();
    return html`<section class="vuoto">
      <h1>${vuota ? 'Niente da ripassare adesso' : 'Sessione finita'}</h1>
      ${!vuota && html`<p>${fatte} ${fatte === 1 ? 'carta' : 'carte'} in ${fmtTempo(secondi)}.</p>`}
      ${tipo === 'full'
        ? html`<a class="bottone primario" href=${ultimo ? `#/studio/${ultimo}` : '#/catalogo'}>Passa al nuovo materiale</a>`
        : html`<a class="bottone primario" href="#/">Torna alla home</a>`}
    </section>`;
  }

  const segmento = { id: carta.segmento_id || carta.id, idx: -1, testo: carta.testo, inizio: carta.inizio, fine: carta.fine };
  const videoFinto = { id: carta.video_id, youtube_id: carta.youtube_id, titolo: '', glossario: [] };
  const buchiEspr = carta.tipo === 'espressione' ? indiciEspressione(carta.testo, carta.espressione) : null;
  const proposto = esito && votoProposto({ accuratezza: esito.accuratezzaPrimo, primoColpo: esito.primoColpo, riascolti: esito.riascolti });
  const sp = carta.spiegazione;
  const blocco = sp?.[imp.linguaSpiegazioni];

  return html`<section class="studio ripasso">
    <div class="colonna-video">
      <div class="video bloccato">
        <div ref=${contenitore} class="riquadro"></div>
        <div class="velo"></div>
      </div>
      ${errore && html`<p class="avviso">${errore} <button class="mini testo" onClick=${() => setPos(p => p + 1)}>Salta questa carta</button></p>`}
      <p class="tenue piccolo">${tipo === 'full' ? 'Full immersion' : 'Sessione breve'} · carta ${pos + 1} di ${coda.length} · ${fmtTempo(secondi)}${tipo === 'breve' ? ` di ${imp.breveMinuti} min` : ''}</p>
      <div class="barra"><div style=${`width:${(pos / coda.length) * 100}%`}></div></div>
    </div>

    <div class="colonna-esercizio">
      <p class="etichetta">${carta.tipo === 'espressione' ? html`Espressione: scrivi quella che manca` : 'Riscrivi la frase'}</p>
      ${!avviata
        ? html`<button class="grande" disabled=${!lettore} onClick=${avvia}><${Icona} n="play" /> ${lettore ? 'Tocca per ascoltare' : 'Carico il player…'}</button>`
        : esito
          ? html`<div class="voto">
              <p>${esito.rivelata ? 'Soluzione rivelata.' : `Primo tentativo: ${Math.round(esito.accuratezzaPrimo * 100)}%.`} Quanto ti è venuta facile?</p>
              <div class="bottoni-voto">
                ${[Rating.Again, Rating.Hard, Rating.Good, Rating.Easy].map(v => html`<button class=${v === proposto ? 'primario' : ''} onClick=${() => vota(v)}>${NOMI_VOTO[v]}</button>`)}
              </div>
              <p class="tenue piccolo">Evidenziato il voto proposto in base all'accuratezza.</p>
            </div>`
          : carta.tipo === 'espressione' && buchiEspr
            ? html`<${Buchi} key=${carta.id} segmento=${segmento} video=${videoFinto} lettore=${lettore} buchiForzati=${buchiEspr} vecchio=${carta}
                avvioAutomatico=${tocco.current && pos > 0} onFatto=${setEsito}
                dopo=${sp && html`<div class="spiegazione">
                  <p class="riga-meta"><span lang="en">${sp.forma_base || carta.espressione}</span> ${sp.registro && html`<span class=${`registro ${sp.registro}`}>${sp.registro}</span>`}</p>
                  <p class="significato">${blocco?.significato}</p></div>`} />`
            : html`<${Dettato} key=${carta.id} segmento=${segmento} video=${videoFinto} lettore=${lettore} vecchio=${carta}
                avvioAutomatico=${tocco.current && pos > 0} onFatto=${setEsito} origine="dettato" />`}
      ${avviata && !esito && html`<${Legenda} ripasso />`}
      <button class="mini testo piccolo" onClick=${togli}>Togli questa carta dal ripasso</button>
    </div>
  </section>`;
}
