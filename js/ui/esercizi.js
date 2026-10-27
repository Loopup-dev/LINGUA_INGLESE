// Esercizi: dettato, buchi, shadowing. Li usano sia lo studio sia il ripasso.
import { html, useEffect, useRef, useState } from '../lib.js';
import { confronta, errori, maschera, paroleVisibili, scegliBuchi, stessaParola } from '../testo.js';
import { voceSupportata, ascolta as ascoltaVoce } from '../voce.js';
import { useApp, Icona, Parole, Pannello } from './comuni.js';

const CLASSI = { ok: 'giusta', quasi: 'quasi', sbagliata: 'sbagliata', mancante: 'mancante' };

// Riproduzione del segmento con margini, sfasamento e velocità.
export function useAscolto(lettore, segmento, sfasamento = 0) {
  const { imp } = useApp();
  const [lento, setLento] = useState(false);
  const [inRiproduzione, setInRiproduzione] = useState(false);
  const riascolti = useRef(0);
  const ascoltato = useRef(false);
  useEffect(() => { riascolti.current = 0; ascoltato.current = false; }, [segmento?.id]);
  const play = (opz = {}) => {
    if (!lettore || !segmento) return;
    const usaLento = opz.lento ?? lento;
    if (ascoltato.current && !opz.automatico) riascolti.current++;
    ascoltato.current = true;
    setInRiproduzione(true);
    lettore.riproduciSegmento(segmento.inizio + sfasamento, segmento.fine + sfasamento, {
      velocita: usaLento ? imp.velocitaLenta : 1,
      prima: imp.margineInizio, dopo: imp.margineFine,
      onFine: () => { setInRiproduzione(false); opz.onFine?.(); },
    });
  };
  const cambiaLento = () => { const v = !lento; setLento(v); play({ lento: v }); };
  return { play, lento, cambiaLento, inRiproduzione, riascolti };
}

