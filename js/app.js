import { html, render, useEffect, useRef, useState } from './lib.js';
import { dati, modalitaProva } from './dati.js';
import { unisci } from './impostazioni.js';
import { Ctx } from './ui/comuni.js';
import { Home } from './ui/home.js';
import { Catalogo } from './ui/catalogo.js';
import { Studio } from './ui/studio.js';
import { Ripassa } from './ui/ripassa.js';
import { Statistiche } from './ui/statistiche.js';
import { Impostazioni } from './ui/impostazioni.js';

const VOCI = [['#/', 'Home'], ['#/catalogo', 'Video'], ['#/ripasso/breve', 'Ripasso'], ['#/statistiche', 'Statistiche'], ['#/impostazioni', 'Impostazioni']];

function leggiRotta() {
  const h = location.hash.replace(/^#\/?/, '');
  const [nome, param] = h.split('/');
  return { nome: nome || 'home', param: param ? decodeURIComponent(param) : null };
}

function Accesso() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errore, setErrore] = useState('');
  const [attesa, setAttesa] = useState(false);
  const entra = async e => {
    e.preventDefault(); setErrore(''); setAttesa(true);
    try { await dati.accedi(email.trim(), password); } catch (err) { setErrore(err.message); }
    setAttesa(false);
  };
  return html`<main class="accesso">
    <h1>Ascolta e scrivi</h1>
    <p class="tenue">Inglese col dettato, su video YouTube.</p>
    <form onSubmit=${entra}>
      <label>Email<input type="email" autocomplete="username" value=${email} onInput=${e => setEmail(e.target.value)} required /></label>
      <label>Password<input type="password" autocomplete="current-password" value=${password} onInput=${e => setPassword(e.target.value)} required /></label>
      ${errore && html`<p class="avviso">${errore}</p>`}
      <button class="primario" type="submit" disabled=${attesa}>${attesa ? 'Entro…' : 'Entra'}</button>
    </form>
  </main>`;
}

function App() {
  const [utente, setUtente] = useState(undefined);
  const [imp, setImp] = useState(null);
  const [rotta, setRotta] = useState(leggiRotta());
  const [avvisi, setAvvisi] = useState([]);
  const [online, setOnline] = useState(navigator.onLine);
  const salvataggio = useRef(null);

  useEffect(() => {
    const cambia = () => { setRotta(leggiRotta()); window.scrollTo(0, 0); };
    const on = () => setOnline(true), off = () => setOnline(false);
    window.addEventListener('hashchange', cambia);
    window.addEventListener('online', on); window.addEventListener('offline', off);
    dati.utente().then(setUtente).catch(() => setUtente(null));
    const stop = dati.suCambioUtente(u => setUtente(u));
    return () => { stop(); window.removeEventListener('hashchange', cambia); window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  useEffect(() => {
    if (!utente) { setImp(null); return; }
    dati.impostazioni().then(s => setImp(unisci(s))).catch(() => setImp(unisci({})));
  }, [utente?.id]);

  const notifica = msg => {
    const id = Math.random();
    setAvvisi(a => [...a.slice(-2), { id, msg }]);
    setTimeout(() => setAvvisi(a => a.filter(x => x.id !== id)), 4500);
  };

  const salvaImp = patch => {
    setImp(prima => {
      const nuove = { ...prima, ...patch };
      clearTimeout(salvataggio.current);
      salvataggio.current = setTimeout(() => dati.salvaImpostazioni(nuove).catch(e => notifica(e.message)), 400);
      return nuove;
    });
  };

  const vai = h => { location.hash = h.replace(/^#?/, '#'); };

  if (utente === undefined) return html`<p class="tenue centro">Avvio…</p>`;
  if (!utente) return html`<${Accesso} />`;
  if (!imp) return html`<p class="tenue centro">Carico le impostazioni…</p>`;

  let pagina;
  switch (rotta.nome) {
    case 'catalogo': pagina = html`<${Catalogo} />`; break;
    case 'studio': pagina = html`<${Studio} key=${rotta.param} youtubeId=${rotta.param} />`; break;
    case 'ripasso': pagina = html`<${Ripassa} key=${rotta.param} tipo=${rotta.param === 'full' ? 'full' : 'breve'} />`; break;
    case 'statistiche': pagina = html`<${Statistiche} />`; break;
    case 'impostazioni': pagina = html`<${Impostazioni} />`; break;
    default: pagina = html`<${Home} />`;
  }
  const attiva = h => (h === '#/' ? rotta.nome === 'home' : location.hash.startsWith(h.split('/').slice(0, 2).join('/')));

  return html`<${Ctx.Provider} value=${{ imp, salvaImp, notifica, vai, utente }}>
    <header class="testata">
      <a class="marchio" href="#/">Ascolta e scrivi</a>
      <nav class="menu">${VOCI.map(([h, n]) => html`<a href=${h} class=${attiva(h) ? 'attivo' : ''}>${n}</a>`)}</nav>
    </header>
    ${!online && html`<p class="nota fissa">Sei offline: video e spiegazioni tornano quando c'è la connessione.</p>`}
    <main class="contenuto">${pagina}</main>
    <div class="avvisi" aria-live="polite">${avvisi.map(a => html`<div class="avviso-toast">${a.msg}</div>`)}</div>
  <//>`;
}

render(html`<${App} />`, document.getElementById('app'));

if ('serviceWorker' in navigator && (location.protocol === 'https:' || ['127.0.0.1', 'localhost'].includes(location.hostname))) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
if (modalitaProva) document.documentElement.dataset.prova = '1';
