// Schermata di studio: player + dettato / buchi / visione libera.
import { html, useEffect, useRef, useState } from '../lib.js';
import { dati } from '../dati.js';
import { Lettore } from '../player.js';
import { motiviCarta, nuovoStato } from '../ripasso.js';
import { creaGlossario } from '../importa.js';
import { aiDisponibile } from '../ai.js';
import { useApp, Icona, Parole, Pannello, fmtTempo } from './comuni.js';
import { Dettato, Buchi, Legenda } from './esercizi.js';

const MODALITA = [['dettato', 'Dettato'], ['buchi', 'Buchi'], ['visione', 'Visione libera']];

export function memorizzaUltimo(youtubeId) { try { localStorage.setItem('ultimo-video', youtubeId); } catch { /* ignorato */ } }
export function ultimoVideo() { try { return localStorage.getItem('ultimo-video'); } catch { return null; } }

// Tiene il conto del tempo di studio (solo con la pagina in primo piano) e lo salva
// ogni 30 secondi e all'uscita: chiudere o ricaricare la pagina non fa perdere il tempo.
export function useCronometro(tipo) {
  const sessione = useRef({ id: crypto.randomUUID(), tipo, inizio: new Date().toISOString() });
  const [secondi, setSecondi] = useState(0);
  const ultimi = useRef(0);
  ultimi.current = secondi;
  useEffect(() => {
    const salva = () => {
      if (ultimi.current < 20) return;
      try {
        dati.salvaSessione({ ...sessione.current, secondi: Math.min(ultimi.current, 4 * 3600) }).catch(() => {});
      } catch { /* il tempo di studio non deve mai bloccare l'interfaccia */ }
    };
    const t = setInterval(() => {
      if (document.hidden) return;
      setSecondi(s => s + 1);
      if (ultimi.current > 0 && ultimi.current % 30 === 0) salva();
    }, 1000);
    window.addEventListener('pagehide', salva);
    return () => { clearInterval(t); window.removeEventListener('pagehide', salva); salva(); };
  }, []);
  return secondi;
}

// Il riquadro del video: YouTube sostituisce l'elemento, quindi lo si crea fuori da Preact.
export function useLettore(youtubeId) {
  const contenitore = useRef(null);
  const [lettore, setLettore] = useState(null);
  const [errore, setErrore] = useState('');
  useEffect(() => {
    if (!youtubeId || !contenitore.current) return;
    const interno = document.createElement('div');
    contenitore.current.replaceChildren(interno);
    const l = new Lettore(interno, youtubeId, { onStato: (s, msg) => s === 'errore' && setErrore(msg) });
    let vivo = true;
    l.pronto.then(() => vivo && setLettore(l), e => vivo && setErrore(e.message));
    return () => { vivo = false; l.distruggi(); setLettore(null); };
  }, [youtubeId]);
  return { contenitore, lettore, errore };
}

