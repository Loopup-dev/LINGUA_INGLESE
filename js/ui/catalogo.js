// Catalogo di partenza, i tuoi video e l'import di un link.
import { html, useEffect, useRef, useState } from '../lib.js';
import { dati } from '../dati.js';
import { aiDisponibile } from '../ai.js';
import { estraiId, importaVideo, importatoreAttivo } from '../importa.js';
import { useApp, fmtDurata } from './comuni.js';

const GRUPPI = [['', 'Tutti'], ['ted', 'TED'], ['discorsi', 'Discorsi'], ['serie', 'Serie TV'], ['professionale', 'Professionale']];
const DURATE = [['', 'Qualsiasi durata'], ['300', 'Fino a 5 min'], ['600', 'Fino a 10 min'], ['1200', 'Fino a 20 min']];
const miniatura = id => `https://i.ytimg.com/vi/${id}/mqdefault.jpg`;

export function Catalogo() {
  const { notifica } = useApp();
  const [catalogo, setCatalogo] = useState([]);
  const [miei, setMiei] = useState([]);
  const [filtri, setFiltri] = useState({ gruppo: '', livello: '', registro: '', durata: '' });
  const [link, setLink] = useState('');
  const [importa, setImporta] = useState(null);
  const [daEliminare, setDaEliminare] = useState(null);

  const ricarica = () => dati.video().then(setMiei).catch(e => notifica(e.message));
  useEffect(() => {
    fetch('catalogo/catalogo.json').then(r => r.json()).then(setCatalogo).catch(() => notifica('Catalogo non disponibile offline.'));
    ricarica();
  }, []);

  const importati = new Map(miei.map(v => [v.youtube_id, v]));
  const visibili = catalogo.filter(v =>
    (!filtri.gruppo || v.gruppo === filtri.gruppo) &&
    (!filtri.livello || v.livello === filtri.livello) &&
    (!filtri.registro || v.registro === filtri.registro) &&
    (!filtri.durata || (v.durataSec && v.durataSec <= +filtri.durata)));

  const daLink = () => {
    const id = estraiId(link);
    if (!id) { notifica('Non riconosco questo link YouTube.'); return; }
    const noto = catalogo.find(v => v.videoId === id);
    setImporta({ id, extra: noto ? daCatalogo(noto) : {} });
    setLink('');
  };

  const elimina = async v => {
    await dati.eliminaVideo(v.id).catch(e => notifica(e.message));
    setDaEliminare(null);
    notifica('Video eliminato. Le carte di ripasso restano.');
    ricarica();
  };

  const scegli = (k, val) => setFiltri({ ...filtri, [k]: val });
  return html`<section class="catalogo">
    <h1>Video</h1>
    <form class="riga-input" onSubmit=${e => { e.preventDefault(); daLink(); }}>
      <input class="campo" placeholder="Incolla un link YouTube" value=${link} onInput=${e => setLink(e.target.value)} inputmode="url" />
      <button class="primario" type="submit">Importa</button>
    </form>

    ${miei.length > 0 && html`<h2>I tuoi video</h2>
      <ul class="lista-video">${miei.map(v => html`<li>
        <a href=${`#/studio/${v.youtube_id}`}><img src=${miniatura(v.youtube_id)} alt="" loading="lazy" /></a>
        <div>
          <a href=${`#/studio/${v.youtube_id}`}><strong>${v.titolo}</strong></a>
          <p class="tenue piccolo">${v.canale} · ${fmtDurata(v.durata_sec)}${v.livello ? ` · ${v.livello}` : ''} · ${{ locale: 'sottotitoli YouTube', gemini: 'tempi approssimativi (Gemini)', manuale: 'file di sottotitoli' }[v.fonte] || ''}</p>
          ${daEliminare === v.id
            ? html`<p class="piccolo">Eliminare il video? <button class="mini testo" onClick=${() => elimina(v)}>Sì, elimina</button> <button class="mini testo" onClick=${() => setDaEliminare(null)}>No</button></p>`
            : html`<button class="mini testo piccolo" onClick=${() => setDaEliminare(v.id)}>Elimina</button>`}
        </div>
      </li>`)}</ul>`}

    <h2>Catalogo</h2>
    <div class="filtri">
      <div class="chips">${GRUPPI.map(([k, n]) => html`<button class=${`chip ${filtri.gruppo === k ? 'attivo' : ''}`} onClick=${() => scegli('gruppo', k)}>${n}</button>`)}</div>
      <select value=${filtri.livello} onChange=${e => scegli('livello', e.target.value)} aria-label="Livello">
        <option value="">Ogni livello</option>${['B1', 'B2', 'C1', 'C2'].map(l => html`<option>${l}</option>`)}
      </select>
      <select value=${filtri.registro} onChange=${e => scegli('registro', e.target.value)} aria-label="Registro">
        <option value="">Ogni registro</option>${['slang', 'informale', 'neutro', 'formale'].map(l => html`<option>${l}</option>`)}
      </select>
      <select value=${filtri.durata} onChange=${e => scegli('durata', e.target.value)} aria-label="Durata">
        ${DURATE.map(([k, n]) => html`<option value=${k}>${n}</option>`)}
      </select>
    </div>
    ${!visibili.length && html`<p class="tenue">Nessun video con questi filtri.</p>`}
    <ul class="lista-video">${visibili.map(v => {
      const gia = importati.get(v.videoId);
      return html`<li>
        <img src=${miniatura(v.videoId)} alt="" loading="lazy" />
        <div>
          <strong>${v.titolo}</strong>
          <p class="tenue piccolo">${v.canale} · ${fmtDurata(v.durataSec)} · ${v.livello} · <span class=${`registro ${v.registro}`}>${v.registro}</span>${v.sottotitoli !== 'manuali' ? html` · <span title="I sottotitoli manuali danno frasi più precise">${v.sottotitoli === 'automatici' ? 'sottotitoli automatici' : 'sottotitoli da verificare'}</span>` : ''}</p>
          <p class="piccolo">${v.perche}</p>
          ${gia ? html`<a class="bottone" href=${`#/studio/${v.videoId}`}>Studia</a>` : html`<button onClick=${() => setImporta({ id: v.videoId, extra: daCatalogo(v) })}>Importa e studia</button>`}
        </div>
      </li>`;
    })}</ul>
    ${importa && html`<${Importazione} ...${importa} onChiudi=${() => { setImporta(null); ricarica(); }} />`}
  </section>`;
}

const daCatalogo = v => ({ titolo: v.titolo, canale: v.canale, durata_sec: v.durataSec, livello: v.livello, registro: v.registro, gruppo: v.gruppo });

// Finestra di import: prova l'importatore locale e, se non c'è, offre le alternative.
function Importazione({ id, extra, onChiudi }) {
  const { imp, vai } = useApp();
  const [passi, setPassi] = useState([]);
  const [problema, setProblema] = useState(null);
  const [inCorso, setInCorso] = useState(false);
  const file = useRef(null);

  const parti = async (strada, f) => {
    setProblema(null); setInCorso(true); setPassi([]);
    try {
      const r = await importaVideo({ id, extra, strada, file: f, importatore: imp.importatore, avanza: p => setPassi(x => [...x, p]) });
      if (r.avvisoGlossario) setPassi(x => [...x, r.avvisoGlossario]);
      vai(`#/studio/${id}`);
    } catch (e) {
      setProblema(e.tipo === 'importatore'
        ? { titolo: "L'importatore sul PC non risponde", testo: 'Sul PC fai doppio clic su avvia-importatore.bat e lascia aperta la finestra, poi riprova. Dal telefono, o se non vuoi aprirlo, usa una delle alternative.' }
        : { titolo: 'Import non riuscito', testo: e.message, fatale: e.tipo === 'incorporamento' });
    }
    setInCorso(false);
  };

  useEffect(() => {
    // Sul telefono l'importatore non c'è: si va dritti alle alternative.
    importatoreAttivo(imp.importatore).then(attivo => (attivo ? parti('auto') : setProblema({
      titolo: "L'importatore sul PC non è attivo",
      testo: 'Sul PC: doppio clic su avvia-importatore.bat, poi «Riprova». Altrimenti scegli un\'alternativa.',
    })));
  }, []);

  return html`<div class="pannello-sfondo"><div class="finestra" role="dialog" aria-label="Importazione">
    <h2>Importo il video</h2>
    <ul class="passi">${passi.map((p, i) => html`<li class=${i === passi.length - 1 && inCorso ? 'attivo' : ''}>${p}</li>`)}</ul>
    ${problema && html`<div class="problema">
      <strong>${problema.titolo}</strong>
      <p>${problema.testo}</p>
      ${!problema.fatale && html`<div class="bottoni">
        <button onClick=${() => parti('auto')}>Riprova con l'importatore</button>
        ${aiDisponibile
          ? html`<button class="primario" onClick=${() => parti('gemini')}>Usa Gemini (tempi approssimativi)</button>`
          : html`<p class="tenue piccolo">Gemini sarà disponibile dopo il setup di Supabase.</p>`}
        <button onClick=${() => file.current.click()}>Carica un file SRT/VTT</button>
        <input type="file" accept=".srt,.vtt,text/vtt" ref=${file} hidden onChange=${e => e.target.files[0] && parti('file', e.target.files[0])} />
      </div>`}
    </div>`}
    <div class="bottoni"><button class="testo" disabled=${inCorso && !problema} onClick=${onChiudi}>${inCorso ? 'Attendi…' : 'Chiudi'}</button></div>
  </div></div>`;
}
