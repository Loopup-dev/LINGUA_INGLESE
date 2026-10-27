// Regole delle carte di ripasso e algoritmo FSRS.
import { fsrs, generatorParameters, createEmptyCard, Rating, State } from './lib.js';

export { Rating, State };

let motore = null;
let retentionCorrente = null;

function prendiMotore(retention) {
  if (!motore || retention !== retentionCorrente) {
    motore = fsrs(generatorParameters({ request_retention: retention, enable_fuzz: true }));
    retentionCorrente = retention;
  }
  return motore;
}

// Lo stato FSRS si salva come JSON: le date tornano oggetti Date qui.
function daJson(s) {
  if (!s) return createEmptyCard(new Date());
  return { ...s, due: new Date(s.due), last_review: s.last_review ? new Date(s.last_review) : undefined };
}
function aJson(c) {
  return { ...c, due: c.due.toISOString(), last_review: c.last_review ? new Date(c.last_review).toISOString() : null };
}

export function nuovoStato() {
  return aJson(createEmptyCard(new Date()));
}

export function applicaVoto(statoJson, voto, retention = 0.9, quando = new Date()) {
  const f = prendiMotore(retention);
  const { card } = f.next(daJson(statoJson), quando, voto);
  return aJson(card);
}

export function retrievability(statoJson, retention = 0.9, quando = new Date()) {
  const c = daJson(statoJson);
  if (c.state === State.New) return 0;
  return prendiMotore(retention).get_retrievability(c, quando, false);
}

// Il voto proposto in base a come è andato il ripasso.
export function votoProposto({ accuratezza, primoColpo, riascolti }) {
  if (accuratezza < 0.7) return Rating.Again;
  if (accuratezza < 0.95) return Rating.Hard;
  if (accuratezza < 1) return Rating.Good;
  return primoColpo && riascolti === 0 ? Rating.Easy : Rating.Good;
}

export const NOMI_VOTO = { [Rating.Again]: 'Di nuovo', [Rating.Hard]: 'Difficile', [Rating.Good]: 'Bene', [Rating.Easy]: 'Facile' };

// Il dettato genera una carta? Restituisce i motivi (vuoto = no).
export function motiviCarta({ accuratezzaPrimo, livelloAiuto, riascolti, rivelata }, soglie) {
  const m = [];
  if (soglie.primoSotto100 && accuratezzaPrimo < 1) m.push('errori al primo tentativo');
  if (livelloAiuto >= soglie.aiutoDa) m.push('aiuto usato');
  if (riascolti >= soglie.riascoltiDa) m.push('molti riascolti');
  if (rivelata) m.push('frase rivelata');
  return m;
}

// Ordina le carte per una sessione: prima quelle più a rischio di essere dimenticate.
export function ordinaPerRischio(carte, retention, quando = new Date()) {
  return carte
    .map(c => ({ c, r: retrievability(c.fsrs, retention, quando) }))
    .sort((a, b) => a.r - b.r)
    .map(x => x.c);
}

export function inScadenza(carte, quando = new Date()) {
  return carte.filter(c => !c.sospesa && new Date(c.fsrs?.due || 0) <= quando);
}

export function imparata(carta) {
  return carta.fsrs?.state === State.Review && (carta.fsrs?.stability || 0) >= 21;
}
