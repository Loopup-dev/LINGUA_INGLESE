// Strato dati. Due versioni con la stessa interfaccia:
// - Supabase (normale): dati sincronizzati fra PC e telefono;
// - Locale (modalità prova): tutto in localStorage, utile senza account o per collaudare.
import { createClient } from './lib.js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

export const modalitaProva = !SUPABASE_URL || !SUPABASE_ANON_KEY;

const ora = () => new Date().toISOString();
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Date.now() + '-' + Math.random().toString(16).slice(2));

// ---------- Locale ----------

const CHIAVE = 'inglese-dati-v1';
const TABELLE = ['impostazioni', 'video', 'segmenti', 'carte', 'tentativi', 'ripassi', 'spiegazioni', 'sessioni'];

function leggiTutto() {
  try {
    const d = JSON.parse(localStorage.getItem(CHIAVE) || '{}');
    for (const t of TABELLE) d[t] ||= [];
    return d;
  } catch { return Object.fromEntries(TABELLE.map(t => [t, []])); }
}
let cache = null;
const db = () => (cache ||= leggiTutto());
function salva() {
  try { localStorage.setItem(CHIAVE, JSON.stringify(cache)); }
  catch { throw new Error('Spazio del browser esaurito: elimina qualche video o collega Supabase.'); }
}

const locale = {
  async utente() { return { id: 'locale', email: 'modalità prova' }; },
  async accedi() {}, async esci() {},
  suCambioUtente() { return () => {}; },

  async impostazioni() { return db().impostazioni[0]?.dati || {}; },
  async salvaImpostazioni(dati) { db().impostazioni = [{ dati }]; salva(); },

  async video() { return [...db().video].sort((a, b) => b.creato.localeCompare(a.creato)); },
  async videoDa(youtubeId) { return db().video.find(v => v.youtube_id === youtubeId) || null; },
  async salvaVideo(v) { const r = { sfasamento: 0, glossario: [], ultimo_segmento: 0, ...v, id: uuid(), creato: ora() }; db().video.push(r); salva(); return r; },
  async aggiornaVideo(id, patch) { const v = db().video.find(x => x.id === id); Object.assign(v, patch); salva(); return v; },
  async eliminaVideo(id) {
    const d = db();
    d.segmenti = d.segmenti.filter(s => s.video_id !== id);
    d.video = d.video.filter(v => v.id !== id);
    for (const c of d.carte) if (c.video_id === id) { c.video_id = null; c.segmento_id = null; }
    salva();
  },

  async segmenti(videoId) { return db().segmenti.filter(s => s.video_id === videoId).sort((a, b) => a.idx - b.idx); },
  async salvaSegmenti(videoId, lista) {
    const d = db();
    d.segmenti = d.segmenti.filter(s => s.video_id !== videoId);
    const righe = lista.map((s, idx) => ({ ...s, idx, video_id: videoId, id: uuid() }));
    d.segmenti.push(...righe); salva(); return righe;
  },
  async aggiornaSegmento(id, patch) {
    const s = db().segmenti.find(x => x.id === id); Object.assign(s, patch);
    for (const c of db().carte) if (c.segmento_id === id) { if ('inizio' in patch) c.inizio = patch.inizio; if ('fine' in patch) c.fine = patch.fine; }
    salva(); return s;
  },

  async aggiungiTentativo(t) { db().tentativi.push({ ...t, id: uuid(), creato: ora() }); salva(); },
  async tentativi() { return db().tentativi; },

  async carte() { return db().carte; },
  async aggiungiCarta(c) {
    const esiste = db().carte.find(x => x.segmento_id === c.segmento_id && x.tipo === c.tipo && (x.espressione || '') === (c.espressione || ''));
    if (esiste) return { carta: esiste, nuova: false };
    const r = { espressione: '', errori: [], primo_tentativo: '', sospesa: false, ...c, id: uuid(), creato: ora() };
    db().carte.push(r); salva(); return { carta: r, nuova: true };
  },
  async aggiornaCarta(id, patch) { const c = db().carte.find(x => x.id === id); Object.assign(c, patch); salva(); return c; },
  async eliminaCarta(id) { db().carte = db().carte.filter(c => c.id !== id); salva(); },

  async aggiungiRipasso(r) { db().ripassi.push({ ...r, id: uuid(), creato: ora() }); salva(); },
  async ripassi() { return db().ripassi; },

  async spiegazione(chiave) { return db().spiegazioni.find(s => s.chiave === chiave)?.dati || null; },
  async salvaSpiegazione(chiave, dati) { db().spiegazioni = db().spiegazioni.filter(s => s.chiave !== chiave); db().spiegazioni.push({ chiave, dati, creato: ora() }); salva(); },

  async salvaSessione(s) { db().sessioni = db().sessioni.filter(x => x.id !== s.id); db().sessioni.push(s); salva(); },
  async sessioni() { return db().sessioni; },

  async esporta() { return db(); },
};

// ---------- Supabase ----------

