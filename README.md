# Ascolta e scrivi

App personale per imparare l'inglese col dettato su video YouTube. Il video si ferma a ogni frase e tu scrivi quello che hai sentito. Le frasi sbagliate o salvate tornano nel ripasso a intervalli (FSRS), con l'audio originale.

- **Dettato**, **Buchi** (versione leggera) e **Visione libera** con trascrizione sincronizzata.
- Correzione tollerante: contrazioni, numeri, grafia britannica e americana, intercalari, apostrofi dimenticati.
- Clic su una parola o un'espressione per la spiegazione nel contesto (Gemini), in italiano o in inglese.
- Shadowing col microfono (Chrome/Edge).
- Sessione breve, full immersion, solo materiale nuovo. Statistiche con "Cosa ti sfugge".
- PWA: si installa sul telefono; i dati sono su Supabase e restano sincronizzati.

## Avvio

- **Setup completo** (Supabase, Gemini, GitHub Pages, telefono): vedi [SETUP.md](SETUP.md).
- **Prova in locale, senza account**: con `js/config.js` vuoto l'app parte in modalità prova, con i dati nel browser.
  ```
  python -m http.server 8780 --bind 127.0.0.1
  ```
  poi apri http://127.0.0.1:8780
- **Importatore dei sottotitoli** sul PC: doppio clic su `avvia-importatore.bat`.

## Dove stanno le cose

| Percorso | Cosa |
|---|---|
| `index.html`, `css/`, `icone/`, `manifest.webmanifest`, `sw.js` | Guscio della PWA |
| `js/config.js` | URL e chiave pubblica di Supabase (le uniche da compilare) |
| `js/testo.js` | Normalizzazione, confronto parola per parola, aiuti, categorie d'errore |
| `js/ripasso.js` | Regole delle carte e FSRS (`ts-fsrs`) |
| `js/dati.js` | Strato dati: Supabase oppure localStorage (modalità prova) |
| `js/importa.js` | Import: importatore locale, Gemini, SRT/VTT; divisione in frasi; glossario |
| `js/player.js` | Player YouTube con stop automatico a fine frase |
| `js/ai.js` | Coda delle chiamate alla funzione Gemini |
| `js/ui/` | Schermate: home, catalogo, studio, ripasso, statistiche, impostazioni |
| `catalogo/catalogo.json` | 30 video di partenza, verificati il 27/10/2026 |
| `supabase/schema.sql` | Tabelle e regole RLS |
| `supabase/functions/gemini/` | Edge Function: unico punto che usa la chiave Gemini |
| `importatore/` + `avvia-importatore.bat` | Server Python locale per i sottotitoli |
| `.github/workflows/pages.yml` | Pubblicazione automatica su GitHub Pages |

Niente build: le librerie (Preact+htm, supabase-js, ts-fsrs) arrivano da jsDelivr a versione fissa, elencate in `js/lib.js`.
