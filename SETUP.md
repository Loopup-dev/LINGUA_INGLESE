# Setup, passo per passo

Servono circa 30 minuti, una volta sola. Alla fine l'app sarà online su un indirizzo tuo, con i dati sincronizzati fra PC e telefono.

Prima del setup l'app funziona già in **modalità prova**: apri `index.html` con un piccolo server locale e i dati restano nel browser, senza Gemini.

Una regola vale per tutti i passi: **le chiavi segrete non vanno mai in chat, nei file del progetto o su GitHub.** Le incolli solo nei campi indicati qui sotto.

---

## 1. Crea il progetto Supabase

1. Vai su [supabase.com/dashboard](https://supabase.com/dashboard) (hai già l'account).
2. Se ti chiede di creare un'organizzazione, creala: nome a piacere, piano **Free**.
3. **New project**:
   - nome `ascolta-e-scrivi`;
   - regione **Central EU (Frankfurt)**, la più vicina;
   - una password per il database. Generala e salvala nel tuo gestore di password: all'app non serve, ma non si recupera.
4. Aspetta un paio di minuti che il progetto sia pronto.
5. Apri **Project Settings → API Keys** (oppure **Data API**) e copia due valori:
   - **Project URL** (tipo `https://abcdefgh.supabase.co`);
   - la chiave **anon / public**, o **publishable** nelle versioni nuove della dashboard.

   Questa chiave è pubblica per costruzione: a proteggere i dati sono il login e le regole del database. La chiave **service_role / secret** invece non deve finire da nessuna parte.
6. Apri `js/config.js` e incolla i due valori fra le virgolette:
   ```js
   export const SUPABASE_URL = 'https://abcdefgh.supabase.co';
   export const SUPABASE_ANON_KEY = 'eyJ...';
   ```

## 2. Crea le tabelle

1. Nella dashboard: **SQL Editor → New query**.
2. Apri `supabase/schema.sql`, copia tutto, incollalo e premi **Run**. Deve comparire "Success. No rows returned".

Lo schema crea le tabelle e attiva le regole RLS: ogni riga è legata al tuo utente, e nessun altro può leggerla o modificarla.

## 3. Crea il tuo utente (e chiudi le iscrizioni)

1. **Authentication → Users → Add user → Create new user**: la tua email e una password. Spunta **Auto Confirm User**.
2. **Authentication → Sign In / Providers**: disattiva **Allow new users to sign up**. Così nessun altro può crearsi un account sulla tua app.

## 4. Pubblica la funzione Gemini

1. **Edge Functions → Secrets → Add new secret**:
   - Name: `GEMINI_API_KEY`
   - Value: la tua chiave di Google AI Studio (la trovi in [aistudio.google.com/apikey](https://aistudio.google.com/apikey)).
2. **Edge Functions → Deploy a new function → Via Editor**:
   - nome della funzione: **`gemini`** (esattamente così);
   - cancella il codice d'esempio, incolla tutto il contenuto di `supabase/functions/gemini/index.ts` e premi **Deploy**.
3. Facoltativo: i modelli si cambiano senza toccare il codice, con altri due secret.
   - `GEMINI_MODELLI` (predefinito `gemini-3.5-flash,gemini-3.5-flash-lite`): usato per glossario, trascrizioni e punteggiatura.
   - `GEMINI_MODELLI_RAPIDI` (predefinito `gemini-3.5-flash-lite,gemini-3.5-flash`): usato per le spiegazioni al clic.

   Se il primo modello è sovraccarico si passa al successivo. Al 27/10/2026 la tua chiave vede questi modelli; i 2.5 non sono più disponibili per gli account nuovi.

## 5. Metti l'app online con GitHub Pages

1. Su GitHub crea un repository nuovo, per esempio `ascolta-e-scrivi`. Deve essere **Public**: con l'account gratuito GitHub Pages funziona solo sui repository pubblici. Nel codice non c'è niente di segreto.
2. Carica i file della cartella. Hai due strade:
   - **dal sito**: *Add file → Upload files*, trascina dentro tutto il contenuto della cartella `app-inglese` (non la cartella stessa) e conferma;
   - **da qui**: chiedimelo e lo faccio io con git.
3. Nel repository: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
4. Dopo un minuto l'app è su `https://<tuo-utente>.github.io/ascolta-e-scrivi/`. A ogni modifica caricata su `main` si aggiorna da sola.
5. Apri l'indirizzo, entra con email e password del passo 3. Da **Impostazioni** controlla che in fondo compaia "Accesso come …".

## 6. Installa l'app sul telefono

1. Apri l'indirizzo con **Chrome** su Android.
2. Menu **⋮ → Aggiungi a schermata Home** (o **Installa app**).
3. Entra con le stesse credenziali: carte e progressi sono gli stessi del PC.

## 7. L'importatore sul PC

YouTube blocca spesso le richieste di sottotitoli che partono dai server, non quelle da casa. Per questo sul PC c'è un piccolo programma che li prende dalla tua connessione.

1. Doppio clic su **`avvia-importatore.bat`**. La prima volta installa da solo la libreria necessaria.
   - Se dice che manca Python: scaricalo da [python.org/downloads](https://www.python.org/downloads/) e, durante l'installazione, **spunta "Add python.exe to PATH"**.
2. Lascia aperta la finestra nera mentre importi i video. Puoi chiuderla quando hai finito: per studiare e ripassare non serve.
3. La prima volta Chrome può chiedere se il sito può **accedere ai dispositivi della rete locale**: rispondi **Consenti**. È l'app che parla con l'importatore sul tuo PC.

Se l'importatore non è acceso (o sei sul telefono), l'app propone due alternative:
- **Gemini**, che trascrive dal link: tempi un po' meno precisi, che correggi con «Regola i tempi»;
- un **file SRT/VTT** da caricare.

Se fai molti import di fila, YouTube può bloccare la tua connessione per qualche ora. L'app te lo dice, e nel frattempo puoi usare Gemini.

---

## Da sapere

- **Pausa di Supabase.** Con le regole attuali, i progetti gratuiti vanno in pausa dopo **7 giorni senza attività**. Se usi l'app almeno una volta a settimana non succede. Se succede, l'app non riesce più a entrare: vai nella dashboard di Supabase, apri il progetto e premi **Restore project**. I dati non si perdono.
- **Quota di Gemini.** Il piano gratuito ha un limite di richieste al minuto e al giorno. Le spiegazioni già viste restano salvate e non consumano quota. Quando la quota finisce l'app lo dice e si continua a studiare senza spiegazioni nuove.
- **Copia dei dati.** In **Impostazioni → Scarica una copia dei dati** ottieni un file JSON con tutto. Ogni tanto conviene farlo.