function Scorciatoie({ azioni }) {
  useEffect(() => {
    const k = e => {
      if (!e.altKey || e.ctrlKey || e.metaKey) return;
      const fn = azioni[e.code];
      if (fn) { e.preventDefault(); fn(); }
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  });
  return null;
}

export function Legenda({ ripasso = false }) {
  return html`<p class="legenda">Invio verifica · Alt+R riascolta · Alt+L lento · Alt+H aiuto${ripasso ? '' : ' · Alt+S riproponimi · Alt+N salta'}</p>`;
}

function Controlli({ ascolto, onAiuto, livelloAiuto, maxAiuto = 4, onSalta, onRiproponi, fatto }) {
  return html`<div class="controlli">
    <button onClick=${() => ascolto.play()} title="Riascolta (Alt+R)"><${Icona} n="replay" /> Riascolta</button>
    <button class=${ascolto.lento ? 'attivo' : ''} onClick=${ascolto.cambiaLento} title="Lento (Alt+L)" aria-pressed=${ascolto.lento}>${ascolto.lento ? 'Lento: sì' : 'Lento: no'}</button>
    ${!fatto && html`<button onClick=${onAiuto} disabled=${livelloAiuto >= maxAiuto} title="Aiuto (Alt+H)"><${Icona} n="aiuto" /> Aiuto${livelloAiuto ? ` ${livelloAiuto}/${maxAiuto}` : ''}</button>`}
    ${onSalta && !fatto && html`<button onClick=${onSalta} title="Salta (Alt+N)"><${Icona} n="salta" /> Salta</button>`}
    ${onRiproponi && html`<button onClick=${onRiproponi} title="Riproponimi (Alt+S)"><${Icona} n="stella" /> Riproponimi</button>`}
  </div>`;
}

const NOMI_AIUTO = ['', 'numero di parole', 'iniziali', 'prima parola sbagliata', 'frase intera'];

// ---------------- Dettato ----------------

export function Dettato({ segmento, video, lettore, sfasamento = 0, onFatto, onRiproponi, vecchio, origine = 'dettato', avvioAutomatico = true }) {
  const { imp } = useApp();
  const opz = { ignoraIntercalari: imp.ignoraIntercalari };
  const ascolto = useAscolto(lettore, segmento, sfasamento);
  const [input, setInput] = useState('');
  const [livello, setLivello] = useState(0);
  const [rivelate, setRivelate] = useState(new Set());
  const [primo, setPrimo] = useState(null);
  const [primoTesto, setPrimoTesto] = useState('');
  const [esito, setEsito] = useState(null);
  const [fatto, setFatto] = useState(false);
  const [rivelata, setRivelata] = useState(false);
  const [sel, setSel] = useState(null);
  const campo = useRef(null);
  const parole = paroleVisibili(segmento.testo);

  useEffect(() => {
    setInput(''); setLivello(0); setRivelate(new Set()); setPrimo(null); setPrimoTesto(''); setEsito(null); setFatto(false); setRivelata(false); setSel(null);
    if (avvioAutomatico && lettore) ascolto.play({ automatico: true, onFine: () => campo.current?.focus() });
    else campo.current?.focus();
  }, [segmento.id, lettore]);

  const registraPrimo = c => { if (!primo) { setPrimo(c); setPrimoTesto(input); } return primo || c; };

  const verifica = () => {
    if (fatto) return continua();
    if (!input.trim()) return;
    const c = confronta(segmento.testo, input, opz);
    registraPrimo(c);
    setEsito(c);
    if (c.perfetta) setFatto(true);
  };

  // Il livello vive anche in un ref: due Alt+H ravvicinati non devono leggere lo stesso valore.
  const livelloRef = useRef(0);
  useEffect(() => { livelloRef.current = 0; }, [segmento.id]);
  const aiuto = () => {
    const attuale = livelloRef.current;
    if (fatto || attuale >= 4) return;
    // Dopo una verifica il numero di parole si vede già: il primo aiuto passa alle iniziali.
    const l = esito && attuale === 0 ? 2 : attuale + 1;
    livelloRef.current = l;
    setLivello(l);
    if (l === 3) {
      const c = confronta(segmento.testo, input, opz);
      const i = c.parole.findIndex((p, k) => p.stato !== 'ok' && !rivelate.has(k));
      setRivelate(new Set([...rivelate, i < 0 ? 0 : i]));
    }
    if (l === 4) {
      const c = confronta(segmento.testo, input, opz);
      registraPrimo(c);
      setEsito(c); setRivelata(true); setFatto(true);
    }
  };

  const continua = () => {
    const p = primo || confronta(segmento.testo, input, opz);
    onFatto({
      accuratezzaPrimo: rivelata && !primoTesto.trim() ? 0 : p.accuratezza,
      accuratezzaFinale: esito?.accuratezza ?? p.accuratezza,
      primoColpo: !!primo?.perfetta,
      livelloAiuto: livello, riascolti: ascolto.riascolti.current, rivelata,
      // una frase rivelata senza aver scritto niente non dice quali parole sfuggono
      scritto: primoTesto || input, errori: (primoTesto || input).trim() ? errori(p) : [],
    });
  };

  const salta = () => onFatto({ saltato: true });

  // Prima della soluzione: le parole giuste si vedono, le altre restano mascherate.
  const vistaParziale = esito && !fatto
    ? parole.map((p, i) => {
      const st = esito.parole[i];
      return st.stato === 'ok' || rivelate.has(i) ? p : maschera(p, livello >= 2 ? 2 : 1, false);
    })
    : null;

  return html`<div class="esercizio">
    <${Scorciatoie} azioni=${{ KeyR: () => ascolto.play(), KeyL: ascolto.cambiaLento, KeyH: aiuto, KeyS: () => onRiproponi?.(primoTesto || input), KeyN: () => !fatto && !vecchio && salta() }} />
    ${!fatto && livello > 0 && !esito && html`<p class="suggerimento" lang="en">${parole.map((p, i) => maschera(p, livello >= 2 ? 2 : 1, rivelate.has(i))).join(' ')}</p>`}
    ${vistaParziale && html`<p class="suggerimento" lang="en">${vistaParziale.map((p, i) => html`<span class=${CLASSI[esito.parole[i].stato]}>${p}</span> `)}</p>`}
    ${esito && !fatto && html`<p class="tenue">Ci sei al ${Math.round(esito.accuratezza * 100)}%. Correggi e premi Invio${livello ? '' : ', oppure chiedi un aiuto'}.</p>`}

    ${fatto && html`<div class="soluzione">
      <${Parole} testo=${segmento.testo}
        classi=${(primo || esito).parole.map(p => (rivelata && p.stato === 'mancante' ? 'rivelata' : CLASSI[p.stato]))}
        sottotitoli=${(primo || esito).parole.map(p => (p.stato === 'sbagliata' || p.stato === 'quasi') ? p.scritto : '')}
        selezione=${sel} onSeleziona=${(a, b) => setSel([a, b])} />
      <p class="esito">${rivelata ? 'Frase rivelata.' : primo?.perfetta ? 'Perfetto al primo colpo.' : `Primo tentativo: ${Math.round((primo || esito).accuratezza * 100)}%.`}
        <span class="tenue"> Clicca una parola per la spiegazione.</span></p>
      ${vecchio && html`<p class="vecchio">La volta scorsa avevi scritto: <em lang="en">${vecchio.primo_tentativo || '(niente)'}</em></p>`}
    </div>`}

    <div class="riga-input">
      <input ref=${campo} class="campo" lang="en" value=${input}
        placeholder=${fatto ? 'Invio per continuare' : 'Scrivi quello che senti…'}
        autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck=${false}
        readOnly=${fatto}
        onInput=${e => setInput(e.target.value)}
        onKeyDown=${e => { if (e.key === 'Enter') { e.preventDefault(); verifica(); } }} />
      <button class="primario" onClick=${verifica}>${fatto ? 'Continua' : 'Verifica'}</button>
    </div>
    ${livello > 0 && !fatto && html`<p class="tenue">Aiuto usato: ${NOMI_AIUTO[livello]}.</p>`}
    <${Controlli} ascolto=${ascolto} onAiuto=${aiuto} livelloAiuto=${livello} onSalta=${vecchio ? null : salta} fatto=${fatto}
      onRiproponi=${onRiproponi ? () => onRiproponi(primoTesto || input) : null} />
    ${fatto && imp.shadowing && html`<${Shadowing} testo=${segmento.testo} />`}
    ${sel && html`<${Pannello} video=${video} segmento=${segmento} intervallo=${sel} onIntervallo=${setSel} onChiudi=${() => setSel(null)} origine=${origine} />`}
  </div>`;
}

// ---------------- Buchi ----------------

export function Buchi({ segmento, video, lettore, sfasamento = 0, onFatto, onRiproponi, buchiForzati, vecchio, avvioAutomatico = true, dopo }) {
  const { imp } = useApp();
  const ascolto = useAscolto(lettore, segmento, sfasamento);
  const espressioni = (video?.glossario || []).filter(g => g.segmento === segmento.idx).map(g => g.espressione);
  const { parole, buchi } = buchiForzati
    ? { parole: paroleVisibili(segmento.testo), buchi: buchiForzati }
    : scegliBuchi(segmento.testo, espressioni);
  const [valori, setValori] = useState({});
  const [livello, setLivello] = useState(0);
  const [rivelati, setRivelati] = useState(new Set());
  const [primo, setPrimo] = useState(null);
  const [esito, setEsito] = useState(null);
  const [fatto, setFatto] = useState(false);
  const [rivelata, setRivelata] = useState(false);
  const [sel, setSel] = useState(null);
  const primoCampo = useRef(null);

  useEffect(() => {
    setValori({}); setLivello(0); setRivelati(new Set()); setPrimo(null); setEsito(null); setFatto(false); setRivelata(false); setSel(null);
    if (avvioAutomatico && lettore) ascolto.play({ automatico: true, onFine: () => primoCampo.current?.focus() });
  }, [segmento.id, lettore]);

  const opz = { ignoraIntercalari: imp.ignoraIntercalari };
  const controlla = () => Object.fromEntries(buchi.map(i => [i, rivelati.has(i) || stessaParola(parole[i], valori[i] || '', opz)]));

  const verifica = () => {
    if (fatto) return continua();
    const r = controlla();
    const acc = buchi.filter(i => r[i]).length / buchi.length;
    const e = { r, acc };
    if (!primo) setPrimo(e);
    setEsito(e);
    if (acc === 1) setFatto(true);
  };

  const livelloRef = useRef(0);
  const bottone = useRef(null);
  useEffect(() => { livelloRef.current = 0; }, [segmento.id]);
  // I campi spariscono quando l'esercizio è finito: il focus passa a «Continua», così Invio va avanti.
  useEffect(() => { if (fatto) bottone.current?.focus(); }, [fatto]);

  const aiuto = () => {
    if (fatto || livelloRef.current >= 4) return;
    const l = livelloRef.current + 1;
    livelloRef.current = l;
    setLivello(l);
    if (l === 3) {
      const r = controlla();
      const i = buchi.find(k => !r[k]);
      if (i != null) setRivelati(new Set([...rivelati, i]));
    }
    if (l === 4) {
      const r = controlla();
      const e = { r, acc: buchi.filter(i => r[i]).length / buchi.length };
      if (!primo) setPrimo(e);
      setEsito(e); setRivelata(true); setFatto(true);
    }
  };

  const continua = () => {
    const p = primo || { r: controlla(), acc: 0 };
    onFatto({
      accuratezzaPrimo: p.acc, accuratezzaFinale: esito?.acc ?? p.acc, primoColpo: p.acc === 1,
      livelloAiuto: livello, riascolti: ascolto.riascolti.current, rivelata,
      scritto: buchi.map(i => valori[i] || '…').join(' / '),
      errori: buchi.filter(i => !p.r[i]).map(i => ({ parola: parole[i].replace(/^[^\w']+|[^\w']+$/g, ''), scritto: valori[i] || '', categoria: 'buchi' })),
    });
  };

  const ilPrimo = buchi[0];
  return html`<div class="esercizio">
    <${Scorciatoie} azioni=${{ KeyR: () => ascolto.play(), KeyL: ascolto.cambiaLento, KeyH: aiuto, KeyS: () => onRiproponi?.(''), KeyN: () => !fatto && !vecchio && onFatto({ saltato: true }) }} />
    ${!fatto
      ? html`<p class="frase buchi" lang="en">${parole.map((p, i) => {
        if (!buchi.includes(i)) return html`<span>${p} </span>`;
        const ok = esito?.r[i];
        const pulita = p.replace(/[^A-Za-z0-9']/g, '');
        const segnaposto = rivelati.has(i) ? pulita : livello >= 2 ? maschera(pulita, 2, false) : livello >= 1 ? maschera(pulita, 1, false) : '';
        return html`<input class=${`buco ${esito ? (ok ? 'giusta' : 'sbagliata') : ''}`} ref=${i === ilPrimo ? primoCampo : null}
          style=${`width:${Math.max(4, pulita.length + 1)}ch`} value=${rivelati.has(i) ? pulita : (valori[i] || '')} placeholder=${segnaposto}
          autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck=${false} readOnly=${rivelati.has(i)}
          onInput=${e => setValori({ ...valori, [i]: e.target.value })}
          onKeyDown=${e => { if (e.key === 'Enter') { e.preventDefault(); verifica(); } }} />${' '}`;
      })}</p>`
      : html`<div class="soluzione">
        <${Parole} testo=${segmento.testo} classi=${parole.map((_, i) => (buchi.includes(i) ? ((primo?.r[i]) ? 'giusta' : 'sbagliata') : ''))}
          selezione=${sel} onSeleziona=${(a, b) => setSel([a, b])} />
        <p class="esito">${rivelata ? 'Soluzione rivelata.' : primo?.acc === 1 ? 'Tutto giusto al primo colpo.' : `Primo tentativo: ${Math.round((primo?.acc || 0) * 100)}%.`}
          <span class="tenue"> Clicca una parola per la spiegazione.</span></p>
        ${vecchio && html`<p class="vecchio">La volta scorsa avevi scritto: <em lang="en">${vecchio.primo_tentativo || '(niente)'}</em></p>`}
        ${dopo}
      </div>`}
    <div class="riga-input"><button class="primario" ref=${bottone} onClick=${verifica}>${fatto ? 'Continua' : 'Verifica'}</button></div>
    <${Controlli} ascolto=${ascolto} onAiuto=${aiuto} livelloAiuto=${livello} fatto=${fatto}
      onSalta=${vecchio ? null : () => onFatto({ saltato: true })} onRiproponi=${onRiproponi ? () => onRiproponi('') : null} />
    ${fatto && imp.shadowing && !vecchio && html`<${Shadowing} testo=${segmento.testo} />`}
    ${sel && html`<${Pannello} video=${video} segmento=${segmento} intervallo=${sel} onIntervallo=${setSel} onChiudi=${() => setSel(null)} origine="buchi" />`}
  </div>`;
}

// ---------------- Shadowing ----------------

export function Shadowing({ testo }) {
  const { imp } = useApp();
  const [stato, setStato] = useState('pronto');
  const [risultato, setRisultato] = useState(null);
  const [errore, setErrore] = useState('');
  if (!voceSupportata) return html`<p class="tenue piccolo">Shadowing: il riconoscimento vocale funziona solo in Chrome o Edge.</p>`;
  const parla = async () => {
    setErrore(''); setRisultato(null); setStato('ascolto');
    try {
      const detto = await ascoltaVoce(imp.linguaVoce);
      setRisultato({ detto, c: confronta(testo, detto, { ignoraIntercalari: true }) });
    } catch (e) { setErrore(e.message); }
    setStato('pronto');
  };
  return html`<div class="shadowing">
    <button class=${stato === 'ascolto' ? 'attivo pulsa' : ''} onClick=${stato === 'ascolto' ? () => ascoltaVoce.ferma?.() : parla}>
      <${Icona} n="mic" /> ${stato === 'ascolto' ? 'Ti ascolto… (tocca per fermare)' : 'Ripeti la frase ad alta voce'}
    </button>
    ${errore && html`<p class="avviso">${errore}</p>`}
    ${risultato && html`<div>
      <p class="frase piccola" lang="en">${risultato.c.parole.map(p => html`<span class=${CLASSI[p.stato]}>${p.parola}</span> `)}</p>
      <p class="tenue piccolo">Capito dal riconoscimento: “${risultato.detto || '—'}” · ${Math.round(risultato.c.accuratezza * 100)}%.
        È una stima di quanto sei comprensibile, non un giudizio sulla pronuncia.</p>
    </div>`}
  </div>`;
}
