import { html, useEffect, useState } from '../lib.js';
import { dati } from '../dati.js';
import { imparata, inScadenza } from '../ripasso.js';
import { useApp, fmtTempo } from './comuni.js';

const giorno = d => new Date(d).toISOString().slice(0, 10);

export function Statistiche() {
  const { notifica } = useApp();
  const [s, setS] = useState(null);

  useEffect(() => {
    (async () => {
      const [tentativi, sessioni, carte] = await Promise.all([dati.tentativi(), dati.sessioni(), dati.carte()]);
      const settimanaFa = Date.now() - 7 * 864e5;
      const secTot = sessioni.reduce((t, x) => t + x.secondi, 0);
      const sec7 = sessioni.filter(x => new Date(x.inizio) >= settimanaFa).reduce((t, x) => t + x.secondi, 0);

      // accuratezza media al primo tentativo, ultimi 14 giorni
      const giorni = [];
      for (let i = 13; i >= 0; i--) giorni.push(giorno(Date.now() - i * 864e5));
      const perGiorno = Object.fromEntries(giorni.map(g => [g, []]));
      for (const t of tentativi) { const g = giorno(t.creato); if (perGiorno[g]) perGiorno[g].push(t.accuratezza); }
      const andamento = giorni.map(g => ({ g, n: perGiorno[g].length, media: perGiorno[g].length ? perGiorno[g].reduce((a, b) => a + b, 0) / perGiorno[g].length : null }));

      // cosa ti sfugge
      const categorie = {}, parole = {};
      for (const t of tentativi) for (const e of t.errori || []) {
        if (e.categoria && e.categoria !== 'buchi') categorie[e.categoria] = (categorie[e.categoria] || 0) + 1;
        const p = (e.parola || '').toLowerCase();
        if (p) parole[p] = (parole[p] || 0) + 1;
      }
      const attive = carte.filter(c => !c.sospesa);
      setS({
        secTot, sec7, frasi: tentativi.filter(t => t.modalita !== 'ripasso').length, andamento,
        categorie: Object.entries(categorie).sort((a, b) => b[1] - a[1]),
        parole: Object.entries(parole).sort((a, b) => b[1] - a[1]).slice(0, 20),
        carte: attive.length, imparate: attive.filter(imparata).length, scadenza: inScadenza(attive).length,
      });
    })().catch(e => notifica(e.message));
  }, []);

  if (!s) return html`<p class="tenue centro">Calcolo…</p>`;
  const maxCat = Math.max(1, ...s.categorie.map(c => c[1]));
  return html`<section class="statistiche">
    <h1>Statistiche</h1>
    <div class="numeri">
      <div><strong>${fmtTempo(s.secTot)}</strong><span>di studio in tutto</span></div>
      <div><strong>${fmtTempo(s.sec7)}</strong><span>negli ultimi 7 giorni</span></div>
      <div><strong>${s.frasi}</strong><span>frasi fatte</span></div>
      <div><strong>${s.imparate} / ${s.carte}</strong><span>carte imparate</span></div>
    </div>

    <h2>Accuratezza al primo tentativo</h2>
    <div class="grafico" role="img" aria-label="Accuratezza media per giorno negli ultimi 14 giorni">
      ${s.andamento.map(d => html`<div class="colonna" title=${`${d.g}: ${d.media == null ? 'nessuna frase' : Math.round(d.media * 100) + '% su ' + d.n + ' frasi'}`}>
        <div class="barra-v" style=${`height:${d.media == null ? 0 : Math.max(4, d.media * 100)}%`}></div>
        <span>${d.g.slice(8)}</span>
      </div>`)}
    </div>
    <p class="tenue piccolo">Ultimi 14 giorni. Passa sopra una colonna per il dettaglio.</p>

    <h2>Cosa ti sfugge</h2>
    ${!s.categorie.length
      ? html`<p class="tenue">Ancora nessun errore registrato: fai qualche dettato.</p>`
      : html`<ul class="categorie">${s.categorie.map(([c, n]) => html`<li><span>${c}</span><div class="barra-o"><div style=${`width:${(n / maxCat) * 100}%`}></div></div><span>${n}</span></li>`)}</ul>
        <p class="tenue piccolo">Le parole brevi (a, the, to, of) sono quelle che si perdono di più nel parlato veloce: se dominano, è normale e migliora con l'ascolto.</p>
        <h3>Le parole che manchi più spesso</h3>
        <p class="parole-frequenti" lang="en">${s.parole.map(([p, n]) => html`<span>${p} <small>${n}</small></span>`)}</p>`}
  </section>`;
}
