// Confronto tollerante fra la frase giusta e quello che l'utente ha scritto.
// Ogni parola originale si espande in uno o più token canonici; l'allineamento
// lavora sui token, poi il risultato torna sulle parole originali per mostrarlo.

const CONTRAZIONI = {
  "i'm": ['i', 'am'], "you're": ['you', 'are'], "we're": ['we', 'are'], "they're": ['they', 'are'],
  "i've": ['i', 'have'], "you've": ['you', 'have'], "we've": ['we', 'have'], "they've": ['they', 'have'],
  "could've": ['could', 'have'], "would've": ['would', 'have'], "should've": ['should', 'have'], "might've": ['might', 'have'], "must've": ['must', 'have'],
  "i'll": ['i', 'will'], "you'll": ['you', 'will'], "he'll": ['he', 'will'], "she'll": ['she', 'will'], "it'll": ['it', 'will'],
  "we'll": ['we', 'will'], "they'll": ['they', 'will'], "that'll": ['that', 'will'], "there'll": ['there', 'will'],
  "won't": ['will', 'not'], "can't": ['can', 'not'], "cannot": ['can', 'not'], "shan't": ['shall', 'not'], "ain't": ['ain\'t'],
  "let's": ['let', 'us'], "y'all": ['you', 'all'], "ma'am": ['madam'],
  gonna: ['going', 'to'], wanna: ['want', 'to'], gotta: ['got', 'to'], gimme: ['give', 'me'], lemme: ['let', 'me'],
  kinda: ['kind', 'of'], sorta: ['sort', 'of'], outta: ['out', 'of'], dunno: ['do', 'not', 'know'], lotta: ['lot', 'of'],
  "'cause": ['because'], cuz: ['because'], cos: ['because'], "'em": ['them'],
  "'til": ['until'], till: ['until'], ok: ['okay'], 'o.k.': ['okay'], alright: ['all', 'right'],
  yeah: ['yeah'], yep: ['yeah'], yup: ['yeah'], ya: ['you'],
};

// "'s" e "'d" sono ambigui: diventano token jolly che valgono più forme.
const JOLLY = { '~s': ['is', 'has'], '~d': ['would', 'had', 'did'] };
const CON_S = new Set(['it', 'he', 'she', 'that', 'what', 'there', 'here', 'who', 'where', 'how', 'when', 'why', 'this', 'everything', 'nothing', 'something', 'someone', 'everyone', 'nobody', 'somebody']);

const BRIT = {
  colour: 'color', colours: 'colors', favourite: 'favorite', favourites: 'favorites', honour: 'honor', labour: 'labor',
  neighbour: 'neighbor', neighbours: 'neighbors', behaviour: 'behavior', humour: 'humor', flavour: 'flavor', rumour: 'rumor',
  centre: 'center', centres: 'centers', theatre: 'theater', metre: 'meter', litre: 'liter', fibre: 'fiber',
  organise: 'organize', organised: 'organized', organising: 'organizing', organisation: 'organization', organisations: 'organizations',
  realise: 'realize', realised: 'realized', realising: 'realizing', recognise: 'recognize', recognised: 'recognized',
  apologise: 'apologize', apologised: 'apologized', criticise: 'criticize', emphasise: 'emphasize', prioritise: 'prioritize',
  analyse: 'analyze', analysed: 'analyzed', defence: 'defense', licence: 'license', offence: 'offense', practise: 'practice',
  travelled: 'traveled', travelling: 'traveling', cancelled: 'canceled', cancelling: 'canceling', modelling: 'modeling',
  grey: 'gray', programme: 'program', programmes: 'programs', catalogue: 'catalog', dialogue: 'dialog', cheque: 'check',
  jewellery: 'jewelry', mum: 'mom', aeroplane: 'airplane', tyre: 'tire', storey: 'story', learnt: 'learned', dreamt: 'dreamed', spelt: 'spelled',
  towards: 'toward', afterwards: 'afterward', amongst: 'among', whilst: 'while',
};

export const INTERCALARI = new Set(['uh', 'um', 'uhm', 'umm', 'er', 'erm', 'ah', 'hmm', 'hm', 'mm', 'mmm', 'eh']);

const UNITA = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve',
  'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const DECINE = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
const ORDINALI = { one: 'first', two: 'second', three: 'third', five: 'fifth', eight: 'eighth', nine: 'ninth', twelve: 'twelfth' };

