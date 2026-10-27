"""Importatore locale: prende i sottotitoli di YouTube dalla connessione di casa.

YouTube blocca spesso le richieste che partono dai server cloud, non quelle da casa.
L'app (anche se è su https://…github.io) chiama questo server su 127.0.0.1.

Uso: doppio clic su avvia-importatore.bat, oppure  python importatore.py
"""

import json
import re
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

try:
    from youtube_transcript_api import YouTubeTranscriptApi
    from youtube_transcript_api import _errors as errori_yt
except ImportError:
    print("Manca la libreria youtube-transcript-api. Avvia avvia-importatore.bat: la installa da solo.")
    sys.exit(1)

PORTA = 8790
VERSIONE = "1"
# Solo l'app su GitHub Pages e le prove in locale possono usare l'importatore.
ORIGINI_AMMESSE = re.compile(r"^(https://[\w-]+\.github\.io|http://(localhost|127\.0\.0\.1)(:\d+)?)$")
LINGUE = ["en", "en-US", "en-GB", "en-CA", "en-AU", "en-IE", "en-IN"]

api = YouTubeTranscriptApi()


def prendi_trascrizione(video_id):
    elenco = api.list(video_id)
    manuali = True
    try:
        t = elenco.find_manually_created_transcript(LINGUE)
    except errori_yt.NoTranscriptFound:
        manuali = False
        t = elenco.find_generated_transcript(LINGUE)
    dati = t.fetch()
    return {
        "videoId": video_id,
        "lingua": t.language_code,
        "manuali": manuali,
        "frammenti": [{"start": round(s.start, 3), "dur": round(s.duration, 3), "text": s.text} for s in dati.snippets],
    }


def spiega_errore(e):
    if isinstance(e, (errori_yt.IpBlocked, errori_yt.RequestBlocked)):
        return 429, "bloccato", ("YouTube ha bloccato per qualche ora le richieste da questa connessione "
                                 "(succede dopo molti import di fila). Usa Gemini per questo video, oppure riprova più tardi.")
    if isinstance(e, errori_yt.NoTranscriptFound):
        return 404, "nessun_sottotitolo", "Questo video non ha sottotitoli in inglese. Prova con Gemini o con un file SRT/VTT."
    if isinstance(e, errori_yt.TranscriptsDisabled):
        return 404, "nessun_sottotitolo", "L'autore ha disattivato i sottotitoli di questo video. Prova con Gemini."
    if isinstance(e, (errori_yt.VideoUnavailable, errori_yt.InvalidVideoId)):
        return 404, "non_disponibile", "Video non disponibile o link sbagliato."
    if isinstance(e, errori_yt.AgeRestricted):
        return 403, "eta", "Video con limite d'età: YouTube non dà i sottotitoli senza accesso."
    return 502, "errore", f"Errore nel prendere i sottotitoli: {type(e).__name__}."


class Gestore(BaseHTTPRequestHandler):
    def _intestazioni_cors(self):
        origine = self.headers.get("Origin", "")
        if ORIGINI_AMMESSE.match(origine):
            self.send_header("Access-Control-Allow-Origin", origine)
            self.send_header("Vary", "Origin")
            self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type")
            # Chrome: accesso da un sito pubblico a un indirizzo locale.
            self.send_header("Access-Control-Allow-Private-Network", "true")

    def _json(self, status, corpo):
        dati = json.dumps(corpo, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self._intestazioni_cors()
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(dati)))
        self.end_headers()
        self.wfile.write(dati)

    def do_OPTIONS(self):
        self.send_response(204)
        self._intestazioni_cors()
        self.end_headers()

    def do_GET(self):
        url = urlparse(self.path)
        if url.path == "/stato":
            return self._json(200, {"ok": True, "versione": VERSIONE})
        if url.path == "/trascrizione":
            vid = (parse_qs(url.query).get("v") or [""])[0]
            if not re.fullmatch(r"[\w-]{11}", vid):
                return self._json(400, {"errore": "id", "messaggio": "ID del video non valido."})
            try:
                risultato = prendi_trascrizione(vid)
                print(f"  ok  {vid}  {len(risultato['frammenti'])} frammenti  "
                      f"({'manuali' if risultato['manuali'] else 'automatici'})")
                return self._json(200, risultato)
            except Exception as e:  # noqa: BLE001 - ogni errore diventa un messaggio leggibile
                status, codice, messaggio = spiega_errore(e)
                print(f"  NO  {vid}  {codice}")
                return self._json(status, {"errore": codice, "messaggio": messaggio})
        return self._json(404, {"errore": "percorso", "messaggio": "Percorso sconosciuto."})

    def log_message(self, *args):
        pass  # il log lo stampa do_GET, in forma leggibile


def main():
    try:
        server = ThreadingHTTPServer(("127.0.0.1", PORTA), Gestore)
    except OSError:
        print(f"La porta {PORTA} è già occupata: l'importatore è forse già aperto in un'altra finestra.")
        input("Premi Invio per chiudere.")
        return
    print(f"Importatore attivo su http://127.0.0.1:{PORTA}")
    print("Lascia aperta questa finestra mentre importi i video. Per chiudere: Ctrl+C o chiudi la finestra.\n")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
