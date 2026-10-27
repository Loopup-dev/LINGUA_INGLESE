import { html, useState } from '../lib.js';
import { dati, modalitaProva } from '../dati.js';
import { voceSupportata } from '../voce.js';
import { PREDEFINITE } from '../impostazioni.js';
import { useApp } from './comuni.js';

function Numero({ etichetta, valore, onCambia, min, max, passo = 1, unita = '' }) {
  return html`<label class="campo-imp"><span>${etichetta}</span>
    <span><input type="number" min=${min} max=${max} step=${passo} value=${valore}
      onChange=${e => { const v = parseFloat(e.target.value); if (!isNaN(v)) onCambia(Math.min(max, Math.max(min, v))); }} /> ${unita}</span>
  </label>`;
}

function Interruttore({ etichetta, valore, onCambia, nota }) {
  return html`<label class="campo-imp"><span>${etichetta}${nota && html`<small class="tenue"> ${nota}</small>`}</span>
    <input type="checkbox" role="switch" checked=${valore} onChange=${e => onCambia(e.target.checked)} /></label>`;
}

export function Impostazioni() {
  const { imp, salvaImp, notifica, utente } = useApp();
  const [esportando, setEsportando] = useState(false);
  const soglia = (k, v) => salvaImp({ soglie: { ...imp.soglie, [k]: v } });

  const esporta = async () => {
    setEsportando(true);
    try {
      const d = await dati.esporta();
      const url = URL.createObjectURL(new Blob([JSON.stringify(d, null, 1)], { type: 'application/json' }));
      const a = Object.assign(document.createElement('a'), { href: url, download: `inglese-backup-${new Date().toISOString().slice(0, 10)}.json` });
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) { notifica(e.message); }
    setEsportando(false);
  };

  return html`<section class="impostazioni">
    <h1>Impostazioni</h1>

    <h2>Spiegazioni</h2>
    <label class="campo-imp"><span>Lingua delle spiegazioni</span>
      <select value=${imp.linguaSpiegazioni} onChange=${e => salvaImp({ linguaSpiegazioni: e.target.value })}>
        <option value="it">Italiano</option><option value="en">Inglese</option>
      </select></label>

    <h2>Ascolto</h2>
    <${Numero} etichetta="Margine prima della frase" valore=${imp.margineInizio} min=${0} max=${1} passo=${0.05} unita="s" onCambia=${v => salvaImp({ margineInizio: v })} />
    <${Numero} etichetta="Margine dopo la frase" valore=${imp.margineFine} min=${0} max=${1.5} passo=${0.05} unita="s" onCambia=${v => salvaImp({ margineFine: v })} />
    <label class="campo-imp"><span>Velocità del tasto «Lento»</span>
      <select value=${String(imp.velocitaLenta)} onChange=${e => salvaImp({ velocitaLenta: parseFloat(e.target.value) })}>
        ${['0.5', '0.75'].map(v => html`<option value=${v}>${v.replace('.', ',')}x</option>`)}
      </select></label>
    <${Interruttore} etichetta="Ignora gli intercalari (uh, um)" valore=${imp.ignoraIntercalari} onCambia=${v => salvaImp({ ignoraIntercalari: v })} />

    <h2>Shadowing</h2>
    ${voceSupportata
      ? html`<${Interruttore} etichetta="Mostra il tasto microfono" valore=${imp.shadowing} onCambia=${v => salvaImp({ shadowing: v })} />
        <label class="campo-imp"><span>Accento del riconoscimento</span>
          <select value=${imp.linguaVoce} onChange=${e => salvaImp({ linguaVoce: e.target.value })}>
            <option value="en-US">Americano</option><option value="en-GB">Britannico</option>
          </select></label>`
      : html`<p class="tenue">Questo browser non ha il riconoscimento vocale: usa Chrome o Edge.</p>`}

    <h2>Ripasso</h2>
    <${Numero} etichetta="Retention desiderata" valore=${imp.retention} min=${0.7} max=${0.97} passo=${0.01} onCambia=${v => salvaImp({ retention: v })} />
    <p class="tenue piccolo">0,90 vuol dire: ti ripropongo una carta quando la probabilità di ricordarla scende al 90%. Più alta = ripassi più frequenti.</p>
    <${Numero} etichetta="Sessione breve: carte massime" valore=${imp.breveCarte} min=${5} max=${100} onCambia=${v => salvaImp({ breveCarte: Math.round(v) })} />
    <${Numero} etichetta="Sessione breve: minuti massimi" valore=${imp.breveMinuti} min=${3} max=${60} unita="min" onCambia=${v => salvaImp({ breveMinuti: Math.round(v) })} />

    <h3>Quando una frase finisce da sola nel ripasso</h3>
    <${Interruttore} etichetta="Errori al primo tentativo" valore=${imp.soglie.primoSotto100} onCambia=${v => soglia('primoSotto100', v)} />
    <${Numero} etichetta="Aiuto usato fino al gradino" valore=${imp.soglie.aiutoDa} min=${1} max=${5} onCambia=${v => soglia('aiutoDa', Math.round(v))} />
    <${Numero} etichetta="Riascolti, da" valore=${imp.soglie.riascoltiDa} min=${1} max=${20} onCambia=${v => soglia('riascoltiDa', Math.round(v))} />
    <${Interruttore} etichetta="Frase rivelata" valore=${imp.soglie.rivelata} onCambia=${v => soglia('rivelata', v)} />

    <h2>Importatore sul PC</h2>
    <label class="campo-imp"><span>Indirizzo</span>
      <input type="url" value=${imp.importatore} onChange=${e => salvaImp({ importatore: e.target.value.trim() || PREDEFINITE.importatore })} /></label>

    <h2>Dati</h2>
    <p class="tenue">${modalitaProva ? 'Modalità prova: i dati sono solo in questo browser.' : `Accesso come ${utente?.email}.`}</p>
    <div class="bottoni">
      <button onClick=${esporta} disabled=${esportando}>${esportando ? 'Preparo il file…' : 'Scarica una copia dei dati'}</button>
      ${!modalitaProva && html`<button onClick=${() => dati.esci()}>Esci</button>`}
    </div>
  </section>`;
}
