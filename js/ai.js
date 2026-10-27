// Chiamate alla Edge Function "gemini". Una alla volta (coda), con attesa e un secondo
// tentativo se la quota al minuto è finita da poco.
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';
import { dati, modalitaProva } from './dati.js';

export class ErroreAI extends Error {
  constructor(tipo, messaggio) { super(messaggio); this.tipo = tipo; }
}

export const aiDisponibile = !modalitaProva;

let coda = Promise.resolve();
const pausa = ms => new Promise(r => setTimeout(r, ms));

async function invia(corpo) {
  const { data } = await dati.client().auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new ErroreAI('accesso', 'Sessione scaduta: esci e rientra.');
  let r;
  try {
    r = await fetch(`${SUPABASE_URL}/functions/v1/gemini`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(corpo),
    });
  } catch {
    throw new ErroreAI('rete', 'Nessuna connessione: le spiegazioni tornano appena sei online.');
  }
  const d = await r.json().catch(() => ({}));
  if (r.ok) return d;
  if (r.status === 404) throw new ErroreAI('funzione', 'La funzione Gemini non è ancora pubblicata su Supabase (vedi SETUP.md, passo 4).');
  const e = new ErroreAI(d.errore || 'interno', messaggioAmico(d));
  e.attesa = d.attesa || 0;
  throw e;
}

function messaggioAmico(d) {
  if (d.errore === 'quota') {
    const min = Math.max(1, Math.ceil((d.attesa || 60) / 60));
    return `Gemini ha finito la quota gratuita per ora. Riprova fra ${min === 1 ? 'un minuto' : min + ' minuti'}: intanto puoi continuare a studiare, le spiegazioni già viste restano disponibili.`;
  }
  if (d.errore === 'occupato') return 'Gemini è sovraccarico in questo momento. Riprova fra poco.';
  if (d.errore === 'accesso') return 'Sessione scaduta: esci e rientra.';
  return d.messaggio || 'Gemini non ha risposto. Riprova fra poco.';
}

export function chiediAI(azione, parametri) {
  if (modalitaProva) {
    return Promise.reject(new ErroreAI('prova', 'In modalità prova Gemini non è collegato: le spiegazioni arrivano dopo il setup di Supabase (SETUP.md).'));
  }
  const lavoro = coda.then(async () => {
    try {
      return await invia({ azione, ...parametri });
    } catch (e) {
      if (e.tipo === 'quota' && e.attesa > 0 && e.attesa <= 20) {
        await pausa(e.attesa * 1000 + 500);
        return invia({ azione, ...parametri });
      }
      throw e;
    }
  });
  coda = lavoro.catch(() => {});
  return lavoro;
}
