// Pezzi d'interfaccia condivisi: contesto, parole cliccabili, pannello delle spiegazioni.
import { html, createContext, useContext, useEffect, useRef, useState } from '../lib.js';
import { dati } from '../dati.js';
import { chiediAI } from '../ai.js';
import { normalizza, paroleVisibili } from '../testo.js';
import { nuovoStato } from '../ripasso.js';

export const Ctx = createContext(null);
export const useApp = () => useContext(Ctx);

export const fmtTempo = s => {
  s = Math.max(0, Math.round(s || 0));
  const m = Math.floor(s / 60), r = s % 60;
  return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m}:${String(r).padStart(2, '0')}`;
};
export const fmtDurata = s => (s ? (s < 60 ? `${Math.round(s)} s` : `${Math.round(s / 60)} min`) : '—');

export function Icona({ n }) {
  const p = {
    play: 'M8 5v14l11-7z',
    replay: 'M12 5V1L7 6l5 5V7a6 6 0 1 1-6 6H4a8 8 0 1 0 8-8z',
    lento: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm1 5h-2v6l5 3 1-1.7-4-2.3z',
    aiuto: 'M11 18h2v-2h-2v2zm1-16a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 18a8 8 0 1 1 0-16 8 8 0 0 1 0 16zm0-14a4 4 0 0 0-4 4h2a2 2 0 1 1 4 0c0 2-3 1.75-3 5h2c0-2.25 3-2.5 3-5a4 4 0 0 0-4-4z',
    salta: 'M6 18l8.5-6L6 6v12zm10-12v12h2V6h-2z',
    stella: 'M12 17.3l6.2 3.7-1.6-7 5.4-4.7-7.1-.6L12 2 9.1 8.7 2 9.3l5.4 4.7-1.6 7z',
    mic: 'M12 14a3 3 0 0 0 3-3V5a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.9V21h2v-3.1a7 7 0 0 0 6-6.9h-2z',
    chiudi: 'M19 6.4L17.6 5 12 10.6 6.4 5 5 6.4 10.6 12 5 17.6 6.4 19 12 13.4 17.6 19 19 17.6 13.4 12z',
    sx: 'M15.4 7.4L14 6l-6 6 6 6 1.4-1.4L10.8 12z',
    dx: 'M8.6 16.6L10 18l6-6-6-6-1.4 1.4 4.6 4.6z',
  }[n];
  return html`<svg class="icona" viewBox="0 0 24 24" aria-hidden="true"><path d=${p} /></svg>`;
}

// Frase con parole selezionabili: clic = una parola, Maiusc+clic o trascinamento = espressione.
export function Parole({ testo, classi = [], sottotitoli = [], onSeleziona, selezione }) {
  const parole = paroleVisibili(testo);
  const ancora = useRef(null);
  const trascina = useRef(false);
  const ultimo = useRef(null);
  const sel = (a, b) => onSeleziona?.(Math.min(a, b), Math.max(a, b));
  useEffect(() => {
    const su = () => {
      if (trascina.current && ultimo.current) sel(...ultimo.current);
      trascina.current = false;
    };
    window.addEventListener('pointerup', su);
    return () => window.removeEventListener('pointerup', su);
  });
  return html`<p class="frase" lang="en">
    ${parole.map((p, i) => {
      const dentro = selezione && i >= selezione[0] && i <= selezione[1];
      return html`<span
        class=${`parola ${classi[i] || ''} ${dentro ? 'selezionata' : ''}`}
        onPointerDown=${e => {
          if (e.pointerType === 'mouse' && e.button !== 0) return;
          if (e.shiftKey && ancora.current != null) { ultimo.current = [ancora.current, i]; return; }
          ancora.current = i; ultimo.current = [i, i];
          if (e.pointerType === 'mouse') trascina.current = true;
        }}
        onPointerEnter=${() => { if (trascina.current) ultimo.current = [ancora.current, i]; }}
        onClick=${e => { if (e.pointerType !== 'mouse' && !trascina.current) sel(...(ultimo.current || [i, i])); else if (e.shiftKey) sel(...ultimo.current); }}
      >${p}${sottotitoli[i] ? html`<small class="scritto">${sottotitoli[i]}</small>` : ''}</span>${' '}`;
    })}
  </p>`;
}

// Cerca nel glossario del video un'espressione che contiene la selezione (o viceversa).
function dalGlossario(video, segmento, selezione) {
  const s = normalizza(selezione);
  return (video?.glossario || []).find(g => {
    if (g.segmento !== segmento.idx) return false;
    const e = normalizza(g.espressione);
    return e.includes(s) || s.includes(e);
  }) || null;
}

function trovaInFrase(frase, espressione) {
  const parole = paroleVisibili(frase).map(p => normalizza(p));
  const ep = paroleVisibili(espressione).map(p => normalizza(p));
  for (let i = 0; i + ep.length <= parole.length; i++) if (ep.every((w, k) => parole[i + k] === w)) return true;
  return false;
}

// Pannello della spiegazione: bottom sheet sul telefono, riquadro laterale su PC.
export function Pannello({ video, segmento, intervallo, onIntervallo, onChiudi, origine = 'espressione' }) {
  const { imp, salvaImp, notifica } = useApp();
  const parole = paroleVisibili(segmento.testo);
  const [a, b] = intervallo;
  const selezione = parole.slice(a, b + 1).join(' ').replace(/^[^\w']+|[^\w']+$/g, '');
  const [stato, setStato] = useState({ caricamento: true });
  const lingua = imp.linguaSpiegazioni;

  useEffect(() => {
    let vivo = true;
    setStato({ caricamento: true });
    (async () => {
      const g = dalGlossario(video, segmento, selezione);
      if (g) return { espressione: g.espressione, forma_base: g.forma_base, registro: g.registro, it: { significato: g.it }, en: { significato: g.en }, esempi: g.esempio ? [{ en: g.esempio }] : [], daGlossario: true };
      const chiave = `${normalizza(selezione)}|${segmento.id}`;
      const salvata = await dati.spiegazione(chiave);
      if (salvata) return salvata;
      const r = await chiediAI('spiega', { selezione, frase: segmento.testo, titolo: video?.titolo });
      await dati.salvaSpiegazione(chiave, r);
      return r;
    })().then(d => vivo && setStato({ d }), e => vivo && setStato({ errore: e.message }));
    return () => { vivo = false; };
  }, [selezione, segmento.id]);

  useEffect(() => {
    const esc = e => { if (e.key === 'Escape') onChiudi(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, []);

  const aggiungi = async () => {
    const d = stato.d;
    const espressione = d?.espressione && trovaInFrase(segmento.testo, d.espressione) ? d.espressione : selezione;
    const { nuova } = await dati.aggiungiCarta({
      video_id: video?.id || null, segmento_id: segmento.id, youtube_id: video?.youtube_id || segmento.youtube_id,
      tipo: 'espressione', testo: segmento.testo, inizio: segmento.inizio, fine: segmento.fine,
      espressione, spiegazione: d || null, registro: d?.registro || null, origine, fsrs: nuovoStato(),
    });
    notifica(nuova ? `«${espressione}» aggiunta al ripasso.` : `«${espressione}» era già nel ripasso.`);
  };

  const d = stato.d;
  const blocco = d?.[lingua];
  return html`<div class="pannello-sfondo" onClick=${e => e.target === e.currentTarget && onChiudi()}>
    <aside class="pannello" role="dialog" aria-label="Spiegazione">
      <header>
        <div class="selettore">
          <button class="mini" title="Allarga a sinistra" disabled=${a === 0} onClick=${() => onIntervallo([a - 1, b])}><${Icona} n="sx" /></button>
          <strong lang="en">${selezione}</strong>
          <button class="mini" title="Allarga a destra" disabled=${b >= parole.length - 1} onClick=${() => onIntervallo([a, b + 1])}><${Icona} n="dx" /></button>
          ${b > a ? html`<button class="mini testo" onClick=${() => onIntervallo([a, a])}>una parola</button>` : ''}
        </div>
        <div class="lingua">
          ${['it', 'en'].map(l => html`<button class=${`chip ${lingua === l ? 'attivo' : ''}`} onClick=${() => salvaImp({ linguaSpiegazioni: l })}>${l.toUpperCase()}</button>`)}
          <button class="mini" title="Chiudi" onClick=${onChiudi}><${Icona} n="chiudi" /></button>
        </div>
      </header>
      ${stato.caricamento && html`<p class="tenue">Cerco la spiegazione…</p>`}
      ${stato.errore && html`<p class="avviso">${stato.errore}</p>`}
      ${d && html`<div class="spiegazione">
        ${d.espressione && normalizza(d.espressione) !== normalizza(selezione) && html`<p class="tenue">Fa parte di: <strong lang="en">${d.espressione}</strong></p>`}
        <p class="riga-meta">${d.forma_base && html`<span lang="en">${d.forma_base}</span>`} ${d.registro && html`<span class=${`registro ${d.registro}`}>${d.registro}</span>`}</p>
        <p class="significato">${blocco?.significato}</p>
        ${blocco?.nota && html`<p class="tenue">${blocco.nota}</p>`}
        ${d.esempi?.length > 0 && html`<ul class="esempi">${d.esempi.map(x => html`<li><span lang="en">${x.en}</span>${lingua === 'it' && x.it ? html`<br /><span class="tenue">${x.it}</span>` : ''}</li>`)}</ul>`}
      </div>`}
      <footer><button class="primario" disabled=${stato.caricamento} onClick=${aggiungi}><${Icona} n="stella" /> Aggiungi al ripasso</button></footer>
    </aside>
  </div>`;
}