function sotto100(n) {
  if (n < 20) return [UNITA[n]];
  const d = DECINE[Math.floor(n / 10)];
  return n % 10 ? [d, UNITA[n % 10]] : [d];
}
function sotto1000(n) {
  const out = [];
  if (n >= 100) { out.push(UNITA[Math.floor(n / 100)], 'hundred'); n %= 100; }
  if (n) out.push(...sotto100(n));
  return out;
}
export function numeroInParole(n) {
  if (n === 0) return ['zero'];
  // anni letti all'inglese: 1995 -> nineteen ninety five
  if (n >= 1100 && n < 2000 && n % 100 !== 0) return [...sotto100(Math.floor(n / 100)), ...sotto100(n % 100)];
  if (n >= 2010 && n < 2100) return [...sotto100(Math.floor(n / 100)), ...sotto100(n % 100)];
  const out = [];
  const scale = [[1e9, 'billion'], [1e6, 'million'], [1e3, 'thousand']];
  for (const [v, nome] of scale) {
    if (n >= v) { out.push(...sotto1000(Math.floor(n / v)), nome); n %= v; }
  }
  if (n) out.push(...sotto1000(n));
  return out;
}

const PAROLE_NUMERO = new Set([...UNITA, ...DECINE.filter(Boolean), 'hundred', 'thousand', 'million', 'billion']);

function numeroDaToken(t) {
  let m = t.match(/^(\d+)(st|nd|rd|th)$/);
  if (m) {
    const p = numeroInParole(parseInt(m[1], 10));
    const ult = p[p.length - 1];
    p[p.length - 1] = ORDINALI[ult] || (ult.endsWith('y') ? ult.slice(0, -1) + 'ieth' : ult + 'th');
    return p;
  }
  m = t.match(/^\$?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d+))?(%)?$/);
  if (!m) return null;
  const intero = parseInt(m[1].replace(/,/g, ''), 10);
  const out = numeroInParole(intero);
  if (m[2]) out.push('point', ...m[2].split('').map(c => UNITA[+c]));
  if (m[3]) out.push('percent');
  if (t.startsWith('$')) out.push('dollars');
  return out;
}