let client = null;
function sb() {
  if (!client) client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: true, autoRefreshToken: true } });
  return client;
}
function ok({ data, error }) {
  if (error) throw new Error(error.message || 'Errore del database');
  return data;
}
// Le liste lunghe arrivano a pagine da 1000 righe.
async function tutte(costruisci) {
  const out = [];
  for (let da = 0; ; da += 1000) {
    const pagina = ok(await costruisci().range(da, da + 999));
    out.push(...pagina);
    if (pagina.length < 1000) return out;
  }
}

const remoto = {
  client: sb,
  async utente() { const { data } = await sb().auth.getSession(); return data.session?.user || null; },
  async accedi(email, password) {
    const { error } = await sb().auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message === 'Invalid login credentials' ? 'Email o password non corrette.' : error.message);
  },
  async esci() { await sb().auth.signOut(); },
  suCambioUtente(fn) { const { data } = sb().auth.onAuthStateChange((_e, s) => fn(s?.user || null)); return () => data.subscription.unsubscribe(); },

  async impostazioni() { const r = ok(await sb().from('impostazioni').select('dati').maybeSingle()); return r?.dati || {}; },
  async salvaImpostazioni(dati) { ok(await sb().from('impostazioni').upsert({ dati, aggiornato: ora() })); },

  async video() { return tutte(() => sb().from('video').select('*').order('creato', { ascending: false })); },
  async videoDa(youtubeId) { return ok(await sb().from('video').select('*').eq('youtube_id', youtubeId).maybeSingle()); },
  async salvaVideo(v) { return ok(await sb().from('video').insert(v).select().single()); },
  async aggiornaVideo(id, patch) { return ok(await sb().from('video').update(patch).eq('id', id).select().single()); },
  async eliminaVideo(id) { ok(await sb().from('video').delete().eq('id', id)); },

  async segmenti(videoId) { return tutte(() => sb().from('segmenti').select('*').eq('video_id', videoId).order('idx')); },
  async salvaSegmenti(videoId, lista) {
    ok(await sb().from('segmenti').delete().eq('video_id', videoId));
    const righe = lista.map((s, idx) => ({ video_id: videoId, idx, inizio: s.inizio, fine: s.fine, testo: s.testo }));
    const out = [];
    for (let i = 0; i < righe.length; i += 500) out.push(...ok(await sb().from('segmenti').insert(righe.slice(i, i + 500)).select()));
    return out.sort((a, b) => a.idx - b.idx);
  },
  async aggiornaSegmento(id, patch) {
    const s = ok(await sb().from('segmenti').update(patch).eq('id', id).select().single());
    const pc = {}; if ('inizio' in patch) pc.inizio = patch.inizio; if ('fine' in patch) pc.fine = patch.fine;
    if (Object.keys(pc).length) ok(await sb().from('carte').update(pc).eq('segmento_id', id));
    return s;
  },

  async aggiungiTentativo(t) { ok(await sb().from('tentativi').insert(t)); },
  async tentativi() { return tutte(() => sb().from('tentativi').select('video_id,segmento_id,modalita,accuratezza,errori,creato').order('creato')); },

  async carte() { return tutte(() => sb().from('carte').select('*').order('creato')); },
  async aggiungiCarta(c) {
    const r = { ...c, espressione: c.espressione || '', scadenza: c.fsrs?.due || ora() };
    const ins = await sb().from('carte').insert(r).select().maybeSingle();
    if (!ins.error) return { carta: ins.data, nuova: true };
    if (ins.error.code !== '23505') throw new Error(ins.error.message);
    const esiste = ok(await sb().from('carte').select('*').eq('segmento_id', c.segmento_id).eq('tipo', c.tipo).eq('espressione', r.espressione).maybeSingle());
    return { carta: esiste, nuova: false };
  },
  async aggiornaCarta(id, patch) {
    const p = { ...patch }; if (p.fsrs) p.scadenza = p.fsrs.due;
    return ok(await sb().from('carte').update(p).eq('id', id).select().single());
  },
  async eliminaCarta(id) { ok(await sb().from('carte').delete().eq('id', id)); },

  async aggiungiRipasso(r) { ok(await sb().from('ripassi').insert(r)); },
  async ripassi() { return tutte(() => sb().from('ripassi').select('carta_id,voto,accuratezza,creato').order('creato')); },

  async spiegazione(chiave) { return ok(await sb().from('spiegazioni').select('dati').eq('chiave', chiave).maybeSingle())?.dati || null; },
  async salvaSpiegazione(chiave, dati) { ok(await sb().from('spiegazioni').upsert({ chiave, dati })); },

  async salvaSessione(s) { ok(await sb().from('sessioni').upsert(s)); },
  async sessioni() { return tutte(() => sb().from('sessioni').select('*').order('inizio')); },

  async esporta() {
    const out = {};
    for (const t of TABELLE) out[t] = await tutte(() => sb().from(t).select('*'));
    return out;
  },
};

export const dati = modalitaProva ? locale : remoto;
