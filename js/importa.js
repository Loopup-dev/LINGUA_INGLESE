// Import di un video: trascrizione con i tempi, divisione in frasi, glossario.
// Strade, in ordine: importatore locale sul PC · Gemini dal link · file SRT/VTT.
import { dati } from './dati.js';
import { chiediAI, aiDisponibile } from './ai.js';
import { durataVideo } from './player.js';
import { pulisciRumori, confronta } from './testo.js';

export function estraiId(testo) {
  const t = String(testo || '').trim();
  if (/^[\w-]{11}$/.test(t)) return t;
  const m = t.match(/(?:youtu\.be\/|[?&]v=|\/shorts\/|\/embed\/|\/live\/)([\w-]{11})/);
  return m ? m[1] : null;
}

export async function controllaVideo(id) {
  try {
    const r = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent('https://www.youtube.com/watch?v=' + id)}&format=json`);
    if (r.ok) { const d = await r.json(); return { ok: true, titolo: d.title, canale: d.author_name }; }
    if (r.status === 401 || r.status === 403) return { ok: false, motivo: "L'autore di questo video non permette di incorporarlo in altri siti: non si può studiare qui." };
    return { ok: false, motivo: 'Video non trovato: controlla il link (o il video è privato).' };
  } catch {
    return { ok: true, titolo: '', canale: '', nonVerificato: true };
  }
}

async function conTimeout(promessa, ms) {
  let t;
  return Promise.race([promessa, new Promise((_, ko) => { t = setTimeout(() => ko(new Error('timeout')), ms); })]).finally(() => clearTimeout(t));
}

export async function importatoreAttivo(base) {
  try {
    const r = await conTimeout(fetch(`${base}/stato`), 1500);
    return r.ok;
  } catch { return false; }
}

async function daImportatore(base, id) {
  let r;
  try { r = await fetch(`${base}/trascrizione?v=${encodeURIComponent(id)}`); }
  catch { throw Object.assign(new Error('importatore spento'), { tipo: 'importatore' }); }
  const d = await r.json().catch(() => ({}));
  if (!r.ok) {
    const e = new Error(d.messaggio || "L'importatore non è riuscito a prendere i sottotitoli.");
    e.tipo = d.errore; throw e;
  }
  return d; // { frammenti: [{start, dur, text}], manuali, lingua }
}

// ---------- Divisione in frasi ----------

const FINE_FRASE = /[.?!…]["'”’)\]]*$/;
const MAX_SEGMENTO = 15;

// Se un frammento contiene la fine di una frase e l'inizio di un'altra, lo spezza
// e divide il suo tempo in proporzione ai caratteri.
function spezzaFrammento(f) {
  const testo = f.text;
  const pezzi = testo.split(/(?<=[.?!…]["'”’)\]]?)\s+(?=["'“‘(]?[A-Z0-9])/);
  if (pezzi.length < 2) return [f];
  const tot = pezzi.reduce((s, p) => s + p.length, 0) || 1;
  let t = f.start;
  return pezzi.map(p => {
    const dur = f.dur * (p.length / tot);
    const r = { start: t, dur, text: p };
    t += dur;
    return r;
  });
}

function chiudiSovrapposizioni(segmenti) {
  for (let i = 0; i < segmenti.length - 1; i++) {
    const s = segmenti[i], n = segmenti[i + 1];
    if (s.fine > n.inizio) s.fine = Math.max(s.inizio + 0.3, n.inizio);
  }
  return segmenti.map(s => ({ ...s, inizio: +s.inizio.toFixed(2), fine: +s.fine.toFixed(2) }));
}

export function segmentaManuali(frammenti) {
  const out = [];
  let cur = null;
  const chiudi = () => { if (cur && cur.testo.trim()) out.push(cur); cur = null; };
  for (const grezzo of frammenti) {
    const cambioVoce = /^\s*[-–—]/.test(grezzo.text) || /^\s*>>/.test(grezzo.text);
    const testoPulito = pulisciRumori(String(grezzo.text).replace(/\n/g, ' '));
    if (!testoPulito) continue;
    for (const f of spezzaFrammento({ ...grezzo, text: testoPulito })) {
      if (cur && (cambioVoce || f.start - cur.fine > 1.5)) chiudi();
      if (!cur) cur = { inizio: f.start, fine: f.start + f.dur, testo: f.text };
      else { cur.testo += ' ' + f.text; cur.fine = f.start + f.dur; }
      if (FINE_FRASE.test(f.text) || cur.fine - cur.inizio > MAX_SEGMENTO) chiudi();
    }
  }
  chiudi();
  return chiudiSovrapposizioni(out);
}

// Sottotitoli automatici senza punteggiatura: si taglia sulle pause.
function segmentaSullePause(frammenti) {
  const out = [];
  let cur = null;
  frammenti.forEach((f, i) => {
    const t = pulisciRumori(f.text.replace(/\n/g, ' '));
    if (!t) return;
    const prossimo = frammenti[i + 1];
    const fine = prossimo ? Math.min(f.start + f.dur, prossimo.start) : f.start + f.dur;
    if (!cur) cur = { inizio: f.start, fine, testo: t };
    else { cur.testo += ' ' + t; cur.fine = fine; }
    const pausa = prossimo ? prossimo.start - fine : 99;
    if (pausa > 0.6 || cur.fine - cur.inizio > 10 || cur.testo.split(' ').length > 20) { out.push(cur); cur = null; }
  });
  if (cur) out.push(cur);
  return chiudiSovrapposizioni(out.map(s => ({ ...s, testo: s.testo.charAt(0).toUpperCase() + s.testo.slice(1) })));
}

async function segmentaAutomatici(frammenti, avanza) {
  const puliti = frammenti.map(f => ({ ...f, text: pulisciRumori(String(f.text).replace(/\n/g, ' ')) })).filter(f => f.text);
  if (!aiDisponibile) return segmentaSullePause(puliti);
  const out = [];
  const BLOCCO = 150;
  for (let da = 0; da < puliti.length; da += BLOCCO) {
    const blocco = puliti.slice(da, da + BLOCCO);
    avanza?.(`Divido in frasi con Gemini (${Math.min(da + BLOCCO, puliti.length)} di ${puliti.length} frammenti)…`);
    try {
      const r = await chiediAI('punteggia', { frammenti: blocco.map((f, i) => ({ i, testo: f.text })) });
      const frasi = (r.frasi || []).filter(x => Number.isInteger(x.da) && Number.isInteger(x.a) && x.da <= x.a).sort((a, b) => a.da - b.da);
      let atteso = 0, valido = frasi.length > 0;
      for (const x of frasi) { if (x.da !== atteso || x.a >= blocco.length) { valido = false; break; } atteso = x.a + 1; }
      if (!valido || atteso !== blocco.length) throw new Error('raggruppamento incoerente');
      for (const x of frasi) {
        const grezzo = blocco.slice(x.da, x.a + 1).map(f => f.text).join(' ');
        // Gemini deve solo punteggiare: se ha cambiato le parole si tiene il testo originale.
        const testo = confronta(grezzo, x.testo).accuratezza >= 0.9 ? x.testo : grezzo;
        const dopo = puliti[da + x.a + 1];
        const ult = blocco[x.a];
        out.push({ inizio: blocco[x.da].start, fine: dopo ? Math.min(ult.start + ult.dur, dopo.start + 0.1) : ult.start + ult.dur, testo });
      }
    } catch {
      out.push(...segmentaSullePause(blocco));
    }
  }
  return chiudiSovrapposizioni(out);
}

// ---------- SRT / VTT ----------

function secondi(t) {
  const m = t.trim().replace(',', '.').match(/(?:(\d+):)?(\d+):(\d+(?:\.\d+)?)/);
  if (!m) return NaN;
  return (+(m[1] || 0)) * 3600 + (+m[2]) * 60 + parseFloat(m[3]);
}

export function leggiSottotitoli(testo) {
  const blocchi = String(testo).replace(/\r/g, '').split(/\n\s*\n/);
  const frammenti = [];
  for (const b of blocchi) {
    const righe = b.split('\n').filter(r => r.trim() && !/^WEBVTT|^NOTE|^STYLE|^\d+$/.test(r.trim()));
    const iTempo = righe.findIndex(r => r.includes('-->'));
    if (iTempo < 0) continue;
    const [a, z] = righe[iTempo].split('-->');
    const start = secondi(a), fine = secondi(z.split(' ').filter(Boolean)[0] || z);
    const text = righe.slice(iTempo + 1).join(' ').replace(/<[^>]+>/g, '').trim();
    if (!isNaN(start) && !isNaN(fine) && text) frammenti.push({ start, dur: Math.max(0.1, fine - start), text });
  }
  if (!frammenti.length) throw new Error('Il file non sembra un SRT o un VTT valido.');
  return frammenti;
}

// ---------- Gemini dal link ----------

async function daGemini(id, avanza) {
  avanza('Leggo la durata del video…');
  const durata = await durataVideo(id);
  const FINESTRA = 180;
  const out = [];
  for (let da = 0; da < durata; da += FINESTRA) {
    const a = Math.min(durata, da + FINESTRA);
    avanza(`Gemini trascrive il video: minuto ${Math.floor(da / 60)}–${Math.ceil(a / 60)} di ${Math.ceil(durata / 60)}…`);
    const r = await chiediAI('trascrivi', { youtubeId: id, da, a });
    let seg = (r.segmenti || []).filter(s => s.testo && isFinite(s.inizio) && isFinite(s.fine));
    // Se i tempi sembrano relativi allo spezzone, si riportano sul video intero.
    if (da > 0 && seg.length && seg.every(s => s.inizio < FINESTRA + 10) && seg[0].inizio < da - 5) {
      seg = seg.map(s => ({ ...s, inizio: s.inizio + da, fine: s.fine + da }));
    }
    for (const s of seg) {
      if (s.inizio < da - 1 || s.inizio >= a + 1) continue;
      const prec = out[out.length - 1];
      if (prec && s.inizio < prec.inizio + 0.2) continue;
      // lo spezzone parte 8 secondi prima: un pezzo già trascritto può tornare due volte
      if (prec && s.inizio < prec.fine + 1 && confronta(prec.testo, s.testo).accuratezza > 0.6) continue;
      out.push({ inizio: s.inizio, fine: Math.max(s.fine, s.inizio + 0.5), testo: pulisciRumori(s.testo) });
    }
  }
  return { segmenti: chiudiSovrapposizioni(unisciFrammenti(out.filter(s => s.testo))), durata };
}

// Gemini a volte divide alle virgole: si riuniscono i pezzi finché la frase non è finita.
export function unisciFrammenti(segmenti) {
  const out = [];
  for (const s of segmenti) {
    const prec = out[out.length - 1];
    if (prec && !FINE_FRASE.test(prec.testo) && s.inizio - prec.fine < 1.2 && s.fine - prec.inizio <= MAX_SEGMENTO) {
      prec.testo += ' ' + s.testo;
      prec.fine = s.fine;
    } else out.push({ ...s });
  }
  return out;
}

// ---------- Glossario ----------

export async function creaGlossario(video, segmenti) {
  const r = await chiediAI('glossario', { titolo: video.titolo, segmenti: segmenti.map(s => ({ i: s.idx, testo: s.testo })) });
  const perIdx = new Map(segmenti.map(s => [s.idx, s]));
  const glossario = (r.espressioni || []).filter(e => {
    const s = perIdx.get(e.segmento);
    return s && s.testo.toLowerCase().includes(String(e.espressione).toLowerCase());
  });
  return dati.aggiornaVideo(video.id, { glossario, livello: video.livello || r.livello || null });
}

// ---------- Orchestrazione ----------

// strada: 'auto' (importatore, poi chiede) · 'gemini' · 'file'
export async function importaVideo({ id, extra = {}, strada = 'auto', file, importatore, avanza = () => {} }) {
  avanza('Controllo che il video si possa incorporare…');
  const info = await controllaVideo(id);
  if (!info.ok) throw Object.assign(new Error(info.motivo), { tipo: 'incorporamento' });

  let segmenti, fonte, approssimativi = false, durata = extra.durata_sec || null;
  if (strada === 'file') {
    avanza('Leggo il file dei sottotitoli…');
    segmenti = segmentaManuali(leggiSottotitoli(await file.text()));
    fonte = 'manuale';
  } else if (strada === 'gemini') {
    const r = await daGemini(id, avanza);
    segmenti = r.segmenti; durata = Math.round(r.durata); fonte = 'gemini'; approssimativi = true;
  } else {
    avanza("Cerco l'importatore sul PC…");
    if (!(await importatoreAttivo(importatore))) throw Object.assign(new Error('importatore spento'), { tipo: 'importatore' });
    avanza('Prendo i sottotitoli da YouTube…');
    const t = await daImportatore(importatore, id);
    segmenti = t.manuali ? segmentaManuali(t.frammenti) : await segmentaAutomatici(t.frammenti, avanza);
    const ult = t.frammenti[t.frammenti.length - 1];
    durata ||= ult ? Math.round(ult.start + ult.dur) : null;
    fonte = 'locale';
  }
  if (!segmenti?.length) throw new Error('Non ho trovato frasi in inglese in questo video.');

  avanza('Salvo il video…');
  const esistente = await dati.videoDa(id);
  if (esistente) await dati.eliminaVideo(esistente.id);
  const video = await dati.salvaVideo({
    youtube_id: id,
    titolo: extra.titolo || info.titolo || id,
    canale: extra.canale || info.canale || '',
    durata_sec: durata,
    livello: extra.livello || null,
    registro: extra.registro || null,
    gruppo: extra.gruppo || null,
    fonte,
    tempi_approssimativi: approssimativi,
  });
  const salvati = await dati.salvaSegmenti(video.id, segmenti);

  let finale = video, avvisoGlossario = null;
  if (aiDisponibile) {
    avanza('Gemini prepara il glossario del video…');
    try { finale = await creaGlossario(video, salvati); }
    catch (e) { avvisoGlossario = `Glossario non pronto: ${e.message} Puoi rigenerarlo dalla pagina di studio.`; }
  }
  return { video: finale, segmenti: salvati, avvisoGlossario };
}