// Pulisce una singola parola come appare nel testo e la trasforma in token canonici.
function canonici(parola, opz) {
  let w = parola.toLowerCase()
    .replace(/[‘’ʼ`´]/g, "'")
    .replace(/[“”"«»]/g, '')
    .replace(/[–—]/g, ' ');
  // trattini: "well-known" = "well known"
  const pezzi = w.split(/[-\s/]+/).filter(Boolean);
  const out = [];
  for (let p of pezzi) {
    const num = numeroDaToken(p.replace(/[.,!?;:)(\]\[]+$/g, '').replace(/^[(\[]+/, ''));
    if (num) { out.push(...num); continue; }
    p = p.replace(/^[^a-z0-9'~]+|[^a-z0-9'.]+$/g, '').replace(/\.+$/, '');
    if (p === 'o.k') p = 'ok';
    p = p.replace(/\./g, '');
    if (!p || p === "'") continue;
    if (p.startsWith("'") && !CONTRAZIONI[p]) p = p.slice(1);
    if (p.endsWith("'") && !p.endsWith("in'")) p = p.slice(0, -1);
    if (p.endsWith("in'")) p = p.slice(0, -1) + 'g'; // goin' -> going
    if (CONTRAZIONI[p]) { out.push(...CONTRAZIONI[p]); continue; }
    let m = p.match(/^(.+)n't$/);
    if (m) {
      const base = { ca: 'can', wo: 'will', sha: 'shall' }[m[1]] || m[1];
      out.push(base, 'not'); continue;
    }
    m = p.match(/^(.+)'s$/);
    if (m && CON_S.has(m[1])) { out.push(m[1], '~s'); continue; }
    m = p.match(/^(.+)'d$/);
    if (m) { out.push(m[1], '~d'); continue; }
    m = p.match(/^(.+)'(re|ve|ll)$/);
    if (m) { out.push(m[1], { re: 'are', ve: 'have', ll: 'will' }[m[2]]); continue; }
    if (BRIT[p]) p = BRIT[p];
    if (opz.ignoraIntercalari && INTERCALARI.has(p)) continue;
    out.push(p);
  }
  // "one hundred and twenty" = "one hundred twenty"
  return out.filter((t, i) => !(t === 'and' && PAROLE_NUMERO.has(out[i - 1]) && PAROLE_NUMERO.has(out[i + 1])));
}

// Parole visibili della frase (per mostrarle a schermo), senza i rumori fra parentesi.
export function paroleVisibili(testo) {
  return pulisciRumori(testo).split(/\s+/).filter(Boolean);
}

export function pulisciRumori(testo) {
  return String(testo || '')
    .replace(/\[[^\]]*\]|\([^)]*\)|♪+|♫+/g, ' ')
    .replace(/^\s*[-–—]\s*/, '')
    .replace(/\s+[-–—]\s+(?=[A-Z])/g, ' ')
    .replace(/>>\s*/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function tokenizza(testo, opz = {}) {
  const o = { ignoraIntercalari: true, ...opz };
  const parole = paroleVisibili(testo);
  const token = [];
  const daParola = []; // per ogni token, indice della parola originale
  parole.forEach((p, i) => {
    for (const t of canonici(p, o)) { token.push(t); daParola.push(i); }
  });
  return { parole, token, daParola };
}

export function normalizza(testo, opz) {
  return tokenizza(testo, opz).token.join(' ');
}

export function uguali(a, b) {
  if (a === b) return true;
  if (JOLLY[a]) return JOLLY[a].includes(b) || a === b;
  if (JOLLY[b]) return JOLLY[b].includes(a);
  return false;
}

function distanza(a, b) {
  if (Math.abs(a.length - b.length) > 2) return 3;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

// Errore di battitura: stessa parola con una lettera fuori posto (solo parole lunghe).
function quasi(a, b) {
  if (JOLLY[a] || JOLLY[b]) return false;
  return a.length > 4 && b.length > 4 && distanza(a, b) === 1;
}

// Allineamento a distanza di edit sui token. Restituisce una lista di operazioni.
export function allinea(target, scritto) {
  const n = target.length, m = scritto.length;
  const costo = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = 0; i <= n; i++) costo[i][0] = i;
  for (let j = 0; j <= m; j++) costo[0][j] = j;
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const sost = uguali(target[i - 1], scritto[j - 1]) ? 0 : quasi(target[i - 1], scritto[j - 1]) ? 0.5 : 1;
      costo[i][j] = Math.min(costo[i - 1][j] + 1, costo[i][j - 1] + 1, costo[i - 1][j - 1] + sost);
    }
  }
  const ops = [];
  let i = n, j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0) {
      const t = target[i - 1], s = scritto[j - 1];
      const sost = uguali(t, s) ? 0 : quasi(t, s) ? 0.5 : 1;
      if (costo[i][j] === costo[i - 1][j - 1] + sost) {
        ops.push({ tipo: sost === 0 ? 'ok' : sost === 0.5 ? 'quasi' : 'sbagliata', t: i - 1, s: j - 1 });
        i--; j--; continue;
      }
    }
    if (i > 0 && costo[i][j] === costo[i - 1][j] + 1) { ops.push({ tipo: 'mancante', t: i - 1 }); i--; continue; }
    ops.push({ tipo: 'extra', s: j - 1 }); j--;
  }
  return ops.reverse();
}

// Confronta la frase giusta con il testo scritto e riporta tutto sulle parole originali.
// "dont", "its", "im" scritti senza apostrofo: se la frase giusta ha proprio quella
// contrazione, è un errore di battitura e non di ascolto.
function rimettiApostrofi(giusta, scritto) {
  const conApostrofo = new Map();
  for (const p of paroleVisibili(giusta)) {
    const w = p.toLowerCase().replace(/[‘’]/g, "'").replace(/^[^a-z']+|[^a-z']+$/g, '');
    if (w.includes("'")) conApostrofo.set(w.replace(/'/g, ''), w);
  }
  if (!conApostrofo.size) return scritto;
  return String(scritto || '').split(/(\s+)/).map(p => {
    const m = p.match(/^([^A-Za-z]*)([A-Za-z]+)([^A-Za-z]*)$/);
    const sost = m && conApostrofo.get(m[2].toLowerCase());
    return sost ? m[1] + sost + m[3] : p;
  }).join('');
}

export function confronta(giusta, scrittoTesto, opz = {}) {
  const G = tokenizza(giusta, opz);
  const S = tokenizza(rimettiApostrofi(giusta, scrittoTesto), opz);
  const ops = allinea(G.token, S.token);
  const statoParola = G.parole.map(() => ({ ok: 0, quasi: 0, errate: 0, mancanti: 0, scritto: [] }));
  let ok = 0, q = 0, extra = 0;
  for (const op of ops) {
    if (op.tipo === 'extra') { extra++; continue; }
    const st = statoParola[G.daParola[op.t]];
    if (op.tipo === 'ok') { ok++; st.ok++; }
    else if (op.tipo === 'quasi') { q++; st.quasi++; st.scritto.push(S.token[op.s]); }
    else if (op.tipo === 'sbagliata') { st.errate++; st.scritto.push(S.token[op.s]); }
    else st.mancanti++;
  }
  const parole = G.parole.map((p, i) => {
    const st = statoParola[i];
    const tot = st.ok + st.quasi + st.errate + st.mancanti;
    let stato = 'ok';
    if (tot === 0) stato = 'ok'; // parola che non produce token (intercalare ignorato)
    else if (st.errate) stato = 'sbagliata';
    else if (st.mancanti === tot) stato = 'mancante';
    else if (st.mancanti) stato = 'sbagliata';
    else if (st.quasi) stato = 'quasi';
    return { parola: p, stato, scritto: st.scritto.join(' ') };
  });
  const totale = G.token.length + extra;
  const accuratezza = totale ? (ok + 0.5 * q) / totale : (S.token.length ? 0 : 1);
  return { parole, accuratezza, extra, perfetta: ok === G.token.length && extra === 0 };
}

// ---- Aiuto a gradini ----

export function maschera(parola, livello, rivelata) {
  if (rivelata) return parola;
  const m = parola.match(/^([^A-Za-z0-9]*)(.*?)([^A-Za-z0-9']*)$/);
  const [, pre, corpo, post] = m || ['', '', parola, ''];
  if (!corpo) return parola;
  const lettere = corpo.replace(/[A-Za-z0-9]/g, '_');
  if (livello >= 2) return pre + corpo[0] + lettere.slice(1) + post;
  return pre + lettere + post;
}

// ---- Categorie degli errori, per "Cosa ti sfugge" ----

const FUNZIONALI = new Set(('a an the to of in on at for with from by about as into onto over under up down out off ' +
  'and or but so if than then that this these those there here it its is are was were be been being am do does did ' +
  'have has had will would can could should shall may might must i you he she we they me him her us them my your his ' +
  'our their not no just what who which when where how why all some any').split(' '));

export function categoriaErrore(parolaGiusta, scritto) {
  const g = parolaGiusta.toLowerCase().replace(/[^a-z']/g, '');
  const s = (scritto || '').toLowerCase();
  if (/'/.test(g) || CONTRAZIONI[g]) return 'contrazioni';
  if (s && (g === s + 'ed' || g === s + 'd' || s === g + 'ed' || s === g + 'd')) return 'desinenze -ed';
  if (s && (g === s + 's' || s === g + 's' || g === s + 'es' || s === g + 'es')) return 'desinenze -s';
  if (FUNZIONALI.has(g)) return 'parole brevi (a, the, to…)';
  return 'parole piene';
}

export function errori(confronto) {
  return confronto.parole
    .filter(p => p.stato === 'sbagliata' || p.stato === 'mancante')
    .map(p => ({ parola: p.parola.replace(/^[^A-Za-z0-9']+|[^A-Za-z0-9']+$/g, ''), scritto: p.scritto, categoria: categoriaErrore(p.parola, p.scritto) }))
    .filter(e => e.parola);
}

// ---- Scelta dei buchi ----

const COMUNI = new Set(('the be to of and a in that have i it for not on with he as you do at this but his by from they we say her she or an will my one all would there their what so up out if about who get which go me when make can like time no just him know take people into year your good some could them see other than then now look only come its over think also back after use two how our work first well way even new want because any these give day most us is was are were been has had did said got going really thing things yeah okay oh hey right very much more why where here something nothing everything been being doing let thank thanks need tell feel little lot sure maybe never always still too off down mean put keep start must should might around again great man guy guys god please sorry yes').split(' '));

export function scegliBuchi(testo, espressioniSegmento = []) {
  const parole = paroleVisibili(testo);
  const pulita = p => p.toLowerCase().replace(/^[^a-z0-9']+|[^a-z0-9']+$/g, '');
  const buchi = new Set();
  // 1. espressioni del glossario (fino a 3 parole)
  for (const e of espressioniSegmento) {
    const ep = e.split(/\s+/).map(pulita);
    if (ep.length > 3) continue;
    for (let i = 0; i + ep.length <= parole.length; i++) {
      if (ep.every((w, k) => pulita(parole[i + k]) === w)) { ep.forEach((_, k) => buchi.add(i + k)); break; }
    }
    if (buchi.size) break;
  }
  // 2. altrimenti le parole meno comuni, le più lunghe prima
  if (!buchi.size) {
    const max = parole.length > 12 ? 3 : parole.length > 5 ? 2 : 1;
    parole.map((p, i) => ({ p: pulita(p), i }))
      .filter(x => x.p.length > 2 && !COMUNI.has(x.p) && !/^\d/.test(x.p))
      .sort((a, b) => b.p.length - a.p.length)
      .slice(0, max)
      .forEach(x => buchi.add(x.i));
  }
  if (!buchi.size && parole.length) {
    const i = parole.reduce((best, p, k) => (pulita(p).length > pulita(parole[best]).length ? k : best), 0);
    buchi.add(i);
  }
  return { parole, buchi: [...buchi].sort((a, b) => a - b) };
}

export function stessaParola(giusta, scritta, opz) {
  return confronta(giusta, scritta, opz).perfetta;
}
