// Supabase Edge Function "gemini": l'unico punto che parla con l'API Gemini.
// La chiave sta nel secret GEMINI_API_KEY e non lascia mai il server.
// Azioni: spiega · glossario · punteggia · trascrivi.

const API = "https://generativelanguage.googleapis.com/v1beta/models/";
// Catena di modelli: se il primo è sovraccarico o esaurito si passa al successivo.
const MODELLI = (Deno.env.get("GEMINI_MODELLI") ?? "gemini-3.5-flash,gemini-3.5-flash-lite")
  .split(",").map((m) => m.trim()).filter(Boolean);
const MODELLI_RAPIDI = (Deno.env.get("GEMINI_MODELLI_RAPIDI") ?? "gemini-3.5-flash-lite,gemini-3.5-flash")
  .split(",").map((m) => m.trim()).filter(Boolean);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function risposta(corpo: unknown, status = 200) {
  return new Response(JSON.stringify(corpo), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

class ErroreGemini extends Error {
  constructor(public tipo: "quota" | "occupato" | "rifiutato" | "formato", messaggio: string, public attesa = 0) {
    super(messaggio);
  }
}

// La chiave anon è pubblica: senza questo controllo chiunque potrebbe consumare la quota.
async function utenteValido(req: Request) {
  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return false;
  // La chiave pubblica arriva dall'app; la variabile d'ambiente è la riserva (nei progetti nuovi può mancare).
  const apikey = req.headers.get("apikey") ?? Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const r = await fetch(`${Deno.env.get("SUPABASE_URL")}/auth/v1/user`, {
    headers: { Authorization: auth, apikey },
  });
  return r.ok;
}

type Parte = Record<string, unknown>;

async function chiama(modelli: string[], parti: Parte[], schema: unknown, extra: Record<string, unknown> = {}) {
  const chiave = Deno.env.get("GEMINI_API_KEY");
  if (!chiave) throw new ErroreGemini("rifiutato", "Manca il secret GEMINI_API_KEY su Supabase.");
  let ultimo: ErroreGemini | null = null;
  for (let giro = 0; giro < 2; giro++) {
    for (const modello of modelli) {
      const r = await fetch(`${API}${modello}:generateContent`, {
        method: "POST",
        headers: { "x-goog-api-key": chiave, "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: parti }],
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: schema,
            thinkingConfig: { thinkingLevel: "low" },
            ...extra,
          },
        }),
      });
      if (r.ok) {
        const d = await r.json();
        const testo = d?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") ?? "";
        try {
          return JSON.parse(testo);
        } catch {
          ultimo = new ErroreGemini("formato", "Risposta di Gemini non leggibile.");
          continue;
        }
      }
      const corpo = await r.text();
      if (r.status === 429) {
        const m = corpo.match(/"retryDelay":\s*"(\d+)/);
        ultimo = new ErroreGemini("quota", "Quota gratuita di Gemini esaurita per ora.", m ? Number(m[1]) : 60);
      } else if (r.status === 503 || r.status === 500 || r.status === 404) {
        ultimo = new ErroreGemini("occupato", "Gemini è sovraccarico in questo momento.");
      } else {
        console.error("Gemini", modello, r.status, corpo.slice(0, 300));
        throw new ErroreGemini("rifiutato", `Gemini ha rifiutato la richiesta (${r.status}).`);
      }
    }
    if (ultimo?.tipo === "quota" && ultimo.attesa > 20) break;
    await new Promise((ok) => setTimeout(ok, 2000));
  }
  throw ultimo ?? new ErroreGemini("occupato", "Gemini non risponde.");
}

const S = (description?: string) => ({ type: "STRING", ...(description ? { description } : {}) });
const N = (description?: string) => ({ type: "NUMBER", ...(description ? { description } : {}) });
const REGISTRO = { type: "STRING", enum: ["slang", "informale", "neutro", "formale"] };

// ---------- Azioni ----------

async function spiega(c: { selezione: string; frase: string; titolo?: string }) {
  const schema = {
    type: "OBJECT",
    properties: {
      espressione: S("L'espressione completa come compare nella frase (può essere più ampia della selezione)"),
      forma_base: S("Forma da dizionario, es. 'be on a break', 'give up'"),
      registro: REGISTRO,
      it: { type: "OBJECT", properties: { significato: S(), nota: S("Facoltativa: sfumature, falsi amici, quando usarla") }, required: ["significato"] },
      en: { type: "OBJECT", properties: { significato: S(), nota: S() }, required: ["significato"] },
      esempi: { type: "ARRAY", items: { type: "OBJECT", properties: { en: S(), it: S() }, required: ["en", "it"] } },
    },
    required: ["espressione", "forma_base", "registro", "it", "en", "esempi"],
  };
  const prompt = `Sei un insegnante di inglese per un italiano di livello B2.
Video: ${c.titolo ?? "sconosciuto"}
Frase: "${c.frase}"
Parola o espressione selezionata: "${c.selezione}"

Spiega cosa significa la selezione IN QUESTA FRASE, non in generale. Se fa parte di un'espressione più ampia (phrasal verb, modo di dire, collocazione), spiega l'espressione intera e riportala in "espressione".
- it.significato: in italiano, breve e chiaro. en.significato: in inglese semplice, stile learner's dictionary.
- registro: slang, informale, neutro o formale.
- esempi: 2 frasi in inglese naturale (diverse da quella del video), ciascuna con traduzione italiana.`;
  return chiama(MODELLI_RAPIDI, [{ text: prompt }], schema);
}

async function glossario(c: { titolo?: string; segmenti: { i: number; testo: string }[] }) {
  const schema = {
    type: "OBJECT",
    properties: {
      livello: { type: "STRING", enum: ["A2", "B1", "B2", "C1", "C2"] },
      espressioni: {
        type: "ARRAY",
        items: {
          type: "OBJECT",
          properties: {
            segmento: N("Indice i del segmento in cui compare"),
            espressione: S("Copiata ESATTAMENTE come compare nel testo del segmento"),
            forma_base: S(),
            it: S("Significato in italiano"),
            en: S("Meaning in simple English"),
            registro: REGISTRO,
            esempio: S("Una frase d'esempio in inglese, diversa da quella del video"),
          },
          required: ["segmento", "espressione", "forma_base", "it", "en", "registro", "esempio"],
        },
      },
    },
    required: ["livello", "espressioni"],
  };
  const quante = Math.max(8, Math.min(40, Math.round(c.segmenti.length / 6)));
  const testo = c.segmenti.map((s) => `[${s.i}] ${s.testo}`).join("\n");
  const prompt = `Sei un insegnante di inglese per un italiano di livello B2 che vuole anche l'inglese professionale.
Ecco la trascrizione di un video ("${c.titolo ?? ""}"), un segmento per riga con il suo indice:

${testo}

1. Stima il livello CEFR necessario per capire il video (velocità, lessico, accento).
2. Scegli circa ${quante} espressioni che valga la pena imparare: modi di dire, phrasal verb, collocazioni, slang ricorrente, frasi utili in contesto professionale. Salta le parole banali e quelle che un B2 conosce già.
"espressione" va copiata esattamente come compare nel segmento indicato (stesse parole, stessa forma), così l'app la ritrova nel testo.`;
  return chiama(MODELLI, [{ text: prompt }], schema);
}

async function punteggia(c: { frammenti: { i: number; testo: string }[] }) {
  const schema = {
    type: "OBJECT",
    properties: {
      frasi: {
        type: "ARRAY",
        items: {
          type: "OBJECT",
          properties: { da: N("Indice del primo frammento"), a: N("Indice dell'ultimo frammento, incluso"), testo: S() },
          required: ["da", "a", "testo"],
        },
      },
    },
    required: ["frasi"],
  };
  const testo = c.frammenti.map((f) => `[${f.i}] ${f.testo}`).join("\n");
  const prompt = `Questi sono sottotitoli inglesi generati automaticamente: frammenti in ordine, senza punteggiatura.
${testo}

Raggruppa frammenti CONSECUTIVI in frasi. Ogni frammento deve finire in una sola frase, nell'ordine, senza buchi né sovrapposizioni.
Per ogni frase riporta l'indice del primo e dell'ultimo frammento e il testo con punteggiatura e maiuscole corrette.
Non cambiare, aggiungere o togliere parole: correggi solo punteggiatura e maiuscole. Frasi lunghe al massimo 25 parole circa: se una frase parlata è più lunga, spezzala dove c'è una pausa naturale.`;
  return chiama(MODELLI, [{ text: prompt }], schema);
}

async function trascrivi(c: { youtubeId: string; da: number; a: number }) {
  if (!/^[\w-]{11}$/.test(c.youtubeId)) throw new ErroreGemini("rifiutato", "ID del video non valido.");
  const schema = {
    type: "OBJECT",
    properties: {
      segmenti: {
        type: "ARRAY",
        items: {
          type: "OBJECT",
          properties: { inizio: N("Secondi dall'inizio del video intero"), fine: N(), testo: S() },
          required: ["inizio", "fine", "testo"],
        },
      },
    },
    required: ["segmenti"],
  };
  const prompt = `Trascrivi parola per parola il parlato inglese di questo spezzone (dal secondo ${c.da} al secondo ${c.a} del video).
Una voce per frase. "inizio" e "fine" sono i secondi dall'inizio del VIDEO INTERO (non dello spezzone), con i decimali.
Includi solo le frasi che iniziano fra il secondo ${c.da} e il secondo ${c.a}. Scrivi quello che viene detto davvero, con punteggiatura corretta.
Ignora musica e rumori; non descrivere le immagini.`;
  const parti = [
    {
      file_data: { file_uri: `https://www.youtube.com/watch?v=${c.youtubeId}` },
      // 8 secondi di contesto prima: una frase a cavallo fra due spezzoni non va persa.
      video_metadata: { start_offset: `${Math.max(0, Math.floor(c.da - 8))}s`, end_offset: `${Math.ceil(c.a + 8)}s` },
    },
    { text: prompt },
  ];
  return chiama(MODELLI, parti, schema, { mediaResolution: "MEDIA_RESOLUTION_LOW" });
}

const AZIONI: Record<string, (c: any) => Promise<unknown>> = { spiega, glossario, punteggia, trascrivi };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return risposta({ errore: "metodo", messaggio: "Usa POST." }, 405);
  if (!(await utenteValido(req))) return risposta({ errore: "accesso", messaggio: "Accesso richiesto." }, 401);
  let corpo: { azione?: string; [k: string]: unknown };
  try {
    corpo = await req.json();
  } catch {
    return risposta({ errore: "formato", messaggio: "Richiesta non valida." }, 400);
  }
  const fn = AZIONI[corpo.azione ?? ""];
  if (!fn) return risposta({ errore: "formato", messaggio: "Azione sconosciuta." }, 400);
  try {
    return risposta(await fn(corpo));
  } catch (e) {
    if (e instanceof ErroreGemini) {
      const status = e.tipo === "quota" ? 429 : e.tipo === "occupato" ? 503 : 502;
      return risposta({ errore: e.tipo, messaggio: e.message, attesa: e.attesa }, status);
    }
    console.error(e);
    return risposta({ errore: "interno", messaggio: "Errore interno della funzione." }, 500);
  }
});