export function Studio({ youtubeId }) {
  const { imp, notifica, vai } = useApp();
  const [video, setVideo] = useState(null);
  const [segmenti, setSegmenti] = useState(null);
  const [idx, setIdx] = useState(0);
  const [modalita, setModalita] = useState(() => { try { return localStorage.getItem('modalita') || 'dettato'; } catch { return 'dettato'; } });
  const [tempiAperti, setTempiAperti] = useState(false);
  const [glossarioInCorso, setGlossarioInCorso] = useState(false);
  const { contenitore, lettore, errore } = useLettore(video ? youtubeId : null);
  const secondi = useCronometro('studio');

  useEffect(() => {
    (async () => {
      const v = await dati.videoDa(youtubeId);
      if (!v) { setVideo(false); return; }
      const s = await dati.segmenti(v.id);
      setVideo(v); setSegmenti(s);
      setIdx(Math.min(v.ultimo_segmento || 0, Math.max(0, s.length - 1)));
      memorizzaUltimo(youtubeId);
    })().catch(e => notifica(e.message));
  }, [youtubeId]);

  const cambiaModalita = m => { setModalita(m); try { localStorage.setItem('modalita', m); } catch { /* ignorato */ } lettore?.pausa(); };

  if (video === false) return html`<section class="vuoto"><p>Questo video non è ancora stato importato.</p><a class="bottone primario" href="#/catalogo">Vai al catalogo</a></section>`;
  if (!video || !segmenti) return html`<p class="tenue centro">Carico il video…</p>`;

  const seg = segmenti[idx];
  const finito = idx >= segmenti.length;

  const vaiA = async n => {
    const i = Math.max(0, Math.min(segmenti.length, n));
    setIdx(i);
    if (i !== video.ultimo_segmento) {
      const v = await dati.aggiornaVideo(video.id, { ultimo_segmento: Math.min(i, segmenti.length) });
      setVideo(v);
    }
  };

  const creaCarta = async (scritto, esito, origine, motivi) => {
    const { nuova } = await dati.aggiungiCarta({
      video_id: video.id, segmento_id: seg.id, youtube_id: video.youtube_id, tipo: 'segmento',
      testo: seg.testo, inizio: seg.inizio + video.sfasamento, fine: seg.fine + video.sfasamento,
      primo_tentativo: scritto || '', errori: esito?.errori || [], origine, fsrs: nuovoStato(),
    });
    if (nuova) notifica(motivi ? `Aggiunta al ripasso (${motivi.join(', ')}).` : 'Frase aggiunta al ripasso.');
    else if (!motivi) notifica('Questa frase è già nel ripasso.');
  };

  const fatto = async esito => {
    if (!esito.saltato) {
      dati.aggiungiTentativo({ video_id: video.id, segmento_id: seg.id, modalita, accuratezza: esito.accuratezzaPrimo, scritto: esito.scritto, errori: esito.errori }).catch(() => {});
      const motivi = motiviCarta(esito, imp.soglie);
      if (motivi.length) await creaCarta(esito.scritto, esito, modalita, motivi).catch(e => notifica(e.message));
    }
    vaiA(idx + 1);
  };

  const sposta = async (campo, delta) => {
    if (campo === 'sfasamento') {
      const v = await dati.aggiornaVideo(video.id, { sfasamento: +((video.sfasamento || 0) + delta).toFixed(2) });
      setVideo(v);
    } else {
      const nuovo = +(seg[campo] + delta).toFixed(2);
      if (campo === 'fine' && nuovo <= seg.inizio + 0.2) return;
      if (campo === 'inizio' && (nuovo < 0 || nuovo >= seg.fine - 0.2)) return;
      const s = await dati.aggiornaSegmento(seg.id, { [campo]: nuovo });
      setSegmenti(segmenti.map(x => (x.id === s.id ? { ...x, ...s } : x)));
    }
    lettore?.riproduciSegmento(seg.inizio + (campo === 'inizio' ? delta : 0) + (campo === 'sfasamento' ? delta : 0) + video.sfasamento,
      seg.fine + (campo === 'fine' ? delta : 0) + (campo === 'sfasamento' ? delta : 0) + video.sfasamento,
      { prima: imp.margineInizio, dopo: imp.margineFine });
  };

  const glossario = async () => {
    setGlossarioInCorso(true);
    try { setVideo(await creaGlossario(video, segmenti)); notifica('Glossario pronto.'); }
    catch (e) { notifica(e.message); }
    setGlossarioInCorso(false);
  };

  return html`<section class="studio">
    <div class="colonna-video">
      <div class=${`video ${modalita !== 'visione' ? 'bloccato' : ''}`}>
        <div ref=${contenitore} class="riquadro"></div>
        ${modalita !== 'visione' && html`<div class="velo" title="Usa i pulsanti qui sotto"></div>`}
      </div>
      ${errore && html`<p class="avviso">${errore}</p>`}
      <h1 class="titolo-video">${video.titolo}</h1>
      <p class="tenue piccolo">${video.canale}${video.livello ? ` · ${video.livello}` : ''} · ${segmenti.length} frasi · studio ${fmtTempo(secondi)}</p>
      ${video.tempi_approssimativi && html`<p class="nota">Tempi approssimativi (trascrizione di Gemini): se una frase si taglia male, sistemala da «Regola i tempi».</p>`}
      ${aiDisponibile && !video.glossario?.length && html`<button class="piccolo" disabled=${glossarioInCorso} onClick=${glossario}>${glossarioInCorso ? 'Preparo il glossario…' : 'Crea il glossario del video'}</button>`}
    </div>

    <div class="colonna-esercizio">
      <nav class="schede" role="tablist">
        ${MODALITA.map(([k, n]) => html`<button role="tab" aria-selected=${modalita === k} class=${modalita === k ? 'attivo' : ''} onClick=${() => cambiaModalita(k)}>${n}</button>`)}
      </nav>

      ${modalita === 'visione'
        ? html`<${Visione} video=${video} segmenti=${segmenti} lettore=${lettore} idx=${idx} onIdx=${setIdx} onRiproponi=${(s, scritto) => creaCartaDa(s, scritto)} />`
        : finito
          ? html`<div class="vuoto"><p>Hai finito il video.</p>
              <button onClick=${() => vaiA(0)}>Ricomincia da capo</button> <a class="bottone primario" href="#/catalogo">Scegli un altro video</a></div>`
          : html`<div>
              <div class="navigazione">
                <button class="mini" disabled=${idx === 0} onClick=${() => vaiA(idx - 1)} title="Frase precedente"><${Icona} n="sx" /></button>
                <span>Frase ${idx + 1} di ${segmenti.length}</span>
                <button class="mini" onClick=${() => vaiA(idx + 1)} title="Frase successiva"><${Icona} n="dx" /></button>
                <button class="mini testo" onClick=${() => setTempiAperti(!tempiAperti)}>${tempiAperti ? 'Chiudi tempi' : 'Regola i tempi'}</button>
              </div>
              ${tempiAperti && html`<div class="tempi">
                ${[['inizio', 'Inizio frase'], ['fine', 'Fine frase'], ['sfasamento', 'Tutto il video']].map(([c, n]) => html`<div>
                  <span>${n}</span>
                  <button class="mini" onClick=${() => sposta(c, -0.2)}>−0,2 s</button>
                  <button class="mini" onClick=${() => sposta(c, 0.2)}>+0,2 s</button>
                  <span class="tenue piccolo">${c === 'sfasamento' ? `${(video.sfasamento || 0).toFixed(1)} s` : `${seg[c].toFixed(1)} s`}</span>
                </div>`)}
              </div>`}
              ${!lettore && !errore && html`<p class="tenue">Carico il player…</p>`}
              ${modalita === 'dettato'
                ? html`<${Dettato} key=${seg.id} segmento=${seg} video=${video} lettore=${lettore} sfasamento=${video.sfasamento} onFatto=${fatto}
                    onRiproponi=${scritto => creaCarta(scritto, null, modalita)} />`
                : html`<${Buchi} key=${seg.id} segmento=${seg} video=${video} lettore=${lettore} sfasamento=${video.sfasamento} onFatto=${fatto}
                    onRiproponi=${scritto => creaCarta(scritto, null, modalita)} />`}
              <${Legenda} />
            </div>`}
    </div>
  </section>`;

  async function creaCartaDa(s, scritto) {
    const { nuova } = await dati.aggiungiCarta({
      video_id: video.id, segmento_id: s.id, youtube_id: video.youtube_id, tipo: 'segmento',
      testo: s.testo, inizio: s.inizio + video.sfasamento, fine: s.fine + video.sfasamento,
      primo_tentativo: scritto || '', errori: [], origine: 'visione', fsrs: nuovoStato(),
    });
    notifica(nuova ? 'Frase aggiunta al ripasso.' : 'Questa frase è già nel ripasso.');
  }
}

// Visione libera: niente stop, trascrizione sincronizzata, clic sulle parole.
function Visione({ video, segmenti, lettore, idx, onIdx, onRiproponi }) {
  const [corrente, setCorrente] = useState(idx);
  const [sottotitoli, setSottotitoli] = useState(true);
  const [sel, setSel] = useState(null);
  const lista = useRef(null);
  const sf = video.sfasamento || 0;

  useEffect(() => {
    if (!lettore) return;
    lettore.velocita(1);
    const t = setInterval(() => {
      const tempo = lettore.tempo();
      let i = segmenti.findIndex((s, k) => tempo >= s.inizio + sf - 0.1 && tempo < (segmenti[k + 1]?.inizio ?? Infinity) + sf - 0.1);
      if (i >= 0) setCorrente(c => (c === i ? c : i));
    }, 200);
    return () => clearInterval(t);
  }, [lettore]);

  useEffect(() => {
    lista.current?.querySelector('.corrente')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [corrente]);

  const seg = segmenti[corrente] || segmenti[0];
  return html`<div class="visione">
    <div class="controlli">
      <button class="primario" onClick=${() => { lettore?.vaiA(seg.inizio + sf - 0.2); lettore?.riproduci(); }}><${Icona} n="play" /> Riproduci da qui</button>
      <button onClick=${() => lettore?.pausa()}>Pausa</button>
      <button class=${sottotitoli ? 'attivo' : ''} onClick=${() => setSottotitoli(!sottotitoli)}>Sottotitoli ${sottotitoli ? 'sì' : 'no'}</button>
      <button onClick=${() => onRiproponi(seg, '')}><${Icona} n="stella" /> Riproponimi</button>
    </div>
    ${sottotitoli && html`<div class="riga-corrente"><${Parole} testo=${seg.testo} selezione=${sel?.i === corrente ? sel.r : null}
      onSeleziona=${(a, b) => { lettore?.pausa(); setSel({ i: corrente, r: [a, b] }); }} /></div>`}
    <ol class="trascrizione" ref=${lista}>
      ${segmenti.map((s, i) => html`<li class=${i === corrente ? 'corrente' : ''} lang="en"
        onClick=${() => { setCorrente(i); onIdx(i); lettore?.vaiA(s.inizio + sf - 0.2); lettore?.riproduci(); }}>${s.testo}</li>`)}
    </ol>
    <p class="tenue piccolo">Clicca una riga per saltare lì. Clicca una parola nella riga in alto per la spiegazione.</p>
    ${sel && html`<${Pannello} video=${video} segmento=${segmenti[sel.i]} intervallo=${sel.r} onIntervallo=${r => setSel({ ...sel, r })} onChiudi=${() => setSel(null)} origine="visione" />`}
  </div>`;
}
